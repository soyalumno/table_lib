// Type definitions for Table class

/**
 * インターフェース定義
 */
type iHeader = string;

interface iHash {
  [key: string]: string;
}

interface iRow {
  head: iHeader[];
  hash: iHash;
  row: number;
}

/**
 * 指定した範囲のテーブルを読み書きするための抽象クラス
 */
declare class Table<THeader extends iHeader, TRow extends iRow, THash extends iHash> {
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

  /** オフセット */
  offset: number;

  /** Hashの主キー */
  primary_key: string;

  /** スプレッドシートID */
  ssId: string;

  /** スプレッドシートオブジェクト */
  get ss(): GoogleAppsScript.Spreadsheet.Spreadsheet;

  /** 見出し */
  head: THeader[];

  /** データオブジェクト */
  records: TRow[];

  /** データ実体 */
  hashes: THash[];

  /** 変換オプション */
  toHashOption?: {
    useFirstColumn: boolean; /** 同名の列がある場合、先頭の列を優先 */
  };

  /** batchGetのレンダリングオプション */
  valueRenderOption: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';

  /**
   * Type Guard
   */
  static isTRow<TRow extends iRow>(value: unknown): value is TRow;

  /**
   * Tableクラスコンストラクタ
   * @param range テーブル範囲文字列
   * @param primary_key 主キーのカラム名文字列
   * @param options オプション
   */
  constructor(
    range: string,
    primary_key?: string,
    options?: {
      ssId?: string;
      noloading?: boolean;
      offset?: number;
    }
  );

  /**
   * ヘッダー行の作成
   * @param head ヘッダー配列
   */
  create(head: THeader[]): void;

  /**
   * 見出し行の変更
   * @param head 新しいヘッダー配列
   */
  migration(head: THeader[]): void;

  /**
   * レンダリングオプションの変更
   * @param option レンダリングオプション
   */
  setValueRenderOption(option: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA'): void;

  /**
   * 見出し名を列名に変換する
   * @param key 見出し
   * @param nth 同名の列がある場合のインデックス
   * @returns 列名（A, B, C...）
   */
  toCol(key: THeader, nth?: number): string;

  /**
   * 列名を見出し名に変換する
   * @param col 列名（A, B, C...）
   * @returns 見出し
   */
  toKey(col: string): THeader;

  /**
   * データが存在する最終行を探す
   * @param key キー名
   * @returns 行番号
   */
  lastRow(key?: string): number;

  /**
   * 条件にマッチする先頭のRecordを返す
   * @param target 検索条件(Hash or Row or 主キー文字列)
   * @returns マッチするレコード
   */
  findRecord(target: THash | TRow | string): TRow | undefined;

  /**
   * 指定したキーと一致する先頭のRecordを返す
   * @param key 見出し
   * @param value 値
   * @returns マッチするレコード
   */
  findByKey(key: THeader, value: string): TRow | undefined;

  /**
   * 指定した範囲のデータをRow形式で取得
   * @returns レコード配列
   */
  getExistRecords(): TRow[];

  /**
   * 指定したデータでテーブルを再作成する
   * @param records レコード配列
   * @param options オプション
   */
  resetTable(
    records: THash[] | TRow[],
    options?: {
      noloading?: boolean;
    }
  ): void;

  /**
   * 指定したデータでシートを上書きする(一致するデータが無ければ末尾に追加)
   *
   * hash に含まれない列は undefined として送信され、Sheets API は該当セルを既存値のまま保持する(上書きされない)。
   * 特定の列だけ更新するには `{列: 値}` の最小ハッシュ + rows(書き込み先の行番号)を渡す。
   * 例: `tbl.updateRecords([{ note: '更新' }], [3])` → 3行目の note 列のみ更新
   * なお値に文字列 'NaN' を渡した場合も undefined に変換され、該当セルは既存値のまま保持される。
   *
   * @param records レコード配列
   * @param rows 行番号配列
   * @param options.postWrite 書き込み後のメモリ更新方式
   *   - 'reload' (デフォルト): getExistRecords() でシート全行を再読込
   *   - 'sync': 書き込んだ内容だけメモリにマージ (APIコール0回、recordMap空時は reload にフォールバック、数式セルの計算結果は反映されない)
   *   - 'skip': 何もしない (メモリは stale のまま)
   * @returns 更新結果
   */
  updateRecords(
    records: THash[] | TRow[],
    rows?: number[],
    options?: {
      postWrite?: 'reload' | 'sync' | 'skip';
    }
  ): {
    dirty_rows: number[];
    dirty_records: TRow[];
  };

  /**
   * recordsの内容をシートに反映
   */
  save(): void;

  /**
   * 指定したデータをテーブルの末尾に追記する
   * @param records レコード配列
   * @param options.noloading true時、書き込み後の再読込を行わない
   */
  appendRecords(
    records: THash[] | TRow[],
    options?: {
      noloading?: boolean;
    }
  ): void;

  /**
   * 指定したレコードを削除
   * @param records レコード配列
   * @param options.noloading true時、書き込み後の再読込を行わない
   */
  deleteRecords(
    records: THash[] | TRow[],
    options?: {
      noloading?: boolean;
    }
  ): void;

  /**
   * 指定した行のレコードを削除
   * @param rows 行番号配列
   * @param options.noloading true時、書き込み後の再読込を行わない
   */
  deleteRecordsFromRow(
    rows: number[],
    options?: {
      noloading?: boolean;
    }
  ): void;

  /**
   * 指定した列でデータを並び替え
   * @param column 列名
   * @param ascending 昇順フラグ
   */
  sortRecords(column: THeader, ascending?: boolean): void;

  /**
   * シートのグリッドサイズを変更(縮小は不可)
   * @param rows 行数
   * @param columns 列数
   */
  resize(rows: number, columns: number): void;

  /**
   * アルファベットを列番号に変換
   * @param column_name 列名（A, B, C...）
   * @returns 列番号
   */
  colname2number(column_name: string): number;

  /**
   * 列番号をアルファベットに変換
   * @param num 列番号
   * @returns 列名（A, B, C...）
   */
  numeric2Colname(num: number): string;

  /**
   * 指定された関数を実行し、エラーが発生した場合はリトライする
   * @param callback コールバック関数
   * @param options オプション
   * @returns コールバック関数の戻り値
   */
  retry<T>(
    callback: (...args: never[]) => T,
    options?: {
      maxRetries?: number;
      delay?: number;
      backoffFactor?: number;
      retryableErrors?: (new (...args: never[]) => Error)[];
    }
  ): T;

  /**
   * Range.getValuesのラッパー
   * @param range 範囲
   * @returns 値の二次元配列
   */
  getValues(range: string): CellValue[][];

  /**
   * Range.getValueのラッパー
   * @param range 範囲
   * @returns 単一の値
   */
  getValue(range: string): CellValue;

  /**
   * Range.setValuesのラッパー
   * @param range 範囲
   * @param values 値の二次元配列
   */
  setValues(range: string, values: CellValue[][]): void;

  /**
   * Range.setValueのラッパー
   * @param range 範囲
   * @param value 値
   */
  setValue(range: string, value: CellValue): void;
}

/**
 * テーブルを構築するヘルパー関数
 * @param range テーブル範囲文字列
 * @param primary_key 主キーのカラム名文字列
 * @returns 新しいTableインスタンス
 */
declare function buildTable<THeader extends iHeader, TRow extends iRow, THash extends iHash>(
  range: string,
  primary_key?: string,
  options?: {
    ssId?: string;
    noloading?: boolean;
    offset?: number;
  }
): Table<THeader, TRow, THash>;

declare const table_lib: {
  buildTable: typeof buildTable;
};

