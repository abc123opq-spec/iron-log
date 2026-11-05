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

if (typeof module !== 'undefined') module.exports = {
  toYmd: toYmd,
  toHm: toHm,
  toYmdHms: toYmdHms,
  addDays: addDays,
  daysBetween: daysBetween,
  parseLogValues: parseLogValues,
  parseSettingsValues: parseSettingsValues
};
