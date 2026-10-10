/**
 * 回測策略的基本檢查：每個策略都能跑、數字合理、沒有偷看未來；停損／停利／持有天數／大盤濾網照規則運作。
 */
import assert from 'node:assert/strict';
import { backtest, BacktestParams, DailySeries, StrategyId, macd, dmi, sarTrend, williamsR, obv, ema } from '../src/utils/analytics.ts';

// 固定亂數種子的模擬股價（幾何隨機漫步，含趨勢段與盤整段）
function makeSeries(n = 2500, seed = 7): DailySeries {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const date: string[] = [], open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  let p = 100;
  const d0 = new Date('2015-01-05T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 180) * 0.0015;
    const o = p * (1 + (rnd() - 0.5) * 0.01);
    const c = o * (1 + drift + (rnd() - 0.5) * 0.04);
    const h = Math.max(o, c) * (1 + rnd() * 0.01), l = Math.min(o, c) * (1 - rnd() * 0.01);
    const d = new Date(d0.getTime() + i * 86400000);
    date.push(d.toISOString().slice(0, 10)); open.push(o); high.push(h); low.push(l); close.push(c);
    volume.push(Math.round(1e6 * (0.5 + rnd() * (rnd() < 0.05 ? 6 : 1))));
    p = c;
  }
  return { date, open, high, low, close, volume };
}

const s = makeSeries();
const base: BacktestParams = {
  strategy: 'buy_hold', capital: 1_000_000, feeRate: 0.001425, feeDiscount: 1, minFee: 20, taxRate: 0.003,
  short: 20, long: 60, rsiPeriod: 14, rsiLow: 30, rsiHigh: 70, bollPeriod: 20, bollMult: 2,
  maPeriod: 60, macdFast: 12, macdSlow: 26, macdSignal: 9, donchianIn: 20, donchianOut: 10,
  dmiPeriod: 14, adxMin: 20, sarStep: 0.02, sarMax: 0.2, momPeriod: 120, biasPeriod: 20, biasPct: 7,
  wrPeriod: 14, wrBuy: 80, wrSell: 20, downDays: 3, holdDays: 5, vbPeriod: 20, vbMult: 2, obvPeriod: 20,
};
const ALL: StrategyId[] = ['buy_hold', 'dca', 'ma_cross', 'price_ma', 'macd', 'donchian', 'dmi', 'sar', 'momentum',
  'rsi', 'kd', 'boll', 'bias', 'williams', 'down_streak', 'vol_breakout', 'obv'];

// 1. 每個策略都能跑，淨值有限、交易一買一賣交替
for (const id of ALL) {
  const r = backtest(s, { ...base, strategy: id, capital: id === 'dca' ? 10000 : 1_000_000 });
  assert.equal(r.equity.length, s.close.length, id);
  assert.ok(r.equity.every(v => Number.isFinite(v) && v >= 0), `${id} 淨值異常`);
  if (id !== 'dca' && id !== 'buy_hold') {
    assert.ok(r.trades.length >= 2, `${id} 應該有交易（實際 ${r.trades.length}）`);
    r.trades.forEach((t, i) => assert.equal(t.side, i % 2 === 0 ? '買進' : '賣出', `${id} 第 ${i} 筆買賣順序錯`));
  }
}

// 2. 不偷看未來：改動最後一天之後的資料，不影響之前的交易
for (const id of ALL) {
  const cut = 1800;
  const a = backtest({ ...s, date: s.date.slice(0, cut), open: s.open.slice(0, cut), high: s.high.slice(0, cut), low: s.low.slice(0, cut), close: s.close.slice(0, cut), volume: s.volume.slice(0, cut) }, { ...base, strategy: id });
  const b = backtest(s, { ...base, strategy: id });
  const bt = b.trades.filter(t => t.date <= s.date[cut - 1]);
  assert.deepEqual(a.trades.map(t => t.date + t.side), bt.map(t => t.date + t.side), `${id} 結果受未來資料影響`);
}

// 3. 指標數值檢查
{
  const c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const e = ema(c, 3);
  assert.equal(e[2], 2); assert.ok(Math.abs(e[3]! - 3) < 1e-9);
  const up: DailySeries = { date: c.map(String), open: c, high: c.map(v => v + 0.5), low: c.map(v => v - 0.5), close: c, volume: c.map(() => 100) };
  assert.ok(sarTrend(up).slice(2).every(v => v === true), '一路上漲 SAR 應為多頭');
  assert.ok(williamsR(up, 3).slice(2).every(v => v! > -20), '一路上漲 %R 應接近 0');
  assert.deepEqual(obv(up).slice(0, 4), [0, 100, 200, 300]);
  const m = macd(s.close);
  assert.ok(m.dif.filter(v => v !== null).length > 2000 && m.signal.filter(v => v !== null).length > 2000);
  const d = dmi(s);
  assert.ok(d.adx.filter(v => v !== null).every(v => v! >= 0 && v! <= 100));
}

// 4. 停損：每一筆停損出場，前一天收盤都已跌破門檻
{
  const r = backtest(s, { ...base, strategy: 'ma_cross', stopLoss: 5 });
  const stops = r.trades.filter(t => t.reason === '停損');
  assert.ok(stops.length > 0, '應該觸發停損');
  for (const t of stops) {
    const i = s.date.indexOf(t.date);
    const buy = [...r.trades].reverse().find(x => x.side === '買進' && x.date < t.date)!;
    assert.ok(s.close[i - 1] / buy.price - 1 <= -0.05 + 1e-12, '停損觸發條件錯誤');
  }
}
// 5. 最長持有：持有不超過 N 個交易日
{
  const r = backtest(s, { ...base, strategy: 'price_ma', maxHold: 10 });
  for (let k = 0; k + 1 < r.trades.length; k += 2) {
    const a = s.date.indexOf(r.trades[k].date), b = s.date.indexOf(r.trades[k + 1].date);
    assert.ok(b - a <= 10, `持有 ${b - a} 天超過 10 天`);
  }
  assert.ok(r.trades.some(t => t.reason === '持有到期'));
}
// 6. 大盤濾網：大盤在均線下方時不買進
{
  const market = { date: s.date, close: s.close.map((_, i) => (Math.floor(i / 250) % 2 === 0 ? 100 + i : 100 - i * 0.01)) };
  const r = backtest(s, { ...base, strategy: 'price_ma', marketFilter: 20 }, market);
  const ma: (number | null)[] = market.close.map((_, i) => (i < 19 ? null : market.close.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20));
  for (const t of r.trades.filter(t => t.side === '買進')) {
    const i = s.date.indexOf(t.date);
    assert.ok(ma[i - 1] === null || market.close[i - 1] > ma[i - 1]!, '大盤弱勢時仍買進');
  }
}
// 7. 多策略組合：全部同意的持股時間 ≤ 每個單一策略 ≤ 任一出現；過半數介於兩者之間
{
  const ids: StrategyId[] = ['ma_cross', 'macd', 'rsi'];
  const single = ids.map(id => backtest(s, { ...base, strategy: id }).exposure);
  const ex = (mode: 'and' | 'or' | 'vote') => backtest(s, { ...base, strategy: ids[0], combo: { ids, mode } }).exposure;
  const and = ex('and'), or = ex('or'), vote = ex('vote');
  assert.ok(and <= Math.min(...single) + 1e-3, `全部同意 ${and} 應 ≤ ${Math.min(...single)}`);
  assert.ok(or >= Math.max(...single) - 1e-3, `任一出現 ${or} 應 ≥ ${Math.max(...single)}`);
  assert.ok(and <= vote + 1e-3 && vote <= or + 1e-3, '過半數應介於兩者之間');
  // 只選一個時等同單一策略
  const a = backtest(s, { ...base, strategy: 'macd', combo: { ids: ['macd'], mode: 'and' } });
  const b = backtest(s, { ...base, strategy: 'macd' });
  assert.equal(a.finalValue, b.finalValue);
}
console.log(`strategies.test：${ALL.length} 個策略與風險控管檢查通過`);
