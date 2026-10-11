/** 進站紀錄：送出後不等待結果，失敗也不影響使用 */
export type ClientAccessEvent = 'visit' | 'login' | 'register' | 'logout' | 'login_failed' | 'blocked';

export function logAccess(event: ClientAccessEvent, name = '', profileId = '') {
  try {
    fetch('/api/access/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, name, profileId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** 每個瀏覽器分頁只記一次「進站」 */
export function logVisitOnce() {
  try {
    if (sessionStorage.getItem('access_visit_logged') === '1') return;
    sessionStorage.setItem('access_visit_logged', '1');
  } catch {
    /* ignore */
  }
  logAccess('visit');
}

/** 版主是否暫停了這個帳號（讀不到名單時一律放行） */
export async function isNameBlocked(name: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/access/blocked?name=${encodeURIComponent(name.trim())}`);
    if (!r.ok) return false;
    return Boolean((await r.json()).blocked);
  } catch {
    return false;
  }
}

export const BLOCKED_MESSAGE = '此帳號已被版主暫停使用，如有疑問請洽版主。';
