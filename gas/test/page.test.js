const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
const { LOG, SETTINGS } = require('./fixtures.js');
const { openPage, shot } = require('./render.js');

let hasPlaywright = true;
try { require('playwright'); } catch (e) { hasPlaywright = false; }
const run = hasPlaywright ? test : test.skip;

const MODEL_1104 = M.buildPageModel(M.computeReport(LOG, SETTINGS, '2026-11-04'), SETTINGS, 'https://example.invalid/sheet');
run('通常の画面', async () => {
  const { browser, page, errors, requests } = await openPage(MODEL_1104);
  assert.equal(await page.textContent('#hero-kg'), '71.6');
  assert.equal(await page.textContent('#status'), '順調');
  assert.equal(await page.getAttribute('#day-diff', 'data-tone'), 'up');
  assert.equal(await page.$eval('#gauge-marker', el => el.style.left), '42%');
  for (const [id, v] of [['#avg7', '71.5'], ['#forecast', '68.5'], ['#need', '−0.33'], ['#progress', '49'], ['#t-minus', '31']])
    assert.equal(await page.textContent(id), v);
  assert.equal(await page.textContent('#missing'), '11/2は未測定。7日平均は測った日だけで計算しています。');
  assert.deepEqual(errors, []); assert.equal(requests.length, 1);   // 外部のファイルを読み込まない
  await shot(page, 'ok'); await browser.close();
});
run('記録なしの画面', async () => {
  const { browser, page } = await openPage(M.buildPageModel(M.computeReport([], SETTINGS, '2026-11-04'), SETTINGS, ''));
  assert.equal(await page.textContent('#empty'), 'まだ記録がありません。オムロン コネクトで測ってアプリを閉じると、ここに表示されます。');
  await shot(page, 'empty'); await browser.close();
});
run('エラーの画面', async () => {
  const { browser, page } = await openPage({ state: 'error', message: '設定シートに目標日がありません' });
  const t = await page.textContent('#error');
  for (const s of ['表示できませんでした', '設定シートに目標日がありません', '直し方：スプレッドシートの「設定」または「体重ログ」シートを直してから、このページを開き直してください。']) assert.ok(t.includes(s));
  await shot(page, 'error'); await browser.close();
});
run('描画中の例外はエラー画面にする（真っ黒にしない）', async () => {
  const { browser, page, errors } = await openPage({ state: 'ok', hero: null });   // hero.kg で TypeError
  try {
    assert.equal(await page.isVisible('#error'), true, 'エラー画面が見える');
    const t = await page.textContent('#error');
    assert.ok(t.includes('表示できませんでした')); assert.ok(t.includes('直し方：'));
    assert.ok((await page.textContent('#error-message')).length > 0);
    assert.equal(await page.isVisible('#view-ok'), false); assert.equal(await page.isVisible('#empty'), false);
    assert.ok(errors.length >= 1, 'console.error に記録される');   // わざと例外を起こしているので errors は空にならない
    await shot(page, 'render-error');
  } finally { await browser.close(); }
});
run('要注意の画面', async () => {
  const s2 = { ...SETTINGS, checkpoints: [{ date: '2026-11-01', kg: 71.0 }] };
  const { browser, page } = await openPage(M.buildPageModel(M.computeReport(LOG, s2, '2026-11-04'), s2, ''));
  assert.equal(await page.textContent('#status'), '要注意'); assert.equal(await page.getAttribute('#status', 'data-tone'), 'caution');
  await shot(page, 'caution'); await browser.close();
});
