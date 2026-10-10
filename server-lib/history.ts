/**
 * 長期歷史日 K 資料來源（給「專業分析」使用）
 *
 * 優先讀 PayFireBase 的 Firestore 資料庫 stock-history（由 scripts/import-history.ts 匯入），
 * 一檔一年一份文件；若該股票尚未匯入，改直接向 取原始＋還原股價。
 * 回傳欄式陣列，節省傳輸量。
 */

export interface HistorySeries {
  symbol: string;
  name: string | null;
  market: string | null;
  source: 'Firestore stock-history' | '即時查詢';
  date: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  adj_open: (number | null)[];
  adj_high: (number | null)[];
  adj_low: (number | null)[];
  adj_close: (number | null)[];
}

const FIELDS = ['open', 'high', 'low', 'close', 'volume', 'adj_open', 'adj_high', 'adj_low', 'adj_close'] as const;
// 記憶體快取：最多保留 MAX_ENTRIES 檔，最久沒用的先丟（LRU），避免大量查詢撐爆記憶體
const cache = new Map<string, { at: number; data: HistorySeries }>();
const CACHE_MS = 30 * 60 * 1000;
const MAX_ENTRIES = Number(process.env.HISTORY_CACHE_MAX || 200);
// 查無資料的代號記 1 天，避免同一個錯誤代號一直向行情來源查詢
const missing = new Map<string, number>();
const MISSING_MS = 24 * 60 * 60 * 1000;
const MAX_MISSING = 5000;
// 同一檔同時有多人查詢時，只抓一次，其他人等同一個結果
const inflight = new Map<string, Promise<HistorySeries | null>>();

function cacheGet(sym: string) {
  const hit = cache.get(sym);
  if (!hit) return null;
  if (Date.now() - hit.at >= CACHE_MS) {
    cache.delete(sym);
    return null;
  }
  cache.delete(sym);
  cache.set(sym, hit); // 移到最新
  return hit.data;
}
function cacheSet(sym: string, data: HistorySeries) {
  cache.delete(sym);
  cache.set(sym, { at: Date.now(), data });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}
function markMissing(sym: string) {
  missing.delete(sym);
  missing.set(sym, Date.now());
  while (missing.size > MAX_MISSING) missing.delete(missing.keys().next().value as string);
}
function isMissing(sym: string) {
  const at = missing.get(sym);
  if (at == null) return false;
  if (Date.now() - at >= MISSING_MS) {
    missing.delete(sym);
    return false;
  }
  return true;
}
export function historyCacheStats() {
  return { cached: cache.size, maxCached: MAX_ENTRIES, missing: missing.size, inflight: inflight.size };
}

let firestore: any = null;
async function getDb() {
  if (firestore) return firestore;
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = process.env.HISTORY_PROJECT || 'payfirebase';
  const app = getApps().find(a => a.name === 'history') || initializeApp({ credential: applicationDefault(), projectId }, 'history');
  firestore = getFirestore(app, process.env.HISTORY_DATABASE || 'stock-history');
  return firestore;
}

async function fromFirestore(symbol: string): Promise<HistorySeries | null> {
  const db = await getDb();
  const metaSnap = await db.collection('kline_meta').doc(symbol).get();
  if (!metaSnap.exists) return null;
  const meta = metaSnap.data();
  const years: number[] = (meta.years || []).slice().sort((a: number, b: number) => a - b);
  if (years.length === 0) return null;
  const refs = years.map(y => db.collection('kline_daily').doc(`${symbol}_${y}`));
  const snaps = await db.getAll(...refs);
  const out: HistorySeries = {
    symbol, name: meta.name ?? null, market: meta.market ?? null, source: 'Firestore stock-history',
    date: [], open: [], high: [], low: [], close: [], volume: [], adj_open: [], adj_high: [], adj_low: [], adj_close: [],
  };
  for (const s of snaps) {
    if (!s.exists) continue;
    const d = s.data();
    out.date.push(...d.date);
    for (const f of FIELDS) (out as any)[f].push(...(d[f] || []));
  }
  return out.date.length ? out : null;
}

async function fromFinMind(symbol: string, token: string): Promise<HistorySeries | null> {
  const get = async (dataset: string) => {
    const url = new URL('https://api.finmindtrade.com/api/v4/data');
    url.searchParams.set('dataset', dataset);
    url.searchParams.set('data_id', symbol);
    url.searchParams.set('start_date', '1994-10-01');
    if (token) url.searchParams.set('token', token);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json: any = await res.json();
      if (json?.status !== 200) throw new Error(json?.msg || `HTTP ${res.status}`);
      return (json.data || []) as any[];
    } finally {
      clearTimeout(t);
    }
  };
  const [raw, adj] = await Promise.all([get('TaiwanStockPrice'), get('TaiwanStockPriceAdj')]);
  const rows = raw.filter(r => Number(r.close) > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) return null;
  const amount: number[] = rows.map(r => Number(r.Trading_money) || 0);
  const adjBy = new Map(adj.map(r => [r.date, r]));
  const out: HistorySeries = {
    symbol, name: null, market: null, source: '即時查詢',
    date: [], open: [], high: [], low: [], close: [], volume: [], adj_open: [], adj_high: [], adj_low: [], adj_close: [],
  };
  for (const r of rows) {
    const a = adjBy.get(r.date);
    const ok = a && Number(a.close) > 0;
    out.date.push(r.date);
    out.open.push(r.open); out.high.push(r.max); out.low.push(r.min); out.close.push(r.close); out.volume.push(r.Trading_Volume);
    out.adj_open.push(ok ? a.open : null); out.adj_high.push(ok ? a.max : null); out.adj_low.push(ok ? a.min : null); out.adj_close.push(ok ? a.close : null);
  }
  (out as any)._amount = amount;
  return out;
}

/**
 * 缺口補寫：Firestore 沒有這檔時，把剛抓到的完整歷史寫回去（一檔一年一份，只寫這一次）。
 * 寫入 kline_meta.firstDate 後，每日匯入工作就會接手每天更新、除權息時重抓。
 */
async function saveToFirestore(data: HistorySeries, info?: { name?: string | null; market?: string | null }) {
  const db = await getDb();
  const amount: number[] = (data as any)._amount || [];
  const byYear = new Map<number, number[]>();
  data.date.forEach((d, i) => {
    const y = Number(d.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(i);
  });
  const now = new Date().toISOString();
  const batch = db.batch();
  for (const [year, idx] of byYear) {
    const pick = (arr: any[]) => idx.map(i => arr[i] ?? null);
    batch.set(db.collection('kline_daily').doc(`${data.symbol}_${year}`), {
      stock_id: data.symbol,
      name: info?.name ?? null,
      market: info?.market ?? null,
      year,
      count: idx.length,
      date: pick(data.date),
      open: pick(data.open), high: pick(data.high), low: pick(data.low), close: pick(data.close),
      volume: pick(data.volume), amount: pick(amount),
      adj_open: pick(data.adj_open), adj_high: pick(data.adj_high), adj_low: pick(data.adj_low), adj_close: pick(data.adj_close),
      source: '市場資料 TaiwanStockPrice / TaiwanStockPriceAdj',
      savedBy: 'web-miss',
      updatedAt: now,
    });
  }
  batch.set(
    db.collection('kline_meta').doc(data.symbol),
    {
      stock_id: data.symbol,
      name: info?.name ?? null,
      market: info?.market ?? null,
      firstDate: data.date[0],
      lastDate: data.date[data.date.length - 1],
      years: [...byYear.keys()],
      bars: data.date.length,
      savedBy: 'web-miss',
      updatedAt: now,
    },
    { merge: true }
  );
  await batch.commit();
  console.log(`[History] 已補寫 ${data.symbol} 到資料庫（${byYear.size} 年、${data.date.length} 根日K）`);
}

export async function getHistory(
  symbol: string,
  token: string,
  info?: { name?: string | null; market?: string | null }
): Promise<HistorySeries | null> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[0-9A-Z]{4,6}$/.test(sym)) return null;
  const hit = cacheGet(sym);
  if (hit) return hit;
  if (isMissing(sym)) return null;
  const pending = inflight.get(sym);
  if (pending) return pending;

  const job = (async () => {
    let data: HistorySeries | null = null;
    let firestoreOk = true;
    try {
      data = await fromFirestore(sym);
    } catch (e: any) {
      firestoreOk = false;
      console.warn(`[History] Firestore 讀取 ${sym} 失敗，改用市場資料：${e.message}`);
    }
    if (!data) {
      data = await fromFinMind(sym, token); // 失敗會丟出錯誤，不記成「查無資料」
      if (!data) {
        markMissing(sym);
        return null;
      }
      // 只補寫上市、上櫃：它們由每日匯入工作接手更新；興櫃等其他市場只放記憶體快取
      if (firestoreOk && (info?.market === 'twse' || info?.market === 'tpex')) {
        // 背景寫回，不拖慢這次回應
        saveToFirestore(data, info).catch(e => console.warn(`[History] 補寫 ${sym} 失敗：${e.message}`));
      }
      delete (data as any)._amount;
    }
    cacheSet(sym, data);
    return data;
  })();
  inflight.set(sym, job);
  try {
    return await job;
  } finally {
    inflight.delete(sym);
  }
}
