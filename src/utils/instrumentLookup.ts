import type { InstrumentSpec } from '../types/market';
import { getUsdTwd } from './fx';

/**
 * 全市場查詢：本機沒有載入的台股、ETF、債券 ETF、美股，向伺服器查真實報價後建立商品。
 * 與電腦版「下單交易」的搜尋使用同一個 API（/api/gemini/quote-assistant，只回傳真實報價）。
 */
export async function lookupInstrument(query: string): Promise<InstrumentSpec> {
  const q = query.trim();
  const res = await fetch('/api/gemini/quote-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, category: 'stocks', benchmarkDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date()) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `查無「${q}」，請確認代號（例如 2330、0050、00681L、00719B、NVDA）`);
  }
  const d = json.data;
  const isUs = d.category === 'us_stocks';
  return {
    symbol: d.symbol,
    name: d.name,
    category: d.category || 'stocks',
    price: d.closePrice,
    prevClose: d.prevClosePrice || d.closePrice,
    change: d.change || 0,
    changePercent: d.changePercent || 0,
    volume: d.volume || 0,
    unitLabel: d.unitDescription || (isUs ? '股 (1股起，依即時匯率)' : '張 (1,000股)'),
    multiplier: d.contractMultiplier || (isUs ? 32 : 1000),
    marginRequirement: d.marginRequirement || 0,
    description: isUs
      ? `🇺🇸 美股：${d.name} (${d.symbol})，最新市價 US$ ${d.closePrice} (折合 NT$ ${Math.round(d.closePrice * getUsdTwd()).toLocaleString()})。`
      : `台灣上市/上櫃真實標的：${d.name} (${d.symbol})，最新價 NT$ ${d.closePrice}。`,
    klineHistory: d.klineHistory || [],
  } as InstrumentSpec;
}
