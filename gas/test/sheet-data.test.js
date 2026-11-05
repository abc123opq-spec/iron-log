const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
test('toYmdは日本時間の日付を返す', () => {
  assert.equal(M.toYmd(new Date('2026-11-04T15:30:00Z')), '2026-11-05');
  assert.equal(M.toYmd('2026-11-04'), '2026-11-04');
});
test('toHmは日付型の時刻セルと1桁の時を読む', () => {
  assert.equal(M.toHm(new Date('1899-12-30T07:12:00+09:00')), '07:12');
  assert.equal(M.toHm('7:05'), '07:05');
});
test('toYmdHms', () => assert.equal(M.toYmdHms(new Date('2026-11-04T07:13:05+09:00')), '2026-11-04 07:13:05'));
test('addDaysとdaysBetween', () => {
  assert.equal(M.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(M.daysBetween('2026-11-04', '2026-12-05'), 31);
});
test('parseLogValuesは見出し・空行を飛ばし、日付型も読み、日付順に並べる', () => {
  const v = [['日付','体重kg','測定時刻','受信日時'],
    ['2026-11-04', 71.6, '07:12', '2026-11-04 07:13:05'],
    [new Date('2026-11-03T00:00:00+09:00'), 71.3, new Date('1899-12-30T06:50:00+09:00'), ''],
    ['', null, '', '']];
  assert.deepEqual(M.parseLogValues(v), [
    { date: '2026-11-03', kg: 71.3, time: '06:50', received: '' },
    { date: '2026-11-04', kg: 71.6, time: '07:12', received: '2026-11-04 07:13:05' }]);
});
const SET = [['目標日','2026-12-05'],['目標体重',70],['開始日',new Date('2026-10-11T00:00:00+09:00')],['チェックポイント','2026-11-01',71.8]];
test('parseSettingsValues', () => assert.deepEqual(M.parseSettingsValues(SET),
  { goalDate: '2026-12-05', goalKg: 70, startDate: '2026-10-11', checkpoints: [{ date: '2026-11-01', kg: 71.8 }] }));
test('設定の不足と誤りはエラーにする', () => {
  assert.throws(() => M.parseSettingsValues(SET.slice(1)), /設定シートに目標日がありません/);
  assert.throws(() => M.parseSettingsValues([...SET.slice(0,3), ['チェックポイント','2026-12-05',70.5]]), /チェックポイントは目標日より前の日付にしてください（4行目）/);
  assert.throws(() => M.parseSettingsValues([...SET.slice(0,3), ['チェックポイント','2026-11-01','abc']]), /設定シートのチェックポイントの形式が違います（4行目）/);
});
// 最終レビュー(7)：開始日が目標日と同じか、あとならエラー
test('開始日は目標日より前でないとエラー', () => {
  assert.throws(() => M.parseSettingsValues([['目標日','2026-12-05'],['目標体重',70],['開始日','2026-12-05']]), /開始日は目標日より前の日付にしてください（3行目）/);
  assert.throws(() => M.parseSettingsValues([['目標日','2026-12-05'],['目標体重',70],['開始日','2026-12-06']]), /開始日は目標日より前の日付にしてください（3行目）/);
  assert.doesNotThrow(() => M.parseSettingsValues([['目標日','2026-12-05'],['目標体重',70],['開始日','2026-12-04']]));
});
