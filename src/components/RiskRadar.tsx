import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ChevronDown, ChevronUp, BookOpen, BarChart3, ListChecks, Star, Briefcase, Plus, X, Search } from 'lucide-react';
import { StudyCardModal, CardSection, CardStat, CardFooter } from './StudyCardModal';
import { FACTOR_KEYS, FACTOR_NAMES, FACTOR_WEIGHTS, NOT_INCLUDED, SIGNALS } from '../../server-lib/risk';

/**
 * 台股下跌預警系統 2.0（免費教學版）
 * 每日收盤後由排程計算全市場風險分數，這裡只讀結果；篩選與追蹤清單都在瀏覽器完成，不增加伺服器費用。
 */

interface Row {
  id: string; name: string; market: string; industry: string | null; date: string; close: number; chg1: number; ret20: number;
  score: number; level: number; F: number[]; sig: Record<string, number>; hist: number[]; avgVal20: number; prob?: Record<string, number>;
  nSig?: number; alert?: number; alertProb?: number;
}
interface Latest {
  asOf: string; generatedAt: string; version: string; counts: number[]; market: { taiexWeak: boolean | null; breadth5: number | null; avgScore: number };
  industries: { name: string; ret20: number; n: number; avgScore: number }[]; rows: Row[]; hasModels: boolean; hasAlert?: boolean; nSignals?: number; alertBase?: number | null;
}
interface LevelStat { level: number; label: string; n: number; share: number; evRate: number; ev15Rate: number; r5: number; r10: number; r20: number; mdd20: number }
interface Thr { baseRate: number; prAuc: number; rows: { threshold: number; alerts: number; alertRate: number; precision: number; recall: number }[] }
interface Lift { n1: number; n0: number; rate1: number; rate0: number; lift: number | null }
interface MlRow { key: string; label: string; trainN: number; trainRate: number; test: { n: number; baseRate: number; prAuc: number; brier: number; calibration: { bin: number; n: number; predicted: number; actual: number }[] }; scorePrAuc: number; weights: { feature: string; w: number }[] }
interface Backtest {
  generatedAt: string; version: string; stocks: number; samples: number; range: [string, string]; eventDef: string;
  levels: LevelStat[]; threshold: Thr; eras: Record<string, { levels: LevelStat[]; thr: Thr }>;
  factorLift: Record<string, Lift>; signalLift: Record<string, Lift>;
  lead: Record<string, { events: number; recall: number; avgLeadDays: number }>;
  drawdown: { stocks: number; medianMddBH: number; medianMddST: number; medianCagrBH: number; medianCagrST: number; medianInMarket: number; improvedShare: number };
  ml: MlRow[];
  alert?: {
    trainLift: Record<string, Lift>; weights: { key: string; w: number; coef: number }[];
    test: { n: number; baseRate: number; alertPrAuc: number; logitPrAuc: number; logitBrier: number; factorPrAuc: number; calibration: { bin: number; n: number; predicted: number; actual: number }[] };
    bands: { band: string; n: number; share: number; evRate: number }[]; nSigBands: { range: string; n: number; evRate: number }[];
  };
  cases: { id: string; name: string; date: string; score: number; F: number[]; ret5: number; ret20: number; mdd20: number }[];
}

const LEVEL = [
  { label: '低風險', emoji: '🟢', cls: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 border-emerald-200 text-emerald-900', bar: '#059669', note: '持續觀察' },
  { label: '留意', emoji: '🟡', cls: 'bg-yellow-400 text-slate-950', soft: 'bg-yellow-50 border-yellow-200 text-yellow-900', bar: '#eab308', note: '出現部分弱化訊號' },
  { label: '警戒', emoji: '🟠', cls: 'bg-orange-500 text-white', soft: 'bg-orange-50 border-orange-200 text-orange-900', bar: '#f97316', note: '多項風險因子轉弱' },
  { label: '高風險', emoji: '🔴', cls: 'bg-red-600 text-white', soft: 'bg-red-50 border-red-200 text-red-900', bar: '#dc2626', note: '重新評估部位與風險曝險' },
  { label: '極高風險', emoji: '🚨', cls: 'bg-rose-900 text-white', soft: 'bg-rose-100 border-rose-300 text-rose-950', bar: '#881337', note: '優先檢查趨勢反轉與極端下跌風險' },
];
/** 各訊號在 2015 年前的預警倍數（卡片清單顯示用） */
const LiftCtx = React.createContext<{ lift: Record<string, Lift> | null; base: number | null }>({ lift: null, base: null });
const SIG_LABEL: Record<string, string> = Object.fromEntries(SIGNALS.map(s => [s.key, s.label]));
const PROB_LABEL: Record<string, string> = { d5: '5 日內跌超過 5%', d10: '10 日內跌超過 8%', d20: '20 日內跌超過 10%', mdd: '20 日內最大回落超過 15%' };
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const p1 = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const money = (x: number) => (x >= 1e8 ? `${(x / 1e8).toFixed(1)} 億` : `${Math.round(x / 1e4).toLocaleString()} 萬`);

const WATCH_KEY = 'risk_watchlist_v1';
const loadWatch = (): string[] => {
  try {
    const x = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(x) ? x.filter(s => typeof s === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
};
const saveWatch = (list: string[]) => {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  } catch {
    /* 私密視窗等情況存不了，就只在這次瀏覽有效 */
  }
};

export const RiskRadar: React.FC<{ onOpenSymbol: (symbol: string) => void; holdings?: { symbol: string; name: string }[] }> = ({ onOpenSymbol, holdings = [] }) => {
  const [view, setView] = useState<'mine' | 'market' | 'backtest' | 'rules'>('mine');
  const [latest, setLatest] = useState<Latest | null>(null);
  const [bt, setBt] = useState<Backtest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [btErr, setBtErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 點等級卡片：切到全市場排行，只看該等級、不限流動性（數量與卡片一致）
  const [preset, setPreset] = useState<{ level: number; nonce: number } | null>(null);
  const listTop = React.useRef<HTMLDivElement>(null);
  const pickLevel = (i: number) => {
    setPreset({ level: i, nonce: Date.now() });
    setView('market');
    setTimeout(() => listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  useEffect(() => {
    let off = false;
    const get = (u: string) => fetch(u).then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`))));
    get('/api/risk/latest').then(j => !off && setLatest(j)).catch(e => !off && setErr(e.message)).finally(() => !off && setLoading(false));
    get('/api/risk/backtest').then(j => !off && setBt(j)).catch(e => !off && setBtErr(e.message));
    return () => { off = true; };
  }, []);

  return (
    <LiftCtx.Provider value={{ lift: bt?.alert?.trainLift || null, base: bt?.alert?.test.baseRate ?? latest?.alertBase ?? null }}>
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[34px] leading-none">📉</span>
          <div>
            <div className="text-[22px] font-black">台股下跌預警 2.0 <span className="ml-1 text-[13px] px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 align-middle">免費教學版</span></div>
            <div className="text-[15px] text-rose-100">六大風險因子 × 100 分評分｜33 項利空訊號清單｜每天收盤後計算全市場一次｜30 年回測驗證</div>
          </div>
        </div>
        {latest && (
          <div className="ml-auto flex flex-wrap gap-2 text-[15px]">
            <span className="px-3 py-1.5 rounded-xl bg-white/10">資料日 <b className="font-mono">{latest.asOf}</b></span>
            <span className="px-3 py-1.5 rounded-xl bg-white/10">全市場平均 <b>{latest.market.avgScore}</b> 分</span>
            {latest.market.taiexWeak != null && (
              <span className={`px-3 py-1.5 rounded-xl ${latest.market.taiexWeak ? 'bg-red-600' : 'bg-emerald-700'}`}>加權指數{latest.market.taiexWeak ? '在季線下' : '在季線上'}</span>
            )}
            {latest.market.breadth5 != null && <span className="px-3 py-1.5 rounded-xl bg-white/10">下跌家數 5 日平均 <b>{p1(latest.market.breadth5, 0)}</b></span>}
          </div>
        )}
      </div>

      {latest && (
        <div className="grid grid-cols-5 gap-2">
          {LEVEL.map((lv, i) => (
            <button key={i} type="button" onClick={() => pickLevel(i)} title={`列出今天「${lv.label}」的 ${latest.counts[i] || 0} 檔`}
              className={`rounded-xl border-2 p-2 text-center cursor-pointer transition hover:shadow-md active:scale-[0.98] ${lv.soft} ${view === 'market' && preset?.level === i ? 'ring-4 ring-slate-900/70' : ''}`}>
              <div className="text-[15px] font-black">{lv.emoji} {lv.label}</div>
              <div className="text-[22px] font-black font-mono">{(latest.counts[i] || 0).toLocaleString()}</div>
              <div className="text-[13px] underline decoration-dotted underline-offset-2">檔・點我列出</div>
            </button>
          ))}
        </div>
      )}

      <div ref={listTop} className="flex flex-wrap gap-2 scroll-mt-4" role="tablist">
        {([['mine', '我的持股與追蹤', Star], ['market', '全市場風險排行', ListChecks], ['backtest', '30 年回測驗證', BarChart3], ['rules', '因子說明與限制', BookOpen]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`min-h-[44px] px-4 rounded-xl text-[16px] font-black flex items-center gap-1.5 border-2 ${view === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>
            <Icon className="w-5 h-5" />{label}
          </button>
        ))}
      </div>

      {(view === 'mine' || view === 'market') && (loading ? <Loading text="讀取今日風險分數…" /> : err ? <ErrorBox text={err} /> : latest && (
        view === 'mine' ? <MineView latest={latest} holdings={holdings} onOpenSymbol={onOpenSymbol} /> : <MarketView key={preset?.nonce ?? 0} latest={latest} onOpenSymbol={onOpenSymbol} presetLevel={preset?.level} />
      ))}
      {view === 'backtest' && (bt ? <BacktestView bt={bt} /> : btErr ? <ErrorBox text={btErr} /> : <Loading text="讀取 30 年回測結果…" />)}
      {view === 'rules' && <RulesView />}

      <p className="text-[14px] text-slate-500 leading-relaxed">
        本功能為免費教學用途的量化研究展示，不構成投資建議，也不代表任何個股一定會下跌或上漲。風險分數由固定規則計算，門檻仍在以歷史回測校準中；
        「機率」是依過去相似情況統計出的比例，不是對未來的保證。實際投資請自行判斷並控制風險。
      </p>
    </div>
    </LiftCtx.Provider>
  );
};

const Loading = ({ text }: { text: string }) => <div className="flex items-center gap-2 text-slate-600 text-[16px] p-6"><Loader2 className="w-5 h-5 animate-spin" />{text}</div>;
const ErrorBox = ({ text }: { text: string }) => <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-4 text-[16px]"><AlertTriangle className="w-5 h-5" />{text}</div>;

// ───────────────────────── 我的持股與追蹤 ─────────────────────────
function MineView({ latest, holdings, onOpenSymbol }: { latest: Latest; holdings: { symbol: string; name: string }[]; onOpenSymbol: (s: string) => void }) {
  const [watch, setWatch] = useState<string[]>(loadWatch);
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(latest.rows.map(r => [r.id, r])), [latest]);
  const held = useMemo(() => [...new Set(holdings.map(h => h.symbol))].filter(s => /^\d{4}$/.test(s)), [holdings]);
  const suggestions = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    return latest.rows.filter(r => r.id.startsWith(k) || r.name.toLowerCase().includes(k)).slice(0, 8);
  }, [q, latest]);
  const add = (id: string) => {
    const next = [...new Set([id, ...watch])].slice(0, 50);
    setWatch(next);
    saveWatch(next);
    setQ('');
  };
  const remove = (id: string) => {
    const next = watch.filter(x => x !== id);
    setWatch(next);
    saveWatch(next);
  };
  const [open, setOpen] = useState<string | null>(null);

  const section = ({ title, icon, ids, removable, empty }: { title: string; icon: React.ReactNode; ids: string[]; removable?: boolean; empty: string }) => {
    const list = ids.map(id => ({ id, r: byId.get(id) })).sort((a, b) => (b.r?.alert ?? b.r?.score ?? -1) - (a.r?.alert ?? a.r?.score ?? -1));
    return (
      <div className="space-y-2">
        <div className="text-[18px] font-black text-slate-900 flex items-center gap-2">{icon}{title}<span className="text-[15px] text-slate-500 font-bold">（{ids.length} 檔）</span></div>
        {list.length === 0 && <div className="text-[16px] text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-4">{empty}</div>}
        {list.map(({ id, r }) =>
          r ? (
            <RiskCard key={id} r={r} open={open === id} onToggle={() => setOpen(open === id ? null : id)} onOpenSymbol={onOpenSymbol}
              extra={removable ? <button type="button" onClick={e => { e.stopPropagation(); remove(id); }} className="p-2 rounded-lg hover:bg-slate-100" aria-label={`從追蹤清單移除 ${r.name}`}><X className="w-5 h-5 text-slate-500" /></button> : undefined} />
          ) : (
            <div key={id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 text-[16px] text-slate-600">
              <span><b className="font-mono">{id}</b>：今天沒有這檔的風險分數（可能是 ETF、停牌，或上市未滿約半年）</span>
              {removable && <button type="button" onClick={() => remove(id)} className="p-2 rounded-lg hover:bg-slate-100" aria-label={`移除 ${id}`}><X className="w-5 h-5" /></button>}
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {section({ title: '我的持股', icon: <Briefcase className="w-5 h-5" />, ids: held, empty: '目前模擬帳戶沒有持有上市櫃個股。下單買進後，這裡會自動列出每一檔的風險分數。' })}
      <div className="space-y-2">
        <div className="relative max-w-md">
          <div className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl px-3 min-h-[48px]">
            <Search className="w-5 h-5 text-slate-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="加入追蹤：輸入代號或名稱" className="flex-1 outline-none text-[17px] bg-transparent" aria-label="加入追蹤清單" />
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {suggestions.map(s => (
                <button key={s.id} type="button" onClick={() => add(s.id)} className="w-full text-left px-3 py-2.5 text-[16px] hover:bg-amber-50 flex items-center gap-2">
                  <Plus className="w-4 h-4" /><b className="font-mono">{s.id}</b>{s.name}<span className="ml-auto"><LevelBadge level={s.level} score={s.score} small /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {section({ title: '我的追蹤清單', icon: <Star className="w-5 h-5" />, ids: watch, removable: true, empty: '還沒有追蹤的股票。用上面的搜尋框加入，最多 50 檔（清單只存在這台裝置的瀏覽器）。' })}
    </div>
  );
}

// ───────────────────────── 全市場排行 ─────────────────────────
function MarketView({ latest, onOpenSymbol, presetLevel }: { latest: Latest; onOpenSymbol: (s: string) => void; presetLevel?: number }) {
  const [levels, setLevels] = useState<number[]>(presetLevel != null ? [presetLevel] : [3, 4]);
  const [ind, setInd] = useState('');
  const [minVal, setMinVal] = useState(presetLevel != null ? 0 : 50e6);
  const [sort, setSort] = useState<'score' | 'alert' | 'nSig' | 'chg1' | 'ret20'>('score');
  const [limit, setLimit] = useState(50);
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const out = latest.rows.filter(r => levels.includes(r.level) && (!ind || r.industry === ind) && r.avgVal20 >= minVal);
    out.sort((a, b) => (sort === 'score' ? b.score - a.score : sort === 'alert' ? (b.alert ?? 0) - (a.alert ?? 0) : sort === 'nSig' ? (b.nSig ?? 0) - (a.nSig ?? 0) : sort === 'chg1' ? a.chg1 - b.chg1 : a.ret20 - b.ret20));
    return out;
  }, [latest, levels, ind, minVal, sort]);
  const toggle = (i: number) => setLevels(levels.includes(i) ? levels.filter(x => x !== i) : [...levels, i]);
  const chip = (on: boolean) => `min-h-[42px] px-3 rounded-xl border-2 text-[16px] font-bold ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-[16px] font-black text-slate-700">風險等級</span>
          {LEVEL.map((lv, i) => <button key={i} type="button" onClick={() => toggle(i)} className={chip(levels.includes(i))}>{lv.emoji} {lv.label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-[16px] font-black text-slate-700">流動性</span>
          {[[0, '不限'], [10e6, '日均成交值 ≥ 1 千萬'], [50e6, '≥ 5 千萬'], [200e6, '≥ 2 億']].map(([v, l]) => (
            <button key={String(v)} type="button" onClick={() => setMinVal(v as number)} className={chip(minVal === v)}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-[16px] font-black text-slate-700">產業</span>
          <select value={ind} onChange={e => setInd(e.target.value)} className="min-h-[42px] px-3 rounded-xl border-2 border-slate-200 text-[16px] bg-white">
            <option value="">全部產業</option>
            {latest.industries.map(x => <option key={x.name} value={x.name}>{x.name}（平均 {x.avgScore} 分）</option>)}
          </select>
          <span className="ml-3 text-[16px] font-black text-slate-700">排序</span>
          {([['score', '風險分數高到低'], ['alert', '利空警戒分數'], ['nSig', '利空訊號最多'], ['chg1', '今日跌幅大到小'], ['ret20', '20 日跌幅大到小']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSort(k)} className={chip(sort === k)}>{l}</button>
          ))}
        </div>
      </div>

      <IndustryTable industries={latest.industries} onPick={setInd} />

      <div className="text-[17px] font-black text-slate-900">符合 {list.length.toLocaleString()} 檔</div>
      <div className="space-y-2">
        {list.slice(0, limit).map(r => <RiskCard key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onOpenSymbol={onOpenSymbol} />)}
      </div>
      {list.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 50)} className="w-full min-h-[48px] rounded-xl border-2 border-slate-300 bg-white text-[16px] font-black">顯示更多（還有 {list.length - limit} 檔）</button>
      )}
    </div>
  );
}

function IndustryTable({ industries, onPick }: { industries: Latest['industries']; onPick: (s: string) => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? industries : industries.slice(0, 8);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="text-[17px] font-black mb-2">產業風險（依平均分數）</div>
      <div className="grid sm:grid-cols-2 gap-x-6">
        {rows.map(x => (
          <button key={x.name} type="button" onClick={() => onPick(x.name)} className="flex items-center gap-2 py-1.5 text-[16px] border-b border-slate-100 text-left hover:bg-slate-50">
            <span className="flex-1 font-bold">{x.name}</span>
            <span className="text-slate-500">{x.n} 檔</span>
            <span className={`w-20 text-right font-mono ${x.ret20 < 0 ? 'text-emerald-700' : 'text-red-600'}`}>{pct(x.ret20)}</span>
            <span className="w-16 text-right font-mono font-black">{x.avgScore}</span>
          </button>
        ))}
      </div>
      {industries.length > 8 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-[15px] font-bold text-indigo-700">{all ? '收合' : `顯示全部 ${industries.length} 個產業`}</button>}
      <div className="text-[14px] text-slate-500 mt-1">20 日報酬為產業內個股每日報酬的平均累積；台股慣例紅漲綠跌。</div>
    </div>
  );
}

// ───────────────────────── 單檔卡片 ─────────────────────────
const LevelBadge = ({ level, score, small }: { level: number; score: number; small?: boolean }) => (
  <span className={`inline-flex items-center gap-1 rounded-lg font-black ${LEVEL[level].cls} ${small ? 'px-2 py-0.5 text-[14px]' : 'px-3 py-1 text-[17px]'}`}>
    {LEVEL[level].emoji} {LEVEL[level].label} <span className="font-mono">{Math.round(score)}</span>
  </span>
);

function RiskCard({ r, open, onToggle, onOpenSymbol, extra, single }: { r: Row; open: boolean; onToggle: () => void; onOpenSymbol: (s: string) => void; extra?: React.ReactNode; single?: boolean }) {
  const { base, lift } = React.useContext(LiftCtx);
  const [card, setCard] = useState(false);
  return (
    <div className={`bg-white border-2 rounded-2xl ${open ? 'border-slate-400' : 'border-slate-200'}`}>
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left cursor-pointer">
        <LevelBadge level={r.level} score={r.score} />
        {r.alert != null && <AlertBadge alert={r.alert} />}
        {r.nSig != null && <span className="text-[15px] font-black px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">利空 {r.nSig} / {SIGNALS.length}</span>}
        <span className="text-[18px] font-black"><span className="font-mono text-indigo-700">{r.id}</span> {r.name}</span>
        {r.industry && <span className="text-[14px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{r.industry}</span>}
        <span className="text-[16px] font-mono">{r.close.toLocaleString()}</span>
        <span className={`text-[16px] font-mono font-bold ${r.chg1 < 0 ? 'text-emerald-700' : r.chg1 > 0 ? 'text-red-600' : 'text-slate-600'}`}>{pct(r.chg1, 2)}</span>
        <Spark hist={r.hist} />
        <span className="ml-auto flex items-center gap-1">{extra}{!single && (open ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />)}</span>
      </div>
      {open && (
        <div className="border-t border-slate-200 p-4 grid lg:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="text-[17px] font-black">六大風險因子</div>
            {FACTOR_KEYS.map((k, i) => (
              <div key={k} className="flex items-center gap-2 text-[16px]">
                <span className="w-40 font-bold">{k} {FACTOR_NAMES[k]}</span>
                <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${r.F[i] * 100}%`, background: r.F[i] >= 0.6 ? '#dc2626' : r.F[i] >= 0.3 ? '#f97316' : '#94a3b8' }} />
                </div>
                <span className="w-24 text-right font-mono">{(r.F[i] * FACTOR_WEIGHTS[k]).toFixed(1)} / {FACTOR_WEIGHTS[k]}</span>
              </div>
            ))}
            <div className="text-[14px] text-slate-500">每個因子滿分不同（權重），合計 100 分。</div>
            {r.prob && (
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[16px] font-black mb-1">歷史上相似風險組合的下跌比例（羅吉斯迴歸）</div>
                {Object.entries(r.prob).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[16px] py-0.5"><span>{PROB_LABEL[k] || k}</span><b className="font-mono">{p1(v)}</b></div>
                ))}
                <div className="text-[13px] text-slate-500 mt-1">以 2015 年前資料訓練、2015 年後驗證；是統計比例，不是預測一定會發生。</div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {r.alert != null && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-[17px] font-black">利空警戒分數</span><AlertBadge alert={r.alert} big /></div>
                {r.alertProb != null && (
                  <div className="text-[16px] mt-1">歷史上同樣訊號組合，20 日內回落超過 10% 的比例 <b className="font-mono">{p1(r.alertProb)}</b>
                    {base != null && <span className="text-slate-500">（2015 年後所有股票平均 {p1(base, 0)}）</span>}</div>
                )}
                <div className="text-[13px] text-slate-500 mt-1">分數依每個訊號在 30 年回測中的實際預警力加權；預警力弱或反向的訊號只列出、不計分。</div>
              </div>
            )}
            <SignalChecklist r={r} />
            <div className="pt-2">
              <div className="text-[16px] font-black mb-1">近 {r.hist.length} 個交易日風險分數</div>
              <Spark hist={r.hist} big />
            </div>
            <div className="text-[15px] text-slate-600">近 20 日 {pct(r.ret20)}｜20 日平均成交值 {money(r.avgVal20)}</div>
            <div className={`rounded-xl border p-3 text-[16px] ${LEVEL[r.level].soft}`}>{LEVEL[r.level].emoji} {LEVEL[r.level].label}：{LEVEL[r.level].note}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCard(true)} className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[16px] font-black">📖 教學卡片（可下載）</button>
              {!single && <button type="button" onClick={() => onOpenSymbol(r.id)} className="min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-[16px] font-black">看個股分析 →</button>}
            </div>
          </div>
        </div>
      )}
      {card && <RiskStudyCard r={r} base={base} lift={lift} onClose={() => setCard(false)} />}
    </div>
  );
}

const LEVEL_HEAD = ['linear-gradient(135deg,#047857,#059669)', 'linear-gradient(135deg,#a16207,#ca8a04)', 'linear-gradient(135deg,#c2410c,#ea580c)', 'linear-gradient(135deg,#b91c1c,#dc2626)', 'linear-gradient(135deg,#4c0519,#881337)'];
const LEVEL_LESSON = [
  '目前沒有明顯的弱化訊號，持續觀察即可。低風險不代表不會跌，只是現在的技術面還算健康。',
  '出現部分弱化訊號，像是跌破短期均線或動能轉弱。可以開始留意，但單一訊號常常是雜訊。',
  '多項風險因子同時轉弱，值得回頭檢查：當初買進的理由還在嗎？停損設好了嗎？部位會不會太大？',
  '多數因子都亮燈，是重新評估部位與風險曝險的時機，例如減碼、提高停損，或暫停加碼。',
  '幾乎所有風險因子都在高檔，優先檢查是否已經趨勢反轉，並確認自己能承受最壞情況的虧損。',
];

function RiskStudyCard({ r, base, lift, onClose }: { r: Row; base: number | null; lift: Record<string, Lift> | null; onClose: () => void }) {
  const hits = SIGNALS.filter(s => r.sig[s.key] != null);
  const strong = hits.filter(s => (lift?.[s.key]?.lift ?? 0) >= 1.15);
  return (
    <StudyCardModal title={`風險教學卡：${r.name}`} filename={`risk_${r.id}_${r.date.replace(/-/g, '')}.png`} onClose={onClose}>
      <div style={{ background: LEVEL_HEAD[r.level] }} className="text-white px-6 pt-5 pb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[16px] font-black px-3 py-1 rounded-full whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.22)' }}>📖 風險教學卡 · 台股下跌預警</span>
          <span className="text-[15px] font-mono font-bold whitespace-nowrap">資料日 {r.date}</span>
        </div>
        <div className="mt-3 text-[34px] font-black leading-tight">{r.name} <span className="font-mono text-[26px] opacity-90">{r.id}</span></div>
        <div className="mt-2 flex flex-wrap gap-2 text-[16px] font-black">
          <span className="px-3 py-1 rounded-full bg-white text-slate-900 whitespace-nowrap">{LEVEL[r.level].emoji} {LEVEL[r.level].label} · {Math.round(r.score)} 分</span>
          {r.alert != null && <span className="px-3 py-1 rounded-full bg-white/20 whitespace-nowrap">⚠️ 利空警戒 {Math.round(r.alert)}</span>}
          <span className="px-3 py-1 rounded-full bg-white/20 whitespace-nowrap">利空訊號 {hits.length} / {SIGNALS.length}</span>
          {r.industry && <span className="px-3 py-1 rounded-full bg-white/20 whitespace-nowrap">{r.industry}</span>}
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <CardStat label="收盤" value={r.close.toLocaleString()} />
          <CardStat label="當日漲跌" value={pct(r.chg1, 2)} color={r.chg1 < 0 ? '#11803d' : '#c81e2c'} />
          <CardStat label="近 20 日" value={pct(r.ret20)} color={r.ret20 < 0 ? '#11803d' : '#c81e2c'} />
          {r.alertProb != null ? <CardStat label="歷史相似下跌比例" value={p1(r.alertProb)} /> : <CardStat label="20 日平均成交值" value={money(r.avgVal20)} />}
        </div>
        <CardSection title="這張卡在說什麼？">
          <p className="text-[17px] leading-relaxed">{LEVEL[r.level].emoji} <b>{LEVEL[r.level].label}</b>：{LEVEL_LESSON[r.level]}</p>
          {r.alertProb != null && (
            <p className="text-[16px] leading-relaxed text-slate-700">
              過去 30 年出現同樣訊號組合時，之後 20 個交易日內回落超過 10% 的比例約 <b>{p1(r.alertProb)}</b>{base != null && <>，所有股票平均是 {p1(base, 0)}</>}。這是統計比例，不是預測一定會發生。
            </p>
          )}
        </CardSection>
        <CardSection title="六大風險因子">
          <div className="space-y-1.5">
            {FACTOR_KEYS.map((k, i) => (
              <div key={k} className="flex items-center gap-2 text-[16px]">
                <span className="font-bold whitespace-nowrap shrink-0" style={{ width: 190 }}>{k} {FACTOR_NAMES[k]}</span>
                <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: '#ece6da' }}>
                  <div className="h-full rounded-full" style={{ width: `${r.F[i] * 100}%`, background: r.F[i] >= 0.6 ? '#dc2626' : r.F[i] >= 0.3 ? '#f97316' : '#94a3b8' }} />
                </div>
                <span className="w-24 text-right font-mono">{(r.F[i] * FACTOR_WEIGHTS[k]).toFixed(1)} / {FACTOR_WEIGHTS[k]}</span>
              </div>
            ))}
          </div>
        </CardSection>
        <CardSection title={`今天觸發的利空訊號（${hits.length} 項）`}>
          {hits.length === 0 ? (
            <p className="text-[16px] text-slate-600">今天沒有觸發任何利空訊號。</p>
          ) : (
            <ul className="space-y-1">
              {hits.map(s => {
                const lf = lift?.[s.key]?.lift ?? null;
                return (
                  <li key={s.key} className="flex gap-2 text-[16px] leading-snug">
                    <span className="font-black w-5 shrink-0" style={{ color: '#dc2626' }}>✔</span>
                    <span className="flex-1">{s.label}</span>
                    {lf != null && <span className="font-mono text-[14px] whitespace-nowrap" style={{ color: lf >= 1.5 ? '#b91c1c' : lf >= 1.15 ? '#c2410c' : '#9ca3af' }}>×{lf.toFixed(2)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {lift && <p className="text-[14px] text-slate-500">×倍數：歷史上觸發後「20 日內回落超過 10%」的機率是沒觸發時的幾倍。倍數 1.15 以上才算有預警力{strong.length ? `，今天有 ${strong.length} 項` : ''}。</p>}
        </CardSection>
        <CardSection title={`近 ${r.hist.length} 個交易日風險分數`}>
          <Spark hist={r.hist} big full />
        </CardSection>
        <CardSection title="三個學習重點">
          <ol className="list-decimal pl-6 space-y-1 text-[16.5px] leading-relaxed">
            <li>風險分數高<b>不等於一定會跌</b>；30 年回測顯示，高分股票也常是波動大、漲跌都劇烈的股票。</li>
            <li>預警的用途是<b>提醒檢查風險</b>：停損設好了嗎？部位會不會太大？買進理由還在嗎？</li>
            <li>單一訊號常是雜訊，<b>多個有預警力的訊號同時出現</b>才值得特別注意。</li>
          </ol>
        </CardSection>
      </div>
      <CardFooter note="風險分數由固定規則計算，門檻仍在以歷史回測校準中。本卡為免費教學用途的量化研究展示，不構成投資建議。" />
    </StudyCardModal>
  );
}

const alertTone = (a: number) => (a >= 60 ? 'bg-red-600 text-white' : a >= 40 ? 'bg-orange-500 text-white' : a >= 20 ? 'bg-yellow-400 text-slate-950' : 'bg-emerald-600 text-white');
const AlertBadge = ({ alert, big }: { alert: number; big?: boolean }) => (
  <span className={`inline-flex items-center gap-1 rounded-lg font-black ${alertTone(alert)} ${big ? 'px-3 py-1 text-[18px]' : 'px-2 py-0.5 text-[15px]'}`} title="利空警戒分數：依回測預警力加權的利空訊號分數（0–100）">
    ⚠️ 警戒 <span className="font-mono">{Math.round(alert)}</span>
  </span>
);

/** 33 項利空訊號清單：依因子分組，觸發的標紅並顯示歷史預警倍數 */
function SignalChecklist({ r }: { r: Row }) {
  const { lift } = React.useContext(LiftCtx);
  const [showAll, setShowAll] = useState(false);
  const on = SIGNALS.filter(s => r.sig[s.key] != null).length;
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-black">利空訊號清單：觸發 {on} / {SIGNALS.length} 項</div>
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-[14px] font-bold text-indigo-700">{showAll ? '只看觸發的' : '顯示全部 33 項'}</button>
      </div>
      {on === 0 && !showAll && <div className="text-[16px] text-slate-500 mt-1">今天沒有觸發任何利空訊號。</div>}
      <div className="mt-1 space-y-2">
        {FACTOR_KEYS.map(fk => {
          const list = SIGNALS.filter(s => s.f === fk && (showAll || r.sig[s.key] != null));
          if (!list.length) return null;
          return (
            <div key={fk}>
              <div className="text-[13px] font-bold text-slate-500">{fk} {FACTOR_NAMES[fk]}</div>
              <ul className="space-y-0.5">
                {list.map(s => {
                  const x = r.sig[s.key];
                  const hit = x != null;
                  const lf = lift?.[s.key]?.lift ?? null;
                  return (
                    <li key={s.key} className={`flex items-start gap-2 text-[15.5px] ${hit ? 'text-slate-900' : 'text-slate-400'}`}>
                      <span className={`mt-0.5 w-5 text-center font-black ${hit ? (x >= 0.75 ? 'text-red-600' : 'text-orange-500') : 'text-slate-300'}`}>{hit ? '✔' : '○'}</span>
                      <span className="flex-1">{s.label}{hit && x < 1 && <span className="text-slate-500">（強度 {Math.round(x * 100)}%）</span>}{s.w === 0 && <span className="ml-1 text-[12px] px-1 rounded bg-indigo-50 text-indigo-700">清單</span>}</span>
                      {lf != null && (
                        <span className={`text-[13px] font-mono whitespace-nowrap ${lf >= 1.5 ? 'text-red-700 font-black' : lf >= 1.15 ? 'text-orange-600 font-bold' : 'text-slate-400'}`} title="2015 年前回測：觸發後重大下跌機率是未觸發時的幾倍">
                          ×{lf.toFixed(2)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {lift && <div className="text-[12.5px] text-slate-500 mt-1">右側 ×倍數：歷史上觸發後「20 日內回落超過 10%」的機率是沒觸發時的幾倍（2015 年前資料）。標「清單」的 13 項不計入六大因子 100 分。</div>}
    </div>
  );
}

function Spark({ hist, big, full }: { hist: number[]; big?: boolean; full?: boolean }) {
  if (!hist?.length) return null;
  const W = big ? 520 : 120;
  const H = big ? 120 : 30;
  const x = (i: number) => (hist.length === 1 ? W / 2 : (i / (hist.length - 1)) * (W - 4) + 2);
  const y = (v: number) => H - 2 - (Math.min(100, Math.max(0, v)) / 100) * (H - 4);
  const pts = hist.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = hist[hist.length - 1];
  const color = LEVEL[last >= 80 ? 4 : last >= 60 ? 3 : last >= 40 ? 2 : last >= 20 ? 1 : 0].bar;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={big ? `w-full ${full ? '' : 'max-w-[520px]'} h-[120px] bg-slate-50 rounded-lg` : 'w-[120px] h-[30px]'} preserveAspectRatio={full ? 'none' : undefined} role="img" aria-label={`近期風險分數走勢，最新 ${last} 分`}>
      {big && [20, 40, 60, 80].map(v => (
        <g key={v}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="#cbd5e1" strokeDasharray="4 4" />
          <text x={W - 4} y={y(v) - 3} textAnchor="end" fontSize="12" fill="#64748b">{v}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={big ? 2.5 : 2} />
    </svg>
  );
}

// ───────────────────────── 30 年回測驗證 ─────────────────────────
function BacktestView({ bt }: { bt: Backtest }) {
  const thr = bt.threshold;
  const lv = bt.levels;
  const dd = bt.drawdown;
  const factorRows = FACTOR_KEYS.map(k => ({ k, ...bt.factorLift[k] }));
  const sigRows = SIGNALS.map(s => ({ ...s, ...(bt.signalLift[s.key] || { n1: 0, n0: 0, rate1: 0, rate0: 0, lift: null }) })).sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
  const liftCls = (x: number | null) => (x == null ? 'text-slate-400' : x >= 1.5 ? 'text-red-700 font-black' : x >= 1.15 ? 'text-orange-600 font-bold' : 'text-slate-500');
  const liftNote = (x: number | null) => (x == null ? '—' : x >= 1.5 ? '預警力強' : x >= 1.15 ? '有預警力' : x >= 0.9 ? '幾乎沒有' : '反向');

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-[16px] leading-relaxed">
        回測期間 <b className="font-mono">{bt.range[0]} ～ {bt.range[1]}</b>，{bt.stocks.toLocaleString()} 檔普通股（含已下市），
        共 <b>{bt.samples.toLocaleString()}</b> 個「股票 × 交易日」樣本（只計 20 日均量 100 張以上）。
        「重大下跌」定義為<b>{bt.eventDef}</b>，所有樣本的平均發生率是 <b>{p1(thr.baseRate)}</b>。
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Big label="分數辨識力 PR-AUC" v={thr.prAuc.toFixed(3)} sub={`隨便猜 = ${thr.baseRate.toFixed(3)}，越高越好`} />
        <Big label="極高風險時的重大下跌機率" v={p1(lv[4]?.evRate || 0)} sub={`平均 ${p1(thr.baseRate)} 的 ${((lv[4]?.evRate || 0) / (thr.baseRate || 1)).toFixed(1)} 倍`} />
        <Big label="提前警示（≥60 分）" v={p1(bt.lead['60']?.recall || 0)} sub={`重大下跌前 10 天內有警報；平均提早 ${bt.lead['60']?.avgLeadDays ?? 0} 天`} />
        <Big label="最大回撤（中位數）" v={`${p1(dd.medianMddBH, 0)} → ${p1(dd.medianMddST, 0)}`} sub={`2010 年起 ${dd.stocks} 檔，${p1(dd.improvedShare, 0)} 的股票回撤變小`} />
      </div>

      <Table title="一、五級風險 × 未來 20 個交易日結果"
        head={['等級', '占所有交易日', '重大下跌機率', '回落超過 15%', '5 日平均報酬', '20 日平均報酬', '20 日內平均最大回落']}
        rows={lv.map((x, i) => [`${LEVEL[i].emoji} ${x.label}`, p1(x.share), p1(x.evRate), p1(x.ev15Rate), pct(x.r5, 2), pct(x.r20, 2), pct(x.mdd20, 1)])}
        note="如果分數有預警能力，越高的等級「重大下跌機率」應該越高。報酬是還原股價計算、未扣交易成本。" />

      <Table title="二、把分數當警報：Precision 與 Recall"
        head={['發警報門檻', '發警報的比例', 'Precision（警報後真的大跌）', 'Recall（大跌前有被警告）']}
        rows={thr.rows.map(r => [`≥ ${r.threshold} 分`, p1(r.alertRate), p1(r.precision), p1(r.recall)])}
        note="門檻越高，警報越少、越準，但會漏掉更多下跌；這是所有預警系統都要面對的取捨。" />

      <div className="grid lg:grid-cols-2 gap-4">
        <Table title="三、提前時間（重大下跌 = 20 日內回落超過 15%）"
          head={['警報門檻', '重大下跌次數', '前 10 天內有警報', '平均提早天數']}
          rows={Object.entries(bt.lead).map(([k, v]) => [`≥ ${k} 分`, v.events.toLocaleString(), p1(v.recall), `${v.avgLeadDays} 天`])} />
        <Table title="四、導入預警後的風險控制（2010 年起，中位數）"
          head={['', '買進持有', '≥60 分出場、<40 分再進場']}
          rows={[
            ['最大回撤', p1(dd.medianMddBH), p1(dd.medianMddST)],
            ['年化報酬', pct(dd.medianCagrBH), pct(dd.medianCagrST)],
            ['持有時間', '100%', p1(dd.medianInMarket)],
          ]}
          note="出場扣賣出手續費 0.1425% 與證交稅 0.3%、進場扣手續費。回撤變小但報酬也可能變少，代表預警是「降低風險」不是「提高報酬」。" />
      </div>

      <Table title="五、哪個因子真的有預警能力？（因子分數 ≥ 0.5 vs < 0.5）"
        head={['因子', '因子轉強時的重大下跌機率', '因子沒轉強時', '倍數（Lift）', '判讀']}
        rows={factorRows.map(x => [`${x.k} ${FACTOR_NAMES[x.k]}（${FACTOR_WEIGHTS[x.k]} 分）`, p1(x.rate1), p1(x.rate0), x.lift == null ? '—' : `${x.lift} 倍`, liftNote(x.lift)])}
        cellCls={(r, c) => (c === 3 || c === 4 ? liftCls(factorRows[r].lift) : '')}
        note="倍數 > 1 代表這個因子轉強時，之後真的比較常大跌。權重應該往倍數高的因子調整，這就是用回測校準權重。" />

      <Table title="六、20 個子訊號逐一檢驗（依倍數排序）"
        head={['訊號', '觸發時重大下跌機率', '未觸發時', '倍數', '判讀']}
        rows={sigRows.map(x => [`${x.f}｜${x.label}`, p1(x.rate1), p1(x.rate0), x.lift == null ? '—' : `${x.lift} 倍`, liftNote(x.lift)])}
        cellCls={(r, c) => (c === 3 || c === 4 ? liftCls(sigRows[r].lift) : '')} />

      <Table title="七、不同年代是否一樣有效？"
        head={['年代', '平均發生率', 'PR-AUC', '極高風險時下跌機率', '低風險時下跌機率']}
        rows={Object.entries(bt.eras).map(([k, e]) => [k, p1(e.thr.baseRate), e.thr.prAuc.toFixed(3), p1(e.levels[4]?.evRate || 0), p1(e.levels[0]?.evRate || 0)])}
        note="好的指標在不同年代都應該有效；只在某段期間有效，可能是過度擬合。" />

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="text-[18px] font-black">八、機器學習：羅吉斯迴歸基準模型</div>
        <div className="text-[16px] text-slate-700 leading-relaxed">
          以六大因子分數為輸入，用 <b>2015 年以前</b>的資料訓練，在 <b>2015 年以後</b>的資料檢驗（不偷看未來）。
          PR-AUC 越高、Brier 越低越好；Random Forest、XGBoost 的比較會在下一版加入。
        </div>
        <Table head={['預測目標', '測試期發生率', '模型 PR-AUC', '直接用總分 PR-AUC', 'Brier score']}
          rows={bt.ml.map(m => [m.label, p1(m.test.baseRate), m.test.prAuc.toFixed(3), m.scorePrAuc.toFixed(3), m.test.brier.toFixed(4)])} />
        {bt.ml[3] && (
          <Table title={`機率校準：${bt.ml[3].label}`} head={['模型預測機率區間', '樣本數', '平均預測', '實際發生']}
            rows={bt.ml[3].test.calibration.map(c => [`${c.bin * 10}–${c.bin * 10 + 10}%`, c.n.toLocaleString(), p1(c.predicted), p1(c.actual)])}
            note="預測和實際越接近，代表機率越可信（校準良好）。" />
        )}
        {bt.ml[3] && (
          <div className="text-[15px] text-slate-600">模型權重（{bt.ml[3].label}）：{bt.ml[3].weights.map(w => `${w.feature} ${w.w > 0 ? '+' : ''}${w.w}`).join('、')}</div>
        )}
      </div>

      {bt.alert && <AlertValidation a={bt.alert} />}
      {bt.cases.length > 0 && <Cases cases={bt.cases} />}
    </div>
  );
}

function AlertValidation({ a }: { a: NonNullable<Backtest['alert']> }) {
  const t = a.test;
  const top = a.weights.filter(w => w.w > 0).slice(0, 12);
  const zero = a.weights.filter(w => w.w === 0);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="text-[18px] font-black">十、利空訊號清單（{SIGNALS.length} 項）與警戒分數驗證</div>
      <div className="text-[16px] text-slate-700 leading-relaxed">
        權重只用 <b>2015 年以前</b>的資料決定（每個訊號的預警倍數 − 1），再拿 <b>2015 年以後</b> {t.n.toLocaleString()} 個樣本檢驗，避免「用答案出題」。
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <Big label="利空警戒分數 PR-AUC" v={t.alertPrAuc.toFixed(3)} sub={`隨便猜 = ${t.baseRate.toFixed(3)}`} />
        <Big label="33 訊號機器學習 PR-AUC" v={t.logitPrAuc.toFixed(3)} sub={`Brier ${t.logitBrier.toFixed(4)}`} />
        <Big label="六大因子總分 PR-AUC" v={t.factorPrAuc.toFixed(3)} sub="同一批測試樣本" />
        <Big label="測試期平均發生率" v={p1(t.baseRate)} sub="20 日內回落超過 10%" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Table head={['利空警戒分數', '占所有交易日', '重大下跌機率']} rows={a.bands.map(b => [`${b.band} 分`, p1(b.share), p1(b.evRate)])}
          note="分數越高，之後真的大跌的比例應該越高；這是在沒參與定權重的 2015 年後資料上驗證的。" />
        <Table head={['觸發的利空訊號數', '樣本數', '重大下跌機率']} rows={a.nSigBands.map(b => [b.range, b.n.toLocaleString(), p1(b.evRate)])}
          note="單純數「幾項」也能看出趨勢，但每項的預警力差很多，所以警戒分數改用加權。" />
      </div>
      <Table head={['預警力最強的訊號', '警戒分數權重', '機器學習係數']} rows={top.map(w => [SIG_LABEL[w.key] || w.key, w.w.toFixed(2), (w.coef > 0 ? '+' : '') + w.coef.toFixed(2)])} />
      {zero.length > 0 && (
        <div className="text-[14.5px] text-slate-600 leading-relaxed">
          <b>只列出、不計分</b>（2015 年前預警倍數 ≤ 1）：{zero.map(w => SIG_LABEL[w.key] || w.key).join('、')}
        </div>
      )}
    </div>
  );
}

function Cases({ cases }: { cases: Backtest['cases'] }) {
  const [n, setN] = useState(20);
  const hit = cases.filter(c => c.mdd20 <= -0.1).length;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="text-[18px] font-black">九、近期 70 分以上警報的後續（2024 年起）</div>
      <div className="text-[15px] text-slate-600 mb-2">共 {cases.length} 筆（最多列 200 筆），其中 {hit} 筆（{p1(hit / cases.length)}）在 20 日內回落超過 10%。也有不少警報之後沒有大跌——這是正常的。</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead><tr className="text-slate-500 text-left"><th className="py-1 pr-3">日期</th><th className="pr-3">股票</th><th className="pr-3 text-right">分數</th><th className="pr-3 text-right">5 日後</th><th className="pr-3 text-right">20 日後</th><th className="text-right">20 日內最大回落</th></tr></thead>
          <tbody>
            {cases.slice(0, n).map((c, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 font-mono">{c.date}</td><td className="pr-3"><b className="font-mono">{c.id}</b> {c.name}</td>
                <td className="pr-3 text-right font-mono font-black">{c.score}</td>
                <td className={`pr-3 text-right font-mono ${c.ret5 < 0 ? 'text-emerald-700' : 'text-red-600'}`}>{pct(c.ret5)}</td>
                <td className={`pr-3 text-right font-mono ${c.ret20 < 0 ? 'text-emerald-700' : 'text-red-600'}`}>{pct(c.ret20)}</td>
                <td className={`text-right font-mono ${c.mdd20 <= -0.1 ? 'text-emerald-800 font-black' : ''}`}>{pct(c.mdd20)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cases.length > n && <button type="button" onClick={() => setN(n + 40)} className="mt-2 text-[15px] font-bold text-indigo-700">顯示更多</button>}
    </div>
  );
}

const Big = ({ label, v, sub }: { label: string; v: string; sub?: string }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="text-[15px] text-slate-600 font-bold">{label}</div>
    <div className="text-[26px] font-black font-mono text-slate-900">{v}</div>
    {sub && <div className="text-[14px] text-slate-500 leading-snug">{sub}</div>}
  </div>
);

function Table({ title, head, rows, note, cellCls }: { title?: string; head: string[]; rows: string[][]; note?: string; cellCls?: (r: number, c: number) => string }) {
  return (
    <div className={title ? 'bg-white border border-slate-200 rounded-2xl p-4' : ''}>
      {title && <div className="text-[18px] font-black mb-2">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead><tr className="text-slate-500">{head.map((h, i) => <th key={i} className={`py-1.5 pr-3 font-bold ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-slate-100">
                {r.map((c, ci) => <td key={ci} className={`py-1.5 pr-3 ${ci ? 'text-right font-mono' : 'font-bold'} ${cellCls?.(ri, ci) || ''}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <div className="text-[14px] text-slate-500 mt-2 leading-relaxed">{note}</div>}
    </div>
  );
}

// ───────────────────────── 因子說明與限制 ─────────────────────────
function RulesView() {
  return (
    <div className="space-y-4">
      {FACTOR_KEYS.map(k => (
        <div key={k} className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[18px] font-black">{k}｜{FACTOR_NAMES[k]}（{FACTOR_WEIGHTS[k]} 分）</div>
          <ul className="mt-1 space-y-1">
            {SIGNALS.filter(s => s.f === k).map(s => (
              <li key={s.key} className="text-[16px] flex gap-2"><span className="text-slate-400">•</span><span>{s.label}<span className="text-slate-500 text-[14px]">（因子內占 {Math.round(s.w * 100)}%）</span></span></li>
            ))}
            {NOT_INCLUDED[k].map(x => (
              <li key={x} className="text-[16px] flex gap-2 text-slate-400"><span>•</span><span>{x}<span className="ml-1 text-[13px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">尚未納入</span></span></li>
            ))}
          </ul>
        </div>
      ))}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-[16px] leading-relaxed space-y-2">
        <div className="text-[18px] font-black">計分方式</div>
        <div>風險分數 R = Σ（權重 × 因子分數）。每個因子先算出 0～1 的分數（子訊號加權平均），再乘上因子權重，六個因子合計 100 分。</div>
        <div>資料庫還沒有的子訊號不計分，該因子的其他子訊號權重會自動補滿；所以 F5、F6 目前只反映部分風險，請搭配「尚未納入」的提醒看待。</div>
        <div className="text-[18px] font-black pt-2">五級警報（初始門檻，仍在以回測校準）</div>
        {LEVEL.map((lv, i) => <div key={i}>{lv.emoji} {[0, 20, 40, 60, 80][i]}–{[19, 39, 59, 79, 100][i]} 分｜{lv.label}：{lv.note}</div>)}
        <div className="text-[18px] font-black pt-2">已知限制</div>
        <ul className="list-disc pl-6 space-y-1">
          <li>只看收盤後的日 K 資料，盤中急跌要等當天收盤後才會反映。</li>
          <li>產業分類用的是現在的分類，早年可能不同；市場與產業因子對 1999 年以前資料不完整。</li>
          <li>只涵蓋上市櫃普通股，不含 ETF、特別股、權證；上市未滿約半年的股票不計分。</li>
          <li>回測樣本只取 20 日均量 100 張以上；報酬未扣交易成本（第四項策略比較除外）。</li>
          <li>預測「會不會跌」不等於預測「跌多少」，更不代表一定會崩跌。</li>
        </ul>
      </div>
    </div>
  );
}

// ───────────────────────── 個股下跌預警（個股分析用） ─────────────────────────
/** 只看單一股票：六大因子、33 項利空清單、警戒分數、教學卡片 */
export const RiskStock: React.FC<{ symbol: string; onOpenScan: () => void }> = ({ symbol, onOpenScan }) => {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [bt, setBt] = useState<Backtest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [watch, setWatch] = useState<string[]>(loadWatch);
  useEffect(() => {
    let off = false;
    const get = (u: string) => fetch(u).then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`))));
    get('/api/risk/latest').then(j => !off && setLatest(j)).catch(e => !off && setErr(e.message));
    get('/api/risk/backtest').then(j => !off && setBt(j)).catch(() => {});
    return () => { off = true; };
  }, []);
  if (err) return <ErrorBox text={err} />;
  if (!latest) return <Loading text="讀取今日風險分數…" />;
  const r = latest.rows.find(x => x.id === symbol);
  const watched = watch.includes(symbol);
  const toggleWatch = () => {
    const next = watched ? watch.filter(x => x !== symbol) : [...new Set([symbol, ...watch])].slice(0, 50);
    setWatch(next);
    saveWatch(next);
  };
  return (
    <LiftCtx.Provider value={{ lift: bt?.alert?.trainLift || null, base: bt?.alert?.test.baseRate ?? latest.alertBase ?? null }}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[15px]">
          <span className="font-black text-[18px]">📉 個股下跌預警</span>
          <span className="text-slate-500">資料日 <b className="font-mono">{latest.asOf}</b>（每天收盤後更新）</span>
          <span className="ml-auto flex flex-wrap gap-2">
            {r && (
              <button type="button" onClick={toggleWatch} className={`min-h-[42px] px-3 rounded-xl border-2 font-black ${watched ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-white border-slate-200 text-slate-700'}`}>
                {watched ? '★ 已在追蹤清單' : '☆ 加入追蹤清單'}
              </button>
            )}
            <button type="button" onClick={onOpenScan} className="min-h-[42px] px-3 rounded-xl border-2 border-slate-900 bg-slate-900 text-white font-black">🔎 看全市場下跌預警</button>
          </span>
        </div>
        {r ? (
          <RiskCard r={r} open single onToggle={() => {}} onOpenSymbol={() => {}} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-[16px] text-slate-700 leading-relaxed">
            今天沒有 <b className="font-mono">{symbol}</b> 的風險分數。下跌預警目前只涵蓋上市櫃<b>普通股</b>，不含 ETF、特別股、權證；上市未滿約半年、或今天停牌的股票也不會計分。
          </div>
        )}
        <p className="text-[14px] text-slate-500 leading-relaxed">免費教學用途的量化研究展示，不構成投資建議。分數與機率的計算方式、30 年回測驗證，請到「全市場海搜 → 下跌預警排行」查看。</p>
      </div>
    </LiftCtx.Provider>
  );
};
