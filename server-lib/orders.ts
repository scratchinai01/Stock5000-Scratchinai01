/**
 * 委託簿與撮合服務
 *
 * - 委託存在 PayFireBase Firestore（stock-history 資料庫的 sim_orders 集合），伺服器記憶體為主、寫入同步
 *   → Cloud Run 必須維持單一執行個體（--max-instances 1），否則兩台會各自撮合
 * - 每 10 秒（有有效委託時）抓 FinMind 即時快照判定成交，規則見 orderEngine.ts
 * - 成交回報放在委託上，前端用 /api/orders/claim 領取後記入學生帳戶（每筆只會被領一次）
 */
import type { Express, Request, Response } from 'express';
import { getInstrumentTradingClock } from '../src/utils/tradingClock';
import {
  usesOrderBook,
  validateLimitPrice,
  openSide,
  closeSide,
  isActiveStatus,
  type PriceType,
  type TimeInForce,
  type OrderIntent,
} from '../src/utils/orderRules';
import type { AssetCategory, OrderAction } from '../src/types/market';
import {
  LiquidityLedger,
  applyFills,
  matchAtClose,
  matchImmediate,
  matchWorking,
  remainingQty,
  type Quote,
  type SimOrder,
} from './orderEngine';

export interface OrderDeps {
  getToken: () => string;
  /** 伺服器的 FinMind 報價快取（日資料），含 close21、prevClose、date、contractMonth */
  getCachedQuote: (symbol: string) => any | undefined;
  futuresCode: (symbol: string) => string;
}

const COLLECTION = 'sim_orders';
const TICK_MS = 10_000;
const orders = new Map<string, SimOrder>();
const ledger = new LiquidityLedger();
let deps: OrderDeps;
let loaded = false;
let lastTick = { at: 0, active: 0, fills: 0, error: '' };

// ───────────────────────── Firestore ─────────────────────────
let firestore: any = null;
async function getDb() {
  if (firestore) return firestore;
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = process.env.HISTORY_PROJECT || 'payfirebase';
  const app = getApps().find(a => a.name === 'orders') || initializeApp({ credential: applicationDefault(), projectId }, 'orders');
  firestore = getFirestore(app, process.env.HISTORY_DATABASE || 'stock-history');
  return firestore;
}
const writeChains = new Map<string, Promise<void>>();
function persist(o: SimOrder) {
  const prev = writeChains.get(o.id) || Promise.resolve();
  const next = prev
    .then(async () => {
      const db = await getDb();
      await db.collection(COLLECTION).doc(o.id).set(JSON.parse(JSON.stringify(o)));
    })
    .catch(e => console.error('[Orders] 寫入 Firestore 失敗', o.id, e.message));
  writeChains.set(o.id, next);
  return next;
}
async function loadOrders() {
  if (loaded) return;
  try {
    const db = await getDb();
    const since = Date.now() - 7 * 86400000;
    const snap = await db.collection(COLLECTION).where('updatedAt', '>=', since).get();
    snap.forEach((d: any) => orders.set(d.id, d.data() as SimOrder));
    const active = await db.collection(COLLECTION).where('status', 'in', ['QUEUED', 'WORKING', 'PARTIAL']).get();
    active.forEach((d: any) => orders.set(d.id, d.data() as SimOrder));
    loaded = true;
    console.log(`[Orders] 載入 ${orders.size} 筆委託`);
  } catch (e: any) {
    console.error('[Orders] 讀取 Firestore 失敗，稍後重試：', e.message);
  }
}

// ───────────────────────── 時間與交易盤 ─────────────────────────
function twParts(d: Date) {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d); // 2026-10-09 13:05
  const [date, time] = s.split(' ');
  const [h, m] = time.split(':').map(Number);
  return { date, hm: h * 100 + m };
}
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return twParts(d).date;
};
const isCash = (c: AssetCategory) => c === 'stocks' || c === 'etfs' || c === 'bonds' || c === 'warrants';
const STOCK_FUT_NIGHT_START = 1725;

export interface Session { open: boolean; key: string | null; date: string | null }

/** 這個商品「現在」屬於哪一盤；不在交易時段 open=false */
export function sessionFor(category: AssetCategory, symbol: string, now = new Date()): Session {
  const { date, hm } = twParts(now);
  const clock = getInstrumentTradingClock(symbol, category, now);
  if (!clock.isTradingNow) return { open: false, key: null, date: null };
  if (isCash(category)) {
    return hm >= 900 && hm < 1330 ? { open: true, key: `${date}C`, date } : { open: false, key: null, date: null };
  }
  if (hm >= 845 && hm < 1345) return { open: true, key: `${date}D`, date };
  const indexLike = category === 'options' || ['TX', 'MTX', 'TMF', 'TE', 'TF'].includes(deps.futuresCode(symbol));
  const nightStart = indexLike ? 1500 : STOCK_FUT_NIGHT_START;
  if (hm >= nightStart) return { open: true, key: `${date}N`, date };
  if (hm < 500) return { open: true, key: `${addDays(date, -1)}N`, date: addDays(date, -1) };
  return { open: false, key: null, date: null };
}

/** 某一盤的快照有效時間範圍（字串比較 'YYYY-MM-DD HH:MM'） */
function sessionWindow(key: string): [string, string] {
  const date = key.slice(0, 10);
  const kind = key.slice(10);
  if (kind === 'C') return [`${date} 09:00`, `${date} 23:59`];
  if (kind === 'D') return [`${date} 08:45`, `${date} 15:00`];
  return [`${date} 15:00`, `${addDays(date, 1)} 08:45`];
}
const inWindow = (tickAt: string, key: string) => {
  const t = tickAt.slice(0, 16);
  const [a, b] = sessionWindow(key);
  return t >= a && t < b;
};

// ───────────────────────── FinMind 即時快照 ─────────────────────────
type FeedKind = 'stock' | 'fut' | 'opt';
const feedCache = new Map<string, { at: number; map: Map<string, any> }>();
const FUT_PREFIX: Record<string, string> = { TX: 'TXF', MTX: 'MXF', TMF: 'TMF', TE: 'EXF', TF: 'FXF' };
const CALL_MONTH = 'ABCDEFGHIJKL';
const PUT_MONTH = 'MNOPQRSTUVWX';

async function fetchSnapshot(kind: FeedKind, dataId: string): Promise<Map<string, any> | null> {
  const token = deps.getToken();
  if (!token) return null;
  const path = kind === 'stock' ? 'taiwan_stock_tick_snapshot' : kind === 'fut' ? 'taiwan_futures_snapshot' : 'taiwan_options_snapshot';
  const url = `https://api.finmindtrade.com/api/v4/${path}${dataId ? `?data_id=${encodeURIComponent(dataId)}` : ''}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    if (!Array.isArray(json?.data)) throw new Error(json?.msg || '格式不符');
    const idField = kind === 'stock' ? 'stock_id' : kind === 'fut' ? 'futures_id' : 'options_id';
    const map = new Map<string, any>();
    for (const r of json.data) map.set(String(r[idField]).toUpperCase(), r);
    return map;
  } catch (e: any) {
    console.warn(`[Orders] FinMind 快照 ${path} ${dataId} 失敗：${e.message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function getFeed(kind: FeedKind, dataId: string, force = false): Promise<Map<string, any> | null> {
  const ck = `${kind}:${dataId}`;
  const ttl = kind === 'stock' ? 9_000 : 25_000;
  const hit = feedCache.get(ck);
  if (hit && !force && Date.now() - hit.at < ttl) return hit.map;
  const map = await fetchSnapshot(kind, dataId);
  if (map) feedCache.set(ck, { at: Date.now(), map });
  return map ?? hit?.map ?? null;
}

const num = (v: any) => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
};
function toQuote(r: any): Quote {
  const close = num(r.close);
  const chg = Number(r.change_price);
  return {
    bid: num(r.buy_price),
    bidVol: Number(r.buy_volume) || 0,
    ask: num(r.sell_price),
    askVol: Number(r.sell_volume) || 0,
    last: close,
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    totalVolume: Number(r.total_volume) || 0,
    refPrice: close != null && isFinite(chg) ? Number((close - chg).toFixed(4)) : null,
    tickAt: String(r.date || ''),
  };
}

function monthCode(contractMonth: string | null | undefined, letters: string): string | null {
  const m = String(contractMonth || '').match(/^(\d{4})(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return letters[month - 1] + m[1].slice(-1);
}

/** 決定快照代號；回傳 null 表示格式上就沒有快照可用 */
function resolveFeedKey(category: AssetCategory, symbol: string, contractMonth: string | null): { kind: FeedKind; dataId: string; key: string } | null {
  const sym = symbol.toUpperCase();
  if (isCash(category)) return { kind: 'stock', dataId: '', key: sym };
  if (category === 'futures') {
    const code = deps.futuresCode(sym);
    const prefix = FUT_PREFIX[code] || code;
    const mc = monthCode(contractMonth, CALL_MONTH);
    return { kind: 'fut', dataId: prefix, key: mc ? `${prefix}${mc}` : `${prefix}R1` };
  }
  if (category === 'options') {
    const m = sym.match(/^([A-Z]{2,4})-(\d+(?:\.\d+)?)-(C|P|CALL|PUT)$/);
    if (!m) return null;
    const isCall = m[3].startsWith('C');
    const mc = monthCode(contractMonth, isCall ? CALL_MONTH : PUT_MONTH);
    if (!mc) return null;
    return { kind: 'opt', dataId: m[1], key: `${m[1]}${Number(m[2])}${mc}` };
  }
  return null;
}
function feedSpec(o: Pick<SimOrder, 'feedKey' | 'category' | 'symbol'>): { kind: FeedKind; dataId: string; key: string } | null {
  if (!o.feedKey) return null;
  if (isCash(o.category)) return { kind: 'stock', dataId: '', key: o.feedKey };
  if (o.category === 'futures') return { kind: 'fut', dataId: o.feedKey.slice(0, -2), key: o.feedKey };
  return { kind: 'opt', dataId: o.feedKey.replace(/\d.*$/, ''), key: o.feedKey };
}
async function quoteFor(o: Pick<SimOrder, 'feedKey' | 'category' | 'symbol'>, force = false): Promise<Quote | null> {
  const spec = feedSpec(o);
  if (!spec) return null;
  const map = await getFeed(spec.kind, spec.dataId, force);
  const r = map?.get(spec.key);
  return r ? toQuote(r) : null;
}

// ───────────────────────── 委託生命週期 ─────────────────────────
let idCounter = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(idCounter++ % 1296).toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 5)}`;

function event(o: SimOrder, text: string, now = Date.now()): SimOrder {
  return { ...o, events: [...o.events, { at: now, text }], updatedAt: now };
}
function save(o: SimOrder) {
  orders.set(o.id, o);
  persist(o);
  return o;
}

/** 收盤價撮合需要的當日收盤價（伺服器日資料快取） */
function closeFor(o: SimOrder): number | null {
  const c = deps.getCachedQuote(o.symbol);
  if (!c || !o.sessionDate || c.date !== o.sessionDate) return null;
  return num(c.close21 ?? c.close ?? c.price);
}

async function processOrder(o: SimOrder, now: Date): Promise<SimOrder> {
  const ts = now.getTime();
  const sess = sessionFor(o.category, o.symbol, now);

  if (o.status === 'QUEUED') {
    if (!sess.open) return o;
    if (o.feed === 'eod' && sess.key!.endsWith('N')) return o; // 無快照商品等日盤
    o = event({ ...o, status: 'WORKING', sessionKey: sess.key, sessionDate: sess.date, baseline: null }, `${sess.key!.endsWith('N') ? '夜盤' : '開盤'}，預約單生效`, ts);
    (o as any)._opening = true;
  }

  const sessionOver = !sess.open || sess.key !== o.sessionKey;

  if (o.feed === 'snapshot') {
    const q = await quoteFor(o, sessionOver);
    if (q && o.sessionKey && inWindow(q.tickAt, o.sessionKey)) {
      const r = matchWorking(o, q, ledger, Boolean((o as any)._opening));
      o = applyFills({ ...o, baseline: r.baseline }, r.fills, ts, () => newId('F'));
    }
    delete (o as any)._opening;
    if (sessionOver && isActiveStatus(o.status)) {
      o = event({ ...o, status: 'EXPIRED' }, `收盤，未成交 ${remainingQty(o)} 失效${o.filledQty > 0 ? `（已成交 ${o.filledQty}）` : ''}`, ts);
    }
    return o;
  }

  // 收盤價撮合
  delete (o as any)._opening;
  if (!sessionOver) return o;
  const close = closeFor(o);
  if (close != null) {
    o = applyFills(o, matchAtClose(o, close), ts, () => newId('F'));
    if (isActiveStatus(o.status)) o = event({ ...o, status: 'EXPIRED' }, `收盤價 ${close} 未達委託價，未成交 ${remainingQty(o)} 失效`, ts);
  } else if (o.sessionDate && ts - new Date(`${o.sessionDate}T14:00:00+08:00`).getTime() > 36 * 3600000) {
    o = event({ ...o, status: 'EXPIRED' }, '查無 FinMind 當日收盤資料，委託失效', ts);
  }
  return o;
}

let ticking = false;
export async function runTick(): Promise<typeof lastTick> {
  if (ticking) return lastTick;
  ticking = true;
  let fills = 0;
  try {
    await loadOrders();
    const now = new Date();
    const active = [...orders.values()].filter(o => isActiveStatus(o.status));
    for (const o of active) {
      try {
        const before = JSON.stringify(o);
        const n = await processOrder(o, now);
        fills += n.fills.length - o.fills.length;
        if (JSON.stringify(n) !== before) save(n);
      } catch (e: any) {
        console.error('[Orders] 撮合錯誤', o.id, e.message);
      }
    }
    lastTick = { at: Date.now(), active: active.length, fills, error: '' };
  } catch (e: any) {
    lastTick = { ...lastTick, at: Date.now(), error: e.message };
  } finally {
    ticking = false;
  }
  return lastTick;
}

// ───────────────────────── 送單 ─────────────────────────
interface NewOrderBody {
  profileId: string;
  studentName: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction;
  intent: OrderIntent;
  positionId?: string | null;
  priceType: PriceType;
  tif: TimeInForce;
  limitPrice?: number | null;
  quantity: number;
  rationale?: string;
  multiplier: number;
  marginRequirement?: number | null;
  contractMonth?: string | null;
}

function maxQty(category: AssetCategory, priceType: PriceType) {
  if (category === 'futures' || category === 'options') return priceType === 'MARKET' ? 10 : 100;
  return 499;
}

export async function createOrder(b: NewOrderBody): Promise<{ order?: SimOrder; error?: string }> {
  await loadOrders();
  if (!b?.profileId || !b.symbol || !b.category || !b.action) return { error: '委託資料不完整' };
  if (!usesOrderBook(b.category)) return { error: '此商品不走委託簿' };
  const qty = Number(b.quantity);
  if (!Number.isInteger(qty) || qty <= 0) return { error: '數量必須是正整數' };
  const priceType: PriceType = b.priceType === 'MARKET' ? 'MARKET' : 'LIMIT';
  const tif: TimeInForce = b.tif === 'IOC' || b.tif === 'FOK' ? b.tif : 'ROD';
  if (qty > maxQty(b.category, priceType)) return { error: `單筆最多 ${maxQty(b.category, priceType)}${isCash(b.category) ? ' 張' : ' 口'}` };
  if (priceType === 'MARKET' && tif === 'ROD') return { error: '市價單請選 IOC 或 FOK' };

  const sym = b.symbol.toUpperCase();
  const cached = deps.getCachedQuote(sym);
  const contractMonth = b.contractMonth || cached?.contractMonth || null;
  const spec = resolveFeedKey(b.category, sym, contractMonth);
  let feed: 'snapshot' | 'eod' = 'eod';
  let q: Quote | null = null;
  if (spec) {
    const map = await getFeed(spec.kind, spec.dataId, true);
    const r = map?.get(spec.key);
    if (r) {
      feed = 'snapshot';
      q = toQuote(r);
    }
  }
  const refPrice = q?.refPrice ?? num(cached?.prevClose) ?? null;
  const limitPrice = priceType === 'LIMIT' ? Number(b.limitPrice) : null;
  if (priceType === 'LIMIT') {
    const err = validateLimitPrice(b.category, sym, limitPrice!, refPrice);
    if (err) return { error: err };
  }
  if (feed === 'eod' && (priceType !== 'LIMIT' || tif !== 'ROD')) {
    return { error: '此商品沒有盤中即時報價，只能下限價 ROD 單，收盤後以收盤價撮合' };
  }

  const now = new Date();
  const ts = now.getTime();
  const sess = sessionFor(b.category, sym, now);
  if (feed === 'eod' && sess.open && sess.key!.endsWith('N')) return { error: '此商品夜盤沒有即時報價，請於日盤下單' };

  const side = b.intent === 'CLOSE' ? closeSide(b.action) : openSide(b.action);
  let o: SimOrder = {
    id: newId('O'),
    profileId: String(b.profileId),
    studentName: String(b.studentName || ''),
    symbol: sym,
    name: String(b.name || sym),
    category: b.category,
    action: b.action,
    intent: b.intent === 'CLOSE' ? 'CLOSE' : 'OPEN',
    positionId: b.positionId ?? null,
    side,
    priceType,
    tif,
    limitPrice,
    quantity: qty,
    filledQty: 0,
    avgPrice: 0,
    status: 'WORKING',
    fills: [],
    feed,
    feedKey: feed === 'snapshot' ? spec!.key : null,
    sessionKey: sess.key,
    sessionDate: sess.date,
    baseline: null,
    multiplier: Number(b.multiplier) || 1,
    marginRequirement: b.marginRequirement != null ? Number(b.marginRequirement) : null,
    contractMonth,
    rationale: String(b.rationale || '').slice(0, 500),
    events: [],
    createdAt: ts,
    updatedAt: ts,
  };
  const priceText = priceType === 'MARKET' ? '市價' : `限價 ${limitPrice}`;
  o = event(o, `委託送出：${side === 'BUY' ? '買' : '賣'} ${qty} ${priceText} ${tif}${feed === 'eod' ? '（收盤價撮合）' : ''}`, ts);

  if (!sess.open) {
    if (priceType !== 'LIMIT' || tif !== 'ROD') return { error: '非交易時段只接受限價 ROD 預約單' };
    o = event({ ...o, status: 'QUEUED', sessionKey: null, sessionDate: null }, '非交易時段，轉為預約單，下一盤開盤生效', ts);
    return { order: save(o) };
  }

  const validQ = q && sess.key && inWindow(q.tickAt, sess.key) ? q : null;
  if (tif !== 'ROD') {
    const fills = validQ ? matchImmediate(o, validQ, ledger) : [];
    o = applyFills(o, fills, ts, () => newId('F'));
    if (o.status !== 'FILLED') {
      const left = remainingQty(o);
      o = event({ ...o, status: 'CANCELLED' }, validQ ? `${tif}：剩餘 ${left} 無對手價可成交，自動取消` : `${tif}：本盤尚無即時報價，自動取消`, ts);
    }
    return { order: save(o) };
  }

  if (feed === 'snapshot' && validQ) {
    o.baseline = { low: validQ.low, high: validQ.high, totalVolume: validQ.totalVolume, lastTickAt: validQ.tickAt };
    const r = matchWorking(o, validQ, ledger, false);
    o = applyFills({ ...o, baseline: r.baseline }, r.fills, ts, () => newId('F'));
  }
  ensureLoop();
  return { order: save(o) };
}

export function cancelOrder(id: string, profileId: string): { order?: SimOrder; error?: string } {
  const o = orders.get(id);
  if (!o || o.profileId !== profileId) return { error: '找不到這筆委託' };
  if (!isActiveStatus(o.status)) return { error: '這筆委託已結束，不能刪單' };
  const left = remainingQty(o);
  return { order: save(event({ ...o, status: 'CANCELLED' }, `刪單：取消未成交 ${left}`)) };
}

export async function modifyOrder(id: string, profileId: string, body: { limitPrice?: number; quantity?: number }) {
  const o = orders.get(id);
  if (!o || o.profileId !== profileId) return { error: '找不到這筆委託' };
  if (!isActiveStatus(o.status)) return { error: '這筆委託已結束，不能改單' };
  if (o.priceType !== 'LIMIT' || o.tif !== 'ROD') return { error: '只有限價 ROD 委託可以改單' };
  let n: SimOrder = { ...o };
  const notes: string[] = [];
  if (body.quantity != null) {
    const q = Number(body.quantity);
    if (!Number.isInteger(q) || q >= o.quantity || q <= o.filledQty) return { error: `改量只能減少，且須大於已成交 ${o.filledQty}` };
    n.quantity = q;
    notes.push(`減量為 ${q}`);
  }
  if (body.limitPrice != null && Number(body.limitPrice) !== o.limitPrice) {
    const p = Number(body.limitPrice);
    let ref: number | null = num(deps.getCachedQuote(o.symbol)?.prevClose);
    const q = o.feed === 'snapshot' ? await quoteFor(o, true) : null;
    if (q?.refPrice) ref = q.refPrice;
    const err = validateLimitPrice(o.category, o.symbol, p, ref);
    if (err) return { error: err };
    n.limitPrice = p;
    // 改價等同重新排隊：從現在的行情重新起算
    if (q && n.sessionKey && inWindow(q.tickAt, n.sessionKey)) {
      n.baseline = { low: q.low, high: q.high, totalVolume: q.totalVolume, lastTickAt: q.tickAt };
    }
    notes.push(`改價為 ${p}（重新排隊）`);
  }
  if (notes.length === 0) return { error: '沒有要修改的內容' };
  n = event(n, `改單：${notes.join('、')}`);
  if (n.feed === 'snapshot' && n.status !== 'QUEUED') {
    const q = await quoteFor(n);
    if (q && n.sessionKey && inWindow(q.tickAt, n.sessionKey)) {
      const r = matchWorking(n, q, ledger, false);
      n = applyFills({ ...n, baseline: r.baseline }, r.fills, Date.now(), () => newId('F'));
    }
  }
  return { order: save(n) };
}

/** 領取尚未記帳的成交回報（每筆只會給出一次） */
export function claimFills(profileId: string) {
  const out: any[] = [];
  for (const o of orders.values()) {
    if (o.profileId !== profileId || !o.fills.some(f => !f.claimed)) continue;
    const fresh = o.fills.filter(f => !f.claimed);
    for (const f of fresh) {
      out.push({
        orderId: o.id,
        fillId: f.id,
        symbol: o.symbol,
        name: o.name,
        category: o.category,
        action: o.action,
        intent: o.intent,
        positionId: o.positionId ?? null,
        side: o.side,
        qty: f.qty,
        price: f.price,
        at: f.at,
        reason: f.reason,
        multiplier: o.multiplier,
        marginRequirement: o.marginRequirement,
        rationale: o.rationale,
      });
    }
    save({ ...o, fills: o.fills.map(f => ({ ...f, claimed: true })) });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function listOrders(profileId: string) {
  return [...orders.values()]
    .filter(o => o.profileId === profileId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 150);
}

let loop: NodeJS.Timeout | null = null;
function ensureLoop() {
  if (loop) return;
  loop = setInterval(() => {
    if ([...orders.values()].some(o => isActiveStatus(o.status)) || !loaded) runTick();
  }, TICK_MS);
}

// ───────────────────────── 路由 ─────────────────────────
export function registerOrderRoutes(app: Express, d: OrderDeps) {
  deps = d;
  loadOrders().then(() => ensureLoop());

  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const r = await createOrder(req.body);
      if (r.error) return res.status(400).json({ error: r.error });
      res.json({ order: r.order });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get('/api/orders', async (req: Request, res: Response) => {
    await loadOrders();
    const profileId = String(req.query.profileId || '');
    if (!profileId) return res.status(400).json({ error: '缺少 profileId' });
    res.json({ orders: listOrders(profileId), serverTime: Date.now(), engine: lastTick });
  });
  app.post('/api/orders/claim', async (req: Request, res: Response) => {
    await loadOrders();
    const profileId = String(req.body?.profileId || '');
    if (!profileId) return res.status(400).json({ error: '缺少 profileId' });
    res.json({ fills: claimFills(profileId) });
  });
  app.post('/api/orders/:id/cancel', (req: Request, res: Response) => {
    const r = cancelOrder(String(req.params.id), String(req.body?.profileId || ''));
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ order: r.order });
  });
  app.post('/api/orders/:id/modify', async (req: Request, res: Response) => {
    const r = await modifyOrder(String(req.params.id), String(req.body?.profileId || ''), req.body || {});
    if ((r as any).error) return res.status(400).json({ error: (r as any).error });
    res.json({ order: (r as any).order });
  });
  // Cloud Scheduler 定時喚醒（收盤後的最後撮合與失效處理）
  app.get('/api/orders/tick', async (_req: Request, res: Response) => {
    res.json(await runTick());
  });
  app.get('/api/orders/session', (req: Request, res: Response) => {
    const s = sessionFor(String(req.query.category || 'stocks') as AssetCategory, String(req.query.symbol || '2330'));
    res.json(s);
  });
}
