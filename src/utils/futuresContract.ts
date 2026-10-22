/**
 * 期貨、選擇權月份合約換月
 * 台灣期交所：月合約最後交易日＝交割月份第三個星期三（遇假日順延，這裡以第三個星期三近似）。
 * 最後交易日 13:30 收盤後，近月就換成下個月份的合約。
 */
function twNow(now: Date) {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const [date, time] = s.split(' ');
  const [h, m] = time.split(':').map(Number);
  return { date, hm: h * 100 + m };
}

/** 某月第三個星期三（YYYY-MM-DD） */
export function thirdWednesday(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=日
  const day = 1 + ((3 - first + 7) % 7) + 14;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const nextMonth = (cm: string) => {
  let y = Number(cm.slice(0, 4));
  let m = Number(cm.slice(4, 6)) + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}${String(m).padStart(2, '0')}`;
};

/** 這個合約月份是否已經到期（最後交易日收盤後） */
export function contractExpired(cm: string, now = new Date()): boolean {
  if (!/^\d{6}$/.test(cm)) return false;
  const last = thirdWednesday(Number(cm.slice(0, 4)), Number(cm.slice(4, 6)));
  const { date, hm } = twNow(now);
  return date > last || (date === last && hm >= 1330);
}

/** 目前的近月合約月份（YYYYMM） */
export function frontContractMonth(now = new Date()): string {
  const { date } = twNow(now);
  const cm = date.slice(0, 4) + date.slice(5, 7);
  return contractExpired(cm, now) ? nextMonth(cm) : cm;
}

/** 已到期的合約月份換成目前近月；沒到期就原樣回傳 */
export function rollContractMonth(cm: string | null | undefined, now = new Date()): string | null {
  if (!cm || !/^\d{6}$/.test(cm)) return cm ?? null;
  const front = frontContractMonth(now);
  return cm < front ? front : cm;
}
