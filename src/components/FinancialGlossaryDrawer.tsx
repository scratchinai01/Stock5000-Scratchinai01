import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FINANCIAL_TERMS,
  TERM_CATEGORIES,
  TermCategoryCode,
  FinancialTerm,
  searchFinancialTerms,
  TERMS_BY_ID,
} from '../data/financialTerms';
import { useGlossary } from '../context/GlossaryContext';
import {
  Search,
  X,
  BookOpen,
  Check,
  CheckCircle2,
  Award,
  Sparkles,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  RotateCcw,
  Compass,
} from 'lucide-react';

export const FinancialGlossaryDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    activeDrawerTermId,
    activeCategoryFilter,
    setActiveCategoryFilter,
    learnedTermIds,
    toggleTermLearned,
    markTermAsRead,
    unlockedBadges,
    totalLearnedCount,
    totalTermsCount, openTermDetail } = useGlossary();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<FinancialTerm | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // If opened with a specific termId, select it
  useEffect(() => {
    if (activeDrawerTermId) {
      const found = TERMS_BY_ID.get(activeDrawerTermId.toLowerCase());
      if (found) {
        setSelectedTerm(found);
      }
    }
  }, [activeDrawerTermId]);

  // Focus search input when drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [isDrawerOpen]);

  // Filtered terms list
  const filteredTerms = useMemo(() => {
    const cat = activeCategoryFilter === 'all' ? undefined : activeCategoryFilter;
    return searchFinancialTerms(searchQuery, cat);
  }, [searchQuery, activeCategoryFilter]);

  if (!isDrawerOpen) return null;

  const currentCategoryMeta =
    activeCategoryFilter !== 'all' ? TERM_CATEGORIES[activeCategoryFilter] : null;

  const handleSelectTerm = (term: FinancialTerm) => {
    setSelectedTerm(term);
    openTermDetail(term.id);
  };

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget) closeDrawer();
      }}
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-200 text-slate-900"
    >
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-250 border-l border-slate-200">
        {/* Drawer Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white p-5 shrink-0 border-b border-amber-500/30">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl border border-amber-400/30 shadow-inner">
                📚
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white tracking-tight">
                    5000萬股市大富翁 · 名詞小學堂
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 border border-amber-300">
                    300 核心詞庫
                  </span>
                </div>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  全市場名詞一句話精解 · 支援別名搜尋 · 零 AI 耗費秒速掌握
                </p>
              </div>
            </div>

            <button
              onClick={closeDrawer}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Gamification Progress & Badges Bar */}
          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200">學習探索進度：</span>
                  <span className="font-mono font-black text-amber-300">
                    {totalLearnedCount} / {totalTermsCount}
                  </span>
                  <span className="text-[10px] text-slate-300">
                    ({Math.round((totalLearnedCount / totalTermsCount) * 100)}%)
                  </span>
                </div>
                <span className="text-[11px] text-amber-200/70 block">
                  {unlockedBadges.length > 0
                    ? `已成功解鎖 ${unlockedBadges.length} 個知識榮譽徽章！`
                    : '點擊詞彙或勾選即可累積掌握進度，解鎖分類徽章！'}
                </span>
              </div>
            </div>

            {/* Badges showcase pills */}
            {unlockedBadges.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {unlockedBadges.slice(0, 3).map((b, i) => (
                  <span
                    key={`unlocked-badge-${b.code}-${i}`}
                    title={`${b.title}: ${b.description}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-[10px] font-black text-amber-200"
                  >
                    <span>{b.icon}</span>
                    <span className="truncate max-w-[80px]">{b.title.split('·')[1] || b.title}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search Bar & Category Scroller */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋名詞、英文縮寫或別名（例如：除息、融資、PE、ROD、大台）..."
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Categories Horizontal Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-black shrink-0 transition cursor-pointer text-xs flex items-center gap-1 border ${
                activeCategoryFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
              }`}
            >
              <span>🌐 全部</span>
              <span className="text-[10px] opacity-80">({FINANCIAL_TERMS.length})</span>
            </button>

            {(Object.keys(TERM_CATEGORIES) as TermCategoryCode[]).map(catKey => {
              const meta = TERM_CATEGORIES[catKey];
              const isActive = activeCategoryFilter === catKey;
              const catTerms = FINANCIAL_TERMS.filter(t => t.c === catKey);
              const learnedInCat = catTerms.filter(t => learnedTermIds.has(t.id));

              return (
                <button
                  key={`cat-pill-${catKey}`}
                  type="button"
                  onClick={() => setActiveCategoryFilter(catKey)}
                  className={`px-2.5 py-1.5 rounded-xl font-bold shrink-0 transition cursor-pointer text-xs flex items-center gap-1 border ${
                    isActive
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-amber-50 border-slate-200'
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.name}</span>
                  <span
                    className={`text-[10px] px-1 rounded-full ${
                      learnedInCat.length === catTerms.length
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {learnedInCat.length}/{catTerms.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Body: Split View or Cards */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Active Term Focus Detail Card (長模式) */}
          {selectedTerm && (
            <div className="bg-gradient-to-br from-amber-50/80 via-white to-orange-50/50 border-2 border-amber-300 rounded-3xl p-5 shadow-md relative animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setSelectedTerm(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{TERM_CATEGORIES[selectedTerm.c].icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-black text-slate-900">{selectedTerm.t}</h4>
                    {selectedTerm.en && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-mono font-black border border-amber-300">
                        {selectedTerm.en}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-amber-800 font-bold">
                    分類：{TERM_CATEGORIES[selectedTerm.c].name}
                  </span>
                </div>
              </div>

              {/* Core Definition */}
              <div className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-2xs my-3">
                <span className="text-[11px] font-black text-amber-800 block mb-1 uppercase tracking-wider">
                  💡 一句話核心定義
                </span>
                <p className="text-sm font-bold text-slate-900 leading-relaxed">{selectedTerm.s}</p>
              </div>

              {/* Aliases & Search Keywords if any */}
              {selectedTerm.aliases && selectedTerm.aliases.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] text-slate-500 font-bold block mb-1">同義詞 / 常見別稱：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTerm.aliases.map((a, i) => (
                      <span
                        key={`alias-${i}`}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Terms Jumping */}
              {selectedTerm.rel && selectedTerm.rel.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] text-slate-500 font-bold block mb-1">🔗 關聯關鍵詞推薦：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTerm.rel.map(relId => {
                      const relTerm = TERMS_BY_ID.get(relId.toLowerCase());
                      if (!relTerm) return null;
                      return (
                        <button
                          key={`rel-jump-${relId}`}
                          type="button"
                          onClick={() => handleSelectTerm(relTerm)}
                          className="px-2.5 py-1 rounded-xl bg-amber-100/70 hover:bg-amber-200 text-amber-950 font-bold text-xs border border-amber-300/80 flex items-center gap-1 cursor-pointer transition"
                        >
                          <span>{relTerm.t}</span>
                          <ChevronRight className="w-3 h-3 text-amber-700" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mark as Learned Toggle */}
              <div className="pt-2 flex items-center justify-between border-t border-amber-200/60">
                <button
                  type="button"
                  onClick={() => toggleTermLearned(selectedTerm.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border ${
                    learnedTermIds.has(selectedTerm.id)
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {learnedTermIds.has(selectedTerm.id) ? '已掌握此概念 ✓' : '點此標記為已學會'}
                  </span>
                </button>

                <span className="text-[10px] text-slate-400">
                  ID: {selectedTerm.id}
                </span>
              </div>
            </div>
          )}

          {/* Section Heading & Result count */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span className="font-bold">
              {currentCategoryMeta ? (
                <span className="flex items-center gap-1">
                  <span>{currentCategoryMeta.icon}</span>
                  <span className="text-slate-900 font-black">{currentCategoryMeta.name}</span>
                  <span>({filteredTerms.length} 詞)</span>
                </span>
              ) : (
                <span>
                  共篩選出 <strong className="text-slate-900">{filteredTerms.length}</strong> 個名詞
                </span>
              )}
            </span>
            <span className="text-[11px] text-slate-500">點擊任一張卡片展開詳細說明</span>
          </div>

          {/* Terms Grid / List */}
          {filteredTerms.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
              <span className="text-3xl">🔍</span>
              <h5 className="font-black text-slate-800 text-sm">查無符合的名詞</h5>
              <p className="text-xs text-slate-500">
                請嘗試輸入其他關鍵字，或切換上方分類標籤檢視
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategoryFilter('all');
                }}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold"
              >
                重設搜尋
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredTerms.map((item, idx) => {
                const isSelected = selectedTerm?.id === item.id;
                const isLearned = learnedTermIds.has(item.id);
                const cat = TERM_CATEGORIES[item.c];

                // Check if query matched alias
                const matchedAlias = searchQuery
                  ? item.aliases?.find(a =>
                      a.toLowerCase().includes(searchQuery.trim().toLowerCase())
                    )
                  : null;

                return (
                  <div
                    key={`term-card-${item.id}-${idx}`}
                    onClick={() => handleSelectTerm(item)}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-300'
                        : isLearned
                        ? 'bg-slate-50/60 hover:bg-amber-50/50 border-slate-200'
                        : 'bg-white hover:bg-slate-50 border-slate-200 shadow-2xs hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{cat.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-900 text-sm">{item.t}</span>
                            {item.en && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono font-bold">
                                {item.en}
                              </span>
                            )}
                            {matchedAlias && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold">
                                包含別稱：{matchedAlias}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleTermLearned(item.id);
                          }}
                          title={isLearned ? '已掌握此名詞' : '標記為已學會'}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${
                            isLearned
                              ? 'bg-emerald-500 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Short Answer */}
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {item.s}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>{cat.name}</span>
                      <span className="text-amber-700 font-bold hover:underline flex items-center gap-0.5">
                        <span>詳情</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer with Required Legal/Educational Disclaimer */}
        <div className="bg-slate-100 border-t border-slate-200 p-3.5 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="text-[11px] text-slate-500 font-medium">
            ⚠️ 免責聲明：名詞解釋僅供教育用途，非投資建議。盤中零股採即時撮合，模擬交易僅供教學實戰演練。
          </p>
          <button
            type="button"
            onClick={closeDrawer}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shrink-0 cursor-pointer"
          >
            關閉小學堂
          </button>
        </div>
      </div>
    </div>
  );
};
