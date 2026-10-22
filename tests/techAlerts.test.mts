import assert from 'node:assert/strict';
import { detectAlerts, evidenceCount, summarize, DEFAULT_ALERT_SETTINGS as S, type Bar } from '../src/utils/techAlerts';

// 基準：60 天小幅震盪（100 上下 ±1），量 1000
const base = (n = 60): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 2) * 1;
    return { date: `2026-08-${String(i + 1).padStart(2, '0')}`, open: c - 0.2, high: c + 0.6, low: c - 0.6, close: c, volume: 1000 };
  });
const ids = (b: Bar[], o?: any) => detectAlerts(b, S, o).map(x => x.id);
const push = (b: Bar[], x: Partial<Bar>) => { const p = b[b.length - 1]; b.push({ date: 'T', open: p.close, high: p.close + 0.5, low: p.close - 0.5, close: p.close, volume: 1000, ...x }); return b; };

// 平靜時不應有任何警訊
assert.deepEqual(ids(base()), [], '平盤不應觸發');

// 1 + 2：跌破支撐的放量長黑
{
  const b = push(base(), { open: 100, high: 100.2, low: 96, close: 96.2, volume: 1800 });
  const r = ids(b);
  assert.ok(r.includes('support'), '應跌破支撐');
  assert.ok(r.includes('bigBlack'), '應為放量長黑');
  const sum = summarize(detectAlerts(b), '收盤確認')!;
  assert.match(sum.headline, /警訊增加|多項/);
  assert.match(sum.body, /1\.8 倍/);
  console.log('  範例：', sum.headline, sum.body, sum.triggers, sum.status);
}
// 3 上漲量縮（盤中不判斷）
{
  const b = push(base(), { open: 101, high: 102.5, low: 100.8, close: 102.3, volume: 500 });
  assert.ok(ids(b).includes('lowVolHigh'));
  assert.ok(!ids(b, { skipVolumeLow: true }).includes('lowVolHigh'));
}
// 4 高檔長上影線
{
  const b = push(base(), { open: 100.6, high: 103, low: 100.3, close: 100.7, volume: 1000 });
  assert.ok(ids(b).includes('upperShadow'));
}
// 5 均線轉弱：先漲後跌
{
  const mk = (n: number): Bar[] => Array.from({ length: n }, (_, i) => {
    const c = i < 40 ? 100 + i * 0.5 : 120 - (i - 40) * 1.2;
    return { date: `d${i}`, open: c, high: c + 0.3, low: c - 0.3, close: c, volume: 1000 };
  });
  const hits = Array.from({ length: 25 }, (_, k) => ids(mk(40 + k)).includes('maWeak'));
  assert.ok(hits.some(Boolean), '轉弱剛成立時應提醒');
  assert.ok(hits.filter(Boolean).length <= 3, '最多連續提醒 3 天');
  assert.ok(!ids(mk(60)).includes('maWeak'), '長期在均線下不再每天提醒');
}
// 6 MACD 死亡交叉：上漲後轉跌的那天
{
  const mk = (n: number) => Array.from({ length: n }, (_, i) => {
    const c = i < 50 ? 100 + i : 149 - (i - 49) * 3;
    return { date: `d${i}`, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 };
  });
  let hit = false;
  for (let n = 50; n < 60; n++) if (ids(mk(n)).includes('macdCross')) hit = true;
  assert.ok(hit, 'MACD 應在轉跌後交叉');
}
// 8 KD 高檔死叉
{
  const mk = (n: number) => Array.from({ length: n }, (_, i) => {
    const c = i < 40 ? 100 + i : 139 - (i - 39) * 2;
    return { date: `d${i}`, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 };
  });
  let hit = false;
  for (let n = 40; n < 46; n++) if (ids(mk(n)).includes('kdCross')) hit = true;
  assert.ok(hit, 'KD 應在高檔死叉');
}
// 7 RSI 背離：急漲到高點 A，回檔，緩漲到略高的高點 B，再回落 3 天
{
  const closes: number[] = [];
  for (let i = 0; i < 30; i++) closes.push(100);
  for (let i = 1; i <= 10; i++) closes.push(100 + i * 3); // 130 急漲
  for (let i = 1; i <= 6; i++) closes.push(130 - i * 2); // 118
  for (let i = 1; i <= 13; i++) closes.push(118 + i * 1); // 131 緩漲（略高）
  for (let i = 1; i <= 3; i++) closes.push(131 - i * 1.5); // 確認高點
  const b = closes.map((c, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, open: c, high: c + 0.2, low: c - 0.2, close: c, volume: 1000 }));
  assert.ok(ids(b).includes('rsiDiv'), 'RSI 應背離');
}
// 9 突破後失敗
{
  const b = base();
  push(b, { open: 100.5, high: 103, low: 100.4, close: 102.8 });
  push(b, { open: 102.6, high: 102.9, low: 101.2, close: 101.6 });
  push(b, { open: 101.6, high: 101.7, low: 99.8, close: 100 });
  assert.ok(ids(b).includes('breakoutFail'));
}
// 10 跳空缺口失守
{
  const b = base();
  push(b, { open: 103, high: 104, low: 102.5, close: 103.5 }); // 向上跳空
  push(b, { open: 103.4, high: 103.8, low: 102.8, close: 103.1 });
  push(b, { open: 102.9, high: 103, low: 98.5, close: 98.8 }); // 收在缺口下緣之下
  assert.ok(ids(b).includes('gapFail'));
}
// 動能訊號重疊只算一份
assert.equal(evidenceCount([{ id: 'macdCross', detail: '', fact: '' }, { id: 'kdCross', detail: '', fact: '' }, { id: 'rsiDiv', detail: '', fact: '' }]), 1);
assert.equal(evidenceCount([{ id: 'macdCross', detail: '', fact: '' }, { id: 'support', detail: '', fact: '' }]), 2);
// 關閉規則
assert.ok(!detectAlerts(push(base(), { open: 100, high: 100.2, low: 96, close: 96.2, volume: 1800 }), { ...S, enabled: { ...S.enabled, support: false } }).some(x => x.id === 'support'));
console.log('techAlerts.test：技術面警訊 10 項規則檢查通過');
