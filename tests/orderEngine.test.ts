import assert from 'node:assert/strict';
import { tickSize, priceLimits, validateLimitPrice, stepTick, positionPnL, closeSide, openSide } from '../src/utils/orderRules';
import { LiquidityLedger, matchWorking, matchImmediate, matchAtClose, applyFills, type SimOrder, type Quote } from '../server-lib/orderEngine';

assert.equal(tickSize('stocks','2330',2550),5);
assert.equal(tickSize('etfs','0050',112.8),0.05);
assert.equal(tickSize('bonds','00679B',24.3),0.01);
assert.equal(tickSize('options','TXO-1',45),0.5);
assert.equal(tickSize('futures','TX',49349),1);
assert.deepEqual(priceLimits('stocks','2330',2585),{up:2840,down:2330});
assert.equal(validateLimitPrice('stocks','2330',2552,2585)?.includes('升降單位'),true);
assert.equal(validateLimitPrice('stocks','2330',2900,2585)?.includes('漲跌停'),true);
assert.equal(validateLimitPrice('stocks','2330',2550,2585),null);
assert.equal(stepTick('stocks','x',50,-1),49.95);
assert.equal(stepTick('stocks','x',49.95,1),50);
assert.equal(stepTick('stocks','x',50,1),50.1);
assert.equal(positionPnL('SELL_CALL_OPTION',100,80,2,50),2000);
assert.equal(positionPnL('BUY_PUT_OPTION',100,80,2,50),-2000);
assert.equal(closeSide('SHORT_SELL_STOCK'),'BUY'); assert.equal(openSide('SELL_PUT_OPTION'),'SELL');

const base = (o: Partial<SimOrder>): SimOrder => ({ id:'o', profileId:'p', studentName:'s', symbol:'2330', name:'台積電', category:'stocks', action:'BUY_STOCK', intent:'OPEN', side:'BUY', priceType:'LIMIT', tif:'ROD', limitPrice:2550, quantity:10, filledQty:0, avgPrice:0, status:'WORKING', fills:[], feed:'snapshot', feedKey:'2330', sessionKey:'2026-10-08C', sessionDate:'2026-10-08', baseline:null, multiplier:1000, marginRequirement:null, contractMonth:null, rationale:'', events:[], createdAt:0, updatedAt:0, ...o });
const q = (x: Partial<Quote>): Quote => ({ bid:2545, bidVol:100, ask:2550, askVol:3, last:2550, open:2560, high:2570, low:2540, totalVolume:1000, refPrice:2585, tickAt:'2026-10-08 10:00:00', ...x });

// 對手價：只吃到 3 張，同一張快照第二筆委託吃不到
let L = new LiquidityLedger();
let r = matchWorking(base({ baseline:{low:2540,high:2570,totalVolume:1000,lastTickAt:'2026-10-08 10:00:00'} }), q({}), L, false);
assert.deepEqual(r.fills,[{qty:3,price:2550,reason:'對手價成交'}]);
r = matchWorking(base({ id:'o2', baseline:{low:2540,high:2570,totalVolume:1000,lastTickAt:'2026-10-08 10:00:00'} }), q({}), L, false);
assert.equal(r.fills.length,0);
// 只碰到委託價不算
L = new LiquidityLedger();
r = matchWorking(base({ limitPrice:2540, baseline:{low:2545,high:2570,totalVolume:1000,lastTickAt:'a'} }), q({ low:2540, last:2545, totalVolume:1200, tickAt:'b' }), L, false);
assert.equal(r.fills.length,0);
// 穿越：創新低 2535 < 2540，成交量 +200 → 只成交 10 張 @2540
r = matchWorking(base({ limitPrice:2540, baseline:{low:2545,high:2570,totalVolume:1000,lastTickAt:'a'} }), q({ low:2535, last:2545, totalVolume:1200, tickAt:'b' }), L, false);
assert.deepEqual(r.fills,[{qty:10,price:2540,reason:'市場成交價穿越委託價'}]);
// 穿越但成交量不足：只成交 4
r = matchWorking(base({ limitPrice:2540, baseline:{low:2545,high:2570,totalVolume:1000,lastTickAt:'a'} }), q({ low:2535, last:2545, totalVolume:1004, tickAt:'b' }), L, false);
assert.equal(r.fills[0].qty,4);
// 開盤價成交（預約單）
r = matchWorking(base({ limitPrice:2570 }), q({ open:2560, ask:null }), L, true);
assert.deepEqual(r.fills,[{qty:10,price:2560,reason:'開盤價成交'}]);
// 賣單穿越
r = matchWorking(base({ side:'SELL', limitPrice:2575, baseline:{low:2540,high:2570,totalVolume:1000,lastTickAt:'a'} }), q({ high:2580, totalVolume:1050, tickAt:'b', bid:2560 }), L, false);
assert.deepEqual(r.fills,[{qty:10,price:2575,reason:'市場成交價穿越委託價'}]);
// IOC 部分、FOK 不成交
L = new LiquidityLedger();
assert.deepEqual(matchImmediate(base({ tif:'IOC', priceType:'MARKET', limitPrice:null }), q({}), L),[{qty:3,price:2550,reason:'市價單以對手價成交'}]);
L = new LiquidityLedger();
assert.deepEqual(matchImmediate(base({ tif:'FOK' }), q({}), L),[]);
// 收盤價撮合
assert.deepEqual(matchAtClose(base({ limitPrice:2550 }), 2545),[{qty:10,price:2545,reason:'收盤價撮合成交'}]);
assert.deepEqual(matchAtClose(base({ limitPrice:2550 }), 2555),[]);
// applyFills 均價與狀態
let o = applyFills(base({}), [{qty:4,price:2550,reason:'x'},{qty:6,price:2545,reason:'y'}], 1, (()=>{let i=0;return ()=>'F'+(i++)})());
assert.equal(o.status,'FILLED'); assert.equal(o.avgPrice,2547);
o = applyFills(base({}), [{qty:4,price:2550,reason:'x'}], 1, ()=>'F');
assert.equal(o.status,'PARTIAL');
console.log('ALL ENGINE TESTS PASSED');
