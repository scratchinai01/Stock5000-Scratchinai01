/**
 * 專業分析：績效統計與策略回測（純函式，前端直接計算）
 *
 * 報酬類統計一律使用「還原股價」（已含除權息），才是投資人真正拿到的報酬；
 * 回測同樣以還原股價計算，訊號在當天收盤確認、隔天開盤成交，避免偷看未來。
 */

export interface DailySeries {
  date: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

const TRADING_DAYS = 252;

// ───────────────────────── 基本工具 ─────────────────────────
export function dailyReturns(close: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < close.length; i++) r.push(close[i] / close[i - 1] - 1);
  return r;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function std(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
const yearsBetween = (d1: string, d2: string) =>
  (new Date(d2).getTime() - new Date(d1).getTime()) / (365.25 * 24 * 3600 * 1000);

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function rsi(close: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(close.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < close.length; i++) {
    const ch = close[i] - close[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= n) {
      gain += g; loss += l;
      if (i === n) {
        gain /= n; loss /= n;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      }
    } else {
      // Wilder 平滑
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

/** 台灣常用 KD(9,3,3) */
export function kd(s: DailySeries, n = 9): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = [], d: (number | null)[] = [];
  let pk = 50, pd = 50;
  for (let i = 0; i < s.close.length; i++) {
    if (i < n - 1) { k.push(null); d.push(null); continue; }
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, s.high[j]); ll = Math.min(ll, s.low[j]); }
    const rsv = hh === ll ? 50 : ((s.close[i] - ll) / (hh - ll)) * 100;
    pk = (2 / 3) * pk + (1 / 3) * rsv;
    pd = (2 / 3) * pd + (1 / 3) * pk;
    k.push(pk); d.push(pd);
  }
  return { k, d };
}

export function bollinger(close: number[], n = 20, mult = 2) {
  const mid = sma(close, n);
  const upper: (number | null)[] = [], lower: (number | null)[] = [];
  for (let i = 0; i < close.length; i++) {
    if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
    const sd = std(close.slice(i - n + 1, i + 1)) * Math.sqrt((n - 1) / n); // 母體標準差
    upper.push(mid[i]! + mult * sd); lower.push(mid[i]! - mult * sd);
  }
  return { mid, upper, lower };
}

export function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < n) return out;
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = e;
  const k = 2 / (n + 1);
  for (let i = n; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

/** MACD：DIF = EMA(快) − EMA(慢)，MACD 線（訊號線）= DIF 的 EMA */
export function macd(close: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(close, fast), sl = ema(close, slow);
  const dif: (number | null)[] = close.map((_, i) => (f[i] !== null && sl[i] !== null ? f[i]! - sl[i]! : null));
  const start = dif.findIndex(v => v !== null);
  const sig: (number | null)[] = new Array(close.length).fill(null);
  if (start >= 0) {
    const e = ema(dif.slice(start) as number[], signal);
    e.forEach((v, j) => (sig[start + j] = v));
  }
  return { dif, signal: sig };
}

/** 前 n 天（不含當天）的最高價／最低價 */
export function priorHighest(v: number[], n: number): (number | null)[] {
  return v.map((_, i) => (i < n ? null : Math.max(...v.slice(i - n, i))));
}
export function priorLowest(v: number[], n: number): (number | null)[] {
  return v.map((_, i) => (i < n ? null : Math.min(...v.slice(i - n, i))));
}

/** DMI 趨向指標（Wilder 平滑）：+DI、−DI、ADX */
export function dmi(s: DailySeries, n = 14) {
  const len = s.close.length;
  const pdi: (number | null)[] = new Array(len).fill(null), mdi: (number | null)[] = new Array(len).fill(null), adx: (number | null)[] = new Array(len).fill(null);
  let tr = 0, pdm = 0, mdm = 0, adxv = 0, dxSum = 0, dxCount = 0;
  for (let i = 1; i < len; i++) {
    const up = s.high[i] - s.high[i - 1], dn = s.low[i - 1] - s.low[i];
    const t = Math.max(s.high[i] - s.low[i], Math.abs(s.high[i] - s.close[i - 1]), Math.abs(s.low[i] - s.close[i - 1]));
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { tr += t; pdm += p; mdm += m; } else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; mdm = mdm - mdm / n + m; }
    if (i < n || tr <= 0) continue;
    const P = (100 * pdm) / tr, M = (100 * mdm) / tr;
    pdi[i] = P; mdi[i] = M;
    const dx = P + M > 0 ? (100 * Math.abs(P - M)) / (P + M) : 0;
    if (dxCount < n) { dxSum += dx; dxCount++; if (dxCount === n) { adxv = dxSum / n; adx[i] = adxv; } }
    else { adxv = (adxv * (n - 1) + dx) / n; adx[i] = adxv; }
  }
  return { pdi, mdi, adx };
}

/** 拋物線 SAR：回傳每天是否為多頭（true）／空頭（false） */
export function sarTrend(s: DailySeries, step = 0.02, max = 0.2): (boolean | null)[] {
  const len = s.close.length;
  const out: (boolean | null)[] = new Array(len).fill(null);
  if (len < 3) return out;
  let up = s.close[1] >= s.close[0];
  let sar = up ? Math.min(s.low[0], s.low[1]) : Math.max(s.high[0], s.high[1]);
  let ep = up ? Math.max(s.high[0], s.high[1]) : Math.min(s.low[0], s.low[1]);
  let af = step;
  out[1] = up;
  for (let i = 2; i < len; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, s.low[i - 1], s.low[i - 2]);
      if (s.low[i] < sar) { up = false; sar = ep; ep = s.low[i]; af = step; }
      else if (s.high[i] > ep) { ep = s.high[i]; af = Math.min(af + step, max); }
    } else {
      sar = Math.max(sar, s.high[i - 1], s.high[i - 2]);
      if (s.high[i] > sar) { up = true; sar = ep; ep = s.high[i]; af = step; }
      else if (s.low[i] < ep) { ep = s.low[i]; af = Math.min(af + step, max); }
    }
    out[i] = up;
  }
  return out;
}

/** 威廉指標 %R（−100～0，越接近 −100 越超賣） */
export function williamsR(s: DailySeries, n = 14): (number | null)[] {
  return s.close.map((c, i) => {
    if (i < n - 1) return null;
    const hh = Math.max(...s.high.slice(i - n + 1, i + 1)), ll = Math.min(...s.low.slice(i - n + 1, i + 1));
    return hh === ll ? -50 : ((hh - c) / (hh - ll)) * -100;
  });
}

/** OBV 能量潮 */
export function obv(s: DailySeries): number[] {
  const out: number[] = [0];
  for (let i = 1; i < s.close.length; i++) {
    const v = s.volume[i] || 0;
    out.push(out[i - 1] + (s.close[i] > s.close[i - 1] ? v : s.close[i] < s.close[i - 1] ? -v : 0));
  }
  return out;
}

// ───────────────────────── 績效統計 ─────────────────────────
export interface PerformanceStats {
  startDate: string;
  endDate: string;
  years: number;
  totalReturn: number;
  cagr: number;
  annVol: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  mddPeak: string;
  mddTrough: string;
  mddRecovery: string | null;
  bestDay: { date: string; ret: number };
  worstDay: { date: string; ret: number };
  upDayRatio: number;
}

/** riskFree：年化無風險利率（預設 1.5%，約台灣一年期定存） */
export function performance(dates: string[], value: number[], riskFree = 0.015): PerformanceStats | null {
  if (value.length < 2) return null;
  const r = dailyReturns(value);
  const yrs = Math.max(yearsBetween(dates[0], dates[dates.length - 1]), 1 / 365);
  const total = value[value.length - 1] / value[0] - 1;
  const cagr = Math.pow(1 + total, 1 / yrs) - 1;
  const vol = std(r) * Math.sqrt(TRADING_DAYS);
  const rfDaily = Math.pow(1 + riskFree, 1 / TRADING_DAYS) - 1;
  const excess = r.map(x => x - rfDaily);
  const downside = Math.sqrt(mean(excess.map(x => Math.min(x, 0) ** 2))) * Math.sqrt(TRADING_DAYS);
  const sharpe = vol > 0 ? (mean(excess) * TRADING_DAYS) / vol : 0;
  const sortino = downside > 0 ? (mean(excess) * TRADING_DAYS) / downside : 0;

  const dd = drawdownSeries(value);
  let mddIdx = 0;
  for (let i = 1; i < dd.length; i++) if (dd[i] < dd[mddIdx]) mddIdx = i;
  let peakIdx = 0;
  for (let i = 0; i <= mddIdx; i++) if (value[i] >= value[peakIdx]) peakIdx = i;
  let recIdx: number | null = null;
  for (let i = mddIdx; i < value.length; i++) if (value[i] >= value[peakIdx]) { recIdx = i; break; }

  let best = 0, worst = 0;
  r.forEach((x, i) => { if (x > r[best]) best = i; if (x < r[worst]) worst = i; });

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    years: yrs,
    totalReturn: total,
    cagr,
    annVol: vol,
    sharpe,
    sortino,
    maxDrawdown: dd[mddIdx],
    mddPeak: dates[peakIdx],
    mddTrough: dates[mddIdx],
    mddRecovery: recIdx !== null && mddIdx > 0 ? dates[recIdx] : null,
    bestDay: { date: dates[best + 1], ret: r[best] },
    worstDay: { date: dates[worst + 1], ret: r[worst] },
    upDayRatio: r.filter(x => x > 0).length / r.length,
  };
}

export function drawdownSeries(value: number[]): number[] {
  let peak = -Infinity;
  return value.map(v => {
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
}

/** 各年度報酬（第一年為部分年度） */
export function yearlyReturns(dates: string[], close: number[]) {
  const out: { year: number; ret: number; partial: boolean }[] = [];
  let prevEnd = close[0];
  let startIdx = 0;
  for (let i = 0; i < dates.length; i++) {
    const y = Number(dates[i].slice(0, 4));
    const last = i === dates.length - 1 || Number(dates[i + 1].slice(0, 4)) !== y;
    if (last) {
      const isFirst = startIdx === 0;
      const base = isFirst ? close[0] : prevEnd;
      out.push({ year: y, ret: close[i] / base - 1, partial: isFirst || i === dates.length - 1 });
      prevEnd = close[i];
      startIdx = i + 1;
    }
  }
  return out;
}

/** 月份季節性：各月份的平均報酬、中位數與上漲機率 */
export function monthlySeasonality(dates: string[], close: number[]) {
  const monthEnds: { ym: string; close: number }[] = [];
  for (let i = 0; i < dates.length; i++) {
    const ym = dates[i].slice(0, 7);
    if (i === dates.length - 1 || dates[i + 1].slice(0, 7) !== ym) monthEnds.push({ ym, close: close[i] });
  }
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < monthEnds.length; i++) {
    const m = Number(monthEnds[i].ym.slice(5, 7)) - 1;
    buckets[m].push(monthEnds[i].close / monthEnds[i - 1].close - 1);
  }
  return buckets.map((b, i) => {
    const sorted = [...b].sort((x, y) => x - y);
    return {
      month: i + 1,
      count: b.length,
      avg: mean(b),
      median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
      winRate: b.length ? b.filter(x => x > 0).length / b.length : 0,
    };
  });
}

/** 與基準（例如 0050）比較：Beta 與相關係數，依日期對齊 */
export function betaCorrelation(
  dates: string[], close: number[], benchDates: string[], benchClose: number[]
): { beta: number; correlation: number; days: number } | null {
  const bm = new Map(benchDates.map((d, i) => [d, benchClose[i]]));
  const a: number[] = [], b: number[] = [];
  let prevS: number | null = null, prevB: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    const bv = bm.get(dates[i]);
    if (bv === undefined) continue;
    if (prevS !== null && prevB !== null) { a.push(close[i] / prevS - 1); b.push(bv / prevB - 1); }
    prevS = close[i]; prevB = bv;
  }
  if (a.length < 30) return null;
  const ma = mean(a), mb = mean(b);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return { beta: vb > 0 ? cov / vb : 0, correlation: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0, days: a.length };
}

// ───────────────────────── 策略回測 ─────────────────────────
export type StrategyId =
  | 'buy_hold' | 'dca'
  | 'ma_cross' | 'price_ma' | 'macd' | 'donchian' | 'dmi' | 'sar' | 'momentum'
  | 'rsi' | 'kd' | 'boll' | 'bias' | 'williams' | 'down_streak'
  | 'vol_breakout' | 'obv';

export interface BacktestParams {
  strategy: StrategyId;
  capital: number;          // 初始資金（定期定額為每月投入金額）
  feeRate: number;          // 手續費率（台股 0.1425%）
  feeDiscount: number;      // 手續費折數（例如 0.6 = 六折）
  minFee: number;           // 最低手續費（台股 20 元）
  taxRate: number;          // 賣出證交稅（股票 0.3%、ETF 0.1%）
  short?: number; long?: number;          // 均線
  rsiPeriod?: number; rsiLow?: number; rsiHigh?: number;
  bollPeriod?: number; bollMult?: number;
  maPeriod?: number;                                        // 站上均線
  macdFast?: number; macdSlow?: number; macdSignal?: number;
  donchianIn?: number; donchianOut?: number;                // 唐奇安通道
  dmiPeriod?: number; adxMin?: number;
  sarStep?: number; sarMax?: number;
  momPeriod?: number;                                       // 動能（N 日報酬）
  biasPeriod?: number; biasPct?: number;                    // 乖離率（負乖離 %）
  wrPeriod?: number; wrBuy?: number; wrSell?: number;       // 威廉 %R（輸入正數，代表 −數值）
  downDays?: number; holdDays?: number;                     // 連續下跌反彈
  vbPeriod?: number; vbMult?: number;                       // 帶量突破
  obvPeriod?: number;
  // 風險控管（所有擇時策略共用；0 代表不啟用）
  stopLoss?: number;        // 停損 %（收盤跌破成本 X% → 隔天開盤賣出）
  takeProfit?: number;      // 停利 %
  maxHold?: number;         // 最長持有交易日
  marketFilter?: number;    // 大盤濾網：0050 收盤在 N 日均線之上才買進（0 = 不使用）
  // 多策略組合：同時看多個擇時策略，依規則合成一個持有訊號
  combo?: { ids: StrategyId[]; mode: ComboMode };
  // 外部提供的持有訊號（例如個股學習模型的輸出），長度需與序列相同
  customSignal?: (boolean | null)[];
}

/** and：全部策略都看多才持有；or：任一策略看多就持有；vote：過半數看多才持有 */
export type ComboMode = 'and' | 'or' | 'vote';
export const COMBO_LABEL: Record<ComboMode, string> = { and: '全部同意', or: '任一出現', vote: '過半數' };

/** 大盤濾網用的市場序列（日期 → 收盤價） */
export interface MarketSeries { date: string[]; close: number[] }

export interface Trade {
  date: string;
  side: '買進' | '賣出';
  price: number;
  shares: number;
  fee: number;
  tax: number;
  pnl?: number; // 賣出時的已實現損益（含成本）
  reason?: '停損' | '停利' | '持有到期';
}

export interface BacktestResult {
  dates: string[];
  equity: number[];
  invested: number[];      // 累計投入本金（定期定額時會逐月增加）
  benchmark: number[];     // 同一段期間買進持有的淨值（相同本金）
  trades: Trade[];
  stats: PerformanceStats | null;
  benchStats: PerformanceStats | null;
  totalFees: number;
  totalTax: number;
  closedTrades: number;
  winRate: number;
  exposure: number;        // 持有股票的天數比例
  finalValue: number;
  totalInvested: number;
}

/** 把「買進／賣出／維持」訊號轉成每天的持有狀態（null 延續前一天，一開始為空手） */
export function holdState(want: (boolean | null)[]): boolean[] {
  let cur = false;
  return want.map(w => (w === null ? cur : (cur = w)));
}

/** 單一策略每天的持有狀態（只用到當天以前的資料） */
export function strategyState(s: DailySeries, p: BacktestParams, id: StrategyId): boolean[] {
  return holdState(singleSignal(s, { ...p, strategy: id, combo: undefined, customSignal: undefined }));
}

function signalSeries(s: DailySeries, p: BacktestParams): (boolean | null)[] {
  if (p.customSignal) return p.customSignal;
  if (p.combo && p.combo.ids.length > 1) {
    const states = p.combo.ids.map(id => holdState(singleSignal(s, { ...p, strategy: id, combo: undefined })));
    const k = states.length;
    return s.close.map((_, i) => {
      const on = states.reduce((c, st) => c + (st[i] ? 1 : 0), 0);
      return p.combo!.mode === 'and' ? on === k : p.combo!.mode === 'or' ? on > 0 : on * 2 > k;
    });
  }
  return singleSignal(s, p);
}

function singleSignal(s: DailySeries, p: BacktestParams): (boolean | null)[] {
  // 回傳每天收盤後「是否應持有」；null 代表維持原狀
  const n = s.close.length;
  const want: (boolean | null)[] = new Array(n).fill(null);
  if (p.strategy === 'buy_hold' || p.strategy === 'dca') return want.map(() => true);
  if (p.strategy === 'ma_cross') {
    const a = sma(s.close, p.short ?? 20), b = sma(s.close, p.long ?? 60);
    for (let i = 0; i < n; i++) if (a[i] !== null && b[i] !== null) want[i] = a[i]! > b[i]!;
  } else if (p.strategy === 'rsi') {
    const r = rsi(s.close, p.rsiPeriod ?? 14);
    for (let i = 0; i < n; i++) {
      if (r[i] === null) continue;
      if (r[i]! < (p.rsiLow ?? 30)) want[i] = true;
      else if (r[i]! > (p.rsiHigh ?? 70)) want[i] = false;
    }
  } else if (p.strategy === 'kd') {
    const { k, d } = kd(s);
    for (let i = 1; i < n; i++) {
      if (k[i] === null || d[i] === null || k[i - 1] === null || d[i - 1] === null) continue;
      if (k[i - 1]! <= d[i - 1]! && k[i]! > d[i]! && k[i]! < 20) want[i] = true;   // 低檔黃金交叉
      if (k[i - 1]! >= d[i - 1]! && k[i]! < d[i]! && k[i]! > 80) want[i] = false;  // 高檔死亡交叉
    }
  } else if (p.strategy === 'boll') {
    const { mid, lower } = bollinger(s.close, p.bollPeriod ?? 20, p.bollMult ?? 2);
    for (let i = 0; i < n; i++) {
      if (lower[i] === null) continue;
      if (s.close[i] < lower[i]!) want[i] = true;        // 跌破下軌買進
      else if (s.close[i] > mid[i]!) want[i] = false;    // 站回中軌賣出
    }  } else if (p.strategy === 'price_ma') {
    const m = sma(s.close, p.maPeriod ?? 60);
    for (let i = 0; i < n; i++) if (m[i] !== null) want[i] = s.close[i] > m[i]!;
  } else if (p.strategy === 'macd') {
    const { dif, signal } = macd(s.close, p.macdFast ?? 12, p.macdSlow ?? 26, p.macdSignal ?? 9);
    for (let i = 0; i < n; i++) if (dif[i] !== null && signal[i] !== null) want[i] = dif[i]! > signal[i]!;
  } else if (p.strategy === 'donchian') {
    const hi = priorHighest(s.high, p.donchianIn ?? 20), lo = priorLowest(s.low, p.donchianOut ?? 10);
    for (let i = 0; i < n; i++) {
      if (hi[i] !== null && s.close[i] > hi[i]!) want[i] = true;          // 突破前 N 日最高
      else if (lo[i] !== null && s.close[i] < lo[i]!) want[i] = false;    // 跌破前 M 日最低
    }
  } else if (p.strategy === 'dmi') {
    const { pdi, mdi, adx } = dmi(s, p.dmiPeriod ?? 14);
    for (let i = 0; i < n; i++) {
      if (pdi[i] === null || mdi[i] === null) continue;
      if (pdi[i]! > mdi[i]! && adx[i] !== null && adx[i]! >= (p.adxMin ?? 20)) want[i] = true;
      else if (pdi[i]! < mdi[i]!) want[i] = false;
    }
  } else if (p.strategy === 'sar') {
    const t = sarTrend(s, p.sarStep ?? 0.02, p.sarMax ?? 0.2);
    for (let i = 0; i < n; i++) want[i] = t[i];
  } else if (p.strategy === 'momentum') {
    const k = p.momPeriod ?? 120;
    for (let i = k; i < n; i++) want[i] = s.close[i] > s.close[i - k];
  } else if (p.strategy === 'bias') {
    const m = sma(s.close, p.biasPeriod ?? 20);
    for (let i = 0; i < n; i++) {
      if (m[i] === null) continue;
      const b = (s.close[i] / m[i]! - 1) * 100;
      if (b < -(p.biasPct ?? 7)) want[i] = true;   // 負乖離過大買進
      else if (b >= 0) want[i] = false;            // 回到均線賣出
    }
  } else if (p.strategy === 'williams') {
    const r = williamsR(s, p.wrPeriod ?? 14);
    for (let i = 0; i < n; i++) {
      if (r[i] === null) continue;
      if (r[i]! < -(p.wrBuy ?? 80)) want[i] = true;
      else if (r[i]! > -(p.wrSell ?? 20)) want[i] = false;
    }
  } else if (p.strategy === 'down_streak') {
    const dn = p.downDays ?? 3, hold = p.holdDays ?? 5;
    let streak = 0, entry = -1;
    for (let i = 1; i < n; i++) {
      streak = s.close[i] < s.close[i - 1] ? streak + 1 : 0;
      if (entry >= 0) {
        if (i - entry >= hold) { want[i] = false; entry = -1; }
      } else if (streak >= dn) { want[i] = true; entry = i; }
    }
  } else if (p.strategy === 'vol_breakout') {
    const k = p.vbPeriod ?? 20;
    const hi = priorHighest(s.high, k), m = sma(s.close, k);
    const avgVol = sma(s.volume.map(v => v || 0), k);
    for (let i = 1; i < n; i++) {
      if (hi[i] === null || m[i] === null || avgVol[i - 1] === null) continue;
      if (s.close[i] > hi[i]! && s.volume[i] > (p.vbMult ?? 2) * avgVol[i - 1]!) want[i] = true;  // 帶量突破
      else if (s.close[i] < m[i]!) want[i] = false;                                               // 跌破均線出場
    }
  } else if (p.strategy === 'obv') {
    const o = obv(s), m = sma(o, p.obvPeriod ?? 20);
    for (let i = 0; i < n; i++) if (m[i] !== null) want[i] = o[i] > m[i]!;
  }
  return want;
}

export function backtest(s: DailySeries, p: BacktestParams, market?: MarketSeries | null): BacktestResult {
  const n = s.close.length;
  // 大盤濾網：0050 收盤在 N 日均線之上才允許買進（沒有大盤資料的日期不設限）
  let marketOk: (boolean | null)[] | null = null;
  if (market && (p.marketFilter ?? 0) > 0) {
    const m = sma(market.close, p.marketFilter!);
    const ok = new Map<string, boolean>();
    market.date.forEach((d, i) => { if (m[i] !== null) ok.set(d, market.close[i] > m[i]!); });
    marketOk = s.date.map(d => (ok.has(d) ? ok.get(d)! : null));
  }
  const sl = (p.stopLoss ?? 0) / 100, tp = (p.takeProfit ?? 0) / 100, maxHold = p.maxHold ?? 0;
  let entryPrice = 0, entryIdx = -1, forcedExit = false, waitReset = false;
  let exitReason: Trade['reason'];
  const fee = (amount: number) => Math.max(Math.round(amount * p.feeRate * p.feeDiscount), amount > 0 ? p.minFee : 0);
  const want = signalSeries(s, p);
  const isDca = p.strategy === 'dca';

  let cash = isDca ? 0 : p.capital;
  let invested = isDca ? 0 : p.capital;
  let shares = 0;
  let costBasis = 0; // 目前持股的總成本（含手續費）
  const trades: Trade[] = [];
  const equity: number[] = [], investedArr: number[] = [];
  let totalFees = 0, totalTax = 0, holdDays = 0, wins = 0, closed = 0;
  let holding = false;

  const buyAll = (i: number, budget: number) => {
    const price = s.open[i];
    let qty = Math.floor(budget / (price * (1 + p.feeRate * p.feeDiscount)));
    while (qty > 0 && qty * price + fee(qty * price) > budget) qty--;
    if (qty <= 0) return;
    const f = fee(qty * price);
    cash -= qty * price + f;
    shares += qty;
    costBasis += qty * price + f;
    totalFees += f;
    trades.push({ date: s.date[i], side: '買進', price, shares: qty, fee: f, tax: 0 });
  };
  const sellAll = (i: number) => {
    if (shares <= 0) return;
    const price = s.open[i];
    const gross = shares * price;
    const f = fee(gross), t = Math.round(gross * p.taxRate);
    cash += gross - f - t;
    const pnl = gross - f - t - costBasis;
    totalFees += f; totalTax += t; closed++; if (pnl > 0) wins++;
    trades.push({ date: s.date[i], side: '賣出', price, shares, fee: f, tax: t, pnl, ...(exitReason ? { reason: exitReason } : {}) });
    exitReason = undefined;
    shares = 0; costBasis = 0;
  };

  for (let i = 0; i < n; i++) {
    // 1. 執行昨天收盤確認的訊號（今天開盤成交）
    if (i > 0) {
      if (isDca) {
        if (i === 1 || s.date[i].slice(0, 7) !== s.date[i - 1].slice(0, 7)) {
          cash += p.capital;
          invested += p.capital;
          buyAll(i, cash);
        }
      } else {
        const w = want[i - 1];
        // 強制出場後，要等訊號先解除、再重新出現，才會再買進（避免同一個訊號反覆進出）
        if (waitReset && w !== true) waitReset = false;
        const mOk = marketOk ? marketOk[i - 1] !== false : true;
        if (forcedExit && holding) { sellAll(i); holding = false; forcedExit = false; waitReset = true; }
        else if (w === true && !holding && !waitReset && mOk) { buyAll(i, cash); holding = shares > 0; if (holding) { entryPrice = s.open[i]; entryIdx = i; } }
        else if (w === false && holding) { sellAll(i); holding = false; }
      }
    }
    // 收盤檢查停損／停利／持有天數（隔天開盤執行）
    if (!isDca && holding && entryIdx >= 0) {
      const r = s.close[i] / entryPrice - 1;
      if (sl > 0 && r <= -sl) { forcedExit = true; exitReason = '停損'; }
      else if (tp > 0 && r >= tp) { forcedExit = true; exitReason = '停利'; }
      else if (maxHold > 0 && i - entryIdx + 1 >= maxHold) { forcedExit = true; exitReason = '持有到期'; }
    }
    if (shares > 0) holdDays++;
    equity.push(cash + shares * s.close[i]);
    investedArr.push(invested);
  }

  // 基準：同一段期間、同樣本金，第二天開盤全部買進後持有
  let benchmark: number[];
  if (isDca) {
    benchmark = equity.slice(); // 定期定額本身就是持有策略，基準改看投入本金
  } else {
    const base = s.open[Math.min(1, n - 1)];
    const benchShares = Math.floor(p.capital / (base * (1 + p.feeRate * p.feeDiscount)));
    const left = p.capital - benchShares * base - fee(benchShares * base);
    benchmark = s.close.map((c, i) => (i === 0 ? p.capital : left + benchShares * c));
  }

  const finalValue = equity[n - 1] ?? 0;
  // 定期定額的報酬統計需扣除現金流入，這裡用「單位淨值」近似時間加權報酬
  let statsSeries = equity;
  if (isDca) {
    const nav: number[] = [];
    let units = 0;
    let last = 1;
    for (let i = 0; i < n; i++) {
      const added = investedArr[i] - (i > 0 ? investedArr[i - 1] : 0);
      if (added > 0) {
        const navBefore = units > 0 ? (equity[i] - added) / units : last;
        units += added / navBefore;
      }
      last = units > 0 ? equity[i] / units : last;
      nav.push(last);
    }
    statsSeries = nav;
  }

  return {
    dates: s.date,
    equity,
    invested: investedArr,
    benchmark,
    trades,
    stats: performance(s.date, statsSeries),
    benchStats: isDca ? null : performance(s.date, benchmark),
    totalFees,
    totalTax,
    closedTrades: closed,
    winRate: closed ? wins / closed : 0,
    exposure: n ? holdDays / n : 0,
    finalValue,
    totalInvested: invested,
  };
}

// ───────────────────────── 週期轉換 ─────────────────────────
export function resample(s: DailySeries, period: '1d' | '1w' | '1M'): DailySeries {
  if (period === '1d') return s;
  const key = (d: string) => {
    if (period === '1M') return d.slice(0, 7);
    const dt = new Date(`${d}T12:00:00Z`);
    const dow = (dt.getUTCDay() + 6) % 7; // 週一為 0
    dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
  };
  const out: DailySeries = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < s.date.length; i++) {
    const k = key(s.date[i]);
    const last = out.date.length - 1;
    if (last >= 0 && key(out.date[last]) === k) {
      out.date[last] = s.date[i];
      out.high[last] = Math.max(out.high[last], s.high[i]);
      out.low[last] = Math.min(out.low[last], s.low[i]);
      out.close[last] = s.close[i];
      out.volume[last] += s.volume[i];
    } else {
      out.date.push(s.date[i]); out.open.push(s.open[i]); out.high.push(s.high[i]);
      out.low.push(s.low[i]); out.close.push(s.close[i]); out.volume.push(s.volume[i]);
    }
  }
  return out;
}
