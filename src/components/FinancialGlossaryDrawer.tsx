import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FINANCIAL_TERMS,
  TERM_CATEGORIES,
  TermCategoryCode,
  FinancialTerm,
  searchFinancialTerms,
} from '../data/financialTerms';
import { TERM_DETAILS } from '../data/termDetails';
import { useGlossary } from '../context/GlossaryContext';
import { Search, X, Check, Award, ChevronRight } from 'lucide-react';
import { ReadingScaleSwitch } from './glossary/ReadingScaleSwitch';
import { useReadingScale } from './glossary/useReadingScale';

/**
 * 名詞小學堂（全螢幕）
 * 字體以長輩也能輕鬆閱讀為準：內文至少 18px，標題 22px 以上，並可切換字級。
 * 點任一張卡片打開完整名詞卡（TermDetailSheet）。
 */
export const FinancialGlossaryDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    activeCategoryFilter,
    setActiveCategoryFilter,
    learnedTermIds,
    toggleTermLearned,
    unlockedBadges,
    totalLearnedCount,
    totalTermsCount,
    openTermDetail,
  } = useGlossary();
  const { zoom } = useReadingScale();

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isDrawerOpen, closeDrawer]);

  const filteredTerms = useMemo(() => {
    const cat = activeCategoryFilter === 'all' ? undefined : activeCategoryFilter;
    return searchFinancialTerms(searchQuery, cat);
  }, [searchQuery, activeCategoryFilter]);

  if (!isDrawerOpen) return null;

  const currentCategoryMeta = activeCategoryFilter !== 'all' ? TERM_CATEGORIES[activeCategoryFilter] : null;
  const pct = Math.round((totalLearnedCount / totalTermsCount) * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col text-slate-900" style={{ background: '#fbf8f2' }} role="dialog" aria-modal="true" aria-label="名詞小學堂">
      {/* 標題列 */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[34px] leading-none">📚</span>
              <div className="min-w-0">
                <h2 className="text-[24px] sm:text-[28px] font-black tracking-tight leading-tight">名詞小學堂</h2>
                <p className="text-[16px] text-amber-100/90">300 個常用金融名詞 · 點任一張卡片看完整說明</p>
              </div>
            </div>
            <button type="button" onClick={closeDrawer} aria-label="關閉名詞小學堂"
              className="shrink-0 min-h-[48px] px-4 rounded-full bg-white/15 hover:bg-white/25 text-white text-[17px] font-black flex items-center gap-1.5">
              <X className="w-6 h-6" /> <span className="hidden sm:inline">關閉</span>
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Award className="w-7 h-7 text-amber-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-bold">
                  已學會 <span className="font-black text-amber-300 text-[20px]">{totalLearnedCount}</span> / {totalTermsCount}（{pct}%）
                  {unlockedBadges.length > 0 && <span className="text-amber-200"> · 徽章 {unlockedBadges.length} 枚</span>}
                </div>
                <div className="mt-1.5 h-2.5 w-full max-w-[420px] rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full bg-amber-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
            <ReadingScaleSwitch tone="dark" />
          </div>
        </div>
      </div>

      {/* 搜尋與分類 */}
      <div className="shrink-0 border-b border-[#e6dfd1]" style={{ background: '#f4efe4' }}>
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-3 flex flex-col gap-3" style={{ zoom }}>
          <div className="relative">
            <Search className="w-6 h-6 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋名詞（例如：除息、融資、ROD、大台）"
              aria-label="搜尋名詞"
              className="w-full pl-13 pr-12 min-h-[56px] rounded-2xl border-2 border-[#d9d0bd] bg-white text-slate-900 text-[19px] font-bold focus:border-amber-500 focus:outline-none"
              style={{ paddingLeft: 52 }}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="清除搜尋"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100">
                <X className="w-6 h-6" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="名詞分類">
            <CatChip active={activeCategoryFilter === 'all'} onClick={() => setActiveCategoryFilter('all')} icon="🌐" name="全部" count={`${FINANCIAL_TERMS.length}`} />
            {(Object.keys(TERM_CATEGORIES) as TermCategoryCode[]).map(catKey => {
              const meta = TERM_CATEGORIES[catKey];
              const catTerms = FINANCIAL_TERMS.filter(t => t.c === catKey);
              const learned = catTerms.filter(t => learnedTermIds.has(t.id)).length;
              return (
                <CatChip key={catKey} active={activeCategoryFilter === catKey} onClick={() => setActiveCategoryFilter(catKey)}
                  icon={meta.icon} name={meta.name} count={`${learned}/${catTerms.length}`} done={learned === catTerms.length} />
              );
            })}
          </div>
        </div>
      </div>

      {/* 名詞清單 */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4" style={{ zoom }}>
          <div className="text-[17px] text-slate-700 font-bold">
            {currentCategoryMeta ? `${currentCategoryMeta.icon} ${currentCategoryMeta.name}：${currentCategoryMeta.description}` : `共 ${filteredTerms.length} 個名詞`}
            {searchQuery && `（搜尋「${searchQuery}」找到 ${filteredTerms.length} 個）`}
          </div>

          {filteredTerms.length === 0 ? (
            <div className="text-center py-14 rounded-3xl border-2 border-dashed border-[#d9d0bd] flex flex-col items-center gap-3">
              <span className="text-[44px]">🔍</span>
              <div className="text-[22px] font-black">查不到這個名詞</div>
              <div className="text-[18px] text-slate-600">換個關鍵字，或切換上面的分類看看</div>
              <button type="button" onClick={() => { setSearchQuery(''); setActiveCategoryFilter('all'); }}
                className="min-h-[52px] px-6 rounded-full bg-slate-900 text-white text-[18px] font-black">重新搜尋</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTerms.map(item => (
                <TermRow key={item.id} item={item} learned={learnedTermIds.has(item.id)} query={searchQuery}
                  onOpen={() => openTermDetail(item.id)} onToggle={() => toggleTermLearned(item.id)} />
              ))}
            </div>
          )}

          <p className="text-[16px] text-slate-600 leading-relaxed pt-2">
            ⚠️ 名詞說明僅供教育用途，不是投資建議；本系統為模擬交易，僅供教學演練。
          </p>
        </div>
      </div>
    </div>
  );
};

function CatChip({ active, onClick, icon, name, count, done }: { active: boolean; onClick: () => void; icon: string; name: string; count: string; done?: boolean }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`shrink-0 min-h-[48px] px-4 rounded-full text-[18px] font-black flex items-center gap-2 border-2 transition ${
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-[#d9d0bd] hover:border-amber-500'
      }`}>
      <span>{icon}</span>
      <span>{name}</span>
      <span className={`text-[15px] font-bold ${active ? 'text-amber-300' : done ? 'text-emerald-700' : 'text-slate-500'}`}>{count}</span>
    </button>
  );
}

function TermRow({ item, learned, query, onOpen, onToggle }: { item: FinancialTerm; learned: boolean; query: string; onOpen: () => void; onToggle: () => void }) {
  const cat = TERM_CATEGORIES[item.c];
  const rich = Boolean(TERM_DETAILS[item.id]);
  const matchedAlias = query ? item.aliases?.find(a => a.toLowerCase().includes(query.trim().toLowerCase())) : null;
  return (
    <div className={`rounded-3xl border-2 bg-white flex flex-col transition hover:shadow-lg ${learned ? 'border-emerald-300' : 'border-[#e6dfd1] hover:border-amber-400'}`}>
      <button type="button" onClick={onOpen} className="text-left p-5 pb-3 flex flex-col gap-2.5 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[26px] leading-none">{cat.icon}</span>
          <span className="text-[23px] font-black leading-snug text-slate-900">{item.t}</span>
          {item.en && <span className="text-[15px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold font-mono">{item.en}</span>}
        </div>
        {matchedAlias && <span className="self-start text-[15px] px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-bold">別名：{matchedAlias}</span>}
        <p className="text-[19px] leading-[1.7] text-slate-800">{item.s}</p>
      </button>
      <div className="px-5 pb-4 pt-2 flex items-center justify-between gap-2 border-t border-[#efe9dc]">
        <button type="button" onClick={onToggle} aria-pressed={learned}
          className={`min-h-[44px] px-3.5 rounded-full text-[16px] font-black flex items-center gap-1.5 border-2 ${learned ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-[#d9d0bd]'}`}>
          <Check className="w-5 h-5" /> {learned ? '已學會' : '標記學會'}
        </button>
        <button type="button" onClick={onOpen}
          className="min-h-[44px] px-4 rounded-full text-[17px] font-black flex items-center gap-1 bg-amber-100 text-amber-900 hover:bg-amber-200">
          {rich ? '完整名詞卡' : '詳情'} <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
