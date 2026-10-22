import React, { useEffect, useMemo, useState } from 'react';
import type { InstrumentSpec, Position } from '../types/market';
import { getInstrumentTradingClock } from '../utils/tradingClock';
import { isLongPosition } from '../utils/orderMath';
import {
  ALERT_META,
  DEFAULT_ALERT_SETTINGS,
  alertLevel,
  detectAlerts,
  evidenceCount,
  summarize,
  type AlertId,
  type AlertSettings,
  type Bar,
  type Triggered,
} from '../utils/techAlerts';

/**
 * 技術面警訊雷達：持股出現轉弱、異常或背離時提醒，並列出觸發原因
 * - 「收盤確認」：用已收盤的日 K 判斷
 * - 「盤中暫時觸發」：把今天盤中的即時價當成一根尚未收盤的 K 棒，收盤前都可能改變
 */
const SETTINGS_KEY = 'tech_alert_settings_v1';
const SEEN_KEY = 'tech_alert_seen_v1';
const HIST_TTL = 10 * 60 * 1000;
const histCache = new Map<string, { at: number; bars: Bar[] | null; error?: string }>();
const SUPPORTED = new Set(['stocks', 'etfs', 'bonds']);

function loadSettings(): AlertSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULT_ALERT_SETTINGS, ...s, enabled: { ...DEFAULT_ALERT_SETTINGS.enabled, ...(s.enabled || {}) } };
  } catch { /* 用預設 */ }
  return DEFAULT_ALERT_SETTINGS;
}
function saveSettings(s: AlertSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 略過 */ }
}
function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch { /* 略過 */ }
}

async function loadBars(symbol: string): Promise<{ bars: Bar[] | null; error?: string }> {
  const hit = histCache.get(symbol);
  if (hit && Date.now() - hit.at < HIST_TTL) return hit;
  try {
    const r = await fetch(`/api/history/daily?symbol=${encodeURIComponent(symbol)}`);
    const j = await r.json();
    if (!j.success) throw new Error(j.message || '查無歷史資料');
    const n = j.date.length;
    const from = Math.max(0, n - 200);
    const bars: Bar[] = [];
    for (let i = from; i < n; i++) {
      // 有還原價就用還原價（避免除權息造成假的跌破、假的缺口），最新一天還原價＝實際價
      const adj = j.adj_close?.[i] != null && j.adj_open?.[i] != null && j.adj_high?.[i] != null && j.adj_low?.[i] != null;
      const o = adj ? j.adj_open[i] : j.open[i];
      const h = adj ? j.adj_high[i] : j.high[i];
      const l = adj ? j.adj_low[i] : j.low[i];
      const c = adj ? j.adj_close[i] : j.close[i];
      if (!(c > 0 && h > 0 && l > 0 && o > 0)) continue;
      bars.push({ date: j.date[i], open: o, high: h, low: l, close: c, volume: Number(j.volume[i]) || 0 });
    }
    const out = { at: Date.now(), bars };
    histCache.set(symbol, out);
    return out;
  } catch (e: any) {
    const out = { at: Date.now(), bars: null, error: e.message };
    histCache.set(symbol, out);
    return out;
  }
}

interface Eval {
  symbol: string;
  name: string;
  long: boolean;
  confirmed: { date: string; list: Triggered[]; snapshot: boolean } | null;
  intraday: { list: Triggered[]; time: string } | null;
  error?: string;
  loading?: boolean;
}

const twDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());

function evaluate(symbol: string, name: string, long: boolean, bars: Bar[], inst: InstrumentSpec | undefined, s: AlertSettings): Eval {
  const last = bars[bars.length - 1]?.date || '';
  const today = twDate();
  // 今天的即時 K 棒（盤中快照或收盤快照）
  let todayBar: Bar | null = null;
  const snapDate = String(inst?.fetchTime || '').slice(0, 10);
  if (inst && !inst.isMock && inst.dataset === 'taiwan_stock_tick_snapshot' && snapDate === today && today > last && inst.price > 0 && (inst.high ?? 0) > 0 && (inst.low ?? 0) > 0 && (inst.open ?? 0) > 0) {
    // 即時成交量單位是「張」，歷史日資料是「股」
    todayBar = { date: today, open: inst.open!, high: inst.high!, low: inst.low!, close: inst.price, volume: (Number(inst.volume) || 0) * 1000 };
  }
  const open = getInstrumentTradingClock(symbol, 'stocks').isTradingNow;
  const base = { symbol, name, long };
  if (todayBar && open) {
    return {
      ...base,
      confirmed: { date: last, list: detectAlerts(bars, s), snapshot: false },
      intraday: { list: detectAlerts([...bars, todayBar], s, { skipVolumeLow: true }), time: String(inst?.fetchTime || '').slice(11, 16) },
    };
  }
  if (todayBar) {
    // 收盤後、官方日資料還沒更新：用今天的收盤快照確認
    return { ...base, confirmed: { date: today, list: detectAlerts([...bars, todayBar], s), snapshot: true }, intraday: null };
  }
  return { ...base, confirmed: { date: last, list: detectAlerts(bars, s), snapshot: false }, intraday: null };
}

// ───────── 樣式（電腦版淺色、手機版深色） ─────────
const themes = {
  light: { card: 'bg-white border border-slate-200', sub: 'text-slate-600', muted: 'text-slate-500', text: 'text-slate-900', chip: 'bg-slate-100 text-slate-700', box: 'bg-slate-50 border border-slate-200', input: 'bg-white border-slate-300 text-slate-900' },
  dark: { card: 'bg-[#141c26] border border-[#243041]', sub: 'text-slate-300', muted: 'text-slate-400', text: 'text-slate-100', chip: 'bg-[#1e293b] text-slate-200', box: 'bg-[#0f151d] border border-[#243041]', input: 'bg-[#0b0f14] border-[#334155] text-slate-100' },
};
const LEVEL_STYLE = ['', 'bg-amber-100 text-amber-900 border-amber-300', 'bg-orange-100 text-orange-900 border-orange-300', 'bg-rose-100 text-rose-900 border-rose-300'];

function AlertList({ list, t }: { list: Triggered[]; t: typeof themes.light }) {
  return (
    <ul className="space-y-1.5">
      {list.map(a => (
        <li key={a.id} className={`rounded-lg px-3 py-2 ${t.box}`}>
          <div className={`text-[14px] font-black ${t.text}`}>{ALERT_META[a.id].no}. {ALERT_META[a.id].title}<span className={`ml-2 text-[12px] font-bold ${ALERT_META[a.id].group === 'momentum' ? 'text-violet-500' : t.muted}`}>{ALERT_META[a.id].group === 'momentum' ? '動能訊號' : ''}</span></div>
          <div className={`text-[13px] ${t.sub}`}>「{ALERT_META[a.id].message}」</div>
          <div className={`text-[12.5px] ${t.muted} font-mono`}>觸發原因：{a.detail}</div>
        </li>
      ))}
    </ul>
  );
}

function SummaryCard({ list, status, dayWord, isNew, long }: { list: Triggered[]; status: string; dayWord: string; isNew: boolean; long: boolean }) {
  const sum = summarize(list, status, dayWord);
  if (!sum) return null;
  const lvl = alertLevel(list);
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-[14px] leading-relaxed ${LEVEL_STYLE[lvl]}`}>
      <div className="font-black text-[15px]">{sum.headline}{isNew && <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[11px]">新</span>}</div>
      <div>{sum.body}</div>
      <div className="font-bold">{sum.triggers}</div>
      <div className="font-bold">{sum.status}</div>
      {!long && <div className="mt-1 text-[13px]">你持有的是<b>空單</b>：這些偏空訊號對空單是有利的方向，可留意是否要調整停利。</div>}
    </div>
  );
}

export function TechAlertRadar({ positions, instruments, dark = false, onOpenSymbol }: { positions: Position[]; instruments: InstrumentSpec[]; dark?: boolean; onOpenSymbol?: (symbol: string) => void }) {
  const t = dark ? themes.dark : themes.light;
  const [settings, setSettings] = useState<AlertSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [bars, setBars] = useState<Record<string, { bars: Bar[] | null; error?: string }>>({});
  const [seen, setSeen] = useState<Set<string>>(loadSeen);

  // 同一檔多筆持倉合併；只看台股現股、ETF、債券 ETF（有日 K 資料）
  const held = useMemo(() => {
    const m = new Map<string, { symbol: string; name: string; long: boolean }>();
    for (const p of positions) {
      if (!SUPPORTED.has(p.category)) continue;
      if (!m.has(p.symbol)) m.set(p.symbol, { symbol: p.symbol, name: p.name, long: isLongPosition(p.orderType) });
    }
    return [...m.values()];
  }, [positions]);
  const others = positions.filter(p => !SUPPORTED.has(p.category)).length;
  const key = held.map(h => h.symbol).join(',');

  useEffect(() => {
    let alive = true;
    held.forEach(h => {
      loadBars(h.symbol).then(r => alive && setBars(prev => ({ ...prev, [h.symbol]: r })));
    });
    const id = setInterval(() => held.forEach(h => loadBars(h.symbol).then(r => alive && setBars(prev => (prev[h.symbol] === r ? prev : { ...prev, [h.symbol]: r })))), HIST_TTL);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const evals: Eval[] = useMemo(
    () =>
      held.map(h => {
        const b = bars[h.symbol];
        if (!b) return { ...h, confirmed: null, intraday: null, loading: true };
        if (!b.bars || b.bars.length < 40) return { ...h, confirmed: null, intraday: null, error: b.error || '歷史資料不足 40 天，暫不判斷' };
        return evaluate(h.symbol, h.name, h.long, b.bars, instruments.find(i => i.symbol === h.symbol), settings);
      }),
    [held, bars, instruments, settings]
  );

  const sigOf = (e: Eval, kind: 'c' | 'i') => {
    const list = kind === 'c' ? e.confirmed?.list : e.intraday?.list;
    return `${e.symbol}|${kind}|${kind === 'c' ? e.confirmed?.date : twDate()}|${(list || []).map(x => x.id).join('+')}`;
  };
  const scored = evals
    .map(e => ({ e, score: Math.max(evidenceCount(e.confirmed?.list || []), evidenceCount(e.intraday?.list || [])) }))
    .sort((a, b) => b.score - a.score);
  const flagged = scored.filter(x => x.score > 0);
  const unseen = evals.filter(e => (e.confirmed?.list.length && !seen.has(sigOf(e, 'c'))) || (e.intraday?.list.length && !seen.has(sigOf(e, 'i'))));
  const markSeen = () => {
    const n = new Set(seen);
    evals.forEach(e => { if (e.confirmed?.list.length) n.add(sigOf(e, 'c')); if (e.intraday?.list.length) n.add(sigOf(e, 'i')); });
    setSeen(n);
    saveSeen(n);
  };

  const update = (patch: Partial<AlertSettings>) => { const n = { ...settings, ...patch }; setSettings(n); saveSettings(n); };

  if (held.length === 0) {
    return (
      <div className={`rounded-2xl p-4 ${t.card}`}>
        <div className={`text-[17px] font-black ${t.text}`}>📡 技術面警訊雷達</div>
        <div className={`text-[14px] mt-1 ${t.muted}`}>持有台股現股或 ETF 後，這裡會自動檢查 10 項技術警訊（跌破支撐、放量長黑、均線轉弱、MACD／KD／RSI 轉弱等），並列出觸發原因。{others > 0 ? `目前持有的 ${others} 筆期貨、選擇權、海外或加密部位暫不支援。` : ''}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${t.card}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`text-[18px] font-black ${t.text}`}>📡 技術面警訊雷達</div>
        {unseen.length > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[12px] font-black">{unseen.length} 檔有新警訊</span>}
        <div className="ml-auto flex gap-1.5">
          {unseen.length > 0 && <button type="button" onClick={markSeen} className={`min-h-[34px] px-3 rounded-lg text-[13px] font-bold ${t.chip}`}>標為已讀</button>}
          <button type="button" onClick={() => setShowSettings(v => !v)} className={`min-h-[34px] px-3 rounded-lg text-[13px] font-bold ${t.chip}`}>⚙️ 調整規則</button>
        </div>
      </div>
      <div className={`text-[12.5px] leading-relaxed ${t.muted}`}>
        檢查 {held.length} 檔持股的 10 項技術警訊。<b>收盤確認</b>用已收盤日 K；<b>盤中暫時觸發</b>把今天的即時價當成尚未收盤的 K 棒，收盤前都可能消失。MACD、KD、RSI 同屬動能訊號，同時出現只算一份證據。這些是可調整的偵測規則，<b>不代表觸發後一定下跌</b>。
      </div>

      {showSettings && <SettingsPanel s={settings} t={t} onChange={update} onReset={() => { setSettings(DEFAULT_ALERT_SETTINGS); saveSettings(DEFAULT_ALERT_SETTINGS); }} />}

      {flagged.length === 0 && evals.every(e => !e.loading) && (
        <div className={`rounded-xl px-3 py-3 text-[14px] ${t.box} ${t.sub}`}>✅ 目前持股都沒有觸發技術警訊。</div>
      )}

      <div className="space-y-2">
        {scored.map(({ e }) => {
          const c = e.confirmed?.list || [];
          const i = e.intraday?.list || [];
          const count = new Set([...c, ...i].map(x => x.id)).size;
          const isOpen = open === e.symbol;
          const newC = c.length > 0 && !seen.has(sigOf(e, 'c'));
          const newI = i.length > 0 && !seen.has(sigOf(e, 'i'));
          return (
            <div key={e.symbol} className={`rounded-xl ${t.box}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : e.symbol)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                <span className={`text-[15px] font-black ${t.text}`}>{e.name}</span>
                <span className={`text-[12px] font-mono ${t.muted}`}>{e.symbol}{e.long ? '' : '・空單'}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {e.loading && <span className={`text-[12px] ${t.muted}`}>讀取中…</span>}
                  {e.error && <span className={`text-[12px] ${t.muted}`}>{e.error}</span>}
                  {!e.loading && !e.error && count === 0 && <span className="text-[12px] font-bold text-emerald-600">無警訊</span>}
                  {c.length > 0 && <span className={`px-2 py-0.5 rounded-full text-[12px] font-black border ${LEVEL_STYLE[alertLevel(c)]}`}>收盤確認 {c.length}</span>}
                  {i.length > 0 && <span className="px-2 py-0.5 rounded-full text-[12px] font-black border border-dashed border-amber-500 text-amber-600">盤中暫時 {i.length}</span>}
                  {(newC || newI) && <span className="w-2 h-2 rounded-full bg-rose-600" />}
                  {count > 0 && <span className={t.muted}>{isOpen ? '▴' : '▾'}</span>}
                </span>
              </button>
              {isOpen && count > 0 && (
                <div className="px-3 pb-3 space-y-3">
                  {i.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[13px] font-black text-amber-600">⏱ 盤中暫時觸發（{e.intraday!.time} 即時價，收盤前可能改變）</div>
                      <SummaryCard list={i} status={`盤中暫時觸發，${e.intraday!.time} 為止`} dayWord="今日盤中" isNew={newI} long={e.long} />
                      <AlertList list={i} t={t} />
                    </div>
                  )}
                  {c.length > 0 && (
                    <div className="space-y-1.5">
                      <div className={`text-[13px] font-black ${t.text}`}>✔ 收盤確認（{e.confirmed!.date}{e.confirmed!.snapshot ? '，收盤快照，官方日資料晚間更新' : ''}）</div>
                      <SummaryCard list={c} status={`收盤確認（${e.confirmed!.date}）`} dayWord={e.confirmed!.date === twDate() ? '今日' : `${e.confirmed!.date.slice(5).replace('-', '/')} `} isNew={newC} long={e.long} />
                      <AlertList list={c} t={t} />
                    </div>
                  )}
                  {onOpenSymbol && (
                    <button type="button" onClick={() => onOpenSymbol(e.symbol)} className={`min-h-[36px] px-3 rounded-lg text-[13px] font-bold ${t.chip}`}>看 K 線與下單</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {others > 0 && <div className={`text-[12px] ${t.muted}`}>另有 {others} 筆期貨、選擇權、海外或加密部位，目前沒有日 K 資料可判斷，暫不列入。</div>}
    </div>
  );
}

// ───────── 規則設定 ─────────
const FIELDS: Record<AlertId, { k: keyof AlertSettings; label: string; step?: number }[]> = {
  support: [{ k: 'supportDays', label: '前幾日最低價' }],
  bigBlack: [{ k: 'atrPeriod', label: 'ATR 天數' }, { k: 'bodyAtr', label: '實體 ≥ ATR 倍數', step: 0.1 }, { k: 'volAvgDays', label: '均量天數' }, { k: 'volSpike', label: '量 ≥ 均量倍數', step: 0.1 }],
  lowVolHigh: [{ k: 'newHighDays', label: '創幾日新高' }, { k: 'lowVolRatio', label: '量 < 均量比例', step: 0.05 }],
  upperShadow: [{ k: 'highZoneDays', label: '近幾日高檔' }, { k: 'highZonePct', label: '距高點 %', step: 0.5 }, { k: 'shadowRatio', label: '上影 ≥ 實體倍數', step: 0.5 }],
  maWeak: [{ k: 'maDays', label: '均線天數' }, { k: 'maBelowDays', label: '連續幾日' }, { k: 'maSlopeDays', label: '比幾日前低' }, { k: 'maAlertDays', label: '提醒幾天' }],
  macdCross: [{ k: 'macdFast', label: '快線' }, { k: 'macdSlow', label: '慢線' }, { k: 'macdSignal', label: '訊號線' }],
  rsiDiv: [{ k: 'rsiPeriod', label: 'RSI 天數' }, { k: 'pivotBars', label: '高點確認根數' }, { k: 'divergenceRecent', label: '最近幾日內' }],
  kdCross: [{ k: 'kdPeriod', label: 'KD 天數' }, { k: 'kdHigh', label: '高檔門檻' }],
  breakoutFail: [{ k: 'breakoutDays', label: '突破前幾日高點' }, { k: 'breakoutFailDays', label: '幾日內收回' }],
  gapFail: [{ k: 'gapDays', label: '最近幾日內的缺口' }],
};

function SettingsPanel({ s, t, onChange, onReset }: { s: AlertSettings; t: typeof themes.light; onChange: (p: Partial<AlertSettings>) => void; onReset: () => void }) {
  return (
    <div className={`rounded-xl p-3 space-y-2 ${t.box}`}>
      <div className="flex items-center">
        <div className={`text-[14px] font-black ${t.text}`}>規則與門檻（只存在這台裝置）</div>
        <button type="button" onClick={onReset} className={`ml-auto min-h-[32px] px-3 rounded-lg text-[12px] font-bold ${t.chip}`}>還原預設</button>
      </div>
      {(Object.keys(ALERT_META) as AlertId[]).map(id => (
        <div key={id} className={`rounded-lg p-2 ${t.card}`}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={s.enabled[id] !== false} onChange={e => onChange({ enabled: { ...s.enabled, [id]: e.target.checked } })} className="mt-1 w-4 h-4" />
            <span>
              <span className={`text-[14px] font-black ${t.text}`}>{ALERT_META[id].no}. {ALERT_META[id].title}</span>
              <span className={`block text-[12px] ${t.muted}`}>{ALERT_META[id].rule(s)}</span>
            </span>
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2 pl-6">
            {FIELDS[id].map(f => (
              <label key={f.k} className={`text-[12px] flex items-center gap-1 ${t.sub}`}>
                {f.label}
                <input type="number" step={f.step || 1} value={s[f.k] as number}
                  onChange={e => { const v = Number(e.target.value); if (isFinite(v) && v > 0) onChange({ [f.k]: v } as any); }}
                  className={`w-16 h-8 rounded border px-1.5 font-mono ${t.input}`} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
