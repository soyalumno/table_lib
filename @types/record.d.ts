// ジェネリクスのインタフェース
/** テーブルの見出し定義 */
type iHeader = string;
/** 見出しをキーとしたオブジェクト定義 */
type iHash = { [key in iHeader]: string };
/** Row : テーブルアクセス用のインタフェース */
type iRow = {
  head: iHeader[],
  hash: iHash,
  row: number,
  toValues: () => (string | undefined)[],
  isEqual(other: iHash): boolean,
}

// ジェネリクスの実体.実際のテーブルに合わせて見出し名を定義する
/** テーブルの見出し定義 */
type cHeader = 'ID' | 'foo';
/** 見出しをキーとしたオブジェクト定義 */
type cHash = { [key in cHeader]: string };
/** Row : テーブルアクセス用のインタフェース */
type cRow = {
  head: cHeader[],
  hash: cHash,
  row: number,
  toValues: () => (string | undefined)[],
  isEqual(other: cHash): boolean,
}

