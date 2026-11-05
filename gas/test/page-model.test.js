const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
const { LOG, SETTINGS } = require('./fixtures.js');
test('11/4のPageModel', () => {
  const m = M.buildPageModel(M.computeReport(LOG, SETTINGS, '2026-11-04'), SETTINGS, 'https://example.invalid/sheet');
  assert.deepEqual(m.header, { measured: '11/4 水　07:12 計測', tMinus: 31 });
  assert.deepEqual(m.hero, { kg: '71.6', dayDiff: '▲0.3', dayDiffTone: 'up', gapText: '−0.2kg', status: '順調', gaugePos: 42 });
  assert.deepEqual(m.readouts, { avg7: '71.5', weekDiff: '前週差 −0.9kg', forecast: '68.5', worse: '遅い方のペース −0.68/週',
    need: '−0.33', needSub: '残り31日で 1.5kg', progressPct: 49, progressSub: '72.9 → 70.0' });
  assert.equal(m.missingNote, '11/2は未測定。7日平均は測った日だけで計算しています。');
  assert.deepEqual([m.chart.dates.length, m.chart.todayIndex, m.chart.goal, m.chart.checkpoints], [56, 24, { index: 55, kg: 70 }, [{ index: 21, kg: 71.8 }]]);
});
test('測る前（11/5）は直近の測定日時と今日の未測定', () => {
  const m = M.buildPageModel(M.computeReport(LOG, SETTINGS, '2026-11-05'), SETTINGS, '');
  assert.equal(m.header.measured, '11/4 水　07:12 計測'); assert.equal(m.missingNote, '11/2・11/5は未測定。7日平均は測った日だけで計算しています。');
});
test('7日平均がない週は「—」', () => {
  const m = M.buildPageModel(M.computeReport(LOG.slice(-2), SETTINGS, '2026-11-04'), SETTINGS, '');
  assert.deepEqual([m.state, m.hero.gapText, m.hero.status, m.hero.gaugePos, m.readouts.avg7, m.readouts.forecast, m.readouts.need, m.readouts.progressPct],
    ['ok', '—', null, null, '—', '—', '—', null]);
});
test('記録なし', () => assert.equal(M.buildPageModel(M.computeReport([], SETTINGS, '2026-11-04'), SETTINGS, '').state, 'empty'));
test('safeJson', () => assert.equal(M.safeJson({ a: '</script>' }), '{"a":"\\u003c/script>"}'));
test('dashboardの設定ファイル', () => {
  const j = require('../dashboard/appsscript.json');
  assert.deepEqual([j.timeZone, j.webapp.executeAs, j.webapp.access], ['Asia/Tokyo', 'USER_DEPLOYING', 'MYSELF']);
});
