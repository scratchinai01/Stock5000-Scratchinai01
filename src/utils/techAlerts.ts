/**
 * 技術面警訊雷達：偵測持股轉弱、異常或背離
 *
 * - 純函式：輸入日 K（由舊到新），輸出最後一根 K 棒觸發的警訊與原因（含實際數字）
 * - 門檻都可調整（AlertSettings）；這些是偵測規則，不代表觸發後一定下跌
 * - MACD、KD、RSI 同屬「動能」訊號，綜合判斷時只算一份證據
 */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AlertId = 'support' | 'bigBlack' | 'lowVolHigh' | 'upperShadow' | 'maWeak' | 'macdCross' | 'rsiDiv' | 'kdCross' | 'breakoutFail' | 'gapFail';
export type AlertGroup = 'price' | 'volume' | 'candle' | 'trend' | 'momentum';

export interface AlertSettings {
  enabled: Record<AlertId, boolean>;
  supportDays: number; // 1 支撐：前 N 日最低價
  atrPeriod: number; // 2 放量長黑：實體 > ATR × bodyAtr
  bodyAtr: number;
  volAvgDays: number; // 均量天數（2、3 共用）
  volSpike: number; // 2 成交量 > 均量 × volSpike
  newHighDays: number; // 3 創 N 日新高
  lowVolRatio: number; // 3 成交量 < 均量 × lowVolRatio
  highZoneDays: number; // 4 近 N 日高檔
  highZonePct: number; // 4 當日最高價距近期最高價在此百分比內算高檔
  shadowRatio: number; // 4 上影線 > 實體 × shadowRatio
  maDays: number; // 5 均線天數
  maBelowDays: number; // 5 連續 N 日收在均線下
  maSlopeDays: number; // 5 均線低於 N 日前
  maAlertDays: number; // 5 轉弱後最多連續提醒幾天
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  rsiPeriod: number; // 7
  pivotBars: number; // 7 波段高點左右各需 N 根較低的 K 棒才算確認
  divergenceRecent: number; // 7 第二個高點須在最近 N 個交易日內
  kdPeriod: number; // 8
  kdHigh: number; // 8 高檔門檻
  breakoutDays: number; // 9 突破前 N 日高點
  breakoutFailDays: number; // 9 N 個交易日內收回
  gapDays: number; // 10 檢查最近 N 日內的向上跳空
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: { support: true, bigBlack: true, lowVolHigh: true, upperShadow: true, maWeak: true, macdCross: true, rsiDiv: true, kdCross: true, breakoutFail: true, gapFail: true },
  supportDays: 20,
  atrPeriod: 14,
  bodyAtr: 1,
  volAvgDays: 20,
  volSpike: 1.5,
  newHighDays: 20,
  lowVolRatio: 0.7,
  highZoneDays: 20,
  highZonePct: 3,
  shadowRatio: 2,
  maDays: 20,
  maBelowDays: 2,
  maSlopeDays: 5,
  maAlertDays: 3,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  rsiPeriod: 14,
  pivotBars: 3,
  divergenceRecent: 5,
  kdPeriod: 9,
  kdHigh: 80,
  breakoutDays: 20,
  breakoutFailDays: 3,
  gapDays: 20,
};

export const ALERT_META: Record<AlertId, { no: number; title: string; short: string; message: string; group: AlertGroup; rule: (s: AlertSettings) => string }> = {
  support: { no: 1, title: '跌破關鍵支撐', short: '支撐失守', message: '價格跌破近期區間下緣', group: 'price', rule: s => `收盤跌破前 ${s.supportDays} 個交易日最低價` },
  bigBlack: { no: 2, title: '放量長黑', short: '放量長黑', message: '下跌伴隨成交量明顯增加', group: 'volume', rule: s => `收黑、實體超過 ATR（${s.atrPeriod}）× ${s.bodyAtr}，成交量超過 ${s.volAvgDays} 日均量 ${s.volSpike} 倍` },
  lowVolHigh: { no: 3, title: '上漲量縮', short: '價漲量縮', message: '價格創高，成交量未同步擴大', group: 'volume', rule: s => `收盤創近 ${s.newHighDays} 日新高，成交量低於 ${s.volAvgDays} 日均量的 ${Math.round(s.lowVolRatio * 100)}%` },
  upperShadow: { no: 4, title: '高檔長上影線', short: '高檔長上影', message: '盤中衝高後明顯回落', group: 'candle', rule: s => `最高價在近 ${s.highZoneDays} 日高點 ${s.highZonePct}% 以內，上影線超過實體 ${s.shadowRatio} 倍，收盤落在當日振幅下半部` },
  maWeak: { no: 5, title: '均線轉弱', short: '均線轉弱', message: '價格與月線方向同步轉弱', group: 'trend', rule: s => `收盤連續 ${s.maBelowDays} 日低於 ${s.maDays} 日均線，且該均線低於 ${s.maSlopeDays} 日前（轉弱後提醒 ${s.maAlertDays} 天）` },
  macdCross: { no: 6, title: 'MACD 死亡交叉', short: 'MACD 死叉', message: '短期動能相對長期動能減弱', group: 'momentum', rule: s => `DIF（${s.macdFast},${s.macdSlow}）由上向下穿越訊號線（${s.macdSignal}）` },
  rsiDiv: { no: 7, title: 'RSI 高檔背離', short: 'RSI 背離', message: '價格創高，動能未同步創高', group: 'momentum', rule: s => `相鄰兩個已確認波段高點（左右各 ${s.pivotBars} 根），股價創高但 RSI（${s.rsiPeriod}）高點降低；第二個高點在最近 ${s.divergenceRecent} 日內` },
  kdCross: { no: 8, title: 'KD 高檔死亡交叉', short: 'KD 高檔死叉', message: '高檔短線動能出現轉折', group: 'momentum', rule: s => `前一日 K、D 均高於 ${s.kdHigh}，當日 K 向下穿越 D（KD ${s.kdPeriod}）` },
  breakoutFail: { no: 9, title: '突破後失敗', short: '突破失敗', message: '突破未能維持，價格回到原區間', group: 'price', rule: s => `收盤突破前 ${s.breakoutDays} 日高點後，${s.breakoutFailDays} 個交易日內收回突破價下方` },
  gapFail: { no: 10, title: '跳空缺口失守', short: '缺口失守', message: '先前向上跳空的價格區域已失守', group: 'price', rule: s => `最近 ${s.gapDays} 日內的向上跳空，後續收盤跌破缺口下緣` },
};

export interface Triggered {
  id: AlertId;
  /** 這次觸發的實際數字，例如「收盤 98.5 跌破前 20 日最低價 99.2」 */
  detail: string;
  /** 放進綜合提醒的一句話 */
  fact: string;
}

const r2 = (v: number) => Number(v.toFixed(2));
const px = (v: number) => (v >= 100 ? v.toFixed(1).replace(/\.0$/, '') : r2(v).toString());
const sma = (a: number[], end: number, n: number) => {
  if (end - n + 1 < 0) return NaN;
  let s = 0;
  for (let i = end - n + 1; i <= end; i++) s += a[i];
  return s / n;
};
function ema(a: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  a.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}
/** Wilder RSI */
export function rsiSeries(close: number[], n: number): number[] {
  const out = new Array(close.length).fill(NaN);
  if (close.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = close[i] - close[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
/** 台灣常用 KD（RSV 期數 n，K、D 各以 1/3 平滑） */
export function kdSeries(b: Bar[], n: number): { k: number[]; d: number[] } {
  const k: number[] = [];
  const d: number[] = [];
  b.forEach((_, i) => {
    const from = Math.max(0, i - n + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = from; j <= i; j++) { hh = Math.max(hh, b[j].high); ll = Math.min(ll, b[j].low); }
    const rsv = hh === ll ? 50 : ((b[i].close - ll) / (hh - ll)) * 100;
    const pk = i === 0 ? 50 : k[i - 1];
    const pd = i === 0 ? 50 : d[i - 1];
    k.push((2 / 3) * pk + (1 / 3) * rsv);
    d.push((2 / 3) * pd + (1 / 3) * k[i]);
  });
  return { k, d };
}
function atrSeries(b: Bar[], n: number): number[] {
  const tr = b.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  const out = new Array(b.length).fill(NaN);
  if (b.length < n) return out;
  let a = 0;
  for (let i = 0; i < n; i++) a += tr[i];
  a /= n;
  out[n - 1] = a;
  for (let i = n; i < b.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}

/** 評估最後一根 K 棒（index t）觸發哪些警訊 */
export function detectAlerts(bars: Bar[], s: AlertSettings = DEFAULT_ALERT_SETTINGS, opts: { skipVolumeLow?: boolean } = {}): Triggered[] {
  const out: Triggered[] = [];
  const t = bars.length - 1;
  if (t < 30) return out;
  const b = bars;
  const C = b.map(x => x.close);
  const V = b.map(x => x.volume);
  const today = b[t];
  const on = (id: AlertId) => s.enabled[id] !== false;
  const range = (from: number, to: number) => b.slice(Math.max(0, from), to + 1);
  const avgVol = sma(V, t - 1, s.volAvgDays); // 不含今天
  const volRatio = avgVol > 0 ? today.volume / avgVol : NaN;

  // 1 跌破關鍵支撐
  if (on('support')) {
    const lo = Math.min(...range(t - s.supportDays, t - 1).map(x => x.low));
    if (today.close < lo) out.push({ id: 'support', detail: `收盤 ${px(today.close)} 跌破前 ${s.supportDays} 日最低價 ${px(lo)}`, fact: `收盤跌破 ${s.supportDays} 日支撐（${px(lo)}）` });
  }

  // 2 放量長黑
  if (on('bigBlack')) {
    const atr = atrSeries(b, s.atrPeriod)[t - 1];
    const body = today.open - today.close;
    if (body > 0 && atr > 0 && body > atr * s.bodyAtr && volRatio > s.volSpike) {
      out.push({ id: 'bigBlack', detail: `收黑實體 ${px(body)}（ATR ${px(atr)} 的 ${r2(body / atr)} 倍），成交量為 ${s.volAvgDays} 日均量 ${r2(volRatio)} 倍`, fact: `成交量為均量的 ${r2(volRatio)} 倍，出現放量長黑` });
    }
  }

  // 3 上漲量縮（盤中累計量本來就偏低，盤中不判斷）
  if (on('lowVolHigh') && !opts.skipVolumeLow) {
    const hi = Math.max(...C.slice(Math.max(0, t - s.newHighDays), t));
    if (today.close > hi && volRatio < s.lowVolRatio) {
      out.push({ id: 'lowVolHigh', detail: `收盤 ${px(today.close)} 創近 ${s.newHighDays} 日新高（前高 ${px(hi)}），成交量僅均量的 ${Math.round(volRatio * 100)}%`, fact: `收盤創 ${s.newHighDays} 日新高，但成交量只有均量的 ${Math.round(volRatio * 100)}%` });
    }
  }

  // 4 高檔長上影線
  if (on('upperShadow')) {
    const recentHigh = Math.max(...range(t - s.highZoneDays, t - 1).map(x => x.high));
    const bodyRaw = Math.abs(today.close - today.open);
    const body = Math.max(bodyRaw, today.close * 0.001);
    const upper = today.high - Math.max(today.open, today.close);
    const span = today.high - today.low;
    const inZone = today.high >= recentHigh * (1 - s.highZonePct / 100);
    if (inZone && span > 0 && upper > body * s.shadowRatio && today.close < today.low + span / 2) {
      out.push({ id: 'upperShadow', detail: `最高 ${px(today.high)}（近 ${s.highZoneDays} 日高點 ${px(recentHigh)}），上影線 ${px(upper)} 為實體 ${px(bodyRaw)} 的 ${bodyRaw > 0 ? r2(upper / bodyRaw) : '多'} 倍，收在振幅下半部`, fact: `盤中衝高到 ${px(today.high)} 後回落，留下長上影線` });
    }
  }

  // 5 均線轉弱：條件剛成立時提醒（最多連續提醒 maAlertDays 天，避免長期在均線下每天都響）
  if (on('maWeak')) {
    const cond = (i: number) => {
      for (let k = 0; k < s.maBelowDays; k++) if (!(C[i - k] < sma(C, i - k, s.maDays))) return false;
      return sma(C, i, s.maDays) < sma(C, i - s.maSlopeDays, s.maDays);
    };
    let run = 0;
    while (run <= s.maAlertDays && t - run > s.maDays + s.maSlopeDays && cond(t - run)) run++;
    if (run >= 1 && run <= s.maAlertDays) {
      const maNow = sma(C, t, s.maDays);
      const maPrev = sma(C, t - s.maSlopeDays, s.maDays);
      out.push({ id: 'maWeak', detail: `連續 ${s.maBelowDays} 日收在 ${s.maDays} 日均線（${px(maNow)}）之下，均線比 ${s.maSlopeDays} 日前（${px(maPrev)}）低（轉弱第 ${run} 天）`, fact: `連續 ${s.maBelowDays} 日收在 ${s.maDays} 日均線下，且均線下彎` });
    }
  }

  // 6 MACD 死亡交叉
  if (on('macdCross')) {
    const f = ema(C, s.macdFast);
    const sl = ema(C, s.macdSlow);
    const dif = f.map((v, i) => v - sl[i]);
    const sig = ema(dif, s.macdSignal);
    if (dif[t - 1] >= sig[t - 1] && dif[t] < sig[t]) {
      out.push({ id: 'macdCross', detail: `DIF ${r2(dif[t])} 跌破訊號線 ${r2(sig[t])}（前一日 ${r2(dif[t - 1])} ≥ ${r2(sig[t - 1])}）`, fact: 'MACD 出現死亡交叉' });
    }
  }

  // 7 RSI 高檔背離（只看已確認的波段高點）
  if (on('rsiDiv')) {
    const rsi = rsiSeries(C, s.rsiPeriod);
    const k = s.pivotBars;
    const pivots: number[] = [];
    for (let i = Math.max(k, t - 120); i <= t - k; i++) {
      let ok = true;
      for (let j = i - k; j <= i + k; j++) if (j !== i && b[j].high >= b[i].high) { ok = false; break; }
      if (ok) pivots.push(i);
    }
    if (pivots.length >= 2) {
      const p2 = pivots[pivots.length - 1];
      const p1 = pivots[pivots.length - 2];
      if (t - p2 <= s.divergenceRecent && b[p2].high > b[p1].high && rsi[p2] < rsi[p1]) {
        out.push({ id: 'rsiDiv', detail: `波段高點 ${b[p1].date.slice(5)} ${px(b[p1].high)} → ${b[p2].date.slice(5)} ${px(b[p2].high)} 創高，RSI 卻由 ${r2(rsi[p1])} 降到 ${r2(rsi[p2])}`, fact: '股價創高但 RSI 沒有跟著創高（背離）' });
      }
    }
  }

  // 8 KD 高檔死亡交叉
  if (on('kdCross')) {
    const { k, d } = kdSeries(b, s.kdPeriod);
    if (k[t - 1] > s.kdHigh && d[t - 1] > s.kdHigh && k[t - 1] >= d[t - 1] && k[t] < d[t]) {
      out.push({ id: 'kdCross', detail: `前一日 K ${r2(k[t - 1])}、D ${r2(d[t - 1])} 都在 ${s.kdHigh} 以上，今日 K ${r2(k[t])} 跌破 D ${r2(d[t])}`, fact: 'KD 在高檔死亡交叉' });
    }
  }

  // 9 突破後失敗：最近 N 日內有收盤突破前高，今天收回突破價下方（只在第一次收回時提醒）
  if (on('breakoutFail')) {
    for (let j = t - 1; j >= t - s.breakoutFailDays && j > s.breakoutDays; j--) {
      const level = Math.max(...range(j - s.breakoutDays, j - 1).map(x => x.high));
      if (C[j] > level) {
        const between = C.slice(j + 1, t);
        if (today.close < level && between.every(c => c >= level)) {
          out.push({ id: 'breakoutFail', detail: `${b[j].date.slice(5)} 收盤 ${px(C[j])} 突破前 ${s.breakoutDays} 日高點 ${px(level)}，今日收盤 ${px(today.close)} 又回到下方`, fact: `${t - j} 個交易日前的突破（${px(level)}）沒有守住` });
        }
        break;
      }
    }
  }

  // 10 跳空缺口失守：最近 N 日內的向上跳空，今天第一次收盤跌破缺口下緣
  if (on('gapFail')) {
    for (let j = t - 1; j >= Math.max(1, t - s.gapDays); j--) {
      const edge = b[j - 1].high;
      if (b[j].low > edge) {
        const held = C.slice(j, t).every(c => c >= edge);
        if (held && today.close < edge) {
          out.push({ id: 'gapFail', detail: `${b[j].date.slice(5)} 向上跳空（缺口 ${px(edge)}～${px(b[j].low)}），今日收盤 ${px(today.close)} 跌破缺口下緣`, fact: `${b[j].date.slice(5)} 的向上跳空缺口（${px(edge)}）失守` });
        }
        break;
      }
    }
  }
  return out.sort((a, z) => ALERT_META[a.id].no - ALERT_META[z.id].no);
}

/** 證據份數：MACD、KD、RSI 同屬動能，只算一份 */
export function evidenceCount(list: Triggered[]): number {
  const groups = list.map(x => ALERT_META[x.id].group);
  return groups.filter(g => g !== 'momentum').length + (groups.includes('momentum') ? 1 : 0);
}

export type AlertLevel = 0 | 1 | 2 | 3;
/** 0 無；1 單一警訊；2 兩份證據（警訊增加）；3 三份以上 */
export const alertLevel = (list: Triggered[]): AlertLevel => {
  const n = evidenceCount(list);
  return (n >= 3 ? 3 : n) as AlertLevel;
};

/** 綜合提醒的文字（多項警訊同時出現時） */
export function summarize(list: Triggered[], statusText: string, dayWord = '今日'): { headline: string; body: string; triggers: string; status: string } | null {
  if (!list.length) return null;
  const n = evidenceCount(list);
  const momentum = list.filter(x => ALERT_META[x.id].group === 'momentum');
  const headline = n >= 3 ? '⚠️ 多項技術面警訊同時出現' : n === 2 ? '⚠️ 技術面警訊增加' : '🔎 出現技術面警訊';
  const facts = list.map(x => x.fact);
  const body = `${dayWord}${facts.join('；')}。`;
  const triggers = `觸發：${list.map(x => ALERT_META[x.id].short).join('、')}${momentum.length > 1 ? `（${momentum.map(x => ALERT_META[x.id].short).join('、')} 同屬動能訊號，合計算一份）` : ''}。`;
  return { headline, body, triggers, status: `狀態：${statusText}。` };
}
