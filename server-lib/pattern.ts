/**
 * 三角收斂突破：指標計算、型態辨識、突破評分、回測結果（純函式，方便測試）
 *
 * 價格一律用「還原股價」計算（避免除權息造成假跳空）；成交量用原始股數。
 * 規則來源：使用者提供的「三角收斂突破：關鍵指標與參數設定」。
 */

export interface Series {
  id: string;
  name: string;
  market: string;
  date: string[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export interface PatternParams {
  pivotK: number; // 擺動高低點：左右各 K 根
  minLen: number; // 三角形最短 K 線數
  maxLen: number; // 三角形最長 K 線數
  minTouches: number; // 上下軌合計觸碰點
  minCompression: number; // 目前寬度 ÷ 起點寬度 上限（越小越收斂）
  volRatio: number; // 突破量 ÷ 20 日均量
  rsiUp: number;
  rsiDown: number;
  breakPct: number; // 收盤超出趨勢線百分比
  breakAtr: number; // 或超出 ATR 倍數
  posMin: number; // 突破位置下限（三角形長度比例）
  posMax: number;
  bbSqueezePct: number; // 布林帶寬位於近 120 日的百分位以下
  stopAtr: number;
  holdDays: number; // 回測最長持有
}

export const DEFAULT_PARAMS: PatternParams = {
  pivotK: 5,
  minLen: 20,
  maxLen: 120,
  minTouches: 5,
  minCompression: 0.75,
  volRatio: 1.5,
  rsiUp: 55,
  rsiDown: 45,
  breakPct: 0.01,
  breakAtr: 0.5,
  posMin: 0.5,
  posMax: 0.75,
  bbSqueezePct: 0.2,
  stopAtr: 1.5,
  holdDays: 60,
};

// ───────────────────────── 指標 ─────────────────────────
const NaNArr = (n: number) => new Array<number>(n).fill(NaN);

export function sma(a: number[], n: number): number[] {
  const out = NaNArr(a.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
export function ema(a: number[], n: number): number[] {
  const out = NaNArr(a.length);
  const k = 2 / (n + 1);
  let prev = NaN;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (!isFinite(x)) continue;
    prev = isFinite(prev) ? x * k + prev * (1 - k) : x;
    out[i] = prev;
  }
  return out;
}
/** Wilder 平滑 */
function wilder(a: number[], n: number, start = 1): number[] {
  const out = NaNArr(a.length);
  let sum = 0;
  let cnt = 0;
  let prev = NaN;
  for (let i = start; i < a.length; i++) {
    if (!isFinite(prev)) {
      sum += a[i];
      cnt++;
      if (cnt === n) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = (prev * (n - 1) + a[i]) / n;
      out[i] = prev;
    }
  }
  return out;
}
export function rsi(c: number[], n = 14): number[] {
  const up = c.map((x, i) => (i ? Math.max(0, x - c[i - 1]) : 0));
  const dn = c.map((x, i) => (i ? Math.max(0, c[i - 1] - x) : 0));
  const au = wilder(up, n);
  const ad = wilder(dn, n);
  return au.map((u, i) => (isFinite(u) ? (ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])) : NaN));
}
export function atr(h: number[], l: number[], c: number[], n = 14): number[] {
  const tr = h.map((x, i) => (i ? Math.max(x - l[i], Math.abs(x - c[i - 1]), Math.abs(l[i] - c[i - 1])) : x - l[i]));
  return wilder(tr, n);
}
export function adx(h: number[], l: number[], c: number[], n = 14): number[] {
  const len = c.length;
  const pdm = new Array(len).fill(0);
  const mdm = new Array(len).fill(0);
  const tr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const upMove = h[i] - h[i - 1];
    const downMove = l[i - 1] - l[i];
    pdm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    mdm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  const sTr = wilder(tr, n);
  const sP = wilder(pdm, n);
  const sM = wilder(mdm, n);
  const dx = NaNArr(len);
  for (let i = 0; i < len; i++) {
    if (!isFinite(sTr[i]) || sTr[i] === 0) continue;
    const pdi = (100 * sP[i]) / sTr[i];
    const mdi = (100 * sM[i]) / sTr[i];
    dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  }
  const firstDx = dx.findIndex(x => isFinite(x));
  if (firstDx < 0) return NaNArr(len);
  const dxFilled = dx.map(x => (isFinite(x) ? x : 0));
  return wilder(dxFilled, n, firstDx).map((x, i) => (i < firstDx ? NaN : x));
}
/** DMI：+DI、-DI、ADX（Wilder 平滑） */
export function dmi(h: number[], l: number[], c: number[], n = 14): { pdi: number[]; mdi: number[]; adx: number[] } {
  const len = c.length;
  const pdm = new Array(len).fill(0);
  const mdm = new Array(len).fill(0);
  const tr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const upMove = h[i] - h[i - 1];
    const downMove = l[i - 1] - l[i];
    pdm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    mdm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  const sTr = wilder(tr, n);
  const sP = wilder(pdm, n);
  const sM = wilder(mdm, n);
  const pdi = sTr.map((x, i) => (isFinite(x) && x > 0 ? (100 * sP[i]) / x : NaN));
  const mdi = sTr.map((x, i) => (isFinite(x) && x > 0 ? (100 * sM[i]) / x : NaN));
  return { pdi, mdi, adx: adx(h, l, c, n) };
}
export function obv(c: number[], v: number[]): number[] {
  const out = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) out[i] = out[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0);
  return out;
}
export function bbWidth(c: number[], n = 20, k = 2): number[] {
  const m = sma(c, n);
  const out = NaNArr(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (c[j] - m[i]) ** 2;
    const sd = Math.sqrt(s / n);
    out[i] = m[i] > 0 ? (2 * k * sd) / m[i] : NaN;
  }
  return out;
}

export interface Indicators {
  rsi: number[];
  dif: number[];
  dea: number[];
  hist: number[];
  atr: number[];
  adx: number[];
  obv: number[];
  bbw: number[];
  vma5: number[];
  vma20: number[];
  ma120: number[];
  pivH: boolean[];
  pivL: boolean[];
}

export function computeIndicators(s: Series, p: PatternParams = DEFAULT_PARAMS): Indicators {
  const e12 = ema(s.c, 12);
  const e26 = ema(s.c, 26);
  const dif = e12.map((x, i) => x - e26[i]);
  const dea = ema(dif, 9);
  const len = s.c.length;
  const pivH = new Array(len).fill(false);
  const pivL = new Array(len).fill(false);
  const k = p.pivotK;
  for (let i = k; i < len - k; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - k; j <= i + k && (isH || isL); j++) {
      if (j === i) continue;
      if (j < i ? s.h[j] >= s.h[i] : s.h[j] > s.h[i]) isH = false;
      if (j < i ? s.l[j] <= s.l[i] : s.l[j] < s.l[i]) isL = false;
    }
    pivH[i] = isH;
    pivL[i] = isL;
  }
  return {
    rsi: rsi(s.c),
    dif,
    dea,
    hist: dif.map((x, i) => x - dea[i]),
    atr: atr(s.h, s.l, s.c),
    adx: adx(s.h, s.l, s.c),
    obv: obv(s.c, s.v),
    bbw: bbWidth(s.c),
    vma5: sma(s.v, 5),
    vma20: sma(s.v, 20),
    ma120: sma(s.c, 120),
    pivH,
    pivL,
  };
}

// ───────────────────────── 三角形 ─────────────────────────
export interface Line {
  m: number;
  b: number;
}
const at = (ln: Line, x: number) => ln.m * x + ln.b;

function fit(xs: number[], ys: number[]): Line {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const m = den === 0 ? 0 : num / den;
  return { m, b: my - m * mx };
}

export interface Triangle {
  start: number; // 三角形起點（最高擺動高點）
  upper: Line;
  lower: Line;
  highs: number[]; // 觸碰上軌的擺動高點 index
  lows: number[];
  touches: number;
  apex: number; // 上下軌交會的 x（可為小數）
  height: number; // 起點寬度
  shape: 'sym' | 'asc' | 'desc';
}

/**
 * 以「t 之前已確認的擺動點」找三角形（不使用未來資料）
 * @param inclusive true：t 當天也必須在三角形內（收斂中）；false：只檢查到 t-1（用於判斷 t 是否突破）
 */
export function findTriangle(s: Series, ind: Indicators, t: number, p: PatternParams, inclusive: boolean): Triangle | null {
  const k = p.pivotK;
  const lastConfirmed = t - 1 - k; // 擺動點需要右邊 k 根才確認
  const from = Math.max(0, t - p.maxLen);
  const H: number[] = [];
  const L: number[] = [];
  for (let i = from; i <= lastConfirmed; i++) {
    if (ind.pivH[i]) H.push(i);
    if (ind.pivL[i]) L.push(i);
  }
  if (H.length < 2 || L.length < 2) return null;

  // 起點：視窗內最高的擺動高點（三角形最寬處）
  let start = H[0];
  for (const i of H) if (s.h[i] > s.h[start]) start = i;
  if (t - start < p.minLen) return null;
  const hs = H.filter(i => i >= start);
  const ls = L.filter(i => i >= start - k);
  if (hs.length < 2 || ls.length < 2) return null;

  const upper = fit(hs, hs.map(i => s.h[i]));
  const lower = fit(ls, ls.map(i => s.l[i]));
  const atrT = ind.atr[t - 1];
  if (!isFinite(atrT) || atrT <= 0) return null;

  // 形狀：上軌持平或下降、下軌持平或上升，且確實收斂
  const span = t - start;
  const price = s.c[t - 1];
  const flat = 0.02 * price; // 整段變動小於 2% 視為持平
  const upChange = upper.m * span;
  const loChange = lower.m * span;
  if (upChange > flat || loChange < -flat) return null;
  if (upper.m - lower.m >= 0) return null;

  const w0 = at(upper, start) - at(lower, start);
  const wt = at(upper, t) - at(lower, t);
  if (w0 <= 0 || wt <= 0) return null;
  if (wt / w0 > p.minCompression) return null;

  // 觸碰點：擺動點距離趨勢線在容許範圍內
  const tol = Math.max(0.5 * atrT, 0.01 * price);
  const highs = hs.filter(i => Math.abs(s.h[i] - at(upper, i)) <= tol);
  const lows = ls.filter(i => Math.abs(s.l[i] - at(lower, i)) <= tol);
  if (highs.length < 2 || lows.length < 2 || highs.length + lows.length < p.minTouches) return null;

  // 收盤價要在三角形內（容許 1 次小幅越界）
  let viol = 0;
  const end = inclusive ? t : t - 1;
  for (let x = start; x <= end; x++) {
    const u = at(upper, x);
    const lo = at(lower, x);
    if (s.c[x] > u + 0.5 * atrT || s.c[x] < lo - 0.5 * atrT) {
      viol++;
      if (viol > 1) return null;
    }
  }
  const apex = (lower.b - upper.b) / (upper.m - lower.m);
  if (!(apex > t - 1)) return null;

  const shape: Triangle['shape'] = Math.abs(upChange) <= flat * 0.5 && loChange > 0 ? 'asc' : Math.abs(loChange) <= flat * 0.5 && upChange < 0 ? 'desc' : 'sym';
  return { start, upper, lower, highs, lows, touches: highs.length + lows.length, apex, height: w0, shape };
}

// ───────────────────────── 突破評分 ─────────────────────────
export type Side = 'up' | 'down';

export interface Checks {
  volume: boolean; // 突破量 ≥ 均量 × 倍數
  vma: boolean; // 5 日均量 > 20 日均量
  obv: boolean; // OBV 創三角形期間新高（新低）
  rsi: boolean; // RSI > 55（< 45）
  rsiDiverge: boolean; // 收斂期間 RSI 低點墊高（高點降低）
  macd: boolean; // DIF > DEA 且柱狀體擴大
  adx: boolean; // 收斂期 ADX 平均 < 20 且突破日轉升
  bb: boolean; // 帶寬壓縮後擴張
  price: boolean; // 收盤超出 1% 或 0.5 ATR
  position: boolean; // 突破位置 1/2–3/4
  trend: boolean; // 順大週期（站上／跌破 120 日均線）
}
export const CHECK_KEYS: (keyof Checks)[] = ['volume', 'vma', 'obv', 'rsi', 'rsiDiverge', 'macd', 'adx', 'bb', 'price', 'position', 'trend'];
export const CORE_KEYS: (keyof Checks)[] = ['volume', 'obv', 'rsi', 'macd', 'adx', 'bb', 'price', 'position', 'trend'];

export interface Breakout {
  t: number;
  side: Side;
  tri: Triangle;
  lineAtT: number;
  breakPct: number;
  breakAtr: number;
  volRatio: number;
  rsi: number;
  adx: number;
  atr: number;
  position: number;
  checks: Checks;
  score: number; // 核心條件符合數（0–9）
  stop: number; // 三角形內最後擺動低（高）點
  stopAtr: number; // 1.5 倍 ATR 停損
  target: number; // 量測目標價
}

function pctRank(arr: number[], from: number, to: number, value: number) {
  let below = 0;
  let n = 0;
  for (let i = Math.max(0, from); i <= to; i++) {
    if (!isFinite(arr[i])) continue;
    n++;
    if (arr[i] <= value) below++;
  }
  return n ? below / n : 1;
}

export function evaluateBreakout(s: Series, ind: Indicators, t: number, tri: Triangle, side: Side, p: PatternParams): Breakout {
  const up = side === 'up';
  const lineAtT = up ? at(tri.upper, t) : at(tri.lower, t);
  const c = s.c[t];
  const a = ind.atr[t];
  const breakAbs = up ? c - lineAtT : lineAtT - c;
  const breakPct = breakAbs / lineAtT;
  const breakAtr = a > 0 ? breakAbs / a : 0;
  const volRatio = ind.vma20[t - 1] > 0 ? s.v[t] / ind.vma20[t - 1] : 0;
  const position = (t - tri.start) / (tri.apex - tri.start);

  let obvExtreme = up ? -Infinity : Infinity;
  let adxSum = 0;
  let adxN = 0;
  for (let x = tri.start; x < t; x++) {
    obvExtreme = up ? Math.max(obvExtreme, ind.obv[x]) : Math.min(obvExtreme, ind.obv[x]);
    if (isFinite(ind.adx[x])) {
      adxSum += ind.adx[x];
      adxN++;
    }
  }
  const pivots = up ? tri.lows : tri.highs;
  const r1 = pivots.length >= 2 ? ind.rsi[pivots[pivots.length - 2]] : NaN;
  const r2 = pivots.length >= 2 ? ind.rsi[pivots[pivots.length - 1]] : NaN;

  const checks: Checks = {
    volume: volRatio >= p.volRatio,
    vma: ind.vma5[t] > ind.vma20[t],
    obv: up ? ind.obv[t] >= obvExtreme : ind.obv[t] <= obvExtreme,
    rsi: up ? ind.rsi[t] > p.rsiUp : ind.rsi[t] < p.rsiDown,
    rsiDiverge: isFinite(r1) && isFinite(r2) && (up ? r2 > r1 : r2 < r1),
    macd: up ? ind.dif[t] > ind.dea[t] && ind.hist[t] > ind.hist[t - 1] : ind.dif[t] < ind.dea[t] && ind.hist[t] < ind.hist[t - 1],
    adx: adxN > 0 && adxSum / adxN < 20 && ind.adx[t] > ind.adx[t - 1],
    bb: pctRank(ind.bbw, t - 120, t - 1, ind.bbw[t - 1]) <= p.bbSqueezePct + 1e-9 && ind.bbw[t] > ind.bbw[t - 1],
    price: breakPct >= p.breakPct || breakAtr >= p.breakAtr,
    position: position >= p.posMin && position <= p.posMax,
    trend: isFinite(ind.ma120[t]) && (up ? c > ind.ma120[t] : c < ind.ma120[t]),
  };
  const score = CORE_KEYS.filter(k2 => checks[k2]).length;

  // 停損：三角形內最後一個擺動低點（做多）／高點（做空）
  const lastPivot = up ? tri.lows[tri.lows.length - 1] : tri.highs[tri.highs.length - 1];
  const stop = up ? s.l[lastPivot] : s.h[lastPivot];
  const stopAtr = up ? c - p.stopAtr * a : c + p.stopAtr * a;
  const target = up ? lineAtT + tri.height : lineAtT - tri.height;

  return {
    t, side, tri, lineAtT, breakPct, breakAtr, volRatio,
    rsi: ind.rsi[t], adx: ind.adx[t], atr: a, position, checks, score, stop, stopAtr, target,
  };
}

/** t 當天是否為「第一根收盤突破」；是的話回傳評分 */
export function detectBreakoutAt(s: Series, ind: Indicators, t: number, p: PatternParams): Breakout | null {
  if (t < 130) return null;
  const c = s.c[t];
  // 快速預篩：收盤創 5 日新高（新低）才需要做型態辨識
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = t - 5; i < t; i++) {
    hi = Math.max(hi, s.c[i]);
    lo = Math.min(lo, s.c[i]);
  }
  const maybeUp = c > hi;
  const maybeDown = c < lo;
  if (!maybeUp && !maybeDown) return null;
  const tri = findTriangle(s, ind, t, p, false);
  if (!tri) return null;
  if (maybeUp && c > at(tri.upper, t) && s.c[t - 1] <= at(tri.upper, t - 1)) return evaluateBreakout(s, ind, t, tri, 'up', p);
  if (maybeDown && c < at(tri.lower, t) && s.c[t - 1] >= at(tri.lower, t - 1)) return evaluateBreakout(s, ind, t, tri, 'down', p);
  return null;
}

// ───────────────────────── 回測 ─────────────────────────
export interface Outcome {
  entry: number; // 隔天開盤進場
  result: 'target' | 'stop' | 'time' | 'open';
  exitDays: number;
  pnlPct: number; // 出場報酬（做空以反向計算）
  ret5: number | null;
  ret10: number | null;
  ret20: number | null;
  mfe: number; // 最大有利
  mae: number; // 最大不利
  held3: boolean; // 突破後 3 根收盤仍站在線外（真突破）
  halfTarget: boolean; // 曾達到 0.5 倍量測目標
}

export function simulate(s: Series, b: Breakout, p: PatternParams): Outcome | null {
  const t = b.t;
  if (t + 1 >= s.c.length) return null;
  const up = b.side === 'up';
  const dir = up ? 1 : -1;
  const entry = s.o[t + 1];
  if (!(entry > 0)) return null;
  const stop = b.stop;
  const target = b.target;
  const half = b.lineAtT + (target - b.lineAtT) / 2;
  const ret = (px: number) => (dir * (px - entry)) / entry;
  const retAt = (n: number) => (t + n < s.c.length ? ret(s.c[t + n]) : null);

  let held3 = true;
  for (let i = 1; i <= 3; i++) {
    if (t + i >= s.c.length) break;
    const ln = up ? at(b.tri.upper, t + i) : at(b.tri.lower, t + i);
    if (up ? s.c[t + i] <= ln : s.c[t + i] >= ln) held3 = false;
  }

  let mfe = 0;
  let mae = 0;
  let halfTarget = false;
  for (let i = 1; i <= p.holdDays; i++) {
    const x = t + i;
    if (x >= s.c.length) {
      return { entry, result: 'open', exitDays: i - 1, pnlPct: ret(s.c[s.c.length - 1]), ret5: retAt(5), ret10: retAt(10), ret20: retAt(20), mfe, mae, held3, halfTarget };
    }
    const fav = up ? s.h[x] : s.l[x];
    const adv = up ? s.l[x] : s.h[x];
    mfe = Math.max(mfe, ret(fav));
    mae = Math.min(mae, ret(adv));
    if (up ? fav >= half : fav <= half) halfTarget = true;
    const hitStop = up ? adv <= stop : adv >= stop;
    const hitTarget = up ? fav >= target : fav <= target;
    if (hitStop) {
      // 跳空穿越停損以開盤價出場；同一天同時碰到停損與目標，保守視為停損
      const px = up ? Math.min(stop, s.o[x]) : Math.max(stop, s.o[x]);
      return { entry, result: 'stop', exitDays: i, pnlPct: ret(px), ret5: retAt(5), ret10: retAt(10), ret20: retAt(20), mfe, mae, held3, halfTarget };
    }
    if (hitTarget) {
      const px = up ? Math.max(target, s.o[x]) : Math.min(target, s.o[x]);
      return { entry, result: 'target', exitDays: i, pnlPct: ret(px), ret5: retAt(5), ret10: retAt(10), ret20: retAt(20), mfe, mae, held3, halfTarget };
    }
  }
  return { entry, result: 'time', exitDays: p.holdDays, pnlPct: ret(s.c[t + p.holdDays]), ret5: retAt(5), ret10: retAt(10), ret20: retAt(20), mfe, mae, held3, halfTarget };
}

// ───────────────────────── 每日掃描 ─────────────────────────
export interface ScanRow {
  id: string;
  name: string;
  market: string;
  status: 'breakout' | 'confirming' | 'forming';
  side: Side;
  daysSince: number; // 突破後第幾天（0 = 今天）
  date: string; // 資料日期
  close: number;
  lineNow: number; // 今天的上軌（下軌）價位
  distPct: number; // 收盤距離突破線（%，正數表示已在線外）
  breakPct: number;
  breakAtr: number;
  volRatio: number;
  rsi: number;
  adx: number;
  atr: number;
  position: number;
  touches: number;
  shape: Triangle['shape'];
  lengthBars: number;
  checks: Checks;
  score: number;
  stop: number;
  stopAtr: number;
  target: number;
  rr: number; // 報酬風險比
  avgVol20: number;
  // 畫圖用
  chart: { startDate: string; endDate: string; u0: number; u1: number; l0: number; l1: number; highs: [string, number][]; lows: [string, number][] };
}

const r2 = (x: number) => (isFinite(x) ? Number(x.toFixed(2)) : 0);
const r4 = (x: number) => (isFinite(x) ? Number(x.toFixed(4)) : 0);

function chartOf(s: Series, tri: Triangle, endIdx: number): ScanRow['chart'] {
  return {
    startDate: s.date[tri.start],
    endDate: s.date[endIdx],
    u0: r2(at(tri.upper, tri.start)),
    u1: r2(at(tri.upper, endIdx)),
    l0: r2(at(tri.lower, tri.start)),
    l1: r2(at(tri.lower, endIdx)),
    highs: tri.highs.map(i => [s.date[i], r2(s.h[i])]),
    lows: tri.lows.map(i => [s.date[i], r2(s.l[i])]),
  };
}

function rowFromBreakout(s: Series, ind: Indicators, b: Breakout, status: ScanRow['status'], daysSince: number): ScanRow {
  const last = s.c.length - 1;
  const up = b.side === 'up';
  const lineNow = up ? at(b.tri.upper, last) : at(b.tri.lower, last);
  const close = s.c[last];
  const risk = up ? close - b.stop : b.stop - close;
  const reward = up ? b.target - close : close - b.target;
  return {
    id: s.id, name: s.name, market: s.market, status, side: b.side, daysSince,
    date: s.date[last], close: r2(close), lineNow: r2(lineNow),
    distPct: r4((up ? close - lineNow : lineNow - close) / lineNow),
    breakPct: r4(b.breakPct), breakAtr: r2(b.breakAtr), volRatio: r2(b.volRatio), rsi: r2(b.rsi), adx: r2(b.adx), atr: r2(b.atr),
    position: r2(b.position), touches: b.tri.touches, shape: b.tri.shape, lengthBars: b.t - b.tri.start,
    checks: b.checks, score: b.score, stop: r2(b.stop), stopAtr: r2(b.stopAtr), target: r2(b.target),
    rr: risk > 0 ? r2(reward / risk) : 0, avgVol20: Math.round(ind.vma20[last] || 0),
    chart: chartOf(s, b.tri, last),
  };
}

/** 掃描最後一天：今天突破、突破後 1–3 天仍站在線外、或正在收斂 */
export function scanLatest(s: Series, p: PatternParams = DEFAULT_PARAMS): ScanRow | null {
  const n = s.c.length;
  if (n < 140) return null;
  const ind = computeIndicators(s, p);
  const last = n - 1;
  for (let d = 0; d <= 3; d++) {
    const t = last - d;
    const b = detectBreakoutAt(s, ind, t, p);
    if (!b) continue;
    // 突破後每天收盤都要仍在線外
    let held = true;
    for (let x = t + 1; x <= last; x++) {
      const ln = b.side === 'up' ? at(b.tri.upper, x) : at(b.tri.lower, x);
      if (b.side === 'up' ? s.c[x] <= ln : s.c[x] >= ln) held = false;
    }
    if (!held) return null;
    return rowFromBreakout(s, ind, b, d === 0 ? 'breakout' : 'confirming', d);
  }
  // 收斂中：今天仍在三角形內
  const tri = findTriangle(s, ind, last, p, true);
  if (!tri) return null;
  const close = s.c[last];
  const u = at(tri.upper, last);
  const lo = at(tri.lower, last);
  if (close > u || close < lo) return null; // 已在線外（較早突破或跌破），不算收斂中
  const side: Side = u - close <= close - lo ? 'up' : 'down';
  const fake: Breakout = evaluateBreakout(s, ind, last, tri, side, p);
  const row = rowFromBreakout(s, ind, fake, 'forming', -1);
  return row;
}

// ───────────────────────── 回測彙總 ─────────────────────────
export interface EventRec {
  id: string;
  name: string;
  date: string;
  side: Side;
  score: number;
  volRatio: number;
  position: number;
  shape: Triangle['shape'];
  checks: Checks;
  breakPct: number;
  out: Outcome;
}

export interface Bucket {
  n: number;
  win: number; // 先到目標
  stop: number; // 先到停損
  held3: number; // 真突破
  half: number; // 達 0.5 倍目標
  sumPnl: number;
  sumR5: number;
  nR5: number;
  sumR10: number;
  nR10: number;
  sumR20: number;
  nR20: number;
  pos20: number; // 20 天後報酬為正
}
export const emptyBucket = (): Bucket => ({ n: 0, win: 0, stop: 0, held3: 0, half: 0, sumPnl: 0, sumR5: 0, nR5: 0, sumR10: 0, nR10: 0, sumR20: 0, nR20: 0, pos20: 0 });
export function addToBucket(b: Bucket, o: Outcome) {
  b.n++;
  if (o.result === 'target') b.win++;
  if (o.result === 'stop') b.stop++;
  if (o.held3) b.held3++;
  if (o.halfTarget) b.half++;
  b.sumPnl += o.pnlPct;
  if (o.ret5 != null) { b.sumR5 += o.ret5; b.nR5++; }
  if (o.ret10 != null) { b.sumR10 += o.ret10; b.nR10++; }
  if (o.ret20 != null) { b.sumR20 += o.ret20; b.nR20++; if (o.ret20 > 0) b.pos20++; }
}
export function summarize(b: Bucket) {
  const f = (x: number) => Number(x.toFixed(4));
  return {
    n: b.n,
    winRate: b.n ? f(b.win / b.n) : 0,
    stopRate: b.n ? f(b.stop / b.n) : 0,
    trueBreak: b.n ? f(b.held3 / b.n) : 0,
    halfTarget: b.n ? f(b.half / b.n) : 0,
    avgPnl: b.n ? f(b.sumPnl / b.n) : 0,
    avgR5: b.nR5 ? f(b.sumR5 / b.nR5) : 0,
    avgR10: b.nR10 ? f(b.sumR10 / b.nR10) : 0,
    avgR20: b.nR20 ? f(b.sumR20 / b.nR20) : 0,
    pos20: b.nR20 ? f(b.pos20 / b.nR20) : 0,
  };
}

export function volBucket(v: number) {
  return v < 1 ? '<1' : v < 1.5 ? '1–1.5' : v < 2 ? '1.5–2' : '≥2';
}
export function posBucket(x: number) {
  return x < 0.5 ? '<1/2' : x <= 0.75 ? '1/2–3/4' : '>3/4';
}
export function gradeOf(score: number) {
  return score >= 7 ? 'A' : score >= 5 ? 'B' : 'C';
}
