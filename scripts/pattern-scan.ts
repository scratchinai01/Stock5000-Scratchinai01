/**
 * 三角收斂突破掃描（Cloud Run 工作執行，一天一次）
 *
 *   npx tsx scripts/pattern-scan.ts daily     # 收盤後：掃描全市場最新型態，結果寫進 Firestore
 *   npx tsx scripts/pattern-scan.ts backtest  # 歷史回測：30 年全部突破事件與統計（規則改變時才需要重跑）
 *
 * 資料來源：BigQuery stock_history.tw_daily（還原股價）
 * 結果：Firestore（stock-history 資料庫）pattern_scan/latest*、pattern_backtest/summary
 * 網頁只讀取結果，使用人數多寡不影響運算費用。
 */
import { BigQuery } from '@google-cloud/bigquery';
import {
  DEFAULT_PARAMS,
  CHECK_KEYS,
  addToBucket,
  computeIndicators,
  detectBreakoutAt,
  emptyBucket,
  gradeOf,
  posBucket,
  scanLatest,
  simulate,
  summarize,
  volBucket,
  type Bucket,
  type EventRec,
  type ScanRow,
  type Series,
} from '../server-lib/pattern';

const MODE = (process.argv[2] || 'daily') as 'daily' | 'backtest';
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.HISTORY_PROJECT || 'payfirebase';
const BQ_DATASET = process.env.BQ_DATASET || 'stock_history';
const BQ_TABLE = process.env.BQ_TABLE || 'tw_daily';
const BQ_LOCATION = process.env.BQ_LOCATION || 'asia-east1';
const FS_DB = process.env.FIRESTORE_DATABASE || 'stock-history';
const P = DEFAULT_PARAMS;

const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function getDb() {
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  return getFirestore(app, FS_DB);
}

/** 依股票逐檔讀出日 K（資料已依 stock_id、date 排序） */
async function forEachSeries(whereDays: number | null, cb: (s: Series) => void) {
  const bq = new BigQuery({ projectId: PROJECT, location: BQ_LOCATION });
  const where = whereDays ? `WHERE date >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL ${whereDays} DAY)` : '';
  const query = `
    SELECT stock_id, name, market, CAST(date AS STRING) AS d,
      IFNULL(adj_open, open) AS o, IFNULL(adj_high, high) AS h, IFNULL(adj_low, low) AS l, IFNULL(adj_close, close) AS c,
      IFNULL(volume, 0) AS v
    FROM \`${PROJECT}.${BQ_DATASET}.${BQ_TABLE}\`
    ${where}
    ORDER BY stock_id, date`;
  let cur: Series | null = null;
  let rows = 0;
  await new Promise<void>((resolve, reject) => {
    bq.createQueryStream({ query, location: BQ_LOCATION })
      .on('error', reject)
      .on('data', (r: any) => {
        rows++;
        if (!cur || cur.id !== r.stock_id) {
          if (cur) cb(cur);
          cur = { id: r.stock_id, name: r.name || '', market: r.market || '', date: [], o: [], h: [], l: [], c: [], v: [] };
        }
        const o = Number(r.o), h = Number(r.h), l = Number(r.l), c = Number(r.c);
        if (!(c > 0) || !(h > 0) || !(l > 0)) return; // 停牌或缺值
        cur.date.push(r.d);
        cur.o.push(o > 0 ? o : c);
        cur.h.push(h);
        cur.l.push(l);
        cur.c.push(c);
        cur.v.push(Number(r.v) || 0);
        if (rows % 1_000_000 === 0) log(`已讀 ${rows.toLocaleString()} 筆`);
      })
      .on('end', () => {
        if (cur) cb(cur);
        resolve();
      });
  });
  log(`BigQuery 讀取完成：${rows.toLocaleString()} 筆`);
}

const isEtf = (id: string) => /^00/.test(id);

async function writeChunks(db: any, prefix: string, rows: any[], meta: Record<string, any>) {
  const CHUNK = 200;
  const chunks = Math.ceil(rows.length / CHUNK);
  for (let i = 0; i < chunks; i++) {
    await db.collection('pattern_scan').doc(`${prefix}_${i}`).set({ rows: rows.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  await db.collection('pattern_scan').doc(prefix).set({ ...meta, chunks, version: Date.now() });
}

async function daily() {
  const rows: ScanRow[] = [];
  let stocks = 0;
  let asOf = '';
  await forEachSeries(600, s => {
    stocks++;
    const lastDate = s.date[s.date.length - 1];
    if (lastDate > asOf) asOf = lastDate;
    try {
      const r = scanLatest(s, P);
      if (r) rows.push(r);
    } catch (e: any) {
      log('略過', s.id, e.message);
    }
  });
  // 只保留最新交易日仍有資料的股票（停牌、下市的不列）
  const fresh = rows.filter(r => r.date === asOf);
  const counts = {
    stocks,
    breakout: fresh.filter(r => r.status === 'breakout').length,
    confirming: fresh.filter(r => r.status === 'confirming').length,
    forming: fresh.filter(r => r.status === 'forming').length,
  };
  log(`掃描 ${stocks} 檔｜資料日 ${asOf}｜今日突破 ${counts.breakout}、確認中 ${counts.confirming}、收斂中 ${counts.forming}`);
  const db = await getDb();
  await writeChunks(db, 'latest', fresh, { asOf, generatedAt: new Date().toISOString(), params: P, counts });
  log('✅ 每日型態掃描完成');
}

async function backtest() {
  const buckets = new Map<string, Bucket>();
  const add = (key: string, o: any) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = emptyBucket()));
    addToBucket(b, o);
  };
  const recent: EventRec[] = [];
  let stocks = 0;
  let events = 0;
  let minDate = '9999';
  let maxDate = '0000';

  await forEachSeries(null, s => {
    stocks++;
    if (isEtf(s.id) || s.c.length < 200) return;
    const ind = computeIndicators(s, P);
    for (let t = 130; t < s.c.length - 1; t++) {
      if (!(ind.vma20[t - 1] >= 100_000)) continue; // 流動性：20 日均量至少 100 張
      const b = detectBreakoutAt(s, ind, t, P);
      if (!b) continue;
      const o = simulate(s, b, P);
      if (!o || o.result === 'open') continue;
      events++;
      const d = s.date[t];
      if (d < minDate) minDate = d;
      if (d > maxDate) maxDate = d;
      const side = b.side;
      add(`${side}|all`, o);
      add(`${side}|grade|${gradeOf(b.score)}`, o);
      add(`${side}|vol|${volBucket(b.volRatio)}`, o);
      add(`${side}|pos|${posBucket(b.position)}`, o);
      add(`${side}|shape|${b.tri.shape}`, o);
      add(`${side}|decade|${d.slice(0, 3)}0s`, o);
      for (const k of CHECK_KEYS) add(`${side}|check|${k}|${b.checks[k] ? 'yes' : 'no'}`, o);
      const core3 = b.checks.volume && b.checks.rsi && b.checks.price;
      add(`${side}|core3|${core3 ? 'yes' : 'no'}`, o);
      recent.push({ id: s.id, name: s.name, date: d, side, score: b.score, volRatio: Number(b.volRatio.toFixed(2)), position: Number(b.position.toFixed(2)), shape: b.tri.shape, checks: b.checks, breakPct: Number(b.breakPct.toFixed(4)), out: o });
      t += 10; // 同一個三角形不重複計算
    }
    if (stocks % 200 === 0) log(`回測進度 ${stocks} 檔，事件 ${events}`);
  });

  const stats: Record<string, ReturnType<typeof summarize>> = {};
  for (const [k, b] of buckets) stats[k] = summarize(b);
  recent.sort((a, b) => (a.date < b.date ? 1 : -1));
  const latestEvents = recent.slice(0, 300).map(e => ({
    ...e,
    out: { ...e.out, pnlPct: Number(e.out.pnlPct.toFixed(4)), ret5: e.out.ret5 == null ? null : Number(e.out.ret5.toFixed(4)), ret10: e.out.ret10 == null ? null : Number(e.out.ret10.toFixed(4)), ret20: e.out.ret20 == null ? null : Number(e.out.ret20.toFixed(4)), mfe: Number(e.out.mfe.toFixed(4)), mae: Number(e.out.mae.toFixed(4)), entry: Number(e.out.entry.toFixed(2)) },
  }));
  log(`回測完成：${stocks} 檔、${events} 個突破事件（${minDate} ~ ${maxDate}）`);
  const db = await getDb();
  await db.collection('pattern_scan').doc('backtest').set({
    generatedAt: new Date().toISOString(),
    params: P,
    stocks,
    events,
    range: [minDate, maxDate],
    stats,
    latestEvents,
  });
  log('✅ 歷史回測結果已寫入');
}

(MODE === 'backtest' ? backtest() : daily()).then(
  () => process.exit(0),
  e => {
    console.error('❌ 失敗', e);
    process.exit(1);
  }
);
