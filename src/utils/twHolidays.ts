/**
 * 台灣證券／期貨市場休市日
 *
 * 內建名單來自臺灣證券交易所 OpenAPI「有價證券集中交易市場開（休）市日期」
 * https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule
 * 伺服器啟動後會再向證交所抓最新名單，並透過 /api/market/calendar 提供給前端，
 * 所以跨年度不需要改程式；這份內建名單只是抓不到時的備援。
 *
 * 注意：名單裡「開始交易日」「最後交易日」是交易日，不是休市日，不放進來。
 */

// 民國 115 年（2026）
const BUILT_IN_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '中華民國開國紀念日',
  '2026-02-12': '農曆春節前結算交割（市場無交易）',
  '2026-02-13': '農曆春節前結算交割（市場無交易）',
  '2026-02-16': '農曆除夕及春節',
  '2026-02-17': '農曆除夕及春節',
  '2026-02-18': '農曆除夕及春節',
  '2026-02-19': '農曆除夕及春節',
  '2026-02-20': '農曆春節補假',
  '2026-02-27': '和平紀念日補假',
  '2026-04-03': '兒童節補假',
  '2026-04-06': '民族掃墓節補假',
  '2026-05-01': '勞動節',
  '2026-06-19': '端午節',
  '2026-09-25': '中秋節',
  '2026-09-28': '教師節',
  '2026-10-09': '國慶日補假',
  '2026-10-26': '臺灣光復紀念日補假',
  '2026-12-25': '行憲紀念日',
};

let holidays: Record<string, string> = { ...BUILT_IN_HOLIDAYS };

/** 用伺服器（證交所）提供的最新名單覆蓋；與內建名單合併 */
export function setTwHolidays(map: Record<string, string>) {
  if (map && typeof map === 'object' && Object.keys(map).length > 0) {
    holidays = { ...BUILT_IN_HOLIDAYS, ...map };
  }
}

export function getTwHolidays(): Record<string, string> {
  return holidays;
}

/** 證交所 OpenAPI 的資料轉成 { 'YYYY-MM-DD': 名稱 }（民國年日期 1151009 → 2026-10-09） */
export function parseTwseHolidaySchedule(rows: Array<{ Name?: string; Date?: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows || []) {
    const name = String(r.Name || '').trim();
    const raw = String(r.Date || '').trim();
    if (!/^\d{7}$/.test(raw)) continue;
    if (name.includes('開始交易') || name.includes('最後交易')) continue; // 這些是交易日
    const y = Number(raw.slice(0, 3)) + 1911;
    const date = `${y}-${raw.slice(3, 5)}-${raw.slice(5, 7)}`;
    out[date] = name.includes('無交易') ? `${name}` : name;
  }
  return out;
}

const dayOfWeek = (dateStr: string) => new Date(`${dateStr}T12:00:00+08:00`).getUTCDay();

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 平日國定假日的名稱；週末或交易日回傳 null */
export function getTwHolidayName(dateStr: string): string | null {
  const dow = dayOfWeek(dateStr);
  if (dow === 0 || dow === 6) return null;
  return holidays[dateStr] ?? null;
}

export function isTwTradingDay(dateStr: string): boolean {
  const dow = dayOfWeek(dateStr);
  return dow !== 0 && dow !== 6 && !holidays[dateStr];
}

export function nextTwTradingDay(dateStr: string): string {
  let d = addDays(dateStr, 1);
  for (let i = 0; i < 30 && !isTwTradingDay(d); i++) d = addDays(d, 1);
  return d;
}

export function previousTwTradingDay(dateStr: string): string {
  let d = addDays(dateStr, -1);
  for (let i = 0; i < 30 && !isTwTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
export function formatTradingDay(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}（${WEEKDAY[dayOfWeek(dateStr)]}）`;
}

/**
 * 台灣市場（現貨、期貨、選擇權）此刻是否因國定假日休市。
 * timeNum 為台北時間 HHMM。凌晨 00:00~05:00 屬於「前一個交易日」的期貨夜盤，
 * 所以：今天是假日 → 休市（但凌晨若前一天是交易日，夜盤照常）；
 *      今天是交易日但昨天是假日 → 凌晨沒有夜盤。
 * 回傳 null 代表不受假日影響，照一般時刻表判斷。
 */
export function getTwHolidayClosure(
  dateStr: string,
  timeNum: number,
  opts: { hasNightSession: boolean; dayOpenTime: string }
): { sessionName: string; nextSessionTime: string } | null {
  const todayHoliday = getTwHolidayName(dateStr);
  const yesterday = addDays(dateStr, -1);
  const yesterdayTrading = isTwTradingDay(yesterday);

  if (todayHoliday) {
    if (opts.hasNightSession && timeNum < 500 && yesterdayTrading) return null; // 前一交易日的夜盤
    const next = nextTwTradingDay(dateStr);
    return {
      sessionName: `${todayHoliday}休市`,
      nextSessionTime: `${formatTradingDay(next)} ${opts.dayOpenTime} 開盤`,
    };
  }

  if (opts.hasNightSession && timeNum < 500 && !yesterdayTrading && isTwTradingDay(dateStr)) {
    const dow = dayOfWeek(dateStr);
    if (dow === 1) return null; // 週一凌晨由原本的週末邏輯處理
    const name = getTwHolidayName(yesterday) || '休市';
    return {
      sessionName: `${name}，無夜盤（非交易時段）`,
      nextSessionTime: `今日 ${opts.dayOpenTime} 開盤`,
    };
  }
  return null;
}
