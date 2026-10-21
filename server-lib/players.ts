/**
 * 學員帳號與資產資料（伺服器保存）
 *
 * 原本的學員資料寫在 AI Studio 附帶的 Firebase 專案，該專案已無法使用（CONSUMER_INVALID），
 * 每位學員的資料只留在自己的瀏覽器裡，所以大家互相看不到。改為存在本系統的 Firestore（stock-history / players），
 * 密碼只在伺服器以 scrypt 加鹽雜湊驗證，網頁拿不到任何密碼雜湊。
 *
 * - 預設密碼 money888、版主重設的臨時密碼：登入後必須先改密碼（mustChangePassword）
 * - 舊資料搬家：第一次登入時，若伺服器沒有這位學員，網頁會把本機資料連同剛輸入的密碼送上來建立帳號
 */
import crypto from 'crypto';

const COLLECTION = 'players';
const DEFAULT_PASSWORD = 'money888';
const TOKEN_DAYS = 7;
const RESERVED = ['程瑋翔', 'admin', 'superuser', 'scratchinai01@gmail.com'];

let firestore: any = null;

/** 本機測試用的記憶體版資料庫（PLAYERS_MEMORY=1），正式環境不會用到 */
function memoryDb() {
  const stores = new Map<string, Map<string, any>>();
  const makeCol = (store: Map<string, any>) => {
  const docRef = (id: string) => ({
    id,
    async get() { const d = store.get(id); return { exists: d !== undefined, id, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; },
    async set(v: any, o?: any) { store.set(id, o?.merge ? { ...(store.get(id) || {}), ...v } : { ...v }); },
    async update(v: any) { if (!store.has(id)) throw new Error('not found'); store.set(id, { ...store.get(id), ...v }); },
    async delete() { store.delete(id); },
  });
  return {
    doc: docRef,
    limit: () => ({ async get() { return { docs: [...store.entries()].map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) })) }; } }),
  };
  };
  const cols = new Map<string, any>();
  return {
    collection: (name: string) => {
      if (!cols.has(name)) { const st = new Map<string, any>(); stores.set(name, st); cols.set(name, makeCol(st)); }
      return cols.get(name);
    },
    async runTransaction(fn: any) {
      return fn({ get: (r: any) => r.get(), set: (r: any, v: any) => r.set(v) });
    },
  };
}

async function getDb() {
  if (firestore) return firestore;
  if (process.env.PLAYERS_MEMORY === '1') return (firestore = memoryDb());
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = process.env.HISTORY_PROJECT || 'payfirebase';
  const app = getApps().find(a => a.name === 'players') || initializeApp({ credential: applicationDefault(), projectId }, 'players');
  firestore = getFirestore(app, process.env.HISTORY_DATABASE || 'stock-history');
  return firestore;
}

export const nameKey = (name: string) => String(name || '').trim().toLowerCase();
const docIdOf = (name: string) => `p_${encodeURIComponent(nameKey(name)).slice(0, 140)}`;
export const isReservedName = (name: string) => RESERVED.includes(nameKey(name)) || RESERVED.includes(String(name || '').trim());
const cleanName = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);

// ── 密碼 ──
export function scryptHash(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${h}`;
}
export function verifyPassword(password: string, stored: any): boolean {
  if (typeof stored !== 'string' || !stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, h] = stored.split('$');
    const got = crypto.scryptSync(password, salt, 32);
    const want = Buffer.from(h, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  return false;
}
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** 舊版網頁存在瀏覽器裡的密碼格式：sha256:<hex>（加鹽）、純 64 位 hex，或極舊版的明碼 */
export function legacyMatches(password: string, stored: string) {
  const p = String(password || '').trim(), s = String(stored || '').trim();
  if (!p || !s) return false;
  const salted = sha256(`finmind_nt50m_salt_${p}`);
  const lower = s.toLowerCase();
  return lower === `sha256:${salted}` || lower === salted || lower === sha256(p) || s === p;
}

// ── 學員權杖（HMAC，7 天） ──
function tokenSecret() {
  return process.env.PLAYER_TOKEN_SECRET || `player:${process.env.ADMIN_PASSWORD_SHA256 || 'dev-only-secret'}`;
}
export function issueToken(name: string) {
  const exp = Date.now() + TOKEN_DAYS * 86400_000;
  const payload = `${Buffer.from(nameKey(name)).toString('base64url')}.${exp}`;
  const sig = crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function playerFromToken(req: any): string | null {
  const m = String(req.headers['x-player-token'] || '').trim();
  if (!m) return null;
  const parts = m.split('.');
  if (parts.length !== 3) return null;
  const [n, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return null;
  const expect = crypto.createHmac('sha256', tokenSecret()).update(`${n}.${exp}`).digest('base64url');
  if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  return Buffer.from(n, 'base64url').toString();
}

// ── 資料 ──
const PRIVATE_FIELDS = ['password', 'passwordHash', 'mustChangePassword', 'key', 'passwordHint'];

/** 忘記密碼提示：密碼 5 個字以上顯示第一個和最後一個字，較短的只顯示第一個字（不洩漏長度） */
export function makeHint(password: string): string {
  const c = Array.from(String(password || ''));
  if (c.length === 0) return '';
  return c.length >= 5 ? `${c[0]} ＊＊＊ ${c[c.length - 1]}` : `${c[0]} ＊＊＊`;
}
function publicProfile(d: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(d || {})) if (!PRIVATE_FIELDS.includes(k)) out[k] = v;
  return out;
}
/** 只保留可以由網頁寫入的欄位，並限制大小 */
function sanitizeProfile(p: any, name: string) {
  const out: any = {};
  for (const [k, v] of Object.entries(p || {})) if (!PRIVATE_FIELDS.includes(k) && v !== undefined) out[k] = v;
  out.studentName = name;
  if (Array.isArray(out.tradeHistory) && out.tradeHistory.length > 2000) out.tradeHistory = out.tradeHistory.slice(-2000);
  const size = Buffer.byteLength(JSON.stringify(out));
  if (size > 900_000) throw new Error('資料過大，請洽版主');
  return JSON.parse(JSON.stringify(out));
}

let listCache: { at: number; data: any[] } | null = null;
export async function listPlayers() {
  if (listCache && Date.now() - listCache.at < 5000) return listCache.data;
  const db = await getDb();
  const snap = await db.collection(COLLECTION).limit(1000).get();
  const data = snap.docs.map((d: any) => publicProfile(d.data()));
  data.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
  listCache = { at: Date.now(), data };
  return data;
}
const invalidate = () => { listCache = null; };

async function getRaw(name: string) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).doc(docIdOf(name)).get();
  return doc.exists ? doc.data() : null;
}

// ── 登入失敗限制 ──
const fails = new Map<string, number[]>();
function tooMany(key: string) {
  const now = Date.now();
  const arr = (fails.get(key) || []).filter(t => now - t < 15 * 60_000);
  fails.set(key, arr);
  return arr.length >= 8;
}
const addFail = (key: string) => fails.set(key, [...(fails.get(key) || []), Date.now()]);

export async function login(name: string, password: string, ip: string) {
  const n = cleanName(name);
  if (!n || !password) return { status: 400, body: { ok: false, error: '請輸入姓名與密碼' } };
  if (isReservedName(n)) return { status: 400, body: { ok: false, error: '最高管理者請用版主密碼登入' } };
  const lockKey = `${ip}|${nameKey(n)}`;
  if (tooMany(lockKey)) return { status: 429, body: { ok: false, error: '密碼錯誤次數過多，請 15 分鐘後再試' } };
  const raw = await getRaw(n);
  if (!raw) return { status: 404, body: { ok: false, notFound: true, error: `找不到學員「${n}」` } };
  if (!verifyPassword(password, raw.passwordHash)) {
    addFail(lockKey);
    return { status: 401, body: { ok: false, error: '密碼不正確' } };
  }
  fails.delete(lockKey);
  const mustChange = Boolean(raw.mustChangePassword) || password === DEFAULT_PASSWORD;
  const hint = makeHint(password);
  const patch: any = {};
  if (mustChange !== Boolean(raw.mustChangePassword)) patch.mustChangePassword = mustChange;
  if (raw.passwordHint !== hint) patch.passwordHint = hint; // 舊帳號登入一次就會有提示
  if (Object.keys(patch).length) {
    const db = await getDb();
    await db.collection(COLLECTION).doc(docIdOf(n)).update(patch);
  }
  return { status: 200, body: { ok: true, token: issueToken(raw.studentName), profile: publicProfile(raw), mustChangePassword: mustChange } };
}

/** 建立帳號（新註冊，或把舊瀏覽器裡的資料搬上來） */
// ── 忘記密碼提示（每個 IP 15 分鐘最多查 10 次） ──
const hintHits = new Map<string, number[]>();
export async function passwordHint(name: string, ip: string) {
  const n = cleanName(name);
  if (!n) return { status: 400, body: { ok: false, error: '請先輸入姓名' } };
  if (isReservedName(n)) return { status: 400, body: { ok: false, error: '最高管理者不提供密碼提示' } };
  const now = Date.now();
  const arr = (hintHits.get(ip) || []).filter(t => now - t < 15 * 60_000);
  if (arr.length >= 10) return { status: 429, body: { ok: false, error: '查詢次數過多，請 15 分鐘後再試' } };
  hintHits.set(ip, [...arr, now]);
  const raw = await getRaw(n);
  if (!raw) return { status: 404, body: { ok: false, notFound: true, error: `找不到學員「${n}」` } };
  if (raw.mustChangePassword && raw.passwordHint && raw.passwordHint !== makeHint(DEFAULT_PASSWORD)) {
    return { status: 200, body: { ok: true, hint: raw.passwordHint, note: '這是版主幫你重設的臨時密碼，登入後要設定新密碼。' } };
  }
  if (!raw.passwordHint) return { status: 200, body: { ok: true, hint: null, note: '這個帳號還沒有建立提示（上次登入是在這個功能上線之前）。請洽版主重設密碼。' } };
  return { status: 200, body: { ok: true, hint: raw.passwordHint } };
}

export async function register(profile: any, password: string, opts: { migrate?: boolean; legacyHash?: string } = {}) {
  const n = cleanName(profile?.studentName);
  if (!n) return { status: 400, body: { ok: false, error: '請輸入姓名' } };
  if (isReservedName(n)) return { status: 403, body: { ok: false, error: '這是最高管理者保留的名稱，請改用其他姓名' } };
  if (String(password || '').length < 3) return { status: 400, body: { ok: false, error: '密碼至少 3 個字元' } };
  // 搬家時，網頁要附上本機保存的舊密碼雜湊，且必須和剛輸入的密碼相符
  if (opts.migrate && opts.legacyHash && !legacyMatches(password, opts.legacyHash)) {
    return { status: 401, body: { ok: false, error: '密碼不正確' } };
  }
  const db = await getDb();
  const ref = db.collection(COLLECTION).doc(docIdOf(n));
  const now = Date.now();
  try {
    await db.runTransaction(async (tx: any) => {
      const cur = await tx.get(ref);
      if (cur.exists) throw Object.assign(new Error('exists'), { code: 'exists' });
      const data = {
        ...sanitizeProfile(profile, n),
        key: nameKey(n),
        passwordHash: scryptHash(password),
        passwordHint: makeHint(password),
        mustChangePassword: password === DEFAULT_PASSWORD,
        createdAt: profile?.createdAt || now,
        updatedAt: now,
        migratedAt: opts.migrate ? now : null,
      };
      tx.set(ref, data);
    });
  } catch (e: any) {
    if (e.code === 'exists') return { status: 409, body: { ok: false, error: `「${n}」已經有人使用，請直接登入或改用其他姓名` } };
    throw e;
  }
  invalidate();
  const raw = await getRaw(n);
  return { status: 200, body: { ok: true, token: issueToken(n), profile: publicProfile(raw), mustChangePassword: Boolean(raw?.mustChangePassword) } };
}

/** 儲存資產資料：學員只能存自己的；版主可存任何人 */
export async function saveProfile(actor: { player: string | null; admin: boolean }, profile: any) {
  const n = cleanName(profile?.studentName);
  if (!n) return { status: 400, body: { ok: false, error: '缺少姓名' } };
  if (!actor.admin && (!actor.player || actor.player !== nameKey(n))) return { status: 401, body: { ok: false, error: '請重新登入' } };
  const db = await getDb();
  const ref = db.collection(COLLECTION).doc(docIdOf(n));
  const cur = await ref.get();
  if (!cur.exists) {
    // 版主可以直接建立學員資料（尚未設定密碼前無法登入，請用「重設密碼」給臨時密碼）
    if (!actor.admin) return { status: 404, body: { ok: false, error: '找不到這位學員' } };
    await ref.set({ ...sanitizeProfile(profile, n), key: nameKey(n), mustChangePassword: true, createdAt: Date.now(), updatedAt: Date.now() });
    invalidate();
    return { status: 200, body: { ok: true, created: true } };
  }
  // 版主統一還原（例如正式競賽開始）之後，網頁上還留著的舊資料不能再寫回來
  const serverReset = Number(cur.data().resetAt || 0);
  if (!actor.admin && serverReset > Number(profile?.resetAt || 0)) {
    return { status: 409, body: { ok: false, stale: true, resetAt: serverReset, error: '資料已由版主統一還原，請重新整理頁面' } };
  }
  await ref.set({ ...sanitizeProfile(profile, cur.data().studentName || n), ...(serverReset ? { resetAt: serverReset } : {}), updatedAt: Date.now() }, { merge: true });
  invalidate();
  return { status: 200, body: { ok: true } };
}

export async function changePassword(actor: { player: string | null; admin: boolean }, name: string, current: string, next: string) {
  const n = cleanName(name);
  if (String(next || '').length < 4) return { status: 400, body: { ok: false, error: '新密碼至少 4 個字元' } };
  if (next === DEFAULT_PASSWORD) return { status: 400, body: { ok: false, error: '不能使用預設密碼，請換一組' } };
  const raw = await getRaw(n);
  if (!raw) return { status: 404, body: { ok: false, error: '找不到這位學員' } };
  if (!actor.admin) {
    if (actor.player !== nameKey(n)) return { status: 401, body: { ok: false, error: '請重新登入' } };
    if (!verifyPassword(current, raw.passwordHash)) return { status: 401, body: { ok: false, error: '目前密碼不正確' } };
  }
  const db = await getDb();
  await db.collection(COLLECTION).doc(docIdOf(n)).update({ passwordHash: scryptHash(next), passwordHint: makeHint(next), mustChangePassword: false, passwordChangedAt: Date.now() });
  return { status: 200, body: { ok: true } };
}

/** 版主：重設成臨時密碼（學員登入後必須立刻改） */
export async function adminResetPassword(name: string, temp: string) {
  const raw = await getRaw(name);
  if (!raw) return { status: 404, body: { ok: false, error: '找不到這位學員' } };
  if (String(temp || '').length < 3) return { status: 400, body: { ok: false, error: '臨時密碼至少 3 個字元' } };
  const db = await getDb();
  await db.collection(COLLECTION).doc(docIdOf(name)).update({ passwordHash: scryptHash(temp), passwordHint: makeHint(temp), mustChangePassword: true, passwordChangedAt: Date.now() });
  return { status: 200, body: { ok: true } };
}

export async function adminDelete(name: string) {
  const db = await getDb();
  await db.collection(COLLECTION).doc(docIdOf(name)).delete();
  invalidate();
  return { status: 200, body: { ok: true } };
}

/** 版主：資金歸零重來（保留帳號與密碼） */
export async function adminReset(name: string, initialCapital = 50_000_000) {
  const db = await getDb();
  const ref = db.collection(COLLECTION).doc(docIdOf(name));
  const cur = await ref.get();
  if (!cur.exists) return { status: 404, body: { ok: false, error: '找不到這位學員' } };
  await ref.set({ initialCapital, availableCash: initialCapital, marginDeposits: 0, netAssetValue: initialCapital, totalReturnPct: 0, positions: [], tradeHistory: [], updatedAt: Date.now() }, { merge: true });
  invalidate();
  return { status: 200, body: { ok: true } };
}
export async function adminResetAll() {
  const list = await listPlayers();
  for (const p of list) await adminReset(p.studentName);
  return { status: 200, body: { ok: true, count: list.length } };
}

// ───────── 全體還原（正式競賽開始） ─────────
/** 所有學員資產還原成初始資金：清空持倉與交易紀錄，帳號與密碼保留 */
export async function seasonResetAll(label: string, initialCapital = 50_000_000) {
  const db = await getDb();
  const snap = await db.collection(COLLECTION).limit(2000).get();
  const now = Date.now();
  let count = 0;
  for (const d of snap.docs) {
    await db.collection(COLLECTION).doc(d.id).set(
      {
        initialCapital, availableCash: initialCapital, marginDeposits: 0, netAssetValue: initialCapital, totalReturnPct: 0,
        realizedPnL: 0, cumulativeRealizedPnL: 0, positions: [], tradeHistory: [], immutableTransactions: [],
        resetAt: now, seasonLabel: label, updatedAt: now,
      },
      { merge: true }
    );
    count++;
  }
  invalidate();
  return { count, at: now };
}

/** 排定的全體還原只做一次：完成紀錄存在 access_control/season_resets */
export async function seasonResetDone(id: string): Promise<boolean> {
  const db = await getDb();
  const doc = await db.collection('access_control').doc('season_resets').get();
  return Boolean(doc.exists && doc.data()?.[id]);
}
export async function markSeasonResetDone(id: string, info: any) {
  const db = await getDb();
  await db.collection('access_control').doc('season_resets').set({ [id]: info }, { merge: true });
}
