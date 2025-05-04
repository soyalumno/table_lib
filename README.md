# スプレッドシートRead / Writeライブラリ

GASからスプレッドシートの読み書きをORM風に実行するためのライブラリです

## ✅特長

任意のスプレッドシートの範囲を`Table`オブジェクトとして扱うことで  
スプレッドシートのデータを直感的に操作可能とします.

> **Note**
> - Tableの初期化はデータ範囲を指定するだけでOK
> - アクセスをオブジェクト経由で行うため,行番号・列番号の指定が不要
> - 主キーを持つことで、データの検索操作に対応

## 🎥デモ

https://user-images.githubusercontent.com/33917383/236586101-5f837378-581f-4e76-acc8-4b2dc8941e00.mp4


## 📄使い方

### ライブラリの追加方法

スクリプトID : `1oTkQ04P5WysPyhfrFVf2KFynF9hH696BI1pqAnbNyDyZb82KvbJNU3ER`

ライブラリを追加する際に、上記のスクリプトIDを指定してください  
`table_lib`という名前でアクセスが可能です

![screenshot-2023-05-06-192611](https://user-images.githubusercontent.com/33917383/236618671-d457a9cd-4d78-42eb-bdd2-02d0d1f6ab67.png)

### Tableインスタンスの生成

テーブル範囲、主キーを指定してTableインスタンスを生成可能です
- テーブル範囲 : 1行目にカラム名、2行目以降にデータが格納されているシートの範囲

```javascript
// テーブル範囲・主キーを指定してTableクラスを生成
const tbl = table_lib.buildTable('main!A1:ZZ', 'ID');
```

### シートの初期化

必要であれば, `resetTable`でテーブルを初期化してください  
テーブル範囲を全てクリアして、値をスプレッドシートにセットします

```javascript
// テーブルを全てクリアして、新規データベースをセット
// - 既存データがあるならセット不要
tbl.resetTable([{ ID: '101', foo: 'test' }, { ID: '102', foo: 'test2' }])
```

### プロパティへのアクセス

テーブルのカラム名、各データへのアクセスをオブジェクトのプロパティとして提供します

- `Table.sheet` : テーブル範囲の属するシート名
- `Table.head_row` : カラム行番号
- `Table.head_col` : 先頭列名(ex. A,B,C...)
- `Table.head` : テーブル範囲の1行目をカラム名の配列として保持
- `Table.hashes` : テーブル範囲の2行目以降をカラム名をキーとしたオブジェクト配列として保持
- `Table.records` : テーブル範囲の2行目以降を`TRow`の配列として保持
    - `TRow` : 行オブジェクト.行番号の取得やオブジェクトを配列化するメソッドを備える.メソッドの振る舞いは`Table`クラスのコンストラクタで上書き可能

```javascript
console.log(tbl.head); // -> [ 'ID', 'foo' ]
console.log(tbl.hashes);// -> [ { ID: '101', foo: 'test' }, { ID: '102', foo: 'test2' } ]
var record = tbl.findRecord({ ID: '101' });
console.log(record.row); // -> 2
console.log(record.head); // -> [ 'ID', 'foo' ]
console.log(record.hash); // -> { ID: '101', foo: 'test' }
console.log(record.toValues()); // -> [ '101', 'test' ]
```

### データの検索

`Table.findRecord`メソッドで、ハッシュや行番号を指定してデータを検索可能です

```javascript
// IDを指定して検索
console.log(tbl.findRecord({ ID: '101' }));
// 行番号を指定して検索
console.log(tbl.findRecord(10));
```

### データの更新

`Table.updateRecords`で上書き、`Table.appendRecords`で末尾への追記が可能です

```javascript
// データを指定して更新
const record = tbl.findRecord({ ID: '102' });
if (record) {
  record.hash.foo = 'updated'
  tbl.updateRecords([record]);
}

// 末尾にデータを追記
tbl.appendRecords([{ ID: '1004', foo: 'appended' }]);
```

## サンプルコード

[src/sample.ts](https://github.com/soyalumno/table_lib/blob/main/src/sample.ts)


# Reference

`Table`クラスは、Google Spreadsheetのテーブル範囲を読み書きするための抽象クラスです。ヘッダー行をキーとしてデータを取得・操作できます。

## 基本情報

このクラスは型パラメータを3つ受け取ります：
- `THeader` - ヘッダー行の型（`iHeader`を継承）
- `TRow` - 行データの型（`iRow`を継承）
- `THash` - ハッシュデータの型（`iHash`を継承）

## コンストラクタ

```typescript
constructor(
  range: string,              // テーブル範囲（例: 'シート1!A1:Z100'）
  primary_key = '',           // 主キーのカラム名
  options = {
    ssId?: string,            // スプレッドシートID（省略時は現在アクティブなスプレッドシート）
    noloading?: boolean,      // true時、コンストラクタでデータ読み込みを行わない
    offset?: number           // ヘッダー行と最初のデータ行の間のオフセット行数
  }
)
```

## プロパティ

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| `head_row` | `number` | 見出し行の行番号 |
| `tail_row` | `number` | 最終行の行番号 |
| `head_col` | `string` | テーブルの先頭列（例: 'A'） |
| `tail_col` | `string` | テーブルの最終列（例: 'Z'） |
| `sheet` | `string` | シート名 |
| `range` | `string` | テーブル範囲（例: 'シート1!A1:Z100'） |
| `offset` | `number` | ヘッダー行と最初のデータ行の間のオフセット行数 |
| `primary_key` | `string` | 主キーのカラム名 |
| `ss` | `GoogleAppsScript.Spreadsheet.Spreadsheet` | スプレッドシートオブジェクト |
| `ssId` | `string` | スプレッドシートID |
| `head` | `THeader[]` | ヘッダー行の配列 |
| `records` | `TRow[]` | データ行オブジェクトの配列 |
| `hashes` | `THash[]` | データハッシュの配列 |
| `valueRenderOption` | `'FORMATTED_VALUE' \| 'UNFORMATTED_VALUE' \| 'FORMULA'` | 値取得時のレンダリングオプション |

## メソッド

### テーブル作成・操作

#### `create(head: THeader[])`
ヘッダー行を作成し、既存データをクリアします。

#### `migration(head: THeader[])`
ヘッダー行を変更します。既存のヘッダーと同じ場合は何もしません。

#### `resetTable(records: THash[] | TRow[], options = { noloading?: boolean })`
指定したデータでテーブルを再作成します。既存データは削除されます。

#### `updateRecords(records: THash[] | TRow[], rows?: number[])`
指定したデータでシートを上書きします。一致するデータが無ければ末尾に追加します。
- `rows`: 書き込み先の行番号を指定できます

#### `save()`
`records`の内容をシートに反映します。

#### `appendRecords(records: THash[] | TRow[])`
指定したデータをテーブルの末尾に追記します。

#### `deleteRecords(records: THash[] | TRow[])`
指定したレコードを削除します（行を空白にします）。

#### `deleteRecordsFromRow(rows: number[])`
指定した行番号のレコードを削除します。

#### `sortRecords(column: THeader, ascending = true)`
指定した列でデータを並び替えます。

### データ取得・検索

#### `getExistRecords(): TRow[]`
テーブル範囲のデータを読み込み、`records`、`hashes`、`head`を更新します。

#### `findRecord(target: THash | TRow)`
主キーに一致するレコードを返します。

#### `findByKey(key: THeader, value: string)`
指定したキーと値に一致する最初のレコードを返します。

#### `lastRow(key = this.primary_key)`
データが存在する最終行の行番号を返します。

### ユーティリティ

#### `setValueRenderOption(option: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA')`
値取得時のレンダリングオプションを設定します。
- `FORMATTED_VALUE`: セルの表示形式で値を取得（デフォルト）
- `UNFORMATTED_VALUE`: フォーマットを無視して値を取得
- `FORMULA`: セルの数式を取得

#### `toCol(key: THeader, nth = 0)`
見出し名を列名（例: 'A'）に変換します。
- `nth`: 同名の列が複数ある場合、何番目の列を取得するか

#### `toKey(col: string)`
列名（例: 'A'）を見出し名に変換します。

#### `resize(rows: number, columns: number)`
シートのグリッドサイズを変更します（縮小は不可）。

#### `colname2number(column_name: string)`
列名（例: 'AA'）を列番号（例: 27）に変換します。

#### `numeric2Colname(num: number)`
列番号（例: 27）を列名（例: 'AA'）に変換します。

#### `getValues(range: string): any[][]`
指定した範囲の値を二次元配列で取得します。

#### `getValue(range: string): any`
指定したセルの値を取得します。

#### `setValues(range: string, values: string[][])`
指定した範囲に値を設定します。

#### `setValue(range: string, value: any)`
指定したセルに値を設定します。

#### `retry<T>(callback: (...args: any[]) => T, options?): T`
指定した関数を実行し、エラーが発生した場合はリトライします。
- `options.maxRetries`: 最大リトライ回数（デフォルト: 3）
- `options.delay`: 初回リトライまでの遅延時間（ミリ秒、デフォルト: 500）
- `options.backoffFactor`: バックオフ係数（デフォルト: 1.5）
- `options.retryableErrors`: リトライ対象のエラークラス（デフォルト: [Error]）

## スタティックメソッド

#### `static isTRow<TRow extends iRow>(value: any): value is TRow`
与えられた値が`TRow`型かどうかを判定します（Type Guard）。

## ヘルパー関数

#### `buildTable<THeader extends iHeader, TRow extends iRow, THash extends iHash>(range: string, primary_key: string)`
`Table`クラスのインスタンスを作成します。

## 使用例

```typescript
// 顧客テーブルの定義
interface CustomerHeader extends iHeader {}
interface CustomerRow extends iRow {
  hash: CustomerHash;
}
interface CustomerHash extends iHash {
  id: string;
  name: string;
  email: string;
}

// テーブルのインスタンス化
const customerTable = new Table<CustomerHeader, CustomerRow, CustomerHash>('顧客!A1:D100', 'id');

// データの取得
const customers = customerTable.records;

// 新規データの追加
customerTable.appendRecords([{ id: '001', name: '山田太郎', email: 'yamada@example.com' }]);

// データの更新
const yamada = customerTable.findByKey('name', '山田太郎');
if (yamada) {
  yamada.hash.email = 'new-email@example.com';
  customerTable.save();
}
```
