const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../shared/Metrics.js');
const { LOG, SETTINGS } = require('./fixtures.js');
const { openPage, shot } = require('./render.js');

let hasPlaywright = true;
try { require('playwright'); } catch (e) { hasPlaywright = false; }
const run = hasPlaywright ? test : test.skip;

/** 線を描く動きが終わるまで待つ（スクリーンショット用） */
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished)).then(() => undefined));

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
  await settled(page); await shot(page, 'ok'); await browser.close();   // 線を描く動きが終わってから撮る
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
  await settled(page); await shot(page, 'caution'); await browser.close();
});

// ---- Task 7: グラフ ----
run('グラフの要素', async () => {
  const { browser, page } = await openPage(MODEL_1104);
  const n = r => page.locator(`#chart [data-role="${r}"]`).count();
  assert.equal(await n('weight-dot'), 24); assert.equal(await n('checkpoint'), 1);
  for (const r of ['avg7', 'target', 'forecast', 'goal', 'today']) assert.equal(await n(r), 1);
  assert.equal(await page.textContent('#chart [data-role="today-label"]'), '71.5');
  assert.equal(await page.textContent('#chart [data-role="goal-label"]'), '着地 70.0');
  assert.equal(await page.textContent('#chart [data-role="forecast-label"]'), '予測 68.5');
  assert.deepEqual(await page.locator('#chart [data-role="y-tick"]').allTextContents(), ['68.0','69.0','70.0','71.0','72.0','73.0','74.0']);
  assert.deepEqual(await page.locator('#chart [data-role="x-tick"]').allTextContents(), ['10/11','10/29','11/17','12/5']);
  assert.notEqual(await page.getAttribute('#chart [data-role="target"]', 'stroke-dasharray'), null);
  assert.deepEqual(await page.locator('#chart [data-role="legend-item"]').allTextContents(), ['体重', '7日平均', '目標ライン', '予測']);
  await browser.close();
});
run('なぞると、その日の値が出る', async () => {
  const { browser, page } = await openPage(MODEL_1104);
  const box = await page.locator('#chart').boundingBox();
  const x = await page.$eval('#chart', svg => svg.__xOf(24));           // drawChartが公開する、日付番号→画面上のx座標の関数
  await page.mouse.move(box.x + x, box.y + box.height / 2);
  const t = await page.textContent('#tooltip');
  assert.match(t, /11\/4/); assert.match(t, /体重 71\.6/); assert.match(t, /7日平均 71\.5/); assert.match(t, /目標 71\.6/);
  await settled(page); await shot(page, 'chart-scrub'); await browser.close();
});
run('動きを減らす設定では線を描く動きをしない', async () => {
  const { browser, page } = await openPage(MODEL_1104, { reducedMotion: 'reduce' });
  assert.equal(await page.$eval('#chart [data-role="avg7"]', el => getComputedStyle(el).animationName), 'none');
  await browser.close();
});
