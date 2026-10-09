/**
 * 委託規則（前端與伺服器共用）
 * - 升降單位（跳動點）、漲跌停、買賣方向、損益計算
 * 依證交所與期交所現行規則；只處理本系統有的商品類別。
 */
import type { AssetCategory, OrderAction } from '../types/market';

export type PriceType = 'LIMIT' | 'MARKET';
export type TimeInForce = 'ROD' | 'IOC' | 'FOK';
export type OrderSide = 'BUY' | 'SELL';
export type OrderIntent = 'OPEN' | 'CLOSE';
export type OrderStatus = 'QUEUED' | 'WORKING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';

/** 走委託簿撮合的商品（台灣市場）；其他（美股、加密、原物料）維持原本的即時成交 */
export const ORDER_BOOK_CATEGORIES: AssetCategory[] = ['stocks', 'etfs', 'bonds', 'warrants', 'futures', 'options'];
export const usesOrderBook = (category: AssetCategory) => ORDER_BOOK_CATEGORIES.includes(category);

export const STATUS_LABEL: Record<OrderStatus, string> = {
  QUEUED: '預約單',
  WORKING: '委託中',
  PARTIAL: '部分成交',
  FILLED: '完全成交',
  CANCELLED: '已刪單',
  EXPIRED: '未成交失效',
  REJECTED: '退單',
};
export const TIF_LABEL: Record<TimeInForce, string> = {
  ROD: 'ROD 當日有效',
  IOC: 'IOC 立即成交否則取消',
  FOK: 'FOK 全部成交否則取消',
};
export const isActiveStatus = (s: OrderStatus) => s === 'QUEUED' || s === 'WORKING' || s === 'PARTIAL';

/** 建倉委託的買賣方向（以「這個合約」來看） */
export function openSide(action: OrderAction): OrderSide {
  return action.startsWith('BUY') ? 'BUY' : 'SELL';
}
/** 平倉委託方向＝建倉的反方向 */
export function closeSide(positionAction: OrderAction): OrderSide {
  return openSide(positionAction) === 'BUY' ? 'SELL' : 'BUY';
}

/** 持倉損益方向：買進（含買進賣權、認售權證）賺價差 +1；放空、賣方 −1 */
export function pnlDirection(orderType: OrderAction): 1 | -1 {
  return orderType.startsWith('BUY') ? 1 : -1;
}
function fxFactor(orderType: OrderAction): number {
  if (orderType === 'BUY_COMMODITY_LONG' || orderType === 'SELL_COMMODITY_SHORT') return 32.0;
  if (orderType === 'BUY_CRYPTO' || orderType === 'SHORT_SELL_CRYPTO' || orderType === 'BUY_STABLECOIN') return 32.5;
  return 1;
}
export function positionPnL(orderType: OrderAction, entry: number, price: number, qty: number, multiplier: number): number {
  const m = orderType === 'BUY_STABLECOIN' ? 1 : multiplier;
  return (price - entry) * pnlDirection(orderType) * qty * m * fxFactor(orderType);
}

const FUT_CODE: Record<string, string> = {
  TX: 'TX', MTX: 'MTX', TMF: 'TMF', ZE: 'TE', ZF: 'TF', TE: 'TE', TF: 'TF',
};

/** 升降單位 */
export function tickSize(category: AssetCategory, symbol: string, price: number): number {
  const p = Math.abs(price);
  if (category === 'etfs' || category === 'bonds') return p < 50 ? 0.01 : 0.05;
  if (category === 'warrants') {
    if (p < 5) return 0.01;
    if (p < 10) return 0.05;
    if (p < 50) return 0.1;
    if (p < 100) return 0.5;
    if (p < 500) return 1;
    return 5;
  }
  if (category === 'options') {
    if (p < 10) return 0.1;
    if (p < 50) return 0.5;
    if (p < 500) return 1;
    if (p < 1000) return 5;
    return 10;
  }
  if (category === 'futures') {
    const code = FUT_CODE[symbol.toUpperCase()];
    if (code === 'TX' || code === 'MTX' || code === 'TMF') return 1;
    if (code === 'TE') return 0.05;
    if (code === 'TF') return 0.2;
    // 股票期貨：與現股相同的級距
  }
  if (category === 'us_stocks') return 0.01;
  if (category === 'crypto') return p < 10 ? 0.0001 : p < 1000 ? 0.01 : 0.1;
  if (p < 10) return 0.01;
  if (p < 50) return 0.05;
  if (p < 100) return 0.1;
  if (p < 500) return 0.5;
  if (p < 1000) return 1;
  return 5;
}

const EPS = 1e-9;
export const roundPrice = (v: number) => Number(v.toFixed(4));

export function isOnTick(category: AssetCategory, symbol: string, price: number): boolean {
  const t = tickSize(category, symbol, price);
  const n = price / t;
  return Math.abs(n - Math.round(n)) < 1e-6;
}
export function roundToTick(category: AssetCategory, symbol: string, price: number, mode: 'nearest' | 'down' | 'up' = 'nearest'): number {
  const t = tickSize(category, symbol, price);
  const n = price / t;
  const k = mode === 'down' ? Math.floor(n + EPS) : mode === 'up' ? Math.ceil(n - EPS) : Math.round(n);
  return roundPrice(k * t);
}
/** 往上／往下跳 n 檔（跨級距時用新價位的升降單位） */
export function stepTick(category: AssetCategory, symbol: string, price: number, steps: number): number {
  let p = price;
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i++) {
    const t = dir > 0 ? tickSize(category, symbol, p + EPS) : tickSize(category, symbol, p - EPS);
    p = roundPrice(p + dir * t);
  }
  return p;
}

/** 漲跌停價（現股、ETF、債券 ETF、期貨 ±10%）；權證、選擇權不在此檢查，回傳 null */
export function priceLimits(category: AssetCategory, symbol: string, refPrice: number): { up: number; down: number } | null {
  if (!(refPrice > 0)) return null;
  if (!(category === 'stocks' || category === 'etfs' || category === 'bonds' || category === 'futures')) return null;
  return {
    up: roundToTick(category, symbol, refPrice * 1.1, 'down'),
    down: roundToTick(category, symbol, refPrice * 0.9, 'up'),
  };
}

/** 委託價格檢查：回傳錯誤訊息或 null */
export function validateLimitPrice(category: AssetCategory, symbol: string, price: number, refPrice: number | null): string | null {
  if (!(price > 0)) return '委託價格必須大於 0';
  if (!isOnTick(category, symbol, price)) {
    return `價格不符升降單位（此價位每檔 ${tickSize(category, symbol, price)}）`;
  }
  const lim = refPrice ? priceLimits(category, symbol, refPrice) : null;
  if (lim && (price > lim.up + EPS || price < lim.down - EPS)) {
    return `超出漲跌停範圍（跌停 ${lim.down}～漲停 ${lim.up}）`;
  }
  return null;
}
