// 架空のデータ。実在の人の値ではない。
const W = [73.8,73.5,73.6,73.2,73.4,73.0,73.1,72.8,73.0,72.6,72.7,72.9,72.4,72.5,72.2,72.4,72.0,72.1,71.5,71.6,71.3,71.6,null,71.3,71.6];
const LOG = W.map((kg, i) => kg == null ? null : { date: new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10),
  kg, time: i === 24 ? '07:12' : '07:10', received: '' }).filter(Boolean);           // 10/11〜11/4、11/2は未測定
const SETTINGS = { goalDate: '2026-12-05', goalKg: 70, startDate: '2026-10-11', checkpoints: [{ date: '2026-11-01', kg: 71.8 }] };
module.exports = { LOG, SETTINGS };
