/**
 * 進站紀錄與版主後台
 *
 * - 學員進站、登入、註冊、登出、登入失敗都記一筆（Firestore stock-history / access_logs）
 * - 版主帳號 admin，密碼只以雜湊存在 Cloud Run 環境變數 ADMIN_PASSWORD_SHA256（不寫進程式碼）
 *     雜湊 = SHA-256("stock5000-admin:" + 密碼)
 * - 版主登入後拿到 12 小時有效的簽章權杖（HMAC），用來查詢紀錄、管理暫停名單
 */
import crypto from 'crypto';

const LOGS = 'access_logs';
const CONTROL = 'access_control';
const ADMIN_USER = 'admin';
const TOKEN_HOURS = 12;

let firestore: any = null;
async function getDb() {
  if (firestore) return firestore;
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = process.env.HISTORY_PROJECT || 'payfirebase';
  const app = getApps().find(a => a.name === 'access') || initializeApp({ credential: applicationDefault(), projectId }, 'access');
  firestore = getFirestore(app, process.env.HISTORY_DATABASE || 'stock-history');
  return firestore;
}

export const ACCESS_EVENTS = ['visit', 'login', 'register', 'logout', 'login_failed', 'blocked', 'admin_login', 'admin_login_failed'] as const;
export type AccessEvent = typeof ACCESS_EVENTS[number];

export interface AccessLog {
  at: number;
  event: AccessEvent;
  name: string;
  profileId: string;
  ip: string;
  device: string;
  ua: string;
}

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export function clientIp(req: any): string {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return clean(xf || req.socket?.remoteAddress || '', 64);
}

function deviceOf(ua: string) {
  if (/iPad|Tablet/i.test(ua)) return '平板';
  if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return '手機';
  return '電腦';
}

// ── 簡單的頻率限制（單一執行個體，記憶體即可） ──
const hits = new Map<string, number[]>();
function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return true;
}

export async function recordAccess(req: any, body: any) {
  const event = clean(body?.event, 32) as AccessEvent;
  if (!ACCESS_EVENTS.includes(event) || event.startsWith('admin')) return { ok: false, error: '不支援的事件' };
  const ip = clientIp(req);
  if (!allow(`ev:${ip}`, 60, 10 * 60_000)) return { ok: false, error: '太頻繁' };
  const ua = clean(req.headers['user-agent'], 300);
  const log: AccessLog = { at: Date.now(), event, name: clean(body?.name, 40), profileId: clean(body?.profileId, 80), ip, device: deviceOf(ua), ua };
  await writeLog(log);
  return { ok: true };
}

async function writeLog(log: AccessLog) {
  try {
    const db = await getDb();
    await db.collection(LOGS).add(log);
  } catch (e: any) {
    console.warn('[Access] 寫入紀錄失敗', e.message);
  }
}

// ── 版主登入 ──
function adminHash() {
  return (process.env.ADMIN_PASSWORD_SHA256 || '').trim().toLowerCase();
}
export const adminConfigured = () => /^[0-9a-f]{64}$/.test(adminHash());

const sign = (payload: string) => crypto.createHmac('sha256', `admin-token:${adminHash()}`).update(payload).digest('base64url');

export async function adminLogin(req: any, body: any): Promise<{ ok: true; token: string; expiresAt: number } | { ok: false; status: number; error: string }> {
  if (!adminConfigured()) return { ok: false, status: 503, error: '版主帳號尚未設定' };
  const ip = clientIp(req);
  if (!allow(`admin:${ip}`, 5, 15 * 60_000)) return { ok: false, status: 429, error: '嘗試次數過多，請 15 分鐘後再試' };
  const user = clean(body?.username, 40).toLowerCase();
  const pass = String(body?.password ?? '');
  const got = crypto.createHash('sha256').update(`stock5000-admin:${pass}`).digest();
  const want = Buffer.from(adminHash(), 'hex');
  const ok = user === ADMIN_USER && got.length === want.length && crypto.timingSafeEqual(got, want);
  const ua = clean(req.headers['user-agent'], 300);
  await writeLog({ at: Date.now(), event: ok ? 'admin_login' : 'admin_login_failed', name: user || '(空白)', profileId: '', ip, device: deviceOf(ua), ua });
  if (!ok) return { ok: false, status: 401, error: '帳號或密碼錯誤' };
  hits.delete(`admin:${ip}`);
  const expiresAt = Date.now() + TOKEN_HOURS * 3600_000;
  const payload = `${ADMIN_USER}.${expiresAt}`;
  return { ok: true, token: `${payload}.${sign(payload)}`, expiresAt };
}

export function isAdmin(req: any): boolean {
  if (!adminConfigured()) return false;
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 3) return false;
  const [user, exp, sig] = parts;
  if (user !== ADMIN_USER || !(Number(exp) > Date.now())) return false;
  const expect = sign(`${user}.${exp}`);
  return expect.length === sig.length && crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig));
}

// ── 查詢 ──
export async function queryLogs(q: { days?: number }) {
  const days = Math.min(Math.max(Number(q.days) || 7, 1), 180);
  const since = Date.now() - days * 86400_000;
  const db = await getDb();
  const snap = await db.collection(LOGS).where('at', '>=', since).orderBy('at', 'desc').limit(5000).get();
  const logs: AccessLog[] = snap.docs.map((d: any) => d.data());
  return { days, since, truncated: logs.length >= 5000, logs };
}

// ── 暫停名單 ──
let blockCache: { at: number; names: string[] } | null = null;
export async function getBlocklist(): Promise<string[]> {
  if (blockCache && Date.now() - blockCache.at < 60_000) return blockCache.names;
  const db = await getDb();
  const doc = await db.collection(CONTROL).doc('blocklist').get();
  const names: string[] = doc.exists ? doc.data().names || [] : [];
  blockCache = { at: Date.now(), names };
  return names;
}
export async function setBlocked(name: string, blocked: boolean) {
  const n = clean(name, 40);
  if (!n) throw new Error('缺少姓名');
  const cur = await getBlocklist();
  const key = n.toLowerCase();
  const next = blocked ? [...cur.filter(x => x.toLowerCase() !== key), n] : cur.filter(x => x.toLowerCase() !== key);
  const db = await getDb();
  await db.collection(CONTROL).doc('blocklist').set({ names: next, updatedAt: Date.now() });
  blockCache = { at: Date.now(), names: next };
  return next;
}
export async function isBlocked(name: string) {
  const key = clean(name, 40).toLowerCase();
  if (!key) return false;
  return (await getBlocklist()).some(x => x.toLowerCase() === key);
}
