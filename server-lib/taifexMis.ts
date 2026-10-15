/**
 * 期交所「行情資訊網」(mis.taifex.com.tw) 期貨即時行情
 * FinMind 期貨快照沒有小型臺指（MXF），用期交所公開行情補上。
 * 回傳格式比照 FinMind taiwan_futures_snapshot，撮合引擎可以直接使用。
 */
const URL_QUOTE = 'https://mis.taifex.com.tw/futures/api/getQuoteList';

export const lastMisDebug: { at: number; status?: number; sample?: any; error?: string } = { at: 0 };

const n = (v: any) => {
  const x = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};

function twNow() {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
  const [date, time] = s.split(' ');
  const [h, m] = time.split(':').map(Number);
  return { date, time, hm: h * 100 + m };
}

/** 抓一個商品代號（例如 MXF）的所有月份；夜盤時段自動抓夜盤 */
export async function fetchMisFutures(cid: string): Promise<Map<string, any> | null> {
  const now = twNow();
  const night = now.hm >= 1500 || now.hm < 500;
  const body = { MarketType: night ? '1' : '0', SymbolType: 'F', KindID: '1', CID: cid, ExpireMonth: '', RowSize: '全部', PageNo: '', SortColumn: '', AscDesc: 'A' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(URL_QUOTE, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: 'https://mis.taifex.com.tw/futures/' },
      body: JSON.stringify(body),
    });
    lastMisDebug.at = Date.now();
    lastMisDebug.status = r.status;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json();
    const list: any[] = j?.RtData?.QuoteList || [];
    lastMisDebug.sample = list.slice(0, 3);
    lastMisDebug.error = undefined;
    const map = new Map<string, any>();
    for (const q of list) {
      const id = String(q.SymbolID || '').split('-')[0].toUpperCase();
      if (!new RegExp(`^${cid}[A-L]\\d$`).test(id)) continue; // 只要單一月份合約（排除價差）
      const close = n(q.CLastPrice);
      if (!(close > 0)) continue;
      const ref = n(q.CRefPrice);
      const d = String(q.CDate || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || now.date;
      const tm = String(q.CTime || '').padStart(6, '0').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3');
      map.set(id, {
        futures_id: id,
        close,
        open: n(q.COpenPrice),
        high: n(q.CHighPrice),
        low: n(q.CLowPrice),
        buy_price: n(q.CBestBidPrice),
        buy_volume: n(q.CBestBidSize),
        sell_price: n(q.CBestAskPrice),
        sell_volume: n(q.CBestAskSize),
        total_volume: n(q.CTotalVolume),
        change_price: ref > 0 ? Number((close - ref).toFixed(2)) : n(q.CDiff),
        change_rate: ref > 0 ? Number((((close - ref) / ref) * 100).toFixed(2)) : 0,
        date: `${d} ${tm}`,
        source: '期交所行情資訊網',
      });
    }
    return map;
  } catch (e: any) {
    lastMisDebug.at = Date.now();
    lastMisDebug.error = e.message;
    return null;
  } finally {
    clearTimeout(t);
  }
}
