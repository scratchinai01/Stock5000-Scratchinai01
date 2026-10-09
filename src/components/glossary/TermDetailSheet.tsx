import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FINANCIAL_TERMS, TERMS_BY_ID, TERM_CATEGORIES, type FinancialTerm, type TermCategoryCode } from '../../data/financialTerms';
import { TERM_DETAILS, type TermQuiz } from '../../data/termDetails';
import { useGlossary } from '../../context/GlossaryContext';
import type { InstrumentSpec } from '../../types/market';
import { TermCalculator } from './TermCalculators';
import { ReadingScaleSwitch } from './ReadingScaleSwitch';
import { useReadingScale } from './useReadingScale';

/** 名詞卡：點「詳情」後打開的完整學習頁 */

const PAPER = '#fbf8f2';
const INK = '#1f2630';
const SUB = '#5b6573';
const LINE = '#e6dfd1';
const UP = '#d42a3a';
const DOWN = '#14833f';

const ACCENT: Record<TermCategoryCode, string> = {
  mkt: '#3b5bdb', trd: '#b7791f', ord: '#0f8a6a', fee: '#c2570c', cor: '#9c36b5', ta: '#c92a3a', fa: '#1971c2',
  chp: '#6741d9', fut: '#d9480f', opt: '#c2255c', etf: '#2b8a3e', wnt: '#0b7285', risk: '#495057',
};

const TRY_LABEL = { order: '去下單試試', quote: '看即時報價', analysis: '打開專業分析', portfolio: '看我的庫存' } as const;
export type TryTarget = keyof typeof TRY_LABEL;

/** 沒有編寫題目的名詞：用同類名詞的真實定義當選項自動出題 */
function autoQuiz(term: FinancialTerm): TermQuiz | null {
  const pool = FINANCIAL_TERMS.filter(t => t.c === term.c && t.id !== term.id && t.s !== term.s);
  if (pool.length < 3) return null;
  let h = 0;
  for (const ch of term.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const picks: FinancialTerm[] = [];
  for (let i = 0; picks.length < 3 && i < pool.length * 2; i++) {
    const t = pool[(h + i * 7) % pool.length];
    if (!picks.includes(t)) picks.push(t);
  }
  const answer = h % 4;
  const options = picks.map(t => t.s);
  options.splice(answer, 0, term.s);
  return { q: `哪一個說明的是「${term.t}」？`, options, answer, why: `「${term.t}」：${term.s}` };
}

function SectionTitle({ n, children, color }: { n: string; children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[15px] font-black tracking-[0.2em]" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>{n}</span>
      <span className="text-[19px] font-black" style={{ color: INK }}>{children}</span>
      <span className="flex-1 h-px" style={{ background: LINE }} />
    </div>
  );
}

export function TermDetailSheet({ instruments, onTry }: { instruments: InstrumentSpec[]; onTry?: (t: TryTarget) => void }) {
  const g = useGlossary();
  const [stack, setStack] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // 外部開啟新的名詞時重設瀏覽紀錄
  useEffect(() => {
    if (g.detailTermId) setStack([g.detailTermId]);
  }, [g.detailTermId]);

  const currentId = stack[stack.length - 1] || g.detailTermId;
  const term = currentId ? TERMS_BY_ID.get(currentId) : undefined;

  useEffect(() => {
    if (!g.detailTermId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && g.closeTermDetail();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [g.detailTermId, g]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [currentId]);

  if (!g.detailTermId || !term) return null;

  const go = (id: string) => {
    g.recordTermClick(id);
    setStack(s => [...s, id]);
  };
  const back = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center" style={{ background: 'rgba(10,14,20,0.62)', backdropFilter: 'blur(3px)' }} onClick={g.closeTermDetail}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`名詞卡：${term.t}`}
        onClick={e => e.stopPropagation()}
        className="w-full md:w-[880px] h-[94dvh] md:h-auto md:max-h-[90vh] rounded-t-[28px] md:rounded-[28px] overflow-hidden flex flex-col shadow-2xl"
        style={{ background: PAPER, color: INK, fontFamily: "'Noto Sans TC', system-ui, sans-serif" }}
      >
        <TermBody key={term.id} term={term} instruments={instruments} canBack={stack.length > 1} onBack={back} onGo={go} onTry={onTry} scrollerRef={scroller} />
      </div>
    </div>
  );
}

function TermBody({
  term, instruments, canBack, onBack, onGo, onTry, scrollerRef,
}: {
  term: FinancialTerm;
  instruments: InstrumentSpec[];
  canBack: boolean;
  onBack: () => void;
  onGo: (id: string) => void;
  onTry?: (t: TryTarget) => void;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const g = useGlossary();
  const { zoom } = useReadingScale();
  const cat = TERM_CATEGORIES[term.c];
  const color = ACCENT[term.c];
  const d = TERM_DETAILS[term.id];
  const learned = g.isTermLearned(term.id);
  const catTerms = useMemo(() => FINANCIAL_TERMS.filter(t => t.c === term.c), [term.c]);
  const catLearned = catTerms.filter(t => g.learnedTermIds.has(t.id)).length;
  const idx = catTerms.findIndex(t => t.id === term.id);
  const prev = idx > 0 ? catTerms[idx - 1] : null;
  const next = idx < catTerms.length - 1 ? catTerms[idx + 1] : null;
  const quiz = useMemo(() => d?.quiz || autoQuiz(term), [d, term]);
  const [pick, setPick] = useState<number | null>(null);
  const [justLearned, setJustLearned] = useState(false);
  const related = useMemo(() => {
    const ids = new Set(term.rel || []);
    // 也收錄「有寫延伸內容」的同類名詞，方便連續學習
    for (const t of catTerms) if (ids.size < 6 && t.id !== term.id && TERM_DETAILS[t.id]) ids.add(t.id);
    return [...ids].map(id => TERMS_BY_ID.get(id)).filter(Boolean) as FinancialTerm[];
  }, [term, catTerms]);

  const answer = (i: number) => {
    if (pick !== null && pick === quiz?.answer) return;
    setPick(i);
    if (quiz && i === quiz.answer && !learned) {
      g.toggleTermLearned(term.id);
      setJustLearned(true);
    }
  };

  let n = 0;
  const num = () => String(++n).padStart(2, '0');

  return (
    <>
      {/* 封面 */}
      <div className={`relative flex-none bg-gradient-to-br ${cat.color} text-white px-5 pt-4 pb-5`}>
        <div className="absolute inset-0 opacity-[0.12] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 85% 20%, #fff 0, transparent 45%), repeating-linear-gradient(135deg, rgba(255,255,255,.5) 0 1px, transparent 1px 14px)' }} />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {canBack && (
              <button type="button" onClick={onBack} aria-label="回上一個名詞" className="w-12 h-12 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 text-[24px]">‹</button>
            )}
            <span className="px-2.5 py-1 rounded-full bg-white/15 text-[16px] font-bold">{cat.icon} {cat.name}</span>
          </div>
          <button type="button" onClick={g.closeTermDetail} aria-label="關閉名詞卡" className="w-12 h-12 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 text-[24px]">✕</button>
        </div>
        <div className="relative mt-4 flex items-end gap-3">
          <span className="text-[52px] leading-none drop-shadow">{cat.icon}</span>
          <div className="min-w-0">
            <h2 className="text-[32px] md:text-[44px] leading-tight font-black tracking-tight" style={{ fontFamily: "'Noto Serif TC', 'Noto Sans TC', serif" }}>{term.t}</h2>
            {term.en && <div className="text-[17px] font-semibold opacity-80" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{term.en}</div>}
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${(catLearned / catTerms.length) * 100}%` }} />
          </div>
          <span className="text-[16px] font-bold whitespace-nowrap">「{cat.badgeName}」{catLearned}/{catTerms.length}</span>
        </div>
        <div className="relative mt-3"><ReadingScaleSwitch tone="dark" /></div>
      </div>

      {/* 內容 */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto overscroll-contain">
      <div className="px-5 sm:px-8 pt-5 pb-8 flex flex-col gap-7" style={{ zoom }}>
        <section>
          <SectionTitle n={num()} color={color}>一句話重點</SectionTitle>
          <p className="text-[22px] leading-[1.7] font-bold" style={{ borderLeft: `4px solid ${color}`, paddingLeft: 12 }}>{term.s}</p>
          {term.aliases && term.aliases.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[16px]" style={{ color: SUB }}>
              也叫：{term.aliases.map(a => <span key={a} className="px-2 py-0.5 rounded-full" style={{ background: '#efe9dc' }}>{a}</span>)}
            </div>
          )}
        </section>

        {d?.plain && (
          <section>
            <SectionTitle n={num()} color={color}>白話解說</SectionTitle>
            <p className="text-[19px] leading-[1.85]">{d.plain}</p>
          </section>
        )}

        {(d?.analogy || d?.example) && (
          <section className="grid gap-2.5">
            <SectionTitle n={num()} color={color}>想像一下</SectionTitle>
            {d.analogy && (
              <div className="rounded-2xl p-4 flex gap-3" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
                <span className="text-[26px]">💡</span>
                <p className="text-[19px] leading-relaxed">{d.analogy}</p>
              </div>
            )}
            {d.example && (
              <div className="rounded-2xl p-4 flex gap-3" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
                <span className="text-[26px]">🧮</span>
                <p className="text-[19px] leading-relaxed">{d.example}</p>
              </div>
            )}
          </section>
        )}

        {d?.calc && (
          <section>
            <SectionTitle n={num()} color={color}>動手算算看</SectionTitle>
            <div className="rounded-2xl p-4" style={{ background: '#f4efe4', border: `1px solid ${LINE}` }}>
              <TermCalculator kind={d.calc} instruments={instruments} />
            </div>
          </section>
        )}

        {d?.myths && d.myths.length > 0 && (
          <section>
            <SectionTitle n={num()} color={color}>常見誤解</SectionTitle>
            <div className="grid gap-2.5">
              {d.myths.map((m, i) => (
                <div key={i} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                  <div className="px-4 py-2.5 text-[18px] flex gap-2" style={{ background: '#fdecee', color: '#8a1c27' }}><b>✗</b><span className="line-through decoration-1">{m.wrong}</span></div>
                  <div className="px-4 py-2.5 text-[18px] flex gap-2 font-semibold" style={{ background: '#fff', color: INK }}><b style={{ color: DOWN }}>✓</b><span>{m.right}</span></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {d?.tip && (
          <section className="rounded-2xl p-4 flex gap-3" style={{ background: INK, color: '#f3efe6' }}>
            <span className="text-[24px]">🎯</span>
            <div>
              <div className="text-[16px] font-black tracking-wider mb-1" style={{ color: '#f5b301' }}>實戰提醒</div>
              <p className="text-[18px] leading-relaxed">{d.tip}</p>
            </div>
          </section>
        )}

        {quiz && (
          <section>
            <SectionTitle n={num()} color={color}>小測驗{learned ? '' : '（答對就收進學習紀錄）'}</SectionTitle>
            <p className="text-[20px] font-bold leading-relaxed mb-3">{quiz.q}</p>
            <div className="grid gap-2" role="radiogroup" aria-label="選項">
              {quiz.options.map((o, i) => {
                const chosen = pick === i;
                const correct = i === quiz.answer;
                const reveal = pick !== null && (chosen || (correct && pick === quiz.answer));
                const bg = reveal ? (correct ? '#e6f5ec' : '#fdecee') : '#fff';
                const bd = reveal ? (correct ? DOWN : UP) : LINE;
                return (
                  <button key={i} type="button" role="radio" aria-checked={chosen} onClick={() => answer(i)}
                    className="text-left rounded-2xl px-4 py-3 text-[18px] leading-relaxed flex gap-3 items-start transition-all active:scale-[0.99]"
                    style={{ background: bg, border: `1.5px solid ${bd}` }}>
                    <span className="flex-none w-6 h-6 rounded-full text-[16px] font-black flex items-center justify-center" style={{ background: reveal ? bd : '#efe9dc', color: reveal ? '#fff' : SUB }}>
                      {reveal ? (correct ? '✓' : '✗') : 'ABCD'[i]}
                    </span>
                    <span>{o}</span>
                  </button>
                );
              })}
            </div>
            {pick !== null && (
              <div className="mt-3 rounded-2xl px-4 py-3 text-[18px] leading-relaxed" style={{ background: pick === quiz.answer ? '#e6f5ec' : '#fff7e6', color: INK }}>
                <b style={{ color: pick === quiz.answer ? DOWN : '#b7791f' }}>{pick === quiz.answer ? (justLearned ? '答對了！已收進你的學習紀錄 🎉 ' : '答對了！') : '再想想，可以重選一次。'}</b>
                {pick === quiz.answer && <span>{quiz.why}</span>}
              </div>
            )}
          </section>
        )}

        {related.length > 0 && (
          <section>
            <SectionTitle n={num()} color={color}>相關名詞</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {related.map(r => (
                <button key={r.id} type="button" onClick={() => onGo(r.id)}
                  className="min-h-[48px] px-4 rounded-full text-[19px] font-bold flex items-center gap-1.5 hover:shadow transition-shadow"
                  style={{ background: '#fff', border: `1px solid ${LINE}`, color: INK }}>
                  {g.isTermLearned(r.id) && <span style={{ color: DOWN }}>✓</span>}{r.t}
                  {TERM_DETAILS[r.id] && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-label="有完整名詞卡" />}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      </div>

      {/* 底部動作列 */}
      <div className="flex-none px-4 pt-3 flex items-center gap-2" style={{ borderTop: `1px solid ${LINE}`, background: PAPER, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" disabled={!prev} onClick={() => prev && onGo(prev.id)} aria-label={prev ? `上一個：${prev.t}` : '沒有上一個'}
          className="w-14 h-14 rounded-full text-[26px] disabled:opacity-30 flex-none" style={{ border: `1px solid ${LINE}` }}>‹</button>
        {d?.tryIt && onTry ? (
          <button type="button" onClick={() => { g.closeTermDetail(); onTry(d.tryIt!); }}
            className="flex-1 min-h-[56px] rounded-full text-[20px] font-black text-white" style={{ background: color }}>
            {TRY_LABEL[d.tryIt]} →
          </button>
        ) : (
          <button type="button" onClick={() => g.toggleTermLearned(term.id)}
            className="flex-1 min-h-[56px] rounded-full text-[20px] font-black"
            style={learned ? { background: '#e6f5ec', color: DOWN } : { background: color, color: '#fff' }}>
            {learned ? '✓ 已學會（點一下取消）' : '我學會了'}
          </button>
        )}
        <button type="button" disabled={!next} onClick={() => next && onGo(next.id)} aria-label={next ? `下一個：${next.t}` : '沒有下一個'}
          className="w-14 h-14 rounded-full text-[26px] disabled:opacity-30 flex-none" style={{ border: `1px solid ${LINE}` }}>›</button>
      </div>
    </>
  );
}
