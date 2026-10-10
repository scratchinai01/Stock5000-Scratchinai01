/**
 * 個股／產業學習：分數定義、波段標記、結果可重現、訓練不偷看未來、在有規律的資料上學得到、產業合併可推測短歷史股票。
 */
import assert from 'node:assert/strict';
import { BacktestParams, DailySeries } from '../src/utils/analytics.ts';
import { buildFeatures, hindsightScore, runLearning, runPooled, makeMember, fitRound, zigzag, cycleLabels, cycleStats, FEATURE_NAMES, DEFAULT_LEARN } from '../src/utils/learn.ts';

const base: BacktestParams = {
  strategy: 'ma_cross', capital: 1_000_000, feeRate: 0.001425, feeDiscount: 1, minFee: 20, taxRate: 0.003,
  short: 20, long: 60, rsiPeriod: 14, rsiLow: 30, rsiHigh: 70, bollPeriod: 20, bollMult: 2,
  maPeriod: 60, macdFast: 12, macdSlow: 26, macdSignal: 9, donchianIn: 20, donchianOut: 10,
  dmiPeriod: 14, adxMin: 20, sarStep: 0.02, sarMax: 0.2, momPeriod: 120, biasPeriod: 20, biasPct: 7,
  wrPeriod: 14, wrBuy: 80, wrSell: 20, downDays: 3, holdDays: 5, vbPeriod: 20, vbMult: 2, obvPeriod: 20,
};

// 有「循環＋趨勢延續」的模擬股價
function makeSeries(n: number, seed = 11, start = Date.UTC(1995, 0, 3)): DailySeries {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const s: DailySeries = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  let p = 100, drift = 0;
  for (let i = 0; i < n; i++) {
    drift = 0.97 * drift + (rnd() - 0.5) * 0.004 + Math.sin(i / 160) * 0.0004;
    const c = p * (1 + drift + (rnd() - 0.5) * 0.02);
    s.date.push(new Date(start + i * 1.46 * 86400000).toISOString().slice(0, 10));
    s.open.push(p); s.high.push(Math.max(p, c) * 1.005); s.low.push(Math.min(p, c) * 0.995); s.close.push(c);
    s.volume.push(Math.round(1e6 * (0.5 + rnd())));
    p = c;
  }
  return s;
}
const s = makeSeries(8000);
assert.equal(FEATURE_NAMES.length, buildFeatures(s, base)[0].length);

// 1. 分數定義
{
  const perfect = s.close.map((c, t) => (t + 1 < s.close.length ? s.close[t + 1] > c : false));
  assert.ok(Math.abs(hindsightScore(s.close, perfect, 1, s.close.length - 1) - 100) < 1e-9);
  assert.equal(hindsightScore(s.close, s.close.map(() => false), 1, s.close.length - 1), 0);
}

// 2. 波段：高低點交替出現、每段漲跌幅都 ≥ 門檻；標籤在低點→高點之間為 1
{
  const c = [100, 90, 80, 100, 120, 110, 95, 85, 100, 130];
  const piv = zigzag(c, 0, c.length - 1, 0.2);
  assert.deepEqual(piv.map(p => p.type + p.idx), ['peak0', 'trough2', 'peak4', 'trough7']);
  const y = cycleLabels(c.length, piv);
  assert.deepEqual(y, [0, 0, 1, 1, 0, 0, 0, null, null, null]);
  const big = zigzag(s.close, 0, s.close.length - 1, 0.25);
  for (let k = 1; k < big.length; k++) {
    assert.notEqual(big[k].type, big[k - 1].type);
    assert.ok(Math.abs(s.close[big[k].idx] / s.close[big[k - 1].idx] - 1) >= 0.25 - 1e-9);
  }
  assert.ok(cycleStats(s.close, big).cycles > 3);
}

// 3. 可重現、不偷看：把訓練期以後的價格整個換掉，模型不變
{
  const m = makeMember('A', 'A', s, base);
  const win = { trainFrom: 250, trainTo: 3000, testFrom: 3001, testTo: 5000 };
  const a = fitRound([{ m, win }], base, DEFAULT_LEARN)!, b = fitRound([{ m, win }], base, DEFAULT_LEARN)!;
  assert.deepEqual(a.smooth.w, b.smooth.w);
  const s2: DailySeries = { ...s, close: s.close.map((c, i) => (i > 3000 ? c * (1 + Math.sin(i) * 0.3) : c)), high: s.high.map((c, i) => (i > 3000 ? c * 2 : c)) };
  const c = fitRound([{ m: makeMember('A', 'A', s2, base), win }], base, DEFAULT_LEARN)!;
  assert.deepEqual(a.cycle.w, c.cycle.w, '循環模型受到訓練期以後的資料影響');
  assert.deepEqual(a.raw.w, c.raw.w, '交易模型受到訓練期以後的資料影響');
  assert.deepEqual(a.smooth.w, c.smooth.w, '平滑模型受到訓練期以後的資料影響');
}

// 4. 有規律的資料：測試期分數 > 0、平滑版換手較少、循環辨識準確率 > 50%
{
  const { rounds, warnings } = runLearning(s, base, DEFAULT_LEARN);
  assert.equal(warnings.length, 0, warnings.join());
  assert.equal(rounds.length, 2);
  for (const r of rounds) {
    const [raw, sm] = r.variants;
    assert.ok(raw.testScore > 0, `${r.name} 原始測試分數 ${raw.testScore}`);
    assert.ok(sm.bt.trades.length <= raw.bt.trades.length, `${r.name} 平滑版換手應較少`);
    assert.ok(r.testFrom > r.trainTo);
    assert.ok((r.cycle.acc ?? 0) > 0.5, `${r.name} 循環準確率 ${r.cycle.acc}`);
  }
  console.log(rounds.map(r => `${r.name}｜原始 ${r.variants[0].trainScore.toFixed(1)}/${r.variants[0].testScore.toFixed(1)} 平滑 ${r.variants[1].trainScore.toFixed(1)}/${r.variants[1].testScore.toFixed(1)} 持有 ${r.bench.testScore.toFixed(1)}｜循環準確 ${((r.cycle.acc ?? 0) * 100).toFixed(0)}% AUC ${r.cycle.auc?.toFixed(2)} 低點延遲 ${r.cycle.troughLag} 高點延遲 ${r.cycle.peakLag}`).join('\n'));
}

// 5. 歷史太短：單檔會警告；產業合併仍可推測它
{
  const short = makeSeries(4200, 5, Date.UTC(2006, 0, 3));
  const single = runLearning(short, base, DEFAULT_LEARN);
  assert.ok(single.warnings.length > 0);
  const pooled = runPooled([makeMember('L', 'L', s, base), makeMember('S', 'S', short, base)], base, DEFAULT_LEARN);
  const r = pooled.get('S') ?? [];
  assert.ok(r.some(x => x.name === '第二階段'), '短歷史股票應可用合併模型推測第二階段');
}
console.log('learn.test：個股／產業學習檢查通過');
