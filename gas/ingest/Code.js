// Code.js（①ingest）— iPhoneショートカットから測定を受け取り、体重ログに書いて要約を返す
// Apps Script では Metrics.js と同じプロジェクトに置く（グローバルを共有する）。
// Node のテストでは、下の shim で Metrics.js の関数を globalThis に載せる。
if (typeof require === 'function' && typeof module !== 'undefined') { Object.assign(globalThis, require('../shared/Metrics.js')); }

var SHEET_LOG_ = '体重ログ';
var SHEET_SETTINGS_ = '設定';
var LOG_HEADER_ = ['日付', '体重kg', '測定時刻', '受信日時'];
var LOCK_WAIT_MS_ = 10000;

// ---- 処理の本体（Apps Script に依存しない） ---------------------------------

/**
 * 受け取りの処理。
 * params: { token?: string, samples?: string }（e.parameter）
 * deps:   { expectedToken: string, now: Date, loadLog: () => Log, saveLog: (log) => void, loadSettings: () => Settings }
 * 返り値: 要約1行、または 'ERROR: …'
 */
function ingest(params, deps) {
  var p = params || {};
  try {
    if (!deps.expectedToken) return 'ERROR: 合言葉が設定されていません';
    if (p.token !== deps.expectedToken) return 'ERROR: 合言葉が違います';

    var parsed = parseSamples(p.samples || '', deps.now);
    if (parsed.rows.length === 0) return 'ERROR: 有効な測定がありません';

    var merged = mergeDaily(deps.loadLog(), parsed.rows, toYmdHms(deps.now));
    if (merged.changed.length > 0) deps.saveLog(merged.log);

    var settings = deps.loadSettings();
    return formatSummary(computeReport(merged.log, settings, toYmd(deps.now)));
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error(err);
    return 'ERROR: ' + (err && err.message !== undefined ? err.message : String(err));
  }
}

// ---- Apps Script の入口 ------------------------------------------------------

function doPost(e) {
  return handleRequest_(e);
}

function doGet(e) {
  return handleRequest_(e);
}

/**
 * ロックの中で ingest を実行し、結果を文字として返す。
 * 合言葉はロックを取る前に確かめる（合言葉の違う要求がロックを占めないように）。ingest の中でも同じ確認をする。
 */
function handleRequest_(e) {
  var text;
  var lock = null;
  try {
    var params = (e && e.parameter) || {};
    var deps = gasDeps_();
    if (!deps.expectedToken) {
      text = 'ERROR: 合言葉が設定されていません';
    } else if (params.token !== deps.expectedToken) {
      text = 'ERROR: 合言葉が違います';
    } else {
      lock = LockService.getScriptLock();
      lock.waitLock(LOCK_WAIT_MS_);
      text = ingest(params, deps);
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error(err);
    text = 'ERROR: ' + (err && err.message !== undefined ? err.message : String(err));
  } finally {
    if (lock) lock.releaseLock();
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

/** スクリプトプロパティとスプレッドシートにつなぐ deps を作る */
function gasDeps_() {
  var props = PropertiesService.getScriptProperties();
  return {
    expectedToken: props.getProperty('INGEST_TOKEN') || '',
    now: new Date(),
    loadLog: function () { return loadLog_(); },
    saveLog: function (log) { saveLog_(log); },
    loadSettings: function () { return loadSettings_(); }
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

/**
 * 体重ログを全行書き直す。1行目は見出し、2行目から日付順のデータ。
 * 日付・測定時刻・受信日時の列は書式を文字列（'@'）にしてから書く（日付に変換されないように）。体重は数値のまま。
 * 先に新しい行を書き、そのあとで余った古い行だけを消す（書き込みが途中で失敗しても、ログが見出しだけにならないように）。
 */
function saveLog_(log) {
  var sheet = openSheet_(SHEET_LOG_);
  var n = log.length;
  sheet.getRange(1, 1, 1, LOG_HEADER_.length).setValues([LOG_HEADER_]);
  if (n > 0) {
    sheet.getRange(2, 1, n, 1).setNumberFormat('@');   // A 日付
    sheet.getRange(2, 3, n, 2).setNumberFormat('@');   // C 測定時刻・D 受信日時
    var values = [];
    for (var i = 0; i < n; i++) {
      values.push([log[i].date, log[i].kg, log[i].time, log[i].received]);
    }
    sheet.getRange(2, 1, n, LOG_HEADER_.length).setValues(values);
  }
  var lastRow = sheet.getLastRow();
  if (lastRow > n + 1) sheet.getRange(n + 2, 1, lastRow - n - 1, LOG_HEADER_.length).clearContent();
}

// ---- 手動テスト（Apps Script エディタから実行。シートには書かない） --------------

/**
 * 本物のシートを読み、体重ログの最後の行を1行の測定として ingest に通す。
 * saveLog は件数を console.log するだけの関数に差し替えるので、シートは変わらない。
 */
function testIngest() {
  var deps = gasDeps_();
  var log = deps.loadLog();
  if (log.length === 0) {
    console.log('体重ログに行がないので、試す測定がありません');
    return;
  }
  var last = log[log.length - 1];
  var samples = last.date + 'T' + (last.time || '07:00') + ',' + last.kg;
  deps.saveLog = function (l) { console.log('saveLog（書き込みは省略）: ' + l.length + '行'); };
  console.log('samples: ' + samples);
  console.log(ingest({ token: deps.expectedToken, samples: samples }, deps));
}

if (typeof module !== 'undefined') module.exports = { ingest, handleRequest_, saveLog_ };
