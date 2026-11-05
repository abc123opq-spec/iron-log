const test = require('node:test'); const assert = require('node:assert/strict');
const { ingest } = require('../ingest/Code.js');
const { LOG, SETTINGS } = require('./fixtures.js');
const NOW = new Date('2026-11-04T07:13:05+09:00');
const deps = (over = {}) => { const saved = [];
  return { saved, expectedToken: 't0k3n', now: NOW, loadLog: () => LOG.slice(0, -1), saveLog: l => saved.push(l), loadSettings: () => SETTINGS, ...over }; };
test('合言葉が違う', () => { const d = deps(); assert.equal(ingest({ token: 'x', samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 合言葉が違います'); assert.equal(d.saved.length, 0); });
test('合言葉が未設定なら、空の合言葉でも通さない', () => {
  const d = deps({ expectedToken: '' }); assert.equal(ingest({ samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 合言葉が設定されていません'); assert.equal(d.saved.length, 0);
});
test('有効な行がない', () => assert.equal(ingest({ token: 't0k3n', samples: 'bad' }, deps()), 'ERROR: 有効な測定がありません'));
test('保存して要約を返す', () => {
  const d = deps();
  assert.equal(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), '71.6kg ▲0.3｜目標ライン −0.2 順調｜予測 68.5（T−31）');
  assert.equal(d.saved.length, 1);
  assert.deepEqual(d.saved[0].at(-1), { date: '2026-11-04', kg: 71.6, time: '07:12', received: '2026-11-04 07:13:05' });
});
test('同じデータの再送では保存しない', () => {
  const d = deps({ loadLog: () => LOG });
  assert.match(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), /^71\.6kg/); assert.equal(d.saved.length, 0);
});
test('設定が足りなくても記録は保存し、エラー文を返す', () => {
  const d = deps({ loadSettings: () => { throw new Error('設定シートに目標日がありません'); } });
  assert.equal(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 設定シートに目標日がありません');
  assert.equal(d.saved.length, 1);
});
test('ingestの設定ファイル', () => {
  const j = require('../ingest/appsscript.json');
  assert.deepEqual([j.timeZone, j.runtimeVersion, j.webapp.executeAs, j.webapp.access], ['Asia/Tokyo', 'V8', 'USER_DEPLOYING', 'ANYONE_ANONYMOUS']);
});
// 追加：params が無い・合言葉が無いときの動き、loadLog の例外、保存の中身
test('paramsが無くても落ちず、合言葉なしは不一致として扱う', () => {
  const d = deps();
  assert.equal(ingest(undefined, d), 'ERROR: 合言葉が違います');
  assert.equal(ingest(null, d), 'ERROR: 合言葉が違います');
  assert.equal(ingest({ samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 合言葉が違います');
  assert.equal(d.saved.length, 0);
});
test('samplesが無ければ有効な測定なし', () => assert.equal(ingest({ token: 't0k3n' }, deps()), 'ERROR: 有効な測定がありません'));
test('ログの読み込みで例外が出たらERROR文を返し、保存しない', () => {
  const d = deps({ loadLog: () => { throw new Error('シート「体重ログ」が見つかりません'); } });
  assert.equal(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: シート「体重ログ」が見つかりません');
  assert.equal(d.saved.length, 0);
});
test('保存するログは日付順で、元のログは変えない', () => {
  const base = LOG.slice(0, -1); const before = JSON.stringify(base);
  const d = deps({ loadLog: () => base });
  ingest({ token: 't0k3n', samples: '2026-11-02T07:00,71.4\n2026-11-04T07:12,71.6' }, d);
  assert.equal(JSON.stringify(base), before);
  const dates = d.saved[0].map(r => r.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(d.saved[0].length, base.length + 2);
});
// ---- 最終レビュー(1)(8)：Apps Script の入口の動き（LockService などを偽物に差し替えて確かめる） ----
const { saveLog_, handleRequest_ } = require('../ingest/Code.js');
const withGas = (fakes, fn) => {
  const names = ['PropertiesService', 'SpreadsheetApp', 'LockService', 'ContentService'];
  const saved = names.map(n => globalThis[n]);
  Object.assign(globalThis, fakes);
  try { return fn(); } finally { names.forEach((n, i) => { if (saved[i] === undefined) delete globalThis[n]; else globalThis[n] = saved[i]; }); }
};
const props = (p) => ({ getScriptProperties: () => ({ getProperty: k => (k in p ? p[k] : null) }) });
const fakeSheet = (lastRow) => {
  const calls = [];
  const range = (desc) => ({
    setValues: v => { calls.push(['setValues', desc, v]); },
    clearContent: () => { calls.push(['clearContent', desc]); },
    setNumberFormat: f => { calls.push(['setNumberFormat', desc, f]); }
  });
  const sheet = { getRange: (...a) => range(a), getLastRow: () => lastRow };
  return { calls, app: { openById: () => ({ getSheetByName: n => (n === '体重ログ' ? sheet : null) }) } };
};
const LOG3 = [{ date: '2026-11-02', kg: 71.4, time: '07:00', received: 'r' }, { date: '2026-11-03', kg: 71.3, time: '06:50', received: 'r' }, { date: '2026-11-04', kg: 71.6, time: '07:12', received: 'r' }];
test('saveLog_は先に新しい行を書き、そのあとで余った行だけを消す（途中で失敗しても記録が残る）', () => {
  const s = fakeSheet(6);   // 見出し＋古い5行
  withGas({ PropertiesService: props({ SHEET_ID: 'fake' }), SpreadsheetApp: s.app }, () => saveLog_(LOG3));
  const i = (name, desc) => s.calls.findIndex(c => c[0] === name && JSON.stringify(c[1]) === JSON.stringify(desc));
  assert.ok(i('setValues', [1, 1, 1, 4]) >= 0, '見出し');
  assert.ok(i('setNumberFormat', [2, 1, 3, 1]) >= 0 && s.calls[i('setNumberFormat', [2, 1, 3, 1])][2] === '@', 'A列は文字');
  assert.ok(i('setNumberFormat', [2, 3, 3, 2]) >= 0 && s.calls[i('setNumberFormat', [2, 3, 3, 2])][2] === '@', 'C・D列は文字');
  assert.ok(!s.calls.some(c => c[0] === 'setNumberFormat' && c[1][1] === 2), 'B列（体重）は数値のまま');
  const w = i('setValues', [2, 1, 3, 4]), cl = i('clearContent', [5, 1, 2, 4]);
  assert.ok(w >= 0, '2〜4行目に書く'); assert.deepEqual(s.calls[w][2], LOG3.map(r => [r.date, r.kg, r.time, r.received]));
  assert.ok(cl >= 0, '5〜6行目だけ消す'); assert.ok(w < cl, '書いてから消す');
  assert.equal(s.calls.filter(c => c[0] === 'clearContent').length, 1);
});
test('saveLog_は余った行がなければ何も消さない', () => {
  for (const lastRow of [1, 2, 4]) {
    const s = fakeSheet(lastRow);
    withGas({ PropertiesService: props({ SHEET_ID: 'fake' }), SpreadsheetApp: s.app }, () => saveLog_(LOG3));
    assert.equal(s.calls.filter(c => c[0] === 'clearContent').length, 0, 'lastRow=' + lastRow);
    assert.ok(s.calls.some(c => c[0] === 'setValues' && c[1][0] === 2), 'lastRow=' + lastRow);
  }
});
const gasEntry = (p, params) => {
  const calls = [];
  const fakes = {
    PropertiesService: props(p),
    LockService: { getScriptLock: () => ({ waitLock: () => calls.push('waitLock'), releaseLock: () => calls.push('releaseLock') }) },
    ContentService: { MimeType: { TEXT: 'text' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) }
  };
  const out = withGas(fakes, () => handleRequest_({ parameter: params }));
  return { calls, text: out.text };
};
test('handleRequest_は合言葉を確かめてからロックを取る', () => {
  let r = gasEntry({ INGEST_TOKEN: 't0k3n' }, { token: 'x', samples: '2026-11-04T07:12,71.6' });
  assert.equal(r.text, 'ERROR: 合言葉が違います'); assert.deepEqual(r.calls, []);
  r = gasEntry({ INGEST_TOKEN: 't0k3n' }, { samples: '2026-11-04T07:12,71.6' });
  assert.equal(r.text, 'ERROR: 合言葉が違います'); assert.deepEqual(r.calls, []);
  r = gasEntry({}, { token: 't0k3n', samples: '2026-11-04T07:12,71.6' });
  assert.equal(r.text, 'ERROR: 合言葉が設定されていません'); assert.deepEqual(r.calls, []);
  r = gasEntry({ INGEST_TOKEN: 't0k3n' }, { token: 't0k3n', samples: 'bad' });   // 合言葉が合えばロックの中で ingest が動く
  assert.equal(r.text, 'ERROR: 有効な測定がありません'); assert.deepEqual(r.calls, ['waitLock', 'releaseLock']);
});
