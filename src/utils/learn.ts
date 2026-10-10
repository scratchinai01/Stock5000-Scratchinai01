/**
 * 個股學習（強化學習實驗）：在「訓練期」用真實漲跌當獎勵，學出一個「持有／空手」決策規則，
 * 再拿到「沒看過的測試期」推測，檢驗是否真的學到東西。
 *
 * 方法（單步強化學習／情境式決策，policy gradient）：
 *   - 狀態 x_t：當天收盤後看得到的 27 個特徵（15 個策略訊號 + 12 個連續指標），只用當天以前的資料。
 *   - 動作：持有（1）或空手（0）；策略 π(x) = sigmoid(w·x + b) 是持有的機率。
 *   - 獎勵：持有時拿到之後的報酬，換手時扣交易成本：
 *       J = 平均[ π_t · R_t ] − 成本 · 平均| π_t − π_{t−1} | − λ‖w‖²
 *     R_t = 之後 H 天的平均日報酬（H = 1 為原始，H > 1 為平滑後的目標）。
 *   - 以梯度上升求 w（Adam，固定初始值，結果可重現）。
 *   - 特徵標準化只用訓練期的平均數與標準差，訓練樣本的 R_t 也不會用到訓練期以後的資料。
 *
 * 分數（100 分制）：100 分 = 每天都事先知道明天漲跌、只在上漲日持有（只做多）的完美結果；
 *   分數 = Σ 持有日報酬 ／ Σ 上漲日報酬 × 100。0 分 = 等於完全不持有；負分 = 比空手還差。
 */
import { BacktestParams, DailySeries, StrategyId, backtest, BacktestResult, strategyState, rsi, kd, macd, dmi, williamsR, sma } from './analytics';

export const LEARN_STRATEGIES: { id: StrategyId; name: string }[] = [
  { id: 'ma_cross', name: '均線交叉多頭' },
  { id: 'price_ma', name: '站上均線' },
  { id: 'macd', name: 'MACD 多頭' },
  { id: 'donchian', name: '通道突破' },
  { id: 'dmi', name: 'DMI 多方' },
  { id: 'sar', name: 'SAR 翻多' },
  { id: 'momentum', name: '動能為正' },
  { id: 'rsi', name: 'RSI 超賣訊號' },
  { id: 'kd', name: 'KD 低檔交叉' },
  { id: 'boll', name: '布林下軌訊號' },
  { id: 'bias', name: '負乖離訊號' },
  { id: 'williams', name: '威廉超賣訊號' },
  { id: 'down_streak', name: '連跌反彈訊號' },
  { id: 'vol_breakout', name: '帶量突破' },
  { id: 'obv', name: 'OBV 資金流入' },
];
export const LEARN_CONTINUOUS = [
  'RSI 高低', 'K 值高低', '20 日乖離', 'MACD 柱狀體', 'ADX 趨勢強度', '+DI − −DI', '5 日漲跌', '20 日漲跌', '60 日漲跌',
  '20 日波動度', '量能放大倍數', '一年區間位置',
];
export const FEATURE_NAMES = [...LEARN_STRATEGIES.map(x => x.name), ...LEARN_CONTINUOUS];

/** 每天的特徵（null 代表還在暖機期） */
export function buildFeatures(s: DailySeries, p: BacktestParams): (number | null)[][] {
  const n = s.close.length;
  const states = LEARN_STRATEGIES.map(x => strategyState(s, p, x.id));
  const r = rsi(s.close, 14), k = kd(s).k, m = macd(s.close), d = dmi(s, 14), ma20 = sma(s.close, 20);
  const vol = s.volume.map(v => v || 0), avgVol = sma(vol, 20);
  const ret = (i: number, h: number) => (i >= h ? s.close[i] / s.close[i - h] - 1 : null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < n; i++) {
    let vol20: number | null = null;
    if (i >= 20) {
      let a = 0, b = 0;
      for (let j = i - 19; j <= i; j++) { const x = s.close[j] / s.close[j - 1] - 1; a += x; b += x * x; }
      vol20 = Math.sqrt(Math.max(b / 20 - (a / 20) ** 2, 0));
    }
    let pos52: number | null = null;
    if (i >= 249) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - 249; j <= i; j++) { hi = Math.max(hi, s.high[j]); lo = Math.min(lo, s.low[j]); }
      pos52 = hi > lo ? (s.close[i] - lo) / (hi - lo) : 0.5;
    }
    const hist = m.dif[i] !== null && m.signal[i] !== null ? (m.dif[i]! - m.signal[i]!) / s.close[i] : null;
    rows.push([
      ...states.map(st => (st[i] ? 1 : 0)),
      r[i] === null ? null : r[i]! / 100,
      k[i] === null ? null : k[i]! / 100,
      ma20[i] === null ? null : s.close[i] / ma20[i]! - 1,
      hist,
      d.adx[i] === null ? null : d.adx[i]! / 100,
      d.pdi[i] === null || d.mdi[i] === null ? null : (d.pdi[i]! - d.mdi[i]!) / 100,
      ret(i, 5), ret(i, 20), ret(i, 60),
      vol20,
      avgVol[i - 1] && avgVol[i - 1]! > 0 && i > 0 ? Math.log((vol[i] + 1) / (avgVol[i - 1]! + 1)) : null,
      pos52,
    ]);
  }
  return rows;
}

/** 之後 H 天的平均日報酬（持有決策在收盤做出、從下一天開始承擔漲跌） */
export function forwardReward(close: number[], h: number): (number | null)[] {
  const n = close.length;
  return close.map((_, t) => {
    if (t + h >= n) return null;
    let sum = 0;
    for (let j = t + 1; j <= t + h; j++) sum += close[j] / close[j - 1] - 1;
    return sum / h;
  });
}

export interface Policy { w: number[]; b: number; mean: number[]; std: number[] }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/**
 * 在 [from, to]（含）訓練；只用 t + H ≤ to 的樣本，獎勵不會用到訓練期以後的價格。
 */
export function trainPolicy(
  X: (number | null)[][], close: number[], from: number, to: number,
  opts: { horizon: number; cost: number; l2?: number; epochs?: number; lr?: number },
): Policy {
  const d = X[0]?.length ?? 0;
  const R = forwardReward(close, opts.horizon);
  const idx: number[] = [];
  for (let t = Math.max(from, 1); t + opts.horizon <= to; t++) if (R[t] !== null) idx.push(t);
  // 標準化：只用訓練期
  const mean = new Array(d).fill(0), std = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    let a = 0, b = 0, c = 0;
    for (const t of idx) { const v = X[t][j]; if (v !== null && isFinite(v)) { a += v; b += v * v; c++; } }
    if (c > 1) { mean[j] = a / c; std[j] = Math.sqrt(Math.max(b / c - mean[j] ** 2, 0)) || 1; }
  }
  const Z = idx.map(t => X[t].map((v, j) => (v === null || !isFinite(v) ? 0 : (v - mean[j]) / std[j])));
  // 獎勵換算成「%／天」，梯度尺度比較穩定
  const Rs = idx.map(t => R[t]! * 100);
  const cost = opts.cost * 100; // 每單位換手成本（%）
  const l2 = opts.l2 ?? 0.002, epochs = opts.epochs ?? 300, lr = opts.lr ?? 0.05;
  const w = new Array(d).fill(0);
  let b = 0;
  const mW = new Array(d + 1).fill(0), vW = new Array(d + 1).fill(0);
  const N = idx.length;
  if (N < 50) return { w, b, mean, std };
  const pi = new Array(N).fill(0.5);
  for (let ep = 1; ep <= epochs; ep++) {
    for (let k = 0; k < N; k++) { let z = b; const zr = Z[k]; for (let j = 0; j < d; j++) z += w[j] * zr[j]; pi[k] = sigmoid(z); }
    const g = new Array(d + 1).fill(0);
    for (let k = 0; k < N; k++) {
      // ∂J/∂π_k：報酬 − 換手成本（|π_k − π_{k−1}| 與 |π_{k+1} − π_k| 兩項）
      let dJ = Rs[k];
      if (k > 0 && idx[k - 1] === idx[k] - 1) dJ -= cost * Math.sign(pi[k] - pi[k - 1]);
      if (k + 1 < N && idx[k + 1] === idx[k] + 1) dJ += cost * Math.sign(pi[k + 1] - pi[k]);
      const s = dJ * pi[k] * (1 - pi[k]) / N;
      const zr = Z[k];
      for (let j = 0; j < d; j++) g[j] += s * zr[j];
      g[d] += s;
    }
    for (let j = 0; j < d; j++) g[j] -= 2 * l2 * w[j];
    // Adam（梯度上升）
    for (let j = 0; j <= d; j++) {
      mW[j] = 0.9 * mW[j] + 0.1 * g[j];
      vW[j] = 0.999 * vW[j] + 0.001 * g[j] * g[j];
      const mh = mW[j] / (1 - 0.9 ** ep), vh = vW[j] / (1 - 0.999 ** ep);
      const step = (lr * mh) / (Math.sqrt(vh) + 1e-8);
      if (j < d) w[j] += step; else b += step;
    }
  }
  return { w, b, mean, std };
}

export function predictProb(pol: Policy, X: (number | null)[][]): number[] {
  return X.map(row => {
    let z = pol.b;
    for (let j = 0; j < row.length; j++) { const v = row[j]; z += pol.w[j] * (v === null || !isFinite(v) ? 0 : (v - pol.mean[j]) / pol.std[j]); }
    return sigmoid(z);
  });
}

/** 原始：機率 > 0.5 持有。平滑：機率先做 k 日指數平均，再用 0.55／0.45 遲滯區間，減少來回進出 */
export function toSignal(prob: number[], smooth: number): (boolean | null)[] {
  if (smooth <= 1) return prob.map(p => p > 0.5);
  const a = 2 / (smooth + 1);
  let e = prob[0] ?? 0.5;
  return prob.map((p, i) => {
    e = i === 0 ? p : a * p + (1 - a) * e;
    return e > 0.55 ? true : e < 0.45 ? false : null;
  });
}

/** 100 分制：Σ 持有日報酬 ／ Σ 上漲日報酬（訊號收盤確認，隔天起承擔漲跌） */
export function hindsightScore(close: number[], signal: (boolean | null)[], from: number, to: number): number {
  let cur = false, got = 0, best = 0;
  for (let t = Math.max(from, 1); t <= to; t++) {
    const r = close[t] / close[t - 1] - 1;
    if (r > 0) best += r;
    if (cur) got += r;
    const w = signal[t];
    if (w !== null && w !== undefined) cur = w;
  }
  return best > 0 ? (got / best) * 100 : 0;
}

export interface LearnVariant {
  label: '原始' | '平滑';
  trainScore: number;
  testScore: number;
  bt: BacktestResult;
  policy: Policy;
}
export interface LearnRound {
  name: string;
  trainFrom: string; trainTo: string; testFrom: string; testTo: string;
  trainYears: number;
  variants: LearnVariant[];
  bench: { trainScore: number; testScore: number; bt: BacktestResult };
}

export interface LearnOptions {
  split1: number;          // 第一個測試期起始年（預設 2005）
  split2: number;          // 第二個測試期起始年（預設 2015）
  smooth: number;          // 平滑天數（目標與訊號共用）
  expanding: boolean;      // true：訓練期從頭累積；false：只用前一段
}

function firstIndexOnOrAfter(dates: string[], d: string) {
  const i = dates.findIndex(x => x >= d);
  return i < 0 ? dates.length : i;
}

function slice(s: DailySeries, a: number, b: number): DailySeries {
  return { date: s.date.slice(a, b + 1), open: s.open.slice(a, b + 1), high: s.high.slice(a, b + 1), low: s.low.slice(a, b + 1), close: s.close.slice(a, b + 1), volume: s.volume.slice(a, b + 1) };
}

/** 兩階段前進式驗證：訓練 → 推測下一段；每段都跑「原始」與「平滑」兩個版本 */
export function runLearning(s: DailySeries, p: BacktestParams, o: LearnOptions): { rounds: LearnRound[]; warnings: string[] } {
  const n = s.close.length;
  const warnings: string[] = [];
  const X = buildFeatures(s, p);
  const warm = 250; // 一年區間位置等特徵需要一年暖機
  const c1 = firstIndexOnOrAfter(s.date, `${o.split1}-01-01`);
  const c2 = firstIndexOnOrAfter(s.date, `${o.split2}-01-01`);
  const plan = [
    { name: '第一階段', trainFrom: warm, trainTo: c1 - 1, testFrom: c1, testTo: c2 - 1 },
    { name: '第二階段', trainFrom: o.expanding ? warm : c1, trainTo: c2 - 1, testFrom: c2, testTo: n - 1 },
  ];
  const cost = p.feeRate * p.feeDiscount + p.taxRate / 2; // 單邊平均成本
  const rounds: LearnRound[] = [];
  for (const pl of plan) {
    const trainDays = pl.trainTo - pl.trainFrom + 1, testDays = pl.testTo - pl.testFrom + 1;
    if (trainDays < 500 || testDays < 120) {
      warnings.push(`${pl.name}資料不足（訓練 ${Math.max(trainDays, 0)} 天、測試 ${Math.max(testDays, 0)} 天），已略過；這檔股票上市較晚或切點年份太早／太晚。`);
      continue;
    }
    const variants: LearnVariant[] = (['原始', '平滑'] as const).map(label => {
      const h = label === '原始' ? 1 : Math.max(2, o.smooth);
      const pol = trainPolicy(X, s.close, pl.trainFrom, pl.trainTo, { horizon: h, cost });
      const sig = toSignal(predictProb(pol, X), label === '原始' ? 1 : o.smooth);
      const bt = backtest(slice(s, pl.testFrom, pl.testTo), { ...p, customSignal: sig.slice(pl.testFrom, pl.testTo + 1), stopLoss: 0, takeProfit: 0, maxHold: 0, marketFilter: 0, combo: undefined });
      return {
        label, policy: pol, bt,
        trainScore: hindsightScore(s.close, sig, pl.trainFrom, pl.trainTo),
        testScore: hindsightScore(s.close, sig, pl.testFrom, pl.testTo),
      };
    });
    const all = s.close.map(() => true);
    rounds.push({
      name: pl.name,
      trainFrom: s.date[pl.trainFrom], trainTo: s.date[pl.trainTo], testFrom: s.date[pl.testFrom], testTo: s.date[pl.testTo],
      trainYears: trainDays / 250,
      variants,
      bench: {
        trainScore: hindsightScore(s.close, all, pl.trainFrom, pl.trainTo),
        testScore: hindsightScore(s.close, all, pl.testFrom, pl.testTo),
        bt: backtest(slice(s, pl.testFrom, pl.testTo), { ...p, strategy: 'buy_hold', combo: undefined, customSignal: undefined }),
      },
    });
  }
  return { rounds, warnings };
}

/** 依權重找出模型最看重的特徵（特徵已標準化，權重大小可互相比較） */
export function topWeights(pol: Policy, k = 5) {
  const items = pol.w.map((w, j) => ({ name: FEATURE_NAMES[j], w })).filter(x => Math.abs(x.w) > 1e-6);
  return {
    pos: items.filter(x => x.w > 0).sort((a, b) => b.w - a.w).slice(0, k),
    neg: items.filter(x => x.w < 0).sort((a, b) => a.w - b.w).slice(0, k),
  };
}
