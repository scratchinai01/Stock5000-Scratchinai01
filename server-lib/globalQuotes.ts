/**
 * 國際原物料期貨與加密貨幣的即時報價
 * - 原物料：Yahoo Finance 期貨連續月報價（交易所規定延遲約 10～15 分鐘）
 * - 加密貨幣：Binance 公開行情（即時，含最佳買賣價）
 * 抓不到就不回傳，前端會把該商品標成「不可交易」，絕不使用內建數字。
 */
import { getInstrumentTradingClock } from '../src/utils/tradingClock';

// 系統代號 → Yahoo 代號。LME 鎳、鋅沒有公開免費的即時來源，暫不提供報價。
export const COMMODITY_YAHOO: Record<string, string> = {
  CL: 'CL=F', BZ: 'BZ=F', NG: 'NG=F', RB: 'RB=F', HO: 'HO=F',
  GC: 'GC=F', SI: 'SI=F', PL: 'PL=F', PA: 'PA=F', HG: 'HG=F', ALI: 'ALI=F',
  ZS: 'ZS=F', ZC: 'ZC=F', ZW: 'ZW=F', ZL: 'ZL=F', ZM: 'ZM=F',
  KC: 'KC=F', SB: 'SB=F', CC: 'CC=F', OJ: 'OJ=F', CT: 'CT=F',
  LE: 'LE=F', HE: 'HE=F', GF: 'GF=F',
};
const CENTS_TO_USD = new Set(['ZS', 'ZC', 'ZW']);
export const COMMODITY_NO_SOURCE = new Set(['NI', 'ZN']);

// 系統代號 → Binance 交易對（USDT 以 USDC/USDT 交易對換算成美元）
export const CRYPTO_BINANCE: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT', DOGE: 'DOGEUSDT', XRP: 'XRPUSDT', USDC: 'USDCUSDT',
};

export interface GlobalQuote {
  symbol: string;
  price: number;
  prevClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number;
  bid: number | null;
  ask: number | null;
  tradeTime: number; // ms
  source: string;
  delayNote: string;
}

const TTL_MS = 120_000;
const cache = new Map<string, { at: number; q: GlobalQuote | null; err?: string }>();
export const globalQuoteErrors = new Map<string, string>();

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function getJson(url: string, ms = 6000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Stock5000 classroom)', Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchYahoo(sym: string): Promise<GlobalQuote> {
  const y = COMMODITY_YAHOO[sym];
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=1d&range=5d`);
  const r = j?.chart?.result?.[0];
  const m = r?.meta;
  const price = num(m?.regularMarketPrice);
  if (!price) throw new Error(j?.chart?.error?.description || '沒有成交價');
  // 前一交易日收盤：取日K倒數第二根，沒有再用 meta
  const closes: number[] = (r?.indicators?.quote?.[0]?.close || []).map(Number).filter((x: number) => Number.isFinite(x) && x > 0);
  const prevClose = (closes.length >= 2 ? closes[closes.length - 2] : null) ?? num(m?.previousClose) ?? num(m?.chartPreviousClose) ?? price;
  // 黃豆、玉米、小麥：Yahoo 以「美分／蒲式耳」報價，系統以美元計
  const k = CENTS_TO_USD.has(sym) ? 0.01 : 1;
  const sc = (x: number | null) => (x == null ? null : Number((x * k).toFixed(4)));
  return {
    symbol: sym,
    price: sc(price)!,
    prevClose: sc(prevClose)!,
    open: null,
    high: sc(num(m?.regularMarketDayHigh)),
    low: sc(num(m?.regularMarketDayLow)),
    volume: Number(m?.regularMarketVolume) || 0,
    bid: null,
    ask: null,
    tradeTime: (Number(m?.regularMarketTime) || 0) * 1000,
    source: `Yahoo Finance ${y}`,
    delayNote: '交易所報價約延遲 10～15 分鐘',
  };
}

async function fetchBinanceAll(): Promise<Map<string, GlobalQuote>> {
  const pairs = Object.values(CRYPTO_BINANCE);
  const arr = await getJson(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
  const out = new Map<string, GlobalQuote>();
  if (!Array.isArray(arr)) throw new Error('Binance 格式不符');
  for (const [sym, pair] of Object.entries(CRYPTO_BINANCE)) {
    const t = arr.find((x: any) => x.symbol === pair);
    const price = num(t?.lastPrice);
    if (!price) continue;
    out.set(sym, {
      symbol: sym,
      price,
      prevClose: num(t.prevClosePrice) ?? num(t.openPrice) ?? price,
      open: num(t.openPrice),
      high: num(t.highPrice),
      low: num(t.lowPrice),
      volume: Number(t.volume) || 0,
      bid: num(t.bidPrice),
      ask: num(t.askPrice),
      tradeTime: Number(t.closeTime) || Date.now(),
      source: `Binance ${pair}`,
      delayNote: '即時',
    });
  }
  // USDT 本身是報價單位：以 USDC/USDT 換算成美元價格（假設 USDC ≈ 1 美元）
  const usdc = out.get('USDC');
  if (usdc) {
    const inv = (x: number | null) => (x ? Number((1 / x).toFixed(6)) : null);
    out.set('USDT', {
      ...usdc,
      symbol: 'USDT',
      price: inv(usdc.price)!,
      prevClose: inv(usdc.prevClose)!,
      open: inv(usdc.open),
      high: inv(usdc.low),
      low: inv(usdc.high),
      bid: inv(usdc.ask),
      ask: inv(usdc.bid),
      source: 'Binance USDCUSDT（換算）',
    });
  }
  return out;
}

let binanceAt = 0;
let binanceInflight: Promise<void> | null = null;
async function refreshBinance() {
  if (Date.now() - binanceAt < 10_000) return;
  if (!binanceInflight) {
    binanceInflight = (async () => {
      try {
        const m = await fetchBinanceAll();
        binanceAt = Date.now();
        for (const sym of [...Object.keys(CRYPTO_BINANCE), 'USDT']) {
          const q = m.get(sym) || null;
          cache.set(sym, { at: binanceAt, q });
          if (q) globalQuoteErrors.delete(sym);
          else globalQuoteErrors.set(sym, 'Binance 沒有回傳');
        }
      } catch (e: any) {
        for (const sym of [...Object.keys(CRYPTO_BINANCE), 'USDT']) globalQuoteErrors.set(sym, `Binance：${e.message}`);
      } finally {
        binanceInflight = null;
      }
    })();
  }
  await binanceInflight;
}

async function refreshCommodity(sym: string) {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  try {
    const q = await fetchYahoo(sym);
    cache.set(sym, { at: Date.now(), q });
    globalQuoteErrors.delete(sym);
  } catch (e: any) {
    // 失敗時保留上一筆真實報價最多 30 分鐘
    if (!hit?.q || Date.now() - hit.at > 30 * 60_000) cache.set(sym, { at: Date.now(), q: null });
    globalQuoteErrors.set(sym, `Yahoo：${e.message}`);
  }
}

export const isGlobalSymbol = (s: string) => Boolean(COMMODITY_YAHOO[s] || CRYPTO_BINANCE[s] || s === 'USDT' || COMMODITY_NO_SOURCE.has(s) || s === 'TWDT');

/** 取得一批代號的最新報價（只回傳抓得到的） */
export async function getGlobalQuotes(symbols: string[], waitMs = 5000): Promise<Map<string, GlobalQuote>> {
  const want = symbols.filter(isGlobalSymbol);
  const tasks: Promise<any>[] = [];
  if (want.some(s => CRYPTO_BINANCE[s] || s === 'USDT')) tasks.push(refreshBinance());
  for (const s of want) if (COMMODITY_YAHOO[s]) tasks.push(refreshCommodity(s));
  await Promise.race([Promise.allSettled(tasks), new Promise(r => setTimeout(r, waitMs))]);
  const out = new Map<string, GlobalQuote>();
  for (const s of want) {
    const q = cache.get(s)?.q;
    if (q) out.set(s, q);
    else if (COMMODITY_NO_SOURCE.has(s)) globalQuoteErrors.set(s, '沒有公開的即時報價來源（LME），暫停交易');
    else if (s === 'TWDT') {
      // 教學用的新台幣穩定幣：依定義固定 1 TWDT = NT$1，沒有市場報價
      out.set(s, { symbol: s, price: 1, prevClose: 1, open: 1, high: 1, low: 1, volume: 0, bid: null, ask: null, tradeTime: Date.now(), source: '固定錨定 1 TWDT = NT$1', delayNote: '教學商品，非市場報價' });
    }
  }
  return out;
}

const fmtTw = (ms: number) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .format(new Date(ms))
    .replace('T', ' ');

/** 轉成 /api/market/live-quotes 的格式 */
export function toLiveQuote(q: GlobalQuote, name: string, category: string, nowTw: string) {
  const clock = getInstrumentTradingClock(q.symbol, category);
  const change = Number((q.price - q.prevClose).toFixed(6));
  const tradeAt = q.tradeTime ? fmtTw(q.tradeTime) : '';
  // 超過 4 天沒有新成交（長假、資料來源停擺）就視為過期，不可交易
  const stale = !q.tradeTime || Date.now() - q.tradeTime > 4 * 86400_000;
  return {
    symbol: q.symbol,
    name,
    currentPrice: q.price,
    lastPrice: q.price,
    lastTradePrice: q.price,
    prevClose: q.prevClose,
    open: q.open ?? undefined,
    high: q.high ?? undefined,
    low: q.low ?? undefined,
    change,
    changePercent: q.prevClose > 0 ? Number(((change / q.prevClose) * 100).toFixed(2)) : 0,
    volume: q.volume,
    ...(q.bid || q.ask
      ? { fiveBids: q.bid ? [{ price: q.bid, volume: 0 }] : [], fiveAsks: q.ask ? [{ price: q.ask, volume: 0 }] : [] }
      : {}),
    fetchTime: `${tradeAt} (${q.source}，${q.delayNote})`,
    lastTradeTime: tradeAt.slice(11, 19),
    dataReceivedTime: nowTw,
    marketSession: clock.marketSession,
    sessionName: clock.sessionName,
    nextSessionTime: clock.nextSessionTime,
    classLabel: clock.classLabel,
    dataSource: '市場行情',
    dataset: q.source,
    isMock: false,
    isStale: stale,
    marketDate: tradeAt.slice(0, 10),
  };
}

// ───────── 美元兌新台幣匯率（Yahoo Finance TWD=X，每 10 分鐘更新） ─────────
let fxCache: { at: number; rate: number; time: number } | null = null;
export async function getUsdTwd(): Promise<{ rate: number; time: string; source: string } | null> {
  if (!fxCache || Date.now() - fxCache.at > 10 * 60_000) {
    try {
      const j = await getJson('https://query1.finance.yahoo.com/v8/finance/chart/TWD%3DX?interval=1d&range=1d', 5000);
      const m = j?.chart?.result?.[0]?.meta;
      const rate = num(m?.regularMarketPrice);
      if (rate && rate > 20 && rate < 50) fxCache = { at: Date.now(), rate: Number(rate.toFixed(4)), time: (Number(m?.regularMarketTime) || 0) * 1000 };
      else if (fxCache) fxCache.at = Date.now() - 9 * 60_000; // 失敗：一分鐘後再試
    } catch {
      if (fxCache) fxCache.at = Date.now() - 9 * 60_000;
    }
  }
  if (!fxCache) return null;
  return { rate: fxCache.rate, time: fmtTw(fxCache.time || fxCache.at), source: 'Yahoo Finance USD/TWD' };
}

// ───────── StockQ 國際行情中心：指數、匯率、殖利率、原物料（Yahoo Finance） ─────────
export const STOCKQ_YAHOO: Record<string, string> = {
  GC: 'GC=F', SI: 'SI=F', PL: 'PL=F', PA: 'PA=F', CL: 'CL=F', BZ: 'BZ=F', NG: 'NG=F', HO: 'HO=F', RB: 'RB=F',
  HG: 'HG=F', ALI: 'ALI=F', ZS: 'ZS=F', ZC: 'ZC=F', ZW: 'ZW=F', ZL: 'ZL=F', ZM: 'ZM=F', KC: 'KC=F', SB: 'SB=F',
  CC: 'CC=F', OJ: 'OJ=F', CT: 'CT=F', LE: 'LE=F', HE: 'HE=F', GF: 'GF=F',
  DJI: '^DJI', IXIC: '^IXIC', SPX: '^GSPC', SOX: '^SOX', RUT: '^RUT', TAIEX: '^TWII', N225: '^N225', KOSPI: '^KS11',
  HSI: '^HSI', SSEC: '000001.SS', SZSC: '399001.SZ', DAX: '^GDAXI', FTSE: '^FTSE', CAC: '^FCHI',
  DXY: 'DX-Y.NYB', 'USD/TWD': 'TWD=X', 'USD/JPY': 'JPY=X', 'EUR/USD': 'EURUSD=X', 'GBP/USD': 'GBPUSD=X', 'USD/CNY': 'CNY=X',
  'US 2Y': '2YY=F', 'US 10Y': '^TNX', 'US 30Y': '^TYX',
};

async function yahooChart(ticker: string) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`, 6000);
  const r = j?.chart?.result?.[0];
  const m = r?.meta;
  const price = num(m?.regularMarketPrice);
  if (!price) throw new Error('沒有成交價');
  const closes: number[] = (r?.indicators?.quote?.[0]?.close || []).map(Number).filter((x: number) => Number.isFinite(x) && x > 0);
  const prevClose = (closes.length >= 2 ? closes[closes.length - 2] : null) ?? num(m?.chartPreviousClose) ?? price;
  return { price, prevClose, high: num(m?.regularMarketDayHigh), low: num(m?.regularMarketDayLow), time: (Number(m?.regularMarketTime) || 0) * 1000 };
}

let stockqCache: { at: number; data: Record<string, any> } | null = null;
let stockqInflight: Promise<void> | null = null;
export async function getStockqQuotes(): Promise<{ at: number; data: Record<string, any> }> {
  if (stockqCache && Date.now() - stockqCache.at < 120_000) return stockqCache;
  if (!stockqInflight) {
    stockqInflight = (async () => {
      const data: Record<string, any> = { ...(stockqCache?.data || {}) };
      const entries = Object.entries(STOCKQ_YAHOO);
      for (let i = 0; i < entries.length; i += 8) {
        await Promise.allSettled(
          entries.slice(i, i + 8).map(async ([sym, t]) => {
            try {
              const q = await yahooChart(t);
              const k = CENTS_TO_USD.has(sym) ? 0.01 : 1;
              const price = Number((q.price * k).toFixed(4));
              const prev = Number((q.prevClose * k).toFixed(4));
              data[sym] = {
                price, prevClose: prev, high: q.high ? q.high * k : null, low: q.low ? q.low * k : null,
                change: Number((price - prev).toFixed(4)), changePercent: prev > 0 ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0,
                time: q.time ? fmtTw(q.time) : '', stale: !q.time || Date.now() - q.time > 4 * 86400_000, source: `Yahoo Finance ${t}`,
              };
            } catch {
              /* 抓不到就保留上一筆（最多 30 分鐘） */
              if (data[sym] && stockqCache && Date.now() - stockqCache.at > 30 * 60_000) delete data[sym];
            }
          })
        );
      }
      stockqCache = { at: Date.now(), data };
    })().finally(() => {
      stockqInflight = null;
    });
  }
  await stockqInflight;
  return stockqCache!;
}
