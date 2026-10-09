/**
 * 帳務：把一筆成交記入學生帳戶（純函式，不直接寫 state 或資料庫）
 * 建倉與平倉共用；平倉支援部分數量。
 */
import type { AssetCategory, ImmutableTransaction, InstrumentSpec, OrderAction, Position, StudentProfile, TradeRecord } from '../types/market';
import { computeOrderCost } from './orderMath';
import { positionPnL } from './orderRules';
import { getOrGeneratePermanentUID, CURRENT_SCHEMA_VERSION } from '../services/firebase';
import { getSystemDateTimeStr } from './dateUtils';

export interface FillInput {
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction; // 建倉：委託類別；平倉：持倉類別
  price: number;
  qty: number;
  multiplier: number;
  marginRequirement?: number | null;
  rationale?: string;
  label?: string; // 例如「委託成交」「即時成交」
  ref?: string; // 委託單號
  positionId?: string | null;
  /** 直接指定金額（舊流程沿用前端算好的值） */
  totalAmountOrMargin?: number;
  notionalValue?: number;
}

export function usesMargin(category: AssetCategory, action: OrderAction) {
  return (
    category === 'futures' ||
    category === 'commodities' ||
    action === 'SELL_CALL_OPTION' ||
    action === 'SELL_PUT_OPTION' ||
    action === 'SHORT_SELL_STOCK' ||
    action === 'SHORT_SELL_ETF' ||
    action === 'SHORT_SELL_CRYPTO' ||
    action === 'BUY_COMMODITY_LONG' ||
    action === 'SELL_COMMODITY_SHORT'
  );
}

const rid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
const timeOnly = (dt: string) => dt.split(' ')[1] || new Date().toLocaleTimeString('zh-TW', { hour12: false });

export function costOf(f: FillInput) {
  if (f.totalAmountOrMargin != null && f.notionalValue != null) {
    return { totalCostOrMargin: f.totalAmountOrMargin, notionalValue: f.notionalValue };
  }
  const spec = { symbol: f.symbol, category: f.category, multiplier: f.multiplier, marginRequirement: f.marginRequirement ?? undefined } as InstrumentSpec;
  const r = computeOrderCost(spec, f.action, f.price, f.qty);
  return { totalCostOrMargin: r.totalCostOrMargin, notionalValue: r.notionalValue };
}

export function applyOpenFill(prof: StudentProfile, f: FillInput): { profile: StudentProfile; tx: ImmutableTransaction } {
  const dt = getSystemDateTimeStr();
  const margin = usesMargin(f.category, f.action);
  const { totalCostOrMargin, notionalValue } = costOf(f);
  const uid = prof.uid || getOrGeneratePermanentUID(prof.studentName);
  const label = f.label || '委託成交';

  const tx: ImmutableTransaction = {
    transactionId: rid('TX'),
    uid,
    studentName: prof.studentName,
    symbol: f.symbol,
    name: f.name,
    category: f.category,
    side: f.action.startsWith('BUY') ? 'BUY' : 'SHORT',
    orderType: f.action,
    price: f.price,
    quantity: f.qty,
    amount: totalCostOrMargin,
    marginUsed: margin ? totalCostOrMargin : 0,
    timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
    status: 'FILLED',
    rationale: f.rationale || '模擬委託成交',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: Date.now(),
  };
  const record: TradeRecord = {
    id: rid('trade'),
    timestamp: timeOnly(dt),
    dateLabel: `${dt} (${label}${f.ref ? ` ${f.ref}` : ''})`,
    symbol: f.symbol,
    name: f.name,
    category: f.category,
    action: f.action,
    price: f.price,
    quantity: f.qty,
    amount: totalCostOrMargin,
    marginUsed: margin ? totalCostOrMargin : 0,
    realizedPnL: 0,
    rationale: f.rationale || '',
  };

  const positions = prof.positions || [];
  const idx = positions.findIndex(p => p.symbol === f.symbol && p.orderType === f.action);
  let next: Position[];
  if (idx >= 0) {
    const ex = positions[idx];
    const q = ex.quantity + f.qty;
    const entry = q > 0 ? Number(((ex.entryPrice * ex.quantity + f.price * f.qty) / q).toFixed(4)) : f.price;
    next = positions.map((p, i) =>
      i === idx ? { ...ex, quantity: q, entryPrice: entry, totalCostOrMargin: ex.totalCostOrMargin + totalCostOrMargin, notionalValue: ex.currentPrice * q * f.multiplier } : p
    );
  } else {
    next = [
      ...positions,
      {
        id: rid('pos'),
        symbol: f.symbol,
        name: f.name,
        category: f.category,
        orderType: f.action,
        entryDate: dt,
        entryPrice: f.price,
        quantity: f.qty,
        unitMultiplier: f.multiplier,
        currentPrice: f.price,
        totalCostOrMargin,
        notionalValue,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        marginRequirement: margin ? totalCostOrMargin : 0,
        notes: f.rationale,
      },
    ];
  }

  return {
    tx,
    profile: {
      ...prof,
      uid,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      availableCash: prof.availableCash - totalCostOrMargin,
      marginDeposits: prof.marginDeposits + (margin ? totalCostOrMargin : 0),
      positions: next,
      tradeHistory: [record, ...(prof.tradeHistory || [])],
      immutableTransactions: [tx, ...(prof.immutableTransactions || [])],
      updatedAt: Date.now(),
    },
  };
}

/** 平倉（可部分）；找不到持倉回傳 null */
export function applyCloseFill(
  prof: StudentProfile,
  f: { positionId?: string | null; symbol: string; action: OrderAction; price: number; qty: number; label?: string; ref?: string; rationale?: string }
): { profile: StudentProfile; tx: ImmutableTransaction; realized: number; qty: number } | null {
  const positions = prof.positions || [];
  const pos =
    positions.find(p => p.id === f.positionId) || positions.find(p => p.symbol === f.symbol && p.orderType === f.action);
  if (!pos) return null;
  const qty = Math.min(f.qty, pos.quantity);
  if (qty <= 0) return null;
  const ratio = qty / pos.quantity;
  const released = pos.totalCostOrMargin * ratio;
  const realized = positionPnL(pos.orderType, pos.entryPrice, f.price, qty, pos.unitMultiplier);
  const refund = released + realized;
  const margin = usesMargin(pos.category, pos.orderType);
  const uid = prof.uid || getOrGeneratePermanentUID(prof.studentName);
  const dt = getSystemDateTimeStr();
  const label = f.label || '平倉成交';

  const tx: ImmutableTransaction = {
    transactionId: rid('TX_CLOSE'),
    uid,
    studentName: prof.studentName,
    symbol: pos.symbol,
    name: pos.name,
    category: pos.category,
    side: pos.orderType.startsWith('BUY') ? 'SELL' : 'COVER',
    orderType: 'CLOSE_POSITION',
    price: f.price,
    quantity: qty,
    amount: refund,
    marginUsed: 0,
    timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
    status: 'FILLED',
    rationale: f.rationale || `平倉 ${pos.name} (${pos.symbol}) ${qty}，實現損益 NT$ ${Math.round(realized).toLocaleString()}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: Date.now(),
  };
  const record: TradeRecord = {
    id: rid('close'),
    timestamp: timeOnly(dt),
    dateLabel: `${dt} (${label}${f.ref ? ` ${f.ref}` : ''})`,
    symbol: pos.symbol,
    name: pos.name,
    category: pos.category,
    action: pos.orderType,
    price: f.price,
    quantity: qty,
    amount: refund,
    marginUsed: 0,
    realizedPnL: realized,
    rationale: `平倉 ${pos.symbol} ${qty}，回收 NT$ ${Math.round(refund).toLocaleString()}`,
  };

  const remaining = pos.quantity - qty;
  const nextPositions =
    remaining > 0
      ? positions.map(p =>
          p.id === pos.id
            ? {
                ...p,
                quantity: remaining,
                totalCostOrMargin: p.totalCostOrMargin - released,
                marginRequirement: margin ? (p.marginRequirement || 0) * (remaining / pos.quantity) : p.marginRequirement,
                notionalValue: p.currentPrice * remaining * p.unitMultiplier,
                unrealizedPnL: positionPnL(p.orderType, p.entryPrice, p.currentPrice, remaining, p.unitMultiplier),
              }
            : p
        )
      : positions.filter(p => p.id !== pos.id);

  const prior = prof.realizedPnL ?? (prof.tradeHistory || []).reduce((a, h) => a + (h.realizedPnL || 0), 0);
  return {
    tx,
    realized,
    qty,
    profile: {
      ...prof,
      uid,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      availableCash: prof.availableCash + refund,
      marginDeposits: Math.max(0, prof.marginDeposits - (margin ? released : 0)),
      positions: nextPositions,
      tradeHistory: [record, ...(prof.tradeHistory || [])],
      immutableTransactions: [tx, ...(prof.immutableTransactions || [])],
      realizedPnL: prior + realized,
      cumulativeRealizedPnL: prior + realized,
      updatedAt: Date.now(),
    },
  };
}
