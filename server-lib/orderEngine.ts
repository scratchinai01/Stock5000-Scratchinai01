/**
 * 模擬撮合引擎（純函式，不碰網路與資料庫，方便測試）
 *
 * 系統沒有真正的交易所委託簿，所以拿 即時快照的「真實」資料判定是否成交：
 *   1. 對手價成交：買單價 ≥ 最佳賣價（賣單價 ≤ 最佳買價）→ 以對手價成交，數量最多吃到該檔掛單量
 *   2. 價格穿越：委託之後市場有成交價「低於」買單價（高於賣單價）→ 依價格優先原則必定輪得到，以委託價成交，
 *      數量不超過委託後新增的成交量
 *   3. 開盤：預約單在開盤價 ≤ 買單價（≥ 賣單價）時以開盤價成交
 * 只「碰到」委託價（等於）不算成交，因為無法得知排隊順位。這是保守、可驗證的作法。
 *
 * 沒有盤中快照的商品（例如小台、部分股票期貨）改用「收盤價撮合」：收盤後以當日收盤價判定。
 */
import type { OrderAction, AssetCategory } from '../src/types/market';
import type { OrderSide, OrderIntent, OrderStatus, PriceType, TimeInForce } from '../src/utils/orderRules';

export interface Fill {
  id: string;
  qty: number;
  price: number;
  at: number;
  reason: string;
  claimed: boolean;
}

export interface Baseline {
  /** 委託生效時該盤的最低／最高價（null＝從開盤起算，例如預約單） */
  low: number | null;
  high: number | null;
  /** 上次檢查時的累計成交量與最近成交時間 */
  totalVolume: number;
  lastTickAt: string | null;
}

export interface SimOrder {
  id: string;
  profileId: string;
  studentName: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction; // 建倉：委託類別；平倉：原持倉的類別
  intent: OrderIntent;
  positionId?: string | null;
  side: OrderSide;
  priceType: PriceType;
  tif: TimeInForce;
  limitPrice: number | null;
  quantity: number;
  filledQty: number;
  avgPrice: number;
  status: OrderStatus;
  fills: Fill[];
  feed: 'snapshot' | 'eod';
  feedKey: string | null; // 快照代號，例如 2330、TXFJ6、TXO42000J6
  sessionKey: string | null; // 生效的交易盤別，例如 2026-10-09C、2026-10-09D、2026-10-08N
  sessionDate: string | null; // 收盤價撮合用的交易日
  baseline: Baseline | null;
  multiplier: number;
  marginRequirement: number | null;
  contractMonth: string | null;
  rationale: string;
  rejectReason?: string;
  events: { at: number; text: string }[];
  createdAt: number;
  updatedAt: number;
}

export interface Quote {
  bid: number | null;
  bidVol: number;
  ask: number | null;
  askVol: number;
  last: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  totalVolume: number;
  refPrice: number | null; // 參考價（昨收／昨結）
  tickAt: string; // 快照中的最近成交時間
}

export interface MatchResult {
  fills: { qty: number; price: number; reason: string }[];
  baseline: Baseline;
}

const pos = (v: number | null | undefined): v is number => typeof v === 'number' && v > 0 && isFinite(v);

/** 同一檔掛單在同一張快照內只能被吃一次（跨所有學生共用） */
export class LiquidityLedger {
  private taken = new Map<string, number>();
  key(feedKey: string, side: 'bid' | 'ask', price: number, tickAt: string) {
    return `${feedKey}|${side}|${price}|${tickAt}`;
  }
  available(k: string, displayed: number) {
    return Math.max(0, displayed - (this.taken.get(k) || 0));
  }
  take(k: string, qty: number) {
    this.taken.set(k, (this.taken.get(k) || 0) + qty);
    if (this.taken.size > 5000) {
      const first = this.taken.keys().next().value;
      if (first !== undefined) this.taken.delete(first);
    }
  }
}

export const remainingQty = (o: SimOrder) => Math.max(0, o.quantity - o.filledQty);

/** 對手價可成交數量（不改變狀態） */
export function marketableAvailable(o: SimOrder, q: Quote, ledger: LiquidityLedger): { price: number; qty: number; key: string } | null {
  if (o.side === 'BUY') {
    if (!pos(q.ask) || q.askVol <= 0) return null;
    if (o.priceType === 'LIMIT' && !(o.limitPrice! >= q.ask)) return null;
    const key = ledger.key(o.feedKey || o.symbol, 'ask', q.ask, q.tickAt);
    return { price: q.ask, qty: ledger.available(key, q.askVol), key };
  }
  if (!pos(q.bid) || q.bidVol <= 0) return null;
  if (o.priceType === 'LIMIT' && !(o.limitPrice! <= q.bid)) return null;
  const key = ledger.key(o.feedKey || o.symbol, 'bid', q.bid, q.tickAt);
  return { price: q.bid, qty: ledger.available(key, q.bidVol), key };
}

/**
 * 一般撮合週期（ROD 限價單）。
 * @param opening 這是預約單開盤後第一次檢查
 */
export function matchWorking(o: SimOrder, q: Quote, ledger: LiquidityLedger, opening: boolean): MatchResult {
  const fills: MatchResult['fills'] = [];
  let remaining = remainingQty(o);
  const base: Baseline = o.baseline
    ? { ...o.baseline }
    : { low: null, high: null, totalVolume: 0, lastTickAt: null };
  const limit = o.limitPrice;
  const isBuy = o.side === 'BUY';

  // 1) 開盤價（預約單）
  if (opening && remaining > 0 && pos(q.open) && limit != null) {
    if ((isBuy && q.open <= limit) || (!isBuy && q.open >= limit)) {
      fills.push({ qty: remaining, price: q.open, reason: '開盤價成交' });
      remaining = 0;
    }
  }

  // 2) 價格穿越：委託之後出現比委託價更好的成交 → 依價格優先必定輪到
  if (remaining > 0 && limit != null) {
    const volSince = Math.max(0, q.totalVolume - base.totalVolume);
    const newTrade = q.tickAt !== base.lastTickAt;
    let through = false;
    if (isBuy) {
      const ref = base.low == null ? limit : Math.min(limit, base.low);
      if (pos(q.low) && q.low < ref) through = true; // 委託後創新低且低於委託價
      if (newTrade && pos(q.last) && q.last < limit) through = true; // 最新一筆成交低於委託價
    } else {
      const ref = base.high == null ? limit : Math.max(limit, base.high);
      if (pos(q.high) && q.high > ref) through = true;
      if (newTrade && pos(q.last) && q.last > limit) through = true;
    }
    if (through && volSince > 0) {
      const qty = Math.min(remaining, volSince);
      fills.push({ qty, price: limit, reason: '市場成交價穿越委託價' });
      remaining -= qty;
    }
  }

  // 3) 對手價：最佳賣價 ≤ 買單價（最佳買價 ≥ 賣單價）
  if (remaining > 0) {
    const m = marketableAvailable(o, q, ledger);
    if (m && m.qty > 0) {
      const qty = Math.min(remaining, m.qty);
      ledger.take(m.key, qty);
      fills.push({ qty, price: m.price, reason: '對手價成交' });
      remaining -= qty;
    }
  }

  const nextBase: Baseline = {
    low: pos(q.low) ? (base.low == null ? q.low : Math.min(base.low, q.low)) : base.low,
    high: pos(q.high) ? (base.high == null ? q.high : Math.max(base.high, q.high)) : base.high,
    totalVolume: Math.max(base.totalVolume, q.totalVolume),
    lastTickAt: q.tickAt,
  };
  return { fills, baseline: nextBase };
}

/** 送單當下：IOC／FOK／市價單只看這一刻的對手價 */
export function matchImmediate(o: SimOrder, q: Quote, ledger: LiquidityLedger): MatchResult['fills'] {
  const m = marketableAvailable(o, q, ledger);
  const want = remainingQty(o);
  if (!m || m.qty <= 0) return [];
  if (o.tif === 'FOK' && m.qty < want) return [];
  const qty = Math.min(want, m.qty);
  ledger.take(m.key, qty);
  return [{ qty, price: m.price, reason: o.priceType === 'MARKET' ? '市價單以對手價成交' : '對手價成交' }];
}

/** 收盤價撮合（沒有盤中快照的商品） */
export function matchAtClose(o: SimOrder, close: number): MatchResult['fills'] {
  const want = remainingQty(o);
  if (want <= 0 || !pos(close) || o.limitPrice == null) return [];
  if (o.side === 'BUY' ? close <= o.limitPrice : close >= o.limitPrice) {
    return [{ qty: want, price: close, reason: '收盤價撮合成交' }];
  }
  return [];
}

/** 套用成交（回傳新的委託物件） */
export function applyFills(o: SimOrder, fills: MatchResult['fills'], now: number, idSeed: () => string): SimOrder {
  if (fills.length === 0) return o;
  let filledQty = o.filledQty;
  let notional = o.avgPrice * o.filledQty;
  const newFills: Fill[] = [];
  const events = [...o.events];
  for (const f of fills) {
    if (f.qty <= 0) continue;
    filledQty += f.qty;
    notional += f.qty * f.price;
    newFills.push({ id: idSeed(), qty: f.qty, price: f.price, at: now, reason: f.reason, claimed: false });
    events.push({ at: now, text: `${f.reason}：${f.qty} @ ${f.price}` });
  }
  const status: OrderStatus = filledQty >= o.quantity ? 'FILLED' : filledQty > 0 ? 'PARTIAL' : o.status;
  return {
    ...o,
    filledQty,
    avgPrice: filledQty > 0 ? Number((notional / filledQty).toFixed(4)) : 0,
    fills: [...o.fills, ...newFills],
    status,
    events,
    updatedAt: now,
  };
}
