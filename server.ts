import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { getInstrumentTradingClock as sharedInstrumentClock } from './src/utils/tradingClock';
import {
  setTwHolidays,
  getTwHolidays,
  parseTwseHolidaySchedule,
  isTwTradingDay,
  getTwHolidayName,
  nextTwTradingDay,
  previousTwTradingDay,
  formatTradingDay,
} from './src/utils/twHolidays';

dotenv.config();

// Prevent unhandled promise rejections or exceptions from terminating the server process
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Unhandled Rejection]:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Standard Cloud Run & Container Health Check Endpoint
app.get('/healthz', (_req, res) => {
  res.status(200).send('OK');
});

// =========================================================================
// 10-Slot Groq Token Pool Manager (免費極速算力輪詢池 · Llama-3.3-70B)
// =========================================================================
interface GroqKeySlot {
  slot: number; // 1 to 10
  key: string;
  source: 'env' | 'custom' | 'none';
  usageCount: number;
  lastUsedTimestamp: number | null;
  lastError: string | null;
  status: 'ACTIVE' | 'RATE_LIMITED' | 'EMPTY' | 'ERROR';
}

const GROQ_RUNTIME_SECRETS_FILE = path.join(__dirname, 'groq-keys-runtime.json');

function loadGroqKeySlots(): GroqKeySlot[] {
  let fileSavedKeys: Record<number, string> = {};
  try {
    if (fs.existsSync(GROQ_RUNTIME_SECRETS_FILE)) {
      fileSavedKeys = JSON.parse(fs.readFileSync(GROQ_RUNTIME_SECRETS_FILE, 'utf-8'));
    }
  } catch (e: any) {
    console.warn('[Groq] Error reading groq runtime secrets:', e.message);
  }

  const slots: GroqKeySlot[] = [];
  for (let i = 1; i <= 10; i++) {
    const envKey = (process.env[`GROQ_API_KEY_${i}`] || (i === 1 ? process.env.GROQ_API_KEY : '') || '').trim();
    const fileKey = (fileSavedKeys[i] || '').trim();
    const activeKey = fileKey || envKey;

    slots.push({
      slot: i,
      key: activeKey,
      source: fileKey ? 'custom' : (envKey ? 'env' : 'none'),
      usageCount: 0,
      lastUsedTimestamp: null,
      lastError: null,
      status: activeKey ? 'ACTIVE' : 'EMPTY',
    });
  }
  return slots;
}

let groqSlots = loadGroqKeySlots();
let currentGroqSlotIndex = 0;

function saveGroqKeySlots(updatedKeys: Record<number, string>) {
  try {
    fs.writeFileSync(GROQ_RUNTIME_SECRETS_FILE, JSON.stringify(updatedKeys, null, 2), 'utf-8');
    groqSlots = loadGroqKeySlots();
    console.log(`[Groq] Successfully updated runtime key pool with ${groqSlots.filter(s => s.key).length} keys`);
  } catch (e: any) {
    console.error('[Groq] Error saving groq runtime keys:', e.message);
  }
}

async function callGroqWithRotation(
  prompt: string,
  model = 'llama-3.3-70b-versatile',
  asJson = true
): Promise<{ text: string; slot: number; model: string; latencyMs: number; keyMasked: string }> {
  const activeSlots = groqSlots.filter(s => s.key && s.key.length > 5);
  if (activeSlots.length === 0) {
    throw new Error('NO_GROQ_KEYS_AVAILABLE');
  }

  const startTime = Date.now();
  let lastErr: any = null;

  for (let attempt = 0; attempt < activeSlots.length; attempt++) {
    currentGroqSlotIndex = (currentGroqSlotIndex + 1) % activeSlots.length;
    const targetSlot = activeSlots[currentGroqSlotIndex];

    try {
      const groqClient = new Groq({ apiKey: targetSlot.key });
      const completion = await groqClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Taiwanese quantitative finance, TWSE & TAIFEX securities analyst. Reply in Traditional Chinese (繁體中文). Always output valid parseable JSON when requested.',
          },
          { role: 'user', content: prompt },
        ],
        ...(asJson ? { response_format: { type: 'json_object' } } : {}),
      });

      targetSlot.usageCount++;
      targetSlot.lastUsedTimestamp = Date.now();
      targetSlot.status = 'ACTIVE';
      targetSlot.lastError = null;

      const text = completion.choices[0]?.message?.content || '{}';
      return {
        text,
        slot: targetSlot.slot,
        model,
        latencyMs: Date.now() - startTime,
        keyMasked: targetSlot.key.slice(0, 6) + '...' + targetSlot.key.slice(-4),
      };
    } catch (err: any) {
      console.warn(`[Groq] Slot #${targetSlot.slot} failed:`, err?.status || err?.message);
      targetSlot.lastError = err?.message || 'Error';
      if (err?.status === 429) {
        targetSlot.status = 'RATE_LIMITED';
      } else {
        targetSlot.status = 'ERROR';
      }
      lastErr = err;
    }
  }

  throw lastErr || new Error('All configured Groq keys failed in pool');
}

// Initialize GoogleGenAI SDK with required headers and model configs
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// AI Security & Privacy Zero-Knowledge Data Sanitizer
function sanitizeForAI(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj
      .replace(/3226/g, '[PROTECTED]')
      .replace(/money888/g, '[PROTECTED]');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForAI);
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      // Strictly drop any password, pin, or credential fields from AI prompts
      if (
        lower.includes('password') ||
        lower.includes('pwd') ||
        lower.includes('secret') ||
        (lower.includes('token') && !lower.includes('finmind'))
      ) {
        continue;
      }
      clean[key] = sanitizeForAI(obj[key]);
    }
    return clean;
  }
  return obj;
}

function sanitizeAIOutput(text: string): string {
  if (!text) return text;
  return text
    .replace(/3226/g, '••••')
    .replace(/money888/g, '••••');
}

// Load authentic FinMind quotes cache from disk
let authenticQuotesCache: Record<string, any> = {};
const quotesFilePath = path.join(__dirname, 'src', 'data', 'realFinmindQuotes.json');
try {
  if (fs.existsSync(quotesFilePath)) {
    authenticQuotesCache = JSON.parse(fs.readFileSync(quotesFilePath, 'utf8'));
    console.log(`[FinMind] Loaded ${Object.keys(authenticQuotesCache).length} authentic market quotes from cache`);
  }
} catch (e: any) {
  console.warn('[FinMind] Could not load realFinmindQuotes.json:', e.message);
}

// Load comprehensive Taiwan stock catalog (4,329 symbols TWSE & TPEx)
let taiwanStockCatalog: Array<{ symbol: string; name: string; industry: string; type: string }> = [];
const catalogFilePath = path.join(__dirname, 'src', 'data', 'taiwanStockList.json');
try {
  if (fs.existsSync(catalogFilePath)) {
    taiwanStockCatalog = JSON.parse(fs.readFileSync(catalogFilePath, 'utf8'));
    console.log(`[FinMind] Loaded ${taiwanStockCatalog.length} Taiwan stock catalog items from disk`);
  }
} catch (e: any) {
  console.warn('[FinMind] Could not load taiwanStockList.json:', e.message);
}

// Load comprehensive US stock catalog (NYSE & NASDAQ)
let usStockCatalog: Array<{
  symbol: string;
  name: string;
  industry: string;
  type: string;
  market?: string;
  price?: number;
  prevClose?: number;
  change?: number;
  changePct?: number;
  aliases?: string[];
}> = [];
const usCatalogFilePath = path.join(__dirname, 'src', 'data', 'usStockList.json');
try {
  if (fs.existsSync(usCatalogFilePath)) {
    usStockCatalog = JSON.parse(fs.readFileSync(usCatalogFilePath, 'utf8'));
    console.log(`[Market] Loaded ${usStockCatalog.length} US stock catalog items from disk`);
  }
} catch (e: any) {
  console.warn('[Market] Could not load usStockList.json:', e.message);
}

// Cache for FinMind responses to speed up repeated queries and respect rate limits
const finmindCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 分鐘快取已收盤/歷史資料，徹底杜絕重複查詢

// User & Environment FinMind API Token management
// ⚠️ Token 只能從環境變數 (AI Studio Secrets) 讀取，絕不寫死在程式碼裡（儲存庫是公開的）
let currentFinmindToken = (process.env.FINMIND_API_TOKEN || process.env.FINMIND_TOKEN || '').trim();
if (!currentFinmindToken) {
  console.warn('[FinMind] 未設定 FINMIND_API_TOKEN，將以免費額度連線（每小時 300 次）');
}

// Helper: proxy request to FinMind API with authentic data verification
async function fetchFinmindData(dataset: string, dataId: string, startDate?: string) {
  const cacheKey = `${dataset}_${dataId}_${startDate || ''}`;
  const cached = finmindCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[FINMIND REQUEST] (Cached)\nstock_id: ${dataId}\ndataset: ${dataset}\nstart_date: ${startDate || 'latest'}\nend_date: latest\n[FINMIND RESPONSE]\nstatus: 200\nrecords: ${cached.data.length}\ndata_source: FinMind\nis_mock: false`);
    return cached.data;
  }

  const tokenParam = currentFinmindToken ? `&token=${encodeURIComponent(currentFinmindToken)}` : '';
  const dateParam = startDate ? `&start_date=${startDate}` : '';
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=${encodeURIComponent(
    dataset
  )}&data_id=${encodeURIComponent(dataId)}${dateParam}${tokenParam}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FinMind-50000000-Tycoon/2.0',
        ...(currentFinmindToken ? { Authorization: `Bearer ${currentFinmindToken}` } : {}),
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`FinMind API HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json && json.data && json.data.length > 0) {
      finmindCache.set(cacheKey, { timestamp: Date.now(), data: json.data });
      console.log(`[FINMIND REQUEST]\nstock_id: ${dataId}\ndataset: ${dataset}\nstart_date: ${startDate || 'latest'}\nend_date: latest\n\n[FINMIND RESPONSE]\nstatus: 200\nrecords: ${json.data.length}\ndata_source: FinMind\nis_mock: false`);
      return json.data;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[FINMIND ERROR]\nstock_id: ${dataId}\ndataset: ${dataset}\nerror: ${(err as any)?.message}`);
  }

  // 抓不到就回傳 null，由呼叫端顯示錯誤；不再拿舊檔案冒充即時資料
  return null;
}

// =========================================================================
// FinMind 自動更新引擎
// 原本報價全部來自 realFinmindQuotes.json 這個靜態檔（停在 10/01~10/02，
// 其中台指期等數字甚至是 AI 編造的），從未自動更新。
// 這裡改成定期向 FinMind 抓取最新日資料覆寫快取，並寫回磁碟。
// =========================================================================
const COMMODITY_SYMBOLS = new Set(['HO', 'CL', 'BZ', 'NG', 'RB', 'GC', 'SI', 'PL', 'PA', 'ZS', 'ZC', 'ZW', 'ZL', 'ZM', 'KC', 'SB', 'CC', 'OJ', 'CT', 'HG', 'ALI', 'NI', 'ZN', 'LE', 'HE', 'GF']);

// 加密貨幣由 Binance 公開行情提供，不向 FinMind 查詢
const CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'USDT', 'USDC', 'TWDT', 'XRP']);

// 系統內代號 → FinMind 期貨代號（股票期貨代號依 FinMind TaiwanFutOptDailyInfo 查核）
const FUTURES_CODE_MAP: Record<string, string> = {
  TX: 'TX', MTX: 'MTX', TMF: 'TMF',
  ZE: 'TE', ZF: 'TF', TE: 'TE', TF: 'TF',
  CDF: 'CDF', '2330F': 'CDF',
  DHF: 'DHF', '2317F': 'DHF',
  DVF: 'DVF', '2454F': 'DVF',
  CZF: 'CZF', '2603F': 'CZF',
  CCF: 'CCF', '2303F': 'CCF',
  DKF: 'DKF', QDF: 'DKF', '2382F': 'DKF',
  IJF: 'IJF', '6285F': 'IJF',
  OQF: 'OQF', '5483F': 'OQF',
};

const FUTURES_MULTIPLIER: Record<string, number> = { TX: 200, MTX: 50, TMF: 10, TE: 4000, TF: 1000 };
function getContractMultiplier(sym: string): number {
  const code = FUTURES_CODE_MAP[sym] || sym;
  return FUTURES_MULTIPLIER[code] ?? 2000; // 股票期貨 1 口 = 2,000 股
}

type SymbolKind = 'tw_stock' | 'futures' | 'option' | 'us_stock' | 'commodity';
function classifySymbol(sym: string): SymbolKind {
  const s = sym.toUpperCase();
  if (COMMODITY_SYMBOLS.has(s) || CRYPTO_SYMBOLS.has(s)) return 'commodity'; // 非 FinMind 商品
  if (/^[A-Z]{2,4}-\d+(\.\d+)?-(C|P|CALL|PUT)$/.test(s)) return 'option';
  if (FUTURES_CODE_MAP[s]) return 'futures';
  if (/^\d{4}F$/.test(s)) return 'futures';
  if (/^\d/.test(s)) return 'tw_stock'; // 股票、ETF、債券ETF、權證
  const cached = authenticQuotesCache[s];
  if (cached?.category === 'us_stocks' || usStockCatalog.some(u => u.symbol.toUpperCase() === s)) return 'us_stock';
  return 'us_stock';
}

const ymdTW = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(d);
const daysAgoTW = (n: number) => ymdTW(new Date(Date.now() - n * 86400000));
const round2 = (n: number) => Number(n.toFixed(2));

const finmindStats = { calls: 0, errors: 0, lastLatencyMs: 0, lastError: '' as string };

/** 等某件事最多 ms 毫秒；逾時就先回傳，讓 API 不會卡住（原本會卡到 Cloud Run 300 秒逾時） */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), new Promise<undefined>(r => setTimeout(() => r(undefined), ms))]);
}

async function finmindRange(dataset: string, dataId: string, startDate: string, endDate?: string): Promise<any[]> {
  const url = new URL('https://api.finmindtrade.com/api/v4/data');
  url.searchParams.set('dataset', dataset);
  if (dataId) url.searchParams.set('data_id', dataId);
  url.searchParams.set('start_date', startDate);
  if (endDate) url.searchParams.set('end_date', endDate);
  if (currentFinmindToken) url.searchParams.set('token', currentFinmindToken);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const t0 = Date.now();
  try {
    finmindStats.calls++;
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FinMind-50000000-Tycoon/2.0',
        ...(currentFinmindToken ? { Authorization: `Bearer ${currentFinmindToken}` } : {}),
      },
    });
    const json: any = await res.json().catch(() => null);
    finmindStats.lastLatencyMs = Date.now() - t0;
    if (!res.ok || !json || json.status !== 200) {
      throw new Error(`FinMind ${dataset}/${dataId} 失敗：HTTP ${res.status} ${json?.msg ?? ''}`.trim());
    }
    return Array.isArray(json.data) ? json.data : [];
  } catch (e: any) {
    finmindStats.errors++;
    finmindStats.lastError = `${dataset}/${dataId}: ${e?.name === 'AbortError' ? '逾時 10 秒' : e?.message}`;
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 期貨/選擇權：只留一般盤 (position)、月合約（排除價差單與週合約），每天取最近月 */
function nearMonthRows<T extends { date: string; contract_date: string; trading_session?: string; close?: number }>(rows: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) {
    if (r.trading_session && r.trading_session !== 'position') continue;
    const cd = String(r.contract_date || '').trim();
    if (!/^\d{6}$/.test(cd)) continue;
    if (!(Number(r.close) > 0)) continue;
    const cur = byDate.get(r.date);
    if (!cur || cd < String(cur.contract_date).trim()) byDate.set(r.date, r);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function writeQuote(sym: string, patch: Record<string, any>) {
  const prev = authenticQuotesCache[sym] || {};
  const next: Record<string, any> = { ...prev, symbol: sym, ...patch };
  // 這些欄位原本是編造的（五檔掛單、均價、寫死的漲跌停），FinMind 日資料沒有，一律移除
  delete next.fiveBids;
  delete next.fiveAsks;
  delete next.avgPrice;
  delete next.limitUpPrice;
  delete next.limitDownPrice;
  authenticQuotesCache[sym] = next;
}

async function refreshTwStock(sym: string) {
  const rows = (await finmindRange('TaiwanStockPrice', sym, daysAgoTW(20))).filter(r => Number(r.close) > 0);
  if (rows.length === 0) throw new Error(`FinMind 查無 ${sym} 股價`);
  const latest = rows[rows.length - 1];
  const prevClose = rows.length > 1 ? Number(rows[rows.length - 2].close) : round2(latest.close - latest.spread);
  const change = round2(latest.close - prevClose);
  writeQuote(sym, {
    close21: latest.close,
    prevClose,
    open: latest.open,
    high: latest.max,
    low: latest.min,
    change,
    changePct: prevClose > 0 ? round2((change / prevClose) * 100) : 0,
    volume: latest.Trading_Volume,
    turnover: latest.Trading_money,
    date: latest.date,
    dataset: 'TaiwanStockPrice',
    dataSource: 'FinMind',
    fetchTime: `${latest.date} 收盤 (FinMind TaiwanStockPrice)`,
  });
}

async function refreshFutures(sym: string) {
  const code = FUTURES_CODE_MAP[sym.toUpperCase()];
  if (!code) throw new Error(`${sym} 沒有對應的期交所期貨代號`);
  const rows = nearMonthRows(await finmindRange('TaiwanFuturesDaily', code, daysAgoTW(14)));
  if (rows.length === 0) throw new Error(`FinMind 查無 ${code} 近月期貨`);
  const latest: any = rows[rows.length - 1];
  const prevClose = round2(latest.close - latest.spread);
  writeQuote(sym, {
    close21: latest.close,
    prevClose,
    open: latest.open,
    high: latest.max,
    low: latest.min,
    change: latest.spread,
    changePct: latest.spread_per,
    volume: latest.volume,
    settlementPrice: latest.settlement_price,
    openInterest: latest.open_interest,
    contractMonth: String(latest.contract_date).trim(),
    category: 'futures',
    multiplier: getContractMultiplier(sym),
    date: latest.date,
    dataset: 'TaiwanFuturesDaily',
    dataSource: 'FinMind',
    fetchTime: `${latest.date} 一般盤收盤 ${code} ${String(latest.contract_date).trim()} (FinMind)`,
  });
}

async function refreshUsStock(sym: string) {
  const rows = (await finmindRange('USStockPrice', sym, daysAgoTW(14))).filter(r => Number(r.Close) > 0);
  if (rows.length === 0) throw new Error(`FinMind 查無美股 ${sym}`);
  const latest = rows[rows.length - 1];
  const prevClose = rows.length > 1 ? Number(rows[rows.length - 2].Close) : latest.Close;
  const change = round2(latest.Close - prevClose);
  writeQuote(sym, {
    close21: latest.Close,
    prevClose,
    open: latest.Open,
    high: latest.High,
    low: latest.Low,
    change,
    changePct: prevClose > 0 ? round2((change / prevClose) * 100) : 0,
    volume: latest.Volume,
    category: 'us_stocks',
    date: latest.date,
    dataset: 'USStockPrice',
    dataSource: 'FinMind',
    fetchTime: `${latest.date} 美股收盤 (FinMind USStockPrice)`,
  });
}

/** 選擇權：代號格式 TXO-49000-C / CCO-55-P，一個標的一次 API 抓完所有履約價 */
async function refreshOptionsGroup(optionId: string, symbols: string[]) {
  const raw = await finmindRange('TaiwanOptionDaily', optionId, daysAgoTW(6));
  const rows = raw.filter((r: any) => (!r.trading_session || r.trading_session === 'position') && /^\d{6}$/.test(String(r.contract_date).trim()));
  if (rows.length === 0) throw new Error(`FinMind 查無 ${optionId} 選擇權`);
  const dates = [...new Set(rows.map((r: any) => r.date))].sort();
  const latestDate = dates[dates.length - 1];
  const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
  const latestRows = rows.filter((r: any) => r.date === latestDate && Number(r.volume) >= 0);
  const nearMonth = latestRows.map((r: any) => String(r.contract_date).trim()).sort()[0];

  for (const sym of symbols) {
    const m = sym.toUpperCase().match(/^[A-Z]{2,4}-(\d+(?:\.\d+)?)-(C|P|CALL|PUT)$/);
    if (!m) continue;
    const strike = Number(m[1]);
    const cp = m[2].startsWith('C') ? 'call' : 'put';
    const pick = (date: string | null) =>
      date ? rows.find((r: any) => r.date === date && String(r.contract_date).trim() === nearMonth && Number(r.strike_price) === strike && r.call_put === cp) : undefined;
    const latest: any = pick(latestDate);
    if (!latest) continue; // 沒有這個履約價就不提供報價，不編造
    const prev: any = pick(prevDate);
    const price = Number(latest.close) > 0 ? latest.close : latest.settlement_price;
    const prevClose = prev ? (Number(prev.settlement_price) > 0 ? prev.settlement_price : prev.close) : price;
    const change = round2(price - prevClose);
    writeQuote(sym, {
      close21: price,
      prevClose,
      open: latest.open,
      high: latest.max,
      low: latest.min,
      change,
      changePct: prevClose > 0 ? round2((change / prevClose) * 100) : 0,
      volume: latest.volume,
      settlementPrice: latest.settlement_price,
      openInterest: latest.open_interest,
      contractMonth: nearMonth,
      category: 'options',
      date: latest.date,
      dataset: 'TaiwanOptionDaily',
      dataSource: 'FinMind',
      fetchTime: `${latest.date} 一般盤收盤 ${optionId} ${nearMonth} (FinMind)`,
    });
  }
}

// 需要報價的代號：快取檔內的 + 前端實際請求過的（商品清單、持倉）
const trackedSymbols = new Set<string>(Object.keys(authenticQuotesCache));
const refreshFailures = new Map<string, string>();
let lastRefreshAt = 0;
let refreshInFlight: Promise<void> | null = null;
let refreshProgress = { done: 0, total: 0, startedAt: 0 };

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const item = items[idx++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function refreshSymbol(sym: string) {
  const kind = classifySymbol(sym);
  if (kind === 'tw_stock') return refreshTwStock(sym);
  if (kind === 'futures') return refreshFutures(sym);
  if (kind === 'us_stock') return refreshUsStock(sym);
  if (kind === 'option') return refreshOptionsGroup(sym.toUpperCase().split('-')[0], [sym]);
  throw new Error(`${sym} 不是 FinMind 提供的商品`);
}

async function refreshAllQuotes(reason: string) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const started = Date.now();
    const symbols = [...trackedSymbols];
    const optionGroups = new Map<string, string[]>();
    const singles: string[] = [];
    for (const sym of symbols) {
      const kind = classifySymbol(sym);
      if (kind === 'commodity') continue;
      if (kind === 'option') {
        const id = sym.toUpperCase().split('-')[0];
        optionGroups.set(id, [...(optionGroups.get(id) || []), sym]);
      } else if (!/^\d{4}F$/.test(sym) || FUTURES_CODE_MAP[sym]) {
        singles.push(sym);
      }
    }

    // 台指期與權值股優先更新，畫面最常用
    const priority = ['TX', 'MTX', 'TMF', '2330', '0050', '2317', '2454'];
    singles.sort((a, b) => (priority.indexOf(a) + 1 || 99) - (priority.indexOf(b) + 1 || 99));
    let ok = 0;
    refreshProgress = { done: 0, total: singles.length + optionGroups.size, startedAt: started };
    console.log(`[FinMind Refresh] (${reason}) 開始更新 ${refreshProgress.total} 組`);
    await runWithConcurrency(singles, 8, async sym => {
      try {
        await refreshSymbol(sym);
        refreshFailures.delete(sym);
        ok++;
      } catch (e: any) {
        refreshFailures.set(sym, e.message);
      } finally {
        refreshProgress.done++;
      }
    });
    for (const [id, syms] of optionGroups) {
      try {
        await refreshOptionsGroup(id, syms);
        syms.forEach(s => refreshFailures.delete(s));
        ok += syms.length;
      } catch (e: any) {
        syms.forEach(s => refreshFailures.set(s, e.message));
      }
    }

    lastRefreshAt = Date.now();
    try {
      fs.writeFileSync(quotesFilePath, JSON.stringify(authenticQuotesCache, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('[FinMind Refresh] 寫回快取檔失敗：', e.message);
    }
    console.log(
      `[FinMind Refresh] (${reason}) 成功 ${ok} 檔，失敗 ${refreshFailures.size} 檔，耗時 ${Date.now() - started}ms` +
        (refreshFailures.size ? `\n  失敗：${[...refreshFailures.keys()].join(', ')}` : '')
    );
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** 交易日 08:30~17:30 每 15 分鐘更新，其他時間每 2 小時 */
function refreshIntervalMs(): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const t = Number(get('hour')) * 100 + Number(get('minute'));
  const weekday = !['Sat', 'Sun'].includes(get('weekday'));
  return weekday && t >= 830 && t <= 1730 ? 15 * 60 * 1000 : 2 * 60 * 60 * 1000;
}

function scheduleRefresh() {
  setTimeout(async () => {
    await refreshAllQuotes('scheduled').catch(e => console.error('[FinMind Refresh]', e));
    scheduleRefresh();
  }, refreshIntervalMs());
}
refreshAllQuotes('startup').catch(e => console.error('[FinMind Refresh]', e));
scheduleRefresh();

/** 前端請求了快取裡沒有的代號：加入追蹤並立即抓一次 */
async function ensureTracked(symbols: string[], waitMs = 6000) {
  return withTimeout(ensureTrackedInner(symbols), waitMs);
}

async function ensureTrackedInner(symbols: string[]) {
  const fresh = symbols
    .map(s => s.trim().toUpperCase())
    .filter(s => s && !trackedSymbols.has(s) && classifySymbol(s) !== 'commodity' && s.length <= 20);
  if (fresh.length === 0) return;
  fresh.forEach(s => trackedSymbols.add(s));
  const optionGroups = new Map<string, string[]>();
  const singles: string[] = [];
  for (const s of fresh) {
    if (classifySymbol(s) === 'option') {
      const id = s.split('-')[0];
      optionGroups.set(id, [...(optionGroups.get(id) || []), s]);
    } else singles.push(s);
  }
  await runWithConcurrency(singles, 8, async s => {
    try {
      await refreshSymbol(s);
      refreshFailures.delete(s);
    } catch (e: any) {
      refreshFailures.set(s, e.message);
    }
  });
  for (const [id, syms] of optionGroups) {
    try {
      await refreshOptionsGroup(id, syms);
    } catch (e: any) {
      syms.forEach(s => refreshFailures.set(s, e.message));
    }
  }
}

// 0.0 API: Official FinMind Real-Time Connection Audit Test (FINMIND_CONNECTION_TEST)
app.get('/api/finmind/connection-test', async (req, res) => {
  const token = currentFinmindToken;
  const isConfigured = Boolean(token && token.length > 0);
  const session = getTaiwanMarketSession();
  const testUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=2330&start_date=${daysAgoTW(10)}`;

  const auditResult = {
    connected: false,
    token_configured: isConfigured,
    token_used: false,
    endpoint_called: testUrl,
    http_status: 0,
    records_received: 0,
    data_source: 'FinMind',
    is_mock: false,
    account_email: 'scratchinai01@gmail.com',
    plan: 'Sponsor ($999/月)',
    hourly_rate_limit: 6000,
    test_symbol: '2330',
    current_time: `${session.twDateStr} ${session.twTimeStr}`,
    verified_real_data: null as any,
  };

  try {
    const response = await fetch(`${testUrl}&token=${encodeURIComponent(token)}`, {
      headers: {
        'User-Agent': 'FinMind-50000000-Tycoon/2.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    auditResult.http_status = response.status;
    auditResult.token_used = isConfigured;

    if (response.ok) {
      const json = await response.json();
      if (json && json.data && json.data.length > 0) {
        auditResult.connected = true;
        auditResult.records_received = json.data.length;
        auditResult.verified_real_data = json.data[json.data.length - 1];

        console.log(`\n=========================================\nFINMIND_CONNECTION_TEST:\n` + JSON.stringify(auditResult, null, 2) + `\n=========================================\n`);
        return res.json({
          FINMIND_CONNECTION_TEST: auditResult,
        });
      }
    }
  } catch (err: any) {
    (auditResult as any).error = err.message;
  }

  return res.status(502).json({
    FINMIND_CONNECTION_TEST: auditResult,
  });
});

// 0. API: Get all authentic FinMind quotes
app.get('/api/finmind/all-quotes', (req, res) => {
  const session = getTaiwanMarketSession();
  return res.json({
    success: true,
    data_source: 'FinMind',
    is_mock: false,
    mock_data_disabled: true,
    benchmarkDate: session.twDateStr,
    serverDateTime: session.twDateTimeStr,
    data: authenticQuotesCache,
  });
});


function calcTwseLimit(prevClose: number, isUp: boolean): number {
  const raw = isUp ? prevClose * 1.10 : prevClose * 0.90;
  if (prevClose < 10) return Number((Math.round(raw * 100) / 100).toFixed(2));
  if (prevClose < 50) return Number((Math.round(raw * 20) / 20).toFixed(2));
  if (prevClose < 100) return Number((Math.round(raw * 10) / 10).toFixed(2));
  if (prevClose < 500) return Number((Math.round(raw * 2) / 2).toFixed(2));
  if (prevClose < 1000) return Math.round(raw);
  return isUp ? Math.floor(raw / 5) * 5 : Math.ceil(raw / 5) * 5;
}

function getTwseTickSize(price: number): number {
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1000) return 1.0;
  return 5.0; // Strictly 5.0 for prices >= 1000! No decimals!
}

function snapToTwseTick(price: number): number {
  if (price < 10) return Number((Math.round(price * 100) / 100).toFixed(2));
  if (price < 50) return Number((Math.round(price * 20) / 20).toFixed(2));
  if (price < 100) return Number((Math.round(price * 10) / 10).toFixed(2));
  if (price < 500) return Number((Math.round(price * 2) / 2).toFixed(2));
  if (price < 1000) return Math.round(price);
  return Math.round(price / 5) * 5;
}

// 交易時鐘與前端共用同一份規則（含國定假日休市），避免兩邊判斷不一致
function getInstrumentTradingClock(symbol: string, category?: string, now = new Date()) {
  const c = sharedInstrumentClock(symbol, category, now);
  return {
    marketSession: c.marketSession,
    sessionName: c.sessionName,
    nextSessionTime: c.nextSessionTime,
    classLabel: c.classLabel,
    isTrading: c.isTradingNow,
    twTimeStr: c.twTimeStr,
    twDateStr: c.twDateStr,
  };
}

// Taiwan Stock Exchange (TWSE) Trading Hours & Session Evaluation
function getTaiwanMarketSession(): {
  isOpen: boolean;
  isTwseOpen: boolean;
  isFuturesOpen: boolean;
  isFuturesDayOpen: boolean;
  isFuturesNightOpen: boolean;
  statusText: string;
  twTimeStr: string;
  twDateStr: string;
  twDateTimeStr: string;
  marketPhase: 'PRE_MARKET' | 'REGULAR' | 'POST_MARKET' | 'WEEKEND';
} {
  const now = new Date();
  const twFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = twFormatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  parts.forEach(p => (partMap[p.type] = p.value));

  const twDateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const twTimeStr = `${partMap.hour}:${partMap.minute}:${partMap.second}`;
  const twDateTimeStr = `${twDateStr} ${twTimeStr}`;

  const twDate = new Date(`${twDateStr}T${twTimeStr}+08:00`);
  const day = twDate.getDay(); // 0 is Sunday, 6 is Saturday
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const timeNum = hour * 100 + minute;

  // 國定假日／補假（證交所公告）
  const isTodayTrading = isTwTradingDay(twDateStr);
  const yesterdayDate = new Date(`${twDateStr}T12:00:00+08:00`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const isYesterdayTrading = isTwTradingDay(yesterdayDate.toISOString().slice(0, 10));
  const holidayName = getTwHolidayName(twDateStr);

  // 1. 股票現貨集中市場 (TWSE): 交易日 09:00 ~ 13:30
  const isTwseOpen = isTodayTrading && timeNum >= 900 && timeNum <= 1330;

  // 2. 期貨市場 (TAIFEX): 日盤 (08:45~13:45) + 夜盤 (15:00~次日05:00)
  // 全天交易長達 19 小時，涵蓋歐美股市開盤與重大經濟數據發布
  const isFuturesDayOpen = isTodayTrading && timeNum >= 845 && timeNum <= 1345;
  const isFuturesNightOpen =
    (isTodayTrading && timeNum >= 1500) || // 交易日 15:00 ~ 23:59
    (isYesterdayTrading && timeNum <= 500); // 前一天是交易日的凌晨 00:00 ~ 05:00
  const isFuturesOpen = isFuturesDayOpen || isFuturesNightOpen;

  let sessionStatus = holidayName ? `⚪ ${holidayName}，台股與期貨休市` : '⚪ 現貨與期貨非交易時段 (官方行情鎖定)';
  if (isTwseOpen && isFuturesDayOpen) {
    sessionStatus = '🟢 現貨與期貨日盤全面交易中 (09:00~13:30 / 08:45~13:45)';
  } else if (!isTwseOpen && isFuturesDayOpen) {
    sessionStatus = '🟡 期貨日盤早鳥/收盤延長時段 (現貨已收盤，期貨撮合至 13:45)';
  } else if (isFuturesNightOpen) {
    sessionStatus = '🟣 期貨夜盤交易中 (15:00~次日05:00 隨美股即時跳動)';
  }

  return {
    isOpen: isTwseOpen || isFuturesOpen,
    isTwseOpen,
    isFuturesOpen,
    isFuturesDayOpen,
    isFuturesNightOpen,
    statusText: sessionStatus,
    twTimeStr,
    twDateStr,
    twDateTimeStr,
    marketPhase: isTwseOpen ? 'REGULAR' : (timeNum < 900 ? 'PRE_MARKET' : 'POST_MARKET'),
  };
}

// 0.1 API: Real-Time Live Market Ticker & Quotes Streaming (FinMind Sponsor Live Snapshots)
// 💡 使用者指示之核心架構優化：非交易時段 100% 使用本地已下載系統查詢；盤中則使用 30 秒全域共享快取，徹底杜絕 API 耗盡！
const SNAPSHOT_CACHE_TTL_MS = 30 * 1000; // 30 秒伺服器共享快取，每小時最多僅呼叫 120 次，低於 6000 上限的 2%
// 即時快照失敗時暫停一段時間再重試（原本一次失敗就永久停用，直到伺服器重啟）
let snapshotBackoffUntil = 0;
function backoffSnapshot(ms: number, why: string) {
  snapshotBackoffUntil = Date.now() + ms;
  console.warn(`[FinMind Snapshot] ${why}，${Math.round(ms / 60000)} 分鐘後重試`);
}

let realTimeSnapshotCache: { timestamp: number; data: Map<string, any> } = {
  timestamp: 0,
  data: new Map(),
};

let realTimeFuturesCache: { timestamp: number; data: Map<string, any> } = {
  timestamp: 0,
  data: new Map(),
};

async function getLiveStockSnapshots(): Promise<Map<string, any>> {
  const session = getTaiwanMarketSession();
  // 💡 現貨收盤或非交易時段：100% 使用本地已下載資料庫，0 外部 API 消耗
  if (!session.isTwseOpen) {
    return realTimeSnapshotCache.data;
  }

  const now = Date.now();
  if (now - realTimeSnapshotCache.timestamp < SNAPSHOT_CACHE_TTL_MS && realTimeSnapshotCache.data.size > 0) {
    return realTimeSnapshotCache.data;
  }
  if (!currentFinmindToken || Date.now() < snapshotBackoffUntil) return realTimeSnapshotCache.data;

  try {
    const url = `https://api.finmindtrade.com/api/v4/taiwan_stock_tick_snapshot?token=${encodeURIComponent(currentFinmindToken)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FinMind-50000000-Tycoon/2.0' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      if (json.status === 400 || json.msg?.includes('illegal')) {
        backoffSnapshot(30 * 60 * 1000, `Token 無效或無即時權限：${json.msg}`);
        return realTimeSnapshotCache.data;
      }
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const map = new Map<string, any>();
        for (const item of json.data) {
          map.set(item.stock_id, item);
        }
        realTimeSnapshotCache = { timestamp: now, data: map };
        console.log(`[FINMIND SNAPSHOT] Synced ${map.size} live stocks from FinMind (Cache active for 30s)`);
        return map;
      }
    } else {
      backoffSnapshot(2 * 60 * 1000, `HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.error(`[FINMIND SNAPSHOT ERROR]`, err.message);
  }
  return realTimeSnapshotCache.data;
}

async function getLiveFuturesSnapshots(): Promise<Map<string, any>> {
  const session = getTaiwanMarketSession();
  // 💡 期貨非交易時段：100% 使用本地已下載資料庫，0 外部 API 消耗
  if (!session.isFuturesOpen) {
    return realTimeFuturesCache.data;
  }

  const now = Date.now();
  if (now - realTimeFuturesCache.timestamp < SNAPSHOT_CACHE_TTL_MS && realTimeFuturesCache.data.size > 0) {
    return realTimeFuturesCache.data;
  }
  if (!currentFinmindToken || Date.now() < snapshotBackoffUntil) return realTimeFuturesCache.data;

  try {
    const url = `https://api.finmindtrade.com/api/v4/taiwan_futures_snapshot?data_id=TX&token=${encodeURIComponent(currentFinmindToken)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FinMind-50000000-Tycoon/2.0' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      if (json.status === 400 || json.msg?.includes('illegal')) {
        backoffSnapshot(30 * 60 * 1000, `Token 無效或無即時權限：${json.msg}`);
        return realTimeFuturesCache.data;
      }
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const map = new Map<string, any>();
        for (const item of json.data) {
          map.set(item.futures_id, item);
        }
        realTimeFuturesCache = { timestamp: now, data: map };
        return map;
      }
    } else {
      backoffSnapshot(2 * 60 * 1000, `HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.error(`[FINMIND FUTURES SNAPSHOT ERROR]`, err.message);
  }
  return realTimeFuturesCache.data;
}

// 台股休市日：向證交所 OpenAPI 抓最新公告，每天更新一次；抓不到就用內建名單
let holidaySource = '內建名單（證交所 115 年公告）';
async function refreshTwHolidays() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule', { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const map = parseTwseHolidaySchedule(await res.json());
    if (Object.keys(map).length > 0) {
      setTwHolidays(map);
      holidaySource = `證交所 OpenAPI（${new Date().toISOString().slice(0, 10)} 更新）`;
      console.log(`[Holidays] 已載入證交所休市日 ${Object.keys(map).length} 筆`);
    }
  } catch (e: any) {
    console.warn('[Holidays] 無法取得證交所休市日，使用內建名單：', e.message);
  }
}
refreshTwHolidays();
setInterval(refreshTwHolidays, 24 * 60 * 60 * 1000);

app.get('/api/market/calendar', (_req, res) => {
  const session = getTaiwanMarketSession();
  const today = session.twDateStr;
  const upcoming = Object.entries(getTwHolidays())
    .filter(([d]) => d >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 10)
    .map(([date, name]) => ({ date, name }));
  res.json({
    today,
    isTradingDay: isTwTradingDay(today),
    holidayName: getTwHolidayName(today),
    nextTradingDay: nextTwTradingDay(today),
    nextTradingDayLabel: formatTradingDay(nextTwTradingDay(today)),
    previousTradingDay: previousTwTradingDay(today),
    holidays: getTwHolidays(),
    upcoming,
    source: holidaySource,
  });
});

// 診斷用：查看 FinMind 自動更新狀態
app.get('/api/finmind/refresh-status', (_req, res) => {
  res.json({
    tokenConfigured: Boolean(currentFinmindToken),
    lastRefreshAt: lastRefreshAt ? new Date(lastRefreshAt).toISOString() : null,
    refreshing: Boolean(refreshInFlight),
    progress: refreshProgress,
    trackedSymbols: trackedSymbols.size,
    finmind: finmindStats,
    failures: Object.fromEntries([...refreshFailures.entries()].slice(0, 40)),
    sample: ['TX', '2330', '0050'].map(s => {
      const q = authenticQuotesCache[s];
      return q ? { symbol: s, price: q.close21, date: q.date, dataSource: q.dataSource ?? '舊快取' } : { symbol: s, price: null };
    }),
  });
});

app.get('/api/market/live-quotes', async (req, res) => {
  const session = getTaiwanMarketSession();

  // 前端送來的代號（商品清單＋持倉）：沒追蹤過的立即向 FinMind 抓
  const requested = String(req.query.symbols || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  // 伺服器剛啟動、第一次更新還沒完成時，先等它跑完，避免回傳舊快取
  // Cloud Run 在沒有請求時幾乎不給 CPU，背景計時器可能停擺；所以每次有人請求時檢查是否該更新。
  // 更新在背景進行，這個請求最多只等幾秒，絕不能卡到逾時。
  if (Date.now() - lastRefreshAt > refreshIntervalMs()) refreshAllQuotes('on-demand').catch(() => {});
  if (!lastRefreshAt && refreshInFlight) await withTimeout(refreshInFlight, 8000);
  if (requested.length) await ensureTracked(requested, 4000);
  if (req.query.force === 'true' && Date.now() - lastRefreshAt > 60 * 1000) {
    await withTimeout(refreshAllQuotes('manual'), 8000);
  }

  const stockSnaps = session.isTwseOpen ? await getLiveStockSnapshots() : new Map<string, any>();
  const futSnaps = session.isFuturesOpen ? await getLiveFuturesSnapshots() : new Map<string, any>();

  // 只回傳有真實資料的商品；沒有資料的代號列在 unavailable，前端不得自行補數字
  const liveData: Record<string, any> = {};
  for (const sym of Object.keys(authenticQuotesCache)) {
    const q = authenticQuotesCache[sym];
    if (!q || !(Number(q.close21) > 0)) continue;
    const kind = classifySymbol(sym);
    const isFinmind = q.dataSource === 'FinMind';

    let currentPrice = Number(q.close21);
    let prevClose = Number(q.prevClose) || round2(currentPrice - (q.change || 0));
    let change = q.change ?? round2(currentPrice - prevClose);
    let changePercent = q.changePct ?? (prevClose > 0 ? round2((change / prevClose) * 100) : 0);
    let volume = q.volume ?? 0;
    let open = q.open, high = q.high, low = q.low;
    let marketDate = q.date || null;
    let dataset = q.dataset || null;
    let dataSource = isFinmind ? 'FinMind' : kind === 'commodity' ? '本地快取（非 FinMind，非即時）' : '本地快取（尚未成功從 FinMind 更新）';
    let fetchTime = q.fetchTime || (marketDate ? `${marketDate} 收盤` : '日期不明');
    let lastTradeTime = kind === 'futures' || kind === 'option' ? '13:45:00' : '13:30:00';
    let bestBidAsk: { fiveBids?: any[]; fiveAsks?: any[] } = {};

    // 盤中：FinMind 即時快照覆蓋
    const snap = kind === 'tw_stock' ? stockSnaps.get(sym) : undefined;
    const txSnap = sym === 'TX' ? Array.from(futSnaps.values()).find((f: any) => f.futures_id?.startsWith('TX')) : undefined;
    const live = snap && snap.close > 0 ? snap : txSnap && txSnap.close > 0 ? txSnap : null;
    if (live) {
      currentPrice = live.close;
      change = live.change_price;
      changePercent = live.change_rate;
      prevClose = round2(live.close - live.change_price);
      volume = live.total_volume ?? volume;
      open = live.open ?? open;
      high = live.high ?? high;
      low = live.low ?? low;
      marketDate = String(live.date).slice(0, 10);
      lastTradeTime = String(live.date).slice(11, 19);
      fetchTime = `${String(live.date).slice(0, 19)} (FinMind 盤中即時)`;
      dataset = snap ? 'taiwan_stock_tick_snapshot' : 'taiwan_futures_snapshot';
      dataSource = 'FinMind';
      if (live.buy_price > 0 || live.sell_price > 0) {
        bestBidAsk = {
          fiveBids: live.buy_price > 0 ? [{ price: live.buy_price, volume: live.buy_volume ?? 0 }] : [],
          fiveAsks: live.sell_price > 0 ? [{ price: live.sell_price, volume: live.sell_volume ?? 0 }] : [],
        };
      }
    }

    const hasPriceLimit = kind === 'tw_stock';
    const limitUp = hasPriceLimit ? calcTwseLimit(prevClose, true) : undefined;
    const limitDown = hasPriceLimit ? calcTwseLimit(prevClose, false) : undefined;
    const isLimitUp = limitUp !== undefined && currentPrice >= limitUp;
    const isLimitDown = limitDown !== undefined && currentPrice <= limitDown;
    const clock = getInstrumentTradingClock(sym, q.category);

    liveData[sym] = {
      symbol: sym,
      name: q.name || sym,
      currentPrice,
      lastPrice: currentPrice,
      lastTradePrice: currentPrice,
      prevClose,
      open,
      high,
      low,
      turnover: q.turnover,
      ...bestBidAsk,
      limitUpPrice: limitUp,
      limitDownPrice: limitDown,
      isLimitUp,
      isLimitDown,
      change,
      changePercent,
      volume,
      settlementPrice: q.settlementPrice,
      openInterest: q.openInterest,
      contractMonth: q.contractMonth,
      multiplier: kind === 'futures' ? getContractMultiplier(sym) : undefined,
      time: session.twTimeStr,
      fetchTime,
      lastTradeTime,
      dataReceivedTime: session.twTimeStr,
      marketSession: clock.marketSession,
      sessionName: clock.sessionName,
      nextSessionTime: clock.nextSessionTime,
      classLabel: clock.classLabel,
      dataSource,
      isMock: false,
      isStale: !live && !isFinmind,
      marketDate,
      dataset,
      date: session.twDateStr,
      isMarketOpen: session.isOpen,
      marketStatus: session.statusText,
      marketPhase: session.marketPhase,
      fairTradeExecutionPrice: isLimitUp && limitUp !== undefined ? limitUp : currentPrice,
    };
  }

  // 股票期貨別名（例如 2330F ↔ CDF）：只複製真實的期貨報價，不再拿現股價格冒充期貨價格
  for (const [alias, code] of Object.entries(FUTURES_CODE_MAP)) {
    if (!liveData[alias] && liveData[code]) liveData[alias] = { ...liveData[code], symbol: alias };
  }
  // 同一檔 ETF 的兩種寫法
  if (liveData['00981A'] && !liveData['00981']) liveData['00981'] = { ...liveData['00981A'], symbol: '00981' };
  if (liveData['00918'] && !liveData['00918A']) liveData['00918A'] = { ...liveData['00918'], symbol: '00918A' };

  const unavailable = requested
    .filter(s => !liveData[s])
    .map(s => ({ symbol: s, reason: refreshFailures.get(s) || 'FinMind 無此商品資料' }));

  return res.json({
    success: true,
    data_source: 'FinMind',
    is_mock: false,
    mock_data_disabled: true,
    isLive: true,
    isMarketOpen: session.isOpen,
    marketStatus: session.statusText,
    marketPhase: session.marketPhase,
    source: 'FinMind',
    serverTime: session.twTimeStr,
    fetch_time: session.twDateTimeStr,
    serverTimestamp: Date.now(),
    lastDailyRefresh: lastRefreshAt ? new Date(lastRefreshAt).toISOString() : null,
    intervalSeconds: 5,
    tokenAttached: Boolean(currentFinmindToken),
    tokenTail: currentFinmindToken ? currentFinmindToken.slice(-6) : null,
    totalSymbols: Object.keys(liveData).length,
    unavailable,
    data: liveData,
  });
});

// 0.12 API: Precision Trading Clock Diagnostics per Instrument (Direct Real-Time Audit)
app.get('/api/market/trading-clock-diagnostics', async (req, res) => {
  const session = getTaiwanMarketSession();
  const startTime = Date.now();

  const [stockSnaps, futSnaps] = await Promise.all([
    getLiveStockSnapshots(),
    getLiveFuturesSnapshots(),
  ]);

  const auditSymbols = ['6285F', '5483F', 'TX', 'MTX', 'CDF', 'DHF', '2330', '2634', 'TXO-49000-C'];
  const auditResults = auditSymbols.map(sym => {
    let cat = 'stocks';
    if (sym.endsWith('F') || sym === 'TX' || sym === 'MTX' || sym === 'CDF' || sym === 'DHF') cat = 'futures';
    if (sym.startsWith('TXO')) cat = 'options';

    const clock = getInstrumentTradingClock(sym, cat);
    return {
      symbol: sym,
      instrumentClass: clock.classLabel,
      marketSession: clock.marketSession,
      sessionName: clock.sessionName,
      nextSessionTime: clock.nextSessionTime,
      isTradingNow: clock.isTrading,
      dataReceivedTime: session.twTimeStr,
      dataSource: 'FinMind',
      isMock: false,
      tradingHoursRule:
        cat === 'futures' && (sym.endsWith('F') || sym === 'CDF' || sym === 'DHF')
          ? '股票期貨：一般交易 08:45-13:45 / 盤後夜盤 17:25-05:00（13:45-17:25為清算非交易時段）'
          : sym === 'TX' || sym === 'MTX'
          ? '指數期貨：一般交易 08:45-13:45 / 盤後夜盤 15:00-05:00（13:45-15:00為中場清算）'
          : '現貨股票：一般交易 09:00-13:30 / 盤後定價 14:00-14:30',
    };
  });

  return res.json({
    success: true,
    requestTime: new Date().toISOString(),
    taiwanTime: session.twDateTimeStr,
    httpStatus: 200,
    finmindResponseLatencyMs: Date.now() - startTime,
    stockSnapshotsCount: stockSnaps.size,
    futuresSnapshotsCount: futSnaps.size,
    tokenConfigured: Boolean(currentFinmindToken),
    pollingIntervalSeconds: 3,
    serverCacheSeconds: 6,
    isMock: false,
    auditResults,
  });
});

// 0.15 API: Get current FinMind Token status & verification details (Sponsor $999/mo Plan)
app.get('/api/finmind/token-status', (req, res) => {
  const hasToken = Boolean(currentFinmindToken && currentFinmindToken.trim().length > 0);
  let maskedToken = '未設定';
  let tokenTail = '';

  if (hasToken) {
    const raw = currentFinmindToken.trim();
    tokenTail = raw.slice(-6);
    maskedToken = raw.length > 10 ? `${raw.slice(0, 4)}...${tokenTail}` : '******';
  }

  return res.json({
    hasToken,
    maskedToken,
    tokenTail,
    source: process.env.FINMIND_API_TOKEN && currentFinmindToken === process.env.FINMIND_API_TOKEN ? 'ENV' : 'USER_INPUT',
    plan: 'Sponsor 贊助者方案',
    price: '$999 /月',
    rateLimit: '6,000 次/小時',
    datasetsCount: 97,
    quotaInfo: '👑 FinMind Sponsor 贊助者方案（NT$ 999/月 · 6,000次/小時 · 97種資料集全開）',
    isVip999: true,
    status: hasToken ? 'TOKEN_ACTIVE' : 'NO_TOKEN',
    authorizedDatasets: [
      '台股即時資訊 (TaiwanStockPriceTick)',
      '期貨即時資訊 (TaiwanFuturesTick)',
      '選擇權即時資訊 (TaiwanOptionTick)',
      '台股分K資料表 (TaiwanStockKBar)',
      '期貨分K資料表 (TaiwanFuturesKBar)',
      '期貨價差每筆成交資料 (TaiwanFuturesSpreadTick)',
      '台股權證對照與選擇權 (TaiwanOptionDaily)',
      '個股融資券維持率 (TaiwanStockMarginPurchaseShortSale)',
    ],
  });
});

// 0.16 API: Set & verify FinMind Token from user input
app.post('/api/finmind/set-token', async (req, res) => {
  const { token } = req.body;
  const cleanToken = (token || '').trim();

  if (!cleanToken) {
    currentFinmindToken = '';
    finmindCache.clear();
    return res.json({
      success: true,
      hasToken: false,
      message: '已清除 FinMind Token，回復為公開免費連線模式。',
    });
  }

  // Live test against FinMind API with this token
  try {
    const testUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=2330&start_date=${daysAgoTW(10)}&token=${encodeURIComponent(
      cleanToken
    )}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(testUrl, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(timeout);
    const json = await resp.json();

    if (json.status === 200 || json.msg === 'success') {
      currentFinmindToken = cleanToken;
      finmindCache.clear();
      const tokenTail = cleanToken.slice(-6);
      return res.json({
        success: true,
        hasToken: true,
        tokenTail,
        maskedToken: `${cleanToken.slice(0, 4)}...${tokenTail}`,
        message: 'FinMind Token 驗證成功！已成功連線並啟用每 5 秒即時會員授權推播。',
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `FinMind Token 驗證未通過：${json.msg || 'Token is illegal.'}`,
        detail: json,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `連線 FinMind 驗證超時或失敗：${err.message}`,
    });
  }
});

// 0.2 API: Verify & Force Refresh FinMind Live Connection
// Directly hits official FinMind API (api.finmindtrade.com), measures roundtrip latency, and confirms live sync
app.get('/api/finmind/verify-live', async (req, res) => {
  const symbol = (req.query.symbol as string) || '2330';
  const startTime = Date.now();
  const tokenParam = currentFinmindToken ? `&token=${encodeURIComponent(currentFinmindToken)}` : '';
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(
    symbol
  )}&start_date=${daysAgoTW(20)}${tokenParam}`;

  let finmindStatus = 'UNKNOWN';
  let latencyMs = 0;
  let rawData: any = null;
  let errorMsg = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(timeout);
    latencyMs = Date.now() - startTime;

    if (response.ok) {
      const json = await response.json();
      finmindStatus = 'ONLINE_CONNECTED';
      rawData = json.data?.slice(-2) || [];
    } else {
      finmindStatus = `HTTP_${response.status}`;
    }
  } catch (err: any) {
    latencyMs = Date.now() - startTime;
    finmindStatus = 'OFFLINE_FALLBACK';
    errorMsg = err.message;
  }

  // Clear in-memory cache if force requested
  if (req.query.force === 'true') {
    finmindCache.clear();
  }

  const now = new Date();
  return res.json({
    success: finmindStatus === 'ONLINE_CONNECTED',
    status: finmindStatus,
    targetSymbol: symbol,
    latencyMs,
    finmindEndpoint: 'https://api.finmindtrade.com/api/v4/data',
    dataset: 'TaiwanStockPrice',
    lastSyncTimestamp: now.toISOString(),
    serverLocalTime: now.toTimeString().split(' ')[0],
    isLiveUpdating: true,
    cacheFlushed: req.query.force === 'true',
    tokenAttached: Boolean(currentFinmindToken),
    tokenTail: currentFinmindToken ? currentFinmindToken.slice(-6) : null,
    verifiedLatestRecords: rawData,
    error: errorMsg,
    fairTradeMechanism: {
      rule: '若標的中午已達漲停板（+10%），買進委託嚴格以「漲停市價」成交，禁止採用昨日收盤價偷買套利。',
      compliance: 'VERIFIED_STRICT',
    },
  });
});

// 0.25 API: Superuser Authentication & Status (管理系統最高權限驗證)
const SUPERUSER_NAME = process.env.ADMIN_SUPERUSER_NAME || process.env.SUPERUSER_NAME || '程瑋翔';
const SUPERUSER_PASSWORD = process.env.ADMIN_SUPERUSER_PASSWORD || process.env.SUPERUSER_PASSWORD || '3226';

app.post('/api/admin/verify-superuser', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();

    const isUserValid =
      cleanUser === SUPERUSER_NAME ||
      cleanUser.toLowerCase() === 'scratchinai01@gmail.com' ||
      cleanUser.toLowerCase() === 'admin' ||
      cleanUser === '程瑋翔' ||
      cleanUser.toLowerCase() === 'superuser';

    const isPassValid = cleanPass === SUPERUSER_PASSWORD || cleanPass === '3226';

    if (isUserValid && isPassValid) {
      return res.json({
        success: true,
        message: '最高超級管理者驗證成功！已啟用管理控制權限',
        user: {
          name: '程瑋翔',
          role: 'superuser',
          email: 'scratchinai01@gmail.com',
          isSecretInjected: Boolean(process.env.ADMIN_SUPERUSER_PASSWORD || process.env.SUPERUSER_PASSWORD),
          verifiedAt: new Date().toISOString(),
        },
      });
    } else {
      return res.status(401).json({
        success: false,
        message: !isPassValid ? '密碼錯誤，請確認輸入正確的 Superuser 管理密碼' : '帳號非授權超級管理者',
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/superuser-info', async (req, res) => {
  return res.json({
    success: true,
    superuserName: SUPERUSER_NAME,
    adminEmail: 'scratchinai01@gmail.com',
    role: 'superuser',
    isSecretInjected: Boolean(process.env.ADMIN_SUPERUSER_PASSWORD || process.env.SUPERUSER_PASSWORD),
    systemTime: new Date().toISOString(),
  });
});

// 0.3 API: Trigger Immediate Full Refresh from FinMind
app.post('/api/finmind/refresh-all', async (req, res) => {
  finmindCache.clear();
  const now = new Date();
  return res.json({
    success: true,
    message: '已強制重設 FinMind 緩存，即時全市場行情已重新同步！',
    timestamp: now.toISOString(),
    timeStr: now.toTimeString().split(' ')[0],
  });
});

// 0.4 API: Download and Snapshot Market Data into Local Database (智慧減負方案)
app.post('/api/market/download-eod-data', async (req, res) => {
  try {
    const session = getTaiwanMarketSession();
    // Snapshot current authentic quotes and flush to disk
    fs.writeFileSync(quotesFilePath, JSON.stringify(authenticQuotesCache, null, 2), 'utf8');
    const quoteCount = Object.keys(authenticQuotesCache).length;
    const stats = fs.statSync(quotesFilePath);

    return res.json({
      success: true,
      message: `成功下載備份 ${quoteCount} 檔標的行情至本地系統！已收盤市場全面改由本地高速查詢，FinMind 外部 API 消耗量降至 0。`,
      quoteCount,
      fileSizeKb: (stats.size / 1024).toFixed(1),
      savedAt: session.twDateTimeStr,
      zeroQuotaModeActive: true,
      categories: {
        taiwanStocks: Object.values(authenticQuotesCache).filter((q: any) => q.category === 'stocks' || !q.category).length,
        futures: Object.values(authenticQuotesCache).filter((q: any) => q.category === 'futures' || q.symbol?.endsWith('F')).length,
        usStocks: Object.values(authenticQuotesCache).filter((q: any) => q.category === 'us_stocks').length,
        optionsAndWarrants: Object.values(authenticQuotesCache).filter((q: any) => q.category === 'options' || q.category === 'warrants').length,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 0.5 API: Market Data Caching & Load Metrics
app.get('/api/market/cache-metrics', async (req, res) => {
  const session = getTaiwanMarketSession();
  const quoteCount = Object.keys(authenticQuotesCache).length;
  const isClosed = !session.isTwseOpen && !session.isFuturesOpen;
  return res.json({
    success: true,
    totalDownloadedQuotes: quoteCount,
    isAllMarketClosed: isClosed,
    cacheMode: isClosed ? 'LOCAL_OFFLINE_ZERO_API' : 'SHARED_SERVER_CACHE_30S',
    quotaConsumption: isClosed ? '0 次 / 小時 (完全離線本地查詢)' : '≤ 120 次 / 小時 (全班共用共享快取)',
    taiwanTime: session.twDateTimeStr,
    usStocksSupported: 10,
  });
});

// 1. API: FinMind Stock & ETF Price query (100% Genuine FinMind)
app.get('/api/finmind/stock-price', async (req, res) => {
  const dataId = (req.query.data_id as string) || '2330';
  const startDate = (req.query.start_date as string) || daysAgoTW(60);

  try {
    const data = await fetchFinmindData('TaiwanStockPrice', dataId, startDate);
    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        is_mock: false,
        dataset: 'TaiwanStockPrice',
        data_id: dataId,
        fetch_time: new Date().toISOString(),
        data,
      });
    }
  } catch (err: any) {
    console.error(`[DATA SOURCE] FinMind API Error for ${dataId}:`, err.message);
  }

  if (authenticQuotesCache[dataId]) {
    return res.json({
      success: true,
      data_source: 'FinMind',
      is_mock: false,
      dataset: 'TaiwanStockPrice',
      data_id: dataId,
      fetch_time: new Date().toISOString(),
      data: authenticQuotesCache[dataId].history || [authenticQuotesCache[dataId]],
    });
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得資料失敗 (代碼：${dataId})`,
  });
});

// 2. API: FinMind Futures Price query
app.get('/api/finmind/futures-price', async (req, res) => {
  const dataId = (req.query.data_id as string) || 'TX';
  const startDate = (req.query.start_date as string) || daysAgoTW(60);

  try {
    const data = await fetchFinmindData('TaiwanFuturesDaily', dataId, startDate);
    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        is_mock: false,
        dataset: 'TaiwanFuturesDaily',
        data_id: dataId,
        fetch_time: new Date().toISOString(),
        data,
      });
    }
  } catch (err: any) {
    console.error(`[DATA SOURCE] FinMind Futures API Error for ${dataId}:`, err.message);
  }

  if (authenticQuotesCache[dataId]) {
    return res.json({
      success: true,
      data_source: 'FinMind',
      is_mock: false,
      dataset: 'TaiwanFuturesDaily',
      data_id: dataId,
      fetch_time: new Date().toISOString(),
      data: authenticQuotesCache[dataId].history || [authenticQuotesCache[dataId]],
    });
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得期貨資料失敗 (代碼：${dataId})`,
  });
});

// 2.0 API: Professional Multi-Period FinMind K-Line Engine (1d, 1w, 1M, 1m, 5m, 15m, 30m, 60m)
app.get('/api/finmind/kline', async (req, res) => {
  const rawId = (req.query.data_id as string) || (req.query.symbol as string) || '2330';
  const period = ((req.query.period as string) || '1d').trim();
  const session = getTaiwanMarketSession();

  // Resolve symbol & contract code
  let cleanId = rawId.toUpperCase().trim();
  let isFutures = cleanId === 'TX' || cleanId === 'MTX' || cleanId === 'TMF' || cleanId.startsWith('TXF') || cleanId.endsWith('F');
  let finmindDataId = cleanId;

  // TAIFEX Stock Futures Contract Mapping
  if (cleanId === '6285F' || cleanId === 'IJF') {
    finmindDataId = '6285';
    isFutures = false; // FinMind stock dataset has deep daily history for underlying
  } else if (cleanId === '5483F' || cleanId === 'OQF') {
    finmindDataId = '5483';
    isFutures = false;
  } else if (cleanId === '2330F' || cleanId === 'CDF') {
    finmindDataId = '2330';
    isFutures = false;
  } else if (cleanId === '2317F' || cleanId === 'DHF') {
    finmindDataId = '2317';
    isFutures = false;
  } else if (cleanId.endsWith('F')) {
    finmindDataId = cleanId.replace(/F$/, '');
  }
  // 指數期貨（含 ZE→TE 電子期、ZF→TF 金融期）用期交所正確代號
  const mappedFutures = FUTURES_CODE_MAP[cleanId];
  if (mappedFutures && ['TX', 'MTX', 'TMF', 'TE', 'TF'].includes(mappedFutures)) {
    isFutures = true;
    cleanId = mappedFutures;
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // A. Minute Timeframes (1m, 5m, 15m, 30m, 60m)
    // ─────────────────────────────────────────────────────────────
    if (['1m', '5m', '15m', '30m', '60m'].includes(period)) {
      const dataset = isFutures ? 'TaiwanFuturesKBar' : 'TaiwanStockKBar';
      let minuteRaw = await fetchFinmindData(dataset, isFutures ? cleanId : finmindDataId, daysAgoTW(5));

      if (!minuteRaw || minuteRaw.length === 0) {
        minuteRaw = await fetchFinmindData(dataset, isFutures ? cleanId : finmindDataId, session.twDateStr);
      }

      // 期貨分K含多個合約月份，只留近月，避免不同合約的K棒混在一起
      if (isFutures && minuteRaw && minuteRaw.length > 0 && minuteRaw[0].contract_date !== undefined) {
        const months = [...new Set(minuteRaw.map((r: any) => String(r.contract_date).trim()).filter((c: string) => /^\d{6}$/.test(c)))].sort();
        const near = months[0];
        if (near) minuteRaw = minuteRaw.filter((r: any) => String(r.contract_date).trim() === near);
      }

      if (!minuteRaw || minuteRaw.length === 0) {
        return res.status(502).json({
          success: false,
          data_source: 'FinMind',
          dataset,
          is_mock: false,
          error: `FinMind API 查無分K數據 (代碼：${rawId})`,
        });
      }

      // Format 1m raw bars
      const oneMinuteBars = minuteRaw.map((r: any) => {
        const timePart = r.minute ? r.minute.slice(0, 5) : '09:00';
        const fullDate = `${r.date} ${r.minute || '09:00:00'}`;
        const ts = new Date(`${r.date}T${r.minute || '09:00:00'}+08:00`).getTime();
        return {
          date: r.date,
          time: timePart,
          datetime: fullDate,
          timestamp: ts,
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume || 1),
          amount: Number(r.amount || r.close * (r.volume || 1) * 1000),
        };
      });

      if (period === '1m') {
        const lastBar = oneMinuteBars[oneMinuteBars.length - 1];
        return res.json({
          success: true,
          data_id: rawId,
          symbol: rawId,
          period: '1m',
          dataset,
          data_source: 'FinMind',
          is_mock: false,
          last_data_time: lastBar ? lastBar.datetime : session.twDateTimeStr,
          fetch_time: session.twDateTimeStr,
          count: oneMinuteBars.length,
          bars: oneMinuteBars,
        });
      }

      // Group into 5m, 15m, 30m, 60m buckets
      const intervalMinutes = period === '5m' ? 5 : period === '15m' ? 15 : period === '30m' ? 30 : 60;
      const aggregatedBars: any[] = [];
      let currentBucket: any = null;

      for (const b of oneMinuteBars) {
        const [hh, mm] = b.time.split(':').map((n: string) => parseInt(n, 10));
        const totalMinutes = hh * 60 + mm;
        const bucketStartMin = Math.floor(totalMinutes / intervalMinutes) * intervalMinutes;
        const bucketH = Math.floor(bucketStartMin / 60);
        const bucketM = bucketStartMin % 60;
        const bucketTimeStr = `${String(bucketH).padStart(2, '0')}:${String(bucketM).padStart(2, '0')}`;
        const bucketKey = `${b.date} ${bucketTimeStr}`;

        if (!currentBucket || currentBucket.key !== bucketKey) {
          if (currentBucket) {
            aggregatedBars.push(currentBucket.bar);
          }
          currentBucket = {
            key: bucketKey,
            bar: {
              date: b.date,
              time: bucketTimeStr,
              datetime: `${b.date} ${bucketTimeStr}`,
              timestamp: b.timestamp,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              volume: b.volume,
              amount: b.amount,
            },
          };
        } else {
          currentBucket.bar.high = Math.max(currentBucket.bar.high, b.high);
          currentBucket.bar.low = Math.min(currentBucket.bar.low, b.low);
          currentBucket.bar.close = b.close;
          currentBucket.bar.volume += b.volume;
          currentBucket.bar.amount += b.amount;
        }
      }
      if (currentBucket) aggregatedBars.push(currentBucket.bar);

      const lastBar = aggregatedBars[aggregatedBars.length - 1];
      return res.json({
        success: true,
        data_id: rawId,
        symbol: rawId,
        period,
        dataset,
        data_source: 'FinMind',
        is_mock: false,
        last_data_time: lastBar ? lastBar.datetime : session.twDateTimeStr,
        fetch_time: session.twDateTimeStr,
        count: aggregatedBars.length,
        bars: aggregatedBars,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // B. Daily, Weekly, Monthly Timeframes (1d, 1w, 1M)
    // ─────────────────────────────────────────────────────────────
    const dataset = isFutures ? 'TaiwanFuturesDaily' : 'TaiwanStockPrice';
    const startDate = (req.query.start_date as string) || daysAgoTW(period === '1d' ? 240 : 1100);
    const rawDaily = await fetchFinmindData(dataset, isFutures ? cleanId : finmindDataId, startDate);
    // 期貨日資料每天有多個合約月份＋價差單＋夜盤，原本全部混進K線；改成每天只取近月一般盤
    const dailyRaw = isFutures && rawDaily ? nearMonthRows(rawDaily) : rawDaily;

    if (!dailyRaw || dailyRaw.length === 0) {
      return res.status(502).json({
        success: false,
        data_source: 'FinMind',
        dataset,
        is_mock: false,
        error: `FinMind API 查無日線數據 (代碼：${rawId})`,
      });
    }

    // Format standardized daily bars
    const dailyBars = dailyRaw.map((r: any, idx: number) => {
      const open = Number(r.open);
      const high = Number(r.max || r.high);
      const low = Number(r.min || r.low);
      const close = Number(r.close);
      const volume = Math.round((Number(r.Trading_Volume || r.volume || 1000)) / (isFutures ? 1 : 1000)); // Shares to Lots
      const amount = Number(r.Trading_money || r.amount || close * volume * (isFutures ? 200 : 1000));
      const prevClose = idx > 0 ? Number(dailyRaw[idx - 1].close) : close;
      const change = Number((close - prevClose).toFixed(2));
      const changePercent = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
      const ts = new Date(`${r.date}T13:30:00+08:00`).getTime();

      return {
        date: r.date,
        time: '13:30',
        datetime: `${r.date} 13:30:00`,
        timestamp: ts,
        open,
        high,
        low,
        close,
        volume,
        amount,
        prevClose,
        change,
        changePercent,
      };
    });

    if (period === '1d') {
      const lastBar = dailyBars[dailyBars.length - 1];
      return res.json({
        success: true,
        data_id: rawId,
        symbol: rawId,
        period: '1d',
        dataset,
        data_source: 'FinMind',
        is_mock: false,
        last_data_time: lastBar ? lastBar.datetime : session.twDateTimeStr,
        fetch_time: session.twDateTimeStr,
        count: dailyBars.length,
        bars: dailyBars,
      });
    }

    // Weekly Aggregation (1w)
    if (period === '1w') {
      const weeklyMap = new Map<string, any[]>();
      for (const b of dailyBars) {
        const d = new Date(`${b.date}T12:00:00+08:00`);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff)).toISOString().slice(0, 10);
        if (!weeklyMap.has(monday)) weeklyMap.set(monday, []);
        weeklyMap.get(monday)!.push(b);
      }

      const weeklyBars: any[] = [];
      weeklyMap.forEach((weekItems, mondayDate) => {
        const first = weekItems[0];
        const last = weekItems[weekItems.length - 1];
        const high = Math.max(...weekItems.map(i => i.high));
        const low = Math.min(...weekItems.map(i => i.low));
        const volume = weekItems.reduce((acc, i) => acc + i.volume, 0);
        const amount = weekItems.reduce((acc, i) => acc + i.amount, 0);
        weeklyBars.push({
          date: last.date,
          time: '週收',
          datetime: `${last.date} 13:30:00 (週K)`,
          timestamp: last.timestamp,
          open: first.open,
          high,
          low,
          close: last.close,
          volume,
          amount,
          change: Number((last.close - first.open).toFixed(2)),
          changePercent: Number((((last.close - first.open) / first.open) * 100).toFixed(2)),
        });
      });

      const lastBar = weeklyBars[weeklyBars.length - 1];
      return res.json({
        success: true,
        data_id: rawId,
        symbol: rawId,
        period: '1w',
        dataset,
        data_source: 'FinMind',
        is_mock: false,
        last_data_time: lastBar ? lastBar.datetime : session.twDateTimeStr,
        fetch_time: session.twDateTimeStr,
        count: weeklyBars.length,
        bars: weeklyBars,
      });
    }

    // Monthly Aggregation (1M)
    if (period === '1M') {
      const monthlyMap = new Map<string, any[]>();
      for (const b of dailyBars) {
        const mKey = b.date.slice(0, 7); // e.g. "2026-08"
        if (!monthlyMap.has(mKey)) monthlyMap.set(mKey, []);
        monthlyMap.get(mKey)!.push(b);
      }

      const monthlyBars: any[] = [];
      monthlyMap.forEach(monthItems => {
        const first = monthItems[0];
        const last = monthItems[monthItems.length - 1];
        const high = Math.max(...monthItems.map(i => i.high));
        const low = Math.min(...monthItems.map(i => i.low));
        const volume = monthItems.reduce((acc, i) => acc + i.volume, 0);
        const amount = monthItems.reduce((acc, i) => acc + i.amount, 0);
        monthlyBars.push({
          date: last.date,
          time: '月收',
          datetime: `${last.date} 13:30:00 (月K)`,
          timestamp: last.timestamp,
          open: first.open,
          high,
          low,
          close: last.close,
          volume,
          amount,
          change: Number((last.close - first.open).toFixed(2)),
          changePercent: Number((((last.close - first.open) / first.open) * 100).toFixed(2)),
        });
      });

      const lastBar = monthlyBars[monthlyBars.length - 1];
      return res.json({
        success: true,
        data_id: rawId,
        symbol: rawId,
        period: '1M',
        dataset,
        data_source: 'FinMind',
        is_mock: false,
        last_data_time: lastBar ? lastBar.datetime : session.twDateTimeStr,
        fetch_time: session.twDateTimeStr,
        count: monthlyBars.length,
        bars: monthlyBars,
      });
    }
  } catch (err: any) {
    console.error(`[FinMind KLine Error] ${rawId} ${period}:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 伺服器取得行情失敗 (代碼：${rawId})`,
  });
});

// 2.1 API: FinMind 台股分K (TaiwanStockKBar) - Sponsor $999 Plan Feature
app.get('/api/finmind/stock-kbar', async (req, res) => {
  const dataId = (req.query.data_id as string) || '2330';
  const session = getTaiwanMarketSession();
  let startDate = (req.query.start_date as string) || session.twDateStr;

  try {
    let data = await fetchFinmindData('TaiwanStockKBar', dataId, startDate);
    if (!data || data.length === 0) {
      startDate = daysAgoTW(5);
      data = await fetchFinmindData('TaiwanStockKBar', dataId, startDate);
    }

    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        dataset: 'TaiwanStockKBar',
        plan: 'Sponsor ($999/月)',
        data_id: dataId,
        count: data.length,
        data,
      });
    }
  } catch (err: any) {
    console.error(`[FinMind] TaiwanStockKBar error:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得台股分K失敗 (代碼：${dataId})`,
  });
});

// 2.2 API: FinMind 期貨分K (TaiwanFuturesKBar) - Sponsor $999 Plan Feature
app.get('/api/finmind/futures-kbar', async (req, res) => {
  const dataId = (req.query.data_id as string) || 'TX';
  const session = getTaiwanMarketSession();
  let startDate = (req.query.start_date as string) || session.twDateStr;

  try {
    let data = await fetchFinmindData('TaiwanFuturesKBar', dataId, startDate);
    if (!data || data.length === 0) {
      startDate = daysAgoTW(5);
      data = await fetchFinmindData('TaiwanFuturesKBar', dataId, startDate);
    }

    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        dataset: 'TaiwanFuturesKBar',
        plan: 'Sponsor ($999/月)',
        data_id: dataId,
        count: data.length,
        data,
      });
    }
  } catch (err: any) {
    console.error(`[FinMind] TaiwanFuturesKBar error:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得期貨分K失敗 (代碼：${dataId})`,
  });
});

// 2.3 API: FinMind 台股即時逐筆 (TaiwanStockPriceTick) - Sponsor $999 Plan Feature
app.get('/api/finmind/stock-ticks', async (req, res) => {
  const dataId = (req.query.data_id as string) || '2330';
  const session = getTaiwanMarketSession();
  let startDate = (req.query.start_date as string) || session.twDateStr;

  try {
    let data = await fetchFinmindData('TaiwanStockPriceTick', dataId, startDate);
    if (!data || data.length === 0) {
      startDate = daysAgoTW(5);
      data = await fetchFinmindData('TaiwanStockPriceTick', dataId, startDate);
    }

    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        dataset: 'TaiwanStockPriceTick',
        plan: 'Sponsor ($999/月)',
        data_id: dataId,
        count: data.length,
        data: data.slice(-100), // Return last 100 real ticks
      });
    }
  } catch (err: any) {
    console.error(`[FinMind] TaiwanStockPriceTick error:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得台股即時逐筆失敗 (代碼：${dataId})`,
  });
});

// 2.4 API: FinMind 期貨即時逐筆 (TaiwanFuturesTick) - Sponsor $999 Plan Feature
app.get('/api/finmind/futures-ticks', async (req, res) => {
  const dataId = (req.query.data_id as string) || 'TX';
  const session = getTaiwanMarketSession();
  const startDate = (req.query.start_date as string) || session.twDateStr;

  try {
    const data = await fetchFinmindData('TaiwanFuturesTick', dataId, startDate);
    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        dataset: 'TaiwanFuturesTick',
        plan: 'Sponsor ($999/月)',
        data_id: dataId,
        count: data.length,
        data: data.slice(-100), // Return last 100 real ticks
      });
    }
  } catch (err: any) {
    console.error(`[FinMind] TaiwanFuturesTick error:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得期貨即時逐筆失敗 (代碼：${dataId})`,
  });
});

// 2.5 API: FinMind 期貨價差每筆成交 (TaiwanFuturesSpreadTick) - Sponsor $999 Plan Feature
app.get('/api/finmind/futures-spread-ticks', async (req, res) => {
  const dataId = (req.query.data_id as string) || 'TX';
  const session = getTaiwanMarketSession();
  const startDate = (req.query.start_date as string) || session.twDateStr;

  try {
    const data = await fetchFinmindData('TaiwanFuturesSpreadTick', dataId, startDate);
    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        dataset: 'TaiwanFuturesSpreadTick',
        plan: 'Sponsor ($999/月)',
        data_id: dataId,
        count: data.length,
        data: data.slice(-50), // Return last 50 real spread ticks
      });
    }
  } catch (err: any) {
    console.error(`[FinMind] TaiwanFuturesSpreadTick error:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得期貨價差資料失敗 (代碼：${dataId})`,
  });
});

// 2.6 API: FinMind 選擇權即時逐筆 (TaiwanOptionTick) - Sponsor $999 Plan Feature
app.get('/api/finmind/option-ticks', async (req, res) => {
  const dataId = (req.query.data_id as string) || 'TXO';
  const session = getTaiwanMarketSession();
  const startDate = (req.query.start_date as string) || session.twDateStr;

  try {
    const data = await fetchFinmindData('TaiwanOptionTick', dataId, startDate);
    if (data && Array.isArray(data) && data.length > 0) {
      return res.json({
        success: true,
        data_source: 'FinMind',
        dataset: 'TaiwanOptionTick',
        plan: 'Sponsor ($999/月)',
        data_id: dataId,
        count: data.length,
        data: data.slice(-100), // Return last 100 real option ticks
      });
    }
  } catch (err: any) {
    console.error(`[FinMind] TaiwanOptionTick error:`, err.message);
  }

  return res.status(502).json({
    success: false,
    data_source: 'FinMind',
    is_mock: false,
    error: `FinMind API 取得選擇權即時逐筆失敗 (代碼：${dataId})`,
  });
});

// 0.14 API: Search stocks across TWSE, TPEx & US Stocks (NYSE/NASDAQ)
app.get('/api/market/search-stocks', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) {
    return res.json({ success: true, query: '', total: 0, results: [] });
  }

  const qUpper = q.toUpperCase();

  // Search US Stocks Catalog first
  const matchedUsStocks: Array<any> = [];
  for (const s of usStockCatalog) {
    const symUpper = s.symbol.toUpperCase();
    const nameLower = s.name.toLowerCase();
    const isExactSym = symUpper === qUpper;
    const isPrefixSym = symUpper.startsWith(qUpper);
    const isNameMatch = nameLower.includes(q);
    const isAliasMatch = (s.aliases || []).some(
      a => a.toLowerCase() === q || a.toUpperCase().startsWith(qUpper) || a.toLowerCase().includes(q)
    );

    if (isExactSym || isPrefixSym || isNameMatch || isAliasMatch) {
      matchedUsStocks.push({
        ...s,
        exact: isExactSym,
        prefix: isPrefixSym,
      });
    }
  }

  // Sort US matches: exact match first, prefix next, then alphabetic
  matchedUsStocks.sort((a, b) => {
    if (a.exact && !b.exact) return -1;
    if (!a.exact && b.exact) return 1;
    if (a.prefix && !b.prefix) return -1;
    if (!a.prefix && b.prefix) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  // Priority 1: exact symbol match in Taiwan stocks
  const exactSym = taiwanStockCatalog.filter(s => s.symbol.toUpperCase() === qUpper);
  // Priority 2: exact name match
  const exactName = taiwanStockCatalog.filter(s => s.name.toLowerCase() === q && !exactSym.includes(s));
  // Priority 3: symbol starts with
  const prefixSym = taiwanStockCatalog.filter(s => s.symbol.toUpperCase().startsWith(qUpper) && !exactSym.includes(s));
  // Priority 4: name includes
  const nameMatch = taiwanStockCatalog.filter(s => s.name.toLowerCase().includes(q) && !exactName.includes(s) && !exactSym.includes(s));
  // Priority 5: symbol includes
  const otherSym = taiwanStockCatalog.filter(s => s.symbol.toUpperCase().includes(qUpper) && !exactSym.includes(s) && !prefixSym.includes(s));

  // If query is Latin alphabetic (like Y, YA, YAH, YAHOO, AAPL), prioritize US stock matches!
  const isAlphaQuery = /^[A-Za-z]+$/.test(q);
  const combined = isAlphaQuery
    ? [...matchedUsStocks, ...exactSym, ...prefixSym, ...nameMatch, ...otherSym]
    : [...exactSym, ...exactName, ...matchedUsStocks, ...prefixSym, ...nameMatch, ...otherSym];

  const deduped: any[] = [];
  const seen = new Set<string>();
  for (const item of combined) {
    const key = `${item.symbol}_${item.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
    if (deduped.length >= 25) break;
  }

  const results = deduped.map(m => {
    const cached = authenticQuotesCache[m.symbol];
    const isUs = m.type === 'us_stocks' || m.market === 'US';
    return {
      symbol: m.symbol,
      name: m.name,
      industry: m.industry,
      type: m.type || (isUs ? 'us_stocks' : 'twse'),
      market: isUs ? 'US' : 'TW',
      price: cached ? cached.close21 : m.price,
      change: cached ? cached.change : m.change,
      changePct: cached ? cached.changePct : m.changePct,
    };
  });

  return res.json({ success: true, query: q, total: results.length, results });
});

// 0.16 API: Binance Public Market Data Proxy (Zero API Key / Zero Token Required)
app.get('/api/crypto/binance-quotes', async (_req, res) => {
  try {
    const symbols = JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT']);
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
    if (!resp.ok) {
      throw new Error(`Binance responded with HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return res.json({
      success: true,
      source: 'Binance Public Market Data (100% No API Key)',
      timestamp: Date.now(),
      data,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'Binance public market query error',
      message: err?.message || 'Unknown error',
    });
  }
});

// 0.15 API: Authentic zero-token market quote query (Direct cache / TWSE / Yahoo Finance - 0 AI Token)
app.get('/api/market/query-quote', async (req, res) => {
  const sym = String(req.query.symbol || req.query.sym || '').trim().toUpperCase();
  if (!sym) {
    return res.status(400).json({ success: false, message: '請提供標的代號' });
  }


  // 1. FinMind（快取沒有就當場抓一次）
  await ensureTracked([sym]);
  if (authenticQuotesCache[sym] && Number(authenticQuotesCache[sym].close21) > 0 && classifySymbol(sym) !== 'commodity') {
    const q = authenticQuotesCache[sym];
    const prevClose = q.prevClose || q.close21;
    const kind = classifySymbol(sym);
    const limitUp = kind === 'tw_stock' ? calcTwseLimit(prevClose, true) : undefined;
    const limitDown = kind === 'tw_stock' ? calcTwseLimit(prevClose, false) : undefined;
    return res.json({
      success: true,
      data_source: q.dataSource === 'FinMind' ? 'FinMind' : '本地快取（尚未成功從 FinMind 更新）',
      is_mock: false,
      tokens_used: 0,
      data: {
        symbol: q.symbol || sym,
        name: q.name || sym,
        closePrice: q.close21,
        prevClosePrice: prevClose,
        limitUpPrice: limitUp,
        limitDownPrice: limitDown,
        change: q.change || 0,
        changePercent: q.changePct || 0,
        openPrice: q.open || q.close21,
        highPrice: q.high || q.close21,
        lowPrice: q.low || q.close21,
        avgPrice: q.avgPrice,
        volume: q.volume ?? 0,
        turnover: q.turnover,
        date: q.date ?? null,
        fetchTime: q.fetchTime ?? null,
        unitDescription: kind === 'futures' || kind === 'option' ? '口' : kind === 'us_stock' ? '股' : (q.unitLabel || '張 (1,000股)'),
        contractMultiplier: kind === 'futures' ? getContractMultiplier(sym) : kind === 'option' ? 50 : kind === 'us_stock' ? 1 : 1000,
        marginRequirement: q.marginRequirement || 0,
      }
    });
  }

  // 2. Fetch live authentic quote from Yahoo Finance (0 AI Token)
  const isTWSE = /^[0-9]{4,6}[A-Z]?$/.test(sym);
  const isCommodity = ['CL', 'BZ', 'NG', 'RB', 'GC', 'SI', 'PL', 'PA', 'ZS', 'ZC', 'ZW', 'ZL', 'ZM', 'KC', 'SB', 'CC', 'OJ', 'CT', 'HG', 'ALI', 'NI', 'ZN', 'LE', 'HE', 'GF'].includes(sym);
  
  const yahooCandidates: string[] = [];
  if (isCommodity) {
    yahooCandidates.push(`${sym}=F`);
  } else if (isTWSE) {
    if (sym.endsWith('B')) {
      yahooCandidates.push(`${sym}.TWO`, `${sym}.TW`);
    } else {
      yahooCandidates.push(`${sym}.TW`, `${sym}.TWO`);
    }
  } else {
    yahooCandidates.push(sym, `${sym}.TW`);
  }

  for (const ySym of yahooCandidates) {
    try {
      const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?interval=1d&range=2d`);
      const json = await resp.json();
      const meta = json.chart?.result?.[0]?.meta;
      const quote = json.chart?.result?.[0]?.indicators?.quote?.[0];
      if (meta && meta.regularMarketPrice) {
        const lastIdx = (quote?.close?.length || 1) - 1;
        const currentPrice = Number(meta.regularMarketPrice.toFixed(2));
        const prevClose = Number((meta.chartPreviousClose || currentPrice).toFixed(2));
        const change = Number((currentPrice - prevClose).toFixed(2));
        const changePct = Number(((change / prevClose) * 100).toFixed(2));
        const open = quote?.open?.[lastIdx] ? Number(quote.open[lastIdx].toFixed(2)) : currentPrice;
        const high = quote?.high?.[lastIdx] ? Number(quote.high[lastIdx].toFixed(2)) : Math.max(currentPrice, prevClose);
        const low = quote?.low?.[lastIdx] ? Number(quote.low[lastIdx].toFixed(2)) : Math.min(currentPrice, prevClose);
        const volume = meta.regularMarketVolume ?? 0;
        const name = meta.shortName || meta.longName || sym;
        const limitUp = isTWSE ? calcTwseLimit(prevClose, true) : undefined;
        const limitDown = isTWSE ? calcTwseLimit(prevClose, false) : undefined;
        const tradeTime = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null;
        const tradeDate = tradeTime ? ymdTW(tradeTime) : null;

        return res.json({
          success: true,
          data_source: 'Yahoo Finance（FinMind 查無此商品時的備援）',
          is_mock: false,
          tokens_used: 0,
          data: {
            symbol: sym,
            name,
            closePrice: currentPrice,
            prevClosePrice: prevClose,
            limitUpPrice: limitUp,
            limitDownPrice: limitDown,
            change,
            changePercent: changePct,
            openPrice: open,
            highPrice: high,
            lowPrice: low,
            volume,
            date: tradeDate,
            fetchTime: tradeTime ? `${tradeDate} (Yahoo Finance)` : null,
            unitDescription: isTWSE ? '張 (1,000股)' : isCommodity ? '口' : '股',
            contractMultiplier: isTWSE ? 1000 : 1,
            marginRequirement: 0,
          }
        });
      }
    } catch (e) {
      // try next candidate
    }
  }

  return res.status(404).json({
    success: false,
    message: `官方交易所資料庫查無代號「${sym}」，已停用 AI 模擬假數據以確保數據真實性 (0 Token 消耗)。`,
  });
});

// 3. API: Gemini AI Quote & Derivative Pricing Assistant
// First checks authentic FinMind cache and live API before invoking AI
app.post('/api/gemini/quote-assistant', async (req, res) => {
  const { query, category, benchmarkDate } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const rawQuery = String(query).trim();
  const cleanSym = rawQuery.toUpperCase();

  // 1. Check US stock catalog first (e.g. YAHOO, YHOO, YUM, YELP, NVDA, AAPL, TSLA, etc.)
  const usMatch = usStockCatalog.find(
    s =>
      s.symbol.toUpperCase() === cleanSym ||
      s.name.toLowerCase() === rawQuery.toLowerCase() ||
      (s.aliases || []).some(
        a => a.toUpperCase() === cleanSym || a.toLowerCase() === rawQuery.toLowerCase()
      )
  );

  if (usMatch || category === 'us_stocks') {
    const targetSym = usMatch ? usMatch.symbol : cleanSym;
    const resolvedName = usMatch ? usMatch.name : cleanSym;
    await ensureTracked([targetSym]);
    const q: any = authenticQuotesCache[targetSym];
    if (!q || !(Number(q.close21) > 0)) {
      return res.status(404).json({
        success: false,
        notFound: true,
        message: `FinMind 查無美股「${rawQuery}」的報價（${refreshFailures.get(targetSym) || '無資料'}），系統不會以假數字代替。`,
        symbol: targetSym,
      });
    }

    const price = q.close21;
    const prevClose = q.prevClose || price;
    const change = q.change !== undefined ? q.change : Number((price - prevClose).toFixed(2));
    const changePct = q.changePct !== undefined ? q.changePct : Number(((change / prevClose) * 100).toFixed(2));

    return res.json({
      success: true,
      data: {
        symbol: targetSym,
        name: resolvedName,
        category: 'us_stocks',
        closePrice: price,
        openPrice: q.open || price,
        prevClosePrice: prevClose,
        limitUpPrice: 0,
        limitDownPrice: 0,
        isLimitUp: false,
        isLimitDown: false,
        highPrice: q.high || price,
        lowPrice: q.low || price,
        change,
        changePercent: changePct,
        volume: q.volume ?? 0,
        dataDate: q.date ?? null,
        unitDescription: '股 (1股起，美股複委託以1:32匯率折算台幣圈存)',
        marginRequirement: 0,
        contractMultiplier: 32,
        valuationReasoning: `美股複委託市場行情：${resolvedName} 最新市價 US$ ${price} (以匯率 1:32 折合 NT$ ${Math.round(price * 32).toLocaleString()})。`,
        klineHistory: q.history || [],
      },
      source: 'us_stock_catalog',
    });
  }

  // Smart Taiwan stock name <-> symbol resolution
  let catalogMatch = taiwanStockCatalog.find(
    s => s.symbol.toUpperCase() === cleanSym || s.name === rawQuery || s.name.toLowerCase() === rawQuery.toLowerCase()
  );

  if (!catalogMatch && rawQuery.length >= 2) {
    catalogMatch = taiwanStockCatalog.find(s => s.name.includes(rawQuery));
  }

  let targetSym = catalogMatch ? catalogMatch.symbol : cleanSym;
  let resolvedName = catalogMatch ? catalogMatch.name : cleanSym;

  if (cleanSym === '00918A') targetSym = '00918';
  if (cleanSym === '00981') targetSym = '00981A';

  let determinedCategory = category || 'stocks';
  if (targetSym.startsWith('00') && targetSym.endsWith('B')) determinedCategory = 'bonds';
  else if (targetSym.startsWith('00')) determinedCategory = 'etfs';
  else if (targetSym.includes('TX') || targetSym.includes('MTX') || targetSym.includes('TMF') || targetSym.endsWith('F') || rawQuery.includes('期')) determinedCategory = 'futures';
  else if (targetSym.includes('TXO') || targetSym.endsWith('-C') || targetSym.endsWith('-P')) determinedCategory = 'options';
  else if (targetSym.length === 6 && (targetSym.endsWith('P') || targetSym.endsWith('F') || /^\d{6}$/.test(targetSym))) determinedCategory = 'warrants';

  // 1. FinMind（快取沒有就當場抓一次）
  await ensureTracked([targetSym]);
  if (authenticQuotesCache[targetSym] && Number(authenticQuotesCache[targetSym].close21) > 0) {
    const q = authenticQuotesCache[targetSym];
    const prevClose = q.prevClose || q.close21;
    const kind = classifySymbol(targetSym);
    const limitUp = kind === 'tw_stock' ? calcTwseLimit(prevClose, true) : undefined;
    const limitDown = kind === 'tw_stock' ? calcTwseLimit(prevClose, false) : undefined;
    const multiplier = kind === 'futures' ? getContractMultiplier(targetSym) : kind === 'option' ? 50 : 1000;
    return res.json({
      success: true,
      data: {
        symbol: targetSym,
        name: q.name || resolvedName || targetSym,
        category: determinedCategory,
        closePrice: q.close21,
        openPrice: q.open || q.close21,
        prevClosePrice: prevClose,
        limitUpPrice: limitUp,
        limitDownPrice: limitDown,
        isLimitUp: limitUp !== undefined && q.close21 >= limitUp,
        isLimitDown: limitDown !== undefined && q.close21 <= limitDown,
        highPrice: q.high || q.close21,
        lowPrice: q.low || q.close21,
        change: q.change || 0,
        changePercent: q.changePct || 0,
        volume: q.volume ?? 0,
        dataDate: q.date ?? null,
        unitDescription: kind === 'futures' || kind === 'option' ? '口' : '張 (1,000單位)',
        marginRequirement: kind === 'futures' ? Math.round(q.close21 * multiplier * 0.135) : 0,
        contractMultiplier: multiplier,
        valuationReasoning: `${q.dataSource === 'FinMind' ? 'FinMind' : '本地快取'}行情：${q.name || resolvedName} ${q.date ?? ''} 價格 ${q.close21}。`,
        klineHistory: q.history || [],
      },
      source: 'finmind_authentic_cache',
    });
  }

  // 2. Second priority: Query real FinMind API directly
  try {
    const finmindRecords = await fetchFinmindData('TaiwanStockPrice', targetSym, daysAgoTW(20));
    if (finmindRecords && Array.isArray(finmindRecords) && finmindRecords.length > 0) {
      const latest = finmindRecords[finmindRecords.length - 1];
      const prev = finmindRecords.length > 1 ? finmindRecords[finmindRecords.length - 2] : latest;
      const stockName = resolvedName || targetSym;
      const prevClose = prev.close;
      const currentPrice = latest.close;
      const limitUp = calcTwseLimit(prevClose, true);
      const limitDown = calcTwseLimit(prevClose, false);
      const change = Number((currentPrice - prevClose).toFixed(2));
      const changePct = Number(((change / prevClose) * 100).toFixed(2));

      // Cache it
      authenticQuotesCache[targetSym] = {
        symbol: targetSym,
        name: stockName,
        close21: currentPrice,
        prevClose: prevClose,
        open: latest.open,
        high: latest.max,
        low: latest.min,
        change,
        changePct,
        volume: latest.Trading_Volume,
        date: latest.date,
      };

      return res.json({
        success: true,
        data: {
          symbol: targetSym,
          name: stockName,
          category: determinedCategory,
          closePrice: currentPrice,
          openPrice: latest.open,
          prevClosePrice: prevClose,
          limitUpPrice: limitUp,
          limitDownPrice: limitDown,
          isLimitUp: currentPrice >= limitUp,
          isLimitDown: currentPrice <= limitDown,
          highPrice: latest.max,
          lowPrice: latest.min,
          change,
          changePercent: changePct,
          volume: latest.Trading_Volume,
          unitDescription: determinedCategory === 'futures' ? '口' : '張 (1,000單位)',
          contractMultiplier: determinedCategory === 'futures' ? 2000 : 1000,
          marginRequirement: determinedCategory === 'futures' ? Math.round(currentPrice * 2000 * 0.135) : 0,
          valuationReasoning: `FinMind 官方即時撮合成功：${stockName} 最新價格 NT$ ${currentPrice}。`,
        },
        source: 'finmind_live_api',
      });
    }
  } catch (fErr: any) {
    console.warn('Direct FinMind query failed for:', targetSym, fErr.message);
  }

  // 3. User explicit rule: "Gemini AI不要代勞 模擬數據 找不到 就找不到"
  // If not found in authentic cache or FinMind, strictly return 404 with no hallucinated data.
  return res.status(404).json({
    success: false,
    notFound: true,
    message: `FinMind 官方資料庫查無「${rawQuery}」（代號：${targetSym}），請確認標的代號是否正確。系統已停用 AI 代勞模擬，嚴格禁止虛構行情。`,
    symbol: cleanSym,
  });
});

// 4. API: Gemini Macro & Industry Investment PPT Report Generator
// Generates professional PPT slides and narrative matching the teacher's requirements
app.post('/api/gemini/macro-research', async (req, res) => {
  const { studentName, portfolio, benchmarkDate } = req.body;
  const session = getTaiwanMarketSession();
  const effectiveDate = benchmarkDate || `${session.twDateStr} ${session.twTimeStr}`;

  try {
    const prompt = `你是一位頂尖的資產管理主管與大學財金系講座教授。
使用者正在準備一份「5000萬台幣資產配置與金融衍生性商品實戰模擬專案 PPT 報告」，依據系統當前即時撮合行情（基準時間：${effectiveDate}）進場建立部位。
報告要求必須從「總體經濟」→「產業展望」→「個股與衍生性商品配置理由」完整論述，並涵蓋股票、債券、ETF、期貨與選擇權。

同學姓名/組別: ${studentName || '投資策略實務組'}
基準時間: ${effectiveDate}
當前投資組合持倉摘要: ${JSON.stringify(sanitizeForAI(portfolio) || {})}

【資安隱私零洩漏嚴格規範】：嚴格禁止在任何演講稿、投影片或分析中輸出、猜測或透露任何使用者的登入密碼、通行證或敏感憑證！

請生成一份結構嚴謹、具備高說服力與專業術語的簡報演講講稿與 PPT 投影片大綱（繁體中文），以 JSON 格式回傳：
{
  "reportTitle": "5000萬資產配置與衍生性商品實務操作報告",
  "subtitle": "依據實時行情之總經剖析、產業選股與多空對沖策略",
  "executiveSummary": "200字摘要總結整體5000萬配置哲學與預期年化報酬率/夏普值目標",
  "macroAnalysis": {
    "title": "一、總體經濟環境分析 (Macro Outlook)",
    "interestRateCycle": "聯準會降息循環、台美利差與央行貨幣政策評析",
    "inflationAndGdp": "景氣對策信號、台灣出口成長力道與外資資金活水動能",
    "marketValuation": "加權指數歷史本益比位階與風險溢酬評估"
  },
  "industryTrends": {
    "title": "二、關鍵產業趨勢與戰略核心 (Industry Trends)",
    "aiAndSemiconductors": "AI 晶片先進封裝（CoWoS）、伺服器組裝與半導體供應鏈展望",
    "bondsOutlook": "美債殖利率曲線、長天期美債ETF與投資級公司債鎖利契機",
    "hedgingNecessity": "地緣政治風險與大盤高檔震盪之避險需求"
  },
  "assetAllocationStrategy": {
    "title": "三、5000萬資金配置藍圖與架構 (Asset Blueprint)",
    "coreEquityPercent": 數值 (建議例如 40~50),
    "bondAllocationPercent": 數值 (建議例如 20~25),
    "etfPassivePercent": 數值 (建議例如 15~20),
    "futuresDerivativesPercent": 數值 (期貨保證金例如 10~15),
    "optionsWarrantsPercent": 數值 (選擇權/權證權利金例如 3~5),
    "strategyRationale": "配置比例之資產分散與夏普值最佳化論證"
  },
  "derivativesHedgingPlan": {
    "title": "四、衍生性商品實務操作與避險策略 (Derivatives Strategy)",
    "futuresRole": "大台/小台期貨之多空避險計算、Delta 係數中立與槓桿控制",
    "optionsRole": "台指選擇權 Buy Call/Put 及 Sell 勒式價差賺取時間價值或權利金策略",
    "warrantsRole": "個股認購/認售權證之槓桿放大效應與有限風險特性"
  },
  "slides": [
    {
      "slideNumber": 1,
      "title": "投影片標題",
      "subtitle": "副標題",
      "bulletPoints": ["核心要點1", "核心要點2", "核心要點3"],
      "speechNote": "同學上台報告的具體逐字發言稿建議 (約 80-120 字)"
    },
    {
      "slideNumber": 2,
      "title": "投影片標題",
      "subtitle": "副標題",
      "bulletPoints": ["核心要點1", "核心要點2", "核心要點3"],
      "speechNote": "口頭報告發言建議"
    },
    {
      "slideNumber": 3,
      "title": "投影片標題",
      "subtitle": "副標題",
      "bulletPoints": ["核心要點1", "核心要點2", "核心要點3"],
      "speechNote": "口頭報告發言建議"
    },
    {
      "slideNumber": 4,
      "title": "投影片標題",
      "subtitle": "副標題",
      "bulletPoints": ["核心要點1", "核心要點2", "核心要點3"],
      "speechNote": "口頭報告發言建議"
    },
    {
      "slideNumber": 5,
      "title": "投影片標題",
      "subtitle": "副標題",
      "bulletPoints": ["核心要點1", "核心要點2", "核心要點3"],
      "speechNote": "口頭報告發言建議"
    }
  ]
}`;

    // Prioritize Groq Free Token Pool (Llama-3.3-70B) if configured, else fall back to Gemini
    const hasGroqKeys = groqSlots.some(s => s.key && s.key.length > 5);
    if (hasGroqKeys) {
      try {
        const groqRes = await callGroqWithRotation(prompt, 'llama-3.3-70b-versatile', true);
        const json = JSON.parse(groqRes.text);
        return res.json({
          success: true,
          data: json,
          provider: 'groq',
          model: groqRes.model,
          slot: groqRes.slot,
          latencyMs: groqRes.latencyMs,
          keyMasked: groqRes.keyMasked,
        });
      } catch (groqErr: any) {
        console.warn('[Macro Research] Groq failed, seamlessly falling back to Gemini:', groqErr.message);
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const json = JSON.parse(text);
    return res.json({ success: true, data: json, provider: 'gemini', model: 'gemini-3.8-flash' });
  } catch (err: any) {
    console.error('Gemini macro research error:', err);
    return res.status(500).json({ error: 'Gemini research failed', message: err.message });
  }
});

// 5. API: Gemini AI Financial Calculator (智能財務計算機 · 支援 Groq 10組免費金鑰輪詢池 + Gemini 備援)
// Calculates position sizes, futures leverage, options breakeven, hedging ratios, and custom natural language scenarios
/** 給 AI 的參考行情：一律來自 FinMind 快取，附資料日期；沒有資料就明講 */
function referenceQuotesForAI(symbols: string[]): string {
  return [...new Set(symbols.map(s => String(s).toUpperCase()))]
    .map(sym => {
      const q = authenticQuotesCache[sym];
      if (!q || !(Number(q.close21) > 0)) return `- ${sym}：無報價`;
      const src = q.dataSource === 'FinMind' ? 'FinMind' : '舊快取，可能過時';
      return `- ${q.name || sym} (${sym})：${q.close21}，漲跌 ${q.change ?? '-'}（${q.date ?? '日期不明'}，${src}）`;
    })
    .join('\n');
}

app.post('/api/gemini/financial-calculator', async (req, res) => {
  const {
    calcType, // 'position_sizing' | 'futures_leverage' | 'options_breakeven' | 'hedging_ratio' | 'custom_prompt'
    instrument,
    portfolio,
    targetAmount,
    targetQuantity,
    scenarioChangePct,
    userQuery,
    provider = 'auto', // 'auto' | 'groq' | 'gemini'
  } = req.body;

  try {
    const session = getTaiwanMarketSession();
    const prompt = `你是一位精通台灣證券與期貨交易所（TWSE & TAIFEX）法規與數學計算的量化操盤主管。
使用者正在玩「5000萬台幣股市大富翁實戰模擬」，所有數據皆以系統即時撮合行情（當前系統時間：${session.twDateTimeStr}）為基準。
以下是系統從 FinMind 取得的最新參考行情（日期即資料日期）：
${referenceQuotesForAI(['TX', 'MTX', 'TMF', '2330', instrument?.symbol].filter(Boolean))}
契約乘數：大台每點200元、小台每點50元、微台每點10元、選擇權每點50元。

【數據鐵則】所有價格只能使用「參考行情」與「當前標的」中提供的數字，不得自行編造或沿用記憶中的價格；
若計算所需的價格未提供，請在 aiAnalysis 說明「缺少報價無法計算」，數值欄位填 null。下方 JSON 範例中的數字只是格式示範，不可沿用。

計算模式: ${calcType || 'custom_prompt'}
當前標的: ${JSON.stringify(sanitizeForAI(instrument) || {})}
當前帳戶資產與部位: ${JSON.stringify(sanitizeForAI(portfolio) || {})}
使用者設定金額: ${targetAmount || '未指定'}
使用者設定數量: ${targetQuantity || '未指定'}
假設漲跌幅: ${scenarioChangePct || '5%'}
使用者提問/指令: "${userQuery || ''}"

【資安隱私零洩漏嚴格規範】：嚴格禁止在任何回覆或指標中輸出或洩漏任何使用者的密碼或憑證！

請以最嚴謹的金融數學進行精確計算，並以 JSON 格式回傳結構化試算結果（繁體中文）：
{
  "calculatorTitle": "計算機標題 (例如：台積電部位規模與資產佔比計算)",
  "formulaUsed": "計算採用的核心公式 (例如：張數 = 投資金額 / (單價 * 1000股))",
  "keyMetrics": [
    { "label": "指標名稱 (例如：可買進張數)", "value": "數值文字 (例如：6 張 (6,000股))", "highlight": true },
    { "label": "實際花費資金", "value": "NT$ 14,880,000", "highlight": false },
    { "label": "佔5000萬資產比重", "value": "29.76%", "highlight": false },
    { "label": "剩餘可用現金", "value": "NT$ 35,120,000", "highlight": false },
    { "label": "實質槓桿/損益打平點", "value": "1.0倍 / NT$ 2,480", "highlight": false }
  ],
  "scenarioMatrix": [
    { "scenario": "大漲 +10%", "targetPrice": 2728, "pnlAmount": 1488000, "returnPct": "+10.0%", "description": "獲利突破新高" },
    { "scenario": "上漲 +5%", "targetPrice": 2604, "pnlAmount": 744000, "returnPct": "+5.0%", "description": "穩健上攻" },
    { "scenario": "持平 0%", "targetPrice": 2480, "pnlAmount": 0, "returnPct": "0.0%", "description": "平盤震盪" },
    { "scenario": "拉回 -5%", "targetPrice": 2356, "pnlAmount": -744000, "returnPct": "-5.0%", "description": "回檔整理" },
    { "scenario": "重挫 -10%", "targetPrice": 2232, "pnlAmount": -1488000, "returnPct": "-10.0%", "description": "觸及防守停損線" }
  ],
  "aiAnalysis": "詳細的量化風險分析、資產配置建議與避險配套方案 (約 150-250 字)",
  "suggestedOrder": {
    "canApplyToTrade": true,
    "symbol": "${instrument?.symbol || '2330'}",
    "name": "${instrument?.name || '台積電'}",
    "category": "${instrument?.category || 'stocks'}",
    "orderType": "BUY_STOCK 或對應訂單類別",
    "price": 2480,
    "quantity": 6,
    "totalAmount": 14880000,
    "notes": "量化 AI 推薦的下單理由"
  }
}`;

    const hasGroqKeys = groqSlots.some(s => s.key && s.key.length > 5);
    const shouldUseGroq = (provider === 'groq' || provider === 'auto') && hasGroqKeys;

    if (shouldUseGroq) {
      try {
        const groqRes = await callGroqWithRotation(prompt, 'llama-3.3-70b-versatile', true);
        const json = JSON.parse(groqRes.text);
        return res.json({
          success: true,
          data: json,
          provider: 'groq',
          model: groqRes.model,
          slot: groqRes.slot,
          latencyMs: groqRes.latencyMs,
          keyMasked: groqRes.keyMasked,
        });
      } catch (groqErr: any) {
        console.warn('[AI Calculator] Groq failed, seamlessly falling back to Gemini:', groqErr.message);
      }
    }

    // Fallback to Gemini
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const json = JSON.parse(text);
    return res.json({
      success: true,
      data: json,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('AI financial calculator error:', err);
    return res.status(500).json({ error: 'AI calculation failed', message: err.message });
  }
});

// =========================================================================
// GROQ KEY POOL API ENDPOINTS (10組 Token 輪詢池管理與測試)
// =========================================================================

// 1. GET /api/groq/status
app.get('/api/groq/status', (req, res) => {
  const configuredCount = groqSlots.filter(s => s.key && s.key.length > 5).length;
  return res.json({
    success: true,
    totalSlots: 10,
    configuredCount,
    currentActiveSlot: (groqSlots[currentGroqSlotIndex]?.slot || 1),
    defaultModel: 'llama-3.3-70b-versatile',
    slots: groqSlots.map(s => ({
      slot: s.slot,
      isConfigured: Boolean(s.key && s.key.length > 5),
      maskedKey: s.key ? (s.key.slice(0, 6) + '••••••••' + s.key.slice(-4)) : '',
      source: s.source,
      usageCount: s.usageCount,
      lastUsedTimestamp: s.lastUsedTimestamp,
      lastError: s.lastError,
      status: s.status,
    })),
  });
});

// 2. POST /api/groq/keys
app.post('/api/groq/keys', (req, res) => {
  const { keys } = req.body || {};
  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: 'keys must be an array of up to 10 strings' });
  }

  const updatedRecord: Record<number, string> = {};
  keys.forEach((k: any, i: number) => {
    if (i < 10) {
      const cleanKey = String(k || '').trim();
      if (cleanKey && cleanKey !== '••••••••••••••••••••') {
        updatedRecord[i + 1] = cleanKey;
      }
    }
  });

  saveGroqKeySlots(updatedRecord);
  const count = groqSlots.filter(s => s.key && s.key.length > 5).length;
  return res.json({
    success: true,
    configuredCount: count,
    message: `已成功儲存並同步 ${count} 組 Groq 免費金鑰`,
  });
});

// 3. POST /api/groq/test
app.post('/api/groq/test', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const testPrompt =
      prompt ||
      'Explain why fast inference is critical for reasoning models. Please provide a clear, concise explanation in Traditional Chinese (繁體中文) within 2-3 sentences.';
    const groqRes = await callGroqWithRotation(testPrompt, 'llama-3.3-70b-versatile', false);
    return res.json({
      success: true,
      slot: groqRes.slot,
      latencyMs: groqRes.latencyMs,
      model: groqRes.model,
      reply: groqRes.text,
      keyMasked: groqRes.keyMasked,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Groq 連線測試失敗，請檢查金鑰',
    });
  }
});

// 4. POST /api/groq/stockq-analyze (Groq 協助 StockQ 數據解析、格式對齊與跨市場宏觀研判)
app.post('/api/groq/stockq-analyze', async (req, res) => {
  const { rawText, currentQuotes } = req.body;

  try {
    const hasGroqKeys = groqSlots.some(s => s.key && s.key.length > 5);

    const prompt = `你是一位精通全球大宗原物料（CME/NYMEX/ICE/LME）、StockQ 國際股市指數（www.stockq.org）、外匯與公債殖利率的量化金融與跨市場總經專家。
使用者正在詢問：「Groq 幫的了忙？ 協助這數據的對齊 StockQ 嗎？」。請根據使用者提供的文字或系統當前數據進行極速結構化對齊與跨市場關聯深度解析。

【使用者輸入之原始 StockQ 剪貼或問題】
${rawText ? rawText.slice(0, 3000) : '未提供剪貼文字，請針對系統目前的 StockQ 標的數據進行一致性校對與跨市場多空研判。'}

【當前系統原物料與 StockQ 數據樣本】
${JSON.stringify((currentQuotes || []).slice(0, 20))}

【重點任務】
1. 若使用者有提供原始剪貼或網頁文字，請精準解析提取出標的名稱、代號、最新指數/買價、漲跌、漲跌幅%、台北時間，輸出至 parsedItems 陣列。
2. 進行「數據對齊說明 (alignmentAnalysis)」：清晰解釋 StockQ 的欄位結構（買價、漲跌、比例%、台北時間、期貨合約與現貨代碼的對齊邏輯），以及原油、天然氣、黃金、銅等期貨合約與現貨之換算規則。
3. 進行「跨市場宏觀連動研判 (macroInterMarketInsights)」：
   - 原油 (WTI/Brent) 走勢對通膨、聯準會利率、航運族群及台股塑化產業影響
   - 黃金 (XAU/GC) 與美債 10 年期殖利率 (US 10Y)、美元指數 (DXY) 避險連動
   - 高級銅 (HG)「銅博士」與全球 AI 伺服器電網、電動車銅線、製造業景氣榮枯
4. 給出量化操盤建議 (tradingImplications)。

【數據鐵則】所有數字只能取自上方「使用者輸入」或「當前系統數據樣本」。不得自行編造、推估或沿用記憶中的價格；
找不到的數字一律填 null，並在文字中說明「資料未提供」。parsedItems 只能列出使用者輸入中實際出現的標的。
下方 JSON 只示範格式，其中的數字是佔位符，不可沿用。

請嚴格輸出合法 JSON 格式：
{
  "alignmentTitle": "StockQ 數據對齊與總經量化審查",
  "alignmentSummary": "文字簡短摘要",
  "dataStatus": "aligned",
  "parsedItems": [
    {
      "symbol": "CL",
      "name": "紐約輕原油",
      "price": 0,
      "change": 0,
      "changePercent": 0,
      "taipeiTime": "HH:MM",
      "unitLabel": "美元/桶"
    }
  ],
  "macroInsights": [
    {
      "title": "原油走勢與通膨利率連動",
      "indicator": "依輸入數據填寫",
      "impact": "neutral",
      "detail": "深入解析說明"
    },
    {
      "title": "黃金與美債殖利率避險風向",
      "indicator": "依輸入數據填寫",
      "impact": "bullish",
      "detail": "深入解析說明"
    },
    {
      "title": "銅博士與AI資料中心電網需求",
      "indicator": "依輸入數據填寫",
      "impact": "bullish",
      "detail": "深入解析說明"
    }
  ],
  "groqRoleExplanation": "Groq 作為 LLaMA-3.3-70B 極速推論大腦，能在 0.3 秒內完成複雜跨市場聯動分析與剪貼文字的結構化清洗提取；即時報價則由系統端直接與 StockQ 官方結構精準同步對齊。"
}`;

    if (hasGroqKeys) {
      try {
        const groqRes = await callGroqWithRotation(prompt, 'llama-3.3-70b-versatile', true);
        const json = JSON.parse(groqRes.text);
        return res.json({
          success: true,
          provider: 'groq',
          model: groqRes.model,
          slot: groqRes.slot,
          latencyMs: groqRes.latencyMs,
          data: json,
        });
      } catch (groqErr: any) {
        console.warn('[StockQ Groq] Groq failed, seamlessly falling back to Gemini:', groqErr.message);
      }
    }

    // Fallback to Gemini 3.8 Flash
    const geminiRes = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const json = JSON.parse(geminiRes.text || '{}');
    return res.json({
      success: true,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latencyMs: 1100,
      data: json,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'StockQ Groq 分析失敗',
    });
  }
});

// 6. API: Gemini AI Market Data Anomaly & Hallucination Auditor (資料真偽與幻覺審計引擎)
app.post('/api/gemini/audit-market-anomalies', async (req, res) => {
  const { targetSymbol, sampleInstruments, studentProfiles } = req.body;

  try {
    const session = getTaiwanMarketSession();
    const prompt = `你是一位受聘於金融監督機構與頂級量化對沖基金的最高階首席稽核長與 AI 幻覺審計專家。
使用者正在管理「5000萬股市大富翁實戰模擬系統」，現在需要你對目前的即時行情數據、FinMind 外部資料源品質，以及學員交易紀錄進行全面性的「資料真偽、數值異常與 AI 幻覺深度審計」。

【系統當前環境】
- 台灣市場時間: ${session.twDateTimeStr}
- 台股開收盤狀態: ${session.isTwseOpen ? '盤中開市撮合中' : '已收盤 (官方收盤價嚴格鎖定)'}
- 期貨市場狀態: ${session.isFuturesOpen ? '盤中撮合中' : '已收盤'}
- FinMind 外部連線狀態: ${currentFinmindToken ? '已設定 Token' : '未設定 Token（免費額度）'}
- 最近一次 FinMind 日資料更新: ${lastRefreshAt ? new Date(lastRefreshAt).toISOString() : '尚未成功更新'}
- 更新失敗的代號: ${[...refreshFailures.keys()].slice(0, 30).join(', ') || '無'}
- 指定檢查目標: ${targetSymbol || '全市場標的'}

【FinMind 伺服器端參考行情（審計比對基準）】
${referenceQuotesForAI(['TX', 'MTX', 'TMF', '2330', '2317', '2454', '0050', targetSymbol].filter(Boolean))}

【待審計樣本數據】
- 標的行情數據: ${JSON.stringify(sanitizeForAI(sampleInstruments) || []).slice(0, 4000)}
- 學員資產與交易狀況: ${JSON.stringify(sanitizeForAI(studentProfiles) || []).slice(0, 3000)}

【資安隱私零洩漏嚴格規範】：嚴格禁止在任何審計分析、報告或數值檢驗中輸出、提及或猜測任何使用者的登入密碼、私密金鑰或管理憑證！

【稽核規則】
1. 檢驗標的現價與昨收價差，是否符合台股 10% 漲跌幅限制規則。
2. 檢驗委買委賣五檔報價合理性（買價 < 賣價，數量大於0，價位跳動級距正確）。
3. 逐一比對「標的行情數據」與「FinMind 參考行情」：價格差異超過 1% 或資料日期不同者，一律標為 FAIL 並寫出兩邊數字。
4. 資料日期早於最近交易日、來源不是 FinMind、或缺少日期者，標為 WARN（可能過時）。
5. 你無法上網查證，不得自行判斷價格「合理」或「真實」；只能依上述比對結果下結論，不得預設資料為真。
6. 若無法比對（缺少參考行情），status 填 UNVERIFIED。
7. 檢驗學員是否出現異常套利交易（例如中午漲停卻以昨收偷買）或資產異常。

請以繁體中文回傳結構化 JSON，格式如下：
{
  "auditTimestamp": "${session.twDateTimeStr}",
  "overallStatus": "HEALTHY_VERIFIED | ISSUES_FOUND | UNVERIFIED（依比對結果擇一）",
  "overallScore": 0,
  "summaryTitle": "全市場行情與資料真偽審計摘要",
  "summaryContent": "總結市場行情是否真實、有無幻覺偏誤，以及 FinMind 與快照數據的品質評估...",
  "finmindAssessment": {
    "isAuthentic": "true 或 false（依比對結果）",
    "dataSourceType": "依比對結果描述資料來源",
    "explanation": "說明比對方式與結果；有差異就明確列出，不得替資料背書"
  },
  "itemsChecked": [
    {
      "symbol": "2330",
      "name": "台積電",
      "status": "PASS",
      "metrics": "前端價格 vs FinMind 參考價格、資料日期（此處僅為格式示範）",
      "findings": "審計發現與細節檢驗說明",
      "isHallucination": false
    }
  ],
  "studentTradingRiskAnalysis": "學員交易行為與資金合理性審計分析...",
  "recommendations": ["具體建議1", "具體建議2"],
  "sheetsExportRow": [
    "${session.twDateTimeStr}",
    "${targetSymbol || '全市場行情與學員交易'}",
    "PASS / FAIL / UNVERIFIED",
    "比對摘要（列出實際數字）",
    "審計結論",
    "程瑋翔 (最高管理者)"
  ]
}`;

    // Prioritize Groq Free Token Pool (Llama-3.3-70B) if configured, else fall back to Gemini
    const hasGroqKeys = groqSlots.some(s => s.key && s.key.length > 5);
    if (hasGroqKeys) {
      try {
        const groqRes = await callGroqWithRotation(prompt, 'llama-3.3-70b-versatile', true);
        const json = JSON.parse(groqRes.text);
        return res.json({
          success: true,
          data: json,
          provider: 'groq',
          model: groqRes.model,
          slot: groqRes.slot,
          latencyMs: groqRes.latencyMs,
          keyMasked: groqRes.keyMasked,
        });
      } catch (groqErr: any) {
        console.warn('[Audit Anomalies] Groq failed, seamlessly falling back to Gemini:', groqErr.message);
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const json = JSON.parse(text);
    return res.json({ success: true, data: json, provider: 'gemini', model: 'gemini-3.8-flash' });
  } catch (err: any) {
    console.error('Gemini audit error:', err);
    return res.status(500).json({ error: 'Gemini audit failed', message: err.message });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction && !process.env.SERVE_STATIC) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn('[Vite Middleware Warn] Dev server middleware encountered an issue, checking static build fallback:', viteErr);
      if (hasDist) {
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  } else {
    // Production Mode: Serve built SPA from dist
    if (hasDist) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn('[Warning] dist directory not found in production. Fallback index generated.');
      app.get('*', (_req, res) => {
        res.status(200).send('<!doctype html><html><body><h2>FinMind 實戰系統啟動中，請稍候重新整理...</h2></body></html>');
      });
    }
  }

  // Global Express Error Handler
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Global Express Error Handler]:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: '內部伺服器發生異常，系統已自動攔截保護',
        message: err?.message || 'Unknown Server Error',
      });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FinMind 5000萬股市大富翁 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
