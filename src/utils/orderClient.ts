import type { InstrumentSpec } from '../types/market';
import type { ClientOrder } from '../hooks/useOrderBook';
import { computeOrderCost } from './orderMath';
import { isActiveStatus, STATUS_LABEL } from './orderRules';

/** 未成交建倉委託預先圈存的額度（市價單以現價上浮 10% 估算，比照券商以漲停價圈存） */
export function reservedAmount(orders: ClientOrder[], instruments: InstrumentSpec[]): number {
  let sum = 0;
  for (const o of orders) {
    if (o.intent !== 'OPEN' || !isActiveStatus(o.status)) continue;
    const left = o.quantity - o.filledQty;
    if (left <= 0) continue;
    const inst =
      instruments.find(i => i.symbol === o.symbol) ||
      ({ symbol: o.symbol, category: o.category, multiplier: o.multiplier, marginRequirement: o.marginRequirement ?? undefined, price: o.limitPrice || 0 } as InstrumentSpec);
    const px = o.limitPrice ?? inst.price * 1.1;
    sum += computeOrderCost(inst, o.action, px, left).totalCostOrMargin;
  }
  return sum;
}

/** 某筆持倉已掛出、尚未成交的平倉數量 */
export function pendingCloseQty(orders: ClientOrder[], positionId: string): number {
  return orders
    .filter(o => o.intent === 'CLOSE' && o.positionId === positionId && isActiveStatus(o.status))
    .reduce((s, o) => s + (o.quantity - o.filledQty), 0);
}

export function describeOrder(o: ClientOrder): string {
  const unit = o.category === 'futures' || o.category === 'options' ? '口' : '張';
  if (o.status === 'FILLED') return `已成交 ${o.filledQty} ${unit}，均價 ${o.avgPrice}`;
  if (o.status === 'PARTIAL') return `部分成交 ${o.filledQty}／${o.quantity} ${unit}，其餘委託中`;
  if (o.status === 'WORKING') return `委託成功，等待成交（${o.priceType === 'MARKET' ? '市價' : `限價 ${o.limitPrice}`} ${o.tif}）`;
  if (o.status === 'QUEUED') return '非交易時段，已轉為預約單，下一盤開盤生效';
  const last = o.events[o.events.length - 1]?.text;
  return `${STATUS_LABEL[o.status]}${last ? `：${last}` : ''}`;
}
