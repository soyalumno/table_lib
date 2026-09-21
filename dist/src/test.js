"use strict";
function doTest_() {
    const startedAt = Date.now();
    const ss = SpreadsheetApp.getActive();
    const ssId = ss.getId();
    const mainSheet = ss.getSheetByName('main');
    if (!mainSheet)
        throw new Error('main sheet not found');
    if (!ss.getSheetByName('verify'))
        ss.insertSheet('verify');
    prepareVerifySheet_(ssId);
    const counts = { ok: 0, ng: 0 };
    const cases = [
        { name: 'save_keeps_rows', run: caseSaveKeepsRows_ },
        { name: 'append_position_with_offset_rows', run: caseAppendPositionWithOffsetRows_ },
        { name: 'append_resize_grid', run: caseAppendResizeGrid_ },
        { name: 'reset_sync_matches_reload', run: caseResetSyncMatchesReload_ },
        { name: 'append_sync_matches_reload', run: caseAppendSyncMatchesReload_ },
        { name: 'delete_sync_matches_reload', run: caseDeleteSyncMatchesReload_ },
        { name: 'update_noloading_compat', run: caseUpdateNoloadingCompat_ },
        { name: 'update_rows_moves_pk', run: caseUpdateRowsMovesPk_ },
        { name: 'partial_hash_preserves_columns', run: casePartialHashPreservesColumns_ },
        { name: 'duplicate_header_writes_first_only', run: caseDuplicateHeaderWritesFirstOnly_ },
        { name: 'retry_transient_retries', run: caseRetryTransientRetries_ },
        { name: 'retry_non_transient_throws_once', run: caseRetryNonTransientThrowsOnce_ },
        { name: 'retry_explicit_classes', run: caseRetryExplicitClasses_ },
        { name: 'bulk_update_2000_rows', run: caseBulkUpdate2000Rows_ },
    ];
    try {
        cases.forEach((testCase, index) => {
            // 書き込みクォータ(1分60回/ユーザー)を超えないようケース間を空ける
            if (index > 0)
                Utilities.sleep(4000);
            runVerifyCase_(ssId, mainSheet, testCase, counts);
        });
    }
    finally {
        withQuotaRetry_(() => restoreMain_(ssId, mainSheet));
    }
    const elapsed = Date.now() - startedAt;
    const summary = `OK ${counts.ok} / NG ${counts.ng} / total ${elapsed}ms`;
    appendVerifyRow_(ssId, [new Date().toISOString(), 'summary', `OK ${counts.ok} / NG ${counts.ng}`, `total ${elapsed}ms`]);
    Logger.log(summary);
}
function runVerifyCase_(ssId, sheet, testCase, counts) {
    const startedAt = Date.now();
    try {
        const detail = testCase.run(ssId, sheet);
        counts.ok++;
        appendVerifyRow_(ssId, [
            new Date().toISOString(),
            testCase.name,
            'OK',
            `${detail}; elapsed=${Date.now() - startedAt}ms`,
        ]);
    }
    catch (error) {
        counts.ng++;
        appendVerifyRow_(ssId, [
            new Date().toISOString(),
            testCase.name,
            'NG',
            `${formatVerifyError_(error)}; elapsed=${Date.now() - startedAt}ms`,
        ]);
    }
}
function caseSaveKeepsRows_(ssId) {
    clearMain_(ssId);
    const input = [
        { ID: '1', name: 'one', note: 'n1' },
        { ID: '2', name: 'two', note: 'n2' },
        { ID: '', name: 'blank', note: 'n3' },
        { ID: '4', name: 'four-a', note: 'n4' },
        { ID: '4', name: 'four-b', note: 'n5' },
    ];
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], input);
    const expected = input.map((hash, index) => ({ ...hash, name: `saved-${index + 1}` }));
    tbl.records.forEach((record, index) => { record.hash.name = expected[index].name; });
    tbl.save();
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(raw.length - 1, 5, 'expected rows=5');
    assertRawTable_(raw, 1, ['ID', 'name', 'note'], expected);
    assertReloadMatches_(ssId, 'main!A1:ZZ', expected, [2, 3, 4, 5, 6]);
    return 'expected=5 rows in place; actual=5 rows in place';
}
function caseAppendPositionWithOffsetRows_(ssId) {
    clearMain_(ssId);
    valuesApi_().update({ values: [['title'], ['memo']] }, ssId, 'main!A1', { valueInputOption: 'RAW' });
    const initial = [
        { ID: '1', name: 'one', note: 'n1' },
        { ID: '2', name: 'two', note: 'n2' },
        { ID: '3', name: 'three', note: 'n3' },
    ];
    const appended = [
        { ID: '4', name: 'four', note: 'n4' },
        { ID: '5', name: 'five', note: 'n5' },
    ];
    const tbl = resetVerifyTable_(ssId, 'main!A3:ZZ', ['ID', 'name', 'note'], initial);
    tbl.appendRecords(appended);
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 1, 1), 'title', 'expected A1=title');
    assertVerifyEqual_(rawCell_(raw, 2, 1), 'memo', 'expected A2=memo');
    assertRawTable_(raw, 3, ['ID', 'name', 'note'], [...initial, ...appended]);
    assertReloadMatches_(ssId, 'main!A3:ZZ', [...initial, ...appended], [4, 5, 6, 7, 8]);
    return 'expected=append at rows 7-8 and titles preserved; actual=matched';
}
function caseAppendResizeGrid_(ssId, sheet) {
    clearMain_(ssId);
    shrinkRowsTo_(sheet, 12);
    try {
        const initial = makeVerifyRecords_(1, 8, 'initial');
        const appended = makeVerifyRecords_(9, 6, 'appended');
        const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
        tbl.appendRecords(appended);
        const raw = readRawValues_(ssId);
        assertRawTable_(raw, 1, ['ID', 'name', 'note'], [...initial, ...appended]);
        appended.forEach((hash, index) => {
            assertVerifyEqual_(rawCell_(raw, 10 + index, 1), hash.ID, `expected row ${10 + index} ID=${hash.ID}`);
        });
        assertVerifyTrue_(sheet.getMaxRows() >= 15, `expected maxRows>=15; actual=${sheet.getMaxRows()}`);
        assertReloadMatches_(ssId, 'main!A1:ZZ', [...initial, ...appended], makeRows_(2, 14));
        return `expected=6 rows at 10-15 and maxRows>=15; actual=maxRows ${sheet.getMaxRows()}`;
    }
    finally {
        ensureMinimumGrid_(sheet, 1000, 26);
    }
}
function caseResetSyncMatchesReload_(ssId) {
    clearMain_(ssId);
    const expected = makeVerifyRecords_(1, 4, 'reset-sync');
    const tbl = buildVerifyTable_(ssId, 'main!A1:ZZ', true);
    tbl.create(['ID', 'name', 'note']);
    tbl.resetTable(expected, { postWrite: 'sync' });
    const raw = readRawValues_(ssId);
    assertRawTable_(raw, 1, ['ID', 'name', 'note'], expected);
    assertMemoryMatchesReload_(ssId, 'main!A1:ZZ', tbl);
    return 'expected=sync memory equals reload; actual=matched';
}
function caseAppendSyncMatchesReload_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 3, 'initial');
    const appended = makeVerifyRecords_(4, 2, 'append-sync');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    tbl.appendRecords(appended, { postWrite: 'sync' });
    const raw = readRawValues_(ssId);
    assertRawTable_(raw, 1, ['ID', 'name', 'note'], [...initial, ...appended]);
    assertMemoryMatchesReload_(ssId, 'main!A1:ZZ', tbl);
    return 'expected=append sync memory equals reload; actual=matched';
}
function caseDeleteSyncMatchesReload_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 3, 'delete-sync');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    const target = tbl.findRecord('3');
    assertVerifyTrue_(target !== undefined, 'expected=findRecord(3) before delete; actual=undefined');
    tbl.deleteRecords([target], { postWrite: 'sync' });
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 4, 1), '', 'expected deleted row 4 ID empty');
    assertVerifyEqual_(rawCell_(raw, 2, 1), '1', 'expected row 2 ID=1');
    assertVerifyEqual_(rawCell_(raw, 3, 1), '2', 'expected row 3 ID=2');
    assertVerifyTrue_(tbl.findRecord('3') === undefined, 'expected=findRecord(3) undefined after delete; actual=found');
    assertMemoryMatchesReload_(ssId, 'main!A1:ZZ', tbl);
    return 'expected=deleted key absent and remaining memory equals reload; actual=matched';
}
function caseUpdateNoloadingCompat_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 3, 'compat');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    tbl.updateRecords([{ note: 'compat-updated' }], [3], { noloading: true });
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 3, 3), 'compat-updated', 'expected C3=compat-updated');
    assertMemoryMatchesReload_(ssId, 'main!A1:ZZ', tbl);
    return 'expected=noloading true behaves as sync; actual=matched';
}
function caseUpdateRowsMovesPk_(ssId) {
    clearMain_(ssId);
    const initial = [
        { ID: '1', name: 'one', note: 'n1' },
        { ID: '2', name: 'two', note: 'n2' },
    ];
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    tbl.updateRecords([{ ID: '2', name: 'moved' }], [6], { postWrite: 'sync' });
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 6, 1), '2', 'expected A6=2');
    assertVerifyEqual_(rawCell_(raw, 6, 2), 'moved', 'expected B6=moved');
    assertVerifyEqual_(tbl.findRecord('2')?.row, 6, `expected memory row=6; actual=${tbl.findRecord('2')?.row}`);
    const reloaded = buildVerifyTable_(ssId, 'main!A1:ZZ');
    assertVerifyEqual_(reloaded.findRecord('2')?.row, 6, `expected reload row=6; actual=${reloaded.findRecord('2')?.row}`);
    return 'expected=key 2 written and indexed at row 6; actual=matched';
}
function casePartialHashPreservesColumns_(ssId) {
    clearMain_(ssId);
    const initial = [
        { ID: '1', name: 'one', note: 'n1' },
        { ID: '2', name: 'two', note: 'keep-note' },
    ];
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    tbl.updateRecords([{ name: 'only-name' }], [3]);
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 3, 1), '2', 'expected A3=2');
    assertVerifyEqual_(rawCell_(raw, 3, 2), 'only-name', 'expected B3=only-name');
    assertVerifyEqual_(rawCell_(raw, 3, 3), 'keep-note', 'expected C3=keep-note');
    const reloaded = buildVerifyTable_(ssId, 'main!A1:ZZ');
    assertVerifyEqual_(reloaded.findRecord('2')?.hash.note, 'keep-note', 'expected reload note=keep-note');
    return 'expected=ID and note preserved; actual=matched';
}
function caseDuplicateHeaderWritesFirstOnly_(ssId) {
    clearMain_(ssId);
    const initial = [{ ID: '1', name: 'initial', note: 'n1' }];
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'name', 'note'], initial);
    valuesApi_().update({ values: [['left', 'right']] }, ssId, 'main!B2:C2', { valueInputOption: 'RAW' });
    tbl.updateRecords([{ ID: '1', name: 'x' }], [2]);
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 2, 2), 'x', 'expected first name column=x');
    assertVerifyEqual_(rawCell_(raw, 2, 3), 'right', 'expected second name column=right');
    const reloaded = buildVerifyTable_(ssId, 'main!A1:ZZ');
    assertVerifyEqual_(reloaded.findRecord('1')?.hash.name, 'x', 'expected reload first name=x');
    return 'expected=first duplicate header updated only; actual=matched';
}
function caseRetryTransientRetries_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 1, 'retry-transient');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    let calls = 0;
    const result = tbl.retry(() => {
        calls++;
        if (calls < 3)
            throw new Error('Rate Limit Exceeded');
        return 'ok';
    });
    assertVerifyEqual_(result, 'ok', `expected result=ok; actual=${result}`);
    assertVerifyEqual_(calls, 3, `expected calls=3; actual=${calls}`);
    assertRawTable_(readRawValues_(ssId), 1, ['ID', 'name', 'note'], initial);
    assertReloadMatches_(ssId, 'main!A1:ZZ', initial, [2]);
    return 'expected=result ok and calls 3; actual=matched';
}
function caseRetryNonTransientThrowsOnce_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 1, 'retry-non-transient');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    let calls = 0;
    let thrown;
    try {
        tbl.retry(() => {
            calls++;
            throw new Error('Unable to parse range: foo');
        });
    }
    catch (error) {
        thrown = error;
    }
    assertVerifyTrue_(thrown instanceof Error, 'expected non-transient error; actual=no error');
    assertVerifyEqual_(thrown.message, 'Unable to parse range: foo', 'expected parse error message');
    assertVerifyEqual_(calls, 1, `expected calls=1; actual=${calls}`);
    assertRawTable_(readRawValues_(ssId), 1, ['ID', 'name', 'note'], initial);
    assertReloadMatches_(ssId, 'main!A1:ZZ', initial, [2]);
    return 'expected=non-transient error after 1 call; actual=matched';
}
function caseRetryExplicitClasses_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 1, 'retry-class');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    let typeCalls = 0;
    let typeThrown;
    try {
        tbl.retry(() => {
            typeCalls++;
            throw new TypeError('x');
        }, { retryableErrors: [TypeError] });
    }
    catch (error) {
        typeThrown = error;
    }
    let normalCalls = 0;
    let normalThrown;
    try {
        tbl.retry(() => {
            normalCalls++;
            throw new Error('Rate Limit Exceeded');
        }, { retryableErrors: [TypeError] });
    }
    catch (error) {
        normalThrown = error;
    }
    assertVerifyTrue_(typeThrown instanceof TypeError, 'expected TypeError after retries; actual=different');
    assertVerifyEqual_(typeCalls, 3, `expected TypeError calls=3; actual=${typeCalls}`);
    assertVerifyTrue_(normalThrown instanceof Error, 'expected normal Error; actual=no error');
    assertVerifyEqual_(normalCalls, 1, `expected normal Error calls=1; actual=${normalCalls}`);
    assertRawTable_(readRawValues_(ssId), 1, ['ID', 'name', 'note'], initial);
    assertReloadMatches_(ssId, 'main!A1:ZZ', initial, [2]);
    return 'expected=TypeError 3 calls and normal Error 1 call; actual=matched';
}
function caseBulkUpdate2000Rows_(ssId) {
    clearMain_(ssId);
    const initial = makeVerifyRecords_(1, 2000, 'bulk');
    const tbl = resetVerifyTable_(ssId, 'main!A1:ZZ', ['ID', 'name', 'note'], initial);
    const updates = initial.map((_, index) => ({ note: `updated-${index + 1}` }));
    const rows = makeRows_(2, 2000);
    const startedAt = Date.now();
    tbl.updateRecords(updates, rows, { postWrite: 'sync' });
    const updateElapsed = Date.now() - startedAt;
    const raw = readRawValues_(ssId);
    assertVerifyEqual_(rawCell_(raw, 2, 3), 'updated-1', 'expected first note=updated-1');
    const tail = readValues_(ssId, 'main!A2001:C2001');
    assertVerifyEqual_(rawCell_(tail, 1, 3), 'updated-2000', 'expected 2000th note=updated-2000');
    assertMemoryMatchesReload_(ssId, 'main!A1:ZZ', tbl);
    assertVerifyEqual_(tbl.hashes.length, 2000, `expected hashes=2000; actual=${tbl.hashes.length}`);
    return `expected=2000 updated; actual=${tbl.hashes.length}; update=${updateElapsed}ms; mode=single request`;
}
function prepareVerifySheet_(ssId) {
    valuesApi_().batchClear({ ranges: ['verify!A:D'] }, ssId);
    valuesApi_().update({ values: [['timestamp', 'case', 'result', 'detail']] }, ssId, 'verify!A1:D1', { valueInputOption: 'RAW' });
}
function appendVerifyRow_(ssId, values) {
    withQuotaRetry_(() => valuesApi_().append({ values: [values] }, ssId, 'verify!A:D', { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }));
}
function clearMain_(ssId) {
    withQuotaRetry_(() => valuesApi_().batchClear({ ranges: ['main!A1:Z'] }, ssId));
}
function buildVerifyTable_(ssId, range, noloading = false) {
    return buildTable(range, 'ID', { ssId, noloading });
}
/**
 * 検証テーブルの初期状態を生の Sheets API 1 回で作る(書き込みクォータ節約のため create/resetTable は使わない。
 * create/resetTable 自体は reset_sync_matches_reload で検証する)
 */
function resetVerifyTable_(ssId, range, head, records) {
    const values = [head, ...records.map((record) => head.map((header) => record[header]))];
    valuesApi_().update({ values }, ssId, range.split(':')[0], { valueInputOption: 'RAW' });
    return buildVerifyTable_(ssId, range);
}
/** 書き込みクォータ超過(Write requests per minute)なら 61 秒待って 1 回だけやり直す */
function withQuotaRetry_(callback) {
    try {
        return callback();
    }
    catch (error) {
        if (!(error instanceof Error) || !/quota/i.test(error.message))
            throw error;
        Utilities.sleep(61000);
        return callback();
    }
}
function readRawValues_(ssId) {
    return readValues_(ssId, 'main!A1:Z50');
}
function readValues_(ssId, range) {
    const response = valuesApi_().get(ssId, range, { valueRenderOption: 'FORMATTED_VALUE' });
    return (response.values || []).map((row) => row.map((value) => value === undefined ? '' : String(value)));
}
function rawCell_(values, row, column) {
    return values[row - 1]?.[column - 1] || '';
}
function assertRawTable_(raw, headRow, head, expected) {
    head.forEach((header, index) => {
        assertVerifyEqual_(rawCell_(raw, headRow, index + 1), header, `expected header ${index + 1}=${header}`);
    });
    expected.forEach((hash, recordIndex) => {
        head.forEach((header, columnIndex) => {
            assertVerifyEqual_(rawCell_(raw, headRow + 1 + recordIndex, columnIndex + 1), hash[header], `expected row ${headRow + 1 + recordIndex} ${header}=${hash[header]}`);
        });
    });
}
function assertReloadMatches_(ssId, range, expectedHashes, expectedRows) {
    const reloaded = buildVerifyTable_(ssId, range);
    assertVerifyEqual_(JSON.stringify(reloaded.hashes), JSON.stringify(expectedHashes), `expected reload hashes=${JSON.stringify(expectedHashes)}; actual=${JSON.stringify(reloaded.hashes)}`);
    assertVerifyEqual_(JSON.stringify(reloaded.records.map((record) => record.row)), JSON.stringify(expectedRows), `expected reload rows=${JSON.stringify(expectedRows)}; actual=${JSON.stringify(reloaded.records.map((record) => record.row))}`);
}
function assertMemoryMatchesReload_(ssId, range, tbl) {
    const reloaded = buildVerifyTable_(ssId, range);
    assertVerifyEqual_(JSON.stringify(tbl.hashes), JSON.stringify(reloaded.hashes), `expected memory hashes=${JSON.stringify(reloaded.hashes)}; actual=${JSON.stringify(tbl.hashes)}`);
    assertVerifyEqual_(JSON.stringify(tbl.records.map((record) => record.row)), JSON.stringify(reloaded.records.map((record) => record.row)), `expected memory rows=${JSON.stringify(reloaded.records.map((record) => record.row))}; actual=${JSON.stringify(tbl.records.map((record) => record.row))}`);
}
function makeVerifyRecords_(startId, count, prefix) {
    const records = [];
    for (let index = 0; index < count; index++) {
        const id = startId + index;
        records.push({ ID: String(id), name: `${prefix}-name-${id}`, note: `${prefix}-note-${id}` });
    }
    return records;
}
function makeRows_(startRow, count) {
    const rows = [];
    for (let index = 0; index < count; index++)
        rows.push(startRow + index);
    return rows;
}
function shrinkRowsTo_(sheet, rows) {
    const maxRows = sheet.getMaxRows();
    if (maxRows > rows)
        sheet.deleteRows(rows + 1, maxRows - rows);
}
function ensureMinimumGrid_(sheet, minimumRows, minimumColumns) {
    const maxRows = sheet.getMaxRows();
    if (maxRows < minimumRows)
        sheet.insertRowsAfter(maxRows, minimumRows - maxRows);
    const maxColumns = sheet.getMaxColumns();
    if (maxColumns < minimumColumns)
        sheet.insertColumnsAfter(maxColumns, minimumColumns - maxColumns);
}
function restoreMain_(ssId, sheet) {
    ensureMinimumGrid_(sheet, 1000, 26);
    clearMain_(ssId);
    const tbl = buildTable('main!A1:ZZ', 'ID', { ssId, noloading: true });
    tbl.create(['ID', 'foo']);
    tbl.resetTable([
        { ID: '101', foo: 'test' },
        { ID: '102', foo: 'updated' },
        { ID: '1004', foo: 'appended' },
    ]);
}
function valuesApi_() {
    const api = Sheets.Spreadsheets?.Values;
    if (!api)
        throw new Error('Sheets.Spreadsheets.Values is unavailable');
    return api;
}
function assertVerifyTrue_(condition, detail) {
    if (!condition)
        throw new Error(detail);
}
function assertVerifyEqual_(actual, expected, detail) {
    if (actual !== expected)
        throw new Error(`${detail}; actual=${String(actual)}`);
}
function formatVerifyError_(error) {
    if (error instanceof Error) {
        const stackTop = (error.stack || '').split('\n')[0] || '(no stack)';
        return `message=${error.message}; stack=${stackTop}`;
    }
    return `message=${String(error)}; stack=(no stack)`;
}
