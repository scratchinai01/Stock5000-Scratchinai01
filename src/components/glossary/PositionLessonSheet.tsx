import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { InstrumentSpec, Position, StudentProfile } from '../../types/market';
import { useGlossary } from '../../context/GlossaryContext';
import { POSITION_LESSONS, GENERIC_LESSON } from '../../data/positionLessons';
import { TERMS_BY_ID } from '../../data/financialTerms';
import { pnlDirection, positionPnL } from '../../utils/orderRules';
import { COPYRIGHT, LEGAL, DATA_NOTE } from '../StudyCardModal';

/**
 * 持倉小學堂：對帳單每一筆部位的教學卡，用學生自己的真實數字講解，並可下載成圖片。
 */

const PAPER = '#fbf8f2';
const INK = '#1f2630';
const SUB = '#4b5563';
const LINE = '#e6dfd1';
const UP = '#c81e2c';
const DOWN = '#11803d';
const FONT = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace";

const HEADER: Record<string, string> = {
  stocks: 'linear-gradient(135deg,#b45309,#d97706)',
  etfs: 'linear-gradient(135deg,#15803d,#059669)',
  bonds: 'linear-gradient(135deg,#0f766e,#0891b2)',
  futures: 'linear-gradient(135deg,#c2410c,#dc2626)',
  options: 'linear-gradient(135deg,#be185d,#a21caf)',
  warrants: 'linear-gradient(135deg,#0e7490,#0284c7)',
};

const num = (v: number, d = 2) => (isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const money = (v: number) => `${v < 0 ? '−' : ''}NT$ ${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

function unitOf(p: Position) {
  if (p.category === 'futures' || p.category === 'options') return '口';
  if (p.category === 'us_stocks') return '股';
  if (p.category === 'crypto' || p.category === 'commodities') return '單位';
  return '張';
}
function multLabel(p: Position) {
  if (p.category === 'futures' || p.category === 'options') return `每點 ${num(p.unitMultiplier, 0)} 元`;
  if (p.unitMultiplier === 1000) return '1 張 = 1,000 股';
  return `乘數 ${num(p.unitMultiplier)}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 21, fontWeight: 900, color: INK }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: LINE }} />
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 16, color: SUB, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, fontFamily: MONO, color: color || INK, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

export function PositionLessonSheet({ instruments, profile }: { instruments: InstrumentSpec[]; profile: StudentProfile | null }) {
  const g = useGlossary();
  const pos = g.lessonPosition;
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMsg(null);
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && g.closePositionLesson();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pos, g]);

  if (!pos) return null;

  const meta = g.lessonMeta;
  const mode = meta?.mode || 'position';
  const isClose = mode === 'trade-close';
  const lesson = POSITION_LESSONS[pos.orderType] || GENERIC_LESSON;
  const unit = unitOf(pos);
  const dir = pnlDirection(pos.orderType);
  const pnl = isClose && typeof meta?.realizedPnL === 'number'
    ? meta.realizedPnL
    : positionPnL(pos.orderType, pos.entryPrice, pos.currentPrice, pos.quantity, pos.unitMultiplier);

  // 紀念卡編號：這位學生依時間順序的第幾筆成交
  const history = profile?.tradeHistory || []; // 新的在前
  let serialIdx = -1;
  if (meta?.recordId) serialIdx = history.findIndex(h => h.id === meta.recordId);
  if (serialIdx < 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.symbol === pos.symbol && h.action === pos.orderType && !h.id.startsWith('close')) { serialIdx = i; break; }
    }
  }
  const serial = serialIdx >= 0 ? history.length - serialIdx : null;
  const serialText = serial ? `No.${String(serial).padStart(3, '0')}` : '';
  const dateRaw = meta?.tradeDate || pos.entryDate || '';
  const dateMatch = dateRaw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const stampDate = dateMatch ? `${dateMatch[1]}.${dateMatch[2].padStart(2, '0')}.${dateMatch[3].padStart(2, '0')}` : '';
  const stampText = isClose ? (pnl >= 0 ? '獲利出場' : '停損學習') : mode === 'trade-open' ? '建倉紀念' : '持有中';
  const rationaleRaw = (meta?.rationale ?? pos.notes ?? '').trim();
  const rationale = rationaleRaw && !/^(平倉|正常建倉委託|依21號收盤價建倉)$/.test(rationaleRaw) ? rationaleRaw : '';
  const badgeText = isClose ? '📖 交易小學堂 · 平倉紀念卡' : mode === 'trade-open' ? '📖 交易小學堂 · 建倉紀念卡' : '📖 持倉小學堂';
  const pct = pos.totalCostOrMargin > 0 ? (pnl / pos.totalCostOrMargin) * 100 : 0;
  const perTick = pos.quantity * pos.unitMultiplier;
  const isMarginBased = pos.category === 'futures' || pos.orderType.startsWith('SELL_') || pos.orderType.startsWith('SHORT');
  const fx = pos.category === 'commodities' || pos.category === 'crypto';
  const now = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

  // 選擇權：用台指期近月價估算內含價值（只有 有真實報價時才顯示）
  let optionNote: string | null = null;
  const om = pos.category === 'options' ? pos.symbol.toUpperCase().match(/-(\d+(?:\.\d+)?)-(C|P|CALL|PUT)$/) : null;
  const tx = instruments.find(i => i.symbol === 'TX' && !i.isMock && i.price > 0);
  if (om && tx) {
    const strike = Number(om[1]);
    const isCall = om[2].startsWith('C');
    const intrinsic = Math.max(0, isCall ? tx.price - strike : strike - tx.price);
    const timeV = Math.max(0, pos.currentPrice - intrinsic);
    optionNote = `台指期近月 ${num(tx.price, 0)} 點、履約價 ${num(strike, 0)}：${isCall ? '買權' : '賣權'}內含價值約 ${num(intrinsic, 0)} 點，目前權利金 ${num(pos.currentPrice)} 點中約 ${num(timeV, 0)} 點是時間價值${intrinsic === 0 ? '（目前是價外，到期前沒變價內就會歸零）' : ''}。`;
  }

  const download = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    setMsg(null);
    const node = cardRef.current;
    const prevWidth = node.style.width;
    const root = document.documentElement;
    const prevRoot = root.style.fontSize;
    try {
      root.style.fontSize = '16px';
      // 固定 720px 寬輸出，手機和電腦下載的卡片長得一樣
      node.style.width = '720px';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: PAPER,
        skipFonts: true,
        filter: n => !(n instanceof HTMLElement && n.dataset.noexport === '1'),
      });
      const filename = `lesson_${serial ? `No${serial}_` : ''}${pos.symbol}_${now.replace(/\D/g, '').slice(0, 8)}.png`;
      node.style.width = prevWidth;
      root.style.fontSize = prevRoot;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await nav.share({ files: [file], title: `${badgeText.replace('📖 ', '')}：${pos.name}` });
        setMsg('已開啟分享，可以選「儲存影像」存到相簿。');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setMsg(`已下載：${filename}`);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setMsg(`下載失敗：${e?.message || e}`);
    } finally {
      node.style.width = prevWidth;
      root.style.fontSize = prevRoot;
      setBusy(false);
    }
  };

  const signedPnL = pnl >= 0 ? `+${money(pnl)}` : money(pnl);
  const nowWord = isClose ? '平倉' : '目前';
  const costWord = mode === 'trade-open' ? '成交' : '成本';
  const formula =
    dir === 1
      ? `（${nowWord} ${num(pos.currentPrice)} − ${costWord} ${num(pos.entryPrice)}）× ${num(pos.quantity, 0)} ${unit} × ${num(pos.unitMultiplier, 0)}`
      : `（${costWord} ${num(pos.entryPrice)} − ${nowWord} ${num(pos.currentPrice)}）× ${num(pos.quantity, 0)} ${unit} × ${num(pos.unitMultiplier, 0)}`;
  const pnlWord = isClose ? '已實現損益' : mode === 'trade-open' ? '成交後到現在的損益' : '未實現損益';

  return (
    <div className="fixed inset-0 z-[140] flex items-end md:items-center justify-center" style={{ background: 'rgba(10,14,20,0.62)', backdropFilter: 'blur(3px)' }} onClick={g.closePositionLesson}>
      <div role="dialog" aria-modal="true" aria-label={`${mode === 'position' ? '持倉' : '交易'}小學堂：${pos.name}`} onClick={e => e.stopPropagation()}
        className="w-full md:w-[820px] h-[94dvh] md:h-auto md:max-h-[92vh] rounded-t-[28px] md:rounded-[28px] overflow-hidden flex flex-col shadow-2xl" style={{ background: PAPER }}>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* ↓ 這個區塊就是下載的卡片 */}
          <div ref={cardRef} style={{ background: PAPER, color: INK, fontFamily: FONT }}>
            <div style={{ background: HEADER[pos.category] || 'linear-gradient(135deg,#334155,#0f172a)', color: '#fff', padding: '20px 24px 22px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, background: 'rgba(255,255,255,0.18)', padding: '4px 12px', borderRadius: 999 }}>{badgeText}</span>
                  {serialText && <span style={{ fontSize: 16, fontWeight: 800, fontFamily: MONO, background: 'rgba(0,0,0,0.22)', padding: '4px 12px', borderRadius: 999 }}>{serialText}</span>}
                </span>
                <button type="button" data-noexport="1" onClick={g.closePositionLesson} aria-label="關閉" className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-[24px]">✕</button>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.15 }}>{pos.name}</span>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, opacity: 0.9 }}>{pos.symbol}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>{lesson.title}</div>
              <div style={{ marginTop: 6, fontSize: 16, opacity: 0.9, paddingRight: 132 }}>
                {profile?.studentName ? `操盤手：${profile.studentName} · ` : ''}{isClose ? '平倉' : mode === 'trade-open' ? '成交' : '建倉'}：{dateRaw || '—'}
              </div>
              {stampDate && (
                <div aria-hidden="true" style={{ position: 'absolute', right: 22, bottom: 16, width: 120, height: 120, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-12deg)', boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.25)', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>5000萬大富翁</span>
                  <span style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.2 }}>{stampText}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO }}>{stampDate}</span>
                </div>
              )}
            </div>
            {/* 票根撕線 */}
            <div aria-hidden="true" style={{ height: 0, borderTop: '3px dashed #d9cfbb', margin: '0 18px' }} />

            <div style={{ padding: '22px 24px 26px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <Section title="這筆部位是什麼">
                <p style={{ fontSize: 20, lineHeight: 1.8, margin: 0 }}>{lesson.plain}</p>
              </Section>

              {rationale && (
                <div style={{ background: '#fff7e6', border: '1px solid #f3dca8', borderRadius: 18, padding: '14px 18px' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#a16207', marginBottom: 4 }}>✍️ 我當時的下單理由</div>
                  <div style={{ fontSize: 20, lineHeight: 1.75, fontStyle: 'italic' }}>「{rationale}」</div>
                </div>
              )}

              <Section title="你的真實數字">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  <Stat label={mode === 'trade-open' ? '成交價' : '進場成本'} value={num(pos.entryPrice)} />
                  <Stat label={isClose ? '平倉價' : '目前價格'} value={num(pos.currentPrice)} />
                  <Stat label="數量" value={`${num(pos.quantity, 0)} ${unit}`} />
                  <Stat label="計算單位" value={multLabel(pos)} />
 {!isClose && <Stat label={isMarginBased ? '保證金' : '投入金額'} value={money(pos.totalCostOrMargin)} />}
                  <Stat label={pnlWord} value={isClose || !(pos.totalCostOrMargin > 0) ? signedPnL : `${signedPnL}（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%）`} color={pnl >= 0 ? UP : DOWN} />
                </div>
              </Section>

              <Section title="算給你看">
                <div style={{ background: INK, color: '#f8f5ee', borderRadius: 18, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 16, color: '#fcd34d', fontWeight: 800 }}>{pnlWord} ＝</span>
                  <span style={{ fontSize: 20, fontFamily: MONO, lineHeight: 1.6, wordBreak: 'break-word' }}>{formula}{fx ? ' × 匯率' : ''}</span>
                  <span style={{ fontSize: 28, fontWeight: 900, fontFamily: MONO, color: pnl >= 0 ? '#ff8a93' : '#5ef08f' }}>＝ {signedPnL}</span>
                </div>
                {!isClose && <p style={{ fontSize: 19, lineHeight: 1.75, margin: 0 }}>
                  價格每{dir === 1 ? '上漲' : '下跌'} 1 {lesson.unitWord}，這筆部位就多賺 <b style={{ fontFamily: MONO }}>{money(perTick * (fx ? (pos.category === 'crypto' ? 32.5 : 32) : 1))}</b>；反方向就少賺同樣金額。
                  {!isClose && pos.totalCostOrMargin > 0 && (
                    <> 報酬率是用損益除以{isMarginBased ? '保證金' : '投入金額'}（{money(pos.totalCostOrMargin)}）計算。</>
                  )}
                </p>}
                {isClose && <p style={{ fontSize: 19, lineHeight: 1.75, margin: 0 }}>這筆已經平倉，損益已經落袋，不會再隨行情變動。成本價是由平倉價與已實現損益換算出來的。</p>}
                {!isClose && optionNote && <p style={{ fontSize: 19, lineHeight: 1.75, margin: 0, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '12px 14px' }}>🎯 {optionNote}</p>}
              </Section>

              <Section title="什麼時候賺、什麼時候賠">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  <div style={{ background: '#fdecee', borderRadius: 16, padding: '12px 16px', fontSize: 19, lineHeight: 1.6 }}><b style={{ color: UP }}>▲ 賺錢：</b>{lesson.win}</div>
                  <div style={{ background: '#e6f5ec', borderRadius: 16, padding: '12px 16px', fontSize: 19, lineHeight: 1.6 }}><b style={{ color: DOWN }}>▼ 賠錢：</b>{lesson.lose}</div>
                </div>
              </Section>

              <Section title="風險提醒">
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lesson.risks.map((r, i) => (
                    <li key={i} style={{ fontSize: 19, lineHeight: 1.7, display: 'flex', gap: 8 }}><span>⚠️</span><span>{r}</span></li>
                  ))}
                </ul>
              </Section>

              <Section title="延伸學習（點名詞看名詞卡）">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {lesson.terms.map(id => TERMS_BY_ID.get(id)).filter(Boolean).map(t => (
                    <button key={t!.id} type="button" onClick={() => g.openTermDetail(t!.id)}
                      style={{ fontSize: 18, fontWeight: 800, padding: '8px 16px', borderRadius: 999, background: '#fff', border: `1px solid ${LINE}`, color: INK, minHeight: 44 }}>
                      {t!.t}
                    </button>
                  ))}
                </div>
              </Section>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', background: '#f4efe4', borderRadius: 18, padding: '14px 18px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, color: SUB, fontWeight: 700 }}>{serialText ? '收藏編號' : '收藏日期'}</span>
                  <span style={{ fontSize: 24, fontWeight: 900, fontFamily: MONO }}>{serialText || stampDate || now.slice(0, 10)}</span>
                  {profile?.studentName && serial && <span style={{ fontSize: 16, color: SUB }}>{profile.studentName}的第 {serial} 筆交易</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 200 }}>
                  <span style={{ fontSize: 15, color: SUB, fontWeight: 700 }}>學習心得／簽名</span>
                  <span style={{ width: 220, borderBottom: `2px solid ${INK}`, height: 28 }} />
                </div>
              </div>

              <div style={{ borderTop: `1px dashed ${LINE}`, paddingTop: 12, fontSize: 15, color: SUB, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>5000萬股市大富翁 · {mode === 'position' ? '持倉小學堂' : '交易小學堂'}</span>
                <span>{instruments.some(i => i.symbol === pos.symbol && !i.isMock) ? '報價來源：市場資料' : '價格為系統最後記錄'} · {now}</span>
              </div>
              <div style={{ fontSize: 14, color: SUB }}>模擬交易教學用途，不是投資建議。</div>
              <div style={{ background: '#f4efe4', borderRadius: 14, padding: '8px 12px', fontSize: 14, color: SUB, textAlign: 'center', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 900, color: INK }}>{COPYRIGHT}</div>
                <div style={{ fontWeight: 700, color: INK }}>{LEGAL}</div>
                <div>{DATA_NOTE}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-none px-4 pt-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${LINE}`, background: PAPER, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {msg && <div className="text-[17px] font-bold text-center" style={{ color: msg.startsWith('下載失敗') ? UP : DOWN }}>{msg}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={g.closePositionLesson} className="min-h-[56px] px-6 rounded-full text-[19px] font-black" style={{ border: `1px solid ${LINE}`, color: INK }}>關閉</button>
            <button type="button" onClick={download} disabled={busy} className="flex-1 min-h-[56px] rounded-full text-[20px] font-black text-white disabled:opacity-60" style={{ background: INK }}>
              {busy ? '產生圖片中…' : '⬇ 下載這張卡片'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
