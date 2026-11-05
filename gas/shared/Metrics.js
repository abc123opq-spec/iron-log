// Metrics.js — 計算と値の読み取り（Apps ScriptとNode.jsの両方で動く）
// ES モジュールにしない。最後の module.exports のガードでテストから読み込む。

var TZ = 'Asia/Tokyo';
var MS_PER_DAY = 86400000;

// ---- 日付・時刻の文字列化 -------------------------------------------------

/** Date を日本時間の各部（文字列）に分解する */
function jstParts(d) {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  var out = {};
  for (var i = 0; i < parts.length; i++) out[parts[i].type] = parts[i].value;
  return out;
}

function isValidDate(v) {
  return v instanceof Date && !isNaN(v.getTime());
}

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Date または文字列を yyyy-MM-dd（日本時間）にする。読めなければ '' */
function toYmd(v) {
  if (isValidDate(v)) {
    var p = jstParts(v);
    return p.year + '-' + p.month + '-' + p.day;
  }
  if (typeof v === 'string') {
    var m = v.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
  }
  return '';
}

/** Date（時刻だけのセルは 1899-12-30 の Date）または文字列を HH:mm にする。読めなければ '' */
function toHm(v) {
  if (isValidDate(v)) {
    var p = jstParts(v);
    return p.hour + ':' + p.minute;
  }
  if (typeof v === 'string') {
    var m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return pad2(Number(m[1])) + ':' + m[2];
  }
  return '';
}

/** Date を yyyy-MM-dd HH:mm:ss（日本時間）にする */
function toYmdHms(d) {
  var p = jstParts(d);
  return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ':' + p.second;
}

// ---- 日付どうしの計算（yyyy-MM-dd を Date.UTC に直して行う） ----------------

function ymdToUtc(ymd) {
  var m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('日付の形式が違います: ' + ymd);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function utcToYmd(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/** yyyy-MM-dd に n 日足す（負も可） */
function addDays(ymd, n) {
  return utcToYmd(ymdToUtc(ymd) + n * MS_PER_DAY);
}

/** b − a の日数 */
function daysBetween(a, b) {
  return Math.round((ymdToUtc(b) - ymdToUtc(a)) / MS_PER_DAY);
}

// ---- シートの値の読み取り ------------------------------------------------

/** 数値セル（数値または数字の文字列）を数値にする。読めなければ NaN */
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

function isBlankRow(row) {
  for (var i = 0; i < row.length; i++) if (!isBlank(row[i])) return false;
  return true;
}

/**
 * 「体重ログ」シートの値（getValues() の結果）を読む。
 * 見出し行と空行は飛ばし、日付順に並べて返す。
 * 返り値: [{ date: 'yyyy-MM-dd', kg: number, time: 'HH:mm', received: 'yyyy-MM-dd HH:mm:ss' }, ...]
 */
function parseLogValues(values) {
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i] || [];
    if (isBlankRow(row)) continue;
    if (String(row[0]).trim() === '日付') continue; // 見出し行
    var date = toYmd(row[0]);
    var kg = toNumber(row[1]);
    if (date === '' || !isFinite(kg)) {
      throw new Error('体重ログの形式が違います（' + (i + 1) + '行目）');
    }
    var received = row[3];
    rows.push({
      date: date,
      kg: kg,
      time: toHm(row[2]),
      received: isValidDate(received) ? toYmdHms(received) : (isBlank(received) ? '' : String(received).trim())
    });
  }
  rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return rows;
}

/**
 * 「設定」シートの値（getValues() の結果）を読む。
 * 行は [項目名, 値, 値2]。項目名は 目標日・目標体重・開始日・チェックポイント。
 * 知らない項目名と空行は無視する。行番号は1から数える。
 * 返り値: { goalDate, goalKg, startDate, checkpoints: [{ date, kg }, ...]（日付順） }
 */
function parseSettingsValues(values) {
  var goalDate = '', goalKg = NaN, startDate = '';
  var checkpoints = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i] || [];
    var rowNo = i + 1;
    var label = isBlank(row[0]) ? '' : String(row[0]).trim();
    if (label === '目標日') {
      if (isBlank(row[1])) continue;
      goalDate = toYmd(row[1]);
      if (goalDate === '') throw new Error('設定シートの目標日の形式が違います（' + rowNo + '行目）');
    } else if (label === '目標体重') {
      if (isBlank(row[1])) continue;
      goalKg = toNumber(row[1]);
      if (!isFinite(goalKg)) throw new Error('設定シートの目標体重の形式が違います（' + rowNo + '行目）');
    } else if (label === '開始日') {
      if (isBlank(row[1])) continue;
      startDate = toYmd(row[1]);
      if (startDate === '') throw new Error('設定シートの開始日の形式が違います（' + rowNo + '行目）');
    } else if (label === 'チェックポイント') {
      if (isBlank(row[1]) && isBlank(row[2])) continue;
      var cpDate = toYmd(row[1]);
      var cpKg = toNumber(row[2]);
      if (cpDate === '' || !isFinite(cpKg)) {
        throw new Error('設定シートのチェックポイントの形式が違います（' + rowNo + '行目）');
      }
      checkpoints.push({ date: cpDate, kg: cpKg, rowNo: rowNo });
    }
  }
  if (goalDate === '') throw new Error('設定シートに目標日がありません');
  if (!isFinite(goalKg)) throw new Error('設定シートに目標体重がありません');
  if (startDate === '') throw new Error('設定シートに開始日がありません');
  for (var j = 0; j < checkpoints.length; j++) {
    if (checkpoints[j].date >= goalDate) {
      throw new Error('チェックポイントは目標日より前の日付にしてください（' + checkpoints[j].rowNo + '行目）');
    }
  }
  checkpoints.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return {
    goalDate: goalDate,
    goalKg: goalKg,
    startDate: startDate,
    checkpoints: checkpoints.map(function (c) { return { date: c.date, kg: c.kg }; })
  };
}

// ---- 測定行の読み取り（iPhoneショートカットからの本文） -----------------------

var SAMPLE_MAX_LINES = 100;
var SAMPLE_MIN_KG = 30;
var SAMPLE_MAX_KG = 200;
var SAMPLE_FUTURE_MS = 3600000;          // now より1時間を超えて先は捨てる
var SAMPLE_PAST_MS = 60 * MS_PER_DAY;    // now の60日前より前は捨てる

/** 暦として正しい年月日か（2月30日などを弾く） */
function isValidYmd(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1) return false;
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDate() === d;
}

/**
 * 1行（`YYYY-MM-DDTHH:mm[:ss][Z|±HH:MM],体重`）を読む。
 * 時差がなければ +09:00 とみなす。読めなければ null。
 * 返り値: { at: Date, kg: number }
 */
function parseSampleLine(line) {
  var m = line.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?\s*,\s*(\S+)$/);
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var h = Number(m[4]), mi = Number(m[5]), s = m[6] === undefined ? 0 : Number(m[6]);
  if (!isValidYmd(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
  var offset = m[7] === undefined ? '+09:00' : m[7];
  var at = new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + pad2(s) + offset);
  if (!isValidDate(at)) return null;
  var kg = toNumber(m[8]);
  if (!isFinite(kg)) return null;
  return { at: at, kg: kg };
}

/**
 * ショートカットの本文（1行1測定）を読み、1日1件（その日いちばん早い時刻）にまとめる。
 * 捨てる行：形式違い、30未満または200より大きい、now より1時間を超えて先、now の60日前より前。
 * 空行は数えず、空でない行の101行目以降は読まない。
 * 返り値: { rows: [{ date, time, kg }, ...]（日付順）, rejected: 捨てた行数 }
 */
function parseSamples(text, now) {
  var lines = String(text === null || text === undefined ? '' : text).split(/\r?\n/);
  var nowMs = now.getTime();
  var byDate = {};
  var rejected = 0;
  var seen = 0;
  for (var i = 0; i < lines.length && seen < SAMPLE_MAX_LINES; i++) {
    var line = lines[i].trim();
    if (line === '') continue;
    seen++;
    var p = parseSampleLine(line);
    if (p === null || p.kg < SAMPLE_MIN_KG || p.kg > SAMPLE_MAX_KG) { rejected++; continue; }
    var atMs = p.at.getTime();
    if (atMs > nowMs + SAMPLE_FUTURE_MS || atMs < nowMs - SAMPLE_PAST_MS) { rejected++; continue; }
    var sample = { date: toYmd(p.at), time: toHm(p.at), kg: p.kg };
    var cur = byDate[sample.date];
    if (!cur || sample.time < cur.time) byDate[sample.date] = sample;
  }
  var rows = [];
  for (var date in byDate) if (Object.prototype.hasOwnProperty.call(byDate, date)) rows.push(byDate[date]);
  rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return { rows: rows, rejected: rejected };
}

/**
 * 体重ログに測定をまとめて入れる。入力の log は変えない。
 * その日の行がなければ追加。あれば、ログの時刻のほうが遅いときだけ上書き。
 * 同じ時刻で体重だけ違えば上書き、同じなら変えない。
 * 返り値: { log: 日付順の新しい配列, changed: 追加・変更した日付（昇順） }
 */
function mergeDaily(log, rows, received) {
  var byDate = {};
  for (var i = 0; i < log.length; i++) {
    var r = log[i];
    byDate[r.date] = { date: r.date, kg: r.kg, time: r.time, received: r.received };
  }
  var changed = [];
  for (var j = 0; j < rows.length; j++) {
    var s = rows[j];
    var cur = byDate[s.date];
    var replace = !cur || s.time < cur.time || (s.time === cur.time && s.kg !== cur.kg);
    if (!replace) continue;
    byDate[s.date] = { date: s.date, kg: s.kg, time: s.time, received: received };
    if (changed.indexOf(s.date) < 0) changed.push(s.date);
  }
  var out = [];
  for (var date in byDate) if (Object.prototype.hasOwnProperty.call(byDate, date)) out.push(byDate[date]);
  var byYmd = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
  out.sort(function (a, b) { return byYmd(a.date, b.date); });
  changed.sort(byYmd);
  return { log: out, changed: changed };
}

// ---- 指標の計算（仕様書5章） -------------------------------------------------

var AVG7_MIN_DAYS = 4;

/** log（日付順・1日1件）を { 日付: 体重 } にする */
function kgByDate(log) {
  var map = {};
  for (var i = 0; i < log.length; i++) map[log[i].date] = log[i].kg;
  return map;
}

/**
 * 7日平均 A7(date)：date−6〜date の7日間に測った値の平均。
 * 測った日が4日未満なら null。
 */
function avg7(log, date) {
  var map = kgByDate(log);
  return avg7From(map, date);
}

function avg7From(map, date) {
  var sum = 0, n = 0;
  for (var k = -6; k <= 0; k++) {
    var kg = map[addDays(date, k)];
    if (kg === undefined) continue;
    sum += kg;
    n++;
  }
  return n < AVG7_MIN_DAYS ? null : sum / n;
}

/**
 * 目標ラインの折れ点：チェックポイント（日付順）＋(目標日, 目標体重)。
 * チェックポイントが0件なら、開始日以降で最初に測った値を最初の点にする。
 * 最初の点が作れなければ null。
 */
function targetPoints(settings, log) {
  var points = [];
  var cps = settings.checkpoints || [];
  if (cps.length > 0) {
    for (var i = 0; i < cps.length; i++) points.push({ date: cps[i].date, kg: cps[i].kg });
  } else {
    var first = null;
    for (var j = 0; j < log.length; j++) {
      if (log[j].date >= settings.startDate) { first = log[j]; break; }
    }
    if (first === null) return null;
    points.push({ date: first.date, kg: first.kg });
  }
  points.push({ date: settings.goalDate, kg: settings.goalKg });
  return points;
}

/** 2点を結ぶ直線上の date の値（同じ日付の2点なら後の点の値） */
function lineAt(p, q, date) {
  var span = daysBetween(p.date, q.date);
  if (span === 0) return q.kg;
  return p.kg + (q.kg - p.kg) * daysBetween(p.date, date) / span;
}

/**
 * 目標ライン T(date)。折れ点を順に直線で結ぶ。
 * 最初の点より前は最初の区間の傾きで延ばし、目標日以降は目標体重。
 * 最初の点が作れなければ null。
 */
function targetAt(settings, log, date) {
  var points = targetPoints(settings, log);
  if (points === null) return null;
  return targetAtPoints(points, settings, date);
}

function targetAtPoints(points, settings, date) {
  if (date >= settings.goalDate) return settings.goalKg;
  if (date < points[0].date) return lineAt(points[0], points[1], date);
  for (var i = 0; i < points.length - 1; i++) {
    if (date >= points[i].date && date < points[i + 1].date) return lineAt(points[i], points[i + 1], date);
  }
  return settings.goalKg;
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * ダッシュボードの指標をまとめて計算する。
 * log は日付順・1日1件。today は yyyy-MM-dd（日本時間）。
 * 返り値の形は Report（実装計画 Task 3）。
 */
function computeReport(log, settings, today) {
  var map = kgByDate(log);
  var goalDate = settings.goalDate, goalKg = settings.goalKg, startDate = settings.startDate;
  var daysLeft = daysBetween(today, goalDate);

  // 今日の体重（なければ直近）と前日比
  var latestIdx = -1;
  for (var i = 0; i < log.length; i++) if (log[i].date <= today) latestIdx = i;
  var latest = latestIdx < 0 ? null : log[latestIdx];
  var isToday = latest !== null && latest.date === today;
  var dayDiff = latestIdx > 0 ? latest.kg - log[latestIdx - 1].kg : null;

  // 7日平均・前週差
  var a7 = avg7From(map, today);
  var a7prev = avg7From(map, addDays(today, -7));
  var weekDiff = a7 === null || a7prev === null ? null : a7 - a7prev;

  // 目標ライン
  var points = targetPoints(settings, log);
  var tAt = function (date) { return points === null ? null : targetAtPoints(points, settings, date); };
  var target = tAt(today);
  var gap = a7 === null || target === null ? null : a7 - target;
  var status = gap === null ? null : gap <= 0 ? '順調' : '要注意';

  // ペース
  var pace1 = weekDiff;
  var pace4 = null;
  if (a7 !== null) {
    var from = addDays(today, -28);
    if (from < startDate) from = startDate;
    for (var d = from; d < today; d = addDays(d, 1)) {
      var base = avg7From(map, d);
      if (base !== null) {
        pace4 = (a7 - base) / (daysBetween(d, today) / 7);
        break;
      }
    }
  }
  var worsePace = pace1 === null ? pace4 : pace4 === null ? pace1 : Math.max(pace1, pace4);

  // 予測・必要ペース
  var forecast = daysLeft > 0 && a7 !== null && worsePace !== null ? a7 + worsePace * (daysLeft / 7) : null;
  var needPace = daysLeft > 0 && a7 !== null ? -(a7 - goalKg) / (daysLeft / 7) : null;

  // 進捗
  var startTarget = tAt(startDate);
  var progress = null;
  if (a7 !== null && startTarget !== null && startTarget - goalKg !== 0) {
    progress = clamp01((startTarget - a7) / (startTarget - goalKg));
  }

  // 未測定の日（開始日と最初の記録のどちらか遅い方から）
  var missing = [];
  if (log.length > 0) {
    var floor = log[0].date > startDate ? log[0].date : startDate;
    for (var k = -6; k <= 0; k++) {
      var md = addDays(today, k);
      if (md >= floor && map[md] === undefined) missing.push(md);
    }
  }

  // グラフ用の系列（開始日〜目標日）
  var series = [];
  for (var sd = startDate; sd <= goalDate; sd = addDays(sd, 1)) {
    series.push({
      date: sd,
      kg: map[sd] === undefined ? null : map[sd],
      avg7: sd <= today ? avg7From(map, sd) : null,
      target: tAt(sd)
    });
  }
  var forecastLine = forecast === null ? null : { fromDate: today, fromKg: a7, toDate: goalDate, toKg: forecast };

  return {
    today: today, daysLeft: daysLeft, latest: latest, isToday: isToday, dayDiff: dayDiff,
    avg7: a7, weekDiff: weekDiff, target: target, gap: gap, status: status,
    pace1: pace1, pace4: pace4, worsePace: worsePace,
    forecast: forecast, needPace: needPace, progress: progress, startTarget: startTarget,
    missing: missing, series: series, forecastLine: forecastLine
  };
}

if (typeof module !== 'undefined') module.exports = {
  toYmd: toYmd,
  toHm: toHm,
  toYmdHms: toYmdHms,
  addDays: addDays,
  daysBetween: daysBetween,
  parseLogValues: parseLogValues,
  parseSettingsValues: parseSettingsValues,
  parseSamples: parseSamples,
  mergeDaily: mergeDaily,
  avg7: avg7,
  targetAt: targetAt,
  computeReport: computeReport
};
