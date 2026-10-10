/**
 * 個股／產業學習（強化學習實驗）
 *
 * 研究流程（前進式驗證）：
 *   第一階段：訓練到 split1 前一年 → 推測 split1～split2 前一年（模型凍結）
 *   第二階段：訓練到 split2 前一年 → 推測 split2 至今
 *
 * 兩個模型一起學：
 *   1. 循環辨識：用「事後」的波段高低點（漲跌 ≥ θ 才算轉折，zigzag）標出每天位於上升段或下降段，
 *      以羅吉斯迴歸學「只看當時資料，現在像上升段的機率 P(上升段)」。
 *   2. 交易決策（單步強化學習／policy gradient）：狀態 = 27 個複合指標 + P(上升段)；動作 = 持有／空手；
 *      獎勵 = 持有時之後的報酬（下跌時乘上 1+κ 加重懲罰），換手扣交易成本。
 *
 * 每段都比較「原始」與「平滑」：
 *   原始：獎勵用隔天漲跌、機率 > 0.5 就持有。
 *   平滑：獎勵用之後 H 天平均漲跌；輸出機率做 H 日指數平均，0.55 以上才買、0.45 以下才賣。
 *
 * 防止偷看未來：指標只用當天以前的資料；循環標籤、標準化、獎勵都只用訓練期內的價格；
 * 推測期的事後高低點只用來「評分」，不參與訓練。
 *
 * 分數（100 分制）：Σ 持有日報酬 ／ Σ 上漲日報酬 × 100（100 = 每天事先知道漲跌、只做多）。
 */
import { BacktestParams, BacktestResult, DailySeries, StrategyId, backtest, strategyState, rsi, kd, macd, dmi, sma } from './analytics';

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
export const POLICY_FEATURE_NAMES = [...FEATURE_NAMES, '循環：上升段機率'];
export const WARMUP = 250;

type Row = (number | null)[];

/** 每天的特徵（null 代表還在暖機期），只用當天以前的資料 */
export function buildFeatures(s: DailySeries, p: BacktestParams): Row[] {
  const n = s.close.length;
  const states = LEARN_STRATEGIES.map(x => strategyState(s, p, x.id));
  const r = rsi(s.close, 14), k = kd(s).k, m = macd(s.close), d = dmi(s, 14), ma20 = sma(s.close, 20);
  const vol = s.volume.map(v => v || 0), avgVol = sma(vol, 20);
  const ret = (i: number, h: number) => (i >= h ? s.close[i] / s.close[i - h] - 1 : null);
  const rows: Row[] = [];
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
      i > 0 && avgVol[i - 1] && avgVol[i - 1]! > 0 ? Math.log((vol[i] + 1) / (avgVol[i - 1]! + 1)) : null,
      pos52,
    ]);
  }
  return rows;
}

// ───────────────────────── 循環（波段高低點） ─────────────────────────
export interface Pivot { idx: number; type: 'peak' | 'trough' }

/** zigzag：只用 [from, to] 內的價格；反向走勢達 θ（例如 0.25 = 25%）才確認前一個高點／低點 */
export function zigzag(close: number[], from: number, to: number, theta: number): Pivot[] {
  const piv: Pivot[] = [];
  if (to - from < 2) return piv;
  let dir = 0, ext = from, hiI = from, loI = from;
  for (let i = from + 1; i <= to; i++) {
    const c = close[i];
    if (dir === 0) {
      if (c > close[hiI]) hiI = i;
      if (c < close[loI]) loI = i;
      if (c >= close[loI] * (1 + theta) && loI < i) { piv.push({ idx: loI, type: 'trough' }); dir = 1; ext = i; }
      else if (c <= close[hiI] * (1 - theta) && hiI < i) { piv.push({ idx: hiI, type: 'peak' }); dir = -1; ext = i; }
    } else if (dir === 1) {
      if (c > close[ext]) ext = i;
      else if (c <= close[ext] * (1 - theta)) { piv.push({ idx: ext, type: 'peak' }); dir = -1; ext = i; }
    } else {
      if (c < close[ext]) ext = i;
      else if (c >= close[ext] * (1 + theta)) { piv.push({ idx: ext, type: 'trough' }); dir = 1; ext = i; }
    }
  }
  return piv;
}

/** 「當時就知道」的波段方向：最近一次被確認的轉折之後是上升（1）還是下降（0）——作為循環辨識的樸素基準 */
export function zigzagState(close: number[], from: number, to: number, theta: number): (0 | 1 | null)[] {
  const out: (0 | 1 | null)[] = new Array(close.length).fill(null);
  let dir = 0, ext = from, hiI = from, loI = from;
  for (let i = from + 1; i <= to; i++) {
    const c = close[i];
    if (dir === 0) {
      if (c > close[hiI]) hiI = i;
      if (c < close[loI]) loI = i;
      if (c >= close[loI] * (1 + theta) && loI < i) { dir = 1; ext = i; }
      else if (c <= close[hiI] * (1 - theta) && hiI < i) { dir = -1; ext = i; }
    } else if (dir === 1) {
      if (c > close[ext]) ext = i;
      else if (c <= close[ext] * (1 - theta)) { dir = -1; ext = i; }
    } else {
      if (c < close[ext]) ext = i;
      else if (c >= close[ext] * (1 + theta)) { dir = 1; ext = i; }
    }
    out[i] = dir === 0 ? null : dir === 1 ? 1 : 0;
  }
  return out;
}

/** 依高低點標記：低點→高點之間 = 1（上升段），高點→低點之間 = 0（下降段）；第一個與最後一個轉折點之外 = null */
export function cycleLabels(n: number, piv: Pivot[]): (0 | 1 | null)[] {
  const y: (0 | 1 | null)[] = new Array(n).fill(null);
  for (let k = 0; k + 1 < piv.length; k++) {
    const v = piv[k].type === 'trough' ? 1 : 0;
    for (let t = piv[k].idx; t < piv[k + 1].idx; t++) y[t] = v;
  }
  return y;
}

export interface CycleStats { cycles: number; avgYears: number | null; avgRise: number | null; avgFall: number | null; pivots: number }
/** 描述性統計：完整循環（低點→低點）次數、平均週期、平均漲幅／跌幅 */
export function cycleStats(close: number[], piv: Pivot[]): CycleStats {
  const troughs = piv.filter(x => x.type === 'trough');
  const lens: number[] = [], rises: number[] = [], falls: number[] = [];
  for (let k = 1; k < troughs.length; k++) lens.push((troughs[k].idx - troughs[k - 1].idx) / 250);
  for (let k = 0; k + 1 < piv.length; k++) {
    const ch = close[piv[k + 1].idx] / close[piv[k].idx] - 1;
    (piv[k].type === 'trough' ? rises : falls).push(ch);
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { cycles: lens.length, avgYears: avg(lens), avgRise: avg(rises), avgFall: avg(falls), pivots: piv.length };
}

// ───────────────────────── 模型 ─────────────────────────
export interface Model { w: number[]; b: number; mean: number[]; std: number[] }
const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

interface Block { rows: number[][]; target: number[]; contiguous: boolean[] }

function standardize(blocks: Block[], d: number) {
  const mean = new Array(d).fill(0), std = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    let a = 0, b = 0, c = 0;
    for (const bl of blocks) for (const r of bl.rows) { const v = r[j]; if (isFinite(v)) { a += v; b += v * v; c++; } }
    if (c > 1) { mean[j] = a / c; std[j] = Math.sqrt(Math.max(b / c - mean[j] ** 2, 0)) || 1; }
  }
  return { mean, std };
}

/** Adam 梯度上升的共用迴圈；grad 回傳每個樣本的 ∂J/∂z */
function optimize(blocks: Block[], d: number, l2: number, epochs: number, lr: number,
  grad: (bl: Block, k: number, pi: number[], N: number) => number): Model {
  const { mean, std } = standardize(blocks, d);
  const Z = blocks.map(bl => bl.rows.map(r => r.map((v, j) => (isFinite(v) ? (v - mean[j]) / std[j] : 0))));
  const N = blocks.reduce((s, b) => s + b.rows.length, 0);
  const w = new Array(d).fill(0);
  let b = 0;
  if (N < 50) return { w, b, mean, std };
  const m1 = new Array(d + 1).fill(0), m2 = new Array(d + 1).fill(0);
  const PI = blocks.map(bl => new Array(bl.rows.length).fill(0.5));
  for (let ep = 1; ep <= epochs; ep++) {
    for (let q = 0; q < blocks.length; q++) {
      const z = Z[q], pi = PI[q];
      for (let k = 0; k < z.length; k++) { let s = b; const r = z[k]; for (let j = 0; j < d; j++) s += w[j] * r[j]; pi[k] = sigmoid(s); }
    }
    const g = new Array(d + 1).fill(0);
    for (let q = 0; q < blocks.length; q++) {
      const z = Z[q];
      for (let k = 0; k < z.length; k++) {
        const s = grad(blocks[q], k, PI[q], N);
        const r = z[k];
        for (let j = 0; j < d; j++) g[j] += s * r[j];
        g[d] += s;
      }
    }
    for (let j = 0; j < d; j++) g[j] -= 2 * l2 * w[j];
    for (let j = 0; j <= d; j++) {
      m1[j] = 0.9 * m1[j] + 0.1 * g[j];
      m2[j] = 0.999 * m2[j] + 0.001 * g[j] * g[j];
      const step = (lr * (m1[j] / (1 - 0.9 ** ep))) / (Math.sqrt(m2[j] / (1 - 0.999 ** ep)) + 1e-8);
      if (j < d) w[j] += step; else b += step;
    }
  }
  return { w, b, mean, std };
}

/** 羅吉斯迴歸（循環辨識）：最大化對數概似 */
function fitLogistic(blocks: Block[], d: number): Model {
  return optimize(blocks, d, 0.002, 250, 0.05, (bl, k, pi, N) => (bl.target[k] - pi[k]) / N);
}

/** 交易策略（policy gradient）：J = 平均[π·R] − 成本·平均|Δπ| */
function fitPolicy(blocks: Block[], d: number, cost: number): Model {
  const c = cost * 100;
  return optimize(blocks, d, 0.002, 300, 0.05, (bl, k, pi, N) => {
    let dJ = bl.target[k];
    if (k > 0 && bl.contiguous[k]) dJ -= c * Math.sign(pi[k] - pi[k - 1]);
    if (k + 1 < pi.length && bl.contiguous[k + 1]) dJ += c * Math.sign(pi[k + 1] - pi[k]);
    return (dJ * pi[k] * (1 - pi[k])) / N;
  });
}

export function predict(m: Model, X: Row[]): number[] {
  return X.map(r => {
    let z = m.b;
    for (let j = 0; j < m.w.length; j++) { const v = r[j]; z += m.w[j] * (v === null || !isFinite(v as number) ? 0 : ((v as number) - m.mean[j]) / m.std[j]); }
    return sigmoid(z);
  });
}

const num = (v: number | null) => (v === null || !isFinite(v) ? NaN : v);

/** 之後 H 天的平均日報酬（收盤決定、隔天起承擔漲跌） */
export function forwardReward(close: number[], h: number): (number | null)[] {
  const n = close.length;
  return close.map((_, t) => {
    if (t + h >= n) return null;
    let sum = 0;
    for (let j = t + 1; j <= t + h; j++) sum += close[j] / close[j - 1] - 1;
    return sum / h;
  });
}

export function toSignal(prob: number[], smooth: number): (boolean | null)[] {
  if (smooth <= 1) return prob.map(p => p > 0.5);
  const a = 2 / (smooth + 1);
  let e = prob[0] ?? 0.5;
  return prob.map((p, i) => {
    e = i === 0 ? p : a * p + (1 - a) * e;
    return e > 0.55 ? true : e < 0.45 ? false : null;
  });
}

const ema = (x: number[], k: number) => { const a = 2 / (k + 1); let e = x[0] ?? 0.5; return x.map((v, i) => (e = i === 0 ? v : a * v + (1 - a) * e)); };

/** 100 分制：Σ 持有日報酬 ／ Σ 上漲日報酬 */
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

/** 二元分類的 AUC（排序法） */
function auc(p: number[], y: number[]) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  let rank = 0, pos = 0, sumR = 0;
  for (const i of idx) { rank++; if (y[i] === 1) { pos++; sumR += rank; } }
  const neg = y.length - pos;
  return pos && neg ? (sumR - (pos * (pos + 1)) / 2) / (pos * neg) : NaN;
}

// ───────────────────────── 前進式驗證 ─────────────────────────
export interface LearnOptions {
  split1: number; split2: number;  // 推測期起始年（預設 2005、2015）
  smooth: number;                  // 平滑天數
  expanding: boolean;              // 第二階段訓練資料：從頭累積 or 只用前一段
  theta: number;                   // 波段轉折門檻（0.25 = 25%）
  kappa: number;                   // 下跌懲罰（1 = 下跌日的損失算兩倍）
}
export const DEFAULT_LEARN: LearnOptions = { split1: 2005, split2: 2015, smooth: 10, expanding: true, theta: 0.25, kappa: 1 };

export interface Member { id: string; name: string; s: DailySeries; X: Row[] }
export function makeMember(id: string, name: string, s: DailySeries, p: BacktestParams): Member {
  return { id, name, s, X: buildFeatures(s, p) };
}

interface Win { trainFrom: number; trainTo: number; testFrom: number; testTo: number }
const idxOf = (dates: string[], d: string) => { const i = dates.findIndex(x => x >= d); return i < 0 ? dates.length : i; };

function windowsFor(m: Member, o: LearnOptions): ({ name: string; win: Win } | { name: string; skip: string })[] {
  const n = m.s.close.length, d = m.s.date;
  const c1 = idxOf(d, `${o.split1}-01-01`), c2 = idxOf(d, `${o.split2}-01-01`);
  const plans = [
    { name: '第一階段', win: { trainFrom: WARMUP, trainTo: c1 - 1, testFrom: Math.max(c1, WARMUP), testTo: c2 - 1 } },
    { name: '第二階段', win: { trainFrom: o.expanding ? WARMUP : Math.max(c1, WARMUP), trainTo: c2 - 1, testFrom: Math.max(c2, WARMUP), testTo: n - 1 } },
  ];
  return plans.map(pl => {
    const te = pl.win.testTo - pl.win.testFrom + 1;
    return te < 120 ? { name: pl.name, skip: `推測期資料不足（${Math.max(te, 0)} 天）` } : pl;
  });
}

export interface RoundModels { cycle: Model; raw: Model; smooth: Model; members: number }

/** 在每個成員的訓練期合併樣本，學出循環模型與兩個交易策略（單檔就是只有一個成員） */
export function fitRound(members: { m: Member; win: Win }[], p: BacktestParams, o: LearnOptions): RoundModels | null {
  const usable = members.filter(x => x.win.trainTo - x.win.trainFrom + 1 >= 500);
  if (!usable.length) return null;
  const d = FEATURE_NAMES.length;
  // 1. 循環辨識：標籤只用訓練期內的價格
  const cyc: Block[] = usable.map(({ m, win }) => {
    const y = cycleLabels(m.s.close.length, zigzag(m.s.close, win.trainFrom, win.trainTo, o.theta));
    const rows: number[][] = [], target: number[] = [];
    for (let t = win.trainFrom; t <= win.trainTo; t++) if (y[t] !== null) { rows.push(m.X[t].map(num)); target.push(y[t]!); }
    return { rows, target, contiguous: rows.map(() => false) };
  });
  const cycle = fitLogistic(cyc, d);
  // 2. 交易策略：特徵加上 P(上升段)；獎勵只用訓練期內的價格，下跌加重懲罰
  const cost = p.feeRate * p.feeDiscount + p.taxRate / 2;
  const policy = (h: number) => {
    const blocks: Block[] = usable.map(({ m, win }) => {
      const P = predict(cycle, m.X), R = forwardReward(m.s.close, h);
      const rows: number[][] = [], target: number[] = [], contiguous: boolean[] = [];
      let last = -2;
      for (let t = Math.max(win.trainFrom, 1); t + h <= win.trainTo; t++) {
        const r = R[t];
        if (r === null) continue;
        rows.push([...m.X[t].map(num), P[t]]);
        target.push((r < 0 ? r * (1 + o.kappa) : r) * 100);
        contiguous.push(last === t - 1);
        last = t;
      }
      return { rows, target, contiguous };
    });
    return fitPolicy(blocks, d + 1, cost);
  };
  return { cycle, raw: policy(1), smooth: policy(Math.max(2, o.smooth)), members: usable.length };
}

export interface VariantResult { label: '原始' | '平滑'; trainScore: number; testScore: number; bt: BacktestResult; exposure: number }
export interface CycleEval { acc: number | null; baseAcc: number | null; auc: number | null; troughLag: number | null; peakLag: number | null; turns: number; detected: number }
export interface MemberRound {
  name: string; trainFrom: string; trainTo: string; testFrom: string; testTo: string; trainYears: number;
  variants: VariantResult[];
  bench: { trainScore: number; testScore: number; bt: BacktestResult };
  cycle: CycleEval;
}

const slice = (s: DailySeries, a: number, b: number): DailySeries => ({
  date: s.date.slice(a, b + 1), open: s.open.slice(a, b + 1), high: s.high.slice(a, b + 1), low: s.low.slice(a, b + 1), close: s.close.slice(a, b + 1), volume: s.volume.slice(a, b + 1),
});

/** 用已訓練好的模型推測這個成員的推測期，並計分 */
export function evalMember(m: Member, win: Win, name: string, models: RoundModels, p: BacktestParams, o: LearnOptions): MemberRound {
  const s = m.s;
  const P = predict(models.cycle, m.X);
  const XP = m.X.map((r, i) => [...r, P[i]]);
  const run = (label: '原始' | '平滑', pol: Model, k: number): VariantResult => {
    const sig = toSignal(predict(pol, XP), k);
    const bt = backtest(slice(s, win.testFrom, win.testTo), { ...p, customSignal: sig.slice(win.testFrom, win.testTo + 1), stopLoss: 0, takeProfit: 0, maxHold: 0, marketFilter: 0, combo: undefined });
    return { label, bt, exposure: bt.exposure, trainScore: hindsightScore(s.close, sig, win.trainFrom, win.trainTo), testScore: hindsightScore(s.close, sig, win.testFrom, win.testTo) };
  };
  // 循環評分：推測期的「事後」高低點只用來評分
  const evalFrom = Math.max(0, Math.min(win.trainFrom, win.testFrom));
  const truthAll = zigzag(s.close, evalFrom, win.testTo, o.theta);
  const truthPiv = truthAll.filter(x => x.idx >= win.testFrom);
  const y = cycleLabels(s.close.length, truthAll);
  const ps: number[] = [], ys: number[] = [];
  const naive = zigzagState(s.close, evalFrom, win.testTo, o.theta);
  let hit = 0, baseHit = 0;
  for (let t = win.testFrom; t <= win.testTo; t++) if (y[t] !== null) {
    ps.push(P[t]); ys.push(y[t]!);
    if ((P[t] > 0.5 ? 1 : 0) === y[t]) hit++;
    if ((naive[t] ?? 1) === y[t]) baseHit++;
  }
  const state = ema(P, 5).map(v => v > 0.5);
  const lags = { trough: [] as number[], peak: [] as number[] };
  let detected = 0;
  for (const pv of truthPiv) {
    const want = pv.type === 'trough';
    let lag: number | null = null;
    for (let j = Math.max(pv.idx - 60, 1); j <= Math.min(pv.idx + 120, s.close.length - 1); j++) {
      if (state[j] === want && state[j - 1] !== want) { lag = j - pv.idx; if (j >= pv.idx) break; }
    }
    if (lag !== null) { detected++; (want ? lags.trough : lags.peak).push(lag); }
  }
  const med = (a: number[]) => { if (!a.length) return null; const b = [...a].sort((x, z) => x - z); return b[Math.floor(b.length / 2)]; };
  const all = s.close.map(() => true);
  return {
    name, trainFrom: win.trainTo >= win.trainFrom ? s.date[win.trainFrom] : '', trainTo: win.trainTo >= win.trainFrom ? s.date[win.trainTo] : '', testFrom: s.date[win.testFrom], testTo: s.date[win.testTo],
    trainYears: Math.max(0, win.trainTo - win.trainFrom + 1) / 250,
    variants: [run('原始', models.raw, 1), run('平滑', models.smooth, o.smooth)],
    bench: {
      trainScore: hindsightScore(s.close, all, win.trainFrom, win.trainTo),
      testScore: hindsightScore(s.close, all, win.testFrom, win.testTo),
      bt: backtest(slice(s, win.testFrom, win.testTo), { ...p, strategy: 'buy_hold', combo: undefined, customSignal: undefined }),
    },
    cycle: { acc: ys.length ? hit / ys.length : null, baseAcc: ys.length ? baseHit / ys.length : null, auc: ys.length ? auc(ps, ys) : null, troughLag: med(lags.trough), peakLag: med(lags.peak), turns: truthPiv.length, detected },
  };
}

/** 單一股票：自己訓練、自己推測 */
export function runLearning(s: DailySeries, p: BacktestParams, o: LearnOptions, id = '', name = '') {
  const m = makeMember(id, name, s, p);
  const warnings: string[] = [];
  const rounds: (MemberRound & { models: RoundModels })[] = [];
  for (const w of windowsFor(m, o)) {
    if ('skip' in w) { warnings.push(`${w.name}${w.skip}，已略過。`); continue; }
    const models = fitRound([{ m, win: w.win }], p, o);
    if (!models) { warnings.push(`${w.name}訓練期不足 2 年（這檔股票的資料從 ${s.date[0]} 開始），已略過；跨產業研究可以用同產業合併模型推測它。`); continue; }
    rounds.push({ ...evalMember(m, w.win, w.name, models, p, o), models });
  }
  const piv = zigzag(s.close, 0, s.close.length - 1, o.theta);
  return { rounds, warnings, cycles: cycleStats(s.close, piv) };
}

/** 產業合併：同一組股票的訓練樣本合併訓練一個模型，再分別推測每一檔 */
export function runPooled(members: Member[], p: BacktestParams, o: LearnOptions) {
  const out = new Map<string, MemberRound[]>();
  const models: { name: string; models: RoundModels }[] = [];
  const names = ['第一階段', '第二階段'];
  for (let r = 0; r < 2; r++) {
    const items = members.map(m => ({ m, w: windowsFor(m, o)[r] })).filter(x => !('skip' in x.w)) as { m: Member; w: { name: string; win: Win } }[];
    const fitted = fitRound(items.map(x => ({ m: x.m, win: x.w.win })), p, o);
    if (!fitted) continue;
    models.push({ name: names[r], models: fitted });
    for (const x of items) {
      const arr = out.get(x.m.id) ?? [];
      arr.push(evalMember(x.m, x.w.win, names[r], fitted, p, o));
      out.set(x.m.id, arr);
    }
  }
  return Object.assign(out, { models });
}

/** 模型最看重的特徵（特徵已標準化，權重可互相比較） */
export function topWeights(m: Model, names = POLICY_FEATURE_NAMES, k = 5) {
  const items = m.w.map((w, j) => ({ name: names[j], w })).filter(x => Math.abs(x.w) > 1e-6);
  return {
    pos: items.filter(x => x.w > 0).sort((a, b) => b.w - a.w).slice(0, k),
    neg: items.filter(x => x.w < 0).sort((a, b) => a.w - b.w).slice(0, k),
  };
}
