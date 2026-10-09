import { InstrumentSpec, OrderAction } from '../types/market';

/**
 * 下單金額與保證金計算（電腦版 TradingModal 與手機版共用同一套規則）
 */
export function contractMultiplier(inst: InstrumentSpec): number {
  return inst.multiplier || (inst.category === 'us_stocks' ? 32 : 1000);
}

export function computeOrderCost(
  inst: InstrumentSpec,
  action: OrderAction,
  price: number,
  quantity: number
): { totalCostOrMargin: number; notionalValue: number; multiplier: number } {
  const multiplier = contractMultiplier(inst);
  let totalCostOrMargin = 0;
  let notionalValue = price * multiplier * quantity;

  if (inst.category === 'commodities') {
    const marginPerContract = inst.marginRequirement || 50000;
    totalCostOrMargin = marginPerContract * quantity;
    notionalValue = price * multiplier * 32.0 * quantity;
  } else if (inst.category === 'crypto') {
    const sym = inst.symbol.toUpperCase();
    const isTwStable = sym === 'TWDT' || sym === 'TWDC';
    const rate = isTwStable ? 1.0 : 32.5;
    notionalValue = price * (multiplier || 1) * rate * quantity;
    totalCostOrMargin = action === 'SHORT_SELL_CRYPTO' ? notionalValue * 0.5 : notionalValue;
  } else if (inst.category === 'us_stocks') {
    totalCostOrMargin = notionalValue;
  } else if (inst.category === 'stocks') {
    if (action === 'BUY_STOCK') totalCostOrMargin = notionalValue;
    else if (action === 'BUY_MARGIN_STOCK') totalCostOrMargin = notionalValue * 0.4;
    else if (action === 'SHORT_SELL_STOCK') totalCostOrMargin = notionalValue * 0.9;
  } else if (inst.category === 'bonds' || inst.category === 'etfs') {
    totalCostOrMargin = action === 'SHORT_SELL_ETF' ? notionalValue * 0.9 : notionalValue;
  } else if (inst.category === 'futures') {
    const marginPerContract = inst.marginRequirement || price * multiplier * 0.135;
    totalCostOrMargin = marginPerContract * quantity;
  } else if (inst.category === 'options') {
    totalCostOrMargin =
      action === 'SELL_CALL_OPTION' || action === 'SELL_PUT_OPTION'
        ? (inst.marginRequirement || 65000) * quantity
        : price * multiplier * quantity;
  } else if (inst.category === 'warrants') {
    totalCostOrMargin = price * multiplier * quantity;
  }
  return { totalCostOrMargin, notionalValue, multiplier };
}

/** 升降單位（跳動點） */
export function tickSize(inst: InstrumentSpec, price: number): number {
  if (inst.category === 'crypto') {
    const sym = inst.symbol.toUpperCase();
    if (sym === 'TWDT' || sym === 'TWDC' || sym === 'USDT' || sym === 'USDC') return 0.0001;
    return price < 10 ? 0.01 : price < 1000 ? 0.1 : 1;
  }
  if (inst.category === 'us_stocks') return 0.1;
  if (inst.category === 'futures') return 1;
  if (inst.category === 'options') return price < 10 ? 0.1 : price < 50 ? 0.5 : 1;
  if (inst.category === 'warrants') return price < 5 ? 0.01 : 0.05;
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1000) return 1;
  return 5;
}

/** 手機版「買進／賣出」兩個大按鈕對應的委託類別；不支援的商品回傳 null，改用完整下單 */
export function simpleActions(inst: InstrumentSpec): { buy: OrderAction; sell: OrderAction; unit: string } | null {
  switch (inst.category) {
    case 'stocks':
      return { buy: 'BUY_STOCK', sell: 'SHORT_SELL_STOCK', unit: '張' };
    case 'etfs':
      return { buy: 'BUY_ETF', sell: 'SHORT_SELL_ETF', unit: '張' };
    case 'bonds':
      return { buy: 'BUY_BOND', sell: 'SHORT_SELL_ETF', unit: '張' };
    case 'futures':
      return { buy: 'BUY_FUTURES_LONG', sell: 'SELL_FUTURES_SHORT', unit: '口' };
    default:
      return null;
  }
}

export const ACTION_LABEL: Partial<Record<OrderAction, string>> = {
  BUY_STOCK: '現股買進',
  SHORT_SELL_STOCK: '融券賣出（放空）',
  BUY_ETF: 'ETF 買進',
  SHORT_SELL_ETF: '融券賣出（放空）',
  BUY_BOND: '債券 ETF 買進',
  BUY_FUTURES_LONG: '期貨買進（做多）',
  SELL_FUTURES_SHORT: '期貨賣出（放空）',
};

/** 這筆持倉是不是「多方」（價格上漲賺錢） */
export function isLongPosition(orderType: OrderAction): boolean {
  return !(
    orderType === 'SHORT_SELL_STOCK' ||
    orderType === 'SHORT_SELL_ETF' ||
    orderType === 'SELL_FUTURES_SHORT' ||
    orderType === 'SHORT_SELL_CRYPTO' ||
    orderType === 'SELL_COMMODITY_SHORT' ||
    orderType === 'SELL_CALL_OPTION' ||
    orderType === 'BUY_PUT_OPTION' ||
    orderType === 'BUY_PUT_WARRANT'
  );
}
