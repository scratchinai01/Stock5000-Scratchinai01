import assert from 'node:assert/strict';
import { computeNav } from '../src/utils/nav';

// 實際案例（2026/10/22 學員）：放空 BTC 4.01 枚 + 原油 20 口，現金 + 保證金 = 5,000 萬
const p: any = {
  availableCash: 37_693_989.27, initialCapital: 50_000_000,
  positions: [
    { category: 'crypto', orderType: 'SHORT_SELL_CRYPTO', totalCostOrMargin: 11_006_010.73, unrealizedPnL: 8124, notionalValue: 339_430 },
    { category: 'commodities', orderType: 'BUY_COMMODITY_LONG', totalCostOrMargin: 1_300_000, unrealizedPnL: 0, notionalValue: 6_304_325 },
  ],
};
const n = computeNav(p);
assert.equal(Math.round(n.netAssetValue), 50_008_124);
assert.ok(Math.abs(n.totalReturnPct - 0.016) < 0.001);
// 現股：買 1 張 100 元，漲到 110 → 賺 1 萬，不可重複計算
const s: any = { availableCash: 49_900_000, initialCapital: 50_000_000, positions: [{ category: 'stocks', totalCostOrMargin: 100_000, unrealizedPnL: 10_000, notionalValue: 110_000 }] };
assert.equal(computeNav(s).netAssetValue, 50_010_000);
console.log('nav.test：資產淨值算法檢查通過');
