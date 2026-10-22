/**
 * 問題回報：學員填寫說明＋截圖，版主在後台查看、標記處理狀態並回覆
 * - 回報存在 Firestore（stock-history 資料庫）feedback 集合；截圖另存 feedback_images（每張一份文件，避免超過 1MB 上限）
 * - 截圖由前端先壓縮成 JPEG，每張最多 700KB、每次最多 3 張
 */
import type { Express } from 'express';
import crypto from 'crypto';

export type FeedbackStatus = 'new' | 'doing' | 'done';
export interface Feedback {
  id: string;
  name: string;
  loggedIn: boolean;
  category: string;
  text: string;
  contact: string;
  page: string;
  device: string;
  ua: string;
  version: string;
  ip: string;
  imageIds: string[];
  status: FeedbackStatus;
  reply: string;
  repliedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 700 * 1024 * 1.37; // base64 約比原檔大 37%
const CATEGORIES = ['下單／成交', '資產／排行計算', '報價／資料', '登入／密碼', '畫面顯示', '建議', '其他'];

// ── 資料庫（PLAYERS_MEMORY=1 時用記憶體，方便本機測試） ──
let db: any = null;
const mem = new Map<string, Map<string, any>>();
async function getDb() {
  if (db) return db;
  if (process.env.PLAYERS_MEMORY === '1') {
    const col = (name: string) => {
      if (!mem.has(name)) mem.set(name, new Map());
      const st = mem.get(name)!;
      return {
        doc: (id: string) => ({
          async get() { const d = st.get(id); return { exists: d !== undefined, data: () => d }; },
          async set(v: any) { st.set(id, JSON.parse(JSON.stringify(v))); },
          async update(v: any) { st.set(id, { ...st.get(id), ...v }); },
        }),
        orderBy: () => ({ limit: () => ({ async get() { return { docs: [...st.values()].sort((a, b) => b.createdAt - a.createdAt).map(d => ({ data: () => d })) }; } }) }),
        where: (_f: string, _o: string, v: any) => ({ async get() { return { docs: [...st.values()].filter(d => d.nameKey === v).map(d => ({ data: () => d })) }; } }),
      };
    };
    return (db = { collection: col });
  }
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps().find(a => a.name === 'feedback') || initializeApp({ credential: applicationDefault(), projectId: process.env.HISTORY_PROJECT || 'payfirebase' }, 'feedback');
  db = getFirestore(app, process.env.HISTORY_DATABASE || 'stock-history');
  return db;
}

const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const keyOf = (name: string) => name.trim().toLowerCase();
const newId = () => `FB${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

// 同一個 IP 一小時最多 15 筆，避免灌爆
const hits = new Map<string, number[]>();
function rateOk(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (list.length >= 15) return false;
  list.push(now);
  hits.set(ip, list);
  return true;
}

const publicView = (f: any) => {
  const { nameKey, ip, ua, ...rest } = f;
  return rest;
};

export function registerFeedbackRoutes(
  app: Express,
  deps: { playerFromToken: (req: any) => string | null; isAdmin: (req: any) => boolean; clientIp: (req: any) => string }
) {
  // 送出回報（登入、未登入都可以；未登入要自己填姓名，例如登不進去的同學）
  app.post('/api/feedback', async (req, res) => {
    try {
      const ip = deps.clientIp(req);
      if (!rateOk(ip)) return res.status(429).json({ ok: false, error: '回報太頻繁了，請一小時後再試' });
      const b = req.body || {};
      const player = deps.playerFromToken(req);
      const name = player || clean(b.name, 40);
      const text = clean(b.text, 3000);
      if (!name) return res.status(400).json({ ok: false, error: '請填寫姓名' });
      if (text.length < 4) return res.status(400).json({ ok: false, error: '請簡單描述遇到的問題（至少 4 個字）' });
      const images: string[] = Array.isArray(b.images) ? b.images.slice(0, MAX_IMAGES) : [];
      for (const im of images) {
        if (typeof im !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(im)) return res.status(400).json({ ok: false, error: '截圖格式不正確' });
        if (im.length > MAX_IMAGE_CHARS) return res.status(400).json({ ok: false, error: '截圖太大，請重新選擇' });
      }
      const d = await getDb();
      const id = newId();
      const imageIds: string[] = [];
      for (const [i, im] of images.entries()) {
        const imgId = `${id}_${i}`;
        await d.collection('feedback_images').doc(imgId).set({ id: imgId, feedbackId: id, data: im, createdAt: Date.now() });
        imageIds.push(imgId);
      }
      const now = Date.now();
      const fb: Feedback & { nameKey: string } = {
        id,
        name,
        nameKey: keyOf(name),
        loggedIn: Boolean(player),
        category: CATEGORIES.includes(b.category) ? b.category : '其他',
        text,
        contact: clean(b.contact, 100),
        page: clean(b.page, 120),
        device: clean(b.device, 60),
        ua: clean(req.headers['user-agent'], 300),
        version: clean(b.version, 60),
        ip,
        imageIds,
        status: 'new',
        reply: '',
        repliedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await d.collection('feedback').doc(id).set(fb);
      console.log(`[Feedback] ${name}：${fb.category}，${imageIds.length} 張截圖`);
      res.json({ ok: true, feedback: publicView(fb) });
    } catch (e: any) {
      console.warn('[Feedback] 寫入失敗', e.message);
      res.status(503).json({ ok: false, error: '回報暫時送不出去，請稍後再試' });
    }
  });

  // 我的回報（看版主回覆）
  app.get('/api/feedback/mine', async (req, res) => {
    const player = deps.playerFromToken(req);
    if (!player) return res.status(401).json({ ok: false, error: '請先登入' });
    try {
      const snap = await (await getDb()).collection('feedback').where('nameKey', '==', keyOf(player)).get();
      const list = snap.docs.map((x: any) => publicView(x.data())).sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 50);
      res.set('Cache-Control', 'no-store').json({ ok: true, list });
    } catch (e: any) {
      res.status(503).json({ ok: false, error: '暫時讀取不到，請稍後再試' });
    }
  });

  // 截圖（版主，或回報者本人）
  app.get('/api/feedback/image/:id', async (req, res) => {
    try {
      const d = await getDb();
      const img = await d.collection('feedback_images').doc(String(req.params.id)).get();
      if (!img.exists) return res.status(404).json({ ok: false });
      const data = img.data();
      if (!deps.isAdmin(req)) {
        const player = deps.playerFromToken(req);
        const fb = await d.collection('feedback').doc(String(data.feedbackId)).get();
        if (!player || !fb.exists || fb.data().nameKey !== keyOf(player)) return res.status(401).json({ ok: false });
      }
      const m = String(data.data).match(/^data:(image\/\w+);base64,(.+)$/);
      if (!m) return res.status(500).json({ ok: false });
      res.set('Content-Type', m[1]).set('Cache-Control', 'private, max-age=86400').send(Buffer.from(m[2], 'base64'));
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // 版主：列表
  app.get('/api/admin/feedback', async (req, res) => {
    if (!deps.isAdmin(req)) return res.status(401).json({ ok: false, error: '請重新登入版主帳號' });
    try {
      const snap = await (await getDb()).collection('feedback').orderBy('createdAt', 'desc').limit(300).get();
      res.set('Cache-Control', 'no-store').json({ ok: true, list: snap.docs.map((x: any) => { const { nameKey, ...r } = x.data(); return r; }) });
    } catch (e: any) {
      console.warn('[Feedback] 讀取失敗', e.message);
      res.status(503).json({ ok: false, error: '暫時讀取不到，請稍後再試' });
    }
  });

  // 版主：改狀態、回覆
  app.post('/api/admin/feedback/:id', async (req, res) => {
    if (!deps.isAdmin(req)) return res.status(401).json({ ok: false, error: '請重新登入版主帳號' });
    try {
      const ref = (await getDb()).collection('feedback').doc(String(req.params.id));
      const cur = await ref.get();
      if (!cur.exists) return res.status(404).json({ ok: false, error: '找不到這筆回報' });
      const patch: any = { updatedAt: Date.now() };
      if (['new', 'doing', 'done'].includes(req.body?.status)) patch.status = req.body.status;
      if (typeof req.body?.reply === 'string') {
        patch.reply = clean(req.body.reply, 2000);
        patch.repliedAt = patch.reply ? Date.now() : null;
      }
      await ref.update(patch);
      const { nameKey, ...r } = { ...cur.data(), ...patch };
      res.json({ ok: true, feedback: r });
    } catch (e: any) {
      res.status(503).json({ ok: false, error: '更新失敗，請稍後再試' });
    }
  });
}

export const FEEDBACK_CATEGORIES = CATEGORIES;
