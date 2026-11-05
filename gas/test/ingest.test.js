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
