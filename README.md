# スプレッドシートRead / Writeライブラリ

GASからスプレッドシートの読み書きをORM風に実行するためのライブラリです

スクリプトID : `1oTkQ04P5WysPyhfrFVf2KFynF9hH696BI1pqAnbNyDyZb82KvbJNU3ER`

ライブラリを追加する際に、上記のスクリプトIDを指定してください

![screenshot-2023-05-06-192611](https://user-images.githubusercontent.com/33917383/236618671-d457a9cd-4d78-42eb-bdd2-02d0d1f6ab67.png)

https://user-images.githubusercontent.com/33917383/236586101-5f837378-581f-4e76-acc8-4b2dc8941e00.mp4


## 使い方

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

- `Table.head` : テーブル範囲の1行目をカラム名の配列として保持
- `Table.hashes` : テーブル範囲の2行目以降をカラム名をキーとしたオブジェクト配列として保持
- `Table.records` : テーブル範囲の2行目以降を`TRow`の配列として保持
    - `TRow` : 行オブジェクト.行番号の取得やオブジェクトを配列化するメソッドを備える.メソッドの振る舞いは`Table`クラスのコンストラクタで上書き可能

### データの検索

`Table.findRecord`メソッドで、ハッシュや行番号を指定してデータを検索

```javascript
// IDを指定して検索
console.log(tbl.findRecord({ ID: '101' }));
// 行番号を指定して検索
console.log(tbl.findRecord(10));
```

### データの更新

`Table.updateRecords`で上書き、`Table.appendRecords`で末尾への追記が可能

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
