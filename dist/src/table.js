"use strict";
/** 指定した範囲のテーブルを読み書きするための抽象クラス */
class Table {
    get ss() {
        if (this._ss)
            return this._ss;
        const ss = SpreadsheetApp.openById(this.ssId);
        this._ss = ss;
        return ss;
    }
    /** Type Guard */
    static isTRow(value) {
        return (value.row !== undefined && typeof value.row === 'number');
    }
    /**
     * Tableクラスコンストラクタ
     * @param range テーブル範囲文字列
     * @param primary_key 主キーのカラム名文字列
     */
    constructor(range, primary_key = '', options = {}) {
        /** 見出し */
        this.head = [];
        /** データオブジェクト */
        this.records = [];
        /** データ実体 */
        this.hashes = [];
        this.recordMap = new Map();
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
        }
        else {
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
    create(head) {
        // シートをクリア
        this.retry(() => Sheets.Spreadsheets?.Values?.batchClear({ ranges: [`${this.sheet}!${this.head_col}${this.head_row + 1}:${this.tail_col}${this.tail_row || ''}`] }, this.ssId));
        // シートを上書き
        this.retry(() => Sheets.Spreadsheets?.Values?.append({ values: [head] }, this.ssId, `${this.sheet}!${this.head_col}${this.head_row}`, { valueInputOption: 'USER_ENTERED' }));
        // プロパティ更新
        this.getExistRecords();
    }
    /** 見出し行の変更 */
    migration(head) {
        // 同じ見出しの場合は何もしない
        if (head.every((col, i) => col === this.head[i]))
            return;
        // 見出し行をクリア
        this.retry(() => Sheets.Spreadsheets?.Values?.batchClear({ ranges: [`${this.sheet}!${this.head_col}${this.head_row}:${this.tail_col}${this.head_row}`] }, this.ssId));
        // シートを上書き
        this.retry(() => Sheets.Spreadsheets?.Values?.append({ values: [head] }, this.ssId, `${this.sheet}!${this.head_col}${this.head_row}`, { valueInputOption: 'USER_ENTERED' }));
        this.getExistRecords();
    }
    /**
     * レンダリングオプションの変更
     * FORMATTED_VALUE: セルの表示される形式で値を取得します。数値や日付は文字列として返されますが、数式は評価された値として返されます。
     * UNFORMATTED_VALUE: セルのフォーマットを無視して、値を取得します。数値や日付も数値型として返されます。
     * FORMULA: セルの数式を取得します。数式が存在する場合はそのまま返されます。
     */
    setValueRenderOption(option) {
        this.valueRenderOption = option;
        this.getExistRecords();
    }
    /** 見出し名を列名に変換する */
    toCol(key, nth = 0) {
        const indices = this.head.reduce((acc, v, i) => {
            v === key && acc.push(i);
            return acc;
        }, []);
        return this.numeric2Colname(this.colname2number(this.head_col) + (indices[nth] ?? 0));
    }
    /** 列名を見出し名に変換する */
    toKey(col) {
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
    findRecord(target) {
        if (this.recordMap.size === 0)
            return;
        return this.recordMap.get(Table.isTRow(target) ? target.hash[this.primary_key] :
            typeof target === 'string' ? target
                : target[this.primary_key]);
    }
    /** 指定したキーと一致する先頭のRecordを返す */
    findByKey(key, value) {
        return this.records.find(({ hash }) => hash[key] === value);
    }
    /** 指定した範囲のデータをRow形式で取得 */
    getExistRecords() {
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
        const head = df[0].map((h) => h.toString().trim());
        // set first column as primary key if not set
        this.primary_key === '' && (this.primary_key = head?.[0] || 'id');
        const hashes = this.toHash(df);
        const records = hashes.map((hash, i) => {
            const record = this.rowFactory(head, hash, this.head_row + 1 + this.offset + i);
            // primary_keyが存在する場合はMapに登録
            const PK = hash[this.primary_key];
            if (PK)
                this.recordMap.set(PK, record);
            return record;
        });
        this.head = head;
        this.records = records;
        this.hashes = hashes;
        return records;
    }
    /** 指定したデータでテーブルを再作成する */
    resetTable(records, options = {}) {
        const values = records.map((r) => this.toValues(r));
        // シートをクリア
        this.retry(() => Sheets.Spreadsheets?.Values?.batchClear({ ranges: [`${this.sheet}!${this.head_col}${this.head_row + 1}:${this.tail_col}${this.tail_row || ''}`] }, this.ssId));
        if (values.length > 0) {
            // シートを上書き
            this.retry(() => Sheets.Spreadsheets?.Values?.append({ values }, this.ssId, `${this.sheet}!${this.head_col}${this.head_row + 1}`, { valueInputOption: 'USER_ENTERED' }));
        }
        // プロパティ更新
        if (options.noloading !== true)
            this.getExistRecords();
    }
    /** 指定したデータでシートを上書きする(一致するデータが無ければ末尾に追加) */
    updateRecords(records, rows) {
        // 上書き範囲の配列を生成
        let next_row = this.lastRow() + 1;
        const dirty_rows = [];
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
            const data = {
                range: `${this.sheet}!${this.head_col}${row}`,
                values: [this.toValues(hash)],
            };
            dirty_rows.push(row);
            return data;
        });
        if (data.length > 0) {
            // flush the data
            SpreadsheetApp.flush();
            this.resize(Math.max(...dirty_rows), this.colname2number(this.head_col) + this.head.length - 1);
            // シートを上書き
            this.retry(() => Sheets.Spreadsheets?.Values?.batchUpdate({
                valueInputOption: 'USER_ENTERED',
                data,
            }, this.ssId));
            // プロパティ更新
            this.getExistRecords();
        }
        return {
            dirty_rows,
            dirty_records: this.records.filter((r) => dirty_rows.includes(r.row)),
        };
    }
    /** recordsの内容をシートに反映 */
    save() {
        this.updateRecords(this.records);
    }
    /** 指定したデータをテーブルの末尾に追記する */
    appendRecords(records) {
        // 追記用二次元配列を生成
        const values = records.map((r) => this.toValues(r));
        // シートの末尾に追記
        if (values.length > 0) {
            this.retry(() => Sheets.Spreadsheets?.Values?.append({ values }, this.ssId, `${this.sheet}!${this.head_col}${this.lastRow() + 1}`, { valueInputOption: 'USER_ENTERED' }));
            // プロパティ更新
            this.getExistRecords();
        }
    }
    /** 指定したレコードを削除 */
    deleteRecords(records) {
        const rows = records
            .map((record) => Table.isTRow(record) ? record.row : this.findRecord(record)?.row)
            .filter((row) => row !== undefined);
        this.deleteRecordsFromRow(rows);
    }
    deleteRecordsFromRow(rows) {
        const data = rows.map((row) => ({
            range: `${this.sheet}!${this.head_col}${row}`,
            values: [this.head.map(() => '')],
        }));
        this.retry(() => Sheets.Spreadsheets?.Values?.batchUpdate({
            valueInputOption: 'USER_ENTERED',
            data
        }, this.ssId));
        this.getExistRecords();
    }
    /** 指定した列でデータを並び替え */
    sortRecords(column, ascending = true) {
        const s = this.ss.getSheetByName(this.sheet);
        const rng = s?.getRange(this.range);
        rng?.getFilter()?.remove();
        rng?.createFilter().sort(this.head.indexOf(column) + this.colname2number(this.head_col), ascending);
    }
    // シートのグリッドサイズを変更(縮小は不可)
    resize(rows, columns) {
        const s = this.ss.getSheetByName(this.sheet);
        if (!s)
            return;
        const maxrow = s.getMaxRows() || 1;
        const maxcol = s.getMaxColumns() || 1;
        (maxcol < columns) && (s.insertColumnsAfter(maxcol, columns - maxcol));
        (maxrow < rows) && (s.insertRowsAfter(maxrow, rows - maxrow));
    }
    /** アルファベットを列番号に変換 */
    colname2number(column_name) {
        const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const column_number = column_name.toUpperCase().split('').reduce((acc, c) => {
            acc = acc * 26 + base.indexOf(c) + 1;
            return acc;
        }, 0);
        return column_number;
    }
    /** 列番号をアルファベットに変換 */
    numeric2Colname(num) {
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
    retry(callback, options = {}) {
        const { maxRetries = 3, delay = 500, backoffFactor = 1.5, retryableErrors = [Error] } = options;
        for (const i of [...Array(maxRetries).keys()]) {
            try {
                return callback();
            }
            catch (e) {
                if (i === maxRetries - 1 || !retryableErrors.some((err) => e instanceof err))
                    throw e;
                Utilities.sleep(delay * Math.pow(backoffFactor, i));
            }
        }
        throw new Error('unreachable');
    }
    /** Range.getValuesのラッパー */
    getValues(range) {
        return this.ss.getRange(`${this.sheet}!${range}`).getValues();
    }
    /** Range.setValueのラッパー */
    getValue(range) {
        return this.ss.getRange(`${this.sheet}!${range}`).getValues().flat()[0];
    }
    /** Range.setValuesのラッパー */
    setValues(range, values) {
        this.ss.getRange(`${this.sheet}!${range}`).setValues(values);
    }
    /** Range.setValueのラッパー */
    setValue(range, value) {
        this.ss.getRange(`${this.sheet}!${range}`).setValues([[value]]);
    }
    rowFactory(head, hash, row) {
        const row_object = {
            head,
            hash,
            row: row || NaN,
        };
        return row_object;
    }
    toValues(record) {
        const hash = Table.isTRow(record) ? record.hash : record;
        return this.head.map((col) => hash[col] === 'NaN' ? undefined : hash[col]);
    }
    /** 二次元のテーブルデータを見出しをキーとしたオブジェクト配列に変換する */
    toHash(df, option) {
        const useFirstColumn = option?.useFirstColumn ?? this.toHashOption?.useFirstColumn ?? true;
        const [head, ...values_arr] = df;
        return values_arr.map((values) => {
            const hash = {};
            head.forEach((key, i) => {
                key = key.toString().trim();
                // 同じ見出しが複数ある場合は、オプションをチェック
                if (!(key in hash) || !useFirstColumn)
                    hash[key] = values[i]?.toString() || '';
            });
            return hash;
        });
    }
}
function buildTable(range, primary_key, options = {}) {
    return new Table(range, primary_key, options);
}
