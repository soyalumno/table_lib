class PrivateFunc {
  /** Tableクラスのサンプルコード */
  static tableSample() {
    // シート名・主キーを指定してTableクラスを生成
    const tbl = buildTable<
      TableDef.Main.Header,
      TableDef.Main.Row,
      TableDef.Main.Hash>('main!A1:ZZ', 'ID');

    // テーブルを全てクリアして、新規データベースをセット
    // - 既存データがあるならセット不要
    tbl.resetTable([{ ID: '101', foo: 'test' }, { ID: '102', foo: 'test2' }])

    // プロパティからアクセス
    console.log(tbl.head);
    console.log(tbl.hashes);

    // 特定のデータを検索して行番号を取得
    console.log(tbl.findRecord({ ID: '101' } as TableDef.Main.Hash)?.row);

    // データを指定して更新
    const record = tbl.findRecord({ ID: '102' } as TableDef.Main.Hash);
    if (record) {
      record.hash.foo = 'updated'
      tbl.updateRecords([record]);
    }

    // 末尾にデータを追記
    tbl.appendRecords([{ ID: '1004', foo: 'appended' }]);
  }
}

