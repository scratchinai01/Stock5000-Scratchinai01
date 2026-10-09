/**
 * 專業量化技術指標計算模組 (Professional Technical Analysis Indicators Engine)
 * 遵循標準金融計量經濟學算法：
 * - MA: 移動平均線 (Simple Moving Average)
 * - EMA: 指數平滑移動平均線 (Exponential Moving Average)
 * - BOLL: 布林通道 (Bollinger Bands - Mid, Upper, Lower)
 * - MACD: 指數平滑異同移動平均線 (DIF, DEM/MACD9, OSC柱)
 * - KD: 隨機指標 (Stochastic Oscillator - RSV, %K, %D)
 * - RSI: 相對強弱指標 (Relative Strength Index)
 * - ATR: 平均真實區間 (Average True Range)
 */

export interface KlinePoint {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
}

export interface IndicatorResult {
  ma?: Record<number, (number | null)[]>;
  ema?: Record<number, (number | null)[]>;
  boll?: {
    mid: (number | null)[];
    upper: (number | null)[];
    lower: (number | null)[];
  };
  macd?: {
    dif: (number | null)[];
    dem: (number | null)[];
    osc: (number | null)[];
  };
  kd?: {
    k: (number | null)[];
    d: (number | null)[];
  };
  rsi?: Record<number, (number | null)[]>;
  atr?: (number | null)[];
}

// 1. Simple Moving Average (MA)
export function calculateMA(bars: KlinePoint[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += bars[i - j].close;
    }
    result.push(Number((sum / period).toFixed(2)));
  }
  return result;
}

// 2. Exponential Moving Average (EMA)
export function calculateEMA(bars: KlinePoint[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  let prevEMA: number | null = null;

  for (let i = 0; i < bars.length; i++) {
    const close = bars[i].close;
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (prevEMA === null) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += bars[i - j].close;
      }
      prevEMA = sum / period;
      result.push(Number(prevEMA.toFixed(2)));
    } else {
      prevEMA = (close - prevEMA) * multiplier + prevEMA;
      result.push(Number(prevEMA.toFixed(2)));
    }
  }
  return result;
}

// 3. Bollinger Bands (BOLL: 20, 2)
export function calculateBOLL(
  bars: KlinePoint[],
  period: number = 20,
  multiplier: number = 2
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = calculateMA(bars, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < bars.length; i++) {
    const m = mid[i];
    if (m === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(bars[i - j].close - m, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    upper.push(Number((m + multiplier * stdDev).toFixed(2)));
    lower.push(Number((m - multiplier * stdDev).toFixed(2)));
  }

  return { mid, upper, lower };
}

// 4. Moving Average Convergence Divergence (MACD: 12, 26, 9)
export function calculateMACD(
  bars: KlinePoint[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: (number | null)[]; dem: (number | null)[]; osc: (number | null)[] } {
  const emaFast = calculateEMA(bars, fastPeriod);
  const emaSlow = calculateEMA(bars, slowPeriod);
  const dif: (number | null)[] = [];

  for (let i = 0; i < bars.length; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f === null || s === null) {
      dif.push(null);
    } else {
      dif.push(Number((f - s).toFixed(2)));
    }
  }

  // DEM is EMA of DIF
  const dem: (number | null)[] = [];
  const multiplier = 2 / (signalPeriod + 1);
  let prevDEM: number | null = null;

  for (let i = 0; i < dif.length; i++) {
    const val = dif[i];
    if (val === null) {
      dem.push(null);
      continue;
    }
    if (prevDEM === null) {
      // Find past signalPeriod valid points
      let count = 0;
      let sum = 0;
      for (let j = i; j >= 0 && count < signalPeriod; j--) {
        if (dif[j] !== null) {
          sum += dif[j]!;
          count++;
        }
      }
      if (count === signalPeriod) {
        prevDEM = sum / signalPeriod;
        dem.push(Number(prevDEM.toFixed(2)));
      } else {
        dem.push(null);
      }
    } else {
      prevDEM = (val - prevDEM) * multiplier + prevDEM;
      dem.push(Number(prevDEM.toFixed(2)));
    }
  }

  // OSC is 2 * (DIF - DEM)
  const osc: (number | null)[] = [];
  for (let i = 0; i < bars.length; i++) {
    const d = dif[i];
    const m = dem[i];
    if (d === null || m === null) {
      osc.push(null);
    } else {
      osc.push(Number((2 * (d - m)).toFixed(2)));
    }
  }

  return { dif, dem, osc };
}

// 5. Stochastic Oscillator (KD: 9, 3, 3)
export function calculateKD(
  bars: KlinePoint[],
  n: number = 9,
  m1: number = 3,
  m2: number = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const kArr: (number | null)[] = [];
  const dArr: (number | null)[] = [];

  let lastK = 50;
  let lastD = 50;

  for (let i = 0; i < bars.length; i++) {
    if (i < n - 1) {
      kArr.push(null);
      dArr.push(null);
      continue;
    }

    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let j = 0; j < n; j++) {
      const b = bars[i - j];
      if (b.high > highestHigh) highestHigh = b.high;
      if (b.low < lowestLow) lowestLow = b.low;
    }

    const range = highestHigh - lowestLow;
    const rsv = range === 0 ? 50 : ((bars[i].close - lowestLow) / range) * 100;

    const currentK = (2 / 3) * lastK + (1 / 3) * rsv;
    const currentD = (2 / 3) * lastD + (1 / 3) * currentK;

    kArr.push(Number(currentK.toFixed(2)));
    dArr.push(Number(currentD.toFixed(2)));

    lastK = currentK;
    lastD = currentD;
  }

  return { k: kArr, d: dArr };
}

// 6. Relative Strength Index (RSI: 6, 12, 14)
export function calculateRSI(bars: KlinePoint[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  if (bars.length < period + 1) {
    return bars.map(() => null);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi.push(...Array(period).fill(null));

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(Number((100 - 100 / (1 + rs)).toFixed(2)));

  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rsVal = avgGain / avgLoss;
      rsi.push(Number((100 - 100 / (1 + rsVal)).toFixed(2)));
    }
  }

  return rsi;
}

// 7. Average True Range (ATR: 14)
export function calculateATR(bars: KlinePoint[], period: number = 14): (number | null)[] {
  const atr: (number | null)[] = [];
  if (bars.length < 2) return bars.map(() => null);

  const trArr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const prevC = bars[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trArr.push(tr);
  }

  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += trArr[i];
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      atr.push(Number((sum / period).toFixed(2)));
    } else {
      const prevAtr = atr[i - 1]!;
      const currentAtr = (prevAtr * (period - 1) + trArr[i]) / period;
      atr.push(Number(currentAtr.toFixed(2)));
    }
  }

  return atr;
}
