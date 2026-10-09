import React, { useMemo, useState } from 'react';
import type { InstrumentSpec } from '../../types/market';
import type { CalcKind } from '../../data/termDetails';
import { priceLimits, roundToTick, stepTick, tickSize } from '../../utils/orderRules';

/** 名詞卡的互動試算。預設值優先帶入系統的 FinMind 真實行情（有的話），沒有就用示意數字並標示。 */

const INK = '#1f2630';
const SUB = '#5b6573';
const LINE = '#e6dfd1';
const UP = '#d42a3a';
const DOWN = '#14833f';
const ACC = '#b7791f';
const fmt = (v: number, d = 2) => (isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const money = (v: number) => `NT$ ${isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—'}`;
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" } as const;

function live(instruments: InstrumentSpec[], sym: string) {
  const i = instruments.find(x => x.symbol === sym);
  return i && !i.isMock && i.price > 0 ? i : null;
}

const Field: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; min?: number }> = ({ label, value, onChange, step = 1, suffix, min }) => (
  <label className="flex flex-col gap-1 min-w-0">
    <span className="text-[15px] font-bold tracking-wide" style={{ color: SUB }}>{label}</span>
    <span className="flex items-center rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}`, background: '#fff' }}>
      <input type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} step={step} min={min}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full min-w-0 px-3 py-2.5 text-[20px] font-semibold bg-transparent outline-none" style={{ ...mono, color: INK }} />
      {suffix && <span className="px-2 text-[16px] flex-none" style={{ color: SUB }}>{suffix}</span>}
    </span>
  </label>
);

const Pills: React.FC<{ value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ value, onChange, options }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map(([id, label]) => (
      <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={value === id}
        className="min-h-[44px] px-3.5 rounded-full text-[17px] font-bold transition-colors"
        style={{ background: value === id ? INK : '#fff', color: value === id ? '#fbf8f2' : SUB, border: `1px solid ${value === id ? INK : LINE}` }}>
        {label}
      </button>
    ))}
  </div>
);

const Result: React.FC<{ label: string; value: React.ReactNode; color?: string; big?: boolean }> = ({ label, value, color, big }) => (
  <div className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
    <span className="text-[15px] font-bold" style={{ color: SUB }}>{label}</span>
    <span className={`${big ? 'text-[26px]' : 'text-[20px]'} font-bold leading-tight`} style={{ ...mono, color: color || INK }}>{value}</span>
  </div>
);

const Source: React.FC<{ isLive: boolean; what: string }> = ({ isLive, what }) => (
  <div className="text-[15px]" style={{ color: SUB }}>
    {isLive ? `預設值：${what}（FinMind 真實行情）` : `預設值為示意數字，可以自己改`}
  </div>
);

// ───────────────────────── 1. 漲跌停 ─────────────────────────
function LimitsCalc({ instruments }: { instruments: InstrumentSpec[] }) {
  const tsmc = live(instruments, '2330');
  const [cat, setCat] = useState<'stocks' | 'etfs'>('stocks');
  const [ref, setRef] = useState<number>(tsmc?.prevClose || 2585);
  const lim = priceLimits(cat, 'X', ref);
  const cur = cat === 'stocks' && tsmc && ref === tsmc.prevClose ? tsmc.price : null;
  const pos = lim && cur ? Math.min(100, Math.max(0, ((cur - lim.down) / (lim.up - lim.down)) * 100)) : null;
  return (
    <div className="flex flex-col gap-3">
      <Pills value={cat} onChange={v => setCat(v as any)} options={[['stocks', '股票'], ['etfs', 'ETF']]} />
      <Field label="參考價（昨收）" value={ref} onChange={setRef} step={tickSize(cat, 'X', ref)} suffix="元" />
      {lim && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Result label="跌停價" value={fmt(lim.down)} color={DOWN} />
            <Result label="升降單位" value={tickSize(cat, 'X', ref)} />
            <Result label="漲停價" value={fmt(lim.up)} color={UP} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="relative h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${DOWN}, #d9d2c3 50%, ${UP})` }}>
              <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5" style={{ left: '50%', background: INK }} />
              {pos != null && <div className="absolute -top-1.5 w-3 h-6 rounded-full border-2 border-white shadow" style={{ left: `calc(${pos}% - 6px)`, background: ACC }} />}
            </div>
            <div className="flex justify-between text-[15px]" style={{ ...mono, color: SUB }}>
              <span>−10%</span><span>參考價 {fmt(ref)}</span><span>+10%</span>
            </div>
            {pos != null && <div className="text-[16px]" style={{ color: SUB }}>● 台積電目前成交 {fmt(cur!)} 元</div>}
          </div>
          <div className="text-[16px] leading-relaxed" style={{ color: SUB }}>
            計算：{fmt(ref)} × 1.1 = {fmt(ref * 1.1, 4)} → 往下對齊升降單位；{fmt(ref)} × 0.9 = {fmt(ref * 0.9, 4)} → 往上對齊。
          </div>
        </>
      )}
      <Source isLive={!!tsmc} what={`台積電昨收 ${tsmc ? fmt(tsmc.prevClose) : ''}`} />
    </div>
  );
}

// ───────────────────────── 2. 升降單位 ─────────────────────────
function TickCalc({ instruments }: { instruments: InstrumentSpec[] }) {
  const s = live(instruments, '2317');
  const [cat, setCat] = useState<'stocks' | 'etfs'>('stocks');
  const [price, setPrice] = useState<number>(s?.price || 49.95);
  const p = roundToTick(cat, 'X', price || 0);
  const ladder = [2, 1, 0, -1, -2].map(n => stepTick(cat, 'X', p, n));
  return (
    <div className="flex flex-col gap-3">
      <Pills value={cat} onChange={v => setCat(v as any)} options={[['stocks', '股票'], ['etfs', 'ETF']]} />
      <Field label="輸入一個價格" value={price} onChange={setPrice} step={0.01} suffix="元" />
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
        {ladder.map((v, i) => (
          <div key={i} className="flex justify-between px-3 py-2 text-[18px]" style={{ background: i === 2 ? '#fff6e0' : '#fff', borderTop: i ? `1px solid ${LINE}` : 'none', ...mono }}>
            <span style={{ color: i < 2 ? UP : i > 2 ? DOWN : INK, fontWeight: i === 2 ? 700 : 500 }}>{fmt(v)}</span>
            <span style={{ color: SUB }}>{i === 2 ? `你的價格（已對齊）· 此價位每檔 ${tickSize(cat, 'X', v)}` : `${i < 2 ? '上' : '下'} ${Math.abs(i - 2)} 檔`}</span>
          </div>
        ))}
      </div>
      <div className="text-[16px]" style={{ color: SUB }}>試試 49.95 和 50：跨過 50 元後，股票的每檔從 0.05 變成 0.1。</div>
    </div>
  );
}

// ───────────────────────── 3. 交易成本 ─────────────────────────
function TradeCostCalc({ instruments }: { instruments: InstrumentSpec[] }) {
  const s = live(instruments, '2330');
  const [kind, setKind] = useState<'stock' | 'etf' | 'daytrade'>('stock');
  const [price, setPrice] = useState<number>(s?.price || 100);
  const [lots, setLots] = useState(1);
  const [disc, setDisc] = useState(60);
  const [minFee, setMinFee] = useState(20);
  const amt = price * lots * 1000;
  const fee = Math.max(minFee, Math.floor(amt * 0.001425 * (disc / 100)));
  const taxRate = kind === 'etf' ? 0.001 : kind === 'daytrade' ? 0.0015 : 0.003;
  const tax = Math.floor(amt * taxRate);
  const total = fee * 2 + tax;
  const be = (total / amt) * 100;
  return (
    <div className="flex flex-col gap-3">
      <Pills value={kind} onChange={v => setKind(v as any)} options={[['stock', '一般股票'], ['etf', '股票型 ETF'], ['daytrade', '現股當沖']]} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="成交價" value={price} onChange={setPrice} step={0.05} suffix="元" />
        <Field label="數量" value={lots} onChange={v => setLots(Math.max(0, Math.round(v)))} suffix="張" />
        <Field label="手續費折扣（6 折填 60）" value={disc} onChange={setDisc} suffix="%" />
        <Field label="最低手續費" value={minFee} onChange={setMinFee} suffix="元" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="成交金額" value={money(amt)} />
        <Result label="買進手續費" value={money(fee)} />
        <Result label="賣出手續費" value={money(fee)} />
        <Result label={`證交稅（賣出 ${(taxRate * 1000).toFixed(1)}‰）`} value={money(tax)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="一買一賣總成本" value={money(total)} color={UP} big />
        <Result label="至少要漲多少才不賠" value={`${be.toFixed(3)}%`} color={ACC} big />
      </div>
      <div className="text-[16px] leading-relaxed" style={{ color: SUB }}>
        手續費 = 金額 × 0.1425% × 折扣（不低於最低收費）；證交稅只在賣出時收。實際小數取法依券商而定。
      </div>
    </div>
  );
}

// ───────────────────────── 4. 期貨 ─────────────────────────
const FUT = { TX: { name: '大台', mult: 200 }, MTX: { name: '小台', mult: 50 }, TMF: { name: '微台', mult: 10 } } as const;
function FuturesCalc({ instruments }: { instruments: InstrumentSpec[] }) {
  const [code, setCode] = useState<keyof typeof FUT>('TX');
  const inst = live(instruments, code);
  const [index, setIndex] = useState<number>(inst?.price || live(instruments, 'TX')?.price || 49000);
  const [margin, setMargin] = useState<number>(NaN);
  const [move, setMove] = useState(100);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const mult = FUT[code].mult;
  const value = index * mult;
  const m = margin > 0 ? margin : NaN;
  const pnl = move * mult * (side === 'long' ? 1 : -1);
  return (
    <div className="flex flex-col gap-3">
      <Pills value={code} onChange={v => setCode(v as any)} options={Object.entries(FUT).map(([k, v]) => [k, `${v.name}（每點 ${v.mult} 元）`])} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="指數點位" value={index} onChange={setIndex} suffix="點" />
        <Field label="每口保證金" value={margin} onChange={setMargin} suffix="元" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Result label="合約價值" value={money(value)} />
        <Result label="每跳 1 點" value={money(mult)} />
        <Result label="槓桿倍數" value={isFinite(m) ? `${(value / m).toFixed(1)} 倍` : '填保證金'} color={ACC} />
      </div>
      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
        <div className="flex items-center justify-between gap-2">
          <Pills value={side} onChange={v => setSide(v as any)} options={[['long', '多單'], ['short', '空單']]} />
          <span className="text-[17px] font-bold" style={{ ...mono, color: move >= 0 ? UP : DOWN }}>指數 {move >= 0 ? '+' : ''}{move} 點</span>
        </div>
        <input type="range" min={-1000} max={1000} step={10} value={move} onChange={e => setMove(Number(e.target.value))} aria-label="指數漲跌點數" className="w-full accent-amber-600" />
        <div className="flex justify-between items-baseline">
          <span className="text-[17px]" style={{ color: SUB }}>這口的損益</span>
          <span className="text-[26px] font-bold" style={{ ...mono, color: pnl >= 0 ? UP : DOWN }}>{pnl >= 0 ? '+' : '−'}{money(Math.abs(pnl)).replace('NT$ ', 'NT$ ')}</span>
        </div>
        <div className="text-[16px]" style={{ color: SUB }}>
          指數只動了 {((move / index) * 100).toFixed(2)}%{isFinite(m) && <>，卻等於保證金的 <b style={{ color: pnl >= 0 ? UP : DOWN }}>{((pnl / m) * 100).toFixed(1)}%</b></>}。
        </div>
      </div>
      <div className="text-[15px]" style={{ color: SUB }}>
        {inst ? `指數預設為 FinMind ${FUT[code].name}近月成交價。` : '指數為示意數字。'}
        保證金會隨行情調整，請到期交所網站查最新公告後填入，就能算出槓桿。
      </div>
    </div>
  );
}

// ───────────────────────── 5. 融資維持率 ─────────────────────────
function MarginRatioCalc() {
  const [buy, setBuy] = useState(100);
  const [now, setNow] = useState(85);
  const loan = buy * 0.6;
  const ratio = (now / loan) * 100;
  const callPx = loan * 1.3;
  const danger = ratio < 130;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="融資買進價" value={buy} onChange={setBuy} suffix="元" />
        <Field label="目前股價" value={now} onChange={setNow} suffix="元" />
      </div>
      <input type="range" min={Math.round(buy * 0.5)} max={Math.round(buy * 1.3)} value={now} onChange={e => setNow(Number(e.target.value))} aria-label="目前股價" className="w-full accent-amber-600" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Result label="借款（6 成）" value={fmt(loan)} />
        <Result label="維持率" value={`${ratio.toFixed(0)}%`} color={danger ? UP : DOWN} big />
        <Result label="追繳價（130%）" value={fmt(callPx)} color={ACC} />
      </div>
      <div className="rounded-xl px-3 py-2.5 text-[17px] font-bold" style={{ background: danger ? '#fde8ea' : '#e6f5ec', color: danger ? UP : DOWN }}>
        {danger ? '⚠️ 維持率低於 130%：券商會發追繳通知，限期沒補足就會被斷頭。' : `安全：股價還能跌到 ${fmt(callPx)} 元才會被追繳（再跌 ${(((now - callPx) / now) * 100).toFixed(1)}%）。`}
      </div>
      <div className="text-[15px]" style={{ color: SUB }}>簡化計算：未含利息與手續費，以上市股票融資 6 成為例。</div>
    </div>
  );
}

// ───────────────────────── 6. 選擇權 ─────────────────────────
function OptionCalc({ instruments }: { instruments: InstrumentSpec[] }) {
  const tx = live(instruments, 'TX');
  const base = tx?.price || 49000;
  const [cp, setCp] = useState<'C' | 'P'>('C');
  const [index, setIndex] = useState<number>(base);
  const [strike, setStrike] = useState<number>(Math.round(base / 100) * 100);
  const [prem, setPrem] = useState<number>(300);
  const intrinsic = Math.max(0, cp === 'C' ? index - strike : strike - index);
  const timeV = Math.max(0, prem - intrinsic);
  const be = cp === 'C' ? strike + prem : strike - prem;
  // 到期損益圖（買方）
  const xs = useMemo(() => Array.from({ length: 41 }, (_, i) => strike - 2000 + i * 100), [strike]);
  const pay = xs.map(x => (Math.max(0, cp === 'C' ? x - strike : strike - x) - prem) * 50);
  const maxAbs = Math.max(...pay.map(Math.abs), 1);
  const W = 300, H = 120;
  const px = (i: number) => (i / (xs.length - 1)) * W;
  const py = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 6);
  return (
    <div className="flex flex-col gap-3">
      <Pills value={cp} onChange={v => setCp(v as any)} options={[['C', '買權 Call'], ['P', '賣權 Put']]} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="指數" value={index} onChange={setIndex} suffix="點" />
        <Field label="履約價" value={strike} onChange={setStrike} step={100} suffix="點" />
      </div>
      <Field label="權利金" value={prem} onChange={setPrem} suffix="點" />
      <div className="grid grid-cols-2 gap-2">
        <Result label="內含價值" value={`${fmt(intrinsic)} 點`} />
        <Result label="時間價值" value={`${fmt(timeV)} 點`} color={ACC} />
        <Result label="買 1 口要付" value={money(prem * 50)} />
        <Result label="到期損益兩平點" value={`${fmt(be)} 點`} />
      </div>
      <div className="rounded-xl p-2" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
        <div className="text-[15px] font-bold px-1 pb-1" style={{ color: SUB }}>買方到期損益（每口，元）</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="到期損益圖">
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={LINE} />
          <polyline fill="none" stroke={INK} strokeWidth={2} points={pay.map((v, i) => `${px(i)},${py(v)}`).join(' ')} />
          <line x1={px(20)} y1={4} x2={px(20)} y2={H - 4} stroke={ACC} strokeDasharray="3 3" />
          <text x={px(20) + 4} y={12} fontSize={13} fill={ACC}>履約價</text>
          <text x={4} y={H - 4} fontSize={13} fill={DOWN}>最多賠 {money(prem * 50)}</text>
        </svg>
      </div>
      <div className="text-[15px]" style={{ color: SUB }}>
        {tx ? `指數預設為 FinMind 台指期近月成交價 ${fmt(tx.price)}。` : '指數為示意數字。'}權利金請自行輸入或參考行情頁。台指選擇權每點 50 元。
      </div>
    </div>
  );
}

// ───────────────────────── 7. 委託簿模擬 ─────────────────────────
const BOOK = {
  asks: [{ p: 2560, q: 8 }, { p: 2555, q: 5 }, { p: 2550, q: 3 }],
  bids: [{ p: 2545, q: 6 }, { p: 2540, q: 4 }, { p: 2535, q: 9 }],
};
function OrderBookSim() {
  const [ptype, setPtype] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [tif, setTif] = useState<'ROD' | 'IOC' | 'FOK'>('ROD');
  const [price, setPrice] = useState(2555);
  const [qty, setQty] = useState(6);
  const effTif = ptype === 'MARKET' && tif === 'ROD' ? 'IOC' : tif;
  // 由低到高吃賣單
  const asc = [...BOOK.asks].sort((a, b) => a.p - b.p);
  const eligible = asc.filter(a => ptype === 'MARKET' || a.p <= price);
  const canFill = eligible.reduce((s, a) => s + a.q, 0);
  let fills: { p: number; q: number }[] = [];
  if (!(effTif === 'FOK' && canFill < qty)) {
    let left = qty;
    for (const a of eligible) {
      if (left <= 0) break;
      const q = Math.min(left, a.q);
      fills.push({ p: a.p, q });
      left -= q;
    }
  }
  const filled = fills.reduce((s, f) => s + f.q, 0);
  const avg = filled ? fills.reduce((s, f) => s + f.p * f.q, 0) / filled : 0;
  const rest = qty - filled;
  const takenAt = (p: number) => fills.find(f => f.p === p)?.q || 0;
  let outcome = '';
  if (effTif === 'FOK' && filled === 0 && canFill < qty) outcome = `FOK：可成交只有 ${canFill} 張，不足 ${qty} 張 → 整筆取消。`;
  else if (rest > 0 && effTif === 'IOC') outcome = `IOC：成交 ${filled} 張，剩下 ${rest} 張立即取消。`;
  else if (rest > 0) outcome = `ROD：成交 ${filled} 張，剩下 ${rest} 張掛在 ${price} 元排隊，收盤前有效。`;
  else outcome = `全部成交 ${filled} 張。`;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
        <div className="rounded-xl overflow-hidden text-[17px]" style={{ border: `1px solid ${LINE}`, ...mono }}>
          <div className="grid grid-cols-3 px-3 py-1.5 text-[15px] font-bold" style={{ background: '#f3eee3', color: SUB, fontFamily: 'inherit' }}>
            <span>委賣量</span><span className="text-center">價格</span><span className="text-right">委買量</span>
          </div>
          {BOOK.asks.map(a => {
            const t = takenAt(a.p);
            return (
              <div key={a.p} className="grid grid-cols-3 px-3 py-1.5 transition-colors" style={{ background: t ? '#fde8ea' : '#fff', borderTop: `1px solid ${LINE}` }}>
                <span style={{ color: DOWN }}>{a.q}{t ? <b style={{ color: UP }}> −{t}</b> : ''}</span>
                <span className="text-center font-bold" style={{ color: UP }}>{a.p}</span><span />
              </div>
            );
          })}
          {BOOK.bids.map(b => (
            <div key={b.p} className="grid grid-cols-3 px-3 py-1.5" style={{ background: ptype === 'LIMIT' && effTif === 'ROD' && rest > 0 && b.p === price ? '#fff6e0' : '#fff', borderTop: `1px solid ${LINE}` }}>
              <span /><span className="text-center font-bold" style={{ color: DOWN }}>{b.p}</span>
              <span className="text-right" style={{ color: UP }}>{b.q}</span>
            </div>
          ))}
          {ptype === 'LIMIT' && effTif === 'ROD' && rest > 0 && !BOOK.bids.some(b => b.p === price) && (
            <div className="px-3 py-1.5 text-center text-[16px]" style={{ background: '#fff6e0', borderTop: `1px solid ${LINE}`, color: ACC }}>你的 {rest} 張掛在 {price}</div>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-[210px]">
          <Pills value={ptype} onChange={v => setPtype(v as any)} options={[['LIMIT', '限價'], ['MARKET', '市價']]} />
          <Pills value={effTif} onChange={v => setTif(v as any)} options={(ptype === 'MARKET' ? [['IOC', 'IOC'], ['FOK', 'FOK']] : [['ROD', 'ROD'], ['IOC', 'IOC'], ['FOK', 'FOK']]) as [string, string][]} />
          {ptype === 'LIMIT' && <Field label="買進限價" value={price} onChange={setPrice} step={5} />}
          <Field label="買進張數" value={qty} onChange={v => setQty(Math.max(1, Math.round(v)))} />
        </div>
      </div>
      <div className="rounded-xl px-3 py-2.5 text-[17px] font-bold leading-relaxed" style={{ background: '#fff', border: `1px solid ${LINE}`, color: INK }}>
        {outcome}{filled > 0 && <span style={{ color: SUB }}>（均價 {fmt(avg)}）</span>}
      </div>
      <div className="text-[15px]" style={{ color: SUB }}>這是示意的委託簿，用來體會限價／市價與 ROD／IOC／FOK 的差別。試試：限價 2,550 買 6 張，再改成 IOC、FOK 看看。</div>
    </div>
  );
}

// ───────────────────────── 8~13. 小工具 ─────────────────────────
function AvgCostCalc() {
  const [rows, setRows] = useState([{ p: 100, q: 1 }, { p: 80, q: 3 }]);
  const tq = rows.reduce((s, r) => s + r.q, 0);
  const avg = tq ? rows.reduce((s, r) => s + r.p * r.q, 0) / tq : 0;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <Field label={`第 ${i + 1} 次買進價`} value={r.p} onChange={v => setRows(rs => rs.map((x, j) => (j === i ? { ...x, p: v } : x)))} suffix="元" />
          <Field label="張數" value={r.q} onChange={v => setRows(rs => rs.map((x, j) => (j === i ? { ...x, q: Math.max(0, v) } : x)))} suffix="張" />
        </div>
      ))}
      <div className="flex gap-2">
        {rows.length < 4 && <button type="button" onClick={() => setRows(rs => [...rs, { p: 90, q: 1 }])} className="min-h-[44px] px-3.5 rounded-full text-[17px] font-bold" style={{ border: `1px dashed ${SUB}`, color: SUB }}>＋ 再買一次</button>}
      </div>
      <Result label="平均成本" value={`${fmt(avg)} 元`} color={ACC} big />
    </div>
  );
}

function RiskRewardCalc() {
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(95);
  const [target, setTarget] = useState(115);
  const risk = entry - stop;
  const reward = target - entry;
  const r = risk > 0 ? reward / risk : NaN;
  const winNeed = isFinite(r) && r > 0 ? 100 / (1 + r) : NaN;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="進場價" value={entry} onChange={setEntry} />
        <Field label="停損價" value={stop} onChange={setStop} />
        <Field label="目標價" value={target} onChange={setTarget} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="風報酬比" value={isFinite(r) ? `1 : ${r.toFixed(2)}` : '—'} color={r >= 2 ? DOWN : ACC} big />
        <Result label="打平所需勝率" value={isFinite(winNeed) ? `${winNeed.toFixed(1)}%` : '—'} big />
      </div>
      <div className="text-[16px]" style={{ color: SUB }}>風報酬比 1:3 時，只要猜對超過 25% 長期就不虧（未計手續費）。</div>
    </div>
  );
}

function PositionSizeCalc() {
  const [cap, setCap] = useState(50000000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(92);
  const perShare = entry - stop;
  const shares = perShare > 0 ? Math.floor((cap * riskPct) / 100 / perShare) : 0;
  const value = shares * entry;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="總資金" value={cap} onChange={setCap} suffix="元" />
        <Field label="單筆最多虧" value={riskPct} onChange={setRiskPct} step={0.5} suffix="%" />
        <Field label="進場價" value={entry} onChange={setEntry} suffix="元" />
        <Field label="停損價" value={stop} onChange={setStop} suffix="元" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="最多可買" value={`${Math.floor(shares / 1000).toLocaleString()} 張`} color={ACC} big />
        <Result label="部位占總資金" value={`${((value / cap) * 100).toFixed(1)}%`} big />
      </div>
      <div className="text-[16px]" style={{ color: SUB }}>算法：可承受虧損 {money((cap * riskPct) / 100)} ÷ 每股風險 {fmt(perShare)} 元 = {shares.toLocaleString()} 股。</div>
    </div>
  );
}

function PremiumDiscountCalc({ instruments }: { instruments: InstrumentSpec[] }) {
  const e = live(instruments, '0050');
  const [price, setPrice] = useState<number>(e?.price || 21);
  const [nav, setNav] = useState<number>(20);
  const pd = ((price - nav) / nav) * 100;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="ETF 市價" value={price} onChange={setPrice} step={0.01} suffix="元" />
        <Field label="ETF 淨值" value={nav} onChange={setNav} step={0.01} suffix="元" />
      </div>
      <Result label={pd >= 0 ? '溢價（買貴了）' : '折價（買便宜）'} value={`${pd >= 0 ? '+' : ''}${pd.toFixed(2)}%`} color={pd > 1 ? UP : pd < -1 ? DOWN : INK} big />
      <div className="text-[15px]" style={{ color: SUB }}>淨值請查投信公告；本系統沒有即時淨值資料，所以不自動帶入。</div>
    </div>
  );
}

const SCENARIOS: Record<string, { name: string; moves: number[] }> = {
  chop: { name: '盤整來回', moves: [3, -3, 3, -3, 3, -3, 3, -3, 3, -3] },
  up: { name: '一路上漲', moves: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
  down: { name: '一路下跌', moves: [-2, -2, -2, -2, -2, -2, -2, -2, -2, -2] },
};
function LeveragedEtfCalc() {
  const [sc, setSc] = useState('chop');
  const moves = SCENARIOS[sc].moves;
  const idx = [100];
  const lev = [100];
  moves.forEach(m => {
    idx.push(idx[idx.length - 1] * (1 + m / 100));
    lev.push(lev[lev.length - 1] * (1 + (2 * m) / 100));
  });
  const all = [...idx, ...lev];
  const lo = Math.min(...all), hi = Math.max(...all);
  const W = 300, H = 120;
  const x = (i: number) => (i / moves.length) * W;
  const y = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
  return (
    <div className="flex flex-col gap-3">
      <Pills value={sc} onChange={setSc} options={Object.entries(SCENARIOS).map(([k, v]) => [k, v.name])} />
      <div className="rounded-xl p-2" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="指數與正 2 走勢比較">
          <polyline fill="none" stroke={SUB} strokeWidth={2} points={idx.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          <polyline fill="none" stroke={ACC} strokeWidth={2.5} points={lev.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        </svg>
        <div className="flex gap-4 px-1 text-[16px]" style={{ color: SUB }}>
          <span><b style={{ color: SUB }}>━</b> 指數 {fmt(idx[idx.length - 1])}</span>
          <span><b style={{ color: ACC }}>━</b> 正 2 {fmt(lev[lev.length - 1])}</span>
        </div>
      </div>
      <div className="text-[16px]" style={{ color: SUB }}>起點都是 100。盤整來回 10 天後，指數小賠，正 2 賠得更多——這就是「波動耗損」。（示意情境）</div>
    </div>
  );
}

function DrawdownCalc() {
  const [loss, setLoss] = useState(30);
  const need = (1 / (1 - loss / 100) - 1) * 100;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px]" style={{ color: SUB }}>如果虧損</span>
        <span className="text-[26px] font-bold" style={{ ...mono, color: DOWN }}>−{loss}%</span>
      </div>
      <input type="range" min={5} max={90} step={5} value={loss} onChange={e => setLoss(Number(e.target.value))} aria-label="虧損幅度" className="w-full accent-amber-600" />
      <div className="flex flex-col gap-1.5">
        <div className="h-3 rounded-full" style={{ width: `${Math.min(100, loss)}%`, background: DOWN }} />
        <div className="h-3 rounded-full" style={{ width: `${Math.min(100, need / 10)}%`, background: UP }} />
      </div>
      <Result label="要漲多少才能回本" value={`+${need.toFixed(1)}%`} color={UP} big />
      <div className="text-[16px]" style={{ color: SUB }}>虧得越多，回本越難：−50% 要 +100%，−80% 要 +400%。</div>
    </div>
  );
}

export function TermCalculator({ kind, instruments }: { kind: CalcKind; instruments: InstrumentSpec[] }) {
  switch (kind) {
    case 'limits': return <LimitsCalc instruments={instruments} />;
    case 'tick': return <TickCalc instruments={instruments} />;
    case 'tradeCost': return <TradeCostCalc instruments={instruments} />;
    case 'futures': return <FuturesCalc instruments={instruments} />;
    case 'marginRatio': return <MarginRatioCalc />;
    case 'option': return <OptionCalc instruments={instruments} />;
    case 'orderBook': return <OrderBookSim />;
    case 'avgCost': return <AvgCostCalc />;
    case 'riskReward': return <RiskRewardCalc />;
    case 'positionSize': return <PositionSizeCalc />;
    case 'premiumDiscount': return <PremiumDiscountCalc instruments={instruments} />;
    case 'leveragedEtf': return <LeveragedEtfCalc />;
    case 'drawdown': return <DrawdownCalc />;
    default: return null;
  }
}
