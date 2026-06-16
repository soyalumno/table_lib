// GASグローバルのスタブ（テスト用最小実装）
// Table クラスのコンストラクタが noloading:false（デフォルト）のとき getExistRecords を呼ぶため、
// Sheets API と SpreadsheetApp の最低限のスタブが必要。

const mockSheet = {
  getMaxRows: () => 1000,
  getMaxColumns: () => 26,
  insertRowsAfter: () => {},
  insertColumnsAfter: () => {},
  getRange: () => ({
    getValues: () => [[]],
    setValues: () => {},
    getFilter: () => null,
    createFilter: () => ({ sort: () => {} }),
  }),
};

const mockSpreadsheet = {
  getId: () => 'test-spreadsheet-id',
  getSheetByName: () => mockSheet,
  getRange: () => mockSheet.getRange(),
};

(globalThis as any).SpreadsheetApp = {
  getActive: () => mockSpreadsheet,
  openById: () => mockSpreadsheet,
  flush: () => {},
};

(globalThis as any).Sheets = {
  Spreadsheets: {
    Values: {
      batchGet: () => ({ valueRanges: [] }),
      batchUpdate: () => ({}),
      batchClear: () => ({}),
      append: () => ({}),
      update: () => ({}),
    },
  },
};

(globalThis as any).Utilities = {
  sleep: () => {},
};
