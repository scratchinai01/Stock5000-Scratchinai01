import assert from 'node:assert/strict';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent.json';
let NOW = new Date('2026-10-08T10:00:00+08:00').getTime();
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a: any[]) { super(...(a.length ? a : [NOW]) as []); } static now() { return NOW; } }
(globalThis as any).Date = FakeDate;

let stock: any = { stock_id: '2330', buy_price: 2545, buy_volume: 50, sell_price: 2550, sell_volume: 3, close: 2550, change_price: -35, open: 2560, high: 2570, low: 2545, total_volume: 1000, date: '2026-10-08 09:59:58' };
let fut: any[] = [];
(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  let data: any[] = [];
  if (u.includes('taiwan_stock_tick_snapshot')) data = [stock];
  else if (u.includes('taiwan_futures_snapshot')) data = fut;
  return { ok: true, json: async () => ({ msg: 'success', data }) } as any;
};
const mod = await import('../server-lib/orders');
const cache: Record<string, any> = { MTX: { close21: 48700, prevClose: 49300, date: '2026-10-08', contractMonth: '202610' } };
mod.registerOrderRoutes({ get() {}, post() {} } as any, { getToken: () => 'x', getCachedQuote: s => cache[s], futuresCode: s => s });
const base = { profileId: 'P1', studentName: 'S', name: '台積電', category: 'stocks', action: 'BUY_STOCK', intent: 'OPEN', multiplier: 1000 } as any;

// 1) 限價 2540 不成交（賣價 2550）
let r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2540, quantity: 5 });
assert.equal(r.order!.status, 'WORKING', JSON.stringify(r));
const id1 = r.order!.id;
// 2) 市場跌破 2540，成交量 +100 → 成交 5 @2540
NOW += 20000; stock = { ...stock, low: 2535, close: 2538, total_volume: 1100, date: '2026-10-08 10:00:15', sell_price: 2540, sell_volume: 1 };
await new Promise(res => setTimeout(res, 20));
await mod.runTick();
let o = mod.listOrders('P1').find(x => x.id === id1)!;
assert.equal(o.status, 'FILLED'); assert.equal(o.avgPrice, 2540);
let fills = mod.claimFills('P1'); assert.equal(fills.length, 1); assert.equal(mod.claimFills('P1').length, 0);
// 3) 市價 IOC 5 張，只有 3 張可吃 → 成交 3，其餘取消
NOW += 20000; stock = { ...stock, sell_price: 2550, sell_volume: 3, date: '2026-10-08 10:01:00' };
r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'MARKET', tif: 'IOC', quantity: 5 });
assert.equal(r.order!.filledQty, 3); assert.equal(r.order!.status, 'CANCELLED');
// 4) FOK 5 張不足 → 全部取消
r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'FOK', limitPrice: 2550, quantity: 5 });
assert.equal(r.order!.filledQty, 0); assert.equal(r.order!.status, 'CANCELLED');
// 5) 不合升降單位、超過漲停
assert.ok((await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2552, quantity: 1 })).error);
assert.ok((await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2900, quantity: 1 })).error);
// 6) ROD 收盤失效
r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2500, quantity: 2 });
const id6 = r.order!.id;
NOW = new Date('2026-10-08T13:35:00+08:00').getTime();
await mod.runTick();
assert.equal(mod.listOrders('P1').find(x => x.id === id6)!.status, 'EXPIRED');
// 7) 盤後預約單 → 下一交易日（10/9 國慶補假休市，10/12 週一）開盤價成交
NOW = new Date('2026-10-08T20:00:00+08:00').getTime();
r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2545, quantity: 2 });
assert.equal(r.order!.status, 'QUEUED'); const id7 = r.order!.id;
assert.ok((await mod.createOrder({ ...base, symbol: '2330', priceType: 'MARKET', tif: 'IOC', quantity: 1 })).error);
NOW = new Date('2026-10-09T10:00:00+08:00').getTime(); await mod.runTick();
assert.equal(mod.listOrders('P1').find(x => x.id === id7)!.status, 'QUEUED', '國慶補假不應生效');
NOW = new Date('2026-10-12T09:00:20+08:00').getTime();
stock = { ...stock, open: 2530, high: 2532, low: 2528, close: 2531, total_volume: 300, date: '2026-10-12 09:00:12', sell_price: 2531 };
await mod.runTick();
o = mod.listOrders('P1').find(x => x.id === id7)!;
assert.equal(o.status, 'FILLED'); assert.equal(o.fills[0].price, 2530); assert.equal(o.fills[0].reason, '開盤價成交');
// 8) 小台（無快照）→ 收盤價撮合
NOW = new Date('2026-10-08T10:00:00+08:00').getTime();
cache.MTX.date = '2026-10-07';
r = await mod.createOrder({ ...base, symbol: 'MTX', name: '小台', category: 'futures', action: 'BUY_FUTURES_LONG', priceType: 'LIMIT', tif: 'ROD', limitPrice: 48800, quantity: 1, multiplier: 50 });
assert.equal(r.order!.feed, 'eod'); const id8 = r.order!.id;
assert.ok((await mod.createOrder({ ...base, symbol: 'MTX', category: 'futures', action: 'BUY_FUTURES_LONG', priceType: 'MARKET', tif: 'IOC', quantity: 1, multiplier: 50 })).error);
NOW = new Date('2026-10-08T14:00:00+08:00').getTime(); await mod.runTick();
assert.equal(mod.listOrders('P1').find(x => x.id === id8)!.status, 'WORKING', '等收盤資料');
cache.MTX.date = '2026-10-08'; await mod.runTick();
o = mod.listOrders('P1').find(x => x.id === id8)!;
assert.equal(o.status, 'FILLED'); assert.equal(o.avgPrice, 48700);
// 9) 刪單、改單
NOW = new Date('2026-10-12T10:00:00+08:00').getTime();
stock = { ...stock, date: '2026-10-12 09:59:00', low: 2520, high: 2540, close: 2530, sell_price: 2535, buy_price: 2530 };
r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2500, quantity: 5 });
const id9 = r.order!.id;
const m = await mod.modifyOrder(id9, 'P1', { quantity: 3 }); assert.equal((m as any).order.quantity, 3);
const m2 = await mod.modifyOrder(id9, 'P1', { limitPrice: 2535 }); assert.equal((m2 as any).order.status, 'FILLED', JSON.stringify(m2));
r = await mod.createOrder({ ...base, symbol: '2330', priceType: 'LIMIT', tif: 'ROD', limitPrice: 2500, quantity: 1 });
assert.equal(mod.cancelOrder(r.order!.id, 'P1').order!.status, 'CANCELLED');
assert.ok(mod.cancelOrder(r.order!.id, 'OTHER').error);
console.log('ALL ORDER INTEGRATION TESTS PASSED');
process.exit(0);
