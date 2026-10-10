/**
 * 台股下跌預警系統 2.0（教學版）— Cloud Run 工作，一天一次
 *
 *   npx tsx scripts/risk-scan.ts daily     # 收盤後：全市場風險分數，寫進 Firestore risk_scan/latest*
 *   npx tsx scripts/risk-scan.ts backtest  # 30 年回測 + 羅吉斯迴歸，寫進 risk_scan/backtest（規則改變時才需要重跑）
 *
 * 資料來源：BigQuery stock_history.tw_daily（還原股價）。網頁只讀結果，使用人數不影響運算費用。
 */
import { BigQuery } from '@google-cloud/bigquery';
import { sma, type Series } from '../server-lib/pattern';
import {
  FACTOR_KEYS,
  FACTOR_NAMES,
  FACTOR_WEIGHTS,
  LEVELS,
  MIN_BARS,
  NOT_INCLUDED,
  SIGNALS,
  addHist,
  alertScore,
  alertWeights,
  signalVector,
  computeRisk,
  emptyHist,
  evalProb,
  forwardAt,
  levelStats,
  predictLogit,
  riskRowLatest,
  thresholdStats,
  trainLogit,
  type LogitModel,
  type MarketContext,
  type RiskRow,
  type ScoreHist,
} from '../server-lib/risk';

const MODE = (process.argv[2] || 'daily') as 'daily' | 'backtest';
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.HISTORY_PROJECT || 'payfirebase';
const BQ_DATASET = process.env.BQ_DATASET || 'stock_history';
const BQ_TABLE = process.env.BQ_TABLE || 'tw_daily';
const BQ_LOCATION = process.env.BQ_LOCATION || 'asia-east1';
const FS_DB = process.env.FIRESTORE_DATABASE || 'stock-history';
const TABLE = `\`${PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;
const STOCK_RE = `r'^[1-9][0-9]{3}$'`; // 一般普通股（不含 ETF、特別股、權證）
const EV_THRESHOLD = -0.1; // 「重大下跌」：未來 20 日內最大回落超過 10%
const MAJOR = -0.15; // 提前時間分析用：最大回落超過 15%
const VERSION = 'risk-2.0-edu.1';

const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const bq = new BigQuery({ projectId: PROJECT, location: BQ_LOCATION });

async function getDb() {
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  return getFirestore(app, FS_DB);
}

async function query(sql: string) {
  const [rows] = await bq.query({ query: sql, location: BQ_LOCATION });
  return rows as any[];
}

/** 市場背景：加權指數季線、全市場下跌家數、產業 20 日報酬 */
async function buildContext(sinceDays: number | null) {
  const where = sinceDays ? `AND date >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL ${sinceDays + 120} DAY)` : '';
  const taiex = await query(`SELECT CAST(date AS STRING) d, IFNULL(adj_close, close) c FROM ${TABLE} WHERE stock_id = 'TAIEX' ${where} ORDER BY date`);
  const tc = taiex.map(r => Number(r.c));
  const tma = sma(tc, 60);
  const taiexWeak = new Map<string, boolean>();
  const taiexR20 = new Map<string, number>();
  taiex.forEach((r, i) => {
    if (isFinite(tma[i])) taiexWeak.set(r.d, tc[i] < tma[i]);
    if (i >= 20 && tc[i - 20] > 0) taiexR20.set(r.d, tc[i] / tc[i - 20] - 1);
  });

  const daily = await query(`
    WITH s AS (
      SELECT date, stock_id, industry, IFNULL(adj_close, close) c,
        LAG(IFNULL(adj_close, close)) OVER (PARTITION BY stock_id ORDER BY date) pc
      FROM ${TABLE} WHERE REGEXP_CONTAINS(stock_id, ${STOCK_RE}) ${where})
    SELECT CAST(date AS STRING) d, IFNULL(industry, '') ind, COUNT(*) n, COUNTIF(c < pc) dn, AVG(c / pc - 1) r
    FROM s WHERE pc > 0 GROUP BY d, ind ORDER BY d`);
  const byDate = new Map<string, { n: number; dn: number }>();
  const indRet = new Map<string, { d: string; r: number }[]>();
  for (const r of daily) {
    const x = byDate.get(r.d) || { n: 0, dn: 0 };
    x.n += Number(r.n);
    x.dn += Number(r.dn);
    byDate.set(r.d, x);
    if (r.ind && Number(r.n) >= 3) {
      if (!indRet.has(r.ind)) indRet.set(r.ind, []);
      indRet.get(r.ind)!.push({ d: r.d, r: Number(r.r) });
    }
  }
  const dates = [...byDate.keys()].sort();
  const breadth = new Map<string, number>();
  for (let i = 4; i < dates.length; i++) {
    let s = 0;
    for (let k = i - 4; k <= i; k++) {
      const x = byDate.get(dates[k])!;
      s += x.dn / x.n;
    }
    breadth.set(dates[i], s / 5);
  }
  const ind20 = new Map<string, number>();
  for (const [ind, arr] of indRet) {
    for (let i = 19; i < arr.length; i++) {
      let p = 1;
      for (let k = i - 19; k <= i; k++) p *= 1 + arr[k].r;
      ind20.set(`${ind}|${arr[i].d}`, p - 1);
    }
  }
  log(`市場背景：加權指數 ${taiexWeak.size} 天、下跌家數 ${breadth.size} 天、產業 ${indRet.size} 個`);
  const ctx: MarketContext = {
    taiexWeak: d => taiexWeak.get(d),
    taiexRet20: d => taiexR20.get(d),
    breadth: d => breadth.get(d),
    industryRet20: (ind, d) => ind20.get(`${ind}|${d}`),
  };
  return { ctx, taiexWeak, breadth, ind20, indNames: [...indRet.keys()], lastDate: dates[dates.length - 1] };
}

/** 依股票逐檔讀出日 K（已依 stock_id、date 排序） */
async function forEachSeries(sinceDays: number | null, cb: (s: Series, industry: string | null) => void) {
  const where = sinceDays ? `AND date >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL ${sinceDays} DAY)` : '';
  const sql = `
    SELECT stock_id, name, market, industry, CAST(date AS STRING) AS d,
      IFNULL(adj_open, open) AS o, IFNULL(adj_high, high) AS h, IFNULL(adj_low, low) AS l, IFNULL(adj_close, close) AS c,
      IFNULL(volume, 0) AS v
    FROM ${TABLE} WHERE REGEXP_CONTAINS(stock_id, ${STOCK_RE}) ${where}
    ORDER BY stock_id, date`;
  let cur: Series | null = null;
  let ind: string | null = null;
  let rows = 0;
  await new Promise<void>((resolve, reject) => {
    bq.createQueryStream({ query: sql, location: BQ_LOCATION })
      .on('error', reject)
      .on('data', (r: any) => {
        rows++;
        if (!cur || cur.id !== r.stock_id) {
          if (cur) cb(cur, ind);
          cur = { id: r.stock_id, name: r.name || '', market: r.market || '', date: [], o: [], h: [], l: [], c: [], v: [] };
          ind = r.industry || null;
        }
        const o = Number(r.o), h = Number(r.h), l = Number(r.l), c = Number(r.c);
        if (!(c > 0) || !(h > 0) || !(l > 0)) return;
        cur.date.push(r.d);
        cur.o.push(o > 0 ? o : c);
        cur.h.push(h);
        cur.l.push(l);
        cur.c.push(c);
        cur.v.push(Number(r.v) || 0);
        if (rows % 1_000_000 === 0) log(`已讀 ${rows.toLocaleString()} 筆`);
      })
      .on('end', () => {
        if (cur) cb(cur, ind);
        resolve();
      });
  });
  log(`BigQuery 讀取完成：${rows.toLocaleString()} 筆`);
}

const LOGIT_TARGETS = [
  { key: 'd5', label: '未來 5 個交易日下跌超過 5%', y: (f: any) => f.ret5 <= -0.05 },
  { key: 'd10', label: '未來 10 個交易日下跌超過 8%', y: (f: any) => f.ret10 <= -0.08 },
  { key: 'd20', label: '未來 20 個交易日下跌超過 10%', y: (f: any) => f.ret20 <= -0.1 },
  { key: 'mdd', label: '未來 20 個交易日內最大回落超過 15%', y: (f: any) => f.mdd20 <= -0.15 },
] as const;
const LOGIT_FEATURES = FACTOR_KEYS.map(k => `${k} ${FACTOR_NAMES[k]}`);

// ───────────────────────── 每日 ─────────────────────────
async function daily() {
  const { ctx, taiexWeak, breadth, ind20, indNames, lastDate } = await buildContext(450);
  const db = await getDb();
  const bt = await db.collection('risk_scan').doc('backtest').get();
  const models: Record<string, LogitModel> = (bt.exists && bt.data()?.models) || {};
  const trainLift = bt.exists ? bt.data()?.alert?.trainLift : null;
  const aw = trainLift ? alertWeights(trainLift) : undefined;
  const sigModel: LogitModel | undefined = models.sig;

  const rows: (RiskRow & { prob?: Record<string, number> })[] = [];
  let stocks = 0;
  await forEachSeries(450, (s, ind) => {
    stocks++;
    try {
      const r = riskRowLatest(s, ind, ctx, aw, sigModel);
      if (!r || r.date !== lastDate) return; // 停牌、下市的不列
      const prob: Record<string, number> = {};
      for (const t of LOGIT_TARGETS) if (models[t.key]) prob[t.key] = Math.round(predictLogit(models[t.key], r.F) * 1000) / 1000;
      rows.push(Object.keys(prob).length ? { ...r, prob } : r);
    } catch (e: any) {
      log('略過', s.id, e.message);
    }
  });
  rows.sort((a, b) => b.score - a.score);
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) counts[r.level]++;
  const industries = indNames
    .map(name => ({ name, ret20: ind20.get(`${name}|${lastDate}`) }))
    .filter(x => x.ret20 != null)
    .map(x => ({ name: x.name, ret20: Number(x.ret20!.toFixed(4)), n: rows.filter(r => r.industry === x.name).length, avgScore: 0 }))
    .filter(x => x.n > 0);
  for (const x of industries) {
    const list = rows.filter(r => r.industry === x.name);
    x.avgScore = Number((list.reduce((a, r) => a + r.score, 0) / list.length).toFixed(1));
  }
  industries.sort((a, b) => b.avgScore - a.avgScore);
  const avgScore = rows.length ? Number((rows.reduce((a, r) => a + r.score, 0) / rows.length).toFixed(1)) : 0;
  const market = { taiexWeak: taiexWeak.get(lastDate) ?? null, breadth5: breadth.has(lastDate) ? Number(breadth.get(lastDate)!.toFixed(3)) : null, avgScore };
  log(`風險掃描 ${stocks} 檔｜資料日 ${lastDate}｜低 ${counts[0]}、留意 ${counts[1]}、警戒 ${counts[2]}、高 ${counts[3]}、極高 ${counts[4]}`);

  const CHUNK = 150;
  const chunks = Math.ceil(rows.length / CHUNK);
  for (let i = 0; i < chunks; i++) await db.collection('risk_scan').doc(`latest_${i}`).set({ rows: rows.slice(i * CHUNK, (i + 1) * CHUNK) });
  await db.collection('risk_scan').doc('latest').set({
    asOf: lastDate,
    generatedAt: new Date().toISOString(),
    version: VERSION,
    counts,
    market,
    industries,
    chunks,
    hasModels: Object.keys(models).length > 0,
    hasAlert: !!aw,
    nSignals: SIGNALS.length,
    alertBase: bt.exists ? bt.data()?.alert?.test?.baseRate ?? null : null,
  });
  log('✅ 每日風險掃描完成');
}

// ───────────────────────── 回測 ─────────────────────────
interface Lift {
  n1: number;
  ev1: number;
  n0: number;
  ev0: number;
}
const emptyLift = (): Lift => ({ n1: 0, ev1: 0, n0: 0, ev0: 0 });

function maxDrawdown(eq: number[]) {
  let peak = -Infinity;
  let mdd = 0;
  for (const x of eq) {
    if (x > peak) peak = x;
    const dd = x / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function backtest() {
  const { ctx } = await buildContext(null);
  const all = emptyHist();
  const eras: Record<string, ScoreHist> = { '1990s–2000s': emptyHist(), '2010s': emptyHist(), '2020s': emptyHist() };
  const factorLift = Object.fromEntries(FACTOR_KEYS.map(k => [k, emptyLift()])) as Record<string, Lift>;
  const signalLift = Object.fromEntries(SIGNALS.map(s => [s.key, emptyLift()])) as Record<string, Lift>;
  // 只用 2015 年前資料算的訊號預警倍數（警戒分數權重用，避免偷看測試期）
  const trainSigLift = Object.fromEntries(SIGNALS.map(s => [s.key, emptyLift()])) as Record<string, Lift>;
  const trainSig: Float32Array[] = [];
  const trainSigY: number[] = [];
  const testSig: Float32Array[] = [];
  const testSigY: number[] = [];
  // 機器學習樣本（2015 年前訓練、之後測試）
  const trainX: Float32Array[] = [];
  const trainY: Record<string, number[]> = Object.fromEntries(LOGIT_TARGETS.map(t => [t.key, []]));
  const testX: Float32Array[] = [];
  const testY: Record<string, number[]> = Object.fromEntries(LOGIT_TARGETS.map(t => [t.key, []]));
  const testScore: number[] = [];
  // 提前時間
  const lead: Record<string, { events: number; warned: number; leadSum: number }> = { '40': { events: 0, warned: 0, leadSum: 0 }, '60': { events: 0, warned: 0, leadSum: 0 } };
  // 導入預警後的最大回撤
  const mddBH: number[] = [];
  const mddST: number[] = [];
  const retBH: number[] = [];
  const retST: number[] = [];
  const inMkt: number[] = [];
  let improved = 0;
  const cases: any[] = [];

  let stocks = 0;
  let samples = 0;
  let counter = 0;
  let minDate = '9999';
  let maxDate = '0000';
  await forEachSeries(null, (s, ind) => {
    stocks++;
    if (s.c.length < MIN_BARS + 40) return;
    const r = computeRisk(s, ind, ctx);
    const vma20 = sma(s.v, 20);
    const n = s.c.length;
    const isEvent: boolean[] = new Array(n).fill(false);
    for (let t = MIN_BARS; t < n - 20; t++) {
      if (!(vma20[t] >= 100_000)) continue; // 流動性：20 日均量至少 100 張
      const f = forwardAt(s, t);
      if (!f) continue;
      const sc = r.score[t];
      if (!isFinite(sc)) continue;
      samples++;
      const d = s.date[t];
      if (d < minDate) minDate = d;
      if (d > maxDate) maxDate = d;
      addHist(all, sc, f, EV_THRESHOLD);
      addHist(d < '2010' ? eras['1990s–2000s'] : d < '2020' ? eras['2010s'] : eras['2020s'], sc, f, EV_THRESHOLD);
      const ev = f.mdd20 <= EV_THRESHOLD;
      isEvent[t] = f.mdd20 <= MAJOR;
      for (const k of FACTOR_KEYS) {
        const L = factorLift[k];
        if (r.F[k][t] >= 0.5) {
          L.n1++;
          if (ev) L.ev1++;
        } else {
          L.n0++;
          if (ev) L.ev0++;
        }
      }
      for (const sg of SIGNALS) {
        const x = r.sig[sg.key][t];
        if (!isFinite(x)) continue;
        for (const L of d < '2015-01-01' ? [signalLift[sg.key], trainSigLift[sg.key]] : [signalLift[sg.key]]) {
          if (x >= 0.5) {
            L.n1++;
            if (ev) L.ev1++;
          } else {
            L.n0++;
            if (ev) L.ev0++;
          }
        }
      }
      counter++;
      const feats = Float32Array.from(FACTOR_KEYS.map(k => r.F[k][t]));
      if (d < '2015-01-01') {
        if (counter % 20 === 0) {
          trainSig.push(Float32Array.from(signalVector(r, t)));
          trainSigY.push(ev ? 1 : 0);
          trainX.push(feats);
          for (const tg of LOGIT_TARGETS) trainY[tg.key].push(tg.y(f) ? 1 : 0);
        }
      } else if (counter % 8 === 0) {
        testSig.push(Float32Array.from(signalVector(r, t)));
        testSigY.push(ev ? 1 : 0);
        testX.push(feats);
        testScore.push(sc);
        for (const tg of LOGIT_TARGETS) testY[tg.key].push(tg.y(f) ? 1 : 0);
      }
      if (sc >= 70 && d >= '2024-01-01') {
        cases.push({ id: s.id, name: s.name, date: d, score: Math.round(sc), F: FACTOR_KEYS.map(k => Math.round(r.F[k][t] * 100) / 100), ret5: +f.ret5.toFixed(4), ret20: +f.ret20.toFixed(4), mdd20: +f.mdd20.toFixed(4) });
      }
    }
    // 提前時間：重大下跌（20 日內回落超過 15%）的第一天，前 10 天內是否已有警報
    for (let t = MIN_BARS + 10; t < n - 20; t++) {
      if (!isEvent[t] || isEvent[t - 1]) continue;
      for (const th of [40, 60]) {
        const L = lead[String(th)];
        L.events++;
        for (let k = t - 10; k <= t; k++) {
          if (r.score[k] >= th) {
            L.warned++;
            L.leadSum += t - k;
            break;
          }
        }
      }
    }
    // 最大回撤：2010 年起，買進持有 vs 分數 ≥ 60 隔天出場、< 40 隔天再進場（扣交易成本）
    const start = s.date.findIndex(d => d >= '2010-01-01');
    if (start > MIN_BARS && n - start >= 750) {
      let eqB = 1;
      let eqS = 1;
      let pos = 1;
      let days = 0;
      const eb: number[] = [1];
      const es: number[] = [1];
      for (let t = start + 1; t < n; t++) {
        const ret = s.c[t] / s.c[t - 1] - 1;
        eqB *= 1 + ret;
        if (pos) {
          eqS *= 1 + ret;
          days++;
        }
        const sc = r.score[t];
        if (pos && sc >= 60) {
          pos = 0;
          eqS *= 1 - 0.004425; // 賣出手續費 0.1425% + 證交稅 0.3%
        } else if (!pos && sc < 40) {
          pos = 1;
          eqS *= 1 - 0.001425;
        }
        eb.push(eqB);
        es.push(eqS);
      }
      const yrs = (n - start) / 250;
      const a = maxDrawdown(eb);
      const b = maxDrawdown(es);
      mddBH.push(a);
      mddST.push(b);
      retBH.push(Math.pow(eqB, 1 / yrs) - 1);
      retST.push(Math.pow(eqS, 1 / yrs) - 1);
      inMkt.push(days / (n - start - 1));
      if (b > a) improved++;
    }
    if (stocks % 200 === 0) log(`回測進度 ${stocks} 檔，樣本 ${samples.toLocaleString()}`);
  });
  log(`回測樣本 ${samples.toLocaleString()}（${minDate} ~ ${maxDate}）；機器學習訓練 ${trainX.length.toLocaleString()} 筆、測試 ${testX.length.toLocaleString()} 筆`);

  const liftOut = (L: Lift) => ({ n1: L.n1, n0: L.n0, rate1: L.n1 ? +(L.ev1 / L.n1).toFixed(4) : 0, rate0: L.n0 ? +(L.ev0 / L.n0).toFixed(4) : 0, lift: L.n1 && L.n0 && L.ev0 ? +((L.ev1 / L.n1) / (L.ev0 / L.n0)).toFixed(2) : null });

  // 羅吉斯迴歸
  const models: Record<string, LogitModel> = {};
  const ml: any[] = [];
  const scoreProbs = testScore.map(x => x / 100);
  for (const tg of LOGIT_TARGETS) {
    const y = Uint8Array.from(trainY[tg.key]);
    const mdl = trainLogit(trainX, y, LOGIT_FEATURES);
    models[tg.key] = mdl;
    const yt = testY[tg.key];
    const pred = testX.map(x => predictLogit(mdl, x));
    const e = evalProb(pred, yt);
    const eScore = evalProb(scoreProbs, yt);
    ml.push({
      key: tg.key,
      label: tg.label,
      trainN: y.length,
      trainRate: +(y.reduce((a, x) => a + x, 0) / y.length).toFixed(4),
      test: { n: e.n, baseRate: +e.baseRate.toFixed(4), prAuc: +e.prAuc.toFixed(4), brier: +e.brier.toFixed(5), calibration: e.calibration.map(c => ({ ...c, predicted: +c.predicted.toFixed(4), actual: +c.actual.toFixed(4) })) },
      scorePrAuc: +eScore.prAuc.toFixed(4),
      weights: mdl.w.map((w, i) => ({ feature: LOGIT_FEATURES[i], w: +w.toFixed(3) })),
      intercept: +mdl.b.toFixed(3),
    });
    log(`模型 ${tg.label}：測試 PR-AUC ${e.prAuc.toFixed(3)}（基準 ${e.baseRate.toFixed(3)}）、Brier ${e.brier.toFixed(4)}`);
  }

  // ── 利空訊號清單：警戒分數（權重 = 2015 年前的預警倍數）＋ 33 訊號羅吉斯迴歸，2015 年後驗證 ──
  const trainLiftOut = Object.fromEntries(Object.entries(trainSigLift).map(([k, L]) => [k, liftOut(L)]));
  const aw = alertWeights(trainLiftOut as any);
  const sigFeatures = SIGNALS.map(s => s.key);
  const sigModel = trainLogit(trainSig, Uint8Array.from(trainSigY), sigFeatures, 400, 1.0);
  models.sig = sigModel;
  const alertScores = testSig.map(v => alertScore(Array.from(v), aw));
  const eAlert = evalProb(alertScores.map(x => x / 100), testSigY);
  const eSig = evalProb(testSig.map(v => predictLogit(sigModel, v)), testSigY);
  const eFactor = evalProb(testScore.map(x => x / 100), testSigY);
  const bands = [0, 20, 40, 60, 80].map((lo, i) => {
    const hi = i === 4 ? 101 : lo + 20;
    const idx = alertScores.map((x, j) => [x, j] as const).filter(([x]) => x >= lo && x < hi).map(([, j]) => j);
    const ev = idx.reduce((a, j) => a + testSigY[j], 0);
    return { band: `${lo}–${i === 4 ? 100 : hi - 1}`, n: idx.length, share: +(idx.length / Math.max(1, alertScores.length)).toFixed(4), evRate: idx.length ? +(ev / idx.length).toFixed(4) : 0 };
  });
  const nSigBands = [0, 1, 3, 5, 7, 9].map((lo, i, arr) => {
    const hi = i === arr.length - 1 ? 99 : arr[i + 1] - 1;
    const idx = testSig.map((v, j) => [v.reduce((a, x) => a + (x >= 0.5 ? 1 : 0), 0), j] as const).filter(([c]) => c >= lo && c <= hi).map(([, j]) => j);
    const ev = idx.reduce((a, j) => a + testSigY[j], 0);
    return { range: hi >= 99 ? `${lo} 項以上` : lo === hi ? `${lo} 項` : `${lo}–${hi} 項`, n: idx.length, evRate: idx.length ? +(ev / idx.length).toFixed(4) : 0 };
  });
  const alert = {
    trainLift: trainLiftOut,
    weights: SIGNALS.map((s, i) => ({ key: s.key, w: +aw.w[i].toFixed(3), coef: +sigModel.w[i].toFixed(3) })).sort((a, b) => b.w - a.w),
    test: {
      n: testSigY.length,
      baseRate: +eAlert.baseRate.toFixed(4),
      alertPrAuc: +eAlert.prAuc.toFixed(4),
      logitPrAuc: +eSig.prAuc.toFixed(4),
      logitBrier: +eSig.brier.toFixed(5),
      factorPrAuc: +eFactor.prAuc.toFixed(4),
      calibration: eSig.calibration.map(c => ({ ...c, predicted: +c.predicted.toFixed(4), actual: +c.actual.toFixed(4) })),
    },
    bands,
    nSigBands,
  };
  log(`利空清單（測試期）：警戒分數 PR-AUC ${eAlert.prAuc.toFixed(3)}、33 訊號模型 ${eSig.prAuc.toFixed(3)}、六因子總分 ${eFactor.prAuc.toFixed(3)}（基準 ${eAlert.baseRate.toFixed(3)}）`);
  for (const b of bands) log(`  警戒分數 ${b.band}：占 ${(b.share * 100).toFixed(1)}%，重大下跌機率 ${(b.evRate * 100).toFixed(1)}%`);

  const levels = levelStats(all);
  const thr = thresholdStats(all);
  const erasOut = Object.fromEntries(Object.entries(eras).map(([k, h]) => [k, { levels: levelStats(h), thr: thresholdStats(h) }]));
  cases.sort((a, b) => (a.date < b.date ? 1 : -1));

  const db = await getDb();
  await db.collection('risk_scan').doc('backtest').set({
    generatedAt: new Date().toISOString(),
    version: VERSION,
    stocks,
    samples,
    range: [minDate, maxDate],
    eventDef: '未來 20 個交易日內最大回落超過 10%',
    weights: FACTOR_WEIGHTS,
    levels,
    threshold: thr,
    eras: erasOut,
    factorLift: Object.fromEntries(Object.entries(factorLift).map(([k, L]) => [k, liftOut(L)])),
    signalLift: Object.fromEntries(Object.entries(signalLift).map(([k, L]) => [k, liftOut(L)])),
    lead: Object.fromEntries(Object.entries(lead).map(([k, L]) => [k, { events: L.events, recall: L.events ? +(L.warned / L.events).toFixed(4) : 0, avgLeadDays: L.warned ? +(L.leadSum / L.warned).toFixed(2) : 0 }])),
    drawdown: {
      stocks: mddBH.length,
      medianMddBH: +median(mddBH).toFixed(4),
      medianMddST: +median(mddST).toFixed(4),
      medianCagrBH: +median(retBH).toFixed(4),
      medianCagrST: +median(retST).toFixed(4),
      medianInMarket: +median(inMkt).toFixed(4),
      improvedShare: mddBH.length ? +(improved / mddBH.length).toFixed(4) : 0,
    },
    ml,
    alert,
    models,
    cases: cases.slice(0, 200),
    notIncluded: NOT_INCLUDED,
    levelsDef: LEVELS,
  });
  log(`✅ 回測完成：${stocks} 檔、${samples.toLocaleString()} 個樣本日｜PR-AUC ${thr.prAuc.toFixed(3)}（基準 ${thr.baseRate.toFixed(3)}）`);
  for (const l of levels) log(`  ${l.label}：${(l.share * 100).toFixed(1)}% 的日子，重大下跌機率 ${(l.evRate * 100).toFixed(1)}%，20 日平均報酬 ${(l.r20 * 100).toFixed(2)}%`);
}

(MODE === 'backtest' ? backtest() : daily()).then(
  () => process.exit(0),
  e => {
    console.error('❌ 失敗', e);
    process.exit(1);
  }
);

