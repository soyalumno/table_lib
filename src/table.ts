/** gas_table_lib v0.15.1 */
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
  offset: number;
  /** Hashの主キー */
  primary_key: string;

  private _ss?: GoogleAppsScript.Spreadsheet.Spreadsheet;
  get ss() {
    if (this._ss)
      return this._ss;
    const ss = SpreadsheetApp.openById(this.ssId);
    this._ss = ss;
    return ss;
  }

  ssId: string;

  /** 見出し */
  head: THeader[] = [];
  /** データオブジェクト */
  records: TRow[] = [];
  /** データ実体 */
  hashes: THash[] = [];

  private recordMap: Map<string, TRow> = new Map();

  /** グリッドサイズのキャッシュ(resizeでのSpreadsheetApp読み取り回数を削減) */
  private _maxRows?: number;
  private _maxCols?: number;

  /** 変換オプション */
  toHashOption?: {
    useFirstColumn: boolean, /** 同名の列がある場合、先頭の列を優先 */
  };

  /** batchGetのレンダリングオプション */
  valueRenderOption: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';

  /** Type Guard */
  static isTRow<TRow extends iRow>(value: unknown): value is TRow {
    return typeof value === 'object' && value !== null
      && 'row' in value && typeof value.row === 'number';
  }

  /**
   * Tableクラスコンストラクタ
   * @param range テーブル範囲文字列
   * @param primary_key 主キーのカラム名文字列
   */
  constructor(range: string, primary_key = '', options: {
    ssId?: string,
    noloading?: boolean,
    offset?: number,
  } = {}) {
    const [sheet, a1note] = range.split('!');
    this.sheet = sheet;
    const head_row = parseInt(a1note.split(':')[0].replace(/[^\d]+/, ''));
    this.head_row = isNaN(head_row) ? 1 : head_row;
    this.tail_row = parseInt(a1note.split(':')[1].replace(/[^\d]+/, '')); // NaNの場合は''で置換すること
    this.head_col = a1note.split(':')[0].replace(/(\d+)/, '');
    this.tail_col = a1note.split(':')[1].replace(/(\d+)/, '');
    this.range = range;
    this.primary_key = primary_key;
    if (options.ssId) {
      this.ssId = options.ssId;
    } else {
      this._ss = SpreadsheetApp.getActive();
      this.ssId = this.ss.getId();
    }
    this.valueRenderOption = 'FORMATTED_VALUE';
    this.toHashOption = { useFirstColumn: true };
    this.offset = options.offset || 0;
    if (options.noloading !== true)
      this.getExistRecords();
  }

  /**
   * ヘッダー行の作成
   */
  create(head: THeader[]) {
    // シートをクリア
    this.retry(() =>
      Sheets.Spreadsheets?.Values?.batchClear(
        { ranges: [`${this.sheet}!${this.head_col}${this.head_row + 1}:${this.tail_col}${this.tail_row || ''}`] },
        this.ssId,
      ));

    // 見出し行を上書き(append はテーブルを自動検出して末尾に追記するため、既存ヘッダー/データの配置で書き込み行がずれる。書き込み先が確定しているので update を使う)
    this.retry(() =>
      Sheets.Spreadsheets?.Values?.update(
        { values: [head] },
        this.ssId,
        `${this.sheet}!${this.head_col}${this.head_row}`,
        { valueInputOption: 'USER_ENTERED' }
      ));
    // プロパティ更新
    this.getExistRecords();
  }

  /** 見出し行の変更 */
  migration(head: THeader[]) {
    // 同じ見出しの場合は何もしない(列数も一致を要求し、先頭部分一致での誤スキップを防ぐ)
    if (head.length === this.head.length && head.every((col, i) => col === this.head[i]))
      return;

    // 見出し行をクリア
    this.retry(() =>
      Sheets.Spreadsheets?.Values?.batchClear(
        { ranges: [`${this.sheet}!${this.head_col}${this.head_row}:${this.tail_col}${this.head_row}`] },
        this.ssId,
      ));
    // 見出し行を上書き(append はテーブルを自動検出して末尾に追記するため、既存ヘッダー/データの配置で書き込み行がずれる。書き込み先が確定しているので update を使う)
    this.retry(() =>
      Sheets.Spreadsheets?.Values?.update(
        { values: [head] },
        this.ssId,
        `${this.sheet}!${this.head_col}${this.head_row}`,
        { valueInputOption: 'USER_ENTERED' }
      ));
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

  /** 見出し名を列名に変換する */
  toCol(key: THeader, nth = 0) {
    const indices = this.head.reduce((acc, v, i) => {
      v === key && acc.push(i);
      return acc;
    }, [] as number[]);
    const index = indices[nth];
    // 見出しが見つからない場合に先頭列を黙って返すと、誤った列への書き込み(データ破損)を招くため例外を投げる
    if (index === undefined)
      throw new Error(`toCol: 見出し "${key}" がテーブル "${this.range}" に見つかりません (nth=${nth})`);
    return this.numeric2Colname(this.colname2number(this.head_col) + index);
  }

  /** 列名を見出し名に変換する */
  toKey(col: string) {
    return this.head[this.colname2number(col) - this.colname2number(this.head_col)];
  }

  /** データが存在する最終行を探す */
  lastRow(key = this.primary_key) {
    const [last_record] = this.records.filter((r) => r.hash[key] !== '').slice(-1);
    return last_record?.row || this.head_row;
  }

  /**
   * 条件にマッチする先頭のRecordを返す
   * @param target 検索条件(Hash or Row)
   */
  findRecord(target: THash | TRow | string) {
    if (this.recordMap.size === 0)
      return;
    return this.recordMap.get(
      Table.isTRow(target) ? target.hash[this.primary_key] :
        typeof target === 'string' ? target
          : target[this.primary_key]
    );
  }

  /** 指定したキーと一致する先頭のRecordを返す */
  findByKey(key: THeader, value: string) {
    return this.records.find(({ hash }) => hash[key] === value);
  }

  /** 指定した範囲のデータをRow形式で取得 */
  getExistRecords(): TRow[] {
    // オフセットがある場合、範囲を調整
    const ranges = this.offset > 0 ?
      [
        `${this.sheet}!${this.head_col}${this.head_row}:${this.tail_col}${this.head_row}`,
        `${this.sheet}!${this.head_col}${this.head_row + 1 + this.offset}:${this.tail_col}${this.tail_row || ''}`,
      ] :
      [this.range];

    // テーブル範囲の２次元配列を取得
    const resp = this.retry(() => Sheets.Spreadsheets?.Values?.batchGet(this.ssId, {
      ranges,
      valueRenderOption: this.valueRenderOption,
    }));
    // レコードのインデックスをクリア
    this.recordMap.clear();
    const valueRanges = resp?.valueRanges || [];
    const df = valueRanges.map((vr) => vr.values || []).flat();
    if (df.length === 0) {
      this.head = [];
      this.records = [];
      this.hashes = [];
      return [];
    }

    // Row形式の配列を生成
    const head = df[0].map((h) => h.toString().trim() as THeader);

    // set first column as primary key if not set
    this.primary_key === '' && (this.primary_key = head?.[0] || 'id');

    const hashes = this.toHash(df);
    const records = hashes.map((hash, i) => {
      const record = this.rowFactory(head, hash, this.head_row + 1 + this.offset + i);
      // primary_keyが存在する場合はMapに登録
      const PK = hash[this.primary_key];
      if (PK) {
        // 重複主キーは後勝ちで上書きされ、findRecordが最後の行を返すため警告する
        if (this.recordMap.has(PK))
          console.warn(`Table: 主キー "${PK}" が重複しています (テーブル: ${this.range})。findRecordは最後の行を返します`);
        this.recordMap.set(PK, record as TRow);
      }
      return record;
    });

    this.head = head;
    this.records = records;
    this.hashes = hashes;
    return records;
  }

  /** 指定したデータでテーブルを再作成する */
  resetTable(records: THash[] | TRow[], options: {
    postWrite?: 'reload' | 'sync' | 'skip',
    /** @deprecated postWrite を使う */
    noloading?: boolean,
  } = {}) {
    const values = records.map((r) => this.toValues(r));
    // シートをクリア
    this.retry(() =>
      Sheets.Spreadsheets?.Values?.batchClear(
        { ranges: [`${this.sheet}!${this.head_col}${this.head_row + 1}:${this.tail_col}${this.tail_row || ''}`] },
        this.ssId,
      ));
    if (values.length > 0) {
      const start_row = this.head_row + 1;
      // 必要に応じてグリッドを拡張(append はテーブルを自動検出して末尾に追記するため、既存ヘッダー/データの配置で書き込み行がずれる。書き込み先が確定しているので update を使う)
      this.resize(start_row + values.length - 1, this.colname2number(this.head_col) + (this.head.length || values[0].length) - 1);
      // シートを上書き
      this.retry(() =>
        Sheets.Spreadsheets?.Values?.update(
          { values },
          this.ssId,
          `${this.sheet}!${this.head_col}${start_row}`,
          { valueInputOption: 'USER_ENTERED' }
        ));
    }
    // プロパティ更新
    const postWrite = options.postWrite || (options.noloading === true ? 'skip' : 'reload');
    if (postWrite === 'sync') {
      this.records = records.map((r, i) => {
        const inputHash = Table.isTRow(r) ? r.hash : r;
        const hash = {} as THash;
        this.head.forEach((key) => {
          const value = inputHash[key];
          (hash as iHash)[key] = value === undefined || value === 'NaN' ? '' : value;
        });
        return this.rowFactory(this.head, hash, this.head_row + 1 + i);
      });
      this.hashes = this.records.map((record) => record.hash as THash);
      this.recordMap.clear();
      this.records.forEach((record) => {
        const pk = record.hash[this.primary_key];
        if (pk) this.recordMap.set(pk, record);
      });
    } else if (postWrite === 'reload') {
      this.getExistRecords();
    }
  }

  /**
   * 指定したデータでシートを上書きする(一致するデータが無ければ末尾に追加)
   * @param options.postWrite 書き込み後のメモリ更新方式
   *   - 'reload' (デフォルト): getExistRecords() でシート全行を再読込
   *   - 'sync': applyDirtyRecords() で書き込んだ内容だけメモリにマージ (APIコール0回)
   *     recordMapが空の場合は 'reload' にフォールバック
   *     数式セルの計算結果は反映されない点に注意
   *   - 'skip': 何もしない (メモリは stale のまま)
   */
  updateRecords(records: THash[] | TRow[], rows?: number[], options: {
    postWrite?: 'reload' | 'sync' | 'skip',
    /** @deprecated postWrite を使う */
    noloading?: boolean,
  } = {}) {
    // rowsの件数がrecordsと不一致だと、対応関係がずれた行に黙って書き込まれデータ誤配置を招くため例外を投げる
    if (rows && rows.length !== records.length)
      throw new Error(`updateRecords: rows の件数(${rows.length})と records の件数(${records.length})が一致しません`);
    // 上書き範囲の配列を生成
    let next_row = this.lastRow() + 1;
    const dirty_rows: number[] = [];
    const data = records.map((r, i) => {
      // 書き込み先の行番号を取得
      const exist = rows ? undefined : this.findRecord(r);
      const row = rows?.[i] || exist?.row || next_row++;

      // 書き込みデータを生成(shallow copy)
      const hash = (() => {
        const hash = Table.isTRow(r) ? r.hash : r;
        return { ...hash };
      })();
      // primary_keyが存在する場合は削除
      if (exist)
        delete hash[this.primary_key];
      const data: GoogleAppsScript.Sheets.Schema.ValueRange = {
        range: `${this.sheet}!${this.head_col}${row}`,
        values: [this.toValues(hash as THash)],
      };
      dirty_rows.push(row);
      return data;
    });

    if (data.length > 0) {
      // 必要に応じてグリッドを拡張(flushとサイズ読み取りはresize内で必要なときだけ実行)
      const max_dirty_row = dirty_rows.reduce((max, row) => Math.max(max, row));
      this.resize(max_dirty_row, this.colname2number(this.head_col) + this.head.length - 1);

      // シートを上書き
      this.retry(() =>
        Sheets.Spreadsheets?.Values?.batchUpdate({
          valueInputOption: 'USER_ENTERED',
          data,
        }, this.ssId));

      // メモリ更新
      const postWrite = options.postWrite || (options.noloading === true ? 'sync' : 'reload');
      if (postWrite === 'sync') {
        if (this.recordMap.size === 0) {
          this.getExistRecords();
        } else {
          this.applyDirtyRecords(records, dirty_rows);
        }
      } else if (postWrite === 'reload') {
        this.getExistRecords();
      }
      // 'skip' → 何もしない
    }
    const dirtyRowSet = new Set(dirty_rows);
    return {
      dirty_rows,
      dirty_records: this.records.filter((r) => dirtyRowSet.has(r.row)),
    };
  }

  /**
   * 書き込み済みデータをメモリ上のレコードにマージする (API再読込なし)
   * - 既存レコード (書き込み行一致): hash を部分マージ
   * - 新規レコード: 全カラムを空文字で初期化した上で hash をマージし、records/hashes/recordMap に追加
   */
  private applyDirtyRecords(
    inputRecords: (THash | TRow)[],
    dirty_rows: number[],
  ) {
    const recordsByRow = new Map(this.records.map((record) => [record.row, record]));
    inputRecords.forEach((r, i) => {
      const inputHash = Table.isTRow(r) ? r.hash : r;
      const row = dirty_rows[i];
      const pk = inputHash[this.primary_key];
      const existing = recordsByRow.get(row);

      if (existing) {
        // UPDATE: 既存レコードのハッシュに部分マージ
        Object.assign(existing.hash, inputHash);
        if (pk) this.recordMap.set(pk, existing as TRow);
      } else {
        // APPEND: 全カラムを空文字で初期化 → 入力値で上書き
        const fullHash = {} as THash;
        this.head.forEach((k) => { (fullHash as iHash)[k] = ''; });
        Object.assign(fullHash, inputHash);
        const newRecord = this.rowFactory(this.head, fullHash, row);
        this.records.push(newRecord as TRow);
        this.hashes.push(fullHash);
        recordsByRow.set(row, newRecord as TRow);
        if (pk) this.recordMap.set(pk, newRecord as TRow);
      }
    });
  }

  /** recordsの内容をシートに反映 */
  save() {
    this.updateRecords(this.records, this.records.map((r) => r.row));
  }

  /** 指定したデータをテーブルの末尾に追記する */
  appendRecords(records: THash[] | TRow[], options: {
    postWrite?: 'reload' | 'sync' | 'skip',
    /** @deprecated postWrite を使う */
    noloading?: boolean,
  } = {}) {
    // 追記用二次元配列を生成
    const values = records.map((r) => this.toValues(r));
    // シートの末尾に追記
    if (values.length > 0) {
      const start_row = this.lastRow() + 1;
      // 必要に応じてグリッドを拡張(append はテーブルを自動検出して末尾に追記するため、既存ヘッダー/データの配置で書き込み行がずれる。書き込み先が確定しているので update を使う)
      this.resize(start_row + values.length - 1, this.colname2number(this.head_col) + this.head.length - 1);
      this.retry(() =>
        Sheets.Spreadsheets?.Values?.update(
          { values },
          this.ssId,
          `${this.sheet}!${this.head_col}${start_row}`,
          { valueInputOption: 'USER_ENTERED' }
        ));
      // プロパティ更新
      const postWrite = options.postWrite || (options.noloading === true ? 'skip' : 'reload');
      if (postWrite === 'sync') {
        const dirty_rows = records.map((_, i) => start_row + i);
        this.applyDirtyRecords(records, dirty_rows);
      } else if (postWrite === 'reload') {
        this.getExistRecords();
      }
    }
  }

  /** 指定したレコードを削除 */
  deleteRecords(records: THash[] | TRow[], options: {
    postWrite?: 'reload' | 'sync' | 'skip',
    /** @deprecated postWrite を使う */
    noloading?: boolean,
  } = {}) {
    const rows = records
      .map((record) => Table.isTRow(record) ? record.row : this.findRecord(record)?.row)
      .filter((row) => row !== undefined) as number[];
    this.deleteRecordsFromRow(rows, options);
  }
  deleteRecordsFromRow(rows: number[], options: {
    postWrite?: 'reload' | 'sync' | 'skip',
    /** @deprecated postWrite を使う */
    noloading?: boolean,
  } = {}) {
    const data = rows.map((row): GoogleAppsScript.Sheets.Schema.ValueRange => ({
      range: `${this.sheet}!${this.head_col}${row}`,
      values: [this.head.map(() => '')],
    }));
    this.retry(() =>
      Sheets.Spreadsheets?.Values?.batchUpdate({
        valueInputOption: 'USER_ENTERED',
        data
      }, this.ssId));
    const postWrite = options.postWrite || (options.noloading === true ? 'skip' : 'reload');
    if (postWrite === 'sync') {
      const deletedRows = new Set(rows);
      this.records = this.records.filter((record) => !deletedRows.has(record.row));
      this.hashes = this.records.map((record) => record.hash as THash);
      this.recordMap.clear();
      this.records.forEach((record) => {
        const pk = record.hash[this.primary_key];
        if (pk) this.recordMap.set(pk, record);
      });
    } else if (postWrite === 'reload') {
      this.getExistRecords();
    }
  }

  /** 指定した列でデータを並び替え */
  sortRecords(column: THeader, ascending = true) {
    const index = this.head.indexOf(column);
    // 見出しが見つからない場合に-1のまま計算すると誤った列でソートされるため例外を投げる(toColと同様のスタイル)
    if (index === -1)
      throw new Error(`sortRecords: 見出し "${column}" がテーブル "${this.range}" に見つかりません`);
    const s = this.ss.getSheetByName(this.sheet);
    const rng = s?.getRange(this.range);
    rng?.getFilter()?.remove();
    rng?.createFilter().sort(index + this.colname2number(this.head_col), ascending);
  }

  /** 指定したコールバック関数でグルーピング */
  groupBy(cb: (hash: THash) => string, hashes?: THash[]) {
    const newMap = new Map<string, THash[]>();
    (hashes || this.hashes).forEach((hash) => {
      const val = cb(hash);
      if (!val) return; // 空文字列は無視
      if (!newMap.has(val)) newMap.set(val, []);
      newMap.get(val)?.push(hash);
    });
    return newMap;
  };

  // シートのグリッドサイズを変更(縮小は不可)
  resize(rows: number, columns: number) {
    // キャッシュ済みサイズで足りる場合はSpreadsheetApp(flush/getMax)へアクセスしない
    if (this._maxRows !== undefined && this._maxCols !== undefined
      && this._maxRows >= rows && this._maxCols >= columns)
      return;
    // グリッドサイズを読む前に保留中の書き込みを反映
    SpreadsheetApp.flush();
    const s = this.ss.getSheetByName(this.sheet);
    if (!s)
      return;
    this._maxRows = s.getMaxRows() || 1;
    this._maxCols = s.getMaxColumns() || 1;
    if (this._maxCols < columns) {
      s.insertColumnsAfter(this._maxCols, columns - this._maxCols);
      this._maxCols = columns;
    }
    if (this._maxRows < rows) {
      s.insertRowsAfter(this._maxRows, rows - this._maxRows);
      this._maxRows = rows;
    }
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

  /** 列番号をアルファベットに変換 */
  numeric2Colname(num: number) {
    /** アルファベット総数 */
    const RADIX = 26;
    /** Aの文字コード */
    const A = 'A'.charCodeAt(0);

    let n = num;
    let s = '';
    while (n >= 1) {
      n--;
      s = String.fromCharCode(A + (n % RADIX)) + s;
      n = Math.floor(n / RADIX);
    }
    return s;
  }

  /**
   * 指定された関数を実行し、エラーが発生した場合はリトライする
   */
  retry<T>(
    callback: (...args: never[]) => T,
    options: {
      maxRetries?: number,
      delay?: number,
      backoffFactor?: number,
      retryableErrors?: (new (...args: never[]) => Error)[]
    } = {},
  ): T {
    const {
      maxRetries = 3,
      delay = 500,
      backoffFactor = 1.5,
      retryableErrors,
    } = options;
    const transientErrorPattern = /rate limit|quota|too many|backend error|internal error|unavailable|timed out|timeout|temporarily|failed while accessing|server error/i;

    for (const i of [...Array(maxRetries).keys()]) {
      try {
        return callback();
      } catch (e) {
        const retryable = retryableErrors
          ? retryableErrors.some((err) => e instanceof err)
          : e instanceof Error && transientErrorPattern.test(e.message);
        if (i === maxRetries - 1 || !retryable)
          throw e;
        Utilities.sleep(delay * Math.pow(backoffFactor, i));
      }
    }
    throw new Error('unreachable');
  }

  /** Range.getValuesのラッパー */
  getValues(range: string): CellValue[][] {
    return this.ss.getRange(`${this.sheet}!${range}`).getValues();
  }
  /** Range.getValueのラッパー */
  getValue(range: string): CellValue {
    return this.ss.getRange(`${this.sheet}!${range}`).getValues().flat()[0];
  }
  /** Range.setValuesのラッパー */
  setValues(range: string, values: CellValue[][]) {
    this.ss.getRange(`${this.sheet}!${range}`).setValues(values);
  }
  /** Range.setValueのラッパー */
  setValue(range: string, value: CellValue) {
    this.ss.getRange(`${this.sheet}!${range}`).setValues([[value]]);
  }

  private rowFactory(head: THeader[], hash: THash, row?: number): TRow {
    const row_object: iRow = {
      head,
      hash,
      row: row || NaN,
    };
    return row_object as TRow;
  }

  private toValues(record: THash | TRow) {
    const hash = Table.isTRow(record) ? record.hash : record;
    // 同名見出しが複数ある場合、読み取り側(toHash)は useFirstColumn=true がデフォルトで先頭列の値を優先する。
    // 書き込み側で全列に同じ値を書くと非対称になり、2列目以降が意図せず上書きされるため、
    // 2回目以降の同名列には undefined を返す(Sheets APIはundefinedのセルを既存値のまま保持する)
    const seen = new Set<THeader>();
    return this.head.map((col) => {
      if (seen.has(col))
        return undefined;
      seen.add(col);
      return hash[col] === 'NaN' ? undefined : hash[col];
    });
  }

  /** 二次元のテーブルデータを見出しをキーとしたオブジェクト配列に変換する */
  private toHash(df: CellValue[][], option?: { useFirstColumn: boolean }): THash[] {
    const useFirstColumn = option?.useFirstColumn ?? this.toHashOption?.useFirstColumn ?? true;
    const [head, ...values_arr] = df;

    return values_arr.map((values) => {
      const hash = {} as THash;
      head.forEach((key, i) => {
        key = key.toString().trim();
        // 同じ見出しが複数ある場合は、オプションをチェック
        if (!(key in hash) || !useFirstColumn)
          (hash as iHash)[key] = values[i]?.toString() || '';
      });
      return hash;
    });
  }
}

function buildTable<
  THeader extends iHeader,
  TRow extends iRow,
  THash extends iHash
>(range: string, primary_key?: string, options: {
  ssId?: string,
  noloading?: boolean,
  offset?: number,
} = {}): Table<THeader, TRow, THash> {
  return new Table<THeader, TRow, THash>(range, primary_key, options);
}
