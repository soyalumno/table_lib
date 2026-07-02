import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// dist/src/table.js をグローバルに読み込む（GASと同じスコープモデル）
// strict mode の class 宣言はブロックスコープになるため、明示的に globalThis へ代入する
const tableJs = fs.readFileSync(path.resolve(__dirname, '../dist/src/table.js'), 'utf-8')
const patchedJs = tableJs
  .replace('"use strict";', '')
  .replace(/^class Table/m, '(globalThis as any).Table = class Table')
  .replace(/^function buildTable/m, '(globalThis as any).buildTable = function buildTable')
// TypeScript annotation は eval で動かないため、pure JS にキャストして実行
eval(patchedJs.replace(/\(globalThis as any\)/g, 'globalThis'))

const Table = (globalThis as any).Table as any
const buildTable = (globalThis as any).buildTable as any

// noloading: true でインスタンスを作るヘルパー（API呼び出しなし）
function createTable(range: string, pk = '', opts: Record<string, any> = {}) {
  return new Table(range, pk, { ssId: 'test-id', noloading: true, ...opts })
}

// テスト用にheadとrecordsをセットするヘルパー
function setupTable(range: string, pk: string, heads: string[], data: Record<string, string>[]) {
  const tbl = createTable(range, pk)
  tbl.head = heads
  tbl.primary_key = pk || heads[0]
  // recordMap / records / hashes を手動セット
  tbl.records = data.map((hash, i) => ({
    head: heads,
    hash,
    row: tbl.head_row + 1 + i,
  }))
  tbl.hashes = data
  // recordMapを構築（privateだがテスト用にアクセス）
  ;(tbl as any).recordMap = new Map()
  for (const r of tbl.records) {
    const pkVal = r.hash[tbl.primary_key]
    if (pkVal) (tbl as any).recordMap.set(pkVal, r)
  }
  return tbl
}

// ============================================================
// colname2number / numeric2Colname
// ============================================================
describe('colname2number', () => {
  const tbl = createTable('Sheet1!A1:Z100')

  it('A → 1', () => expect(tbl.colname2number('A')).toBe(1))
  it('Z → 26', () => expect(tbl.colname2number('Z')).toBe(26))
  it('AA → 27', () => expect(tbl.colname2number('AA')).toBe(27))
  it('AZ → 52', () => expect(tbl.colname2number('AZ')).toBe(52))
  it('BA → 53', () => expect(tbl.colname2number('BA')).toBe(53))
  it('ZZ → 702', () => expect(tbl.colname2number('ZZ')).toBe(702))
  it('小文字も変換できる', () => expect(tbl.colname2number('a')).toBe(1))
})

describe('numeric2Colname', () => {
  const tbl = createTable('Sheet1!A1:Z100')

  it('1 → A', () => expect(tbl.numeric2Colname(1)).toBe('A'))
  it('26 → Z', () => expect(tbl.numeric2Colname(26)).toBe('Z'))
  it('27 → AA', () => expect(tbl.numeric2Colname(27)).toBe('AA'))
  it('52 → AZ', () => expect(tbl.numeric2Colname(52)).toBe('AZ'))
  it('53 → BA', () => expect(tbl.numeric2Colname(53)).toBe('BA'))
  it('702 → ZZ', () => expect(tbl.numeric2Colname(702)).toBe('ZZ'))
})

describe('colname2number と numeric2Colname の往復変換', () => {
  const tbl = createTable('Sheet1!A1:Z100')

  for (const col of ['A', 'B', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']) {
    it(`${col} → number → ${col}`, () => {
      expect(tbl.numeric2Colname(tbl.colname2number(col))).toBe(col)
    })
  }
})

// ============================================================
// コンストラクタ range パース
// ============================================================
describe('コンストラクタ range パース', () => {
  it('標準的なrange', () => {
    const tbl = createTable('Sheet1!A1:Z100')
    expect(tbl.sheet).toBe('Sheet1')
    expect(tbl.head_row).toBe(1)
    expect(tbl.tail_row).toBe(100)
    expect(tbl.head_col).toBe('A')
    expect(tbl.tail_col).toBe('Z')
  })

  it('日本語シート名', () => {
    const tbl = createTable('つぶやき!B5:ZZ200')
    expect(tbl.sheet).toBe('つぶやき')
    expect(tbl.head_row).toBe(5)
    expect(tbl.tail_row).toBe(200)
    expect(tbl.head_col).toBe('B')
    expect(tbl.tail_col).toBe('ZZ')
  })

  it('開放範囲（tail_row なし）', () => {
    const tbl = createTable('main!A1:ZZ')
    expect(tbl.head_row).toBe(1)
    expect(tbl.tail_row).toBeNaN()
    expect(tbl.tail_col).toBe('ZZ')
  })

  it('ヘッダー行が5行目', () => {
    const tbl = createTable('main!A5:Z')
    expect(tbl.head_row).toBe(5)
  })

  it('offsetの設定', () => {
    const tbl = createTable('Sheet1!A1:Z100', '', { offset: 4 })
    expect(tbl.offset).toBe(4)
  })

  it('primary_keyの設定', () => {
    const tbl = createTable('Sheet1!A1:Z100', 'ID')
    expect(tbl.primary_key).toBe('ID')
  })

  it('primary_key未指定は空文字', () => {
    const tbl = createTable('Sheet1!A1:Z100')
    expect(tbl.primary_key).toBe('')
  })
})

// ============================================================
// isTRow タイプガード
// ============================================================
describe('isTRow', () => {
  it('row プロパティが number なら true', () => {
    expect(Table.isTRow({ head: [], hash: {}, row: 1 })).toBe(true)
  })

  it('row が undefined なら false', () => {
    expect(Table.isTRow({ head: [], hash: {} })).toBe(false)
  })

  it('row が string なら false', () => {
    expect(Table.isTRow({ head: [], hash: {}, row: '1' })).toBe(false)
  })

  it('Hash オブジェクトなら false', () => {
    expect(Table.isTRow({ ID: '101', foo: 'bar' })).toBe(false)
  })
})

// ============================================================
// toCol / toKey
// ============================================================
describe('toCol', () => {
  it('先頭列Aからの見出し変換', () => {
    const tbl = setupTable('Sheet1!A1:D100', 'ID', ['ID', 'name', 'email', 'age'], [])
    expect(tbl.toCol('ID')).toBe('A')
    expect(tbl.toCol('name')).toBe('B')
    expect(tbl.toCol('email')).toBe('C')
    expect(tbl.toCol('age')).toBe('D')
  })

  it('先頭列がBの場合', () => {
    const tbl = setupTable('Sheet1!B1:E100', 'ID', ['ID', 'name', 'email', 'age'], [])
    expect(tbl.toCol('ID')).toBe('B')
    expect(tbl.toCol('age')).toBe('E')
  })

  it('同名の見出しの nth 指定', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'v1', ['v1', 'dup', 'dup'], [])
    expect(tbl.toCol('dup', 0)).toBe('B')
    expect(tbl.toCol('dup', 1)).toBe('C')
  })

  it('存在しない見出しで例外を投げる (B-5)', () => {
    const tbl = setupTable('Sheet1!A1:D100', 'ID', ['ID', 'name', 'email', 'age'], [])
    expect(() => tbl.toCol('nonexistent')).toThrowError(/toCol:.*nonexistent/)
  })

  it('nth が範囲外で例外を投げる', () => {
    const tbl = setupTable('Sheet1!A1:D100', 'ID', ['ID', 'name', 'email', 'age'], [])
    expect(() => tbl.toCol('ID', 1)).toThrowError(/toCol:/)
  })
})

describe('toKey', () => {
  it('列名から見出し名に変換', () => {
    const tbl = setupTable('Sheet1!A1:D100', 'ID', ['ID', 'name', 'email', 'age'], [])
    expect(tbl.toKey('A')).toBe('ID')
    expect(tbl.toKey('D')).toBe('age')
  })

  it('先頭列がBの場合', () => {
    const tbl = setupTable('Sheet1!B1:E100', 'ID', ['ID', 'name', 'email', 'age'], [])
    expect(tbl.toKey('B')).toBe('ID')
    expect(tbl.toKey('E')).toBe('age')
  })
})

// ============================================================
// toHash (private、getExistRecords経由で間接テスト)
// ============================================================
describe('toHash', () => {
  it('基本的な変換', () => {
    const tbl = createTable('Sheet1!A1:C100', 'ID')
    const toHash = (tbl as any).toHash.bind(tbl)
    const result = toHash([
      ['ID', 'name', 'age'],
      ['1', 'Alice', '30'],
      ['2', 'Bob', '25'],
    ])
    expect(result).toEqual([
      { ID: '1', name: 'Alice', age: '30' },
      { ID: '2', name: 'Bob', age: '25' },
    ])
  })

  it('空セルは空文字に', () => {
    const tbl = createTable('Sheet1!A1:B100', 'ID')
    const toHash = (tbl as any).toHash.bind(tbl)
    const result = toHash([
      ['ID', 'name'],
      ['1', undefined],
      ['2', null],
    ])
    expect(result[0].name).toBe('')
    expect(result[1].name).toBe('')
  })

  it('useFirstColumn: true（デフォルト）— 同名見出しの先頭を優先', () => {
    const tbl = createTable('Sheet1!A1:C100', 'ID')
    const toHash = (tbl as any).toHash.bind(tbl)
    const result = toHash([
      ['ID', 'val', 'val'],
      ['1', 'first', 'second'],
    ], { useFirstColumn: true })
    expect(result[0].val).toBe('first')
  })

  it('useFirstColumn: false — 同名見出しの末尾を優先', () => {
    const tbl = createTable('Sheet1!A1:C100', 'ID')
    const toHash = (tbl as any).toHash.bind(tbl)
    const result = toHash([
      ['ID', 'val', 'val'],
      ['1', 'first', 'second'],
    ], { useFirstColumn: false })
    expect(result[0].val).toBe('second')
  })

  it('見出しの前後空白はトリムされる', () => {
    const tbl = createTable('Sheet1!A1:B100', 'ID')
    const toHash = (tbl as any).toHash.bind(tbl)
    const result = toHash([
      ['  ID  ', ' name '],
      ['1', 'Alice'],
    ])
    expect(result[0]).toHaveProperty('ID', '1')
    expect(result[0]).toHaveProperty('name', 'Alice')
  })
})

// ============================================================
// toValues (private)
// ============================================================
describe('toValues', () => {
  it('Hash → 配列変換', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'age'], [])
    const toValues = (tbl as any).toValues.bind(tbl)
    expect(toValues({ ID: '1', name: 'Alice', age: '30' })).toEqual(['1', 'Alice', '30'])
  })

  it('Row → 配列変換', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'age'], [])
    const toValues = (tbl as any).toValues.bind(tbl)
    const row = { head: ['ID', 'name', 'age'], hash: { ID: '1', name: 'Alice', age: '30' }, row: 2 }
    expect(toValues(row)).toEqual(['1', 'Alice', '30'])
  })

  it('"NaN" 文字列は undefined に変換される', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'val'], [])
    const toValues = (tbl as any).toValues.bind(tbl)
    expect(toValues({ ID: '1', val: 'NaN' })).toEqual(['1', undefined])
  })

  it('head の列順で出力される', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['c', 'b', 'a'], [])
    const toValues = (tbl as any).toValues.bind(tbl)
    expect(toValues({ a: '3', b: '2', c: '1' })).toEqual(['1', '2', '3'])
  })
})

// ============================================================
// migration 同一判定 (B-3)
// ============================================================
describe('migration 同一判定', () => {
  it('完全一致ならAPIを呼ばない', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'age'], [])
    const batchClearSpy = vi.fn()
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchClear = batchClearSpy
    tbl.migration(['ID', 'name', 'age'])
    expect(batchClearSpy).not.toHaveBeenCalled()
  })

  it('先頭部分一致だが列数が少ない場合は実行する (B-3修正)', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'age'], [])
    const batchClearSpy = vi.fn()
    const updateSpy = vi.fn()
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchClear = batchClearSpy
    ;(globalThis as any).Sheets.Spreadsheets.Values.update = updateSpy
    tbl.migration(['ID', 'name'])
    expect(batchClearSpy).toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalled()
  })

  it('先頭部分一致だが列数が多い場合は実行する', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'age'], [])
    const batchClearSpy = vi.fn()
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchClear = batchClearSpy
    tbl.migration(['ID', 'name', 'age', 'extra'])
    expect(batchClearSpy).toHaveBeenCalled()
  })

  it('値が異なる場合は実行する', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'age'], [])
    const batchClearSpy = vi.fn()
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchClear = batchClearSpy
    tbl.migration(['ID', 'name', 'email'])
    expect(batchClearSpy).toHaveBeenCalled()
  })
})

// ============================================================
// findRecord / findByKey / lastRow
// ============================================================
describe('findRecord', () => {
  const data = [
    { ID: '101', name: 'Alice' },
    { ID: '102', name: 'Bob' },
    { ID: '103', name: 'Charlie' },
  ]

  it('Hash で検索', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], data)
    const r = tbl.findRecord({ ID: '102', name: '' })
    expect(r?.hash.name).toBe('Bob')
  })

  it('主キー文字列で検索', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], data)
    const r = tbl.findRecord('103')
    expect(r?.hash.name).toBe('Charlie')
  })

  it('Row で検索', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], data)
    const row = tbl.records[0]
    const r = tbl.findRecord(row)
    expect(r?.hash.ID).toBe('101')
  })

  it('存在しないキーは undefined', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], data)
    expect(tbl.findRecord('999')).toBeUndefined()
  })

  it('recordMap が空なら undefined', () => {
    const tbl = createTable('Sheet1!A1:B100', 'ID')
    expect(tbl.findRecord('any')).toBeUndefined()
  })
})

describe('findByKey', () => {
  it('指定したキーと値で検索', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], [
      { ID: '1', name: 'Alice' },
      { ID: '2', name: 'Bob' },
    ])
    const r = tbl.findByKey('name', 'Bob')
    expect(r?.hash.ID).toBe('2')
  })

  it('見つからなければ undefined', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], [
      { ID: '1', name: 'Alice' },
    ])
    expect(tbl.findByKey('name', 'Unknown')).toBeUndefined()
  })
})

describe('lastRow', () => {
  it('最後のデータ行番号を返す', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], [
      { ID: '1', name: 'Alice' },
      { ID: '2', name: 'Bob' },
      { ID: '', name: 'empty' },
    ])
    expect(tbl.lastRow()).toBe(3) // 最後にPKがある行=row 3 (head_row+1+1)
  })

  it('データなしの場合は head_row を返す', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], [])
    expect(tbl.lastRow()).toBe(1)
  })
})

// ============================================================
// groupBy
// ============================================================
describe('groupBy', () => {
  const data = [
    { ID: '1', group: 'A', val: '10' },
    { ID: '2', group: 'B', val: '20' },
    { ID: '3', group: 'A', val: '30' },
    { ID: '4', group: '', val: '40' },
  ]

  it('コールバック結果でグルーピング', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'group', 'val'], data)
    const result = tbl.groupBy((h: any) => h.group)
    expect(result.get('A')).toHaveLength(2)
    expect(result.get('B')).toHaveLength(1)
  })

  it('空文字列のグループは無視される', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'group', 'val'], data)
    const result = tbl.groupBy((h: any) => h.group)
    expect(result.has('')).toBe(false)
  })

  it('外部 hashes を渡せる', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'group', 'val'], [])
    const result = tbl.groupBy((h: any) => h.group, data)
    expect(result.get('A')).toHaveLength(2)
  })
})

// ============================================================
// retry
// ============================================================
describe('retry', () => {
  it('成功すれば1回で返る', () => {
    const tbl = createTable('Sheet1!A1:Z100')
    const fn = vi.fn(() => 'ok')
    expect(tbl.retry(fn)).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('1回失敗してリトライで成功', () => {
    const tbl = createTable('Sheet1!A1:Z100')
    let call = 0
    const fn = () => {
      call++
      if (call === 1) throw new Error('transient')
      return 'recovered'
    }
    expect(tbl.retry(fn)).toBe('recovered')
  })

  it('maxRetries 回失敗したら例外を投げる', () => {
    const tbl = createTable('Sheet1!A1:Z100')
    const fn = () => { throw new Error('persistent') }
    expect(() => tbl.retry(fn, { maxRetries: 2 })).toThrowError('persistent')
  })

  it('retryableErrors に含まれないエラーは即座に投げる', () => {
    const tbl = createTable('Sheet1!A1:Z100')
    class CustomError extends Error {}
    let callCount = 0
    const fn = () => { callCount++; throw new TypeError('not retryable') }
    expect(() => tbl.retry(fn, { retryableErrors: [CustomError] })).toThrowError('not retryable')
    expect(callCount).toBe(1)
  })
})

// ============================================================
// buildTable ヘルパー
// ============================================================
describe('buildTable', () => {
  it('Table インスタンスを返す', () => {
    const tbl = buildTable('Sheet1!A1:Z100', 'ID', { ssId: 'test', noloading: true })
    expect(tbl).toBeInstanceOf(Table)
    expect(tbl.primary_key).toBe('ID')
  })
})

// ============================================================
// 重複主キー警告 (C-8)
// ============================================================
describe('重複主キー警告', () => {
  it('重複PKで console.warn が呼ばれる', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // batchGet が重複PKを含むデータを返すようモック
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchGet = () => ({
      valueRanges: [{
        values: [
          ['ID', 'name'],
          ['1', 'Alice'],
          ['1', 'Alice-dup'],
        ]
      }]
    })

    const tbl = createTable('Sheet1!A1:B100', 'ID')
    tbl.getExistRecords()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('主キー "1" が重複しています')
    )
    warnSpy.mockRestore()

    // batchGet を元に戻す
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchGet = () => ({ valueRanges: [] })
  })
})

// ============================================================
// applyDirtyRecords ファントムレコード防止 (T2)
// ============================================================
describe('applyDirtyRecords ファントムレコード防止 (T2)', () => {
  it('sync+rows+PKなし最小hashで既存行への部分マージになり、ファントムが増えない', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'ID', ['ID', 'name', 'note'], [
      { ID: '1', name: 'Alice', note: 'orig' },
    ])
    const row = tbl.records[0].row
    const before = tbl.records.length

    tbl.updateRecords([{ note: 'updated' }], [row], { postWrite: 'sync' })

    // ファントムレコードが追加されていない
    expect(tbl.records.length).toBe(before)
    // 既存レコードのハッシュに部分マージされている
    expect(tbl.records[0].hash).toEqual({ ID: '1', name: 'Alice', note: 'updated' })
  })
})

// ============================================================
// toValues 重複見出し (T4: 先頭列のみ書き込み)
// ============================================================
describe('重複見出しへの書き込み (T4)', () => {
  it('updateRecords経由で重複見出しの2列目以降はundefinedで送信される(先頭列のみ書き込み)', () => {
    const tbl = setupTable('Sheet1!A1:C100', 'v1', ['v1', 'dup', 'dup'], [
      { v1: '1', dup: 'orig' },
    ])
    const batchUpdateSpy = vi.fn(() => ({}))
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchUpdate = batchUpdateSpy

    tbl.updateRecords([{ v1: '1', dup: 'updated' }], [tbl.records[0].row], { postWrite: 'skip' })

    const sentValues = batchUpdateSpy.mock.calls[0][0].data[0].values[0]
    expect(sentValues).toEqual(['1', 'updated', undefined])

    // batchUpdate を元に戻す
    ;(globalThis as any).Sheets.Spreadsheets.Values.batchUpdate = () => ({})
  })
})

// ============================================================
// updateRecords rows件数不一致 (T6)
// ============================================================
describe('updateRecords rows件数不一致 (T6)', () => {
  it('rowsとrecordsの件数が不一致なら例外を投げる', () => {
    const tbl = setupTable('Sheet1!A1:B100', 'ID', ['ID', 'name'], [
      { ID: '1', name: 'Alice' },
    ])
    expect(() => tbl.updateRecords(
      [{ ID: '1', name: 'x' }, { ID: '2', name: 'y' }],
      [2],
    )).toThrowError(/updateRecords:.*rows.*1.*records.*2/)
  })
})
