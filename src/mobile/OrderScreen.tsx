import React, { useEffect, useMemo, useState } from 'react';
import type { InstrumentSpec, OrderAction, Position, StudentProfile } from '../types/market';
import { C, mono, fmtPrice, fmtMoney, dirColor, instrumentChange, Icon, TopBar, IconButton } from './ui';
import { getInstrumentTradingClock } from '../utils/tradingClock';
import { getTwHolidayName } from '../utils/twHolidays';
import { computeOrderCost, ACTION_LABEL } from '../utils/orderMath';
import {
  usesOrderBook, closeSide, positionPnL, priceLimits, roundToTick, stepTick, tickSize, validateLimitPrice,
  isActiveStatus, STATUS_LABEL, type OrderIntent, type OrderSide, type PriceType, type TimeInForce,
} from '../utils/orderRules';
import { pendingCloseQty, describeOrder } from '../utils/orderClient';
import type { ClientOrder, OrderRequest } from '../hooks/useOrderBook';

export interface OrderPreset {
  symbol: string;
  side: OrderSide;
  intent: OrderIntent;
  positionId?: string;
}

interface Props {
  inst: InstrumentSpec;
  profile: StudentProfile | null;
  orders: ClientOrder[];
  reservedCash: number;
  preset: OrderPreset | null;
  onPlaceOrder: (req: OrderRequest) => Promise<{ order?: ClientOrder; error?: string }>;
  onCancelOrder: (id: string) => Promise<{ order?: ClientOrder; error?: string }>;
  onModifyOrder: (id: string, patch: { limitPrice?: number; quantity?: number }) => Promise<{ order?: ClientOrder; error?: string }>;
  onOpenAdvancedTrade: (inst: InstrumentSpec) => void;
  onBack: () => void;
  onOpenSymbol: (symbol: string) => void;
}

const unitOf = (inst: { category: string }) => (inst.category === 'futures' || inst.category === 'options' ? '口' : '張');
const isPutLike = (inst: InstrumentSpec) =>
  inst.category === 'options' ? /-(P|PUT)$/i.test(inst.symbol) : /售/.test(inst.name);

/** 建倉時的委託類別；null＝這個方向不能新倉（例如權證不能放空） */
function openActionFor(inst: InstrumentSpec, side: OrderSide): OrderAction | null {
  const buy = side === 'BUY';
  switch (inst.category) {
    case 'stocks': return buy ? 'BUY_STOCK' : 'SHORT_SELL_STOCK';
    case 'etfs': return buy ? 'BUY_ETF' : 'SHORT_SELL_ETF';
    case 'bonds': return buy ? 'BUY_BOND' : 'SHORT_SELL_ETF';
    case 'futures': return buy ? 'BUY_FUTURES_LONG' : 'SELL_FUTURES_SHORT';
    case 'options': return isPutLike(inst) ? (buy ? 'BUY_PUT_OPTION' : 'SELL_PUT_OPTION') : (buy ? 'BUY_CALL_OPTION' : 'SELL_CALL_OPTION');
    case 'warrants': return buy ? (isPutLike(inst) ? 'BUY_PUT_WARRANT' : 'BUY_CALL_WARRANT') : null;
    default: return null;
  }
}

const OPEN_LABEL: Partial<Record<OrderAction, string>> = {
  ...ACTION_LABEL,
  BUY_CALL_OPTION: '買進買權', BUY_PUT_OPTION: '買進賣權', SELL_CALL_OPTION: '賣出買權', SELL_PUT_OPTION: '賣出賣權',
  BUY_CALL_WARRANT: '認購權證買進', BUY_PUT_WARRANT: '認售權證買進',
};

function closeLabel(pos: Position) {
  const t = pos.orderType;
  if (t === 'BUY_STOCK' || t === 'BUY_ETF' || t === 'BUY_BOND') return '現股賣出';
  if (t === 'SHORT_SELL_STOCK' || t === 'SHORT_SELL_ETF') return '融券買回';
  if (t === 'BUY_FUTURES_LONG') return '期貨賣出平倉';
  if (t === 'SELL_FUTURES_SHORT') return '期貨買進平倉';
  if (t === 'BUY_CALL_WARRANT' || t === 'BUY_PUT_WARRANT') return '權證賣出';
  if (t.startsWith('BUY')) return '賣出平倉';
  return '買進平倉';
}

const Seg: React.FC<{ options: { id: string; label: string; disabled?: boolean }[]; value: string; onChange: (v: any) => void; label: string }> = ({ options, value, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="flex gap-1.5">
    {options.map(o => {
      const on = o.id === value;
      return (
        <button key={o.id} type="button" role="radio" aria-checked={on} disabled={o.disabled} onClick={() => onChange(o.id)}
          className="flex-1 min-h-[38px] px-2 rounded-lg text-[13px] font-bold disabled:opacity-30"
          style={{ background: on ? C.accent : C.card, color: on ? C.bg : C.sub, border: `1px solid ${on ? C.accent : C.line2}` }}>
          {o.label}
        </button>
      );
    })}
  </div>
);

// ───────────────────────── 下單＋委託查詢 ─────────────────────────
export function OrderScreen(p: Props) {
  const activeCount = p.orders.filter(o => isActiveStatus(o.status)).length;
  const [view, setView] = useState<'ticket' | 'orders'>('ticket');
  return (
    <>
      <TopBar
        left={<IconButton label="返回報價" onClick={p.onBack}>{Icon.back}</IconButton>}
        title={view === 'ticket' ? '下單' : '委託查詢'}
        sub={view === 'ticket' ? `${p.inst.name} ${p.inst.symbol}` : `${activeCount} 筆未完成`}
      />
      <div className="px-4 pb-2">
        <Seg label="下單或委託查詢" value={view} onChange={setView}
          options={[{ id: 'ticket', label: '下單' }, { id: 'orders', label: `委託查詢${activeCount ? `（${activeCount}）` : ''}` }]} />
      </div>
      {view === 'ticket' ? <Ticket {...p} onSent={() => setView('orders')} /> : <OrdersView {...p} />}
    </>
  );
}

function Ticket(p: Props & { onSent: () => void }) {
  const { inst } = p;
  const unit = unitOf(inst);
  const positions = (p.profile?.positions || []).filter(x => x.symbol === inst.symbol && usesOrderBook(x.category));

  const [side, setSide] = useState<OrderSide>('BUY');
  const [intent, setIntent] = useState<OrderIntent>('OPEN');
  const [posId, setPosId] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>('LIMIT');
  const [tif, setTif] = useState<TimeInForce>('ROD');
  const [price, setPrice] = useState<number>(() => roundToTick(inst.category, inst.symbol, inst.price || 0));
  const [priceText, setPriceText] = useState<string>(String(roundToTick(inst.category, inst.symbol, inst.price || 0)));
  const [qty, setQty] = useState(1);
  const [rationale, setRationale] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);

  // 換商品或從庫存帶入預設
  useEffect(() => {
    const px = roundToTick(inst.category, inst.symbol, inst.price || 0);
    setPrice(px);
    setPriceText(String(px));
    setQty(1);
    setResult(null);
    if (p.preset && p.preset.symbol === inst.symbol) {
      setSide(p.preset.side);
      setIntent(p.preset.intent);
      setPosId(p.preset.positionId ?? null);
    } else {
      setSide('BUY');
      setIntent('OPEN');
      setPosId(null);
    }
  }, [inst.symbol, p.preset]);

  const closable = positions.filter(x => closeSide(x.orderType) === side);
  const closePos = intent === 'CLOSE' ? closable.find(x => x.id === posId) || closable[0] || null : null;
  const openAction = openActionFor(inst, side);
  // 方向改變時自動選新倉／平倉
  useEffect(() => {
    if (p.preset && p.preset.symbol === inst.symbol && p.preset.side === side) return;
    if (closable.length > 0 && !openAction) setIntent('CLOSE');
    else if (closable.length > 0 && side === 'SELL' && (inst.category === 'stocks' || inst.category === 'etfs' || inst.category === 'bonds')) setIntent('CLOSE');
    else if (closable.length === 0) setIntent('OPEN');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, inst.symbol, closable.length]);

  useEffect(() => { if (priceType === 'MARKET' && tif === 'ROD') setTif('IOC'); }, [priceType, tif]);

  if (!usesOrderBook(inst.category)) {
    return (
      <div className="px-6 py-10 flex flex-col gap-4 text-center">
        <div className="text-[15px] leading-relaxed" style={{ color: C.sub }}>美股、原物料與加密貨幣沒有台灣交易所的委託簿，請用完整下單畫面（以現價即時成交）。</div>
        <button type="button" onClick={() => p.onOpenAdvancedTrade(inst)} className="min-h-[48px] rounded-xl font-black" style={{ background: C.accent, color: C.bg }}>開啟完整下單</button>
      </div>
    );
  }

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  const holiday = getTwHolidayName(today);
  const clock = getInstrumentTradingClock(inst.symbol, inst.category);
  const trading = clock.isTradingNow;
  const ref = inst.prevClose || inst.price;
  const lim = priceLimits(inst.category, inst.symbol, ref);
  const action: OrderAction | null = intent === 'CLOSE' ? closePos?.orderType ?? null : openAction;
  const mult = inst.multiplier || closePos?.unitMultiplier || 1;
  const estPx = priceType === 'LIMIT' ? price : (inst.price || 0) * (side === 'BUY' ? 1.1 : 0.9);
  const priceErr = priceType === 'LIMIT' ? validateLimitPrice(inst.category, inst.symbol, price, ref) : null;

  const cash = p.profile?.availableCash ?? 0;
  const free = cash - p.reservedCash;
  const cost = action && intent === 'OPEN' ? computeOrderCost(inst, action, estPx, qty) : null;
  const maxClose = closePos ? closePos.quantity - pendingCloseQty(p.orders, closePos.id) : 0;
  const closePnL = closePos ? positionPnL(closePos.orderType, closePos.entryPrice, priceType === 'LIMIT' ? price : inst.price, Math.min(qty, maxClose), closePos.unitMultiplier) : 0;

  let blockReason: string | null = null;
  if (inst.isMock) blockReason = '無 FinMind 真實報價，暫停委託';
  else if (!action) blockReason = intent === 'CLOSE' ? '沒有可平倉的部位' : '此商品不能新倉賣出';
  else if (priceErr) blockReason = priceErr;
  else if (!trading && (priceType === 'MARKET' || tif !== 'ROD')) blockReason = '非交易時段只接受限價 ROD 預約單';
  else if (intent === 'OPEN' && cost && cost.totalCostOrMargin > free) blockReason = '可用額度不足';
  else if (intent === 'CLOSE' && qty > maxClose) blockReason = `最多可平倉 ${maxClose} ${unit}`;

  const setPx = (v: number) => { const r = Number(v.toFixed(4)); setPrice(r); setPriceText(String(r)); };
  const sideColor = side === 'BUY' ? C.upFill : C.downFill;
  const actionText = action ? (intent === 'CLOSE' && closePos ? closeLabel(closePos) : OPEN_LABEL[action] ?? action) : '';
  const priceDesc = priceType === 'MARKET' ? '市價' : `限價 ${fmtPrice(price)}`;

  const submit = async () => {
    if (!action) return;
    setSending(true);
    const r = await p.onPlaceOrder({
      symbol: inst.symbol, name: inst.name, category: inst.category, action, intent,
      positionId: intent === 'CLOSE' ? closePos?.id ?? null : null,
      priceType, tif, limitPrice: priceType === 'LIMIT' ? price : null, quantity: qty,
      rationale: rationale.trim() || `${actionText} ${qty} ${unit} ${priceDesc} ${tif}`,
      multiplier: mult, marginRequirement: inst.marginRequirement ?? null,
    });
    setSending(false);
    setConfirming(false);
    if (r.error) setResult({ text: r.error, ok: false });
    else {
      setResult({ text: describeOrder(r.order!), ok: r.order!.status !== 'CANCELLED' && r.order!.status !== 'REJECTED' });
      setRationale('');
    }
  };

  return (
    <>
      <div className="px-4 pb-4 flex flex-col gap-3">
        {(holiday || !trading) && (
          <div className="text-[12px] font-bold px-3 py-2 rounded-lg leading-relaxed" style={{ background: C.accentBg, color: C.accent }}>
            {holiday ? `${holiday}休市` : `非交易時段（${clock.sessionName}）`}：限價 ROD 委託會轉為預約單，下一盤開盤才撮合；市價、IOC、FOK 不接受。
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-[13px]" style={{ color: C.muted }}>成交價</span>
          <span className="text-[26px] font-bold" style={{ ...mono, color: dirColor(instrumentChange(inst).chg) }}>{fmtPrice(inst.price)}</span>
        </div>
        {lim && (
          <div className="flex justify-between text-[12px]" style={{ color: C.muted }}>
            <span>跌停 <b style={{ ...mono, color: C.down }}>{fmtPrice(lim.down)}</b></span>
            <span>參考價 <b style={mono}>{fmtPrice(ref)}</b></span>
            <span>漲停 <b style={{ ...mono, color: C.up }}>{fmtPrice(lim.up)}</b></span>
          </div>
        )}

        <div role="radiogroup" aria-label="買賣" className="grid grid-cols-2 gap-2">
          {(['BUY', 'SELL'] as OrderSide[]).map(s => (
            <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => { setSide(s); setPosId(null); }} className="min-h-[46px] rounded-xl font-black text-[17px]"
              style={{ background: side === s ? (s === 'BUY' ? C.upFill : C.downFill) : C.card, color: side === s ? '#fff' : C.sub, border: `1px solid ${side === s ? 'transparent' : C.line}` }}>
              {s === 'BUY' ? '買進' : '賣出'}
            </button>
          ))}
        </div>

        <Row label="交易別">
          <Seg label="新倉或平倉" value={intent} onChange={setIntent}
            options={[
              { id: 'OPEN', label: openAction ? `新倉 ${OPEN_LABEL[openAction] ?? ''}` : '新倉（不可）', disabled: !openAction },
              { id: 'CLOSE', label: closable.length ? `平倉 ${closeLabel(closable[0])}` : '平倉（無部位）', disabled: closable.length === 0 },
            ]} />
        </Row>
        {intent === 'CLOSE' && closable.length > 1 && (
          <Seg label="選擇持倉" value={closePos?.id || ''} onChange={setPosId}
            options={closable.map(x => ({ id: x.id, label: `${OPEN_LABEL[x.orderType] ?? x.orderType} ${x.quantity}` }))} />
        )}
        {intent === 'CLOSE' && closePos && (
          <div className="text-[12px]" style={{ color: C.muted }}>
            持有 {closePos.quantity} {unit}，成本 {fmtPrice(closePos.entryPrice)}；已掛平倉 {closePos.quantity - maxClose}，可平倉 {maxClose}
          </div>
        )}

        <Row label="價格別">
          <Seg label="價格別" value={priceType} onChange={setPriceType} options={[{ id: 'LIMIT', label: '限價' }, { id: 'MARKET', label: '市價' }]} />
        </Row>
        <Row label="條件">
          <Seg label="委託條件" value={tif} onChange={setTif}
            options={[{ id: 'ROD', label: 'ROD', disabled: priceType === 'MARKET' }, { id: 'IOC', label: 'IOC' }, { id: 'FOK', label: 'FOK' }]} />
        </Row>
        <div className="text-[11px] leading-relaxed -mt-1" style={{ color: C.muted }}>
          {tif === 'ROD' ? 'ROD：當日有效，收盤前沒成交自動失效。' : tif === 'IOC' ? 'IOC：立即成交能成交的部分，其餘馬上取消。' : 'FOK：必須立即全部成交，否則整筆取消。'}
          {priceType === 'MARKET' && ' 市價：直接吃對手價，只能搭配 IOC 或 FOK。'}
        </div>

        {priceType === 'LIMIT' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] w-10 flex-none" style={{ color: C.muted }}>價格</span>
              <button type="button" aria-label="降一檔" onClick={() => setPx(stepTick(inst.category, inst.symbol, price, -1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.card, border: `1px solid ${C.line2}` }}>−</button>
              <input aria-label="委託價格" inputMode="decimal" value={priceText}
                onChange={e => { setPriceText(e.target.value); const v = Number(e.target.value); if (isFinite(v)) setPrice(v); }}
                onBlur={() => setPx(roundToTick(inst.category, inst.symbol, price))}
                className="flex-1 min-w-0 h-12 rounded-xl text-center text-[20px] font-bold bg-transparent" style={{ ...mono, border: `1px solid ${priceErr ? C.up : C.line2}`, color: C.text }} />
              <button type="button" aria-label="升一檔" onClick={() => setPx(stepTick(inst.category, inst.symbol, price, 1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.card, border: `1px solid ${C.line2}` }}>+</button>
            </div>
            <div className="flex gap-1.5">
              {[
                lim && { k: '跌停', v: lim.down },
                { k: '平盤', v: roundToTick(inst.category, inst.symbol, ref) },
                { k: '現價', v: roundToTick(inst.category, inst.symbol, inst.price) },
                lim && { k: '漲停', v: lim.up },
              ].filter(Boolean).map((b: any) => (
                <button key={b.k} type="button" onClick={() => setPx(b.v)} className="flex-1 min-h-[34px] rounded-lg text-[12px] font-bold"
                  style={{ background: price === b.v ? C.accent : C.card, color: price === b.v ? C.bg : C.sub }}>{b.k}</button>
              ))}
            </div>
            <div className="text-[11px]" style={{ color: C.muted }}>此價位升降單位 {tickSize(inst.category, inst.symbol, price)}</div>
          </>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[13px] w-10 flex-none" style={{ color: C.muted }}>數量</span>
          <button type="button" aria-label="減少數量" onClick={() => setQty(q => Math.max(1, q - 1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.card, border: `1px solid ${C.line2}` }}>−</button>
          <input aria-label="數量" inputMode="numeric" value={qty} onChange={e => { const v = parseInt(e.target.value, 10); setQty(isFinite(v) && v > 0 ? Math.min(v, 499) : 1); }}
            className="flex-1 min-w-0 h-12 rounded-xl text-center text-[20px] font-bold bg-transparent" style={{ ...mono, border: `1px solid ${C.line2}`, color: C.text }} />
          <button type="button" aria-label="增加數量" onClick={() => setQty(q => Math.min(499, q + 1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.card, border: `1px solid ${C.line2}` }}>+</button>
          <span className="text-[15px] font-bold w-6">{unit}</span>
        </div>
        <div className="flex gap-1.5">
          {(intent === 'CLOSE' && maxClose > 0 ? [1, 2, 5, maxClose] : [1, 2, 5, 10]).map((n, i) => (
            <button key={`${n}-${i}`} type="button" onClick={() => setQty(n)} className="flex-1 min-h-[34px] rounded-lg text-[13px] font-bold"
              style={{ background: qty === n ? C.accent : C.card, color: qty === n ? C.bg : C.sub }}>{intent === 'CLOSE' && i === 3 ? `全部 ${n}` : n}</button>
          ))}
        </div>

        <div className="rounded-xl p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]" style={{ background: C.card2, border: `1px solid ${C.line2}` }}>
          {intent === 'OPEN' && cost ? (
            <>
              <span style={{ color: C.muted }}>{inst.category === 'futures' ? '合約價值' : '委託金額'}{priceType === 'MARKET' ? '（估）' : ''}</span>
              <span className="text-right font-semibold" style={mono}>{fmtMoney(cost.notionalValue)}</span>
              <span style={{ color: C.muted }}>圈存{inst.category === 'futures' || action?.startsWith('SHORT') || action?.startsWith('SELL') ? '保證金' : '金額'}</span>
              <span className="text-right font-semibold" style={mono}>{fmtMoney(cost.totalCostOrMargin)}</span>
            </>
          ) : (
            <>
              <span style={{ color: C.muted }}>預估平倉損益</span>
              <span className="text-right font-semibold" style={{ ...mono, color: dirColor(closePnL) }}>{Math.round(closePnL).toLocaleString()}</span>
            </>
          )}
          <span style={{ color: C.muted }}>可用額度</span>
          <span className="text-right font-semibold" style={{ ...mono, color: free >= (cost?.totalCostOrMargin ?? 0) ? C.text : C.up }}>{fmtMoney(free)}</span>
          {p.reservedCash > 0 && (<><span style={{ color: C.muted }}>未成交委託圈存</span><span className="text-right" style={mono}>{fmtMoney(p.reservedCash)}</span></>)}
        </div>

        {result && (
          <div className="text-[13px] font-bold px-3 py-2.5 rounded-lg flex items-center justify-between gap-2" style={{ background: result.ok ? '#0d2a18' : '#2a0d10', color: result.ok ? C.down : C.up }}>
            <span>{result.text}</span>
            {result.ok && <button type="button" onClick={p.onSent} className="flex-none underline">看委託</button>}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 z-30 px-4 py-2.5" style={{ bottom: 'calc(60px + max(10px, env(safe-area-inset-bottom)))', background: C.bar, borderTop: `1px solid ${C.line}` }}>
        <button type="button" disabled={!!blockReason} onClick={() => setConfirming(true)}
          className="w-full min-h-[52px] rounded-2xl text-white text-[16px] font-black disabled:opacity-40" style={{ background: sideColor }}>
          {blockReason || `${side === 'BUY' ? '買進' : '賣出'} ${qty} ${unit}・${priceDesc}・${tif}`}
        </button>
      </div>
      <div className="h-[80px]" />

      {confirming && action && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !sending && setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-label="確認委託" className="w-full rounded-t-3xl p-5 flex flex-col gap-3" style={{ background: C.card, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="text-[18px] font-black">確認委託</div>
            <div className="text-[15px] leading-relaxed" style={{ color: C.sub }}>
              <b style={{ color: side === 'BUY' ? C.up : C.down }}>{actionText}</b> <b style={{ color: C.text }}>{inst.name}</b> {qty} {unit}，
              <b style={mono}>{priceDesc}</b>，{tif}
              {!trading && <span className="block mt-1" style={{ color: C.accent }}>現在非交易時段，會先成為預約單。</span>}
              <span className="block mt-1 text-[12px]" style={{ color: C.muted }}>送出後要等市場價格到了才成交，可能部分成交或不成交。</span>
            </div>
            <label className="flex flex-col gap-1 text-[13px]" style={{ color: C.muted }}>
              下單理由（會整理進期末報告）
              <textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={2} placeholder="例如：拉回到月線附近分批承接"
                className="rounded-xl p-3 text-[15px] bg-transparent outline-none" style={{ border: `1px solid ${C.line2}`, color: C.text }} />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" disabled={sending} onClick={() => setConfirming(false)} className="min-h-[50px] rounded-2xl font-black" style={{ background: C.bar, color: C.sub }}>取消</button>
              <button type="button" disabled={sending} onClick={submit} className="min-h-[50px] rounded-2xl font-black text-white disabled:opacity-50" style={{ background: sideColor }}>{sending ? '送出中…' : '確認送出'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2">
    <span className="text-[13px] w-10 flex-none" style={{ color: C.muted }}>{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

// ───────────────────────── 委託查詢 ─────────────────────────
const STATUS_COLOR: Record<string, string> = {
  QUEUED: '#a78bfa', WORKING: '#f5b301', PARTIAL: '#f5b301', FILLED: '#2bd96b', CANCELLED: '#8b98a5', EXPIRED: '#8b98a5', REJECTED: '#ff4d5a',
};
const hhmmss = (t: number) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(t));

type OrdersViewProps = Pick<Props, 'orders' | 'onCancelOrder' | 'onModifyOrder' | 'onOpenSymbol'>;
export function OrdersView(p: OrdersViewProps) {
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ o: ClientOrder; mode: 'price' | 'qty' } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = useMemo(() => p.orders.filter(o => (filter === 'active' ? isActiveStatus(o.status) : true)), [p.orders, filter]);

  return (
    <div className="px-4 pb-6 flex flex-col gap-2.5">
      <Seg label="篩選" value={filter} onChange={setFilter} options={[{ id: 'active', label: '未完成' }, { id: 'all', label: '全部（7 日內）' }]} />
      {msg && <div className="text-[13px] font-bold px-3 py-2 rounded-lg" style={{ background: C.card2, color: C.sub }}>{msg}</div>}
      {list.length === 0 && <div className="py-10 text-center text-[14px]" style={{ color: C.muted }}>{filter === 'active' ? '沒有未完成的委託' : '還沒有委託紀錄'}</div>}
      {list.map(o => {
        const unit = unitOf(o);
        const active = isActiveStatus(o.status);
        return (
          <div key={o.id} className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => p.onOpenSymbol(o.symbol)} className="text-left min-w-0">
                <span className="text-[15px] font-bold">{o.name}</span> <span className="text-[11px]" style={{ color: C.muted }}>{o.symbol}</span>
              </button>
              <span className="flex-none px-2 py-0.5 rounded-full text-[12px] font-black" style={{ background: '#0b0f14', color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status]}</span>
            </div>
            <div className="text-[13px] flex flex-wrap gap-x-2" style={{ color: C.sub }}>
              <b style={{ color: o.side === 'BUY' ? C.up : C.down }}>{o.side === 'BUY' ? '買' : '賣'}{o.intent === 'CLOSE' ? '・平倉' : '・新倉'}</b>
              <span style={mono}>{o.priceType === 'MARKET' ? '市價' : `限價 ${o.limitPrice}`}</span>
              <span>{o.tif}</span>
              <span style={mono}>成交 {o.filledQty}/{o.quantity} {unit}</span>
              {o.filledQty > 0 && <span style={mono}>均價 {o.avgPrice}</span>}
              {o.feed === 'eod' && <span style={{ color: C.accent }}>收盤價撮合</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} className="text-[12px] underline" style={{ color: C.muted }}>
                {hhmmss(o.createdAt)} · {open === o.id ? '收合回報' : `回報 ${o.events.length} 則`}
              </button>
              {active && (
                <div className="flex gap-1.5">
                  {o.priceType === 'LIMIT' && o.tif === 'ROD' && (
                    <>
                      <SmallBtn onClick={() => setEditing({ o, mode: 'price' })}>改價</SmallBtn>
                      {o.quantity - o.filledQty > 1 && <SmallBtn onClick={() => setEditing({ o, mode: 'qty' })}>減量</SmallBtn>}
                    </>
                  )}
                  <SmallBtn danger onClick={async () => { const r = await p.onCancelOrder(o.id); setMsg(r.error ? `刪單失敗：${r.error}` : '已刪單'); }}>刪單</SmallBtn>
                </div>
              )}
            </div>
            {open === o.id && (
              <ol className="mt-1 flex flex-col gap-1 text-[12px] border-l pl-3" style={{ borderColor: C.line2, color: C.sub }}>
                {o.events.map((e, i) => <li key={i}><span style={{ ...mono, color: C.muted }}>{hhmmss(e.at).slice(-8)}</span> {e.text}</li>)}
              </ol>
            )}
          </div>
        );
      })}

      {editing && (
        <EditSheet
          order={editing.o}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSubmit={async patch => {
            const r = await p.onModifyOrder(editing.o.id, patch);
            setMsg(r.error ? `改單失敗：${r.error}` : `改單成功：${describeOrder(r.order!)}`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

const SmallBtn: React.FC<{ onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ onClick, danger, children }) => (
  <button type="button" onClick={onClick} className="min-h-[34px] px-3 rounded-lg text-[13px] font-bold" style={{ border: `1px solid ${danger ? C.up : C.line2}`, color: danger ? C.up : C.sub }}>{children}</button>
);

function EditSheet({ order, mode, onClose, onSubmit }: { order: ClientOrder; mode: 'price' | 'qty'; onClose: () => void; onSubmit: (p: { limitPrice?: number; quantity?: number }) => Promise<void> }) {
  const [price, setPrice] = useState(order.limitPrice || 0);
  const [qty, setQty] = useState(order.quantity - 1);
  const [busy, setBusy] = useState(false);
  const minQty = order.filledQty + 1;
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="改單" className="w-full rounded-t-3xl p-5 flex flex-col gap-3" style={{ background: C.card, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <div className="text-[18px] font-black">{mode === 'price' ? '改價' : '減量'}・{order.name}</div>
        {mode === 'price' ? (
          <>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="降一檔" onClick={() => setPrice(stepTick(order.category, order.symbol, price, -1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.bar }}>−</button>
              <div className="flex-1 text-center text-[22px] font-bold" style={mono}>{price}</div>
              <button type="button" aria-label="升一檔" onClick={() => setPrice(stepTick(order.category, order.symbol, price, 1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.bar }}>+</button>
            </div>
            <div className="text-[12px]" style={{ color: C.muted }}>改價等於重新排隊，從現在的行情重新判斷成交。</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="減少" onClick={() => setQty(q => Math.max(minQty, q - 1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.bar }}>−</button>
              <div className="flex-1 text-center text-[22px] font-bold" style={mono}>{qty}</div>
              <button type="button" aria-label="增加" onClick={() => setQty(q => Math.min(order.quantity - 1, q + 1))} className="w-12 h-12 rounded-xl text-[22px]" style={{ background: C.bar }}>+</button>
            </div>
            <div className="text-[12px]" style={{ color: C.muted }}>只能減少；已成交 {order.filledQty}，原委託 {order.quantity}。</div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-[50px] rounded-2xl font-black" style={{ background: C.bar, color: C.sub }}>取消</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSubmit(mode === 'price' ? { limitPrice: price } : { quantity: qty }); setBusy(false); }}
            className="min-h-[50px] rounded-2xl font-black disabled:opacity-50" style={{ background: C.accent, color: C.bg }}>{busy ? '送出中…' : '確認改單'}</button>
        </div>
      </div>
    </div>
  );
}
