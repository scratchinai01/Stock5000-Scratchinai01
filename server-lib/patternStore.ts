/**
 * 讀取每日型態掃描與歷史回測結果（Firestore stock-history / pattern_scan）
 * 伺服器記憶體快取 10 分鐘：不論多少人看，都只讀一次。
 */
let firestore: any = null;
async function getDb() {
  if (firestore) return firestore;
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = process.env.HISTORY_PROJECT || 'payfirebase';
  const app = getApps().find(a => a.name === 'pattern') || initializeApp({ credential: applicationDefault(), projectId }, 'pattern');
  firestore = getFirestore(app, process.env.HISTORY_DATABASE || 'stock-history');
  return firestore;
}

const TTL = 10 * 60 * 1000;
const cache: Record<string, { at: number; data: any; pending?: Promise<any> }> = {};

async function cached(key: string, load: () => Promise<any>) {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  if (hit?.pending) return hit.pending;
  const pending = load()
    .then(data => {
      cache[key] = { at: Date.now(), data };
      return data;
    })
    .catch(e => {
      if (cache[key]) delete cache[key].pending;
      throw e;
    });
  cache[key] = { at: hit?.at ?? 0, data: hit?.data, pending };
  return pending;
}

export function getPatternLatest() {
  return cached('latest', async () => {
    const db = await getDb();
    const meta = await db.collection('pattern_scan').doc('latest').get();
    if (!meta.exists) return null;
    const m = meta.data();
    const refs = Array.from({ length: m.chunks || 0 }, (_, i) => db.collection('pattern_scan').doc(`latest_${i}`));
    const docs = refs.length ? await db.getAll(...refs) : [];
    const rows = docs.flatMap((d: any) => (d.exists ? d.data().rows || [] : []));
    return { ...m, rows };
  });
}

export function getPatternBacktest() {
  return cached('backtest', async () => {
    const db = await getDb();
    const doc = await db.collection('pattern_scan').doc('backtest').get();
    return doc.exists ? doc.data() : null;
  });
}
