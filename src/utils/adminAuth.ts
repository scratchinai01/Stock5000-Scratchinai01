/**
 * 版主（最高管理者）身分：一律由伺服器驗證版主密碼，前端不保存、也不比對任何管理密碼。
 * 驗證成功後拿到 12 小時有效的權杖，存在這個分頁的 sessionStorage。
 */
export const ADMIN_TOKEN_KEY = 'admin_access_token';

/** 這些姓名代表最高管理者，登入時必須通過伺服器的版主密碼驗證 */
export function isSuperUserName(name: string | null | undefined) {
  const n = String(name || '').trim();
  const lower = n.toLowerCase();
  return n === '程瑋翔' || lower === 'admin' || lower === 'superuser' || lower === 'scratchinai01@gmail.com';
}

export function readAdminToken(): string | null {
  try {
    const t = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!t) return null;
    return Number(t.split('.')[1]) > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem('finmind_superuser_authenticated');
  } catch {
    /* ignore */
  }
}

/** 以版主密碼向伺服器驗證；成功時保存權杖 */
export async function verifyAdminPassword(password: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return { ok: false, error: j.error || '版主密碼錯誤' };
    try {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, j.token);
      sessionStorage.setItem('finmind_superuser_authenticated', 'true');
    } catch {
      /* ignore */
    }
    return { ok: true, token: j.token };
  } catch {
    return { ok: false, error: '無法連線到伺服器驗證版主密碼，請稍後再試' };
  }
}
