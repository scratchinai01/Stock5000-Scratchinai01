/**
 * 台股下跌預警系統 2.0（教學版）：六大風險因子 → 0–100 風險分數（純函式，方便測試與回測）
 *
 * 價格一律用還原股價（避免除權息造成假跳空），成交量用原始股數。
 * 每一天的分數只使用「當天收盤以前」的資料，不偷看未來。
 *
 * 目前資料庫沒有的子訊號（法人買賣超、期貨部位、買賣價差、成交深度、財報與法說會行事曆）
 * 不計分，並在網頁上明確標示「尚未納入」；該因子內其餘子訊號的權重會自動放大補滿。
 */
import { ema, rsi, sma, atr, obv, dmi, type Series } from './pattern';

export const FACTOR_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];
export const FACTOR_WEIGHTS: Record<FactorKey, number> = { F1: 20, F2: 15, F3: 20, F4: 15, F5: 15, F6: 15 };
export const FACTOR_NAMES: Record<FactorKey, string> = {
  F1: '趨勢破壞',
  F2: '動能衰竭',
  F3: '量價異常',
  F4: '波動與尾端風險',
  F5: '市場與產業風險',
  F6: '流動性與事件風險',
};

/** 子訊號：key、所屬因子、因子內權重、中文說明 */
export const SIGNALS = [
  { key: 'belowMa20', f: 'F1', w: 0.3, label: '收盤跌破月線（20 日均線）' },
  { key: 'belowMa60', f: 'F1', w: 0.3, label: '收盤跌破季線（60 日均線）' },
  { key: 'maBear', f: 'F1', w: 0.2, label: '月線在季線之下（20MA < 60MA）' },
  { key: 'supportBreak', f: 'F1', w: 0.2, label: '跌破近 20 日最低點（近期支撐）' },
  { key: 'rsiDiverge', f: 'F2', w: 0.3, label: 'RSI 頂背離：股價創新高、RSI 沒跟上' },
  { key: 'macdDead', f: 'F2', w: 0.25, label: 'MACD 死亡交叉（5 日內）或 DIF 在 DEA 之下' },
  { key: 'rocNeg', f: 'F2', w: 0.2, label: 'ROC(12) 轉負：12 日漲跌幅為負' },
  { key: 'kdDead', f: 'F2', w: 0.25, label: 'KD 高檔死叉：K 值 70 以上向下穿越 D 值（3 日內）' },
  { key: 'bigBlack', f: 'F3', w: 0.4, label: '爆量長黑：量 ≥ 2 倍均量且收黑 3% 以上（5 日內）' },
  { key: 'obvDiverge', f: 'F3', w: 0.3, label: '股價創新高但 OBV 沒有同步創高' },
  { key: 'volSkew', f: 'F3', w: 0.3, label: '下跌日的量明顯大於上漲日（近 20 日）' },
  { key: 'atrRise', f: 'F4', w: 0.35, label: 'ATR 占股價比例升到近 60 日平均的 1.3 倍以上' },
  { key: 'hvExpand', f: 'F4', w: 0.35, label: '20 日歷史波動率升到 120 日的 1.5 倍以上' },
  { key: 'drawdown', f: 'F4', w: 0.3, label: '距近 60 日高點回落（5% 起算，20% 滿分）' },
  { key: 'taiexWeak', f: 'F5', w: 0.35, label: '加權指數跌破季線' },
  { key: 'breadthWeak', f: 'F5', w: 0.3, label: '全市場下跌家數偏多（近 5 日平均超過 5 成）' },
  { key: 'industryWeak', f: 'F5', w: 0.35, label: '所屬產業近 20 日平均報酬轉弱（0% 起算，-10% 滿分）' },
  { key: 'gapDown', f: 'F6', w: 0.4, label: '跳空下跌 3% 以上（5 日內）' },
  { key: 'wildRange', f: 'F6', w: 0.3, label: '單日振幅異常放大（5 日內）' },
  { key: 'thinTrade', f: 'F6', w: 0.3, label: '成交值偏低（20 日平均低於 5 千萬元，1 千萬元以下滿分）' },
  // ── 以下 13 項只列入「利空訊號清單」與警戒分數，不改變六大因子 100 分（權重 0） ──
  { key: 'maBearStack', f: 'F1', w: 0, label: '均線空頭排列：5 日 < 10 日 < 20 日 < 60 日均線' },
  { key: 'belowMa240', f: 'F1', w: 0, label: '收盤跌破年線（240 日均線）' },
  { key: 'newLow52w', f: 'F1', w: 0, label: '創 52 週新低（5 日內）' },
  { key: 'downStreak', f: 'F2', w: 0, label: '連續 4 天以上收跌' },
  { key: 'macdHistShrink', f: 'F2', w: 0, label: 'MACD 紅柱連續 3 天縮短（多方力道減弱）' },
  { key: 'dmiBear', f: 'F2', w: 0, label: 'DMI 空方主導：-DI 大於 +DI 且 ADX 超過 25' },
  { key: 'bearEngulf', f: 'F3', w: 0, label: '空頭吞噬：長黑 K 完全包住前一根紅 K（5 日內）' },
  { key: 'threeCrows', f: 'F3', w: 0, label: '三隻烏鴉：連續 3 根收黑且收盤一天比一天低' },
  { key: 'upperShadow', f: 'F3', w: 0, label: '高檔長上影線：近 20 日高點附近、上影線達實體 2 倍（5 日內）' },
  { key: 'bollLower', f: 'F4', w: 0, label: '收盤跌破布林通道下軌（20 日、2 倍標準差）' },
  { key: 'rsWeak', f: 'F5', w: 0, label: '相對大盤弱勢：近 20 日報酬落後加權指數 5% 以上' },
  { key: 'gapOpen', f: 'F6', w: 0, label: '向下跳空缺口尚未回補（10 日內）' },
  { key: 'limitDown', f: 'F6', w: 0, label: '跌停或單日重挫 9% 以上（10 日內）' },
] as const;
/** 計入六大因子 100 分的原始 20 項 */
export const FACTOR_SIGNALS = SIGNALS.filter(s => s.w > 0);
export type SignalKey = (typeof SIGNALS)[number]['key'];

/** 尚未納入（資料庫目前沒有這些資料） */
export const NOT_INCLUDED: Record<FactorKey, string[]> = {
  F1: [],
  F2: [],
  F3: [],
  F4: [],
  F5: ['三大法人買賣超', '期貨未平倉部位變化'],
  F6: ['買賣價差', '委買委賣深度', '財報公布、法說會等重大事件'],
};

export const LEVELS = [
  { min: 80, key: 'extreme', label: '極高風險', emoji: '🚨' },
  { min: 60, key: 'high', label: '高風險', emoji: '🔴' },
  { min: 40, key: 'alert', label: '警戒', emoji: '🟠' },
  { min: 20, key: 'watch', label: '留意', emoji: '🟡' },
  { min: 0, key: 'low', label: '低風險', emoji: '🟢' },
] as const;
export const levelOf = (score: number) => LEVELS.find(l => score >= l.min)!;
export const levelIndex = (score: number) => (score >= 80 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0);

/** 市場與產業背景（由全市場資料事先算好） */
export interface MarketContext {
  /** 加權指數收盤 < 60 日均線（沒有指數資料的日期回傳 undefined） */
  taiexWeak(date: string): boolean | undefined;
  /** 近 5 日平均下跌家數比例 0–1 */
  breadth(date: string): number | undefined;
  /** 產業近 20 日平均報酬 */
  industryRet20(industry: string, date: string): number | undefined;
  /** 加權指數近 20 日報酬（相對強弱用，可省略） */
  taiexRet20?(date: string): number | undefined;
}

export interface RiskSeries {
  /** 每天的總分（不足 130 根 K 線的前段為 NaN） */
  score: number[];
  /** 六大因子 0–1 */
  F: Record<FactorKey, number[]>;
  /** 各子訊號 0–1（NaN 表示當天沒資料） */
  sig: Record<SignalKey, number[]>;
}

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const lin = (x: number, zeroAt: number, fullAt: number) => clamp01((x - zeroAt) / (fullAt - zeroAt));
const NaNArr = (n: number) => new Array<number>(n).fill(NaN);

function rollMax(a: number[], i0: number, i1: number) {
  let m = -Infinity;
  for (let i = Math.max(0, i0); i <= i1; i++) if (a[i] > m) m = a[i];
  return m;
}
function rollMin(a: number[], i0: number, i1: number) {
  let m = Infinity;
  for (let i = Math.max(0, i0); i <= i1; i++) if (a[i] < m) m = a[i];
  return m;
}
function argMax(a: number[], i0: number, i1: number) {
  let m = -Infinity;
  let k = -1;
  for (let i = Math.max(0, i0); i <= i1; i++)
    if (a[i] > m) {
      m = a[i];
      k = i;
    }
  return k;
}

export const MIN_BARS = 130;

/** 計算一檔股票每一天的風險分數 */
export function computeRisk(s: Series, industry: string | null, ctx: MarketContext | null): RiskSeries {
  const n = s.c.length;
  const { o, h, l, c, v } = s;
  const ma20 = sma(c, 20);
  const ma60 = sma(c, 60);
  const r14 = rsi(c, 14);
  const e12 = ema(c, 12);
  const e26 = ema(c, 26);
  const dif = e12.map((x, i) => x - e26[i]);
  const dea = ema(dif, 9);
  const ob = obv(c, v);
  const vma20 = sma(v, 20);
  const a14 = atr(h, l, c, 14);
  const atrPct = a14.map((x, i) => x / c[i]);
  const atrPctAvg60 = sma(atrPct.map(x => (isFinite(x) ? x : 0)), 60);
  // KD(9,3,3)
  const K = NaNArr(n);
  const D = NaNArr(n);
  let kPrev = 50;
  let dPrev = 50;
  for (let i = 0; i < n; i++) {
    if (i < 8) continue;
    const hh = rollMax(h, i - 8, i);
    const ll = rollMin(l, i - 8, i);
    const rsv = hh > ll ? ((c[i] - ll) / (hh - ll)) * 100 : 50;
    kPrev = (2 / 3) * kPrev + (1 / 3) * rsv;
    dPrev = (2 / 3) * dPrev + (1 / 3) * kPrev;
    K[i] = kPrev;
    D[i] = dPrev;
  }
  // 歷史波動率（日對數報酬標準差 × √252）
  const lr = c.map((x, i) => (i > 0 && c[i - 1] > 0 ? Math.log(x / c[i - 1]) : 0));
  const hv = (win: number) => {
    const out = NaNArr(n);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      s1 += lr[i];
      s2 += lr[i] * lr[i];
      if (i >= win) {
        s1 -= lr[i - win];
        s2 -= lr[i - win] * lr[i - win];
      }
      if (i >= win) out[i] = Math.sqrt(Math.max(0, s2 / win - (s1 / win) ** 2)) * Math.sqrt(252);
    }
    return out;
  };
  const hv20 = hv(20);
  const hv120 = hv(120);
  const val = v.map((x, i) => x * c[i]); // 成交值（以還原價近似）
  const val20 = sma(val, 20);
  const ma5 = sma(c, 5);
  const ma10 = sma(c, 10);
  const ma240 = sma(c, 240);
  const dm = dmi(h, l, c, 14);
  const hist = dif.map((x, i) => x - dea[i]);
  // 布林下軌
  const bbLow = NaNArr(n);
  for (let i = 19; i < n; i++) {
    let m = 0;
    for (let k = i - 19; k <= i; k++) m += c[k];
    m /= 20;
    let vsum = 0;
    for (let k = i - 19; k <= i; k++) vsum += (c[k] - m) ** 2;
    bbLow[i] = m - 2 * Math.sqrt(vsum / 20);
  }

  const sig = Object.fromEntries(SIGNALS.map(x => [x.key, NaNArr(n)])) as Record<SignalKey, number[]>;
  const F = Object.fromEntries(FACTOR_KEYS.map(k => [k, NaNArr(n)])) as Record<FactorKey, number[]>;
  const score = NaNArr(n);

  for (let t = MIN_BARS; t < n; t++) {
    const d = s.date[t];
    // F1 趨勢破壞
    sig.belowMa20[t] = c[t] < ma20[t] ? 1 : 0;
    sig.belowMa60[t] = c[t] < ma60[t] ? 1 : 0;
    sig.maBear[t] = ma20[t] < ma60[t] ? 1 : 0;
    sig.supportBreak[t] = c[t] < rollMin(l, t - 20, t - 1) ? 1 : 0;

    // F2 動能衰竭
    const hi60 = rollMax(c, t - 59, t);
    const iHi = argMax(c, t - 9, t);
    const recentHigh = c[iHi] >= hi60; // 近 10 日內創 60 日新高
    if (recentHigh) {
      const jPrev = argMax(c, t - 59, t - 15);
      sig.rsiDiverge[t] = jPrev >= 0 && r14[iHi] < r14[jPrev] - 2 ? 1 : 0;
      sig.obvDiverge[t] = ob[iHi] < rollMax(ob, t - 59, iHi - 1) ? 1 : 0;
    } else {
      sig.rsiDiverge[t] = 0;
      sig.obvDiverge[t] = 0;
    }
    let crossed = false;
    for (let k = t - 4; k <= t; k++) if (dif[k - 1] >= dea[k - 1] && dif[k] < dea[k]) crossed = true;
    sig.macdDead[t] = dif[t] < dea[t] ? (crossed ? 1 : 0.5) : 0;
    sig.rocNeg[t] = c[t] / c[t - 12] - 1 < 0 ? 1 : 0;
    let kd = 0;
    for (let k = t - 2; k <= t; k++) if (K[k - 1] >= D[k - 1] && K[k] < D[k] && K[k - 1] > 70) kd = 1;
    sig.kdDead[t] = kd;

    // F3 量價異常
    let bb = 0;
    for (let k = t - 4; k <= t; k++) if (vma20[k - 1] > 0 && v[k] >= 2 * vma20[k - 1] && o[k] > 0 && c[k] / o[k] - 1 <= -0.03) bb = 1;
    sig.bigBlack[t] = bb;
    let upV = 0;
    let upN = 0;
    let dnV = 0;
    let dnN = 0;
    for (let k = t - 19; k <= t; k++) {
      if (c[k] > c[k - 1]) {
        upV += v[k];
        upN++;
      } else if (c[k] < c[k - 1]) {
        dnV += v[k];
        dnN++;
      }
    }
    sig.volSkew[t] = upN >= 5 && dnN >= 5 && dnV / dnN >= 1.2 * (upV / upN) ? 1 : 0;

    // F4 波動與尾端風險
    sig.atrRise[t] = atrPctAvg60[t - 1] > 0 && atrPct[t] > 1.3 * atrPctAvg60[t - 1] ? 1 : 0;
    sig.hvExpand[t] = hv120[t] > 0 && hv20[t] > 1.5 * hv120[t] ? 1 : 0;
    sig.drawdown[t] = lin(-(c[t] / hi60 - 1), 0.05, 0.2);

    // F5 市場與產業風險
    const tw = ctx?.taiexWeak(d);
    sig.taiexWeak[t] = tw == null ? NaN : tw ? 1 : 0;
    const br = ctx?.breadth(d);
    sig.breadthWeak[t] = br == null ? NaN : lin(br, 0.5, 0.7);
    const ir = industry ? ctx?.industryRet20(industry, d) : undefined;
    sig.industryWeak[t] = ir == null ? NaN : lin(-ir, 0, 0.1);

    // F6 流動性與事件風險
    let gap = 0;
    let wild = 0;
    for (let k = t - 4; k <= t; k++) {
      if (o[k] / c[k - 1] - 1 <= -0.03) gap = 1;
      const rng = (h[k] - l[k]) / c[k - 1];
      if (rng >= Math.max(0.07, 2.5 * (atrPct[k - 1] || 0))) wild = 1;
    }
    sig.gapDown[t] = gap;
    sig.wildRange[t] = wild;
    sig.thinTrade[t] = lin(-val20[t], -50e6, -10e6);

    // ── 額外 13 項利空型態（清單用） ──
    sig.maBearStack[t] = ma5[t] < ma10[t] && ma10[t] < ma20[t] && ma20[t] < ma60[t] ? 1 : 0;
    sig.belowMa240[t] = isFinite(ma240[t]) ? (c[t] < ma240[t] ? 1 : 0) : NaN;
    let lo52 = 0;
    if (t >= 250) for (let k = t - 4; k <= t; k++) if (l[k] <= rollMin(l, k - 249, k - 1)) lo52 = 1;
    sig.newLow52w[t] = t >= 250 ? lo52 : NaN;
    sig.downStreak[t] = c[t] < c[t - 1] && c[t - 1] < c[t - 2] && c[t - 2] < c[t - 3] && c[t - 3] < c[t - 4] ? 1 : 0;
    sig.macdHistShrink[t] = hist[t] > 0 && hist[t] < hist[t - 1] && hist[t - 1] < hist[t - 2] && hist[t - 2] < hist[t - 3] ? 1 : 0;
    sig.dmiBear[t] = dm.mdi[t] > dm.pdi[t] && dm.adx[t] > 25 ? 1 : 0;
    let engulf = 0;
    let shadow = 0;
    for (let k = t - 4; k <= t; k++) {
      if (c[k - 1] > o[k - 1] && c[k] < o[k] && o[k] >= c[k - 1] && c[k] <= o[k - 1] && o[k] - c[k] > c[k - 1] - o[k - 1]) engulf = 1;
      const body = Math.abs(c[k] - o[k]);
      const upper = h[k] - Math.max(c[k], o[k]);
      if (h[k] >= 0.97 * rollMax(h, k - 19, k) && upper >= 2 * Math.max(body, c[k] * 0.002) && upper / c[k] >= 0.02) shadow = 1;
    }
    sig.bearEngulf[t] = engulf;
    sig.upperShadow[t] = shadow;
    sig.threeCrows[t] = [0, 1, 2].every(j => c[t - j] < o[t - j] && c[t - j] < c[t - j - 1] && (o[t - j] - c[t - j]) / o[t - j] >= 0.01) ? 1 : 0;
    sig.bollLower[t] = c[t] < bbLow[t] ? 1 : 0;
    const tr20 = ctx?.taiexRet20?.(d);
    sig.rsWeak[t] = tr20 == null ? NaN : c[t] / c[t - 20] - 1 - tr20 <= -0.05 ? 1 : 0;
    let gapOpen = 0;
    for (let k = t - 9; k <= t; k++) {
      if (h[k] < l[k - 1]) {
        // 缺口上緣 = 前一天最低；之後最高價都沒碰到 → 尚未回補
        let filled = false;
        for (let m = k + 1; m <= t; m++) if (h[m] >= l[k - 1]) filled = true;
        if (!filled) gapOpen = 1;
      }
    }
    sig.gapOpen[t] = gapOpen;
    let ld = 0;
    for (let k = t - 9; k <= t; k++) if (c[k] / c[k - 1] - 1 <= -0.09) ld = 1;
    sig.limitDown[t] = ld;

    // 因子分數：可用子訊號的加權平均（缺資料的權重自動補給其他子訊號）
    let total = 0;
    for (const fk of FACTOR_KEYS) {
      let sw = 0;
      let sv = 0;
      for (const sg of FACTOR_SIGNALS) {
        if (sg.f !== fk) continue;
        const x = sig[sg.key][t];
        if (!isFinite(x)) continue;
        sw += sg.w;
        sv += sg.w * x;
      }
      const fv = sw > 0 ? sv / sw : 0;
      F[fk][t] = fv;
      total += FACTOR_WEIGHTS[fk] * fv;
    }
    score[t] = total;
  }
  return { score, F, sig };
}

/** 未來結果：N 日報酬與 20 日內最大回落（以當天收盤為基準） */
export interface Forward {
  ret5: number;
  ret10: number;
  ret20: number;
  mdd20: number; // 未來 20 日最低價相對今天收盤（負數）
}
export function forwardAt(s: Series, t: number): Forward | null {
  if (t + 20 >= s.c.length) return null;
  const c0 = s.c[t];
  let lo = Infinity;
  for (let k = t + 1; k <= t + 20; k++) if (s.l[k] < lo) lo = s.l[k];
  return { ret5: s.c[t + 5] / c0 - 1, ret10: s.c[t + 10] / c0 - 1, ret20: s.c[t + 20] / c0 - 1, mdd20: lo / c0 - 1 };
}

// ───────────────────────── 每日清單 ─────────────────────────
export interface RiskRow {
  id: string;
  name: string;
  market: string;
  industry: string | null;
  date: string;
  close: number;
  chg1: number; // 當日漲跌幅
  ret20: number;
  score: number;
  level: number; // 0 低 … 4 極高
  F: number[]; // 六大因子 0–1（四捨五入到 0.01）
  sig: Record<string, number>; // 有觸發的子訊號（> 0）
  hist: number[]; // 近 60 個交易日分數（整數）
  avgVal20: number; // 20 日平均成交值（元）
  nSig?: number; // 觸發的利空訊號數
  alert?: number; // 利空警戒分數 0–100（依回測預警力加權）
  alertProb?: number; // 歷史上同樣訊號組合的重大下跌機率
}

/** 33 項訊號的數值向量（缺資料當 0），給警戒分數與機器學習使用 */
export function signalVector(r: RiskSeries, t: number) {
  return SIGNALS.map(s => {
    const x = r.sig[s.key][t];
    return isFinite(x) ? x : 0;
  });
}

/**
 * 利空警戒分數：每個訊號的權重 = 回測預警倍數 − 1（倍數 ≤ 1 的訊號不計分），
 * 分數 = 觸發訊號的權重合計 ÷ 前 8 強訊號權重合計 × 100（上限 100）。
 * 「前 8 強同時出現」約等於歷史上最危險的情況，所以拿來當滿分基準。
 */
export function alertWeights(lift: Record<string, { lift: number | null }>) {
  const w = SIGNALS.map(s => Math.max(0, Math.min(1.5, (lift[s.key]?.lift ?? 1) - 1)));
  const top = [...w].sort((a, b) => b - a).slice(0, 8).reduce((a, x) => a + x, 0) || 1;
  return { w, top };
}
export function alertScore(vec: number[], aw: { w: number[]; top: number }) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += aw.w[i] * vec[i];
  return Math.min(100, (s / aw.top) * 100);

}

export function riskRowLatest(s: Series, industry: string | null, ctx: MarketContext | null, aw?: { w: number[]; top: number }, sigModel?: LogitModel): RiskRow | null {
  const n = s.c.length;
  if (n < MIN_BARS + 1) return null;
  const r = computeRisk(s, industry, ctx);
  const t = n - 1;
  if (!isFinite(r.score[t])) return null;
  const sig: Record<string, number> = {};
  for (const sg of SIGNALS) {
    const x = r.sig[sg.key][t];
    if (isFinite(x) && x > 0) sig[sg.key] = Math.round(x * 100) / 100;
  }
  const hist: number[] = [];
  for (let k = Math.max(MIN_BARS, t - 59); k <= t; k++) hist.push(Math.round(r.score[k]));
  const v20 = s.v.slice(-20).reduce((a, x, i) => a + x * s.c[n - 20 + i], 0) / 20;
  return {
    id: s.id,
    name: s.name,
    market: s.market,
    industry,
    date: s.date[t],
    close: Math.round(s.c[t] * 100) / 100,
    chg1: Math.round((s.c[t] / s.c[t - 1] - 1) * 10000) / 10000,
    ret20: Math.round((s.c[t] / s.c[t - 20] - 1) * 10000) / 10000,
    score: Math.round(r.score[t] * 10) / 10,
    level: levelIndex(r.score[t]),
    F: FACTOR_KEYS.map(k => Math.round(r.F[k][t] * 100) / 100),
    sig,
    hist,
    avgVal20: Math.round(v20),
    nSig: Object.keys(sig).length,
    ...(aw ? { alert: Math.round(alertScore(signalVector(r, t), aw) * 10) / 10 } : {}),
    ...(sigModel ? { alertProb: Math.round(predictLogit(sigModel, signalVector(r, t)) * 1000) / 1000 } : {}),
  };
}

// ───────────────────────── 回測統計工具 ─────────────────────────
/** 依分數（0–100 取整）累計：樣本數、事件數、報酬加總 —— 可精確算出 PR 曲線與各級統計 */
export interface ScoreHist {
  n: number[];
  ev: number[]; // mdd20 ≤ 門檻的「重大下跌」
  ev15: number[]; // mdd20 ≤ -15%
  r5: number[];
  r10: number[];
  r20: number[];
  mdd: number[];
}
export const emptyHist = (): ScoreHist => ({
  n: new Array(101).fill(0),
  ev: new Array(101).fill(0),
  ev15: new Array(101).fill(0),
  r5: new Array(101).fill(0),
  r10: new Array(101).fill(0),
  r20: new Array(101).fill(0),
  mdd: new Array(101).fill(0),
});
export function addHist(hst: ScoreHist, score: number, f: Forward, evThreshold: number) {
  const b = Math.max(0, Math.min(100, Math.round(score)));
  hst.n[b]++;
  if (f.mdd20 <= evThreshold) hst.ev[b]++;
  if (f.mdd20 <= -0.15) hst.ev15[b]++;
  hst.r5[b] += f.ret5;
  hst.r10[b] += f.ret10;
  hst.r20[b] += f.ret20;
  hst.mdd[b] += f.mdd20;
}

/** 各風險等級統計 */
export function levelStats(hst: ScoreHist) {
  const out = LEVELS.slice()
    .reverse()
    .map((lv, i) => {
      const lo = lv.min;
      const hi = i === 4 ? 100 : LEVELS.slice().reverse()[i + 1].min - 1;
      let n = 0, ev = 0, ev15 = 0, r5 = 0, r10 = 0, r20 = 0, mdd = 0;
      for (let b = lo; b <= hi; b++) {
        n += hst.n[b];
        ev += hst.ev[b];
        ev15 += hst.ev15[b];
        r5 += hst.r5[b];
        r10 += hst.r10[b];
        r20 += hst.r20[b];
        mdd += hst.mdd[b];
      }
      const f = (x: number) => Number(x.toFixed(4));
      return { level: i, label: lv.label, n, share: 0, evRate: n ? f(ev / n) : 0, ev15Rate: n ? f(ev15 / n) : 0, r5: n ? f(r5 / n) : 0, r10: n ? f(r10 / n) : 0, r20: n ? f(r20 / n) : 0, mdd20: n ? f(mdd / n) : 0 };
    });
  const total = out.reduce((a, x) => a + x.n, 0);
  for (const x of out) x.share = total ? Number((x.n / total).toFixed(4)) : 0;
  return out;
}

/** 以分數門檻當警報：Precision、Recall、發警報比例；並算 PR-AUC（平均精確率） */
export function thresholdStats(hst: ScoreHist, thresholds = [20, 40, 60, 80]) {
  const totalN = hst.n.reduce((a, x) => a + x, 0);
  const totalEv = hst.ev.reduce((a, x) => a + x, 0);
  const rows = thresholds.map(th => {
    let n = 0;
    let ev = 0;
    for (let b = th; b <= 100; b++) {
      n += hst.n[b];
      ev += hst.ev[b];
    }
    return { threshold: th, alerts: n, alertRate: totalN ? n / totalN : 0, precision: n ? ev / n : 0, recall: totalEv ? ev / totalEv : 0 };
  });
  // PR-AUC：分數由高到低逐格累加
  let tp = 0;
  let fp = 0;
  let ap = 0;
  let prevRecall = 0;
  for (let b = 100; b >= 0; b--) {
    tp += hst.ev[b];
    fp += hst.n[b] - hst.ev[b];
    const recall = totalEv ? tp / totalEv : 0;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    ap += (recall - prevRecall) * precision;
    prevRecall = recall;
  }
  return { baseRate: totalN ? totalEv / totalN : 0, prAuc: ap, rows };
}

// ───────────────────────── 羅吉斯迴歸（機器學習基準模型） ─────────────────────────
export interface LogitModel {
  w: number[];
  b: number;
  features: string[];
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** 以批次梯度下降訓練（樣本已抽樣，資料量數十萬筆即可） */
export function trainLogit(X: Float32Array[], y: Uint8Array, features: string[], epochs = 300, lr = 0.5, l2 = 1e-4): LogitModel {
  const d = features.length;
  const w = new Array(d).fill(0);
  let b = 0;
  const m = y.length;
  // 用基準發生率初始化截距
  const p0 = y.reduce((a, x) => a + x, 0) / Math.max(1, m);
  b = Math.log(Math.max(1e-6, p0) / Math.max(1e-6, 1 - p0));
  for (let ep = 0; ep < epochs; ep++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < m; i++) {
      const xi = X[i];
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * xi[j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * xi[j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / m + l2 * w[j]);
    b -= lr * (gb / m);
  }
  return { w, b, features };
}
export function predictLogit(mdl: LogitModel, x: ArrayLike<number>) {
  let z = mdl.b;
  for (let j = 0; j < mdl.w.length; j++) z += mdl.w[j] * x[j];
  return sigmoid(z);
}

/** 機率預測評估：PR-AUC、Brier score、校準表（10 等分） */
export function evalProb(p: number[], y: ArrayLike<number>) {
  const idx = p.map((_, i) => i).sort((a, b) => p[b] - p[a]);
  const totalEv = Array.from(y).reduce((a, x) => a + x, 0);
  let tp = 0;
  let ap = 0;
  let prevRecall = 0;
  for (let k = 0; k < idx.length; k++) {
    if (y[idx[k]]) {
      tp++;
      const recall = tp / totalEv;
      ap += (recall - prevRecall) * (tp / (k + 1));
      prevRecall = recall;
    }
  }
  let brier = 0;
  for (let i = 0; i < p.length; i++) brier += (p[i] - y[i]) ** 2;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (let i = 0; i < p.length; i++) {
    const b = Math.min(9, Math.floor(p[i] * 10));
    bins[b].n++;
    bins[b].p += p[i];
    bins[b].y += y[i];
  }
  return {
    n: p.length,
    baseRate: p.length ? totalEv / p.length : 0,
    prAuc: totalEv ? ap : 0,
    brier: p.length ? brier / p.length : 0,
    calibration: bins.map((b, i) => ({ bin: i, n: b.n, predicted: b.n ? b.p / b.n : 0, actual: b.n ? b.y / b.n : 0 })).filter(b => b.n > 0),
  };
}
