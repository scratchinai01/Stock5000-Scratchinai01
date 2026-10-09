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
export type StrategyId = 'buy_hold' | 'ma_cross' | 'rsi' | 'kd' | 'boll' | 'dca';

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
}

export interface Trade {
  date: string;
  side: '買進' | '賣出';
  price: number;
  shares: number;
  fee: number;
  tax: number;
  pnl?: number; // 賣出時的已實現損益（含成本）
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

function signalSeries(s: DailySeries, p: BacktestParams): (boolean | null)[] {
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
    }
  }
  return want;
}

export function backtest(s: DailySeries, p: BacktestParams): BacktestResult {
  const n = s.close.length;
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
    trades.push({ date: s.date[i], side: '賣出', price, shares, fee: f, tax: t, pnl });
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
        if (w === true && !holding) { buyAll(i, cash); holding = shares > 0; }
        else if (w === false && holding) { sellAll(i); holding = false; }
      }
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
