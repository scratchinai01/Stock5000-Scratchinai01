import React, { useEffect, useMemo, useState } from 'react';
import { InstrumentSpec, StudentProfile, OrderAction, AssetCategory, Position } from '../types/market';
import { C, mono, fmtPrice, fmtMoney, fmtSigned, dirColor, arrow, instrumentChange, Icon, Chip, Segmented, TopBar, IconButton } from './ui';
import { getInstrumentTradingClock } from '../utils/tradingClock';
import { getTwHolidayName, nextTwTradingDay, formatTradingDay } from '../utils/twHolidays';
import { computeOrderCost, simpleActions, ACTION_LABEL, isLongPosition, contractMultiplier } from '../utils/orderMath';
import { KLineChart } from '../components/KLineChart';
import { useGlossary } from '../context/GlossaryContext';
import { FINANCIAL_TERMS } from '../data/financialTerms';
import { OrderScreen, type OrderPreset } from './OrderScreen';
import type { ClientOrder, OrderRequest } from '../hooks/useOrderBook';
import { usesOrderBook, closeSide, isActiveStatus } from '../utils/orderRules';

export interface TradeRequest {
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction;
  price: number;
  quantity: number;
  unitMultiplier: number;
  totalAmountOrMargin: number;
  notionalValue: number;
  rationale: string;
}

interface Props {
  instruments: InstrumentSpec[];
  selectedInstrument: InstrumentSpec;
  onSelectInstrument: (inst: InstrumentSpec) => void;
  isAuthenticated: boolean;
  currentProfile: StudentProfile | null;
  profiles: StudentProfile[];
  netAssetValue: number;
  totalReturnPct: number;
  totalUnrealizedPnL: number;
  onLogin: () => void;
  onExecuteTrade: (t: TradeRequest) => void | Promise<void>;
  onClosePosition: (positionId: string) => void | Promise<void>;
  onOpenAdvancedTrade: (inst: InstrumentSpec) => void;
  onOpenProAnalysis: () => void;
  onSwitchToDesktop: () => void;
  lastUpdateTime?: string;
  orders: ClientOrder[];
  reservedCash: number;
  onPlaceOrder: (req: OrderRequest) => Promise<{ order?: ClientOrder; error?: string }>;
  onCancelOrder: (id: string) => Promise<{ order?: ClientOrder; error?: string }>;
  onModifyOrder: (id: string, patch: { limitPrice?: number; quantity?: number }) => Promise<{ order?: ClientOrder; error?: string }>;
}

type Tab = 'watch' | 'quote' | 'order' | 'portfolio' | 'rank';

const WATCH_KEY = 'm_watchlist_v1';
const DEFAULT_WATCH = ['TX', 'MTX', 'TMF', '2330', '2317', '2454', '0050', 'CDF', '00679B', 'NVDA'];

function loadWatch(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WATCH_KEY) || 'null');
    if (Array.isArray(v)) return v;
  } catch {}
  return DEFAULT_WATCH;
}

const GROUPS: { name: string; match: (i: InstrumentSpec, watch: string[]) => boolean }[] = [
  { name: '我的自選', match: (i, w) => w.includes(i.symbol) },
  { name: '期貨', match: i => i.category === 'futures' },
  { name: '股票', match: i => i.category === 'stocks' },
  { name: 'ETF／債券', match: i => i.category === 'etfs' || i.category === 'bonds' },
  { name: '選擇權', match: i => i.category === 'options' || i.category === 'warrants' },
  { name: '美股', match: i => i.category === 'us_stocks' },
];

const TERM_FOR: Partial<Record<AssetCategory, string>> = {
  stocks: 'limit_up',
  etfs: 'nav_etf',
  bonds: 'nav_etf',
  futures: 'initial_margin',
  options: 'premium_opt',
};

// ─────────────────────────────────────────────────────────────
export const MobileShell: React.FC<Props> = props => {
  const [tab, setTab] = useState<Tab>('watch');
  const [watch, setWatch] = useState<string[]>(loadWatch);
  useEffect(() => {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(watch)); } catch {}
  }, [watch]);

  const inst = props.instruments.find(i => i.symbol === props.selectedInstrument.symbol) || props.selectedInstrument;
  const open = (i: InstrumentSpec, to: Tab = 'quote') => { props.onSelectInstrument(i); setTab(to); };
  const [preset, setPreset] = useState<OrderPreset | null>(null);
  const openSymbol = (sym: string, to: Tab = 'quote') => { const i = props.instruments.find(x => x.symbol === sym); if (i) open(i, to); };
  const startClose = (pos: Position) => {
    const i = props.instruments.find(x => x.symbol === pos.symbol);
    if (!i) return;
    setPreset({ symbol: pos.symbol, side: closeSide(pos.orderType), intent: 'CLOSE', positionId: pos.id });
    open(i, 'order');
  };
  const activeOrders = props.orders.filter(o => isActiveStatus(o.status)).length;
  // 其他元件（例如名詞卡的「去下單試試」）可以切換手機版分頁
  useEffect(() => {
    const onNav = (e: Event) => {
      const to = (e as CustomEvent<Tab>).detail;
      if (to) setTab(to);
    };
    window.addEventListener('m-nav', onNav);
    return () => window.removeEventListener('m-nav', onNav);
  }, []);
  const toggleWatch = (sym: string) => setWatch(w => (w.includes(sym) ? w.filter(s => s !== sym) : [...w, sym]));
  const needLogin = !props.isAuthenticated && (tab === 'order' || tab === 'portfolio' || tab === 'rank');

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: "'Noto Sans TC', system-ui, sans-serif" }}>
      <div className="flex-1 flex flex-col pb-[76px]">
        {needLogin ? (
          <LoginGate onLogin={props.onLogin} />
        ) : tab === 'watch' ? (
          <Watchlist {...props} watch={watch} onOpen={open} />
        ) : tab === 'quote' ? (
          <Quote {...props} inst={inst} watched={watch.includes(inst.symbol)} onToggleWatch={() => toggleWatch(inst.symbol)} onBack={() => setTab('watch')} onTrade={() => { setPreset(null); setTab('order'); }} />
        ) : tab === 'order' ? (
          <OrderScreen
            inst={inst}
            profile={props.currentProfile}
            orders={props.orders}
            reservedCash={props.reservedCash}
            preset={preset}
            onPlaceOrder={props.onPlaceOrder}
            onCancelOrder={props.onCancelOrder}
            onModifyOrder={props.onModifyOrder}
            onOpenAdvancedTrade={props.onOpenAdvancedTrade}
            onBack={() => setTab('quote')}
            onOpenSymbol={sym => openSymbol(sym)}
          />
        ) : tab === 'portfolio' ? (
          <Portfolio {...props} onOpen={open} onStartClose={startClose} />
        ) : (
          <Rank {...props} />
        )}
      </div>

      <nav aria-label="主選單" className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 px-1 pt-1.5" style={{ background: C.bar, borderTop: `1px solid ${C.line}`, paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        {([
          ['watch', '自選', Icon.star(tab === 'watch')],
          ['quote', '行情', Icon.chart],
          ['order', '下單', Icon.bolt],
          ['portfolio', '庫存', Icon.wallet],
          ['rank', '排行', Icon.trophy],
        ] as [Tab, string, React.ReactNode][]).map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[50px] text-[11px] font-bold"
            style={{ color: tab === id ? C.accent : C.muted }}>
            <span className="relative">
              {icon}
              {id === 'order' && activeOrders > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center" style={{ background: C.accent, color: C.bg }}>{activeOrders}</span>
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
function MarketChip({ inst }: { inst?: InstrumentSpec }) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  const holiday = getTwHolidayName(today);
  const clock = inst ? getInstrumentTradingClock(inst.symbol, inst.category) : getInstrumentTradingClock('2330', 'stocks');
  if (holiday && clock.instrumentClass !== 'US_EQUITY' && clock.instrumentClass !== 'COMMODITY_FUTURES' && clock.instrumentClass !== 'CRYPTO_24_7') {
    return <Chip>{holiday}休市 · 下次開盤 {formatTradingDay(nextTwTradingDay(today))}</Chip>;
  }
  return <Chip tone={clock.isTradingNow ? 'accent' : 'muted'}>{clock.isTradingNow ? '交易中' : '非交易時段'} · {clock.sessionName}</Chip>;
}

function LoginGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
      <div style={{ color: C.accent }}>{Icon.wallet}</div>
      <div className="text-[20px] font-black">登入後才能下單、看庫存與排行</div>
      <div className="text-[14px] leading-relaxed" style={{ color: C.muted }}>自選與行情不用登入也能看。</div>
      <button type="button" onClick={onLogin} className="min-h-[48px] px-8 rounded-2xl font-black text-[16px]" style={{ background: C.accent, color: C.bg }}>
        操盤手登入
      </button>
    </div>
  );
}

// ───────────────────────── 1. 自選 ─────────────────────────
function Watchlist(p: Props & { watch: string[]; onOpen: (i: InstrumentSpec) => void }) {
  const [group, setGroup] = useState(GROUPS[0].name);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const g = GROUPS.find(x => x.name === group)!;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? p.instruments.filter(i => i.symbol.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle))
      : p.instruments.filter(i => g.match(i, p.watch));
    if (!needle && group === '我的自選') list.sort((a, b) => p.watch.indexOf(a.symbol) - p.watch.indexOf(b.symbol));
    return list;
  }, [p.instruments, p.watch, group, q]);

  return (
    <>
      <div className="sticky top-0 z-30 px-4 pt-3 pb-2.5 flex flex-col gap-2.5" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between">
          <div className="text-[22px] font-black tracking-wide">自選</div>
          <div className="flex gap-1">
            <IconButton label="搜尋商品" onClick={() => setSearching(s => !s)}>{Icon.search}</IconButton>
            <IconButton label="切換電腦版" onClick={p.onSwitchToDesktop}>{Icon.desktop}</IconButton>
          </div>
        </div>
        {searching && (
          <label className="flex items-center gap-2 px-3 rounded-xl min-h-[44px]" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <span style={{ color: C.muted }}>{Icon.search}</span>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="代號或名稱，例如 2330、台積電" aria-label="搜尋商品"
              className="flex-1 bg-transparent outline-none text-[15px]" style={{ color: C.text }} />
          </label>
        )}
        <div className="flex items-center gap-2 flex-wrap"><MarketChip /></div>
        {!q && <Segmented options={GROUPS.map(x => x.name)} value={group} onChange={setGroup} ariaLabel="商品分組" />}
      </div>

      <div className="grid grid-cols-[1.5fr_1fr_0.9fr_0.95fr] gap-2 px-4 py-2 text-[12px]" style={{ color: C.muted, borderBottom: `1px solid ${C.line}` }}>
        <span>商品</span><span className="text-right">成交</span><span className="text-right">漲跌</span><span className="text-right">幅度</span>
      </div>

      {rows.length === 0 && (
        <div className="px-6 py-10 text-center text-[14px] leading-relaxed" style={{ color: C.muted }}>
          {group === '我的自選' && !q ? '還沒有自選商品。到「行情」按右上角星號就能加入。' : '找不到符合的商品。'}
        </div>
      )}
      {rows.map(i => {
        const { chg, pct } = instrumentChange(i);
        const col = dirColor(chg);
        return (
          <button key={i.symbol} type="button" onClick={() => p.onOpen(i)}
            className="grid grid-cols-[1.5fr_1fr_0.9fr_0.95fr] gap-2 items-center px-4 py-2.5 min-h-[60px] text-left active:opacity-70"
            style={{ borderBottom: `1px solid #151c25` }}>
            <span className="flex flex-col min-w-0">
              <span className="text-[16px] font-bold truncate">{i.name}</span>
              <span className="text-[12px] flex items-center gap-1" style={{ ...mono, color: C.muted }}>
                {i.symbol}{i.isMock && <span style={{ color: C.accent }}>· 無即時資料</span>}
              </span>
            </span>
            <span className="text-right text-[17px] font-bold" style={{ ...mono, color: i.isMock ? C.muted : col }}>{fmtPrice(i.price)}</span>
            <span className="text-right text-[14px] font-semibold" style={{ ...mono, color: col }}>{arrow(chg)}{fmtPrice(Math.abs(chg))}</span>
            <span className="justify-self-end text-[14px] font-bold px-2 py-1 rounded-lg min-w-[64px] text-center text-white"
              style={{ ...mono, background: chg > 0 ? C.upFill : chg < 0 ? C.downFill : '#334155' }}>
              {fmtSigned(pct)}%
            </span>
          </button>
        );
      })}
      <div className="px-4 py-3 text-[12px] leading-relaxed" style={{ color: C.muted }}>
        報價來源 FinMind{p.lastUpdateTime ? ` · 更新 ${p.lastUpdateTime}` : ''}。收盤後顯示最後收盤價，盤中自動更新。
      </div>
    </>
  );
}

// ───────────────────────── 2. 行情 ─────────────────────────
function Quote(p: Props & { inst: InstrumentSpec; watched: boolean; onToggleWatch: () => void; onBack: () => void; onTrade: () => void }) {
  const { inst } = p;
  const { chg, pct } = instrumentChange(inst);
  const col = dirColor(chg);
  const [view, setView] = useState('K線');
  const unitIsLots = inst.category === 'stocks' || inst.category === 'etfs' || inst.category === 'bonds';
  const stats: [string, string, string?][] = [
    ['開盤', fmtPrice(inst.open), dirColor((inst.open ?? inst.prevClose) - inst.prevClose)],
    ['最高', fmtPrice(inst.high), dirColor((inst.high ?? inst.prevClose) - inst.prevClose)],
    ['最低', fmtPrice(inst.low), dirColor((inst.low ?? inst.prevClose) - inst.prevClose)],
    ['昨收', fmtPrice(inst.prevClose)],
    ['總量', inst.volume ? `${Math.round(inst.volume / (unitIsLots && inst.volume > 100000 ? 1000 : 1)).toLocaleString()} ${unitIsLots ? '張' : '口'}` : '—'],
    ['漲停', inst.limitUpPrice ? fmtPrice(inst.limitUpPrice) : '—', C.up],
    ['跌停', inst.limitDownPrice ? fmtPrice(inst.limitDownPrice) : '—', C.down],
    ['資料', (inst.fetchTime || '').slice(5, 10).replace('-', '/') || '—'],
  ];

  return (
    <>
      <TopBar
        left={<IconButton label="返回自選" onClick={p.onBack}>{Icon.back}</IconButton>}
        title={<>{inst.name} <span style={{ ...mono, color: C.muted, fontWeight: 600 }}>{inst.symbol}</span></>}
        sub={<MarketChipText inst={inst} />}
        right={<IconButton label={p.watched ? '移出自選' : '加入自選'} onClick={p.onToggleWatch} color={C.accent}>{Icon.star(p.watched)}</IconButton>}
      />
      <div className="px-4 pt-1.5 pb-3 flex flex-col gap-2.5" style={{ background: C.bar, borderBottom: `1px solid ${C.line}` }}>
        {inst.isMock && (
          <div className="text-[12px] font-bold px-3 py-2 rounded-lg" style={{ background: C.accentBg, color: C.accent }}>
            尚未取得 FinMind 真實行情，以下為佔位價，不可交易
          </div>
        )}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[40px] font-bold leading-none" style={{ ...mono, color: col }}>{fmtPrice(inst.price)}</span>
          <span className="text-[18px] font-bold" style={{ ...mono, color: col }}>{arrow(chg)}{fmtPrice(Math.abs(chg))}</span>
          <span className="text-[18px] font-bold" style={{ ...mono, color: col }}>{fmtSigned(pct)}%</span>
        </div>
        <div className="grid grid-cols-4 gap-x-2.5 gap-y-2 text-[12px]">
          {stats.map(([k, v, c]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span style={{ color: C.muted }}>{k}</span>
              <span className="text-[14px] font-semibold" style={{ ...mono, color: c || C.text }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div role="tablist" aria-label="報價分頁" className="grid grid-cols-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        {['K線', '五檔', '分析'].map(t => (
          <button key={t} type="button" role="tab" aria-selected={view === t} onClick={() => setView(t)}
            className="min-h-[44px] text-[15px]"
            style={{ color: view === t ? C.accent : C.muted, fontWeight: view === t ? 900 : 500, borderBottom: `3px solid ${view === t ? C.accent : 'transparent'}` }}>
            {t}
          </button>
        ))}
      </div>

      <div className="px-3 py-3 flex flex-col gap-3">
        {view === 'K線' && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            <KLineChart instrument={inst} />
          </div>
        )}
        {view === '五檔' && (
          inst.fiveBids?.length || inst.fiveAsks?.length ? (
            <div className="grid grid-cols-2 gap-2">
              <BookSide title="委買" rows={inst.fiveBids || []} color={C.up} />
              <BookSide title="委賣" rows={inst.fiveAsks || []} color={C.down} />
            </div>
          ) : (
            <div className="px-4 py-6 rounded-xl text-center text-[14px] leading-relaxed" style={{ border: `1px dashed ${C.line2}`, color: C.muted }}>
              目前沒有委買委賣掛單資料。<br />台股盤中（09:00–13:30）會顯示 FinMind 的最佳一檔買賣價。
            </div>
          )
        )}
        {view === '分析' && (
          <div className="flex flex-col gap-2">
            <div className="text-[14px] leading-relaxed" style={{ color: C.sub }}>用 1994 年起的歷史資料看長期走勢、年化報酬、最大回撤，並回測均線、RSI、KD 等策略。</div>
            <button type="button" onClick={p.onOpenProAnalysis} className="min-h-[48px] rounded-xl font-black text-[15px]" style={{ background: C.card, border: `1px solid ${C.line2}`, color: C.accent }}>
              開啟專業分析
            </button>
          </div>
        )}
        <TermCard inst={inst} />
      </div>

      <div className="fixed inset-x-0 z-30 grid grid-cols-2 gap-2.5 px-4 py-2.5" style={{ bottom: 'calc(60px + max(10px, env(safe-area-inset-bottom)))', background: C.bar, borderTop: `1px solid ${C.line}` }}>
        <button type="button" onClick={p.onTrade} className="min-h-[50px] rounded-2xl text-white text-[18px] font-black" style={{ background: C.downFill }}>賣出</button>
        <button type="button" onClick={p.onTrade} className="min-h-[50px] rounded-2xl text-white text-[18px] font-black" style={{ background: C.upFill }}>買進</button>
      </div>
      <div className="h-[72px]" />
    </>
  );
}

function MarketChipText({ inst }: { inst: InstrumentSpec }) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  const clock = getInstrumentTradingClock(inst.symbol, inst.category);
  const holiday = getTwHolidayName(today);
  const tw = !['US_EQUITY', 'COMMODITY_FUTURES', 'CRYPTO_24_7'].includes(clock.instrumentClass);
  return <>{clock.classLabel} · {tw && holiday ? `${holiday}休市` : clock.sessionName}</>;
}

function BookSide({ title, rows, color }: { title: string; rows: { price: number; volume: number }[]; color: string }) {
  return (
    <div className="rounded-xl p-2.5 flex flex-col gap-1" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="text-[12px]" style={{ color: C.muted }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between text-[14px]" style={mono}>
          <span style={{ color }}>{fmtPrice(r.price)}</span><span>{r.volume.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function TermCard({ inst }: { inst: InstrumentSpec }) {
  const g = useGlossary();
  const id = TERM_FOR[inst.category] || 'prev_close';
  const term = FINANCIAL_TERMS.find(t => t.id === id);
  if (!term) return null;
  const learned = g.isTermLearned(term.id);
  const example =
    term.id === 'limit_up' && inst.limitUpPrice && inst.prevClose
      ? `${inst.name}昨收 ${fmtPrice(inst.prevClose)}，所以今天最高只能到 ${fmtPrice(inst.limitUpPrice)}。`
      : term.id === 'initial_margin' && inst.marginRequirement
      ? `${inst.name}每口原始保證金以 NT$ ${inst.marginRequirement.toLocaleString()} 計算（系統設定值）。`
      : '';
  return (
    <div className="rounded-xl p-3.5 flex flex-col gap-1.5" style={{ background: C.card2, border: `1px solid ${C.line2}` }}>
      <div className="flex items-center gap-1.5 text-[13px] font-black" style={{ color: C.accent }}>{Icon.book}名詞小學堂 · {term.t}</div>
      <div className="text-[13px] leading-relaxed" style={{ color: C.sub }}>{term.s}{example && ` ${example}`}</div>
      <div className="flex gap-2">
        <button type="button" onClick={() => !learned && g.toggleTermLearned(term.id)} disabled={learned}
          className="min-h-[36px] px-3 rounded-lg text-[13px] font-bold" style={{ border: `1px solid ${C.line2}`, color: learned ? C.muted : C.text }}>
          {learned ? '已學會' : '我學會了 +1'}
        </button>
        <button type="button" onClick={() => g.openTermDetail(term.id)} className="min-h-[36px] px-3 rounded-lg text-[13px] font-black" style={{ background: C.accent, color: C.bg }}>
          詳情 →
        </button>
        <button type="button" onClick={() => g.openDrawer(term.id)} className="min-h-[36px] px-2 rounded-lg text-[13px] font-bold" style={{ color: C.muted }}>
          全部名詞
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── 3. 下單 ─────────────────────────
// ───────────────────────── 4. 庫存 ─────────────────────────
const CAT_GROUP: { key: string; label: string; color: string; match: (c: AssetCategory) => boolean }[] = [
  { key: 'stocks', label: '股票', color: '#f5b301', match: c => c === 'stocks' },
  { key: 'etf', label: 'ETF／債券', color: '#3b82f6', match: c => c === 'etfs' || c === 'bonds' },
  { key: 'fut', label: '期貨保證金', color: '#a78bfa', match: c => c === 'futures' },
  { key: 'opt', label: '選擇權／權證', color: '#f472b6', match: c => c === 'options' || c === 'warrants' },
  { key: 'other', label: '美股／原物料／加密', color: '#22d3ee', match: c => c === 'us_stocks' || c === 'commodities' || c === 'crypto' },
];

function positionValue(pos: Position) {
  const marginBased = pos.category === 'futures' || pos.category === 'commodities' || pos.orderType.startsWith('SHORT') || pos.orderType.startsWith('SELL_');
  return marginBased ? pos.totalCostOrMargin + (pos.unrealizedPnL || 0) : pos.notionalValue;
}

function Portfolio(p: Props & { onOpen: (i: InstrumentSpec, to?: Tab) => void; onStartClose: (pos: Position) => void }) {
  const prof = p.currentProfile;
  const [shock, setShock] = useState(-3);
  const [closing, setClosing] = useState<Position | null>(null);
  if (!prof) return <LoginGate onLogin={p.onLogin} />;
  const positions = prof.positions || [];
  const rank = rankProfiles(p.profiles).findIndex(r => r.id === prof.id) + 1;

  const alloc = CAT_GROUP.map(g => ({ ...g, value: positions.filter(x => g.match(x.category)).reduce((s, x) => s + Math.max(positionValue(x), 0), 0) }));
  const cashV = Math.max(prof.availableCash, 0);
  const totalAlloc = alloc.reduce((s, a) => s + a.value, 0) + cashV || 1;

  // 壓力測試：台股（股票、非債券 ETF、期貨）同步漲跌；選擇權為非線性、債券與海外資產不計
  let shockPnL = 0;
  let excluded = 0;
  for (const x of positions) {
    const linear = x.category === 'stocks' || x.category === 'futures' || (x.category === 'etfs' && !x.symbol.endsWith('B'));
    if (!linear) { excluded++; continue; }
    shockPnL += (isLongPosition(x.orderType) ? 1 : -1) * x.notionalValue * (shock / 100);
  }

  return (
    <>
      <div className="sticky top-0 z-30 px-4 pt-3 pb-2.5 flex items-center justify-between" style={{ background: C.bar }}>
        <span className="text-[22px] font-black">庫存</span>
        <span className="text-[12px]" style={{ color: C.muted }}>{prof.studentName}{prof.teamName ? ` · ${prof.teamName}` : ''}</span>
      </div>
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#141c26', border: `1px solid ${C.line2}` }}>
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[12px]" style={{ color: C.muted }}>總資產（現金＋持股市值＋保證金）</span>
              <span className="text-[26px] font-bold" style={mono}>{fmtMoney(p.netAssetValue)}</span>
              <span className="text-[12px]" style={{ color: C.muted }}>起始資金 {fmtMoney(prof.initialCapital)}</span>
            </div>
            {rank > 0 && (
              <div className="flex flex-col items-center px-3 py-2 rounded-xl flex-none" style={{ background: C.accentBg }}>
                <span className="text-[11px] font-bold" style={{ color: C.accent }}>班級排名</span>
                <span className="text-[22px] font-bold" style={{ ...mono, color: C.accent }}>{rank}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="累積報酬" value={`${fmtSigned(p.totalReturnPct)}%`} color={dirColor(p.totalReturnPct)} />
            <Kpi label="未實現損益" value={Math.round(p.totalUnrealizedPnL).toLocaleString()} color={dirColor(p.totalUnrealizedPnL)} />
            <Kpi label="可用現金" value={Math.round(prof.availableCash).toLocaleString()} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: C.line }}>
              {alloc.filter(a => a.value > 0).map(a => <div key={a.key} style={{ width: `${(a.value / totalAlloc) * 100}%`, background: a.color }} />)}
              <div style={{ width: `${(cashV / totalAlloc) * 100}%`, background: '#475569' }} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: C.sub }}>
              {alloc.filter(a => a.value > 0).map(a => <span key={a.key}><span style={{ color: a.color }}>●</span> {a.label} {((a.value / totalAlloc) * 100).toFixed(0)}%</span>)}
              <span><span style={{ color: '#94a3b8' }}>●</span> 現金 {((cashV / totalAlloc) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-3.5 flex flex-col gap-2" style={{ background: C.card2, border: `1px solid ${C.line2}` }}>
          <div className="flex items-center gap-1.5 text-[14px] font-black"><span style={{ color: C.accent }}>{Icon.warn}</span>壓力測試</div>
          <div className="flex gap-1.5">
            {[-10, -3, 3].map(v => (
              <button key={v} type="button" onClick={() => setShock(v)} className="flex-1 min-h-[40px] rounded-lg text-[14px] font-bold"
                style={{ background: shock === v ? C.accent : C.card, color: shock === v ? C.bg : C.sub, border: `1px solid ${shock === v ? C.accent : C.line2}` }}>
                {v > 0 ? '漲' : '跌'} {Math.abs(v)}%
              </button>
            ))}
          </div>
          <div className="text-[13px] leading-relaxed" style={{ color: C.sub }}>
            如果台股{shock > 0 ? '上漲' : '下跌'} {Math.abs(shock)}%，你的股票與期貨部位預估損益
            <b className="mx-1" style={{ ...mono, color: dirColor(shockPnL) }}>{shockPnL >= 0 ? '+' : '−'}{fmtMoney(Math.abs(shockPnL))}</b>
            （約占總資產 {((Math.abs(shockPnL) / (p.netAssetValue || 1)) * 100).toFixed(1)}%）。
            {excluded > 0 && `另有 ${excluded} 筆選擇權、債券或海外部位未計入。`}
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[14px]" style={{ color: C.muted }}>目前沒有持倉。到「自選」挑一檔開始吧。</div>
        ) : (
          <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            {positions.map(x => {
              const inst = p.instruments.find(i => i.symbol === x.symbol);
              return (
                <div key={x.id} className="grid grid-cols-[1.3fr_1fr_1fr] gap-2 items-center px-3.5 py-3" style={{ background: C.card, borderBottom: `1px solid ${C.line}` }}>
                  <button type="button" onClick={() => inst && p.onOpen(inst)} className="flex flex-col text-left min-w-0">
                    <span className="text-[15px] font-bold truncate">{x.name}</span>
                    <span className="text-[11px]" style={{ color: C.muted }}>{ACTION_LABEL[x.orderType] ?? x.orderType} · {x.quantity}</span>
                  </button>
                  <span className="flex flex-col text-right">
                    <span className="text-[15px] font-bold" style={mono}>{fmtPrice(x.currentPrice)}</span>
                    <span className="text-[11px]" style={{ color: C.muted }}>成本 {fmtPrice(x.entryPrice)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-[15px] font-bold" style={{ ...mono, color: dirColor(x.unrealizedPnL) }}>{Math.round(x.unrealizedPnL).toLocaleString()}</span>
                    <button type="button" onClick={() => (usesOrderBook(x.category) ? p.onStartClose(x) : setClosing(x))} className="min-h-[32px] px-2.5 rounded-lg text-[12px] font-bold" style={{ border: `1px solid ${C.line2}`, color: C.sub }}>平倉</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {closing && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setClosing(null)}>
          <div role="dialog" aria-modal="true" aria-label="確認平倉" className="w-full rounded-t-3xl p-5 flex flex-col gap-3" style={{ background: C.card, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="text-[18px] font-black">確認平倉</div>
            <div className="text-[15px] leading-relaxed" style={{ color: C.sub }}>
              以現價 <b style={mono}>{fmtPrice(closing.currentPrice)}</b> 平倉 <b style={{ color: C.text }}>{closing.name}</b> 全部 {closing.quantity}，預估損益
              <b className="ml-1" style={{ ...mono, color: dirColor(closing.unrealizedPnL) }}>{Math.round(closing.unrealizedPnL).toLocaleString()}</b>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setClosing(null)} className="min-h-[50px] rounded-2xl font-black" style={{ background: C.bar, color: C.sub }}>取消</button>
              <button type="button" onClick={async () => { await p.onClosePosition(closing.id); setClosing(null); }} className="min-h-[50px] rounded-2xl font-black" style={{ background: C.accent, color: C.bg }}>確認平倉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const Kpi: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[11px]" style={{ color: C.muted }}>{label}</span>
    <span className="text-[15px] font-bold truncate" style={{ ...mono, color: color || C.text }}>{value}</span>
  </div>
);

// ───────────────────────── 5. 排行 ─────────────────────────
function rankProfiles(profiles: StudentProfile[]) {
  return profiles
    .map(p => {
      let sec = 0, fut = 0, pnl = 0;
      (p.positions || []).forEach(pos => {
        pnl += pos.unrealizedPnL || 0;
        if (pos.category === 'futures') fut += pos.totalCostOrMargin || 0;
        else sec += pos.notionalValue || 0;
      });
      const nav = (p.availableCash ?? 50000000) + sec + fut + pnl;
      const init = p.initialCapital || 50000000;
      const cats = new Set((p.positions || []).map(x => (x.category === 'warrants' ? 'options' : x.category)));
      return { id: p.id, name: p.teamName ? `${p.studentName}（${p.teamName}）` : p.studentName, nav, ret: ((nav - init) / init) * 100, classes: cats.size, trades: (p.tradeHistory || []).length };
    })
    .sort((a, b) => b.nav - a.nav);
}

const BACKTEST_FLAG = 'pro_analysis_backtest_used';

function Rank(p: Props) {
  const [mode, setMode] = useState('報酬率');
  const g = useGlossary();
  const ranked = useMemo(() => {
    const r = rankProfiles(p.profiles);
    return mode === '分散度' ? [...r].sort((a, b) => b.classes - a.classes || b.ret - a.ret) : r;
  }, [p.profiles, mode]);
  const me = p.currentProfile;
  const myCats = new Set((me?.positions || []).map(x => (x.category === 'warrants' ? 'options' : x.category))).size;
  const reasons = (me?.tradeHistory || []).filter(t => t.rationale && !t.rationale.startsWith('手機下單：') && !t.rationale.startsWith('依據當下即時撮合價')).length;
  let backtested = 0;
  try { backtested = localStorage.getItem(BACKTEST_FLAG) ? 1 : 0; } catch {}
  const tasks: [string, number, number, string][] = [
    ['名詞小學堂：讀懂 10 個名詞', Math.min(g.totalLearnedCount, 10), 10, '在報價頁點「我學會了」，或打開名詞小學堂。'],
    ['分散投資：持有 3 類以上資產', Math.min(myCats, 3), 3, '股票、ETF／債券、期貨、選擇權、美股任選三類。'],
    ['下單時寫下理由 3 次', Math.min(reasons, 3), 3, '確認委託時填寫，期末報告會用到。'],
    ['用專業分析回測 1 個策略', backtested, 1, '比較策略與買進持有，誰的夏普值比較高？'],
  ];

  return (
    <>
      <div className="sticky top-0 z-30 px-4 pt-3 pb-2.5 flex flex-col gap-2.5" style={{ background: C.bar }}>
        <span className="text-[22px] font-black">全班排行</span>
        <Segmented options={['報酬率', '分散度']} value={mode} onChange={setMode} ariaLabel="排行依據" />
        <span className="text-[12px] leading-relaxed" style={{ color: C.muted }}>
          {mode === '報酬率' ? '依總資產排名。報酬率高不代表風險控管好，記得看分散度。' : '持有越多類資產排越前面，同類數時比報酬率。'}
          夏普值與最大回撤排名需要每日淨值紀錄，之後加入。
        </span>
      </div>
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {ranked.map((r, i) => {
            const mine = me && r.id === me.id;
            return (
              <div key={r.id} className="flex items-center gap-3 px-3.5 py-3 min-h-[60px]" style={{ background: mine ? '#1a1608' : C.card, borderBottom: `1px solid ${C.line}` }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold flex-none"
                  style={{ ...mono, background: ['#f5b301', '#cbd5e1', '#d08a4f'][i] || C.line2, color: i < 3 ? C.bg : C.text }}>{i + 1}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[15px] font-bold truncate">{r.name}{mine ? '（我）' : ''}</span>
                  <span className="text-[11px]" style={{ color: C.muted }}>持有 {r.classes} 類資產 · 交易 {r.trades} 次</span>
                </span>
                <span className="text-[15px] font-bold" style={{ ...mono, color: dirColor(r.ret) }}>{fmtSigned(r.ret)}%</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-1">
          <span className="text-[17px] font-black">學習任務</span>
          <span className="text-[12px]" style={{ color: C.muted }}>邊玩邊學</span>
        </div>
        {tasks.map(([title, done, total, why]) => (
          <div key={title} className="rounded-xl p-3.5 flex flex-col gap-2" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="flex justify-between gap-2">
              <span className="text-[14px] font-bold">{title}</span>
              <span className="text-[13px] font-bold" style={{ ...mono, color: done >= total ? C.down : C.accent }}>{done >= total ? '完成' : `${done} / ${total}`}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.line }}><div className="h-full rounded-full" style={{ width: `${(done / total) * 100}%`, background: done >= total ? C.down : C.accent }} /></div>
            <span className="text-[12px] leading-relaxed" style={{ color: C.muted }}>{why}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default MobileShell;
