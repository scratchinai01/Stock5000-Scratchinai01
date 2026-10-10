/**
 * 循環股學習研究（教學實驗）— Cloud Run 工作
 *
 *   npx tsx scripts/learn-scan.ts study      # 研究名單：單檔訓練 vs 同產業合併訓練，寫進 Firestore learn_scan/study
 *   npx tsx scripts/learn-scan.ts discover   # 全市場：用歷史波段高低點找出循環最明顯的股票，寫進 learn_scan/cyclicality
 *
 * 研究流程：1995–2004 訓練 → 推測 2005–2014；1995–2014 訓練 → 推測 2015 至今（模型凍結、不偷看未來）。
 * 資料來源：BigQuery stock_history.tw_daily（還原股價）。網頁只讀結果。
 */
import { BigQuery } from '@google-cloud/bigquery';
import type { BacktestParams, DailySeries } from '../src/utils/analytics';
import {
  DEFAULT_LEARN, makeMember, runLearning, runPooled, zigzag, cycleStats, topWeights, POLICY_FEATURE_NAMES, FEATURE_NAMES,
  type MemberRound, type Member,
} from '../src/utils/learn';

const MODE = (process.argv[2] || 'study') as 'study' | 'discover';
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.HISTORY_PROJECT || 'payfirebase';
const BQ_LOCATION = process.env.BQ_LOCATION || 'asia-east1';
const FS_DB = process.env.FIRESTORE_DATABASE || 'stock-history';
const TABLE = `\`${PROJECT}.${process.env.BQ_DATASET || 'stock_history'}.${process.env.BQ_TABLE || 'tw_daily'}\``;
const VERSION = 'learn-1.0-edu';

/** 研究名單：五個景氣循環產業 + 兩檔對照組 */
export const STUDY_GROUPS = [
  { key: 'memory', label: '記憶體', desc: 'DRAM／NOR Flash 報價循環', ids: ['2408', '2344', '2337'] },
  { key: 'panel', label: '面板', desc: '面板報價與產能循環', ids: ['2409', '3481', '6116'] },
  { key: 'shipping', label: '航運', desc: '運價循環、波動最大', ids: ['2603', '2609', '2615', '2606'] },
  { key: 'steel', label: '鋼鐵', desc: '鋼價與庫存循環', ids: ['2002', '2014', '2027', '2023'] },
  { key: 'plastic', label: '塑化', desc: '油價與石化報價循環', ids: ['1301', '1303', '1326'] },
  { key: 'control', label: '對照組', desc: '長期成長／防禦型，不做合併訓練', ids: ['2330', '2412'] },
] as const;

const PARAMS: BacktestParams = {
  strategy: 'ma_cross', capital: 1_000_000, feeRate: 0.001425, feeDiscount: 1, minFee: 20, taxRate: 0.003,
  short: 20, long: 60, rsiPeriod: 14, rsiLow: 30, rsiHigh: 70, bollPeriod: 20, bollMult: 2,
  maPeriod: 60, macdFast: 12, macdSlow: 26, macdSignal: 9, donchianIn: 20, donchianOut: 10,
  dmiPeriod: 14, adxMin: 20, sarStep: 0.02, sarMax: 0.2, momPeriod: 120, biasPeriod: 20, biasPct: 7,
  wrPeriod: 14, wrBuy: 80, wrSell: 20, downDays: 3, holdDays: 5, vbPeriod: 20, vbMult: 2, obvPeriod: 20,
};

const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const bq = new BigQuery({ projectId: PROJECT, location: BQ_LOCATION });

async function getDb() {
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  return getFirestore(app, FS_DB);
}

interface Loaded { id: string; name: string; industry: string; s: DailySeries }

/** 逐檔讀出還原股價；ids 為 null 時讀全部普通股 */
async function load(ids: string[] | null, cb: (x: Loaded) => void) {
  const where = ids ? `stock_id IN (${ids.map(i => `'${i.replace(/[^0-9A-Z]/g, '')}'`).join(',')})` : `REGEXP_CONTAINS(stock_id, r'^[1-9][0-9]{3}$')`;
  const sql = `
    SELECT stock_id, name, industry, CAST(date AS STRING) d,
      adj_open o, adj_high h, adj_low l, adj_close c, IFNULL(volume, 0) v
    FROM ${TABLE} WHERE ${where} AND adj_close IS NOT NULL
    ORDER BY stock_id, date`;
  let cur: Loaded | null = null, rows = 0;
  await new Promise<void>((resolve, reject) => {
    bq.createQueryStream({ query: sql, location: BQ_LOCATION })
      .on('error', reject)
      .on('data', (r: any) => {
        rows++;
        if (!cur || cur.id !== r.stock_id) {
          if (cur) cb(cur);
          cur = { id: r.stock_id, name: r.name || '', industry: r.industry || '', s: { date: [], open: [], high: [], low: [], close: [], volume: [] } };
        }
        if (r.name) cur.name = r.name;
        if (r.industry) cur.industry = r.industry;
        const c = Number(r.c);
        if (!(c > 0)) return;
        const o = Number(r.o), h = Number(r.h), l = Number(r.l);
        cur.s.date.push(r.d); cur.s.open.push(o > 0 ? o : c); cur.s.high.push(h > 0 ? h : c); cur.s.low.push(l > 0 ? l : c);
        cur.s.close.push(c); cur.s.volume.push(Number(r.v) || 0);
      })
      .on('end', () => { if (cur) cb(cur); resolve(); });
  });
  log(`BigQuery 讀取 ${rows.toLocaleString()} 筆`);
}

const r1 = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const r4 = (x: number | null | undefined) => r1(x, 4);

function packRound(r: MemberRound) {
  const v = (k: 0 | 1) => {
    const x = r.variants[k];
    return { train: r1(x.trainScore), test: r1(x.testScore), cagr: r4(x.bt.stats?.cagr), mdd: r4(x.bt.stats?.maxDrawdown), sharpe: r1(x.bt.stats?.sharpe, 2), trades: x.bt.closedTrades, exposure: r1(x.exposure, 3) };
  };
  return {
    name: r.name, trainFrom: r.trainFrom, trainTo: r.trainTo, testFrom: r.testFrom, testTo: r.testTo, trainYears: r1(r.trainYears),
    raw: v(0), smooth: v(1),
    bench: { train: r1(r.bench.trainScore), test: r1(r.bench.testScore), cagr: r4(r.bench.bt.stats?.cagr), mdd: r4(r.bench.bt.stats?.maxDrawdown), sharpe: r1(r.bench.bt.stats?.sharpe, 2) },
    cycle: { acc: r1(r.cycle.acc, 3), baseAcc: r1(r.cycle.baseAcc, 3), auc: r1(r.cycle.auc, 3), troughLag: r.cycle.troughLag, peakLag: r.cycle.peakLag, turns: r.cycle.turns, detected: r.cycle.detected },
  };
}

async function study() {
  const ids = STUDY_GROUPS.flatMap(g => [...g.ids]);
  const loaded = new Map<string, Loaded>();
  await load(ids, x => loaded.set(x.id, x));
  const o = DEFAULT_LEARN;
  const stocks: any[] = [];
  const groups: any[] = [];
  let asOf = '';
  for (const g of STUDY_GROUPS) {
    const members: Member[] = [];
    for (const id of g.ids) {
      const x = loaded.get(id);
      if (!x || x.s.close.length < 600) { log(`略過 ${id}：資料不足`); continue; }
      members.push(makeMember(x.id, x.name, x.s, PARAMS));
      if (x.s.date[x.s.date.length - 1] > asOf) asOf = x.s.date[x.s.date.length - 1];
    }
    const pooled = g.key === 'control' ? null : runPooled(members, PARAMS, o);
    for (const m of members) {
      const t0 = Date.now();
      const single = runLearning(m.s, PARAMS, o, m.id, m.name);
      const x = loaded.get(m.id)!;
      stocks.push({
        id: m.id, name: m.name, industry: x.industry, group: g.key,
        first: m.s.date[0], last: m.s.date[m.s.date.length - 1],
        cycles: (() => { const c = cycleStats(m.s.close, zigzag(m.s.close, 0, m.s.close.length - 1, o.theta)); return { cycles: c.cycles, avgYears: r1(c.avgYears, 2), avgRise: r4(c.avgRise), avgFall: r4(c.avgFall), pivots: c.pivots }; })(),
        single: single.rounds.map(packRound),
        singleWarnings: single.warnings,
        pooled: pooled ? (pooled.get(m.id) ?? []).map(packRound) : [],
      });
      log(`${g.label} ${m.id} ${m.name} 完成（${Date.now() - t0} ms）`);
    }
    const last = pooled?.models[pooled.models.length - 1];
    groups.push({
      key: g.key, label: g.label, desc: g.desc, ids: [...g.ids],
      pooledMembers: pooled?.models.map(x => ({ name: x.name, members: x.models.members })) ?? [],
      weights: last ? (() => { const t = topWeights(last.models.smooth, POLICY_FEATURE_NAMES, 6); return { round: last.name, pos: t.pos.map(x => ({ name: x.name, w: r1(x.w, 3) })), neg: t.neg.map(x => ({ name: x.name, w: r1(x.w, 3) })) }; })() : null,
      cycleWeights: last ? (() => { const t = topWeights(last.models.cycle, FEATURE_NAMES, 5); return { pos: t.pos.map(x => ({ name: x.name, w: r1(x.w, 3) })), neg: t.neg.map(x => ({ name: x.name, w: r1(x.w, 3) })) }; })() : null,
    });
  }
  const db = await getDb();
  await db.collection('learn_scan').doc('study').set({
    version: VERSION, asOf, generatedAt: new Date().toISOString(),
    options: o, cost: { feeRate: PARAMS.feeRate, taxRate: PARAMS.taxRate },
    groups, stocks,
  });
  log(`寫入 learn_scan/study：${stocks.length} 檔、${groups.length} 組`);
}

async function discover() {
  const o = DEFAULT_LEARN;
  const rows: any[] = [];
  let asOf = '';
  await load(null, x => {
    const n = x.s.close.length;
    if (n < 2500) return; // 至少約 10 年資料
    const last = x.s.date[n - 1];
    if (last > asOf) asOf = last;
    const piv = zigzag(x.s.close, 0, n - 1, o.theta);
    const c = cycleStats(x.s.close, piv);
    const years = n / 250;
    rows.push({
      id: x.id, name: x.name, industry: x.industry, first: x.s.date[0], last, years: r1(years),
      cycles: c.cycles, perDecade: r1((c.cycles / years) * 10, 2), avgYears: r1(c.avgYears, 2), avgRise: r4(c.avgRise), avgFall: r4(c.avgFall),
    });
  });
  // 只保留仍在交易的股票，依「每 10 年完整循環次數 × 平均漲幅」排序
  const live = rows.filter(r => r.last >= asOf.slice(0, 4) + '-01-01');
  live.sort((a, b) => (b.perDecade ?? 0) * (b.avgRise ?? 0) - (a.perDecade ?? 0) * (a.avgRise ?? 0));
  const byIndustry = new Map<string, { n: number; perDecade: number; rise: number }>();
  for (const r of live) {
    const k = r.industry || '其他';
    const v = byIndustry.get(k) ?? { n: 0, perDecade: 0, rise: 0 };
    v.n++; v.perDecade += r.perDecade; v.rise += r.avgRise ?? 0;
    byIndustry.set(k, v);
  }
  const industries = [...byIndustry.entries()].filter(([, v]) => v.n >= 5)
    .map(([k, v]) => ({ industry: k, stocks: v.n, perDecade: r1(v.perDecade / v.n, 2), avgRise: r4(v.rise / v.n) }))
    .sort((a, b) => (b.perDecade ?? 0) * (b.avgRise ?? 0) - (a.perDecade ?? 0) * (a.avgRise ?? 0));
  const db = await getDb();
  await db.collection('learn_scan').doc('cyclicality').set({
    version: VERSION, asOf, generatedAt: new Date().toISOString(), theta: o.theta,
    total: live.length, top: live.slice(0, 60), industries,
  });
  log(`寫入 learn_scan/cyclicality：${live.length} 檔、${industries.length} 個產業`);
}

(MODE === 'discover' ? discover() : study()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
