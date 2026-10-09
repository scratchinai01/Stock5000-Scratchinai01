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
const cache = new Map<string, { at: number; data: HistorySeries }>();
const CACHE_MS = 30 * 60 * 1000;

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
  return out;
}

export async function getHistory(symbol: string, token: string): Promise<HistorySeries | null> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[0-9A-Z]{4,6}$/.test(sym)) return null;
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let data: HistorySeries | null = null;
  try {
    data = await fromFirestore(sym);
  } catch (e: any) {
    console.warn(`[History] Firestore 讀取 ${sym} 失敗，改用市場資料：${e.message}`);
  }
  if (!data) data = await fromFinMind(sym, token);
  if (data) cache.set(sym, { at: Date.now(), data });
  return data;
}
