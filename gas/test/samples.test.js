const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
const NOW = new Date('2026-11-04T23:00:00+09:00');
test('parseSamplesは検証し、1日いちばん早い測定を選ぶ', () => {
  const text = ['2026-11-04T07:12,71.6', '2026-11-04T21:00:00+09:00,72.4', '2026-11-03T06:50,71.3',
    'bad line', '2026-11-04T07:30,250', '2026-11-05T09:00,71.0', '2026-08-01T07:00,75.0'].join('\n');
  assert.deepEqual(M.parseSamples(text, NOW), { rows: [
    { date: '2026-11-03', time: '06:50', kg: 71.3 }, { date: '2026-11-04', time: '07:12', kg: 71.6 }], rejected: 4 });
});
test('時差つきの時刻は日本時間に直す', () =>
  assert.deepEqual(M.parseSamples('2026-11-03T22:30:00Z,71.5', NOW).rows, [{ date: '2026-11-04', time: '07:30', kg: 71.5 }]));
test('101行目以降は読まない', () => {
  const lines = Array.from({ length: 100 }, () => '2026-11-03T07:00,71.0'); lines.push('2026-11-04T07:00,71.6');
  assert.deepEqual(M.parseSamples(lines.join('\n'), NOW).rows.map(r => r.date), ['2026-11-03']);
});
test('mergeDailyは早い時刻なら上書き、遅ければ残す、新しい日は追加', () => {
  const log = [{ date: '2026-11-03', kg: 71.4, time: '07:00', received: 'r0' }, { date: '2026-11-04', kg: 71.9, time: '06:30', received: 'r0' }];
  const r = M.mergeDaily(log, [{ date: '2026-11-02', time: '07:00', kg: 71.2 }, { date: '2026-11-03', time: '06:50', kg: 71.3 },
    { date: '2026-11-04', time: '07:12', kg: 71.6 }], 'r1');
  assert.deepEqual(r.changed, ['2026-11-02', '2026-11-03']);
  assert.deepEqual(r.log.map(x => [x.date, x.kg, x.time, x.received]),
    [['2026-11-02', 71.2, '07:00', 'r1'], ['2026-11-03', 71.3, '06:50', 'r1'], ['2026-11-04', 71.9, '06:30', 'r0']]);
});
test('同じデータを2回送っても変わらない', () => {
  const rows = [{ date: '2026-11-04', time: '07:12', kg: 71.6 }];
  const first = M.mergeDaily([], rows, 'r1');
  assert.deepEqual(M.mergeDaily(first.log, rows, 'r2'), { log: first.log, changed: [] });
});
test('同じ時刻で体重だけ違えば上書きし、入力のlogは変えない', () => {
  const log = [{ date: '2026-11-04', kg: 71.9, time: '07:12', received: 'r0' }];
  const copy = JSON.parse(JSON.stringify(log));
  const r = M.mergeDaily(log, [{ date: '2026-11-04', time: '07:12', kg: 71.6 }], 'r1');
  assert.deepEqual(r.changed, ['2026-11-04']);
  assert.deepEqual(r.log, [{ date: '2026-11-04', kg: 71.6, time: '07:12', received: 'r1' }]);
  assert.deepEqual(log, copy);
});
test('空行は数えず、秒や時差の省略とCRLFを受け付ける', () => {
  const r = M.parseSamples('\r\n2026-11-04T07:12:30,71.6\r\n\r\n2026-11-03T07:00:00+09:00, 71.3 \r\n', NOW);
  assert.deepEqual(r, { rows: [{ date: '2026-11-03', time: '07:00', kg: 71.3 }, { date: '2026-11-04', time: '07:12', kg: 71.6 }], rejected: 0 });
});
test('境界：30と200は受け付け、1時間先ちょうどと60日前ちょうども受け付ける', () => {
  const r = M.parseSamples(['2026-11-04T23:59,30', '2026-11-05T00:00,200', '2026-09-05T23:00,70', '2026-09-05T22:59,70', '2026-11-05T00:01,70'].join('\n'), NOW);
  assert.equal(r.rejected, 2);
  assert.deepEqual(r.rows.map(x => [x.date, x.time, x.kg]), [['2026-09-05', '23:00', 70], ['2026-11-04', '23:59', 30], ['2026-11-05', '00:00', 200]]);
});
// 最終レビュー(2)：ショートカットの「値」が `71.6 kg` のように単位つきになっても読む。kg 以外の単位や 16進・指数は読まない
test('体重の後ろの kg（空白・NBSP・細い空白つき）は受け付ける', () => {
  const lines = ['2026-11-04T07:12,71.6 kg', '2026-11-04T07:12,71.6kg', '2026-11-04T07:12,71.6 kg', '2026-11-04T07:12,71.6 kg', '2026-11-04T07:12,71.6 KG'];
  for (const line of lines) assert.deepEqual(M.parseSamples(line, NOW), { rows: [{ date: '2026-11-04', time: '07:12', kg: 71.6 }], rejected: 0 }, JSON.stringify(line));
});
test('kg 以外の単位、16進、指数は捨てる', () => {
  for (const line of ['2026-11-04T07:12,158 lb', '2026-11-04T07:12,0x46', '2026-11-04T07:12,7e1', '2026-11-04T07:12,71.6 kgs', '2026-11-04T07:12,kg'])
    assert.deepEqual(M.parseSamples(line, NOW), { rows: [], rejected: 1 }, JSON.stringify(line));
});
