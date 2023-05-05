# スプレッドシートRead / Writeライブラリ

GASからスプレッドシートの読み書きをORM風に実行するためのライブラリです

スクリプトID : `1oTkQ04P5WysPyhfrFVf2KFynF9hH696BI1pqAnbNyDyZb82KvbJNU3ER`

https://user-images.githubusercontent.com/33917383/236586101-5f837378-581f-4e76-acc8-4b2dc8941e00.mp4


## 使い方

1. テーブル範囲、主キーを指定してTableインスタンスを生成.`getExistRecords`を呼び出して、シートからデータを読み込み

    ```javascript
    // テーブル範囲・主キーを指定してTableクラスを生成
    const tbl = table_lib.buildTable<cHeader, cRow, cHash>('main!A1:ZZ', 'ID');
    tbl.getExistRecords();
    ```

2. (必要であれば)テーブルの初期化

    ```javascript
    // テーブルを全てクリアして、新規データベースをセット
    // - 既存データがあるならセット不要
    tbl.resetTable([{ ID: '101', foo: 'test' }, { ID: '102', foo: 'test2' }])
    ```

3. プロパティへのアクセス

    - `tbl.head` : テーブル範囲の1行目をカラム名の配列として保持
    - `tbl.hashes` : テーブル範囲の2行目以降をカラム名をキーとしたオブジェクト配列で保持
    - `tbl.records` : テーブル範囲の2行目以降を`TRow`の配列として保持
        - `TRow` : 行オブジェクト.行番号の取得やオブジェクトを配列化するメソッドを備える.メソッドの振る舞いは`Table`クラスのコンストラクタで上書き可能

4. データの検索.`tbl.findRecord`メソッドで、ハッシュや行番号を指定してデータを検索

    ```javascript
    // 特定のデータを検索して行番号を取得
    console.log(tbl.findRecord({ ID: '101' } as cHash)?.row);
    ```

5. データの更新.`tbl.updateRecords`で上書き、`tbl.appendRecords`で末尾への追記が可能

    ```javascript
    // データを指定して更新
    const record = tbl.findRecord({ ID: '102' } as cHash);
    if (record) {
      record.hash.foo = 'updated'
      tbl.updateRecords([record]);
    }

    // 末尾にデータを追記
    tbl.appendRecords([{ ID: '1004', foo: 'appended' }]);
    ```
