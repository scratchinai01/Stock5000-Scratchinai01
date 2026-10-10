import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, LineChart as LineIcon, BarChart3, FlaskConical, Loader2, AlertTriangle, Info, Triangle, ShieldAlert } from 'lucide-react';
import { PatternScreener } from './PatternScreener';
import { RiskRadar } from './RiskRadar';
import {
  DailySeries,
  performance,
  drawdownSeries,
  yearlyReturns,
  monthlySeasonality,
  betaCorrelation,
  backtest,
  resample,
  sma,
  BacktestParams,
  StrategyId,
} from '../utils/analytics';

// ───────────────────────── 資料 ─────────────────────────
interface HistoryResponse {
  success: boolean;
  message?: string;
  symbol: string;
  name: string | null;
  market: string | null;
  source: string;
  date: string[];
  open: number[]; high: number[]; low: number[]; close: number[]; volume: number[];
  adj_open: (number | null)[]; adj_high: (number | null)[]; adj_low: (number | null)[]; adj_close: (number | null)[];
}

const historyCache = new Map<string, HistoryResponse>();
async function loadHistory(symbol: string): Promise<HistoryResponse> {
  const key = symbol.toUpperCase();
  if (historyCache.has(key)) return historyCache.get(key)!;
  const res = await fetch(`/api/history/daily?symbol=${encodeURIComponent(key)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || '取得歷史資料失敗');
  historyCache.set(key, json);
  return json;
}

/** 取出原始或還原股價序列；還原股價缺值的日期略過 */
function toSeries(h: HistoryResponse, adjusted: boolean, fromDate?: string): DailySeries {
  const s: DailySeries = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < h.date.length; i++) {
    if (fromDate && h.date[i] < fromDate) continue;
    if (adjusted) {
      const c = h.adj_close[i];
      if (c === null || c === undefined) continue;
      s.date.push(h.date[i]); s.open.push(h.adj_open[i] ?? c); s.high.push(h.adj_high[i] ?? c);
      s.low.push(h.adj_low[i] ?? c); s.close.push(c); s.volume.push(h.volume[i]);
    } else {
      s.date.push(h.date[i]); s.open.push(h.open[i]); s.high.push(h.high[i]);
      s.low.push(h.low[i]); s.close.push(h.close[i]); s.volume.push(h.volume[i]);
    }
  }
  return s;
}

const RANGES = [
  { id: '1Y', label: '1 年', years: 1 },
  { id: '3Y', label: '3 年', years: 3 },
  { id: '5Y', label: '5 年', years: 5 },
  { id: '10Y', label: '10 年', years: 10 },
  { id: 'ALL', label: '全部', years: 0 },
] as const;
type RangeId = typeof RANGES[number]['id'];

function rangeStart(lastDate: string, id: RangeId): string | undefined {
  const r = RANGES.find(x => x.id === id)!;
  if (!r.years) return undefined;
  const d = new Date(`${lastDate}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - r.years);
  return d.toISOString().slice(0, 10);
}

const pct = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined || !isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
const num = (x: number, digits = 2) => (isFinite(x) ? x.toFixed(digits) : '—');
const money = (x: number) => `NT$ ${Math.round(x).toLocaleString()}`;
// 台股慣例：紅漲綠跌
const upDown = (x: number) => (x > 0 ? 'text-rose-600' : x < 0 ? 'text-emerald-600' : 'text-slate-600');

// ───────────────────────── 圖表 ─────────────────────────
interface LineSeries { name: string; values: (number | null)[]; color: string; width?: number; dash?: string; fill?: boolean }

const LineChart: React.FC<{
  dates: string[];
  series: LineSeries[];
  height?: number;
  log?: boolean;
  format?: (v: number) => string;
  zeroLine?: boolean;
}> = ({ dates, series, height = 300, log = false, format = v => v.toLocaleString(undefined, { maximumFractionDigits: 2 }), zeroLine }) => {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = height, padL = 64, padR = 12, padT = 12, padB = 26;

  // 點太多時抽樣，保持畫面流暢（最多 1,500 點）
  const step = Math.max(1, Math.ceil(dates.length / 1500));
  const idx = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < dates.length; i += step) out.push(i);
    if (out[out.length - 1] !== dates.length - 1) out.push(dates.length - 1);
    return out;
  }, [dates.length, step]);

  const tf = (v: number) => (log ? Math.log(Math.max(v, 1e-9)) : v);
  let min = Infinity, max = -Infinity;
  for (const s of series) for (const i of idx) { const v = s.values[i]; if (v !== null && v !== undefined && isFinite(v)) { min = Math.min(min, tf(v)); max = Math.max(max, tf(v)); } }
  if (!isFinite(min)) { min = 0; max = 1; }
  if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
  const allPositive = min >= 0;
  const span = max - min || 1;
  min -= span * 0.05; max += span * 0.05;
  if (!log && allPositive && min < 0) min = 0; // 金額類圖表不顯示負數刻度

  const x = (k: number) => padL + (k / Math.max(idx.length - 1, 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (tf(v) - min) / (max - min)) * (H - padT - padB);

  const ticks = Array.from({ length: 5 }, (_, i) => {
    const t = min + ((max - min) * i) / 4;
    return log ? Math.exp(t) : t;
  });
  const years: { k: number; label: string }[] = [];
  const spanYears = Number(dates[dates.length - 1]?.slice(0, 4)) - Number(dates[0]?.slice(0, 4));
  const every = spanYears > 20 ? 5 : spanYears > 8 ? 2 : 1;
  let prevKey = '';
  idx.forEach((i, k) => {
    const key = spanYears <= 1 ? dates[i].slice(0, 7) : dates[i].slice(0, 4);
    if (key === prevKey) return;
    prevKey = key;
    if (k === 0) return; // 第一個刻度常常是不完整的年／月
    if (spanYears <= 1 || Number(key) % every === 0) years.push({ k, label: key });
  });

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const k = Math.round(((px - padL) / (W - padL - padR)) * (idx.length - 1));
    setHover(k >= 0 && k < idx.length ? k : null);
  };

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">{format(t)}</text>
          </g>
        ))}
        {zeroLine && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />}
        {years.map(t => (
          <text key={t.label} x={x(t.k)} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">{t.label}</text>
        ))}
        {series.map(s => {
          let d = '';
          let started = false;
          idx.forEach((i, k) => {
            const v = s.values[i];
            if (v === null || v === undefined || !isFinite(v)) { started = false; return; }
            d += `${started ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`;
            started = true;
          });
          return (
            <g key={s.name}>
              {s.fill && <path d={`${d}L${x(idx.length - 1)},${y(zeroLine ? 0 : Math.exp(min))}L${x(0)},${y(zeroLine ? 0 : Math.exp(min))}Z`} fill={s.color} opacity={0.12} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.6} strokeDasharray={s.dash} />
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#94a3b8" strokeDasharray="3 3" />}
      </svg>
      {hover !== null && (
        <div className="absolute top-2 left-20 bg-white/95 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] shadow-sm pointer-events-none">
          <div className="font-mono font-bold text-slate-900">{dates[idx[hover]]}</div>
          {series.map(s => {
            const v = s.values[idx[hover]];
            return (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 inline-block" style={{ background: s.color }} />
                <span className="text-slate-600">{s.name}</span>
                <span className="font-mono font-bold text-slate-900 ml-auto">{v === null || v === undefined ? '—' : format(v)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-3 mt-1 px-1">
        {series.map(s => (
          <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="w-3 h-0.5 inline-block" style={{ background: s.color }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: string; hint?: string }> = ({ label, value, sub, tone, hint }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3" title={hint}>
    <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">{label}{hint && <Info className="w-3 h-3 text-slate-400" />}</div>
    <div className={`font-mono font-black text-lg ${tone ?? 'text-slate-900'}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 font-mono">{sub}</div>}
  </div>
);

// ───────────────────────── 主元件 ─────────────────────────
type Tab = 'trend' | 'stats' | 'backtest' | 'pattern' | 'risk';

const STRATEGIES: { id: StrategyId; label: string; desc: string }[] = [
  { id: 'buy_hold', label: '買進持有', desc: '第一天買進後一路持有，作為比較基準。' },
  { id: 'dca', label: '定期定額', desc: '每月第一個交易日以固定金額買進。' },
  { id: 'ma_cross', label: '均線交叉', desc: '短均線在長均線之上就持有，跌破就出場。' },
  { id: 'rsi', label: 'RSI 超買超賣', desc: 'RSI 低於下限買進，高於上限賣出。' },
  { id: 'kd', label: 'KD 交叉', desc: 'K 值在 20 以下黃金交叉買進，80 以上死亡交叉賣出。' },
  { id: 'boll', label: '布林通道', desc: '收盤跌破下軌買進，站回中軌賣出。' },
];

export const ProAnalysisModal: React.FC<{ isOpen: boolean; onClose: () => void; initialSymbol?: string; holdings?: { symbol: string; name: string }[] }> = ({ isOpen, onClose, initialSymbol, holdings }) => {
  const [input, setInput] = useState(initialSymbol && /^\d/.test(initialSymbol) ? initialSymbol : '2330');
  const [symbol, setSymbol] = useState(input);
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [bench, setBench] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('trend');
  const [range, setRange] = useState<RangeId>('10Y');
  const [adjusted, setAdjusted] = useState(true);
  const [period, setPeriod] = useState<'1d' | '1w' | '1M'>('1d');
  const [logScale, setLogScale] = useState(true);

  const isEtf = symbol.startsWith('00');
  const [params, setParams] = useState<BacktestParams>({
    strategy: 'ma_cross', capital: 1_000_000, feeRate: 0.001425, feeDiscount: 1, minFee: 20, taxRate: 0.003,
    short: 20, long: 60, rsiPeriod: 14, rsiLow: 30, rsiHigh: 70, bollPeriod: 20, bollMult: 2,
  });

  useEffect(() => {
    setParams(p => ({ ...p, taxRate: isEtf ? 0.001 : 0.003 }));
  }, [isEtf]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadHistory(symbol)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) { setError(e.message); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    loadHistory('0050').then(b => !cancelled && setBench(b)).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol, isOpen]);

  // 代號／名稱搜尋建議
  useEffect(() => {
    const q = input.trim();
    if (!q || q === symbol) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/market/search-stocks?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => setSuggestions((j.results || []).filter((r: any) => r.market === 'TW').slice(0, 8)))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [input, symbol]);

  const lastDate = data?.date[data.date.length - 1];
  const from = lastDate ? rangeStart(lastDate, range) : undefined;
  const series = useMemo(() => (data ? toSeries(data, adjusted, from) : null), [data, adjusted, from]);
  const adjSeries = useMemo(() => (data ? toSeries(data, true, from) : null), [data, from]);
  const display = useMemo(() => (series ? resample(series, period) : null), [series, period]);

  const stats = useMemo(() => (adjSeries && adjSeries.close.length > 1 ? performance(adjSeries.date, adjSeries.close) : null), [adjSeries]);
  const benchSeries = useMemo(() => (bench ? toSeries(bench, true, from) : null), [bench, from]);
  const benchStats = useMemo(() => (benchSeries && benchSeries.close.length > 1 && symbol !== '0050' ? performance(benchSeries.date, benchSeries.close) : null), [benchSeries, symbol]);
  const beta = useMemo(() => (adjSeries && benchSeries && symbol !== '0050' ? betaCorrelation(adjSeries.date, adjSeries.close, benchSeries.date, benchSeries.close) : null), [adjSeries, benchSeries, symbol]);
  const yearly = useMemo(() => (adjSeries ? yearlyReturns(adjSeries.date, adjSeries.close) : []), [adjSeries]);
  const season = useMemo(() => (adjSeries ? monthlySeasonality(adjSeries.date, adjSeries.close) : []), [adjSeries]);
  const dd = useMemo(() => (adjSeries ? drawdownSeries(adjSeries.close) : []), [adjSeries]);
  useEffect(() => {
    if (tab === 'backtest') {
      try {
        localStorage.setItem('pro_analysis_backtest_used', '1');
      } catch {
        /* ignore */
      }
    }
  }, [tab]);

  const bt = useMemo(() => (adjSeries && adjSeries.close.length > 2 ? backtest(adjSeries, params) : null), [adjSeries, params]);

  const ma = useMemo(() => {
    if (!display) return { a: [], b: [] };
    const [na, nb] = period === '1d' ? [60, 240] : period === '1w' ? [13, 52] : [12, 60];
    return { a: sma(display.close, na), b: sma(display.close, nb), na, nb };
  }, [display, period]) as { a: (number | null)[]; b: (number | null)[]; na?: number; nb?: number };

  if (!isOpen) return null;

  const pick = (sym: string) => { setInput(sym); setSymbol(sym); setSuggestions([]); };
  const title = data ? `${data.name ?? ''} ${data.symbol}`.trim() : symbol;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="bg-slate-50 w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 my-2">
        {/* 標頭 */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-200 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔬</span>
            <div>
              <div className="font-black text-slate-950">專業分析</div>
              <div className="text-[11px] text-slate-500">市場資料 1994 年起歷史日K · 績效統計 · 策略回測 · 型態選股 · 下跌預警</div>
            </div>
          </div>
          <div className="relative ml-auto">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1.5 border border-slate-200">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && pick(input.trim().toUpperCase())}
                placeholder="輸入代號或名稱，例如 2330、台積電"
                className="bg-transparent outline-none text-sm w-56 font-mono"
              />
            </div>
            {suggestions.length > 0 && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {suggestions.map(s => (
                  <button key={s.symbol} type="button" onClick={() => pick(s.symbol)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-amber-50 flex gap-2">
                    <span className="font-mono font-bold w-14">{s.symbol}</span><span className="text-slate-700">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100" aria-label="關閉">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 控制列 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200 text-xs">
          <div className="font-black text-slate-900 text-base mr-2">{title}</div>
          {data?.market && <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">{data.market === 'tpex' ? '上櫃' : '上市'}</span>}
          <div className="flex gap-1 ml-auto">
            {([['trend', '長期走勢', LineIcon], ['stats', '績效統計', BarChart3], ['backtest', '策略回測', FlaskConical], ['pattern', '型態選股', Triangle], ['risk', '下跌預警', ShieldAlert]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 border ${tab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          {tab !== 'pattern' && tab !== 'risk' && <div className="w-full flex flex-wrap gap-2 items-center">
            <span className="text-slate-500 font-bold">期間</span>
            {RANGES.map(r => (
              <button key={r.id} type="button" onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 rounded-lg border font-bold ${range === r.id ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-white border-slate-200 text-slate-700'}`}>{r.label}</button>
            ))}
            {tab === 'trend' && (
              <>
                <span className="text-slate-500 font-bold ml-3">週期</span>
                {([['1d', '日'], ['1w', '週'], ['1M', '月']] as const).map(([id, l]) => (
                  <button key={id} type="button" onClick={() => setPeriod(id)}
                    className={`px-2.5 py-1 rounded-lg border font-bold ${period === id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-700'}`}>{l}</button>
                ))}
                <span className="text-slate-500 font-bold ml-3">股價</span>
                {([[true, '還原'], [false, '原始']] as const).map(([v, l]) => (
                  <button key={l} type="button" onClick={() => setAdjusted(v)}
                    className={`px-2.5 py-1 rounded-lg border font-bold ${adjusted === v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-700'}`}>{l}</button>
                ))}
                <label className="flex items-center gap-1 ml-3 font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={logScale} onChange={e => setLogScale(e.target.checked)} /> 對數座標
                </label>
              </>
            )}
          </div>}
        </div>

        <div className="p-4 space-y-4">
          {tab === 'pattern' && <PatternScreener onOpenSymbol={sym => { pick(sym); setTab('trend'); }} />}
          {tab === 'risk' && <RiskRadar holdings={holdings} onOpenSymbol={sym => { pick(sym); setTab('trend'); }} />}
          {tab !== 'pattern' && tab !== 'risk' && loading && <div className="flex items-center gap-2 text-slate-600 text-sm"><Loader2 className="w-4 h-4 animate-spin" />讀取 {symbol} 歷史資料中…（第一次可能需要幾秒）</div>}
          {tab !== 'pattern' && tab !== 'risk' && error && <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm"><AlertTriangle className="w-4 h-4" />{error}</div>}

          {tab !== 'pattern' && tab !== 'risk' && !loading && data && display && adjSeries && (
            <>
              {tab === 'trend' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-3">
                  <LineChart
                    dates={display.date}
                    log={logScale}
                    height={340}
                    series={[
                      { name: `${adjusted ? '還原' : '原始'}收盤價`, values: display.close, color: '#0f172a', width: 1.4 },
                      { name: `${ma.na} ${period === '1d' ? '日' : period === '1w' ? '週' : '月'}均線`, values: ma.a, color: '#f59e0b' },
                      { name: `${ma.nb} ${period === '1d' ? '日' : period === '1w' ? '週' : '月'}均線`, values: ma.b, color: '#6366f1' },
                    ]}
                  />
                  <div className="text-[11px] text-slate-500 mt-2">
                    {display.date[0]} ～ {display.date[display.date.length - 1]}，共 {display.date.length.toLocaleString()} 根{period === '1d' ? '日' : period === '1w' ? '週' : '月'}K。
                    還原股價已調整除權息與股票分割，適合看長期報酬；原始股價是當年實際成交價。資料來源：{data.source}。
                  </div>
                </div>
              )}

              {tab === 'stats' && stats && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="累積報酬（含息）" value={pct(stats.totalReturn, 0)} tone={upDown(stats.totalReturn)} sub={`${stats.startDate} 起 · ${stats.years.toFixed(1)} 年`} />
                    <Stat label="年化報酬 CAGR" value={pct(stats.cagr)} tone={upDown(stats.cagr)} sub={benchStats ? `0050 同期 ${pct(benchStats.cagr)}` : undefined} hint="把累積報酬換算成每年平均複利成長率" />
                    <Stat label="年化波動度" value={pct(stats.annVol).replace('+', '')} sub={benchStats ? `0050 同期 ${pct(benchStats.annVol).replace('+', '')}` : undefined} hint="日報酬標準差 × √252，越大代表價格起伏越劇烈" />
                    <Stat label="最大回撤" value={pct(stats.maxDrawdown)} tone="text-emerald-700" sub={`${stats.mddPeak} → ${stats.mddTrough}`} hint="從最高點跌到最低點的最大跌幅" />
                    <Stat label="夏普值" value={num(stats.sharpe)} sub={benchStats ? `0050 同期 ${num(benchStats.sharpe)}` : '無風險利率 1.5%'} hint="（年化報酬 − 無風險利率）÷ 年化波動，每承受一單位風險換到多少超額報酬" />
                    <Stat label="索提諾值" value={num(stats.sortino)} hint="和夏普值類似，但只計算下跌的波動" />
                    <Stat label="Beta（對 0050）" value={beta ? num(beta.beta) : '—'} sub={beta ? `相關係數 ${num(beta.correlation)}` : symbol === '0050' ? '本身即基準' : '期間重疊不足'} hint="大盤漲跌 1% 時，這檔平均漲跌多少 %" />
                    <Stat label="回撤恢復" value={stats.mddRecovery ?? '尚未回到前高'} sub={`上漲天數比例 ${pct(stats.upDayRatio, 0).replace('+', '')}`} />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-3">
                    <div className="font-black text-sm mb-2">回撤走勢（距離歷史高點的跌幅）</div>
                    <LineChart dates={adjSeries.date} series={[{ name: '回撤', values: dd, color: '#059669', fill: true }]} height={180} zeroLine format={v => `${(v * 100).toFixed(0)}%`} />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-3">
                    <div className="font-black text-sm mb-2">年度報酬（含息）</div>
                    <div className="flex items-end gap-[2px] h-40 border-b border-slate-200 relative">
                      {(() => {
                        const maxAbs = Math.max(...yearly.map(y => Math.abs(y.ret)), 0.01);
                        return yearly.map(y => (
                          <div key={y.year} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                            <div className="w-full flex flex-col justify-center h-full">
                              <div className="h-1/2 flex items-end">{y.ret > 0 && <div className="w-full bg-rose-500/80 rounded-t" style={{ height: `${(y.ret / maxAbs) * 100}%` }} />}</div>
                              <div className="h-1/2 flex items-start">{y.ret < 0 && <div className="w-full bg-emerald-500/80 rounded-b" style={{ height: `${(-y.ret / maxAbs) * 100}%` }} />}</div>
                            </div>
                            <div className="absolute -top-6 hidden group-hover:block bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                              {y.year}{y.partial ? '（部分年度）' : ''}：{pct(y.ret)}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="flex gap-[2px] text-[9px] text-slate-500 mt-1">
                      {yearly.map((y, i) => <div key={y.year} className="flex-1 text-center">{yearly.length > 15 && i % 2 ? '' : String(y.year).slice(2)}</div>)}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
                    <div className="font-black text-sm mb-2">月份季節性（{season[0]?.count ?? 0} 年樣本）</div>
                    <table className="w-full text-xs text-center">
                      <thead><tr className="text-slate-500">{['', ...season.map(s => `${s.month}月`)].map(h => <th key={h} className="py-1 font-bold">{h}</th>)}</tr></thead>
                      <tbody>
                        <tr><td className="text-left font-bold text-slate-600 pr-2">平均報酬</td>{season.map(s => <td key={s.month} className={`font-mono font-bold ${upDown(s.avg)}`}>{pct(s.avg)}</td>)}</tr>
                        <tr><td className="text-left font-bold text-slate-600 pr-2">中位數</td>{season.map(s => <td key={s.month} className={`font-mono ${upDown(s.median)}`}>{pct(s.median)}</td>)}</tr>
                        <tr><td className="text-left font-bold text-slate-600 pr-2">上漲機率</td>{season.map(s => (
                          <td key={s.month} className="font-mono"><span className="px-1 rounded" style={{ background: `rgba(225,29,72,${Math.max(0, s.winRate - 0.5) * 1.6})` }}>{(s.winRate * 100).toFixed(0)}%</span></td>
                        ))}</tr>
                      </tbody>
                    </table>
                    <div className="text-[11px] text-slate-500 mt-2">樣本年數少時（例如只有 3～5 年）季節性很容易是巧合，請勿單憑此表做決策。</div>
                  </div>
                </>
              )}

              {tab === 'backtest' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {STRATEGIES.map(s => (
                        <button key={s.id} type="button" onClick={() => setParams(p => ({
                          ...p,
                          strategy: s.id,
                          // 定期定額是「每月投入金額」，切換時給合理預設值
                          capital: s.id === 'dca' && p.strategy !== 'dca' ? 10000 : s.id !== 'dca' && p.strategy === 'dca' ? 1_000_000 : p.capital,
                        }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${params.strategy === s.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}>{s.label}</button>
                      ))}
                    </div>
                    <div className="text-xs text-slate-600">{STRATEGIES.find(s => s.id === params.strategy)!.desc}訊號在收盤確認、隔天開盤成交；以還原股價計算（已含配息再投入）。</div>
                    <div className="flex flex-wrap gap-3 text-xs items-end">
                      <NumField label={params.strategy === 'dca' ? '每月投入金額' : '初始資金'} value={params.capital} step={10000} onChange={v => setParams(p => ({ ...p, capital: v }))} />
                      {params.strategy === 'ma_cross' && (<>
                        <NumField label="短均線（日）" value={params.short!} onChange={v => setParams(p => ({ ...p, short: v }))} />
                        <NumField label="長均線（日）" value={params.long!} onChange={v => setParams(p => ({ ...p, long: v }))} />
                      </>)}
                      {params.strategy === 'rsi' && (<>
                        <NumField label="RSI 天數" value={params.rsiPeriod!} onChange={v => setParams(p => ({ ...p, rsiPeriod: v }))} />
                        <NumField label="買進門檻（低於）" value={params.rsiLow!} onChange={v => setParams(p => ({ ...p, rsiLow: v }))} />
                        <NumField label="賣出門檻（高於）" value={params.rsiHigh!} onChange={v => setParams(p => ({ ...p, rsiHigh: v }))} />
                      </>)}
                      {params.strategy === 'boll' && (<>
                        <NumField label="布林天數" value={params.bollPeriod!} onChange={v => setParams(p => ({ ...p, bollPeriod: v }))} />
                        <NumField label="標準差倍數" value={params.bollMult!} step={0.5} onChange={v => setParams(p => ({ ...p, bollMult: v }))} />
                      </>)}
                      <label className="flex flex-col gap-1 font-bold text-slate-600">手續費折數
                        <select value={params.feeDiscount} onChange={e => setParams(p => ({ ...p, feeDiscount: Number(e.target.value) }))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white font-mono">
                          {[1, 0.6, 0.5, 0.38, 0.28].map(v => <option key={v} value={v}>{v === 1 ? '無折扣' : `${v * 10} 折`}</option>)}
                        </select>
                      </label>
                      <div className="text-[11px] text-slate-500">手續費 0.1425%（最低 20 元）· 證交稅 {isEtf ? '0.1%（ETF）' : '0.3%'}</div>
                    </div>
                  </div>

                  {bt?.stats && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Stat label="期末資產" value={money(bt.finalValue)} sub={`投入本金 ${money(bt.totalInvested)}`} tone={upDown(bt.finalValue - bt.totalInvested)} />
                        <Stat label="年化報酬" value={pct(bt.stats.cagr)} tone={upDown(bt.stats.cagr)} sub={bt.benchStats ? `買進持有 ${pct(bt.benchStats.cagr)}` : '時間加權報酬'} />
                        <Stat label="最大回撤" value={pct(bt.stats.maxDrawdown)} tone="text-emerald-700" sub={bt.benchStats ? `買進持有 ${pct(bt.benchStats.maxDrawdown)}` : undefined} />
                        <Stat label="夏普值" value={num(bt.stats.sharpe)} sub={bt.benchStats ? `買進持有 ${num(bt.benchStats.sharpe)}` : undefined} />
                        <Stat label="交易次數" value={`${bt.trades.length} 筆`} sub={bt.closedTrades ? `完成 ${bt.closedTrades} 次 · 勝率 ${(bt.winRate * 100).toFixed(0)}%` : '尚未出場'} />
                        <Stat label="持股時間比例" value={`${(bt.exposure * 100).toFixed(0)}%`} hint="有持股的交易日占全部交易日的比例" />
                        <Stat label="交易成本" value={money(bt.totalFees + bt.totalTax)} sub={`手續費 ${money(bt.totalFees)} · 證交稅 ${money(bt.totalTax)}`} />
                        <Stat label="回測期間" value={`${bt.stats.years.toFixed(1)} 年`} sub={`${bt.stats.startDate} ～ ${bt.stats.endDate}`} />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl p-3">
                        <div className="font-black text-sm mb-2">資產淨值走勢</div>
                        <LineChart
                          dates={bt.dates}
                          log={params.strategy !== 'dca'}
                          height={280}
                          format={v => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0))}
                          series={params.strategy === 'dca'
                            ? [{ name: '市值', values: bt.equity, color: '#4f46e5' }, { name: '累計投入本金', values: bt.invested, color: '#94a3b8', dash: '4 3' }]
                            : [{ name: STRATEGIES.find(s => s.id === params.strategy)!.label, values: bt.equity, color: '#4f46e5' }, { name: '買進持有', values: bt.benchmark, color: '#94a3b8', dash: '4 3' }]}
                        />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
                        <div className="font-black text-sm mb-2">交易明細（最近 50 筆）</div>
                        <table className="w-full text-xs">
                          <thead><tr className="text-slate-500 text-left">{['日期', '買賣', '成交價（還原）', '股數', '手續費', '證交稅', '已實現損益'].map(h => <th key={h} className="py-1 pr-3 font-bold">{h}</th>)}</tr></thead>
                          <tbody>
                            {bt.trades.slice(-50).reverse().map((t, i) => (
                              <tr key={i} className="border-t border-slate-100 font-mono">
                                <td className="py-1 pr-3">{t.date}</td>
                                <td className={`pr-3 font-bold ${t.side === '買進' ? 'text-rose-600' : 'text-emerald-600'}`}>{t.side}</td>
                                <td className="pr-3">{t.price.toFixed(2)}</td>
                                <td className="pr-3">{t.shares.toLocaleString()}</td>
                                <td className="pr-3">{t.fee.toLocaleString()}</td>
                                <td className="pr-3">{t.tax.toLocaleString()}</td>
                                <td className={`pr-3 ${t.pnl === undefined ? '' : upDown(t.pnl)}`}>{t.pnl === undefined ? '—' : Math.round(t.pnl).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="text-[11px] text-slate-500 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  歷史績效不代表未來表現，回測結果僅供教學。資料只包含目前仍掛牌的公司，已下市公司不在其中（存活者偏差），
                  實際回測報酬可能偏高。資料來源：{data.source}（市場資料 TaiwanStockPrice／TaiwanStockPriceAdj），最新資料日 {lastDate}。
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const NumField: React.FC<{ label: string; value: number; step?: number; onChange: (v: number) => void }> = ({ label, value, step = 1, onChange }) => (
  <label className="flex flex-col gap-1 font-bold text-slate-600">
    {label}
    <input type="number" value={value} step={step} min={0}
      onChange={e => { const v = Number(e.target.value); if (isFinite(v) && v > 0) onChange(v); }}
      className="border border-slate-200 rounded-lg px-2 py-1 w-28 font-mono bg-white" />
  </label>
);

export default ProAnalysisModal;
