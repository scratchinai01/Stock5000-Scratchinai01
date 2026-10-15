import type { OrderAction } from '../types/market';

/** 持倉的中文類別、報價幣別、單位（各畫面共用） */
const LABEL: Partial<Record<OrderAction, string>> = {
  BUY_STOCK: '現股買進',
  SHORT_SELL_STOCK: '融券放空',
  BUY_MARGIN_STOCK: '融資買進',
  BUY_BOND: '債券買進',
  BUY_ETF: 'ETF 買進',
  SHORT_SELL_ETF: 'ETF 融券放空',
  BUY_FUTURES_LONG: '期貨做多',
  SELL_FUTURES_SHORT: '期貨放空',
  BUY_CALL_OPTION: '買進買權',
  BUY_PUT_OPTION: '買進賣權',
  SELL_CALL_OPTION: '賣出買權',
  SELL_PUT_OPTION: '賣出賣權',
  BUY_CALL_WARRANT: '認購權證',
  BUY_PUT_WARRANT: '認售權證',
  BUY_US_STOCK: '美股買進',
  BUY_COMMODITY_LONG: '原物料做多',
  SELL_COMMODITY_SHORT: '原物料放空',
  BUY_CRYPTO: '加密貨幣買進',
  SHORT_SELL_CRYPTO: '加密貨幣放空',
  BUY_STABLECOIN: '美元穩定幣',
  BUY_TW_STABLECOIN: '新台幣穩定幣（教學示範）',
};
export const actionLabel = (a: OrderAction | string) => LABEL[a as OrderAction] || String(a);

export const isTwStableSymbol = (sym: string) => ['TWDT', 'TWDC'].includes(String(sym).toUpperCase());

/** 報價幣別：美股、原物料、加密貨幣（新台幣穩定幣除外）以美元報價 */
export const ccyOf = (p: { category: string; symbol: string }) =>
  p.category === 'us_stocks' || p.category === 'commodities' || (p.category === 'crypto' && !isTwStableSymbol(p.symbol)) ? 'US$ ' : 'NT$ ';

export const unitOfPos = (p: { category: string; symbol: string }) => {
  if (p.category === 'futures' || p.category === 'options' || p.category === 'commodities') return '口';
  if (p.category === 'us_stocks') return '股';
  if (p.category === 'crypto') {
    const s = String(p.symbol).toUpperCase();
    return ['USDT', 'USDC'].includes(s) || isTwStableSymbol(s) ? s : '枚';
  }
  return '張';
};
