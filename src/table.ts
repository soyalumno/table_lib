/** 指定した範囲のテーブルを読み書きするための抽象クラス */
class Table<THeader extends iHeader, TRow extends iRow, THash extends iHash> {
  /** 見出し行番号 */
  head_row: number;
  /** 最終行番号 */
  tail_row: number;
  /** 先頭列 */
  head_col: string;
  /** 最終列 */
  tail_col: string;
  /** シート名 */
  sheet: string;
  /** テーブル範囲 */
  range: string;
  /** Hashの主キー */
  primary_key: string;
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet;

  /** 見出し */
  head: THeader[] = [];
  /** データオブジェクト */
  records: TRow[] = [];
  /** データ実体 */
  hashes: THash[] = [];

  /** 変換オプション */
  toRecordsOption?: {
    useFirstColumn: boolean, /** 同名の列がある場合、先頭の列を優先 */
  };

  /** batchGetのレンダリングオプション */
  valueRenderOption: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';

  /** 具象Rowオブジェクトの生成処理 */
  rowFactory: (head: THeader[], hash: THash, row?: number) => TRow;

  /** Type Guard */
  static isTRow<TRow extends iRow>(value: any): value is TRow {
    return (value.row !== undefined && typeof value.row === 'number');
  }

  /**
   * Tableクラスコンストラクタ
   * @param range テーブル範囲文字列
   * @param primary_key 主キーのカラム名文字列
   * @param rowFactory 具象Rowオブジェクト生成用処理
   */
  constructor(range: string, primary_key: string, rowFactory: (head: THeader[], hash: THash, row?: number) => TRow
    = (head, hash, row) => {
      const primary_key = this.primary_key;
      const row_object: iRow = {
        head,
        hash,
        row: row || NaN,
        /** Hashを見出しの順番に従った配列に変換する */
        toValues() {
          return this.head.map((col) => hash[col] === 'NaN' ? undefined : hash[col]);
        },
        /** 指定したHashが一致しているか比較 */
        isEqual(other: THash) {
          return this.hash[primary_key] === other[primary_key];
        }
      }
      return row_object as TRow;
    }) {
    const [sheet, a1note] = range.split('!');
    this.sheet = sheet;
    const head_row = parseInt(a1note.split(':')[0].replace(/[^\d]+/, ''));
    this.head_row = isNaN(head_row) ? 1 : head_row;
    this.tail_row = parseInt(a1note.split(':')[1].replace(/[^\d]+/, '')); // NaNの場合は''で置換すること
    this.head_col = a1note.split(':')[0].replace(/(\d+)/, '');
    this.tail_col = a1note.split(':')[1].replace(/(\d+)/, '');
    this.range = range;
    this.primary_key = primary_key;
    this.rowFactory = rowFactory;
    this.ss = SpreadsheetApp.getActive();
    this.valueRenderOption = 'FORMATTED_VALUE';
    this.toRecordsOption = { useFirstColumn: true };
    this.getExistRecords();
  }

  /**
   * レンダリングオプションの変更
   * FORMATTED_VALUE: セルの表示される形式で値を取得します。数値や日付は文字列として返されますが、数式は評価された値として返されます。
   * UNFORMATTED_VALUE: セルのフォーマットを無視して、値を取得します。数値や日付も数値型として返されます。
   * FORMULA: セルの数式を取得します。数式が存在する場合はそのまま返されます。
   */
  setValueRenderOption(option: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA') {
    this.valueRenderOption = option;
    this.getExistRecords();
  }

  /** 二次元のテーブルデータを見出しをキーとしたオブジェクト配列に変換する */
  toRecords(df: any[][]): THash[] {
    const [head, ...values_arr] = df;
    return values_arr.map((values) =>
      head.reduce((acc, col, i) => {
        // 同じ見出しが複数ある場合は、オプションをチェック
        if (!(acc as iHash)[col.toString()] || !this.toRecordsOption?.useFirstColumn)
          (acc as iHash)[col.toString()] = values[i]?.toString() || '';
        return acc;
      }, {} as THash)
    );
  }

  /** データが存在する最終行を探す */
  lastRow() {
    const [last_record] = this.records.filter((r) => r.hash[this.primary_key] !== '').slice(-1);
    return last_record?.row || this.head_row;
  }

  /**
   * 条件にマッチする先頭のRecordを返す
   * @param target 検索条件(Hash or Row or RowNumber)
   */
  findRecord(target: THash | TRow | number) {
    return this.records.find((r) =>
      Table.isTRow(target) ? r.isEqual(target.hash) : (typeof target === 'number') ?
        r.row === target : r.isEqual(target)
    );
  }

  /** 指定したキーと一致する先頭のRecordを返す */
  findByKey(key: THeader, value: string) {
    return this.records.find(({ hash }) => hash[key] === value);
  }

  /** 指定した範囲のデータをRow形式で取得 */
  getExistRecords() {
    // テーブル範囲の２次元配列を取得
    const resp = Sheets.Spreadsheets?.Values?.batchGet(this.ss.getId(), {
      ranges: [this.range],
      valueRenderOption: this.valueRenderOption,
    });
    const df = resp?.valueRanges?.[0].values || [[]];

    // Row形式の配列を生成
    const [head] = df as THeader[][];
    const records = this.toRecords(df).map((hash, i) =>
      this.rowFactory(head, hash, this.head_row + 1 + i)
    )
    this.head = head;
    this.records = records;
    this.hashes = records.map((r) => r.hash as THash);
    return { head, records };
  }

  /** 指定したデータでテーブルを再作成する */
  resetTable(records: THash[] | TRow[]) {
    const values = records
      .map((r) => Table.isTRow(r) ? r.hash : r)
      .map((hash) => this.rowFactory(this.head, hash as THash).toValues())

    // シートをクリア
    Sheets.Spreadsheets?.Values?.batchClear(
      { ranges: [`${this.sheet}!${this.head_col}${this.head_row + 1}:${this.tail_col}${this.tail_row || ''}`] },
      this.ss.getId()
    );
    if (values.length > 0) {
      // シートを上書き
      Sheets.Spreadsheets?.Values?.append(
        { values },
        this.ss.getId(),
        `${this.sheet}!${this.head_col}${this.head_row + 1}`,
        { valueInputOption: 'USER_ENTERED' }
      );
      // プロパティ更新
      this.getExistRecords();
    }
  }

  /** 指定したデータでシートを上書きする(一致するデータが無ければ上書きしない) */
  updateRecords(records: THash[] | TRow[]) {
    // 上書き範囲の配列を生成
    const data = records.map((r) => Table.isTRow(r) ? (r.hash as THash) : r)
      .reduce((acc, hash) => {
        const record = this.findRecord(hash);
        if (record) {
          acc.push({
            range: `${this.sheet}!${this.head_col}${record.row}`,
            values: [this.rowFactory(this.head, hash, record.row).toValues()],
          });
        }
        return acc;
      }, [] as GoogleAppsScript.Sheets.Schema.ValueRange[])

    if (data.length > 0) {
      // シートを上書き
      Sheets.Spreadsheets?.Values?.batchUpdate({
        valueInputOption: 'USER_ENTERED',
        data,
      }, this.ss.getId());
      // プロパティ更新
      this.getExistRecords();
    }
  }

  /** recordsの内容をシートに反映 */
  save() {
    this.updateRecords(this.records);
  }

  /** 指定したデータをテーブルの末尾に追記する */
  appendRecords(records: THash[] | TRow[]) {
    // 追記用二次元配列を生成
    const values = records
      .map((r) => Table.isTRow(r) ? r.hash : r)
      .map((hash) => this.rowFactory(this.head, hash as THash).toValues())

    // シートの末尾に追記
    if (values.length > 0) {
      Sheets.Spreadsheets?.Values?.append(
        { values },
        this.ss.getId(),
        `${this.sheet}!${this.head_col}${this.lastRow() + 1}`,
        { valueInputOption: 'USER_ENTERED' }
      );
      // プロパティ更新
      this.getExistRecords();
    }
  }

  /** 指定した列でデータを並び替え */
  sortRecords(column: THeader, ascending = true) {
    const s = this.ss.getSheetByName(this.sheet);
    const rng = s?.getRange(this.range);
    rng?.getFilter()?.remove();
    rng?.createFilter().sort(this.head.indexOf(column) + this.colname2number(this.head_col), ascending);
  }

  // シートのグリッドサイズを変更(縮小は不可)
  resize(rows: number, columns: number) {
    const s = this.ss.getSheetByName(this.sheet);
    if (!s)
      return;
    const maxrow = s.getMaxRows() || 1;
    const maxcol = s.getMaxColumns() || 1;
    (maxcol < columns) && (s.insertColumnsAfter(maxcol, columns - maxcol));
    (maxrow < rows) && (s.insertRowsAfter(maxrow, rows - maxrow));
  }

  /** アルファベットを列番号に変換 */
  colname2number(column_name: string) {
    const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const column_number = column_name.toUpperCase().split('').reduce((acc, c) => {
      acc = acc * 26 + base.indexOf(c) + 1;
      return acc;
    }, 0);
    return column_number;
  }
}

function buildTable<THeader extends iHeader, TRow extends iRow, THash extends iHash>(range: string, primary_key: string) {
  return new Table<THeader, TRow, THash>(range, primary_key);
}

