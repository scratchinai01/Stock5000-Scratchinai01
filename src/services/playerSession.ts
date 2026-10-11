/**
 * 學員登入狀態：伺服器發的學員權杖（7 天），存在這台瀏覽器
 */
import type { StudentProfile } from '../types/market';
import { readAdminToken } from '../utils/adminAuth';

const KEY = 'player_tokens_v1';
const keyOf = (name: string) => name.trim().toLowerCase();

function readAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function writeAll(m: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function getPlayerToken(name: string): string | null {
  const t = readAll()[keyOf(name)];
  if (!t) return null;
  return Number(t.split('.')[1]) > Date.now() ? t : null;
}
export function setPlayerToken(name: string, token: string) {
  const m = readAll();
  m[keyOf(name)] = token;
  writeAll(m);
}
export function clearPlayerToken(name: string) {
  const m = readAll();
  delete m[keyOf(name)];
  writeAll(m);
}
export function playerHeaders(name: string): Record<string, string> | null {
  const t = getPlayerToken(name);
  return t ? { 'X-Player-Token': t } : null;
}
export function adminHeaders(): Record<string, string> | null {
  const t = readAdminToken();
  return t ? { Authorization: `Bearer ${t}` } : null;
}

export interface LoginResult {
  ok: boolean;
  profile?: StudentProfile;
  mustChangePassword?: boolean;
  notFound?: boolean;
  blocked?: boolean;
  error?: string;
}

async function post(url: string, body: any): Promise<{ status: number; json: any }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  } catch {
    return { status: 0, json: { error: '無法連線到伺服器，請稍後再試' } };
  }
}

function done(status: number, json: any, name: string): LoginResult {
  if (status === 200 && json.token) {
    setPlayerToken(json.profile?.studentName || name, json.token);
    return { ok: true, profile: json.profile, mustChangePassword: Boolean(json.mustChangePassword) };
  }
  return { ok: false, notFound: Boolean(json.notFound), blocked: Boolean(json.blocked), error: json.error || '登入失敗' };
}

/** 伺服器登入；伺服器沒有這位學員時 notFound=true（可嘗試把本機舊資料搬上去） */
export async function serverLogin(name: string, password: string): Promise<LoginResult> {
  const { status, json } = await post('/api/players/login', { name, password });
  return done(status, json, name);
}

/** 建立帳號；migrate=true 時會比對本機舊密碼雜湊，並保留本機的資產資料 */
export async function serverRegister(profile: StudentProfile, password: string, migrate = false): Promise<LoginResult> {
  const { password: legacyHash, ...rest } = profile as any;
  const { status, json } = await post('/api/players/register', { profile: rest, password, migrate, legacyHash: migrate ? legacyHash || undefined : undefined });
  return done(status, json, profile.studentName);
}

/** 讀取這台瀏覽器裡舊版留下的學員資料（含舊密碼雜湊），供第一次搬家使用 */
export function findLocalLegacyProfile(name: string): StudentProfile | null {
  const key = keyOf(name);
  for (const k of ['finmind_entered_player_profiles', 'finmind_student_profiles_v3_authentic']) {
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      const hit = Array.isArray(arr) ? arr.find((p: any) => p?.studentName?.trim().toLowerCase() === key) : null;
      if (hit) return hit;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * 登入（含舊資料搬家）：
 * 1. 伺服器有這位學員 → 用伺服器驗證密碼
 * 2. 伺服器沒有、但這台瀏覽器有舊版資料 → 驗證舊密碼後，把資產資料搬上伺服器
 */
export async function authenticatePlayer(name: string, password: string): Promise<LoginResult & { migrated?: boolean }> {
  const r = await serverLogin(name, password);
  if (r.ok || !r.notFound) return r;
  const local = findLocalLegacyProfile(name);
  if (!local) return { ok: false, notFound: true, error: `找不到學員「${name.trim()}」。若是新加入者，請先註冊。` };
  const m = await serverRegister({ ...local, studentName: local.studentName.trim() }, password, true);
  return { ...m, migrated: m.ok };
}

/** 再次確認本人密碼（例如清空重來前） */
export async function verifyOwnPassword(name: string, password: string): Promise<boolean> {
  return (await serverLogin(name, password)).ok;
}

/** 登入後若必須改密碼，記在這個分頁，App 會強制開啟改密碼視窗 */
const MUST_KEY = 'player_must_change_password';
export function markMustChange(name: string, must: boolean) {
  try {
    if (must) sessionStorage.setItem(MUST_KEY, name.trim());
    else sessionStorage.removeItem(MUST_KEY);
  } catch {
    /* ignore */
  }
}
export function mustChangeFor(): string | null {
  try {
    return sessionStorage.getItem(MUST_KEY);
  } catch {
    return null;
  }
}
