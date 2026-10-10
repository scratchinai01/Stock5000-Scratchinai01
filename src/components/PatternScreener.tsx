import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ChevronDown, ChevronUp, Filter, TrendingUp, TrendingDown, BookOpen, BarChart3, ListChecks } from 'lucide-react';
import { StudyCardModal, CardSection, CardStat, CardFooter } from './StudyCardModal';

/**
 * 型態選股（超級專業版）：三角收斂突破
 * 每日收盤後由排程計算全市場，這裡只讀結果；篩選在瀏覽器完成，不增加伺服器費用。
 */

type Side = 'up' | 'down';
type Status = 'breakout' | 'confirming' | 'forming';
interface Checks {
  volume: boolean; vma: boolean; obv: boolean; rsi: boolean; rsiDiverge: boolean; macd: boolean; adx: boolean; bb: boolean; price: boolean; position: boolean; trend: boolean;
}
interface Row {
  id: string; name: string; market: string; status: Status; side: Side; daysSince: number; date: string;
  close: number; lineNow: number; distPct: number; breakPct: number; breakAtr: number; volRatio: number; rsi: number; adx: number; atr: number;
  position: number; touches: number; shape: 'sym' | 'asc' | 'desc'; lengthBars: number; checks: Checks; score: number;
  stop: number; stopAtr: number; target: number; rr: number; avgVol20: number;
  chart: { startDate: string; endDate: string; u0: number; u1: number; l0: number; l1: number; highs: [string, number][]; lows: [string, number][] };
}
interface Latest { asOf: string; generatedAt: string; counts: { stocks: number; breakout: number; confirming: number; forming: number }; params: any; rows: Row[] }
interface Stat { n: number; winRate: number; stopRate: number; trueBreak: number; halfTarget: number; avgPnl: number; avgR5: number; avgR10: number; avgR20: number; pos20: number }
interface Backtest { generatedAt: string; stocks: number; events: number; range: [string, string]; stats: Record<string, Stat>; latestEvents: any[]; params: any }

const CHECK_LABEL: Record<keyof Checks, string> = {
  volume: '量能 ≥ 均量倍數',
  vma: '5日均量 > 20日均量',
  obv: 'OBV 同步創新高',
  rsi: 'RSI 過門檻',
  rsiDiverge: 'RSI 低點墊高',
  macd: 'MACD 多方擴大',
  adx: 'ADX 低檔轉升',
  bb: '布林帶寬壓縮後擴張',
  price: '收盤確認幅度',
  position: '位置在 1/2–3/4',
  trend: '順大週期（120日線）',
};
const CORE: (keyof Checks)[] = ['volume', 'obv', 'rsi', 'macd', 'adx', 'bb', 'price', 'position', 'trend'];
const SHAPE: Record<string, string> = { sym: '對稱三角', asc: '上升三角', desc: '下降三角' };
const STATUS: Record<Status, { label: string; cls: string }> = {
  breakout: { label: '今日突破', cls: 'bg-rose-600 text-white' },
  confirming: { label: '突破確認中', cls: 'bg-amber-500 text-slate-950' },
  forming: { label: '收斂中', cls: 'bg-slate-700 text-white' },
};
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const num = (x: number, d = 2) => (isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const grade = (s: number) => (s >= 7 ? 'A' : s >= 5 ? 'B' : 'C');
const gradeCls = (s: number) => (s >= 7 ? 'bg-emerald-600 text-white' : s >= 5 ? 'bg-amber-400 text-slate-950' : 'bg-slate-300 text-slate-800');

export const PatternScreener: React.FC<{ onOpenSymbol: (symbol: string) => void }> = ({ onOpenSymbol }) => {
  const [view, setView] = useState<'list' | 'backtest' | 'rules'>('list');
  const [latest, setLatest] = useState<Latest | null>(null);
  const [bt, setBt] = useState<Backtest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [btErr, setBtErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let off = false;
    setLoading(true);
    fetch('/api/pattern/latest')
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`))))
      .then(j => !off && setLatest(j))
      .catch(e => !off && setErr(e.message))
      .finally(() => !off && setLoading(false));
    fetch('/api/pattern/backtest')
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`))))
      .then(j => !off && setBt(j))
      .catch(e => !off && setBtErr(e.message));
    return () => { off = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[34px] leading-none">🔺</span>
          <div>
            <div className="text-[22px] font-black">型態選股 · 三角收斂突破 <span className="ml-1 text-[13px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 align-middle">超級專業版</span></div>
            <div className="text-[15px] text-indigo-100">價格 × 量能 × 時間三要素同時確認｜每天收盤後掃描全市場一次</div>
          </div>
        </div>
        {latest && (
          <div className="ml-auto flex flex-wrap gap-2 text-[15px]">
            <span className="px-3 py-1.5 rounded-xl bg-white/10">資料日 <b className="font-mono">{latest.asOf}</b></span>
            <span className="px-3 py-1.5 rounded-xl bg-white/10">掃描 <b>{latest.counts.stocks.toLocaleString()}</b> 檔</span>
            <span className="px-3 py-1.5 rounded-xl bg-rose-600">今日突破 <b>{latest.counts.breakout}</b></span>
            <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950">確認中 <b>{latest.counts.confirming}</b></span>
            <span className="px-3 py-1.5 rounded-xl bg-slate-600">收斂中 <b>{latest.counts.forming}</b></span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {([['list', '今日清單', ListChecks], ['backtest', '30 年回測統計', BarChart3], ['rules', '規則與參數', BookOpen]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`min-h-[44px] px-4 rounded-xl text-[16px] font-black flex items-center gap-1.5 border-2 ${view === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>
            <Icon className="w-5 h-5" />{label}
          </button>
        ))}
      </div>

      {view === 'list' && (loading ? <Loading text="讀取今日型態清單…" /> : err ? <ErrorBox text={err} /> : latest && <ListView latest={latest} bt={bt} onOpenSymbol={onOpenSymbol} />)}
      {view === 'backtest' && (bt ? <BacktestView bt={bt} /> : btErr ? <ErrorBox text={btErr} /> : <Loading text="讀取歷史回測統計…" />)}
      {view === 'rules' && <RulesView params={latest?.params || bt?.params} />}

      <p className="text-[14px] text-slate-500 leading-relaxed">
        以上為技術分析教學內容，非投資建議。型態由程式依固定規則辨識，與人工看圖可能不同；請搭配 K 線圖自行判斷，實際交易請自行控制風險。
      </p>
    </div>
  );
};

const Loading = ({ text }: { text: string }) => <div className="flex items-center gap-2 text-slate-600 text-[16px] p-6"><Loader2 className="w-5 h-5 animate-spin" />{text}</div>;
const ErrorBox = ({ text }: { text: string }) => <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-4 text-[16px]"><AlertTriangle className="w-5 h-5" />{text}</div>;

// ───────────────────────── 今日清單 ─────────────────────────
function ListView({ latest, bt, onOpenSymbol }: { latest: Latest; bt: Backtest | null; onOpenSymbol: (s: string) => void }) {
  const [statuses, setStatuses] = useState<Status[]>(['breakout', 'confirming']);
  const [side, setSide] = useState<'all' | Side>('up');
  const [minVol, setMinVol] = useState(1.5);
  const [minScore, setMinScore] = useState(0);
  const [must, setMust] = useState<(keyof Checks)[]>([]);
  const [minLots, setMinLots] = useState(500);
  const [noEtf, setNoEtf] = useState(true);
  const [sort, setSort] = useState<'score' | 'vol' | 'break' | 'rr' | 'dist'>('score');
  const [open, setOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const rows = useMemo(() => {
    let r = latest.rows.filter(x => statuses.includes(x.status));
    if (side !== 'all') r = r.filter(x => x.side === side);
    r = r.filter(x => x.status === 'forming' || x.volRatio >= minVol);
    r = r.filter(x => x.score >= minScore);
    r = r.filter(x => must.every(k => x.checks[k]));
    r = r.filter(x => x.avgVol20 / 1000 >= minLots);
    if (noEtf) r = r.filter(x => !/^00/.test(x.id));
    const key: Record<typeof sort, (x: Row) => number> = {
      score: x => x.score * 10 + x.volRatio,
      vol: x => x.volRatio,
      break: x => x.breakPct,
      rr: x => x.rr,
      dist: x => -Math.abs(x.distPct),
    };
    return [...r].sort((a, b) => key[sort](b) - key[sort](a));
  }, [latest, statuses, side, minVol, minScore, must, minLots, noEtf, sort]);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[40px] px-3 rounded-full text-[15px] font-bold border-2 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}>{children}</button>
  );

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-2xl">
        <button type="button" onClick={() => setShowFilters(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-[17px] font-black text-slate-900">
          <Filter className="w-5 h-5" />篩選條件
          <span className="text-[14px] font-bold text-slate-500">（在你的瀏覽器即時篩選，不另外產生費用）</span>
          <span className="ml-auto">{showFilters ? <ChevronUp /> : <ChevronDown />}</span>
        </button>
        {showFilters && (
          <div className="px-4 pb-4 space-y-3 text-[15px]">
            <Row label="狀態">
              {(['breakout', 'confirming', 'forming'] as Status[]).map(s => (
                <Chip key={s} on={statuses.includes(s)} onClick={() => setStatuses(v => toggle(v, s))}>{STATUS[s].label}{s === 'confirming' ? '（1–3 天）' : s === 'forming' ? '（尚未突破）' : ''}</Chip>
              ))}
            </Row>
            <Row label="方向">
              <Chip on={side === 'up'} onClick={() => setSide('up')}>▲ 向上突破</Chip>
              <Chip on={side === 'down'} onClick={() => setSide('down')}>▼ 向下跌破</Chip>
              <Chip on={side === 'all'} onClick={() => setSide('all')}>全部</Chip>
            </Row>
            <Row label="突破量能">
              {[1, 1.5, 2, 2.5].map(v => <Chip key={v} on={minVol === v} onClick={() => setMinVol(v)}>≥ {v} 倍均量</Chip>)}
            </Row>
            <Row label="最少符合">
              {[0, 5, 6, 7, 8].map(v => <Chip key={v} on={minScore === v} onClick={() => setMinScore(v)}>{v === 0 ? '不限' : `${v} / 9 項`}</Chip>)}
            </Row>
            <Row label="必須符合">
              {CORE.map(k => <Chip key={k} on={must.includes(k)} onClick={() => setMust(v => toggle(v, k))}>{CHECK_LABEL[k]}</Chip>)}
            </Row>
            <Row label="流動性">
              {[0, 100, 500, 1000, 5000].map(v => <Chip key={v} on={minLots === v} onClick={() => setMinLots(v)}>{v === 0 ? '不限' : `20日均量 ≥ ${v.toLocaleString()} 張`}</Chip>)}
              <Chip on={noEtf} onClick={() => setNoEtf(v => !v)}>排除 ETF</Chip>
            </Row>
            <Row label="排序">
              {([['score', '綜合分數'], ['vol', '量能倍數'], ['break', '突破幅度'], ['rr', '報酬風險比'], ['dist', '最接近突破線']] as const).map(([id, l]) => <Chip key={id} on={sort === id} onClick={() => setSort(id)}>{l}</Chip>)}
            </Row>
          </div>
        )}
      </div>

      <div className="text-[16px] font-bold text-slate-700">符合 {rows.length} 檔{rows.length === 0 && '：試著放寬條件，或把「收斂中」也勾選起來'}</div>

      <div className="space-y-3">
        {rows.slice(0, 120).map(r => (
          <Card key={`${r.id}-${r.status}`} r={r} bt={bt} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onOpenSymbol={onOpenSymbol} />
        ))}
        {rows.length > 120 && <div className="text-[15px] text-slate-500">只顯示前 120 檔，請加嚴條件。</div>}
      </div>
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="w-20 shrink-0 font-black text-slate-600">{label}</span>
    {children}
  </div>
);

function Card({ r, bt, open, onToggle, onOpenSymbol }: { r: Row; bt: Backtest | null; open: boolean; onToggle: () => void; onOpenSymbol: (s: string) => void }) {
  const up = r.side === 'up';
  const isForming = r.status === 'forming';
  const [card, setCard] = useState(false);
  return (
    <div className={`bg-white rounded-2xl border-2 ${open ? 'border-indigo-400' : 'border-slate-200'}`}>
      <button type="button" onClick={onToggle} className="w-full text-left p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-[220px]">
          <span className={`px-2.5 py-1 rounded-lg text-[14px] font-black ${STATUS[r.status].cls}`}>{STATUS[r.status].label}{r.status === 'confirming' ? ` 第${r.daysSince}天` : ''}</span>
          <span className="font-mono font-black text-[18px] text-indigo-800">{r.id}</span>
          <span className="font-black text-[19px] text-slate-900">{r.name}</span>
          <span className="text-[13px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.market === 'tpex' ? '上櫃' : '上市'}</span>
        </div>
        <div className={`flex items-center gap-1 font-black text-[17px] ${up ? 'text-rose-700' : 'text-emerald-700'}`}>
          {up ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          {isForming ? `距${up ? '上軌' : '下軌'} ${pct(-r.distPct, 2).replace('+', '')}` : `${up ? '突破' : '跌破'} ${pct(r.breakPct, 2)}`}
        </div>
        <Stat label="收盤" v={num(r.close)} />
        {!isForming && <Stat label="量能" v={`${num(r.volRatio, 1)} 倍`} hi={r.volRatio >= 1.5} />}
        <Stat label="RSI" v={num(r.rsi, 0)} />
        <Stat label="位置" v={`${Math.round(r.position * 100)}%`} hi={r.position >= 0.5 && r.position <= 0.75} />
        <div className="ml-auto flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-[15px] font-black ${gradeCls(r.score)}`}>{grade(r.score)} 級 {r.score}/9</span>
          {open ? <ChevronUp /> : <ChevronDown />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          <MiniChart r={r} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[17px] font-black mb-2">條件檢查</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {(Object.keys(CHECK_LABEL) as (keyof Checks)[]).map(k => (
                  <div key={k} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[15px] font-bold ${r.checks[k] ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-500'}`}>
                    <span className="text-[17px]">{r.checks[k] ? '✓' : '✗'}</span>{CHECK_LABEL[k]}{!CORE.includes(k) && <span className="text-[12px] text-slate-400">（加分）</span>}
                  </div>
                ))}
              </div>
              {isForming && <div className="text-[14px] text-slate-500 mt-2">尚未突破：量能、收盤確認等條件要等突破當天才會成立。</div>}
            </div>
            <div className="space-y-2 text-[16px]">
              <div className="text-[17px] font-black mb-2">型態與風險</div>
              <KV k="型態" v={`${SHAPE[r.shape]}，${r.lengthBars} 根 K 線，觸碰 ${r.touches} 點`} />
              <KV k={`今日${up ? '上軌' : '下軌'}`} v={num(r.lineNow)} />
              <KV k="ATR(14)" v={num(r.atr)} />
              <KV k="ADX(14)" v={num(r.adx, 1)} />
              <KV k="停損（擺動點）" v={num(r.stop)} cls="text-emerald-700" />
              <KV k={`停損（1.5 倍 ATR）`} v={num(r.stopAtr)} cls="text-emerald-700" />
              <KV k="量測目標價" v={num(r.target)} cls="text-rose-700" />
              {!isForming && <KV k="報酬風險比" v={`1 : ${num(r.rr, 2)}`} />}
              <KV k="20 日均量" v={`${Math.round(r.avgVol20 / 1000).toLocaleString()} 張`} />
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => setCard(true)} className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[16px]">📖 教學卡片（可下載）</button>
                <button type="button" onClick={() => onOpenSymbol(r.id)} className="min-h-[44px] px-4 rounded-xl bg-slate-900 text-white font-black text-[16px]">看長期走勢與回測 →</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {card && <PatternStudyCard r={r} bt={bt} onClose={() => setCard(false)} />}
    </div>
  );
}

// ───────────────────────── 教學卡片 ─────────────────────────
const CHECK_EXPLAIN: Record<keyof Checks, string> = {
  volume: '突破當天成交量至少是 20 日均量的 1.5 倍，代表真的有資金推動。',
  vma: '5 日均量大於 20 日均量，最近交易變熱絡。',
  obv: 'OBV（能量潮）同步創新高，量能和價格方向一致。',
  rsi: 'RSI 站上 55（跌破看 45 以下），動能確實轉強。',
  rsiDiverge: '收斂期間 RSI 低點一次比一次高，買盤慢慢回來。',
  macd: 'MACD 的 DIF 在 DEA 之上且柱狀體放大，多方動能擴大。',
  adx: '收斂時 ADX 偏低（盤整），突破當天開始轉升，趨勢正在形成。',
  bb: '布林通道先縮窄、突破時張開，代表波動從壓縮轉為釋放。',
  price: '收盤超出趨勢線 1% 或 0.5 倍 ATR，只看收盤、不看盤中，避免假突破。',
  position: '突破發生在三角形長度的 1/2～3/4，太接近頂點的突破力道通常較弱。',
  trend: '突破方向和 120 日均線（半年線）同向，順著大趨勢比較容易成功。',
};
const SHAPE_LESSON: Record<string, string> = {
  sym: '對稱三角：高點越來越低、低點越來越高，多空力量逐漸均衡，最後往哪邊突破要看量能與收盤確認。',
  asc: '上升三角：高點大致在同一水平（壓力），低點一次比一次高，代表買方越來越積極，較常見向上突破。',
  desc: '下降三角：低點大致在同一水平（支撐），高點一次比一次低，代表賣方越來越積極，較常見向下跌破。',
};

function PatternStudyCard({ r, bt, onClose }: { r: Row; bt: Backtest | null; onClose: () => void }) {
  const up = r.side === 'up';
  const isForming = r.status === 'forming';
  const passed = CORE.filter(k => r.checks[k]).length;
  const g = grade(r.score);
  const gs = bt?.stats?.[`${r.side}|grade|${g}`];
  const head = up ? 'linear-gradient(135deg,#b91c1c,#e11d48)' : 'linear-gradient(135deg,#047857,#059669)';
  const statusText =
    r.status === 'breakout'
      ? `今天收盤${up ? '站上上軌' : '跌破下軌'} ${(Math.abs(r.breakPct) * 100).toFixed(2)}%，成交量是 20 日均量的 ${num(r.volRatio, 1)} 倍。`
      : r.status === 'confirming'
      ? `${r.daysSince} 天前${up ? '突破上軌' : '跌破下軌'}，到今天收盤仍在線外，屬於「突破確認中」。`
      : `目前還在三角形裡面，收盤距離${up ? '上軌' : '下軌'}約 ${pct(-r.distPct, 2).replace('+', '')}，尚未突破。`;
  return (
    <StudyCardModal title={`型態教學卡：${r.name}`} filename={`pattern_${r.id}_${r.date.replace(/-/g, '')}.png`} onClose={onClose}>
      <div style={{ background: head }} className="text-white px-6 pt-5 pb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[16px] font-black px-3 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.22)' }}>📖 型態教學卡 · 三角收斂{up ? '突破' : '跌破'}</span>
          <span className="text-[15px] font-mono font-bold">資料日 {r.date}</span>
        </div>
        <div className="mt-3 text-[34px] font-black leading-tight">{r.name} <span className="font-mono text-[26px] opacity-90">{r.id}</span></div>
        <div className="mt-2 flex flex-wrap gap-2 text-[16px] font-black">
          <span className="px-3 py-1 rounded-full bg-white/20">{STATUS[r.status].label}</span>
          <span className="px-3 py-1 rounded-full bg-white/20">{SHAPE[r.shape]}</span>
          <span className="px-3 py-1 rounded-full bg-white text-slate-900">{g} 級 · 符合 {passed}/9 項</span>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        <MiniChart r={r} />
        <CardSection title="這是什麼型態？">
          <p className="text-[17px] leading-relaxed">{SHAPE_LESSON[r.shape]}</p>
          <p className="text-[17px] leading-relaxed">這一檔在 {r.lengthBars} 根 K 線內形成收斂，上下軌合計觸碰 {r.touches} 次。</p>
        </CardSection>
        <CardSection title="今天的訊號">
          <p className="text-[17px] leading-relaxed">{statusText}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <CardStat label="收盤" value={num(r.close)} />
            <CardStat label={`今日${up ? '上軌' : '下軌'}`} value={num(r.lineNow)} />
            <CardStat label="RSI(14)" value={num(r.rsi, 0)} />
            <CardStat label="突破位置" value={`${Math.round(r.position * 100)}%`} />
          </div>
        </CardSection>
        <CardSection title={`條件檢查：符合 ${passed} / 9 項核心條件`}>
          <ul className="space-y-1.5">
            {(Object.keys(CHECK_LABEL) as (keyof Checks)[]).map(k => (
              <li key={k} className="flex gap-2 text-[16px] leading-snug">
                <span className="font-black w-5 shrink-0" style={{ color: r.checks[k] ? '#15803d' : '#9ca3af' }}>{r.checks[k] ? '✓' : '✗'}</span>
                <span><b style={{ color: r.checks[k] ? '#1f2630' : '#6b7280' }}>{CHECK_LABEL[k]}{!CORE.includes(k) ? '（加分）' : ''}</b>：<span className="text-slate-600">{CHECK_EXPLAIN[k]}</span></span>
              </li>
            ))}
          </ul>
          {isForming && <p className="text-[15px] text-slate-500">尚未突破，所以量能、收盤確認等條件要等突破當天才會成立。</p>}
        </CardSection>
        <CardSection title="風險控制（教學示範）">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <CardStat label="停損（擺動點）" value={num(r.stop)} color="#11803d" />
            <CardStat label="停損（1.5 倍 ATR）" value={num(r.stopAtr)} color="#11803d" />
            <CardStat label="量測目標價" value={num(r.target)} color="#c81e2c" />
            <CardStat label="報酬風險比" value={isForming ? '—' : `1 : ${num(r.rr, 2)}`} />
          </div>
          <p className="text-[15.5px] text-slate-600 leading-relaxed">量測目標 = 突破點 ± 三角形最寬處的高度；停損放在三角形內最後一個擺動點外側。先想好停損再進場，報酬風險比最好在 1 : 2 以上。</p>
        </CardSection>
        {gs && gs.n > 0 && (
          <CardSection title={`30 年回測：${g} 級${up ? '向上突破' : '向下跌破'}的歷史表現`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <CardStat label="歷史次數" value={gs.n.toLocaleString()} />
              <CardStat label="先達到目標" value={`${(gs.winRate * 100).toFixed(1)}%`} color="#c81e2c" />
              <CardStat label="先碰到停損" value={`${(gs.stopRate * 100).toFixed(1)}%`} color="#11803d" />
              <CardStat label="20 天平均報酬" value={pct(gs.avgR20, 2)} />
            </div>
            <p className="text-[15px] text-slate-500">歷史統計只代表過去同類型態的平均結果，不代表這一檔一定會照這樣走。</p>
          </CardSection>
        )}
        <CardSection title="三個學習重點">
          <ol className="list-decimal pl-6 space-y-1 text-[16.5px] leading-relaxed">
            <li>只看<b>收盤</b>是否突破，盤中穿過又縮回來的常是假突破。</li>
            <li><b>沒有量</b>的突破容易失敗；量能、OBV、RSI 同時確認，成功率較高。</li>
            <li>突破後跌回三角形內，代表訊號失效，要依計畫<b>停損</b>，不要凹單。</li>
          </ol>
        </CardSection>
      </div>
      <CardFooter note="型態由程式依固定規則辨識，與人工看圖可能不同。本卡為技術分析教學內容，不構成投資建議。" />
    </StudyCardModal>
  );
}
const Stat = ({ label, v, hi }: { label: string; v: string; hi?: boolean }) => (
  <div className="flex flex-col leading-tight">
    <span className="text-[13px] text-slate-500 font-bold">{label}</span>
    <span className={`font-mono font-black text-[17px] ${hi ? 'text-indigo-700' : 'text-slate-900'}`}>{v}</span>
  </div>
);
const KV = ({ k, v, cls }: { k: string; v: string; cls?: string }) => (
  <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 pb-1"><span className="text-slate-600 font-bold">{k}</span><span className={`font-mono font-black ${cls || 'text-slate-900'}`}>{v}</span></div>
);

// ───────────────────────── 迷你 K 線（含三角形） ─────────────────────────
function MiniChart({ r }: { r: Row }) {
  const [d, setD] = useState<any>(null);
  const [e, setE] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/history/daily?symbol=${encodeURIComponent(r.id)}`)
      .then(async res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setD)
      .catch(err => setE(err.message));
  }, [r.id]);
  if (e) return <ErrorBox text={`K 線讀取失敗：${e}`} />;
  if (!d) return <Loading text="讀取 K 線…" />;
  const dates: string[] = d.date;
  const pick = (a: (number | null)[], b: number[]) => a.map((x, i) => (x != null && isFinite(x) ? x : b[i]));
  const O = pick(d.adj_open, d.open), H = pick(d.adj_high, d.high), L = pick(d.adj_low, d.low), C = pick(d.adj_close, d.close);
  const sIdx = dates.indexOf(r.chart.startDate);
  const eIdx = dates.indexOf(r.chart.endDate);
  if (sIdx < 0 || eIdx < 0) return <ErrorBox text="圖表資料日期對不上，請稍後再試" />;
  const from = Math.max(0, sIdx - 20);
  const to = dates.length - 1;
  const xs = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const lineAt = (y0: number, y1: number, x: number) => y0 + ((y1 - y0) * (x - sIdx)) / (eIdx - sIdx || 1);
  const ys = xs.flatMap(i => [H[i], L[i]]).concat([lineAt(r.chart.u0, r.chart.u1, sIdx), r.target, r.stop]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const W = 900, Hh = 320, pad = 8;
  const bw = (W - 60) / xs.length;
  const X = (i: number) => 4 + (i - from) * bw + bw / 2;
  const Y = (v: number) => pad + (Hh - 2 * pad) * (1 - (v - lo) / (hi - lo || 1));
  const tx = to;
  return (
    <div className="bg-slate-950 rounded-2xl p-2 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full min-w-[600px] h-auto" role="img" aria-label={`${r.name} 三角收斂 K 線圖`}>
        {xs.map(i => {
          const upBar = C[i] >= O[i];
          const col = upBar ? '#f43f5e' : '#22c55e';
          return (
            <g key={i}>
              <line x1={X(i)} x2={X(i)} y1={Y(H[i])} y2={Y(L[i])} stroke={col} strokeWidth={1} />
              <rect x={X(i) - Math.max(1, bw * 0.35)} width={Math.max(2, bw * 0.7)} y={Y(Math.max(O[i], C[i]))} height={Math.max(1, Math.abs(Y(O[i]) - Y(C[i])))} fill={col} />
            </g>
          );
        })}
        <line x1={X(sIdx)} y1={Y(r.chart.u0)} x2={X(tx)} y2={Y(lineAt(r.chart.u0, r.chart.u1, tx))} stroke="#fbbf24" strokeWidth={2} />
        <line x1={X(sIdx)} y1={Y(r.chart.l0)} x2={X(tx)} y2={Y(lineAt(r.chart.l0, r.chart.l1, tx))} stroke="#60a5fa" strokeWidth={2} />
        {r.chart.highs.map(([dt, v]) => { const i = dates.indexOf(dt); return i >= 0 ? <circle key={`h${dt}`} cx={X(i)} cy={Y(v)} r={4} fill="none" stroke="#fbbf24" strokeWidth={2} /> : null; })}
        {r.chart.lows.map(([dt, v]) => { const i = dates.indexOf(dt); return i >= 0 ? <circle key={`l${dt}`} cx={X(i)} cy={Y(v)} r={4} fill="none" stroke="#60a5fa" strokeWidth={2} /> : null; })}
        <line x1={X(sIdx)} x2={W - 50} y1={Y(r.target)} y2={Y(r.target)} stroke="#f43f5e" strokeDasharray="6 4" />
        <text x={W - 48} y={Y(r.target) + 4} fill="#fda4af" fontSize={13}>目標</text>
        <line x1={X(sIdx)} x2={W - 50} y1={Y(r.stop)} y2={Y(r.stop)} stroke="#22c55e" strokeDasharray="6 4" />
        <text x={W - 48} y={Y(r.stop) + 4} fill="#86efac" fontSize={13}>停損</text>
      </svg>
      <div className="flex flex-wrap gap-4 px-2 pb-1 text-[14px] text-slate-300">
        <span><b className="text-amber-400">━</b> 上軌（壓力）</span><span><b className="text-sky-400">━</b> 下軌（支撐）</span><span>○ 觸碰點</span><span>還原股價</span>
      </div>
    </div>
  );
}

// ───────────────────────── 30 年回測 ─────────────────────────
function BacktestView({ bt }: { bt: Backtest }) {
  const [side, setSide] = useState<Side>('up');
  const S = (k: string) => bt.stats[`${side}|${k}`];
  const all = S('all');
  const rows = (keys: [string, string][]) => keys.map(([k, label]) => ({ label, s: S(k) })).filter(x => x.s);
  const checks = (Object.keys(CHECK_LABEL) as (keyof Checks)[]).map(k => ({ k, yes: S(`check|${k}|yes`), no: S(`check|${k}|no`) })).filter(x => x.yes && x.no);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setSide('up')} className={`min-h-[44px] px-4 rounded-xl font-black text-[16px] border-2 ${side === 'up' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200'}`}>▲ 向上突破（做多）</button>
        <button type="button" onClick={() => setSide('down')} className={`min-h-[44px] px-4 rounded-xl font-black text-[16px] border-2 ${side === 'down' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200'}`}>▼ 向下跌破（做空）</button>
        <span className="text-[15px] text-slate-600 ml-auto">{bt.range[0]} ～ {bt.range[1]}，{bt.stocks.toLocaleString()} 檔，共 {bt.events.toLocaleString()} 個事件</span>
      </div>
      {all && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Big label="突破事件數" v={all.n.toLocaleString()} />
          <Big label="先到量測目標" v={pct(all.winRate, 1).replace('+', '')} cls="text-rose-700" />
          <Big label="先碰停損" v={pct(all.stopRate, 1).replace('+', '')} cls="text-emerald-700" />
          <Big label="真突破（3 天站穩）" v={pct(all.trueBreak, 1).replace('+', '')} />
          <Big label="平均出場報酬" v={pct(all.avgPnl, 2)} cls={all.avgPnl >= 0 ? 'text-rose-700' : 'text-emerald-700'} />
          <Big label="20 天後平均報酬" v={pct(all.avgR20, 2)} cls={all.avgR20 >= 0 ? 'text-rose-700' : 'text-emerald-700'} />
          <Big label="20 天後上漲比例" v={pct(all.pos20, 1).replace('+', '')} />
          <Big label="曾達半個目標" v={pct(all.halfTarget, 1).replace('+', '')} />
        </div>
      )}
      <Compare title="每個條件：符合 vs 不符合" head={['條件', '符合（筆數／達標率／20天報酬）', '不符合（筆數／達標率／20天報酬）', '差異']}
        rows={checks.map(c => [CHECK_LABEL[c.k], fmt(c.yes!), fmt(c.no!), diff(c.yes!, c.no!)])} />
      <Compare title="核心三條件（量能 + RSI + 收盤確認）同時符合" head={['', '筆數', '達標率', '停損率', '真突破率', '20 天報酬']}
        rows={rows([['core3|yes', '三項都符合'], ['core3|no', '沒有全部符合']]).map(x => [x.label, x.s.n.toLocaleString(), p1(x.s.winRate), p1(x.s.stopRate), p1(x.s.trueBreak), pct(x.s.avgR20, 2)])} />
      <Compare title="突破量能（突破日 ÷ 20 日均量）" head={['量能倍數', '筆數', '達標率', '停損率', '真突破率', '20 天報酬']}
        rows={rows([['vol|<1', '< 1 倍'], ['vol|1–1.5', '1–1.5 倍'], ['vol|1.5–2', '1.5–2 倍'], ['vol|≥2', '≥ 2 倍']]).map(x => [x.label, x.s.n.toLocaleString(), p1(x.s.winRate), p1(x.s.stopRate), p1(x.s.trueBreak), pct(x.s.avgR20, 2)])} />
      <Compare title="突破位置（三角形長度比例）" head={['位置', '筆數', '達標率', '停損率', '真突破率', '20 天報酬']}
        rows={rows([['pos|<1/2', '1/2 之前'], ['pos|1/2–3/4', '1/2–3/4（最佳區）'], ['pos|>3/4', '3/4 之後（接近頂點）']]).map(x => [x.label, x.s.n.toLocaleString(), p1(x.s.winRate), p1(x.s.stopRate), p1(x.s.trueBreak), pct(x.s.avgR20, 2)])} />
      <Compare title="綜合評級（9 項核心條件）" head={['評級', '筆數', '達標率', '停損率', '真突破率', '20 天報酬']}
        rows={rows([['grade|A', 'A 級（7 項以上）'], ['grade|B', 'B 級（5–6 項）'], ['grade|C', 'C 級（4 項以下）']]).map(x => [x.label, x.s.n.toLocaleString(), p1(x.s.winRate), p1(x.s.stopRate), p1(x.s.trueBreak), pct(x.s.avgR20, 2)])} />
      <Compare title="型態" head={['型態', '筆數', '達標率', '停損率', '真突破率', '20 天報酬']}
        rows={rows([['shape|asc', '上升三角'], ['shape|sym', '對稱三角'], ['shape|desc', '下降三角']]).map(x => [x.label, x.s.n.toLocaleString(), p1(x.s.winRate), p1(x.s.stopRate), p1(x.s.trueBreak), pct(x.s.avgR20, 2)])} />
      <Compare title="年代" head={['年代', '筆數', '達標率', '停損率', '真突破率', '20 天報酬']}
        rows={rows([['decade|1990s', '1990 年代'], ['decade|2000s', '2000 年代'], ['decade|2010s', '2010 年代'], ['decade|2020s', '2020 年代']]).map(x => [x.label, x.s.n.toLocaleString(), p1(x.s.winRate), p1(x.s.stopRate), p1(x.s.trueBreak), pct(x.s.avgR20, 2)])} />

      <RecentEvents events={bt.latestEvents.filter(e => e.side === side)} />

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[15px] leading-relaxed text-slate-800">
        <b>回測方法：</b>突破當天收盤確認，隔天開盤進場；停損設在三角形內最後一個擺動點，目標為三角形最寬處高度從突破點投影；
        同一天同時碰到停損與目標，保守視為停損；最多持有 60 個交易日。使用還原股價，未計手續費與稅。
        只計入 20 日均量 ≥ 100 張的個股，不含 ETF。<br />
        <b>限制：</b>資料庫只有目前仍在交易的股票，已下市的公司不在其中（倖存者偏差），結果會略為樂觀。
      </div>
    </div>
  );
}
const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (s: Stat) => `${s.n.toLocaleString()}／${p1(s.winRate)}／${pct(s.avgR20, 2)}`;
const diff = (a: Stat, b: Stat) => {
  const d = a.winRate - b.winRate;
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} 個百分點`;
};
const Big = ({ label, v, cls }: { label: string; v: string; cls?: string }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="text-[15px] text-slate-500 font-bold">{label}</div>
    <div className={`text-[26px] font-black font-mono ${cls || 'text-slate-900'}`}>{v}</div>
  </div>
);
function Compare({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
      <div className="text-[18px] font-black mb-2">{title}</div>
      <table className="w-full text-[15px]">
        <thead><tr className="text-slate-500 text-left">{head.map(h => <th key={h} className="py-2 pr-4 font-bold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className={`py-2 pr-4 ${j === 0 ? 'font-black' : 'font-mono'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
function RecentEvents({ events }: { events: any[] }) {
  const [n, setN] = useState(20);
  if (!events.length) return null;
  const RES: Record<string, string> = { target: '達目標', stop: '停損', time: '到期出場', open: '進行中' };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
      <div className="text-[18px] font-black mb-2">最近的突破事件（實際結果）</div>
      <table className="w-full text-[15px]">
        <thead><tr className="text-slate-500 text-left">{['日期', '股票', '評級', '量能', '位置', '結果', '出場報酬', '20 天報酬'].map(h => <th key={h} className="py-2 pr-4 font-bold">{h}</th>)}</tr></thead>
        <tbody>
          {events.slice(0, n).map((e, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-2 pr-4 font-mono">{e.date}</td>
              <td className="py-2 pr-4 font-black">{e.id} {e.name}</td>
              <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded font-black ${gradeCls(e.score)}`}>{grade(e.score)}</span></td>
              <td className="py-2 pr-4 font-mono">{num(e.volRatio, 1)} 倍</td>
              <td className="py-2 pr-4 font-mono">{Math.round(e.position * 100)}%</td>
              <td className="py-2 pr-4 font-bold">{RES[e.out.result]}（{e.out.exitDays} 天）</td>
              <td className={`py-2 pr-4 font-mono font-black ${e.out.pnlPct >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{pct(e.out.pnlPct, 1)}</td>
              <td className="py-2 pr-4 font-mono">{e.out.ret20 == null ? '—' : pct(e.out.ret20, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {n < events.length && <button type="button" onClick={() => setN(n + 30)} className="mt-2 min-h-[40px] px-4 rounded-xl border-2 border-slate-200 font-bold">顯示更多</button>}
    </div>
  );
}

// ───────────────────────── 規則說明 ─────────────────────────
function RulesView({ params }: { params?: any }) {
  const p = params || {};
  const rows: [string, string, string][] = [
    ['成交量', '20 日均量', `突破日量能 ≥ 均量 ${p.volRatio ?? 1.5} 倍；5 日均量 > 20 日均量（加分）`],
    ['OBV 能量潮', '—', '突破當天 OBV 創三角形期間新高（跌破則創新低）'],
    ['RSI', '14', `向上突破 > ${p.rsiUp ?? 55}（跌破 < ${p.rsiDown ?? 45}）；收斂期間 RSI 低點墊高為加分`],
    ['MACD', '12 / 26 / 9', 'DIF 在 DEA 之上，且柱狀體比前一天放大'],
    ['ADX', '14', '收斂期間平均 < 20，突破當天轉升'],
    ['布林帶寬', '20, 2', `突破前一天帶寬位於近 120 日最低 ${Math.round((p.bbSqueezePct ?? 0.2) * 100)}% 內，突破當天擴張`],
    ['ATR', '14', `幅度過濾與停損尺度（停損 ${p.stopAtr ?? 1.5} 倍 ATR）`],
    ['收盤確認', '—', `收盤超出趨勢線 ${Math.round((p.breakPct ?? 0.01) * 100)}% 或 ${p.breakAtr ?? 0.5} 倍 ATR；只看收盤，不看盤中影線`],
    ['時間確認', '—', '突破後 1–3 天收盤仍站在線外，列為「突破確認中」；跌回線內就移出清單'],
    ['突破位置', '—', `三角形長度的 ${Math.round((p.posMin ?? 0.5) * 100)}%–${Math.round((p.posMax ?? 0.75) * 100)}%；超過 3/4 視為弱訊號`],
    ['型態有效性', '—', `上下軌合計至少 ${p.minTouches ?? 5} 個觸碰點，長度 ${p.minLen ?? 20}–${p.maxLen ?? 120} 根 K 線，寬度至少收斂 25%`],
    ['順勢', '120 日均線', '向上突破時收盤在 120 日線之上（跌破則在之下）'],
  ];
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-[16px] leading-relaxed">
        <div className="text-[19px] font-black mb-1">核心邏輯</div>
        三角收斂的本質是<b>波動壓縮</b>：價格與量能同步遞減，能量蓄積後釋放。有效突破需同時滿足<b>價格、量能、時間</b>三要素。
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
        <div className="text-[19px] font-black mb-2">程式怎麼判斷</div>
        <table className="w-full text-[16px]">
          <thead><tr className="text-slate-500 text-left"><th className="py-2 pr-4">指標</th><th className="py-2 pr-4">參數</th><th className="py-2">確認條件</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r[0]} className="border-t border-slate-100"><td className="py-2 pr-4 font-black whitespace-nowrap">{r[0]}</td><td className="py-2 pr-4 font-mono whitespace-nowrap">{r[1]}</td><td className="py-2">{r[2]}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-[16px] leading-relaxed space-y-2">
        <div className="text-[19px] font-black">怎麼找三角形</div>
        <p>1. 找擺動高低點：某根 K 線的最高（最低）價是前後各 {p.pivotK ?? 5} 根中最高（最低），而且要等右邊 {p.pivotK ?? 5} 根走完才算確認，不偷看未來。</p>
        <p>2. 三角形從區間內最高的擺動高點開始；之後的擺動高點連成上軌、擺動低點連成下軌（最小平方法）。</p>
        <p>3. 上軌持平或下降、下軌持平或上升，兩線往前收斂；期間收盤都在兩線之間（容許 1 次小幅越界）。</p>
        <p>4. 收盤第一次站上上軌（跌破下軌）即為突破，再逐項檢查上表條件，符合 9 項核心條件中的幾項就是評分。</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-[16px] leading-relaxed">
        <div className="text-[19px] font-black mb-1">風險控制</div>
        停損：三角形內最後一個擺動低點下方，或 1.5–2 倍 ATR。目標價：三角形最寬處的高度，從突破點投影。可在達到目標前先減碼、剩餘部位用移動停損。
        <div className="mt-2"><b>常見陷阱：</b>盤中假突破（一律看收盤）、無量突破（放棄或減半）、頂點附近突破（降低預期）、逆大週期突破（縮小部位）。</div>
      </div>
    </div>
  );
}
