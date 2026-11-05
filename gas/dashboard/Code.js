// Code.js（②dashboard）— 体重ログと設定を読み、計器盤ページ（Page.html）を返す
// Apps Script では Metrics.js と同じプロジェクトに置く（グローバルを共有する）。
// Node のテストでは、下の shim で Metrics.js の関数を globalThis に載せる。
if (typeof require === 'function' && typeof module !== 'undefined') { Object.assign(globalThis, require('../shared/Metrics.js')); }

var SHEET_LOG_ = '体重ログ';
var SHEET_SETTINGS_ = '設定';
var PAGE_TITLE_ = '体重ダッシュボード';
var VIEWPORT_ = 'width=device-width, initial-scale=1, viewport-fit=cover';

// ---- 処理の本体（Apps Script に依存しない） ---------------------------------

/**
 * ページに埋め込む PageModel を作る。
 * deps: { now: Date, loadLog: () => Log, loadSettings: () => Settings, sheetUrl: () => string }
 * 例外が起きたら console.error に記録し、{ state: 'error', message } を返す。
 */
function dashboardModel(deps) {
  try {
    var log = deps.loadLog();
    var settings = deps.loadSettings();
    var report = computeReport(log, settings, toYmd(deps.now));
    return buildPageModel(report, settings, deps.sheetUrl());
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error(err);
    return { state: 'error', message: err && err.message !== undefined ? err.message : String(err) };
  }
}

// ---- Apps Script の入口 ------------------------------------------------------

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Page');
  template.dataJson = safeJson(dashboardModel(gasDeps_()));
  return template.evaluate()
    .setTitle(PAGE_TITLE_)
    .addMetaTag('viewport', VIEWPORT_);
}

/** スクリプトプロパティとスプレッドシートにつなぐ deps を作る */
function gasDeps_() {
  return {
    now: new Date(),
    loadLog: function () { return loadLog_(); },
    loadSettings: function () { return loadSettings_(); },
    sheetUrl: function () { return openSpreadsheet_().getUrl(); }
  };
}

/** SHEET_ID のスプレッドシートを開く（必要になったときだけ呼ぶ） */
function openSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('スクリプトプロパティ SHEET_ID がありません');
  return SpreadsheetApp.openById(id);
}

function openSheet_(name) {
  var sheet = openSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('シート「' + name + '」が見つかりません');
  return sheet;
}

function loadLog_() {
  return parseLogValues(openSheet_(SHEET_LOG_).getDataRange().getValues());
}

function loadSettings_() {
  return parseSettingsValues(openSheet_(SHEET_SETTINGS_).getDataRange().getValues());
}

// ---- 手動テスト（Apps Script エディタから実行） ----------------------------------

/** 本物のシートを読み、ページに埋め込む PageModel をログに出す */
function testDashboard() {
  console.log(JSON.stringify(dashboardModel(gasDeps_()), null, 2));
}

if (typeof module !== 'undefined') module.exports = { dashboardModel };
