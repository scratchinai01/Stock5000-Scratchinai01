import type { Position, StudentProfile } from '../types/market';
import { getUsdTwd } from './fx';

/**
 * 資產淨值（全系統共用同一個算法）
 * 下單時現金扣掉的就是 totalCostOrMargin（現股全額、融資自備款、融券／期貨／原物料／放空的保證金、
 * 選擇權權利金…），所以每個部位的「權益」= 投入的錢 + 未實現損益；淨值 = 可用現金 + 所有部位權益。
 * 不能用名目市值（notionalValue）：期貨、融資、放空的名目金額不是你的錢，現股的名目市值又已含損益，會重複計算。
 */
export const positionEquity = (p: Pick<Position, 'totalCostOrMargin' | 'unrealizedPnL'>) =>
  (Number(p.totalCostOrMargin) || 0) + (Number(p.unrealizedPnL) || 0);

export function computeNav(profile: Pick<StudentProfile, 'availableCash' | 'initialCapital' | 'positions'>) {
  const cash = typeof profile.availableCash === 'number' ? profile.availableCash : 50_000_000;
  const initialCapital = profile.initialCapital || 50_000_000;
  let invested = 0;
  let unrealized = 0;
  for (const p of profile.positions || []) {
    invested += Number(p.totalCostOrMargin) || 0;
    unrealized += Number(p.unrealizedPnL) || 0;
  }
  const netAssetValue = cash + invested + unrealized;
  return { cash, invested, unrealized, netAssetValue, initialCapital, totalReturnPct: ((netAssetValue - initialCapital) / initialCapital) * 100 };
}

/** 名目市值（新台幣）：原物料、加密貨幣以美元報價，要乘匯率；美股的乘數本身就是匯率 */
export function twdNotional(p: Pick<Position, 'category' | 'symbol' | 'quantity' | 'unitMultiplier'>, price: number) {
  const sym = String(p.symbol || '').toUpperCase();
  const usd = p.category === 'commodities' || (p.category === 'crypto' && sym !== 'TWDT' && sym !== 'TWDC');
  return price * p.quantity * (p.unitMultiplier || 1) * (usd ? getUsdTwd() : 1);
}
