# 体重ダッシュボード 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** オムロン コネクト → ヘルスケア → ショートカットで届く体重を、Apps Scriptでシートに記録し、通知の要約と「着地アプローチ表示」の計器盤ページで見られるようにする。

**Architecture:**
- 計算・読み取りなどの純粋な処理は、すべて `gas/shared/Metrics.js` に集める。Apps ScriptとNode.jsの両方で動き、Nodeでテストする。
- Apps Scriptは2つのプロジェクトに分ける。受け取り口（`gas/ingest/`）は「誰でもアクセス可＋合言葉」、計器盤ページ（`gas/dashboard/`）は「自分だけ閲覧可」。どちらも `Metrics.js` の関数を呼ぶだけの薄い層にする。
- ページはサーバー側で表示用の文字まで作ったデータ（PageModel）を埋め込み、ページ内の短いJavaScriptで描く。

**Tech Stack:** Google Apps Script（V8）、HtmlService、ContentService、SpreadsheetApp、LockService、PropertiesService ／ テスト：Node.js 22 の `node:test`、Playwright（この環境に導入済み。`require('playwright')`）

**Spec:** `docs/superpowers/specs/2026-11-05-health-dashboard-design.md`

## Global Constraints

- 実際の体重・目標体重・チェックポイントの値は、コード・テスト・文書に書かない。テストは下の架空データ（`gas/test/fixtures.js`）だけを使う。
- ページは外部のファイル（フォント・ライブラリ・画像）を読み込まない。外部のサービスも使わない。
- タイムゾーンは `Asia/Tokyo`。日付は `yyyy-MM-dd`、時刻は `HH:mm`、受信日時は `yyyy-MM-dd HH:mm:ss` の文字列で扱う。
- Apps Script用のファイルはESモジュールにしない。
  - `Metrics.js` の最後：`if (typeof module !== 'undefined') module.exports = { …公開する関数… };`
  - 各 `Code.js` の先頭：`if (typeof require === 'function' && typeof module !== 'undefined') { Object.assign(globalThis, require('../shared/Metrics.js')); }`
- スクリプトプロパティ名：`SHEET_ID`（両方）、`INGEST_TOKEN`（ingestのみ）。値をコードに書かない。
- シート名：`体重ログ`、`設定`。体重ログの見出し行：`日付`｜`体重kg`｜`測定時刻`｜`受信日時`。
- 表示の符号：正は `+`、負は `−`（U+2212）、丸めて0なら `±`。前日比は `▲`（増）・`▼`（減）・`±`（0）。
- 文言（そのまま使う）：
  - `ERROR: 合言葉が違います`
  - `ERROR: 合言葉が設定されていません`
  - `ERROR: 有効な測定がありません`
  - `まだ記録がありません`（通知）
  - `まだ記録がありません。オムロン コネクトで測ってアプリを閉じると、ここに表示されます。`（ページ）
  - `表示できませんでした`
  - `直し方：スプレッドシートの「設定」または「体重ログ」シートを直してから、このページを開き直してください。`
  - `〇〇は未測定。7日平均は測った日だけで計算しています。`
- 色（ページ）：page `#000000`、panel `#0A0F1A`、line `#1C2636`、text `#EAF0F7`、sub `#8592A6`、faint `#4E5A6E`、dot `#5B6779`、cyan `#38E1FF`、magenta `#FF4FD8`、green `#3CF29A`、amber `#FFB547`
- 書体：`-apple-system, "SF Pro Display", "Hiragino Sans", "Noto Sans JP", sans-serif`。数字は `font-variant-numeric: tabular-nums`。
- テストの実行：`node --test gas/test/*.test.js`

## Review Focus

1. **手で直したセル**：iPhoneのスプレッドシートアプリで体重ログを手で直すと、日付・時刻のセルが日付型に変わる。文字のときと同じ値として読めること。→ Task 1
2. **同じデータの再送**：オートメーションが2回動いて同じデータが届く。2回目はシートを書き換えず、同じ要約を返すこと。→ Task 2・Task 5
3. **測る前にページを開く**：朝、測る前にページを開く。直近の値を測定日つきで出し、今日を未測定に含めること。→ Task 3・Task 6
4. **測定が少ない週**：旅行などで、直近7日間に4日未満しか測っていない。7日平均に頼る項目は「—」になり、通知もページも壊れないこと。→ Task 4・Task 6
5. **合言葉の設定忘れ**：`INGEST_TOKEN` を設定し忘れたまま、合言葉なしの要求が来る。記録せず `ERROR: 合言葉が設定されていません` を返すこと（空文字どうしが一致して通ってしまうのを防ぐ）。→ Task 5

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `gas/shared/Metrics.js` | 純粋な処理すべて（日付、シート値の読み取り、測定行の読み取り、1日1値、計算、書式、PageModel） |
| `gas/ingest/Code.js` | `ingest()`（処理の流れ。依存を引数で受ける）、`doPost`/`doGet`/`testIngest`（Apps Script側） |
| `gas/ingest/appsscript.json` | ingestの設定 |
| `gas/dashboard/Code.js` | `doGet`（シートを読み、PageModelを作り、ページを返す） |
| `gas/dashboard/Page.html` | 計器盤ページ（CSS、表示、SVGのグラフ、なぞり操作） |
| `gas/dashboard/appsscript.json` | dashboardの設定 |
| `gas/test/fixtures.js` | 架空データ |
| `gas/test/render.js` | Page.htmlにPageModelを入れてブラウザで開く補助 |
| `gas/test/*.test.js` | テスト |
| `gas/README.md` | 設定手順 |
| `.gitignore` | `gas/test/out/`（スクリーンショットの出力先）を除外 |

**仕様書との違い**：仕様書12章では「行の読み取り」をingest/Code.jsに置くとしている。Nodeでテストするため、純粋な処理はMetrics.jsに置く。テストも1ファイルではなく、分野ごとに分ける。

### 型（全タスク共通）

```
LogRow   = { date: 'yyyy-MM-dd', kg: number, time: 'HH:mm', received: string }
Log      = LogRow[]                        // 日付の古い順・1日1行
Settings = { goalDate, goalKg, startDate, checkpoints: [{ date, kg }] }  // checkpointsは日付順
Sample   = { date, time, kg }
```

---

### Task 1: 日付とシート値の読み取り

**Files:**
- Create: `gas/shared/Metrics.js`、`gas/test/sheet-data.test.js`、`.gitignore`

**Interfaces:**
- Produces:
  - `toYmd(v: Date|string) -> string`
  - `toHm(v: Date|string) -> string`
  - `toYmdHms(d: Date) -> string`
  - `addDays(ymd: string, n: number) -> string`
  - `daysBetween(a: string, b: string) -> number`（b − a の日数）
  - `parseLogValues(values: any[][]) -> Log`
  - `parseSettingsValues(values: any[][]) -> Settings`

- [ ] **Step 1: 失敗するテストを書く**（`gas/test/sheet-data.test.js`）

```js
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
```

- [ ] **Step 2: 失敗を確認する**
  - 実行：`node --test gas/test/sheet-data.test.js`
  - 期待：FAIL（`Cannot find module '../shared/Metrics.js'`）

- [ ] **Step 3: `gas/shared/Metrics.js` に上の7関数を実装する**
  - 日本時間への変換は `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', … })` で行う（Apps ScriptのV8でもNodeでも使える）。
  - 日付どうしの計算は `yyyy-MM-dd` を `Date.UTC` に直して行う。
  - 設定の不足を知らせる文言：`設定シートに目標日がありません`／`設定シートに目標体重がありません`／`設定シートに開始日がありません`。行番号は1から数える。
  - 最後に `module.exports` のガードを置く（Global Constraints）。
  - `.gitignore` に `gas/test/out/` を書く。

- [ ] **Step 4: 成功を確認する**
  - 実行：`node --test gas/test/sheet-data.test.js`
  - 期待：PASS（7件）

- [ ] **Step 5: コミット**
  - `git add .gitignore gas/shared/Metrics.js gas/test/sheet-data.test.js && git commit -m "日付とシート値の読み取りを追加"`

---

### Task 2: 測定行の読み取りと1日1値

**Files:**
- Modify: `gas/shared/Metrics.js`
- Create: `gas/test/samples.test.js`

**Interfaces:**
- Consumes：`toYmd`、`toHm`（Task 1）
- Produces：
  - `parseSamples(text: string, now: Date) -> { rows: Sample[], rejected: number }`。rowsは1日1件（その日いちばん早い時刻）で日付順。
  - `mergeDaily(log: Log, rows: Sample[], received: string) -> { log: Log, changed: string[] }`

- [ ] **Step 1: 失敗するテストを書く**

```js
const NOW = new Date('2026-11-04T23:00:00+09:00');
test('parseSamplesは検証し、1日いちばん早い測定を選ぶ', () => {
  const text = ['2026-11-04T07:12,71.6', '2026-11-04T21:00:00+09:00,72.4', '2026-11-03T06:50,71.3',
    'bad line', '2026-11-04T07:30,250', '2026-11-05T09:00,71.0', '2026-08-01T07:00,75.0'].join('\n');
  assert.deepEqual(M.parseSamples(text, NOW), { rows: [
    { date: '2026-11-03', time: '06:50', kg: 71.3 }, { date: '2026-11-04', time: '07:12', kg: 71.6 }], rejected: 4 });
});
test('時差つきの時刻は日本時間に直す', () =>
  assert.deepEqual(M.parseSamples('2026-11-03T22:30:00Z,71.5', NOW).rows, [{ date: '2026-11-04', time: '07:30', kg: 71.5 }]));
test('101行目以降は読まない', () => {
  const lines = Array.from({ length: 100 }, () => '2026-11-03T07:00,71.0'); lines.push('2026-11-04T07:00,71.6');
  assert.deepEqual(M.parseSamples(lines.join('\n'), NOW).rows.map(r => r.date), ['2026-11-03']);
});
test('mergeDailyは早い時刻なら上書き、遅ければ残す、新しい日は追加', () => {
  const log = [{ date: '2026-11-03', kg: 71.4, time: '07:00', received: 'r0' }, { date: '2026-11-04', kg: 71.9, time: '06:30', received: 'r0' }];
  const r = M.mergeDaily(log, [{ date: '2026-11-02', time: '07:00', kg: 71.2 }, { date: '2026-11-03', time: '06:50', kg: 71.3 },
    { date: '2026-11-04', time: '07:12', kg: 71.6 }], 'r1');
  assert.deepEqual(r.changed, ['2026-11-02', '2026-11-03']);
  assert.deepEqual(r.log.map(x => [x.date, x.kg, x.time, x.received]),
    [['2026-11-02', 71.2, '07:00', 'r1'], ['2026-11-03', 71.3, '06:50', 'r1'], ['2026-11-04', 71.9, '06:30', 'r0']]);
});
test('同じデータを2回送っても変わらない', () => {
  const rows = [{ date: '2026-11-04', time: '07:12', kg: 71.6 }];
  const first = M.mergeDaily([], rows, 'r1');
  assert.deepEqual(M.mergeDaily(first.log, rows, 'r2'), { log: first.log, changed: [] });
});
```

- [ ] **Step 2: 失敗を確認する**
  - 実行：`node --test gas/test/samples.test.js`
  - 期待：FAIL（`M.parseSamples is not a function`）

- [ ] **Step 3: `parseSamples`・`mergeDaily` を実装する**
  - 1行の形式：`YYYY-MM-DDTHH:mm`（`:ss` と時差 `Z`／`±HH:MM` は省略可）`,` 体重。時差がなければ `+09:00` とみなす。
  - 捨てる条件：形式違い、30未満または200より大きい、`now` より1時間を超えて先、`now` の60日前より前。
  - 同じ時刻で体重だけ違う場合は上書きして、changedに入れる。

- [ ] **Step 4: 成功を確認する**
  - 実行：`node --test gas/test/samples.test.js`
  - 期待：PASS（5件）

- [ ] **Step 5: コミット**
  - `git add gas/test/samples.test.js && git commit -am "測定行の読み取りと1日1値を追加"`

---

### Task 3: 指標の計算

**Files:**
- Modify: `gas/shared/Metrics.js`
- Create: `gas/test/fixtures.js`、`gas/test/report.test.js`

**Interfaces:**
- Consumes：`addDays`・`daysBetween`（Task 1）
- Produces：
  - `avg7(log: Log, date: string) -> number|null`
  - `targetAt(settings: Settings, log: Log, date: string) -> number|null`
  - `computeReport(log: Log, settings: Settings, today: string) -> Report`

```
Report = { today, daysLeft, latest: LogRow|null, isToday: boolean, dayDiff: number|null,
  avg7, weekDiff, target, gap, status: '順調'|'要注意'|null, pace1, pace4, worsePace,
  forecast, needPace, progress, startTarget, missing: string[],
  series: [{ date, kg: number|null, avg7: number|null, target: number|null }],  // 開始日〜目標日。avg7は今日まで
  forecastLine: { fromDate, fromKg, toDate, toKg } | null }
```

- [ ] **Step 1: 架空データ `gas/test/fixtures.js` を作る**

```js
// 架空のデータ。実在の人の値ではない。
const W = [73.8,73.5,73.6,73.2,73.4,73.0,73.1,72.8,73.0,72.6,72.7,72.9,72.4,72.5,72.2,72.4,72.0,72.1,71.5,71.6,71.3,71.6,null,71.3,71.6];
const LOG = W.map((kg, i) => kg == null ? null : { date: new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10),
  kg, time: i === 24 ? '07:12' : '07:10', received: '' }).filter(Boolean);           // 10/11〜11/4、11/2は未測定
const SETTINGS = { goalDate: '2026-12-05', goalKg: 70, startDate: '2026-10-11', checkpoints: [{ date: '2026-11-01', kg: 71.8 }] };
module.exports = { LOG, SETTINGS };
```

- [ ] **Step 2: 失敗するテストを書く**

```js
const { LOG, SETTINGS } = require('./fixtures.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} ≉ ${b}`);
test('11/4の指標', () => {
  const r = M.computeReport(LOG, SETTINGS, '2026-11-04');
  assert.deepEqual([r.latest.date, r.latest.kg, r.isToday, r.daysLeft, r.status, r.missing], ['2026-11-04', 71.6, true, 31, '順調', ['2026-11-02']]);
  close(r.dayDiff, 0.3); close(r.avg7, 71.48333); close(r.weekDiff, -0.87381); close(r.target, 71.64118); close(r.gap, -0.15784);
  close(r.pace1, -0.87381); close(r.pace4, -0.68056); close(r.worsePace, -0.68056); close(r.forecast, 68.46944);
  close(r.needPace, -0.33495); close(r.progress, 0.49057); close(r.startTarget, 72.91176);
  assert.equal(r.series.length, 56); assert.equal(r.series[22].kg, null); assert.equal(r.series[25].avg7, null);
  close(r.series[24].avg7, 71.48333);
  assert.deepEqual([r.forecastLine.fromDate, r.forecastLine.toDate], ['2026-11-04', '2026-12-05']);
});
test('測る前に開いた日（11/5）', () => {
  const r = M.computeReport(LOG, SETTINGS, '2026-11-05');
  assert.deepEqual([r.latest.date, r.isToday, r.daysLeft, r.missing], ['2026-11-04', false, 30, ['2026-11-02', '2026-11-05']]);
  close(r.dayDiff, 0.3); close(r.avg7, 71.48); close(r.forecast, 68.69136);
});
test('7日平均は4日以上から', () => { assert.equal(M.avg7(LOG, '2026-10-13'), null); close(M.avg7(LOG, '2026-10-14'), 73.525); });
test('目標ライン：チェックポイント0件・複数件・前への延長', () => {
  close(M.targetAt({ ...SETTINGS, checkpoints: [] }, LOG, '2026-11-04'), 72.14182);
  const two = { ...SETTINGS, checkpoints: [{ date: '2026-11-01', kg: 71.8 }, { date: '2026-11-15', kg: 71.0 }] };
  close(M.targetAt(two, LOG, '2026-11-08'), 71.4); close(M.targetAt(two, LOG, '2026-10-25'), 72.2); close(M.targetAt(two, LOG, '2026-11-25'), 70.5);
  assert.equal(M.targetAt({ ...SETTINGS, checkpoints: [] }, [], '2026-11-04'), null);
});
test('目標日当日は予測と必要ペースなし', () => {
  const r = M.computeReport(LOG, SETTINGS, '2026-12-05');
  assert.deepEqual([r.daysLeft, r.forecast, r.needPace], [0, null, null]);
});
test('進捗は0〜1に収める', () => {
  assert.equal(M.computeReport(LOG, { ...SETTINGS, goalKg: 71.5, checkpoints: [] }, '2026-11-04').progress, 1);
  assert.equal(M.computeReport(LOG, { ...SETTINGS, goalKg: 69, checkpoints: [{ date: '2026-11-01', kg: 70 }] }, '2026-11-04').progress, 0);
});
test('記録なし', () => {
  const r = M.computeReport([], SETTINGS, '2026-11-04');
  assert.deepEqual([r.latest, r.avg7, r.status, r.forecastLine, r.series.length], [null, null, null, null, 56]);
});
```

- [ ] **Step 3: 失敗を確認する**
  - 実行：`node --test gas/test/report.test.js`
  - 期待：FAIL（`M.computeReport is not a function`）

- [ ] **Step 4: `avg7`・`targetAt`・`computeReport` を実装する**
  - 定義は仕様書5章のとおり。
  - `pace4` の基準日：`addDays(today, -28)` と「開始日以降で `avg7` が初めて出る日」の遅い方。基準日が今日と同じならnull。
  - `worsePace`：pace1とpace4のうち、nullでないものの最大値。
  - `forecast`・`needPace`：`daysLeft <= 0` か `avg7` がnullならnull。
  - `forecastLine`：`forecast` がnullならnull。

- [ ] **Step 5: 成功を確認する**
  - 実行：`node --test gas/test/report.test.js`
  - 期待：PASS（7件）

- [ ] **Step 6: コミット**
  - `git add gas/test/fixtures.js gas/test/report.test.js && git commit -am "指標の計算を追加"`

---

### Task 4: 書式と通知の要約

**Files:**
- Modify: `gas/shared/Metrics.js`
- Create: `gas/test/format.test.js`

**Interfaces:**
- Consumes：`computeReport`（Task 3）
- Produces：
  - `fmt1(x: number) -> string`
  - `fmtSigned(x: number, digits: number) -> string`
  - `fmtDayDiff(x: number) -> string`
  - `md(ymd: string) -> string`
  - `weekdayJa(ymd: string) -> string`
  - `formatSummary(r: Report) -> string`

- [ ] **Step 1: 失敗するテストを書く**

```js
test('符号つきの書式', () => {
  assert.equal(M.fmtSigned(-0.04, 1), '±0.0'); assert.equal(M.fmtSigned(-0.15784, 1), '−0.2');
  assert.equal(M.fmtSigned(0.66, 1), '+0.7'); assert.equal(M.fmtSigned(-0.68056, 2), '−0.68');
  assert.equal(M.fmtDayDiff(0.3), '▲0.3'); assert.equal(M.fmtDayDiff(-0.4), '▼0.4'); assert.equal(M.fmtDayDiff(0.02), '±0.0');
  assert.equal(M.fmt1(71.48333), '71.5'); assert.equal(M.md('2026-11-04'), '11/4'); assert.equal(M.weekdayJa('2026-11-04'), '水');
});
test('通知の要約', () => {
  assert.equal(M.formatSummary(M.computeReport(LOG, SETTINGS, '2026-11-04')), '71.6kg ▲0.3｜目標ライン −0.2 順調｜予測 68.5（T−31）');
  assert.equal(M.formatSummary(M.computeReport(LOG, SETTINGS, '2026-11-05')), '11/4 71.6kg ▲0.3｜目標ライン −0.1 順調｜予測 68.7（T−30）');
  assert.equal(M.formatSummary(M.computeReport([], SETTINGS, '2026-11-04')), 'まだ記録がありません');
});
test('7日平均がない日は体重と前日比だけ', () =>
  assert.equal(M.formatSummary(M.computeReport(LOG.slice(-2), SETTINGS, '2026-11-04')), '71.6kg ▲0.3'));
```

- [ ] **Step 2: 失敗を確認する**
  - 実行：`node --test gas/test/format.test.js`
  - 期待：FAIL

- [ ] **Step 3: 6関数を実装する**
  - 符号は、丸めたあとの値で決める。
  - `formatSummary` の組み立て：
    - 1つ目：`[測定日 ]体重kg[ 前日比]`。測定日は今日でないときだけ付ける。
    - 2つ目：`目標ライン 差 状態`。差がnullなら省く。
    - 3つ目：`予測 値（T−残り日数）`。予測がnullなら省く。
    - 区切りは `｜`。

- [ ] **Step 4: 成功を確認する**
  - 実行：`node --test gas/test/format.test.js`
  - 期待：PASS（3件）

- [ ] **Step 5: コミット**
  - `git add gas/test/format.test.js && git commit -am "書式と通知の要約を追加"`

---

### Task 5: 受け取り口（ingest）

**Files:**
- Create: `gas/ingest/Code.js`、`gas/ingest/appsscript.json`、`gas/test/ingest.test.js`

**Interfaces:**
- Consumes：`parseSamples`・`mergeDaily`（Task 2）、`computeReport`（Task 3）、`formatSummary`（Task 4）、`toYmd`・`toYmdHms`（Task 1）
- Produces：
  - `ingest(params: { token?: string, samples?: string }, deps: { expectedToken: string, now: Date, loadLog: () => Log, saveLog: (log: Log) => void, loadSettings: () => Settings }) -> string`
  - Apps Script用：`doPost(e)`・`doGet(e)`・`testIngest()`

- [ ] **Step 1: 失敗するテストを書く**

```js
const { ingest } = require('../ingest/Code.js');
const { LOG, SETTINGS } = require('./fixtures.js');
const NOW = new Date('2026-11-04T07:13:05+09:00');
const deps = (over = {}) => { const saved = [];
  return { saved, expectedToken: 't0k3n', now: NOW, loadLog: () => LOG.slice(0, -1), saveLog: l => saved.push(l), loadSettings: () => SETTINGS, ...over }; };
test('合言葉が違う', () => { const d = deps(); assert.equal(ingest({ token: 'x', samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 合言葉が違います'); assert.equal(d.saved.length, 0); });
test('合言葉が未設定なら、空の合言葉でも通さない', () => {
  const d = deps({ expectedToken: '' }); assert.equal(ingest({ samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 合言葉が設定されていません'); assert.equal(d.saved.length, 0);
});
test('有効な行がない', () => assert.equal(ingest({ token: 't0k3n', samples: 'bad' }, deps()), 'ERROR: 有効な測定がありません'));
test('保存して要約を返す', () => {
  const d = deps();
  assert.equal(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), '71.6kg ▲0.3｜目標ライン −0.2 順調｜予測 68.5（T−31）');
  assert.equal(d.saved.length, 1);
  assert.deepEqual(d.saved[0].at(-1), { date: '2026-11-04', kg: 71.6, time: '07:12', received: '2026-11-04 07:13:05' });
});
test('同じデータの再送では保存しない', () => {
  const d = deps({ loadLog: () => LOG });
  assert.match(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), /^71\.6kg/); assert.equal(d.saved.length, 0);
});
test('設定が足りなくても記録は保存し、エラー文を返す', () => {
  const d = deps({ loadSettings: () => { throw new Error('設定シートに目標日がありません'); } });
  assert.equal(ingest({ token: 't0k3n', samples: '2026-11-04T07:12,71.6' }, d), 'ERROR: 設定シートに目標日がありません');
  assert.equal(d.saved.length, 1);
});
test('ingestの設定ファイル', () => {
  const j = require('../ingest/appsscript.json');
  assert.deepEqual([j.timeZone, j.runtimeVersion, j.webapp.executeAs, j.webapp.access], ['Asia/Tokyo', 'V8', 'USER_DEPLOYING', 'ANYONE_ANONYMOUS']);
});
```

- [ ] **Step 2: 失敗を確認する**
  - 実行：`node --test gas/test/ingest.test.js`
  - 期待：FAIL（`Cannot find module '../ingest/Code.js'`）

- [ ] **Step 3: `gas/ingest/Code.js` と `appsscript.json` を作る**
  - `ingest` の流れ：
    1. 合言葉の確認（未設定 → 不一致の順に判定）
    2. `parseSamples(samples, now)`。rowsが0件なら有効な測定なしのエラー
    3. `loadLog` → `mergeDaily(..., toYmdHms(now))`。changedが1件以上なら `saveLog`
    4. `loadSettings` → `computeReport(..., toYmd(now))` → `formatSummary`
    - 例外が起きたら `'ERROR: ' + err.message` を返す。
  - Apps Script側の関数：
    - `doPost(e)`・`doGet(e)`：`LockService.getScriptLock().waitLock(10000)` の中で `ingest(e.parameter, gasDeps_())` を実行し、`ContentService.createTextOutput(…)` で返す。
    - `gasDeps_()`：`PropertiesService` から `INGEST_TOKEN`・`SHEET_ID` を読む。`loadLog` は `parseLogValues(シート.getDataRange().getValues())`。`saveLog` は、見出しの下を消してから、A〜D列を `setNumberFormat('@')` にして全行を書く。`loadSettings` は `parseSettingsValues`。
    - `testIngest()`：本物のシートを読み、`saveLog` だけを「件数を `console.log` する関数」に差し替える。体重ログの最後の行を1行の測定として `ingest` を呼び、結果を `console.log` する。シートには書かない。
  - `appsscript.json`：`{"timeZone":"Asia/Tokyo","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER","oauthScopes":["https://www.googleapis.com/auth/spreadsheets"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}`
  - 先頭のshimと、最後の `module.exports = { ingest }` のガードを付ける。

- [ ] **Step 4: 成功を確認する**
  - 実行：`node --test gas/test/*.test.js`
  - 期待：全件PASS

- [ ] **Step 5: コミット**
  - `git add gas/ingest gas/test/ingest.test.js && git commit -m "受け取り口を追加"`

---

### Task 6: 計器盤ページ（グラフ以外）

**Files:**
- Modify: `gas/shared/Metrics.js`
- Create: `gas/dashboard/Code.js`、`gas/dashboard/Page.html`、`gas/dashboard/appsscript.json`、`gas/test/render.js`、`gas/test/page-model.test.js`、`gas/test/page.test.js`

**Interfaces:**
- Consumes：`computeReport`（Task 3）、書式の関数（Task 4）、`parseLogValues`・`parseSettingsValues`（Task 1）
- Produces：
  - `buildPageModel(r: Report, settings: Settings, sheetUrl: string) -> PageModel`
  - `safeJson(obj) -> string`（`<` を `\u003c` に置き換えたJSON）
  - `render.js` の `openPage(model, { reducedMotion? }) -> Promise<{ browser, page, errors: string[], requests: string[] }>` と `shot(page, name)`（`gas/test/out/<name>.png` に保存）

```
PageModel = { state: 'ok'|'empty'|'error', message?: string, sheetUrl,
  header: { measured: string, tMinus: number|null },
  hero: { kg, dayDiff: string|null, dayDiffTone: 'up'|'down'|'flat'|null, gapText, status, gaugePos: number|null },
  readouts: { avg7, weekDiff, forecast, worse, need, needSub, progressPct: number|null, progressSub },
  missingNote: string|null,
  chart: { dates, kg, avg7, target, todayIndex, checkpoints: [{ index, kg }], goal: { index, kg },
           forecast: { fromIndex, fromKg, toIndex, toKg }|null } }
```

- [ ] **Step 1: PageModelの失敗するテストを書く**（`gas/test/page-model.test.js`）

```js
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
```

- [ ] **Step 2: 失敗を確認する**
  - 実行：`node --test gas/test/page-model.test.js`
  - 期待：FAIL

- [ ] **Step 3: `buildPageModel`・`safeJson` を実装する**
  - `gaugePos = Math.round(Math.min(98, Math.max(2, 50 + gap / 1.0 * 50)))`
  - `dayDiffTone`：丸めた前日比が正なら `up`、負なら `down`、0なら `flat`
  - 値がない項目：`'—'`。`weekDiff` は `前週差 —`、`worse` は `遅い方のペース —`、`needSub` は `残り${daysLeft}日`

- [ ] **Step 4: 成功を確認する**
  - 実行：`node --test gas/test/page-model.test.js`
  - 期待：PASS（5件）

- [ ] **Step 5: ページの失敗するテストを書く**（`gas/test/page.test.js`。`require('playwright')` ができなければ `test.skip`）

```js
const { LOG, SETTINGS } = require('./fixtures.js');
const MODEL_1104 = M.buildPageModel(M.computeReport(LOG, SETTINGS, '2026-11-04'), SETTINGS, 'https://example.invalid/sheet');
test('通常の画面', async () => {
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
test('記録なしの画面', async () => {
  const { browser, page } = await openPage(M.buildPageModel(M.computeReport([], SETTINGS, '2026-11-04'), SETTINGS, ''));
  assert.equal(await page.textContent('#empty'), 'まだ記録がありません。オムロン コネクトで測ってアプリを閉じると、ここに表示されます。');
  await shot(page, 'empty'); await browser.close();
});
test('エラーの画面', async () => {
  const { browser, page } = await openPage({ state: 'error', message: '設定シートに目標日がありません' });
  const t = await page.textContent('#error');
  for (const s of ['表示できませんでした', '設定シートに目標日がありません', '直し方：スプレッドシートの「設定」または「体重ログ」シートを直してから、このページを開き直してください。']) assert.ok(t.includes(s));
  await shot(page, 'error'); await browser.close();
});
test('要注意の画面', async () => {
  const s2 = { ...SETTINGS, checkpoints: [{ date: '2026-11-01', kg: 71.0 }] };
  const { browser, page } = await openPage(M.buildPageModel(M.computeReport(LOG, s2, '2026-11-04'), s2, ''));
  assert.equal(await page.textContent('#status'), '要注意'); assert.equal(await page.getAttribute('#status', 'data-tone'), 'caution');
  await shot(page, 'caution'); await browser.close();
});
```

- [ ] **Step 6: 失敗を確認する**
  - 実行：`node --test gas/test/page.test.js`
  - 期待：FAIL（`Page.html` がない）

- [ ] **Step 7: `render.js`・`Page.html`・`dashboard/Code.js`・`appsscript.json` を作る**
  - `render.js`：Page.htmlの `<?!= dataJson ?>`（Page.html内でこの1か所だけ）を `safeJson(model)` に置き換えて一時ファイルに書く。393×852（deviceScaleFactor 2）で開き、`console` のエラーと、すべての `request` のURLを集める。
  - `Page.html`：
    - 配置・文字・色は仕様書6.1のとおり。
    - 要素のid：`#t-minus`、`#measured`、`#hero-kg`、`#day-diff`（`data-tone`）、`#gap-text`、`#status`（`data-tone` は `ok`／`caution`）、`#gauge-marker`（`style.left` に `gaugePos%`）、`#avg7`、`#week-diff`、`#forecast`、`#worse`、`#need`、`#need-sub`、`#progress`、`#progress-bar`、`#progress-sub`、`#chart`（Task 7で中身を描く）、`#missing`、`#sheet-link`、`#empty`、`#error`
    - スクリプトの先頭は `const MODEL = <?!= dataJson ?>;`。stateに応じて、通常・`#empty`・`#error` のどれか1つだけを表示する。
  - `dashboard/Code.js`：先頭にshimを付ける。`doGet` の流れ：
    1. `SHEET_ID` を読む（なければ `スクリプトプロパティ SHEET_ID がありません`）
    2. シートを開く（なければ `シート「体重ログ」が見つかりません`／`シート「設定」が見つかりません`）
    3. `computeReport(log, settings, toYmd(new Date()))` → `buildPageModel(..., ss.getUrl())`
    4. 例外が起きたら `console.error` に記録し、`{ state: 'error', message }` にする
    5. `HtmlService.createTemplateFromFile('Page')` に `dataJson` を渡して `evaluate()`。`.setTitle('体重ダッシュボード')`、`.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')`
  - `appsscript.json`：ingestと同じで、`webapp.access` を `MYSELF` にする。

- [ ] **Step 8: 成功を確認する**
  - 実行：`node --test gas/test/*.test.js`
  - 期待：全件PASS

- [ ] **Step 9: 見た目を確認する**
  - `gas/test/out/` の4枚（ok・empty・error・caution）を開く。
  - 仕様書6.1の配置・色と見比べる。数字の詰まり、はみ出し、重なりがないことを確かめる。

- [ ] **Step 10: コミット**
  - `git add gas/dashboard gas/test/render.js gas/test/page-model.test.js gas/test/page.test.js && git commit -am "計器盤ページを追加"`

---

### Task 7: グラフ（SVG・ラベル・なぞり操作）

**Files:**
- Modify: `gas/dashboard/Page.html`、`gas/test/page.test.js`

**Interfaces:**
- Consumes：`PageModel.chart`（Task 6）
- Produces：Page.html内の `drawChart(svg: SVGElement, chart)`。描いた要素に `data-role` を付ける。
  - `weight-dot`、`avg7`、`target`、`forecast`、`checkpoint`、`goal`、`today`
  - `today-label`、`goal-label`、`forecast-label`、`y-tick`、`x-tick`、`legend-item`

- [ ] **Step 1: 失敗するテストを書く**（`page.test.js` に追加）

```js
test('グラフの要素', async () => {
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
test('なぞると、その日の値が出る', async () => {
  const { browser, page } = await openPage(MODEL_1104);
  const box = await page.locator('#chart').boundingBox();
  const x = await page.$eval('#chart', svg => svg.__xOf(24));           // drawChartが公開する、日付番号→画面上のx座標の関数
  await page.mouse.move(box.x + x, box.y + box.height / 2);
  const t = await page.textContent('#tooltip');
  assert.match(t, /11\/4/); assert.match(t, /体重 71\.6/); assert.match(t, /7日平均 71\.5/); assert.match(t, /目標 71\.6/);
  await shot(page, 'chart-scrub'); await browser.close();
});
test('動きを減らす設定では線を描く動きをしない', async () => {
  const { browser, page } = await openPage(MODEL_1104, { reducedMotion: 'reduce' });
  assert.equal(await page.$eval('#chart [data-role="avg7"]', el => getComputedStyle(el).animationName), 'none');
  await browser.close();
});
```

- [ ] **Step 2: 失敗を確認する**
  - 実行：`node --test gas/test/page.test.js`
  - 期待：FAIL（`data-role` の要素が0件）

- [ ] **Step 3: `drawChart` を実装する**
  - 見た目は仕様書6.1の「グラフ」の表のとおり。高さ240px、幅は `#chart` の実際の幅。
  - 縦軸の範囲：体重・7日平均・目標ライン・予測の最小値−0.5を0.5単位で切り下げ、最大値＋0.5を0.5単位で切り上げる。目盛りはその間の整数ごと。
  - 横軸の目盛り：番号 `0`、`Math.round((n−1)/3)`、`Math.round(2(n−1)/3)`、`n−1`。
  - 7日平均の曲線：Catmull-Rom曲線（3次ベジェに直す）で描く。
  - 線を描く動き：CSSの `@keyframes`（`stroke-dashoffset` を全長から0へ、900ms、ease-out）。`@media (prefers-reduced-motion: reduce)` では `animation: none`。
  - なぞり操作：`#chart` に `touch-action: pan-y` を付ける。`pointermove`・`pointerdown` でいちばん近い日に縦線と `#tooltip`（`M/D`・`体重 x`・`7日平均 x`・`目標 x`。値がない項目は省く）を出し、`pointerleave`・`pointercancel` で消す。
  - `svg.__xOf = i => x座標`（テスト用）。
  - `#chart` に `role="img"` と、`aria-label`（「7日平均71.5kg、目標ライン71.6kg、予測68.5kg」の形）を付ける。

- [ ] **Step 4: 成功を確認する**
  - 実行：`node --test gas/test/*.test.js`
  - 期待：全件PASS

- [ ] **Step 5: 見た目を確認する**
  - `gas/test/out/ok.png` と `chart-scrub.png` を開く。
  - ラベルが線や軸と重なっていないことを確かめる。
  - 承認済みの試作v3と同じ見立て（マゼンタの進路、シアンの計測値と予測、右側の縦軸）になっていることを確かめる。

- [ ] **Step 6: コミット**
  - `git commit -am "計器盤のグラフを追加"`

---

### Task 8: 設定手順書と最終確認

**Files:**
- Create: `gas/README.md`
- Modify: `README.md`（末尾に「体重ダッシュボード → `gas/README.md`」の1行を足す）

**Interfaces:**
- Consumes：Task 1〜7のファイル名・関数名・プロパティ名

- [ ] **Step 1: `gas/README.md` を書く**
  - 見出しは次の順にする。手順は番号つきで書く。
    1. スプレッドシートを作る（シート名、見出し行、「設定」の書き方。例は架空の値）
    2. 受け取り口のApps Scriptを作る（`shared/Metrics.js` と `ingest/Code.js` を貼る、マニフェストを表示して `appsscript.json` を貼る、スクリプトプロパティ `SHEET_ID`・`INGEST_TOKEN`、デプロイ：ウェブアプリ・実行ユーザー自分・アクセス全員、`testIngest` の実行）
    3. 計器盤ページのApps Scriptを作る（`Metrics.js`・`dashboard/Code.js`・`Page.html`、`SHEET_ID`、デプロイ：アクセス自分のみ）
    4. オムロン コネクトのヘルスケア連携
    5. ショートカットを作る（仕様書3.1の手順。体重の単位をkgにする、POSTのフォーム項目名 `token`・`samples`、最後に「通知を表示」）
    6. オートメーション（オムロン コネクトを閉じたとき・確認なしで実行）
    7. ホーム画面に追加（SafariでページのURLを開いて「ホーム画面に追加」。自分のGoogleアカウントでログインしておく）
    8. うまくいかないとき（仕様書13章の表を、利用者向けの言葉で書く）
  - 合言葉の作り方の例：Apps Scriptのエディタで `Utilities.getUuid() + Utilities.getUuid()` を一度だけ実行する。

- [ ] **Step 2: すべてのテストを実行する**
  - 実行：`node --test gas/test/*.test.js`
  - 期待：全件PASS

- [ ] **Step 3: 実データが入っていないことを確かめる**
  - 実行：`git grep -n -E "@gmail|SHEET_ID *=|INGEST_TOKEN *=" -- gas`
  - 期待：README内の説明文以外に一致なし。

- [ ] **Step 4: コミットしてpush**
  - `git add gas/README.md README.md && git commit -m "体重ダッシュボードの設定手順を追加" && git push -u origin claude/health-dashboard-design-oexcb8`

---

## 実装後にユーザーが行うこと（仕様書11章の段階3・4）

1. `gas/README.md` の手順で、スプレッドシートと2つのApps Scriptを作る。
2. `testIngest()` を実行し、実行ログに要約1行が出ることを確かめる。
3. iPhoneで通しの確認をする。
   - オムロン コネクトを閉じる → 通知が出る → 体重ログに行が増える → ページに反映される
   - 同じ日に2回測ったとき
   - ロック解除の直後
4. 結果を伝える。仕様書13章の未確認の点は、その結果に合わせて直す。
