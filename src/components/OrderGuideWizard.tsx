import React, { useEffect, useMemo, useState } from 'react';
import type { AssetCategory, InstrumentSpec, OrderAction, StudentProfile } from '../types/market';
import type { ClientOrder, OrderRequest } from '../hooks/useOrderBook';
import { getInstrumentTradingClock } from '../utils/tradingClock';
import { computeOrderCost, contractMultiplier } from '../utils/orderMath';
import { usesOrderBook, roundToTick, validateLimitPrice, priceLimits, STATUS_LABEL } from '../utils/orderRules';
import { lookupInstrument, suggestInstruments } from '../utils/instrumentLookup';
import { StudyCardModal, CardSection, CardStat, CardFooter, INK } from './StudyCardModal';

/**
 * 新手下單引導：登入後自動跳出，一步一步帶學員完成第一筆交易
 * 1 現在能交易的市場 → 2 選商品 → 3 做多／做空 → 4 數量與價格 → 5 確認送出 → 6 成交回報與成交卡片
 */

export interface GuideTrade {
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
  isOpen: boolean;
  onClose: () => void;
  instruments: InstrumentSpec[];
  profile: StudentProfile;
  reservedCash: number;
  orders: ClientOrder[];
  onPlaceOrder: (req: OrderRequest) => Promise<{ order?: ClientOrder; error?: string }>;
  onExecuteTrade: (t: GuideTrade) => void | Promise<void>;
  /** 全市場查到的新商品加入清單 */
  onAddInstrument?: (inst: InstrumentSpec) => void;
}

// ───────── 全市場查詢（清單裡沒有的台股、ETF、債券 ETF、美股） ─────────
type LookupState = { q: string; busy: boolean; error: string | null; sugg?: { symbol: string; name: string }[] } | null;
function MarketLookup({ query, state, setState, onFound }: { query: string; state: LookupState; setState: (s: LookupState) => void; onFound: (i: InstrumentSpec) => void }) {
  const run = async (target = query) => {
    if (!target) return;
    setState({ q: query, busy: true, error: null });
    try {
      const found = await lookupInstrument(target);
      setState(null);
      onFound(found);
    } catch (e: any) {
      const sugg = await suggestInstruments(target);
      setState({ q: query, busy: false, error: sugg.length ? `查無「${target}」這個代號。` : e?.message || '查詢失敗', sugg });
    }
  };
  // 輸入完整代號（例如 00719B、00681L、6542）時自動查詢
  useEffect(() => {
    if (!/^(\d{4,6}[A-Z]?|[A-Z]{1,5})$/i.test(query)) return;
    if (state?.q === query) return;
    const t = setTimeout(run, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  if (!query) return null;
  const mine = state && state.q === query ? state : null;
  return (
    <div className="space-y-2">
      {mine?.error ? <Tip tone="rose">❌ {mine.error}</Tip> : <Tip tone="sky">目前清單裡沒有「{query}」，可以到全市場查詢真實報價。</Tip>}
      {mine?.sugg && mine.sugg.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[15px] font-black text-slate-700">你是不是要找：</div>
          {mine.sugg.map(x => (
            <button key={x.symbol} type="button" disabled={mine.busy} onClick={() => run(x.symbol)}
              className="w-full text-left rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 hover:bg-slate-50">
              <b className="font-mono">{x.symbol}</b> <span className="text-slate-700">{x.name}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" disabled={mine?.busy} onClick={() => run()}
        className="w-full min-h-[52px] rounded-2xl text-[16px] sm:text-[17px] font-black text-white disabled:opacity-60" style={{ background: INK }}>
        {mine?.busy ? '查詢中…' : `🔎 到全市場查詢「${query}」`}
      </button>
    </div>
  );
}

// ───────── 市場分組 ─────────
interface MarketGroup {
  id: string;
  icon: string;
  name: string;
  hours: string;
  clockSymbol: string;
  clockCategory: AssetCategory;
  categories: AssetCategory[];
  popular: string[];
  hint: string;
}
const MARKETS: MarketGroup[] = [
  { id: 'tw', icon: '🇹🇼', name: '台股（股票、ETF）', hours: '週一～五 09:00～13:30', clockSymbol: '2330', clockCategory: 'stocks', categories: ['stocks', 'etfs', 'bonds'],
    popular: ['2330', '0050', '2317', '2454', '0056', '00878', '2412', '2881', '2882', '2603'], hint: '最適合新手：一張＝1000 股' },
  { id: 'fut', icon: '⚡', name: '台指期貨', hours: '日盤 08:45～13:45／夜盤 15:00～隔天 05:00', clockSymbol: 'TX', clockCategory: 'futures', categories: ['futures'],
    popular: ['TMF', 'TX'], hint: '有槓桿，做多做空都很方便；新手先用微台 TMF' },
  { id: 'us', icon: '🇺🇸', name: '美股', hours: '台灣時間 晚上 21:30～隔天 04:00（夏令）', clockSymbol: 'NVDA', clockCategory: 'us_stocks', categories: ['us_stocks'],
    popular: ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL'], hint: '1 股就能買，以最新報價立即成交' },
  { id: 'cmd', icon: '🛢️', name: '原物料期貨', hours: '大多為台灣時間 早上 06:00～隔天 05:00', clockSymbol: 'CL', clockCategory: 'commodities', categories: ['commodities'],
    popular: ['GC', 'CL', 'SI'], hint: '黃金、原油等；以最新報價立即成交' },
  { id: 'crypto', icon: '🪙', name: '加密貨幣', hours: '24 小時全年無休', clockSymbol: 'BTC', clockCategory: 'crypto', categories: ['crypto'],
    popular: ['BTC', 'ETH'], hint: '隨時可交易；波動很大' },
];
const STABLE = new Set(['USDT', 'USDC', 'TWDT', 'TWDC']);

function actionsFor(cat: AssetCategory): { long: OrderAction | null; short: OrderAction | null } {
  switch (cat) {
    case 'stocks': return { long: 'BUY_STOCK', short: 'SHORT_SELL_STOCK' };
    case 'etfs': return { long: 'BUY_ETF', short: 'SHORT_SELL_ETF' };
    case 'bonds': return { long: 'BUY_BOND', short: null };
    case 'futures': return { long: 'BUY_FUTURES_LONG', short: 'SELL_FUTURES_SHORT' };
    case 'us_stocks': return { long: 'BUY_US_STOCK', short: null };
    case 'commodities': return { long: 'BUY_COMMODITY_LONG', short: 'SELL_COMMODITY_SHORT' };
    case 'crypto': return { long: 'BUY_CRYPTO', short: 'SHORT_SELL_CRYPTO' };
    default: return { long: null, short: null };
  }
}
const unitOf = (cat: AssetCategory) => (cat === 'futures' || cat === 'commodities' || cat === 'options' ? '口' : cat === 'us_stocks' ? '股' : cat === 'crypto' ? '單位' : '張');
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const fmtPx = (n: number) => (Number.isFinite(n) ? n.toLocaleString('zh-TW', { maximumFractionDigits: 4 }) : '—');
const tradable = (i: InstrumentSpec) => !i.isMock && i.price > 0;

// ───────── 共用外觀 ─────────
const STEP_NAMES = ['市場', '商品', '多空', '輸入', '確認', '成交'];
const StepBar = ({ step }: { step: number }) => (
  <div className="flex items-center gap-1" aria-label={`第 ${step + 1} 步，共 6 步：${STEP_NAMES[step]}`}>
    {STEP_NAMES.map((t, i) => (
      <span key={t} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? 'bg-amber-500' : 'bg-slate-200'}`} />
    ))}
  </div>
);
const Tip = ({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'sky' | 'rose' | 'emerald' }) => {
  const c = { amber: 'bg-amber-50 border-amber-200 text-amber-950', sky: 'bg-sky-50 border-sky-200 text-sky-950', rose: 'bg-rose-50 border-rose-200 text-rose-950', emerald: 'bg-emerald-50 border-emerald-200 text-emerald-950' }[tone];
  return <div className={`border rounded-2xl px-4 py-3 text-[16px] leading-relaxed ${c}`}>{children}</div>;
};

export function OrderGuideWizard({ isOpen, onClose, instruments, profile, reservedCash, orders, onPlaceOrder, onExecuteTrade, onAddInstrument }: Props) {
  const [step, setStep] = useState(0);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [side, setSide] = useState<'long' | 'short' | null>(null);
  const [qtyText, setQtyText] = useState('1');
  const [priceMode, setPriceMode] = useState<'now' | 'limit'>('now');
  const [limitText, setLimitText] = useState('');
  const [search, setSearch] = useState('');
  const [lookup, setLookup] = useState<{ q: string; busy: boolean; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [instantFill, setInstantFill] = useState<{ price: number; qty: number; at: number } | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [hideAuto, setHideAuto] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0); setMarketId(null); setSymbol(null); setSide(null); setQtyText('1'); setPriceMode('now'); setLimitText('');
    setSearch(''); setSubmitError(null); setOrderId(null); setInstantFill(null); setShowCard(false); setNow(new Date()); setMinimized(false);
    setHideAuto(guideHiddenFor(profile.studentName));
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [isOpen]);

  const markets = useMemo(
    () =>
      MARKETS.map(m => {
        const clock = getInstrumentTradingClock(m.clockSymbol, m.clockCategory, now);
        const list = instruments.filter(i => m.categories.includes(i.category) && tradable(i) && !STABLE.has(i.symbol.toUpperCase()));
        return { ...m, open: clock.isTradingNow, session: clock.sessionName, next: clock.nextSessionTime, count: list.length, list };
      }).filter(m => m.count > 0),
    [instruments, now]
  );
  const market = markets.find(m => m.id === marketId) || null;
  const inst = instruments.find(i => i.symbol === symbol) || null;
  const acts = inst ? actionsFor(inst.category) : { long: null, short: null };
  const action = side === 'long' ? acts.long : side === 'short' ? acts.short : null;
  const isBuy = side === 'long';
  const book = inst ? usesOrderBook(inst.category) : false;
  const unit = inst ? unitOf(inst.category) : '張';
  const marketOpen = market?.open ?? false;

  // 立即成交價：買進看「委賣價」（賣方最低要價），賣出／放空看「委買價」（買方最高出價）
  const bestAsk = inst?.fiveAsks?.find(x => x.price > 0)?.price ?? null;
  const bestBid = inst?.fiveBids?.find(x => x.price > 0)?.price ?? null;
  const counterPrice = inst ? (isBuy ? bestAsk : bestBid) : null;
  const nowPrice = inst ? (book ? roundToTick(inst.category, inst.symbol, counterPrice ?? inst.price) : inst.price) : 0;

  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const limitPrice = priceMode === 'now' || !book ? nowPrice : Number(limitText) || 0;
  const priceError = inst && book && priceMode === 'limit' ? validateLimitPrice(inst.category, inst.symbol, limitPrice, inst.prevClose || inst.price) : null;
  const lim = inst ? priceLimits(inst.category, inst.symbol, inst.prevClose || inst.price) : null;
  const cost = inst && action && qty > 0 && limitPrice > 0 ? computeOrderCost(inst, action, limitPrice, qty) : null;
  const freeCash = profile.availableCash - reservedCash;
  // 開盤中卻沒有盤中即時報價（例如小台）：只能等收盤價撮合
  const eodOnly = Boolean(inst && book && marketOpen && !String(inst.fetchTime || '').includes('即時'));
  const willFillNow =
    !book ? true : eodOnly || counterPrice == null ? null : isBuy ? limitPrice >= counterPrice : limitPrice <= counterPrice;

  const order = orderId ? orders.find(o => o.id === orderId) || null : null;
  const filled = instantFill ?? (order && order.filledQty > 0 ? { price: order.avgPrice, qty: order.filledQty, at: order.fills[order.fills.length - 1]?.at ?? order.updatedAt } : null);

  if (!isOpen) return null;

  const sideWord = side === 'short' ? '做空' : '做多';
  const verb = !inst ? '' : side === 'long' ? '買進' : inst.category === 'stocks' || inst.category === 'etfs' ? '融券賣出' : '賣出';

  const submit = async () => {
    if (!inst || !action || !cost) return;
    setBusy(true);
    setSubmitError(null);
    const rationale = `新手引導：${sideWord}${inst.name}`;
    try {
      if (book) {
        const r = await onPlaceOrder({
          symbol: inst.symbol, name: inst.name, category: inst.category, action, intent: 'OPEN',
          priceType: 'LIMIT', tif: 'ROD', limitPrice, quantity: qty, rationale,
          multiplier: contractMultiplier(inst), marginRequirement: inst.marginRequirement ?? null,
        });
        if (r.error || !r.order) { setSubmitError(r.error || '委託失敗'); return; }
        setOrderId(r.order.id);
      } else {
        await onExecuteTrade({
          symbol: inst.symbol, name: inst.name, category: inst.category, action, price: inst.price, quantity: qty,
          unitMultiplier: cost.multiplier, totalAmountOrMargin: cost.totalCostOrMargin, notionalValue: cost.notionalValue, rationale,
        });
        setInstantFill({ price: inst.price, qty, at: Date.now() });
      }
      setStep(5);
    } catch (e: any) {
      setSubmitError(e?.message || '委託失敗');
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 0 && market) || (step === 1 && inst) || (step === 2 && action) ||
    (step === 3 && qty > 0 && limitPrice > 0 && !priceError && cost && cost.totalCostOrMargin <= freeCash);

  // 卡片：成交了就是「成交卡片」；預約單、委託中就是「委託卡片」
  const pendingOrder = !filled && order && (order.status === 'QUEUED' || order.status === 'WORKING') ? order : null;
  const cardInfo = inst && action ? (filled
    ? { kind: '成交卡片', at: filled.at, qty: filled.qty, price: filled.price, priceLabel: '成交價', when: '成交', status: null as string | null }
    : pendingOrder
    ? { kind: '委託卡片', at: pendingOrder.createdAt, qty: pendingOrder.quantity, price: pendingOrder.limitPrice ?? limitPrice, priceLabel: '委託價', when: '送出委託', status: STATUS_LABEL[pendingOrder.status] }
    : null) : null;
  const twTime = (ms: number) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

  // ───────── 各步驟內容 ─────────
  const body = (() => {
    if (step === 0)
      return (
        <div className="space-y-3">
          <h3 className="text-[19px] sm:text-[22px] font-black text-slate-900">第 1 步：選一個市場</h3>
          <Tip>綠色「開盤中」的市場，送出後<b>馬上就有機會成交</b>。休市中的台灣市場也能下單，會變成「預約單」，下一次開盤才撮合。</Tip>
          <div className="grid gap-2.5">
            {[...markets].sort((a, b) => Number(b.open) - Number(a.open)).map(m => (
              <button key={m.id} type="button" onClick={() => { setMarketId(m.id); setSymbol(null); setSide(null); setStep(1); }}
                className={`text-left rounded-2xl border-2 px-4 py-3 transition hover:shadow-md ${marketId === m.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-[30px]">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[17px] sm:text-[19px] font-black text-slate-900">{m.name}</span>
                      <span className={`text-[13px] font-black px-2 py-0.5 rounded-full ${m.open ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{m.open ? '🟢 開盤中' : '⚪ 休市中'}</span>
                    </div>
                    <div className="text-[14px] text-slate-600">{m.hours}</div>
                    <div className="text-[14px] text-slate-500">{m.open ? m.session : `下一盤：${m.next}`} · {m.hint}</div>
                  </div>
                  <span className="text-[19px] sm:text-[22px] text-slate-400">›</span>
                </div>
              </button>
            ))}
            {markets.length === 0 && <Tip tone="rose">行情還在載入中，請稍等幾秒再打開這個引導。</Tip>}
          </div>
        </div>
      );

    if (step === 1 && market) {
      const needle = search.trim().toLowerCase();
      const pop = market.popular.map(s => market.list.find(i => i.symbol === s)).filter(Boolean) as InstrumentSpec[];
      const rows = needle ? market.list.filter(i => i.symbol.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle)) : [...pop, ...market.list.filter(i => !pop.includes(i))].slice(0, 12);
      return (
        <div className="space-y-3">
          <h3 className="text-[19px] sm:text-[22px] font-black text-slate-900">第 2 步：選一檔商品</h3>
          <Tip tone="sky">不知道選什麼？先挑你聽過的公司或 <b>0050</b>。價格旁邊<span className="text-red-600 font-bold">紅色是上漲</span>、<span className="text-green-700 font-bold">綠色是下跌</span>（台灣習慣）。</Tip>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入代號或名稱，例如 2330、台積電" aria-label="搜尋商品"
            className="w-full min-h-[52px] rounded-2xl border-2 border-slate-200 px-4 text-[16px] sm:text-[17px] focus:border-amber-500 outline-none" />
          <div className="grid gap-2">
            {rows.map(i => (
              <button key={i.symbol} type="button" onClick={() => { setSymbol(i.symbol); setSide(null); setStep(2); }}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left ${symbol === i.symbol ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] sm:text-[18px] font-black text-slate-900 truncate">{i.name}</div>
                  <div className="text-[14px] text-slate-500 font-mono">{i.symbol} · {i.unitLabel}</div>
                </div>
                <div className="text-right">
                  <div className={`text-[17px] sm:text-[19px] font-black font-mono ${i.change > 0 ? 'text-red-600' : i.change < 0 ? 'text-green-700' : 'text-slate-800'}`}>{fmtPx(i.price)}</div>
                  <div className={`text-[13px] font-bold font-mono ${i.change > 0 ? 'text-red-600' : i.change < 0 ? 'text-green-700' : 'text-slate-500'}`}>{i.change > 0 ? '▲' : i.change < 0 ? '▼' : ''}{fmt(Math.abs(i.changePercent), 2)}%</div>
                </div>
              </button>
            ))}
            {rows.length === 0 && (
              <MarketLookup query={search.trim()} state={lookup} setState={setLookup}
                onFound={found => {
                  onAddInstrument?.(found);
                  const m = MARKETS.find(x => x.categories.includes(found.category));
                  if (m) setMarketId(m.id);
                  setSearch('');
                  setSymbol(found.symbol); setSide(null); setStep(2);
                }} />
            )}
          </div>
        </div>
      );
    }

    if (step === 2 && inst) {
      const mult = contractMultiplier(inst);
      const perPoint = inst.category === 'futures' ? `每 1 點 = NT$ ${fmt(mult)}` : inst.category === 'stocks' || inst.category === 'etfs' || inst.category === 'bonds' ? `每 1 元 = NT$ ${fmt(mult)}（1 張 1000 股）` : '';
      return (
        <div className="space-y-3">
          <h3 className="text-[19px] sm:text-[22px] font-black text-slate-900">第 3 步：你覺得 {inst.name} 會漲還是會跌？</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <button type="button" disabled={!acts.long} onClick={() => { setSide('long'); setStep(3); }}
              className={`rounded-3xl border-2 p-4 text-left transition disabled:opacity-40 ${side === 'long' ? 'border-red-500 bg-red-50' : 'border-red-200 bg-white hover:bg-red-50'}`}>
              <div className="text-[22px] sm:text-[26px] font-black text-red-600">📈 做多（買進）</div>
              <div className="text-[16px] text-slate-700 leading-relaxed mt-1">我覺得會<b className="text-red-600">漲</b>。先買進，之後漲了再賣出，<b>賺中間的價差</b>。</div>
              <div className="text-[14px] text-slate-500 mt-1">例：100 元買、110 元賣 → 每股賺 10 元</div>
            </button>
            <button type="button" disabled={!acts.short} onClick={() => { setSide('short'); setStep(3); }}
              className={`rounded-3xl border-2 p-4 text-left transition disabled:opacity-40 ${side === 'short' ? 'border-green-600 bg-green-50' : 'border-green-200 bg-white hover:bg-green-50'}`}>
              <div className="text-[22px] sm:text-[26px] font-black text-green-700">📉 做空（{inst.category === 'stocks' || inst.category === 'etfs' ? '融券賣出' : '賣出'}）</div>
              <div className="text-[16px] text-slate-700 leading-relaxed mt-1">我覺得會<b className="text-green-700">跌</b>。先賣出，之後跌了再買回來還，<b>一樣賺價差</b>。</div>
              <div className="text-[14px] text-slate-500 mt-1">{acts.short ? '例：100 元賣、90 元買回 → 每股賺 10 元' : '這類商品在本系統不能做空'}</div>
            </button>
          </div>
          <Tip tone="rose">
            ⚠️ 猜錯方向就會賠錢：做多遇到下跌、做空遇到上漲都會虧損。{inst.category === 'futures' ? '期貨有槓桿，漲跌一點就是 ' + perPoint.replace('每 1 點 = ', '') + '，請從 1 口開始。' : perPoint ? `${perPoint}。` : ''}
            {inst.category === 'stocks' || inst.category === 'etfs' ? ' 融券放空要先付 9 成保證金。' : ''}
          </Tip>
        </div>
      );
    }

    if (step === 3 && inst && action) {
      return (
        <div className="space-y-4">
          <h3 className="text-[19px] sm:text-[22px] font-black text-slate-900">第 4 步：輸入數量和價格</h3>

          <div className="space-y-1.5">
            <div className="text-[16px] sm:text-[17px] font-black text-slate-800">① 要{sideWord}幾{unit}？</div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="減少" onClick={() => setQtyText(String(Math.max(1, qty - 1)))} className="w-14 h-14 rounded-2xl bg-slate-100 text-[22px] sm:text-[26px] font-black">−</button>
              <input inputMode="numeric" value={qtyText} onChange={e => setQtyText(e.target.value.replace(/[^\d]/g, ''))} aria-label="數量"
                className="w-28 h-14 rounded-2xl border-2 border-slate-300 text-center text-[21px] sm:text-[24px] font-black font-mono focus:border-amber-500 outline-none" />
              <button type="button" aria-label="增加" onClick={() => setQtyText(String(qty + 1))} className="w-14 h-14 rounded-2xl bg-slate-100 text-[22px] sm:text-[26px] font-black">＋</button>
              <span className="text-[16px] sm:text-[18px] font-bold text-slate-700">{unit}</span>
            </div>
            <div className="text-[14px] text-slate-500">單位：{inst.unitLabel}。新手建議從 1 {unit} 開始。</div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[16px] sm:text-[17px] font-black text-slate-800">② 用什麼價格？</div>
            {book ? (
              <>
                <div className="grid sm:grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPriceMode('now')} className={`rounded-2xl border-2 p-3 text-left ${priceMode === 'now' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <div className="text-[16px] sm:text-[17px] font-black">⚡ 立即成交價（推薦）</div>
                    <div className="text-[21px] sm:text-[24px] font-black font-mono text-slate-900">{fmtPx(nowPrice)}</div>
                    <div className="text-[13px] text-slate-600">{counterPrice != null ? (isBuy ? '＝目前「委賣價」：賣方最便宜的要價' : '＝目前「委買價」：買方最高的出價') : '目前沒有五檔掛單資料，先用成交價'}</div>
                  </button>
                  <button type="button" onClick={() => { setPriceMode('limit'); if (!limitText) setLimitText(String(nowPrice)); }} className={`rounded-2xl border-2 p-3 text-left ${priceMode === 'limit' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <div className="text-[16px] sm:text-[17px] font-black">✍️ 自己輸入價格（限價）</div>
                    <div className="text-[13px] text-slate-600 mt-1">{isBuy ? '想買便宜一點，就掛低一點，等價格跌下來才成交' : '想賣貴一點，就掛高一點，等價格漲上去才成交'}</div>
                  </button>
                </div>
                {priceMode === 'limit' && (
                  <div className="space-y-1">
                    <input inputMode="decimal" value={limitText} onChange={e => setLimitText(e.target.value.replace(/[^\d.]/g, ''))} aria-label="委託價格"
                      className="w-44 h-14 rounded-2xl border-2 border-slate-300 px-3 text-[21px] sm:text-[24px] font-black font-mono focus:border-amber-500 outline-none" />
                    {lim && <div className="text-[14px] text-slate-500">今天可輸入範圍：跌停 {fmtPx(lim.down)} ～ 漲停 {fmtPx(lim.up)}</div>}
                    {priceError && <div className="text-[15px] font-bold text-rose-700">{priceError}</div>}
                  </div>
                )}
                <Tip tone="sky">
                  <div className="font-black mb-1">💡 什麼價格會「直接成交」？</div>
                  <div>• <b>買進</b>：你的價格 <b>≥ 委賣價</b>（賣方的最低要價）→ 馬上成交</div>
                  <div>• <b>賣出／放空</b>：你的價格 <b>≤ 委買價</b>（買方的最高出價）→ 馬上成交</div>
                  <div>• 價格沒達到 → 先排隊「委託中」，市場價格碰到你的價格才成交；當天沒成交，收盤後自動取消</div>
                  {(bestBid != null || bestAsk != null) && (
                    <div className="mt-1 font-mono">目前 委買價 <b className="text-green-700">{bestBid != null ? fmtPx(bestBid) : '—'}</b> ／ 委賣價 <b className="text-red-600">{bestAsk != null ? fmtPx(bestAsk) : '—'}</b> ／ 成交價 <b>{fmtPx(inst.price)}</b></div>
                  )}
                </Tip>
              </>
            ) : (
              <Tip tone="sky">這類商品以<b>最新報價 {fmtPx(inst.price)}</b> 立即成交，不用輸入價格。</Tip>
            )}
          </div>

          {cost && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-[16px] space-y-0.5">
              <div className="flex justify-between"><span>{side === 'short' || inst.category === 'futures' || inst.category === 'commodities' ? '需要保證金' : '需要金額'}</span><b className="font-mono">NT$ {fmt(cost.totalCostOrMargin)}</b></div>
              <div className="flex justify-between text-slate-600"><span>可用額度</span><span className="font-mono">NT$ {fmt(freeCash)}</span></div>
              {cost.totalCostOrMargin > freeCash && <div className="text-rose-700 font-bold">額度不夠，請減少數量。</div>}
            </div>
          )}
        </div>
      );
    }

    if (step === 4 && inst && action && cost) {
      const fillMsg = !book
        ? `會以最新報價 ${fmtPx(inst.price)} 立即成交。`
        : !marketOpen
        ? '現在休市，會變成「預約單」，下一次開盤時用開盤價撮合（開盤價比你的價格好才成交）。'
        : eodOnly
        ? '這檔商品沒有盤中即時報價，會等今天這一盤收盤後，用收盤價撮合（收盤價比你的價格好才成交）。想馬上成交，請改選有即時報價的商品，例如微台 TMF。'
        : willFillNow === true
        ? '你的價格已經碰到對手價，送出後應該會馬上成交。'
        : willFillNow === false
        ? '你的價格還沒碰到對手價，會先排隊「委託中」，等市場價格到了才成交。'
        : '送出後依市場最新價格撮合。';
      return (
        <div className="space-y-3">
          <h3 className="text-[19px] sm:text-[22px] font-black text-slate-900">第 5 步：確認後送出</h3>
          <div className={`rounded-3xl border-2 p-4 ${side === 'short' ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <div className="text-[18px] sm:text-[20px] leading-relaxed text-slate-900">
              我要 <b className={side === 'short' ? 'text-green-700' : 'text-red-600'}>{sideWord}（{verb}）</b><br />
              <b>{inst.name}</b> <span className="font-mono text-slate-600">{inst.symbol}</span>　<b className="font-mono">{qty}</b> {unit}<br />
              價格 <b className="font-mono">{fmtPx(limitPrice)}</b>{inst.category === 'us_stocks' ? ' 美元' : ''}{book ? '（限價、當日有效 ROD）' : '（最新報價）'}
            </div>
            <div className="mt-2 text-[16px] text-slate-700">{side === 'short' || inst.category === 'futures' || inst.category === 'commodities' ? '保證金' : '金額'}：<b className="font-mono">NT$ {fmt(cost.totalCostOrMargin)}</b></div>
          </div>
          <Tip tone={willFillNow === false || !marketOpen ? 'amber' : 'emerald'}>{fillMsg}</Tip>
          {submitError && <Tip tone="rose">❌ {submitError}</Tip>}
        </div>
      );
    }

    if (step === 5 && inst) {
      const status = instantFill ? 'FILLED' : order?.status;
      const done = Boolean(filled);
      return (
        <div className="space-y-3">
          <h3 className="text-[19px] sm:text-[22px] font-black text-slate-900">第 6 步：{done ? '🎉 成交了！' : '委託已送出'}</h3>
          {done ? (
            <Tip tone="emerald">
              <div className="text-[17px] sm:text-[19px]"><b>{sideWord} {inst.name}</b> 成交 <b className="font-mono">{filled!.qty}</b> {unit}，成交價 <b className="font-mono">{fmtPx(filled!.price)}</b></div>
              {order && order.filledQty < order.quantity && (
                <div>委託 {order.quantity} {unit}，先成交 {order.filledQty} {unit}（成交的部分已算數）。{order.status === 'PARTIAL' ? `還有 ${order.quantity - order.filledQty} ${unit} 在委託中${order.hint ? `：${order.hint.text}` : '。'}` : `剩下 ${order.quantity - order.filledQty} ${unit} ${order.status === 'CANCELLED' ? '已刪單' : '收盤未成交，已失效'}。`}</div>
              )}
              <div className="mt-1">部位已放進「我的持倉」。{side === 'short' ? '之後價格下跌你就賺錢；想結束時按「平倉」買回。' : '之後價格上漲你就賺錢；想結束時按「平倉」賣出。'}</div>
            </Tip>
          ) : (
            <Tip tone="amber">
              <div className="text-[16px] sm:text-[18px] font-black">目前狀態：{status ? STATUS_LABEL[status] : '處理中'}</div>
              {status === 'QUEUED' && <div>現在休市，下一次開盤（{market?.next}）會自動撮合。成交後這裡和「委託／成交回報」都會通知你。</div>}
              {status === 'WORKING' && <div>正在排隊等成交。可以先關掉這個視窗；成交時畫面上方會跳出「成交回報」。想改價或刪單，請到「委託」清單。</div>}
              {order?.hint && <div className="mt-1"><b>為什麼還沒成交？</b>{order.hint.text}</div>}
              {(status === 'CANCELLED' || status === 'REJECTED' || status === 'EXPIRED') && <div>{order?.rejectReason || order?.events[order.events.length - 1]?.text || '這筆委託沒有成交。'}</div>}
            </Tip>
          )}
          {cardInfo && (
            <button type="button" onClick={() => setShowCard(true)} className="w-full min-h-[60px] rounded-full text-[18px] sm:text-[20px] font-black text-white shadow-lg" style={{ background: INK }}>
              🪪 下載{cardInfo.kind}
            </button>
          )}
          <button type="button" onClick={() => { setStep(0); setMarketId(null); setSymbol(null); setSide(null); setQtyText('1'); setPriceMode('now'); setLimitText(''); setOrderId(null); setInstantFill(null); setSubmitError(null); }}
            className="w-full min-h-[52px] rounded-full text-[16px] sm:text-[17px] font-black border-2 border-slate-300 text-slate-700">再下一筆</button>
        </div>
      );
    }
    return null;
  })();

  const card = showCard && inst && action && cardInfo && (
    <StudyCardModal title={cardInfo.kind} filename={`${cardInfo.kind}_${inst.symbol}_${new Date(cardInfo.at).toISOString().slice(0, 10)}.png`} onClose={() => setShowCard(false)}>
      <div className="px-6 pt-6 pb-3 space-y-1">
        <div className="text-[15px] font-bold text-slate-500">5000萬股市大富翁 · {cardInfo.kind}</div>
        <div className="text-[30px] font-black leading-tight" style={{ color: INK }}>
          {profile.studentName} {sideWord} <span style={{ color: side === 'short' ? '#15803d' : '#dc2626' }}>{inst.name}</span>
        </div>
        <div className="text-[16px] text-slate-600 font-mono">{inst.symbol} · {twTime(cardInfo.at)} {cardInfo.when}</div>
        {cardInfo.status && (
          <div className="inline-block mt-1 px-3 py-1 rounded-full text-[16px] font-black" style={{ background: '#fef3c7', color: '#92400e' }}>
            ⏳ {cardInfo.status}{pendingOrder?.status === 'QUEUED' && market ? `：下一盤 ${market.next}` : '：等待成交'}
          </div>
        )}
      </div>
      <div className="px-6 pb-4 space-y-4">
        <CardSection title={cardInfo.status ? '委託內容' : '成交內容'}>
          <div className="grid grid-cols-2 gap-2">
            <CardStat label="方向" value={`${sideWord}（${verb}）`} color={side === 'short' ? '#15803d' : '#dc2626'} />
            <CardStat label="數量" value={`${cardInfo.qty} ${unit}`} />
            <CardStat label={cardInfo.priceLabel} value={`${fmtPx(cardInfo.price)}${inst.category === 'us_stocks' ? ' 美元' : ''}`} />
            <CardStat label={(side === 'short' || inst.category === 'futures' || inst.category === 'commodities' ? '保證金' : '金額') + (cardInfo.status ? '（預估）' : '')}
              value={`NT$ ${fmt(computeOrderCost(inst, action, cardInfo.price, cardInfo.qty).totalCostOrMargin)}`} />
          </div>
        </CardSection>
        {cardInfo.status && (
          <CardSection title="為什麼還沒成交？什麼時候會成交？">
            <div className="text-[17px] leading-relaxed text-slate-700">
              {isBuy ? `市場上有人願意用 ${fmtPx(cardInfo.price)} 或更便宜的價格賣出時就會成交。` : `市場上有人願意用 ${fmtPx(cardInfo.price)} 或更高的價格買進時就會成交。`}
              {pendingOrder?.status === 'QUEUED' ? '預約單會在開盤時用開盤價先試撮合，開盤價比委託價好就直接成交。' : ''}
              當盤沒有成交，收盤後委託自動失效。
              {pendingOrder?.hint && <div className="mt-2 font-bold text-amber-800">目前還沒成交的原因：{pendingOrder.hint.text}</div>}
            </div>
          </CardSection>
        )}
        <CardSection title="我的判斷">
          <div className="text-[18px] leading-relaxed" style={{ color: INK }}>
            {(() => {
              const per = ['stocks', 'etfs', 'bonds', 'futures', 'us_stocks'].includes(inst.category) ? contractMultiplier(inst) * cardInfo.qty : null;
              const u = inst.category === 'futures' ? '點' : inst.category === 'us_stocks' ? '美元' : '元';
              const tail = per ? `價格每${side === 'short' ? '跌' : '漲'} 1 ${u}，這筆部位約賺 NT$ ${fmt(per)}；` : '';
              return side === 'short'
                ? `我認為 ${inst.name} 會下跌，所以${cardInfo.status ? '掛單' : '先'}賣出。${tail}如果上漲就會虧損。`
                : `我認為 ${inst.name} 會上漲，所以${cardInfo.status ? '掛單' : '先'}買進。${tail}如果下跌就會虧損。`;
            })()}
          </div>
        </CardSection>
        <CardSection title="給自己的提醒">
          <div className="text-[17px] leading-relaxed text-slate-700">先想好「錯了要在哪裡停損」，再想要賺多少。這是模擬交易，用來練習判斷，不是投資建議。</div>
        </CardSection>
      </div>
      <CardFooter note={cardInfo.status ? '委託由本系統依台灣市場委託簿規則撮合；成交後可再下載成交卡片。' : `成交價來自本系統委託撮合（${book ? '台灣市場委託簿' : '最新報價即時成交'}）。`} />
    </StudyCardModal>
  );

  return (
    <>
      {minimized ? (
        <button type="button" onClick={() => setMinimized(false)}
          className="fixed z-[120] right-3 px-4 min-h-[46px] rounded-full bg-amber-500 text-white text-[15px] font-black shadow-2xl flex items-center gap-1.5 whitespace-nowrap ring-4 ring-amber-200/60"
          style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }} aria-label="展開新手下單引導">
          🧭 繼續引導 {step + 1}/6
        </button>
      ) : (
      <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-slate-900/50" onClick={() => setMinimized(true)}>
        <div role="dialog" aria-modal="true" aria-label="新手下單引導" onClick={e => e.stopPropagation()}
          className="w-full md:w-[720px] max-h-[92dvh] md:max-h-[92vh] bg-white rounded-t-[24px] md:rounded-[28px] shadow-2xl flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 sm:px-5 pt-3 pb-2.5 border-b border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 truncate text-[16px] sm:text-[19px] font-black text-slate-900">
                🧭 下單引導 <span className="text-[13px] sm:text-[14px] font-bold text-amber-700">第 {step + 1}/6 步・{STEP_NAMES[step]}</span>
              </div>
              <button type="button" onClick={() => setMinimized(true)} className="shrink-0 whitespace-nowrap min-h-[40px] px-3 rounded-full border-2 border-slate-200 text-[14px] font-black text-slate-600" aria-label="收起引導">收起 ▾</button>
              <button type="button" onClick={onClose} className="shrink-0 w-10 h-10 rounded-full border-2 border-slate-200 text-[18px] font-black text-slate-500 flex items-center justify-center" aria-label="關閉引導">✕</button>
            </div>
            <StepBar step={step} />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3 sm:py-4">
            {body}
            {(step === 0 || step === 5) && (
              <label className="mt-4 flex items-center gap-2 text-[13px] text-slate-500 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-amber-500 shrink-0" checked={hideAuto}
                  onChange={e => { setHideAuto(e.target.checked); setGuideHidden(profile.studentName, e.target.checked); }} />
                下次登入不要自動跳出（選單「🧭 新手下單引導」可再打開）
              </label>
            )}
          </div>
          {step < 5 && (
            <div className="shrink-0 border-t border-slate-100 px-4 sm:px-5 py-2.5 flex gap-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              {step > 0 && (
                <button type="button" onClick={() => setStep(s => s - 1)} className="min-h-[50px] sm:min-h-[56px] px-6 rounded-full border-2 border-slate-300 text-[18px] font-black text-slate-700">上一步</button>
              )}
              {step < 4 ? (
                <button type="button" disabled={!canNext} onClick={() => setStep(s => s + 1)} className="flex-1 min-h-[50px] sm:min-h-[56px] rounded-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-[19px] font-black text-white">下一步</button>
              ) : (
                <button type="button" disabled={busy} onClick={submit}
                  className={`flex-1 min-h-[50px] sm:min-h-[56px] rounded-full text-[19px] font-black text-white disabled:opacity-60 ${side === 'short' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {busy ? '送出中…' : `確認送出：${sideWord} ${qty} ${unit}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}
      {card}
    </>
  );
}

// ───────── 自動跳出設定（每位學員、每台瀏覽器） ─────────
const HIDE_KEY = 'order_guide_hide_v1';
export function guideHiddenFor(name: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(HIDE_KEY) || '[]') as string[]).includes(name.trim().toLowerCase());
  } catch {
    return false;
  }
}
export function setGuideHidden(name: string, hide: boolean) {
  try {
    const k = name.trim().toLowerCase();
    const s = new Set(JSON.parse(localStorage.getItem(HIDE_KEY) || '[]') as string[]);
    if (hide) s.add(k);
    else s.delete(k);
    localStorage.setItem(HIDE_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}
