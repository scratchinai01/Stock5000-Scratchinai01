/**
 * 個股學習：分數定義、結果可重現、訓練不會偷看訓練期以後的資料、在有規律的資料上能學到東西。
 */
import assert from 'node:assert/strict';
import { BacktestParams, DailySeries } from '../src/utils/analytics.ts';
import { buildFeatures, trainPolicy, predictProb, toSignal, hindsightScore, runLearning, FEATURE_NAMES } from '../src/utils/learn.ts';

const base: BacktestParams = {
  strategy: 'ma_cross', capital: 1_000_000, feeRate: 0.001425, feeDiscount: 1, minFee: 20, taxRate: 0.003,
  short: 20, long: 60, rsiPeriod: 14, rsiLow: 30, rsiHigh: 70, bollPeriod: 20, bollMult: 2,
  maPeriod: 60, macdFast: 12, macdSlow: 26, macdSignal: 9, donchianIn: 20, donchianOut: 10,
  dmiPeriod: 14, adxMin: 20, sarStep: 0.02, sarMax: 0.2, momPeriod: 120, biasPeriod: 20, biasPct: 7,
  wrPeriod: 14, wrBuy: 80, wrSell: 20, downDays: 3, holdDays: 5, vbPeriod: 20, vbMult: 2, obvPeriod: 20,
};

// 有「趨勢延續」規律的模擬股價：報酬帶有自我相關，動能類特徵應該學得到
function makeSeries(n: number, seed = 11): DailySeries {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const s: DailySeries = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  let p = 100, drift = 0;
  const d0 = Date.UTC(1995, 0, 3);
  for (let i = 0; i < n; i++) {
    drift = 0.97 * drift + (rnd() - 0.5) * 0.004;
    const c = p * (1 + drift + (rnd() - 0.5) * 0.02);
    s.date.push(new Date(d0 + i * 1.46 * 86400000).toISOString().slice(0, 10));
    s.open.push(p); s.high.push(Math.max(p, c) * 1.005); s.low.push(Math.min(p, c) * 0.995); s.close.push(c);
    s.volume.push(Math.round(1e6 * (0.5 + rnd())));
    p = c;
  }
  return s;
}

const s = makeSeries(8000);
assert.equal(FEATURE_NAMES.length, buildFeatures(s, base)[0].length);

// 1. 分數定義：完美預知 = 100、永遠空手 = 0
{
  const perfect = s.close.map((c, t) => (t + 1 < s.close.length ? s.close[t + 1] > c : false));
  assert.ok(Math.abs(hindsightScore(s.close, perfect, 1, s.close.length - 1) - 100) < 1e-9);
  assert.equal(hindsightScore(s.close, s.close.map(() => false), 1, s.close.length - 1), 0);
}

// 2. 結果可重現
const X = buildFeatures(s, base);
const opts = { horizon: 5, cost: 0.003 };
const a = trainPolicy(X, s.close, 250, 3000, opts), b = trainPolicy(X, s.close, 250, 3000, opts);
assert.deepEqual(a.w, b.w);

// 3. 不偷看：把訓練期以後的價格整個換掉，學到的權重不變
{
  const s2: DailySeries = { ...s, close: s.close.map((c, i) => (i > 3000 ? c * (1 + Math.sin(i) * 0.3) : c)), high: s.high.map((c, i) => (i > 3000 ? c * 2 : c)), low: s.low.slice(), open: s.open.slice(), volume: s.volume.slice(), date: s.date };
  const c = trainPolicy(buildFeatures(s2, base), s2.close, 250, 3000, opts);
  assert.deepEqual(a.w, c.w, '訓練結果受到訓練期以後的資料影響');
}

// 4. 有規律的資料：測試期分數應該高於隨便猜（0 分以上）且平滑版換手較少
{
  const { rounds, warnings } = runLearning(s, base, { split1: 2005, split2: 2015, smooth: 10, expanding: true });
  assert.equal(warnings.length, 0, warnings.join());
  assert.equal(rounds.length, 2);
  for (const r of rounds) {
    const [raw, sm] = r.variants;
    assert.ok(raw.testScore > 0, `${r.name} 原始測試分數 ${raw.testScore}`);
    assert.ok(sm.bt.trades.length <= raw.bt.trades.length, `${r.name} 平滑版換手應較少`);
    assert.ok(r.testFrom > r.trainTo, '測試期必須在訓練期之後');
  }
  console.log(rounds.map(r => `${r.name} 訓練 ${r.trainFrom}~${r.trainTo} 測試 ${r.testFrom}~${r.testTo}｜原始 ${r.variants[0].trainScore.toFixed(1)}/${r.variants[0].testScore.toFixed(1)} 平滑 ${r.variants[1].trainScore.toFixed(1)}/${r.variants[1].testScore.toFixed(1)} 持有 ${r.bench.testScore.toFixed(1)}`).join('\n'));
}

// 5. 資料太短會提出警告而不是硬算
{
  const short = makeSeries(1200);
  const { rounds, warnings } = runLearning(short, base, { split1: 2005, split2: 2015, smooth: 10, expanding: true });
  assert.ok(warnings.length > 0 && rounds.length < 2);
}
console.log('learn.test：個股學習檢查通過');
