/**
 * FinMind 台股（上市＋上櫃）歷史日 K 匯入工具
 *
 * 資料來源：FinMind TaiwanStockInfo / TaiwanStockPrice（原始）/ TaiwanStockPriceAdj（還原）
 * 寫入目標：
 *   1. Firestore（PayFireBase 的具名資料庫，預設 stock-history）— 給網頁畫 K 線
 *        kline_daily/{代號}_{年份}  一檔一年一份文件，欄位為「欄式陣列」以節省空間
 *        kline_meta/{代號}          代號、名稱、市場、產業、資料起訖日
 *        import_state/full          全量匯入進度（可中斷續跑）
 *   2. BigQuery（預設資料集 stock_history，表 tw_daily）— 給回測與統計
 *        一天一列，依月份分區、依 stock_id 叢集
 *
 * 用法：
 *   全量（從 1994-10-01 起）：npx tsx scripts/import-history.ts --mode full
 *   每日補資料：              npx tsx scripts/import-history.ts --mode daily [--date 2026-10-08]
 *   常用選項：--market twse|tpex|all  --limit 20（只跑前 N 檔，測試用）  --restart（忽略進度重跑）
 *            --sink cloud|local（local 會寫到 ./import-output，方便本機測試）
 *
 * 環境變數：FINMIND_API_TOKEN（必要）、GOOGLE_CLOUD_PROJECT（預設 payfirebase）、
 *          FIRESTORE_DATABASE（預設 stock-history）、BQ_DATASET（預設 stock_history）、BQ_LOCATION（預設 asia-east1）
 */
import fs from 'fs';
import path from 'path';

// ───────────────────────── 參數 ─────────────────────────
const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const MODE = (opt('mode', 'full') as 'full' | 'daily');
const MARKET = opt('market', 'all') as 'twse' | 'tpex' | 'all';
const LIMIT = opt('limit') ? Number(opt('limit')) : Infinity;
const RESTART = flag('restart');
const SINK = (opt('sink', 'cloud') as 'cloud' | 'local');
const START_DATE = opt('start', '1994-10-01')!;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'payfirebase';
const FS_DB = process.env.FIRESTORE_DATABASE || 'stock-history';
const BQ_DATASET = process.env.BQ_DATASET || 'stock_history';
const BQ_TABLE = 'tw_daily';
const BQ_LOCATION = process.env.BQ_LOCATION || 'asia-east1';
const TOKEN = (process.env.FINMIND_API_TOKEN || process.env.FINMIND_TOKEN || '').trim();
// 999 方案每小時 6,000 次；保留餘裕給網站本身，匯入程式最多每小時約 4,500 次
const MIN_INTERVAL_MS = Number(process.env.FINMIND_MIN_INTERVAL_MS || 800);

const todayTW = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
const DAILY_DATE = opt('date', todayTW())!;
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ───────────────────────── FinMind ─────────────────────────
let lastCall = 0;
let callCount = 0;
async function finmind(dataset: string, params: Record<string, string>): Promise<any[]> {
  for (let attempt = 1; ; attempt++) {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    callCount++;

    const url = new URL('https://api.finmindtrade.com/api/v4/data');
    url.searchParams.set('dataset', dataset);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (TOKEN) url.searchParams.set('token', TOKEN);

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
      });
      clearTimeout(t);
      const json: any = await res.json().catch(() => null);
      if (res.status === 402 || json?.status === 402) {
        log(`⏸ FinMind 每小時額度用完，等 10 分鐘再繼續（已呼叫 ${callCount} 次）`);
        await new Promise(r => setTimeout(r, 10 * 60 * 1000));
        continue;
      }
      if (!res.ok || !json || json.status !== 200) throw new Error(`HTTP ${res.status} ${json?.msg ?? ''}`);
      return Array.isArray(json.data) ? json.data : [];
    } catch (e: any) {
      if (attempt >= 4) throw new Error(`FinMind ${dataset} ${JSON.stringify(params)} 失敗：${e.message}`);
      log(`↻ ${dataset} ${params.data_id ?? params.start_date} 第 ${attempt} 次失敗（${e.message}），稍後重試`);
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
}

interface StockInfo {
  stock_id: string;
  stock_name: string;
  industry: string;
  market: 'twse' | 'tpex';
}

async function listStocks(): Promise<StockInfo[]> {
  const rows = await finmind('TaiwanStockInfo', {});
  // 同一代號可能有多筆（例如由興櫃轉上市），取日期最新的一筆
  const latest = new Map<string, any>();
  for (const r of rows) {
    const cur = latest.get(r.stock_id);
    if (!cur || String(r.date || '') > String(cur.date || '')) latest.set(r.stock_id, r);
  }
  return [...latest.values()]
    .filter(r => r.type === 'twse' || r.type === 'tpex')
    .filter(r => MARKET === 'all' || r.type === MARKET)
    .map(r => ({ stock_id: String(r.stock_id), stock_name: r.stock_name, industry: r.industry_category, market: r.type }))
    .sort((a, b) => a.stock_id.localeCompare(b.stock_id));
}

// ───────────────────────── 資料整理 ─────────────────────────
interface Bar {
  date: string;
  o: number; h: number; l: number; c: number; v: number; m: number;
  ao?: number; ah?: number; al?: number; ac?: number;
}

/** 合併原始與還原股價（以日期對齊），排除成交量為 0 且價格為 0 的無效列 */
function mergeBars(raw: any[], adj: any[]): Bar[] {
  const adjByDate = new Map(adj.map(r => [r.date, r]));
  const bars: Bar[] = [];
  for (const r of raw) {
    if (!(Number(r.close) > 0)) continue;
    const a = adjByDate.get(r.date);
    bars.push({
      date: r.date,
      o: r.open, h: r.max, l: r.min, c: r.close,
      v: r.Trading_Volume, m: r.Trading_money,
      ...(a && Number(a.close) > 0 ? { ao: a.open, ah: a.max, al: a.min, ac: a.close } : {}),
    });
  }
  return bars.sort((x, y) => x.date.localeCompare(y.date));
}

/** 切成年份文件（欄式陣列：同一索引就是同一天） */
function toYearDocs(info: StockInfo, bars: Bar[]) {
  const byYear = new Map<number, Bar[]>();
  for (const b of bars) {
    const y = Number(b.date.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(b);
  }
  return [...byYear.entries()].map(([year, list]) => ({
    id: `${info.stock_id}_${year}`,
    data: {
      stock_id: info.stock_id,
      name: info.stock_name,
      market: info.market,
      year,
      count: list.length,
      date: list.map(b => b.date),
      open: list.map(b => b.o),
      high: list.map(b => b.h),
      low: list.map(b => b.l),
      close: list.map(b => b.c),
      volume: list.map(b => b.v),
      amount: list.map(b => b.m),
      adj_open: list.map(b => b.ao ?? null),
      adj_high: list.map(b => b.ah ?? null),
      adj_low: list.map(b => b.al ?? null),
      adj_close: list.map(b => b.ac ?? null),
      source: 'FinMind TaiwanStockPrice / TaiwanStockPriceAdj',
    },
  }));
}

function toBqRows(info: StockInfo, bars: Bar[], loadedAt: string) {
  return bars.map(b => ({
    date: b.date,
    stock_id: info.stock_id,
    name: info.stock_name,
    market: info.market,
    industry: info.industry,
    open: b.o, high: b.h, low: b.l, close: b.c,
    volume: b.v, amount: b.m,
    adj_open: b.ao ?? null, adj_high: b.ah ?? null, adj_low: b.al ?? null, adj_close: b.ac ?? null,
    loaded_at: loadedAt,
  }));
}

// ───────────────────────── 寫入目標 ─────────────────────────
interface Sink {
  init(): Promise<void>;
  getProgress(): Promise<Set<string>>;
  markDone(ids: string[]): Promise<void>;
  writeStock(info: StockInfo, yearDocs: { id: string; data: any }[], meta: any): Promise<void>;
  /** 每日模式：把一天的資料併入該年份文件 */
  upsertDay(info: StockInfo, bar: Bar): Promise<void>;
  appendBq(rows: any[]): Promise<void>;
  /** 每日模式：先刪掉當天資料再寫入，重跑不會重複 */
  replaceBqDay(date: string, rows: any[]): Promise<void>;
  dedupeBq(): Promise<void>;
  close(): Promise<void>;
}

const BQ_SCHEMA = [
  { name: 'date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'stock_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'name', type: 'STRING' },
  { name: 'market', type: 'STRING' },
  { name: 'industry', type: 'STRING' },
  { name: 'open', type: 'FLOAT' }, { name: 'high', type: 'FLOAT' }, { name: 'low', type: 'FLOAT' }, { name: 'close', type: 'FLOAT' },
  { name: 'volume', type: 'INTEGER' }, { name: 'amount', type: 'INTEGER' },
  { name: 'adj_open', type: 'FLOAT' }, { name: 'adj_high', type: 'FLOAT' }, { name: 'adj_low', type: 'FLOAT' }, { name: 'adj_close', type: 'FLOAT' },
  { name: 'loaded_at', type: 'TIMESTAMP' },
];

async function cloudSink(): Promise<Sink> {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { BigQuery } = await import('@google-cloud/bigquery');

  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore(app, FS_DB);
  const bq = new BigQuery({ projectId: PROJECT, location: BQ_LOCATION });
  const dataset = bq.dataset(BQ_DATASET);
  const table = dataset.table(BQ_TABLE);
  const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bq-'));
  let writer = db.bulkWriter();

  async function loadNdjson(rows: any[], disposition: 'WRITE_APPEND' | 'WRITE_TRUNCATE', target = table) {
    if (rows.length === 0) return;
    const file = path.join(tmpDir, `rows-${Date.now()}.ndjson`);
    fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n'));
    // Load job 不收費（串流寫入才收費）
    await target.load(file, { sourceFormat: 'NEWLINE_DELIMITED_JSON', writeDisposition: disposition, schema: { fields: BQ_SCHEMA } } as any);
    fs.unlinkSync(file);
  }

  return {
    async init() {
      const [dsExists] = await dataset.exists();
      if (!dsExists) {
        await bq.createDataset(BQ_DATASET, { location: BQ_LOCATION });
        log(`✔ 已建立 BigQuery 資料集 ${BQ_DATASET}`);
      }
      const [tExists] = await table.exists();
      if (!tExists) {
        await dataset.createTable(BQ_TABLE, {
          schema: { fields: BQ_SCHEMA },
          timePartitioning: { type: 'MONTH', field: 'date' },
          clustering: { fields: ['stock_id'] },
          description: 'FinMind 台股上市上櫃日K（原始＋還原）',
        } as any);
        log(`✔ 已建立 BigQuery 表 ${BQ_DATASET}.${BQ_TABLE}`);
      }
    },
    async getProgress() {
      if (RESTART) return new Set();
      const snap = await db.collection('import_state').doc('full').get();
      return new Set<string>((snap.exists && snap.data()?.done) || []);
    },
    async markDone(ids) {
      await db.collection('import_state').doc('full').set(
        { done: FieldValue.arrayUnion(...ids), updatedAt: new Date().toISOString() },
        { merge: true }
      );
    },
    async writeStock(info, yearDocs, meta) {
      for (const d of yearDocs) writer.set(db.collection('kline_daily').doc(d.id), d.data);
      writer.set(db.collection('kline_meta').doc(info.stock_id), meta, { merge: true });
      await writer.flush();
    },
    async upsertDay(info, bar) {
      const year = Number(bar.date.slice(0, 4));
      const ref = db.collection('kline_daily').doc(`${info.stock_id}_${year}`);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d: any = snap.exists
          ? snap.data()
          : { stock_id: info.stock_id, name: info.stock_name, market: info.market, year, date: [], open: [], high: [], low: [], close: [], volume: [], amount: [], adj_open: [], adj_high: [], adj_low: [], adj_close: [], source: 'FinMind TaiwanStockPrice / TaiwanStockPriceAdj' };
        let i = d.date.indexOf(bar.date);
        const vals: Record<string, any> = {
          open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v, amount: bar.m,
          adj_open: bar.ao ?? null, adj_high: bar.ah ?? null, adj_low: bar.al ?? null, adj_close: bar.ac ?? null,
        };
        if (i < 0) {
          // 依日期插入正確位置
          i = d.date.findIndex((x: string) => x > bar.date);
          if (i < 0) i = d.date.length;
          d.date.splice(i, 0, bar.date);
          for (const [k, v] of Object.entries(vals)) d[k].splice(i, 0, v);
        } else {
          for (const [k, v] of Object.entries(vals)) d[k][i] = v;
        }
        d.count = d.date.length;
        tx.set(ref, d);
      });
      await db.collection('kline_meta').doc(info.stock_id).set(
        { stock_id: info.stock_id, name: info.stock_name, market: info.market, industry: info.industry, lastDate: bar.date, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    },
    async appendBq(rows) {
      await loadNdjson(rows, 'WRITE_APPEND');
    },
    async replaceBqDay(date, rows) {
      await bq.query({
        query: `DELETE FROM \`${PROJECT}.${BQ_DATASET}.${BQ_TABLE}\` WHERE date = @d`,
        params: { d: date },
        types: { d: 'DATE' },
        location: BQ_LOCATION,
      });
      await loadNdjson(rows, 'WRITE_APPEND');
    },
    async dedupeBq() {
      // 中斷續跑可能造成少數重複列，最後依 (stock_id, date) 去重
      await bq.query({
        query: `CREATE OR REPLACE TABLE \`${PROJECT}.${BQ_DATASET}.${BQ_TABLE}\`
                PARTITION BY DATE_TRUNC(date, MONTH) CLUSTER BY stock_id
                OPTIONS(description='FinMind 台股上市上櫃日K（原始＋還原）') AS
                SELECT * EXCEPT(rn) FROM (
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY stock_id, date ORDER BY loaded_at DESC) AS rn
                  FROM \`${PROJECT}.${BQ_DATASET}.${BQ_TABLE}\`) WHERE rn = 1`,
        location: BQ_LOCATION,
      });
      log('✔ BigQuery 已去除重複列');
    },
    async close() {
      await writer.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/** 本機測試用：寫到 ./import-output，不碰雲端 */
function localSink(): Sink {
  const out = path.resolve('import-output');
  fs.mkdirSync(path.join(out, 'kline_daily'), { recursive: true });
  fs.mkdirSync(path.join(out, 'kline_meta'), { recursive: true });
  const progressFile = path.join(out, 'progress.json');
  const bqFile = path.join(out, 'bq.ndjson');
  const readDoc = (p: string) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
  return {
    async init() {},
    async getProgress() {
      return new Set(RESTART ? [] : readDoc(progressFile)?.done || []);
    },
    async markDone(ids) {
      const cur = readDoc(progressFile)?.done || [];
      fs.writeFileSync(progressFile, JSON.stringify({ done: [...new Set([...cur, ...ids])] }));
    },
    async writeStock(info, yearDocs, meta) {
      for (const d of yearDocs) fs.writeFileSync(path.join(out, 'kline_daily', `${d.id}.json`), JSON.stringify(d.data));
      fs.writeFileSync(path.join(out, 'kline_meta', `${info.stock_id}.json`), JSON.stringify(meta));
    },
    async upsertDay(info, bar) {
      const year = Number(bar.date.slice(0, 4));
      const p = path.join(out, 'kline_daily', `${info.stock_id}_${year}.json`);
      const d = readDoc(p) || { stock_id: info.stock_id, year, date: [], open: [], high: [], low: [], close: [], volume: [], amount: [], adj_open: [], adj_high: [], adj_low: [], adj_close: [] };
      let i = d.date.indexOf(bar.date);
      const vals: Record<string, any> = { open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v, amount: bar.m, adj_open: bar.ao ?? null, adj_high: bar.ah ?? null, adj_low: bar.al ?? null, adj_close: bar.ac ?? null };
      if (i < 0) {
        i = d.date.findIndex((x: string) => x > bar.date);
        if (i < 0) i = d.date.length;
        d.date.splice(i, 0, bar.date);
        for (const [k, v] of Object.entries(vals)) d[k].splice(i, 0, v);
      } else for (const [k, v] of Object.entries(vals)) d[k][i] = v;
      d.count = d.date.length;
      fs.writeFileSync(p, JSON.stringify(d));
    },
    async appendBq(rows) {
      if (rows.length) fs.appendFileSync(bqFile, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    },
    async replaceBqDay(date, rows) {
      const kept = fs.existsSync(bqFile) ? fs.readFileSync(bqFile, 'utf8').split('\n').filter(l => l && JSON.parse(l).date !== date) : [];
      fs.writeFileSync(bqFile, [...kept, ...rows.map(r => JSON.stringify(r))].join('\n') + '\n');
    },
    async dedupeBq() {},
    async close() {},
  };
}

// ───────────────────────── 主流程 ─────────────────────────
async function runFull(sink: Sink) {
  const stocks = (await listStocks()).slice(0, LIMIT);
  const done = await sink.getProgress();
  const todo = stocks.filter(s => !done.has(s.stock_id));
  log(`📋 上市＋上櫃共 ${stocks.length} 檔，已完成 ${stocks.length - todo.length} 檔，本次要匯入 ${todo.length} 檔（自 ${START_DATE} 起）`);
  if (todo.length === 0) return;

  const loadedAt = new Date().toISOString();
  let bqBuffer: any[] = [];
  let pendingDone: string[] = [];
  let totalBars = 0;
  const failures: string[] = [];
  const started = Date.now();

  const flush = async () => {
    await sink.appendBq(bqBuffer);
    await sink.markDone(pendingDone);
    bqBuffer = [];
    pendingDone = [];
  };

  for (let i = 0; i < todo.length; i++) {
    const info = todo[i];
    try {
      const params = { data_id: info.stock_id, start_date: START_DATE, end_date: todayTW() };
      const raw = await finmind('TaiwanStockPrice', params);
      const adj = await finmind('TaiwanStockPriceAdj', params);
      const bars = mergeBars(raw, adj);
      if (bars.length > 0) {
        await sink.writeStock(info, toYearDocs(info, bars), {
          stock_id: info.stock_id,
          name: info.stock_name,
          market: info.market,
          industry: info.industry,
          firstDate: bars[0].date,
          lastDate: bars[bars.length - 1].date,
          years: [...new Set(bars.map(b => Number(b.date.slice(0, 4))))],
          bars: bars.length,
          updatedAt: new Date().toISOString(),
        });
        bqBuffer.push(...toBqRows(info, bars, loadedAt));
        totalBars += bars.length;
      }
      pendingDone.push(info.stock_id);
    } catch (e: any) {
      failures.push(info.stock_id);
      log(`✖ ${info.stock_id} ${info.stock_name}：${e.message}`);
    }

    if (pendingDone.length >= 50 || bqBuffer.length >= 200000) await flush();
    if ((i + 1) % 25 === 0 || i === todo.length - 1) {
      const rate = (i + 1) / ((Date.now() - started) / 3600000);
      const etaMin = Math.round(((todo.length - i - 1) / rate) * 60);
      log(`▶ ${i + 1}/${todo.length} 檔，累計 ${totalBars.toLocaleString()} 根日K，FinMind 呼叫 ${callCount} 次，預估剩 ${etaMin} 分鐘`);
    }
  }
  await flush();
  if (failures.length) log(`⚠ 有 ${failures.length} 檔失敗（重跑同一指令會自動補）：${failures.join(', ')}`);
  await sink.dedupeBq();
  log(`✅ 全量匯入完成：${todo.length - failures.length} 檔、${totalBars.toLocaleString()} 根日K`);
}

async function runDaily(sink: Sink) {
  const date = DAILY_DATE;
  log(`📅 每日模式：${date}`);
  // 999 方案可不指定 data_id，一次取得當天全部股票
  const raw = await finmind('TaiwanStockPrice', { start_date: date, end_date: date });
  if (raw.length === 0) {
    log(`ℹ ${date} 沒有交易資料（休市日，或 FinMind 尚未更新），結束`);
    return;
  }
  const adj = await finmind('TaiwanStockPriceAdj', { start_date: date, end_date: date });
  const stocks = await listStocks();
  const infoById = new Map(stocks.map(s => [s.stock_id, s]));
  const adjById = new Map(adj.map(r => [r.stock_id, r]));

  const loadedAt = new Date().toISOString();
  const bqRows: any[] = [];
  let n = 0;
  for (const r of raw) {
    const info = infoById.get(String(r.stock_id));
    if (!info) continue; // 只處理上市、上櫃
    const [bar] = mergeBars([r], adjById.has(r.stock_id) ? [adjById.get(r.stock_id)] : []);
    if (!bar) continue;
    await sink.upsertDay(info, bar);
    bqRows.push(...toBqRows(info, [bar], loadedAt));
    if (++n % 500 === 0) log(`▶ 已更新 ${n} 檔`);
  }
  await sink.replaceBqDay(date, bqRows);
  log(`✅ ${date} 已更新 ${n} 檔`);
}

async function main() {
  if (!TOKEN) log('⚠ 未設定 FINMIND_API_TOKEN，額度很低，全量匯入不會成功');
  log(`🚀 模式 ${MODE}｜市場 ${MARKET}｜寫入 ${SINK === 'local' ? './import-output' : `Firestore(${PROJECT}/${FS_DB}) + BigQuery(${BQ_DATASET}.${BQ_TABLE})`}`);
  const sink = SINK === 'local' ? localSink() : await cloudSink();
  await sink.init();
  try {
    if (MODE === 'daily') await runDaily(sink);
    else await runFull(sink);
  } finally {
    await sink.close();
  }
}

main().catch(e => {
  console.error('❌ 匯入失敗：', e);
  process.exit(1);
});
