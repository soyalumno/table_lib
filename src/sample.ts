class PrivateFunc {
  /** Tableクラスのサンプルコード */
  static tableSample() {
    // シート名・主キーを指定してTableクラスを生成
    const tbl = buildTable<cHeader, cRow, cHash>('main!A1:ZZ', 'ID');
    tbl.getExistRecords();

    // テーブルを全てクリアして、新規データベースをセット
    // - 既存データがあるならセット不要
    tbl.resetTable([{ ID: '101', foo: 'test' }, { ID: '102', foo: 'test2' }])

    // プロパティからアクセス
    console.log(tbl.head);
    console.log(tbl.hashes);

    // 特定のデータを検索して行番号を取得
    console.log(tbl.findRecord({ ID: '101' } as cHash)?.row);

    // データを指定して更新
    const record = tbl.findRecord({ ID: '102' } as cHash);
    if (record) {
      record.hash.foo = 'updated'
      tbl.updateRecords([record]);
    }

    // 末尾にデータを追記
    tbl.appendRecords([{ ID: '1004', foo: 'appended' }]);
  }
}

