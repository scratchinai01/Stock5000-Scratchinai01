// FinMind 真實資料服務層
// 原則：所有數字只能來自 FinMind API。抓不到就丟出錯誤讓畫面顯示，絕不用 Gemini 或假資料補洞。

const API = 'https://api.finmindtrade.com/api/v4/data';

// AI Studio / Vite 專案：在 .env.local 設 VITE_FINMIND_TOKEN=你的token
const TOKEN: string = (import.meta as any).env?.VITE_FINMIND_TOKEN ?? '';

export class FinMindError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'FinMindError';
  }
}

async function query<T>(dataset: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(API);
  url.searchParams.set('dataset', dataset);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  if (!res.ok) throw new FinMindError(`FinMind 連線失敗（HTTP ${res.status}）`, res.status);

  const json = await res.json();
  if (json.status !== 200) {
    throw new FinMindError(`FinMind 回傳錯誤：${json.msg ?? '未知錯誤'}`, json.status);
  }
  if (!Array.isArray(json.data) || json.data.length === 0) {
    throw new FinMindError(`查無資料：${dataset} ${params.data_id ?? ''}（可能是非交易日或代號錯誤）`);
  }
  return json.data as T[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86400000));

// ---------- 個股日線 ----------
export interface StockBar {
  date: string;
  stock_id: string;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  Trading_Volume: number;
  Trading_money: number;
}

export function getStockPrice(stockId: string, startDate = daysAgo(90), endDate = ymd(new Date())) {
  return query<StockBar>('TaiwanStockPrice', { data_id: stockId, start_date: startDate, end_date: endDate });
}

// ---------- 期貨日線（預設台指期 TX）----------
export interface FuturesBar {
  date: string;
  futures_id: string;
  contract_date: string; // 例如 "202610"；價差單會是 "202610/202611"
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  spread_per: number;
  volume: number;
  settlement_price: number;
  open_interest: number;
  trading_session: string; // "position" = 一般盤，"after_market" = 夜盤
}

/** 只取近月合約、一般盤，每天一筆 */
export async function getNearMonthFutures(
  futuresId = 'TX',
  startDate = daysAgo(90),
  endDate = ymd(new Date()),
  session: 'position' | 'after_market' = 'position',
): Promise<FuturesBar[]> {
  const rows = await query<FuturesBar>('TaiwanFuturesDaily', {
    data_id: futuresId,
    start_date: startDate,
    end_date: endDate,
  });

  const byDate = new Map<string, FuturesBar>();
  for (const r of rows) {
    if (r.trading_session !== session) continue;
    if (!/^\d{6}$/.test(r.contract_date.trim())) continue; // 排除價差單
    const cur = byDate.get(r.date);
    if (!cur || r.contract_date < cur.contract_date) byDate.set(r.date, r);
  }
  const result = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (result.length === 0) throw new FinMindError(`期貨 ${futuresId} 沒有符合條件的近月資料`);
  return result;
}

// ---------- 期貨三大法人 ----------
export interface FuturesInstitutional {
  date: string;
  name: string;
  institutional_investors: string; // 自營商 / 投信 / 外資
  long_deal_volume: number;
  short_deal_volume: number;
  long_open_interest_balance_volume: number;
  short_open_interest_balance_volume: number;
}

export async function getFuturesInstitutional(futuresId = 'TX', startDate = daysAgo(30), endDate = ymd(new Date())) {
  const rows = await query<FuturesInstitutional>('TaiwanFuturesInstitutionalInvestors', {
    data_id: futuresId,
    start_date: startDate,
    end_date: endDate,
  });
  // 附上未平倉淨口數（多 − 空）
  return rows.map((r) => ({
    ...r,
    net_open_interest: r.long_open_interest_balance_volume - r.short_open_interest_balance_volume,
  }));
}
