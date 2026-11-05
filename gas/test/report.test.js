const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
const { LOG, SETTINGS } = require('./fixtures.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} ≉ ${b}`);
test('11/4の指標', () => {
  const r = M.computeReport(LOG, SETTINGS, '2026-11-04');
  assert.deepEqual([r.latest.date, r.latest.kg, r.isToday, r.daysLeft, r.status, r.missing], ['2026-11-04', 71.6, true, 31, '順調', ['2026-11-02']]);
  close(r.dayDiff, 0.3); close(r.avg7, 71.48333); close(r.weekDiff, -0.87381); close(r.target, 71.64118); close(r.gap, -0.15784);
  close(r.pace1, -0.87381); close(r.pace4, -0.68056); close(r.worsePace, -0.68056); close(r.forecast, 68.46944);
  close(r.needPace, -0.33495); close(r.progress, 0.49057); close(r.startTarget, 72.91176);
  assert.equal(r.series.length, 56); assert.equal(r.series[22].kg, null); assert.equal(r.series[25].avg7, null);
  close(r.series[24].avg7, 71.48333);
  assert.deepEqual([r.forecastLine.fromDate, r.forecastLine.toDate], ['2026-11-04', '2026-12-05']);
});
test('測る前に開いた日（11/5）', () => {
  const r = M.computeReport(LOG, SETTINGS, '2026-11-05');
  assert.deepEqual([r.latest.date, r.isToday, r.daysLeft, r.missing], ['2026-11-04', false, 30, ['2026-11-02', '2026-11-05']]);
  close(r.dayDiff, 0.3); close(r.avg7, 71.48); close(r.forecast, 68.69136);
});
test('7日平均は4日以上から', () => { assert.equal(M.avg7(LOG, '2026-10-13'), null); close(M.avg7(LOG, '2026-10-14'), 73.525); });
test('目標ライン：チェックポイント0件・複数件・前への延長', () => {
  close(M.targetAt({ ...SETTINGS, checkpoints: [] }, LOG, '2026-11-04'), 72.14182);
  const two = { ...SETTINGS, checkpoints: [{ date: '2026-11-01', kg: 71.8 }, { date: '2026-11-15', kg: 71.0 }] };
  close(M.targetAt(two, LOG, '2026-11-08'), 71.4); close(M.targetAt(two, LOG, '2026-10-25'), 72.2); close(M.targetAt(two, LOG, '2026-11-25'), 70.5);
  assert.equal(M.targetAt({ ...SETTINGS, checkpoints: [] }, [], '2026-11-04'), null);
});
test('目標日当日は予測と必要ペースなし', () => {
  const r = M.computeReport(LOG, SETTINGS, '2026-12-05');
  assert.deepEqual([r.daysLeft, r.forecast, r.needPace], [0, null, null]);
});
test('進捗は0〜1に収める', () => {
  assert.equal(M.computeReport(LOG, { ...SETTINGS, goalKg: 71.5, checkpoints: [] }, '2026-11-04').progress, 1);
  assert.equal(M.computeReport(LOG, { ...SETTINGS, goalKg: 69, checkpoints: [{ date: '2026-11-01', kg: 70 }] }, '2026-11-04').progress, 0);
});
test('記録なし', () => {
  const r = M.computeReport([], SETTINGS, '2026-11-04');
  assert.deepEqual([r.latest, r.avg7, r.status, r.forecastLine, r.series.length], [null, null, null, null, 56]);
});
