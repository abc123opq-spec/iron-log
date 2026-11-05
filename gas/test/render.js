// render.js — テスト用の補助。Page.html にモデルを埋め込んで Chromium（iPhone 相当の画面）で開く。
// テストではない（node --test の対象は *.test.js だけ）。
const fs = require('fs');
const path = require('path');
const { safeJson } = require('../shared/Metrics.js');

const PAGE = path.resolve(__dirname, '../dashboard/Page.html');
const OUT = path.resolve(__dirname, 'out');
const SCRIPTLET = '<?!= dataJson ?>';
const VIEWPORT = { width: 393, height: 852 };

/** Page.html の唯一のスクリプトレットを safeJson(model) に置き換えた HTML を out/ に書き、そのパスを返す */
function renderToFile(model, name) {
  const src = fs.readFileSync(PAGE, 'utf8');
  const count = src.split(SCRIPTLET).length - 1;
  if (count !== 1) throw new Error(`Page.html の ${SCRIPTLET} は1か所のはず（${count}か所）`);
  if (/<\?[!=]?/.test(src.replace(SCRIPTLET, ''))) throw new Error('Page.html に別のスクリプトレットがあります');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.html`);
  fs.writeFileSync(file, src.replace(SCRIPTLET, safeJson(model)));
  return file;
}

/**
 * モデルを埋め込んだページを開く。
 * 返り値: { browser, page, errors: console のエラーと pageerror, requests: すべての request の URL }
 */
async function openPage(model, { reducedMotion } = {}) {
  const { chromium } = require('playwright');
  const file = renderToFile(model, 'page');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, ...(reducedMotion ? { reducedMotion } : {}) });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(String(err && err.message !== undefined ? err.message : err)));
  page.on('request', req => requests.push(req.url()));
  await page.goto('file://' + file);
  return { browser, page, errors, requests };
}

/** ページ全体の PNG を out/<name>.png に保存する */
async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

module.exports = { openPage, shot, renderToFile, OUT };
