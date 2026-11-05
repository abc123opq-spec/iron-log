const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
const { LOG, SETTINGS } = require('./fixtures.js');
test('符号つきの書式', () => {
  assert.equal(M.fmtSigned(-0.04, 1), '±0.0'); assert.equal(M.fmtSigned(-0.15784, 1), '−0.2');
  assert.equal(M.fmtSigned(0.66, 1), '+0.7'); assert.equal(M.fmtSigned(-0.68056, 2), '−0.68');
  assert.equal(M.fmtDayDiff(0.3), '▲0.3'); assert.equal(M.fmtDayDiff(-0.4), '▼0.4'); assert.equal(M.fmtDayDiff(0.02), '±0.0');
  assert.equal(M.fmt1(71.48333), '71.5'); assert.equal(M.md('2026-11-04'), '11/4'); assert.equal(M.weekdayJa('2026-11-04'), '水');
});
test('丸めて0なら ±、負の0は出さない', () => {
  assert.equal(M.fmtSigned(0, 1), '±0.0'); assert.equal(M.fmtSigned(0.04, 2), '+0.04'); assert.equal(M.fmtSigned(-0.004, 2), '±0.00');
  assert.equal(M.fmt1(-0.04), '0.0'); assert.equal(M.fmt1(-0.05), '−0.1'); assert.equal(M.fmtDayDiff(-0.04), '±0.0');
  assert.equal(M.md('2026-01-09'), '1/9'); assert.equal(M.weekdayJa('2026-11-01'), '日'); assert.equal(M.weekdayJa('2026-11-07'), '土');
});
test('通知の要約', () => {
  assert.equal(M.formatSummary(M.computeReport(LOG, SETTINGS, '2026-11-04')), '71.6kg ▲0.3｜目標ライン −0.2 順調｜予測 68.5（T−31）');
  assert.equal(M.formatSummary(M.computeReport(LOG, SETTINGS, '2026-11-05')), '11/4 71.6kg ▲0.3｜目標ライン −0.1 順調｜予測 68.7（T−30）');
  assert.equal(M.formatSummary(M.computeReport([], SETTINGS, '2026-11-04')), 'まだ記録がありません');
});
test('7日平均がない日は体重と前日比だけ', () =>
  assert.equal(M.formatSummary(M.computeReport(LOG.slice(-2), SETTINGS, '2026-11-04')), '71.6kg ▲0.3'));
test('記録が1件なら前日比も省く', () =>
  assert.equal(M.formatSummary(M.computeReport(LOG.slice(-1), SETTINGS, '2026-11-04')), '71.6kg'));
