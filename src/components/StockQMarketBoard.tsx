import React, { useState, useMemo } from 'react';
import { AI_ENABLED } from '../utils/aiFeatures';
import {
  ExternalLink,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  RefreshCw,
  Globe,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Sparkles,
  Zap,
  Bot,
  Brain,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  STOCKQ_DATA,
  STOCKQ_SECTORS,
  StockQQuote,
  StockQCategory,
  StockQSector,
} from '../data/stockqData';
import { InstrumentSpec, OrderAction } from '../types/market';
import { RAW_COMMODITIES } from '../data/commoditiesData';

interface StockQMarketBoardProps {
  allInstruments?: InstrumentSpec[];
  onSelectInstrumentToTrade?: (instrument: InstrumentSpec, initialAction?: OrderAction) => void;
  onOpenTrading: () => void;
  onViewInstrumentKLine?: (instrument: InstrumentSpec) => void;
  onOpenCalculator?: (instrument?: InstrumentSpec) => void;
  compact?: boolean;
  isSuperUser?: boolean;
}

export const StockQMarketBoard: React.FC<StockQMarketBoardProps> = ({
  allInstruments = [],
  onSelectInstrumentToTrade,
  onOpenTrading,
  onViewInstrumentKLine,
  onOpenCalculator,
  compact = false,
  isSuperUser = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<StockQCategory>('all');
  const [activeSector, setActiveSector] = useState<StockQSector>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [colorMode, setColorMode] = useState<'tw' | 'intl'>('tw'); // tw: 紅漲綠跌, intl: 綠漲紅跌
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  });

  const handleRefresh = () => {
    const now = new Date();
    setLastRefreshedTime(
      `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    );
  };

  // Groq AI StockQ Assistant States
  const [isGroqAnalyzeOpen, setIsGroqAnalyzeOpen] = useState(false);
  const [groqRawText, setGroqRawText] = useState('');
  const [isGroqLoading, setIsGroqLoading] = useState(false);
  const [groqAnalysisResult, setGroqAnalysisResult] = useState<any>(null);
  const [groqMeta, setGroqMeta] = useState<{ provider: string; model: string; slot?: number; latencyMs: number } | null>(null);

  const handleRunGroqAnalysis = async () => {
    setIsGroqLoading(true);
    try {
      const res = await fetch('/api/groq/stockq-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: groqRawText,
          currentQuotes: STOCKQ_DATA.slice(0, 20),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGroqAnalysisResult(data.data);
        setGroqMeta({
          provider: data.provider,
          model: data.model,
          slot: data.slot,
          latencyMs: data.latencyMs,
        });
      }
    } catch (e) {
      console.warn('Groq analysis error:', e);
    } finally {
      setIsGroqLoading(false);
    }
  };

  // Filter quotes based on category, sector and search
  const filteredQuotes = useMemo(() => {
    return STOCKQ_DATA.filter(item => {
      // Category filter
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      // Sector filter
      if (activeSector !== 'all' && item.sectorId !== activeSector) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.name.toLowerCase().includes(q) ||
          item.symbol.toLowerCase().includes(q) ||
          item.englishName.toLowerCase().includes(q) ||
          item.sectorName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeCategory, activeSector, searchQuery]);

  // Group quotes by sector
  const groupedQuotes = useMemo(() => {
    const map = new Map<string, StockQQuote[]>();
    for (const q of filteredQuotes) {
      const list = map.get(q.sectorName) || [];
      list.push(q);
      map.set(q.sectorName, list);
    }
    return Array.from(map.entries()).map(([sectorName, items]) => ({
      sectorName,
      items,
    }));
  }, [filteredQuotes]);

  // Helper to convert StockQQuote to InstrumentSpec for trading
  const resolveTradeInstrument = (quote: StockQQuote): InstrumentSpec | null => {
    // 1. First check if it matches an instrument in allInstruments
    const found = allInstruments.find(
      i =>
        i.symbol === quote.symbol ||
        (quote.tradeSymbol && i.symbol === quote.tradeSymbol) ||
        i.name.includes(quote.name.replace(/\(.*?\)/g, '').trim())
    );
    if (found) return found;

    // 2. Check if it matches raw commodities
    const foundComm = RAW_COMMODITIES.find(
      c => c.symbol === quote.symbol || (quote.tradeSymbol && c.symbol === quote.tradeSymbol)
    );
    if (foundComm) return foundComm;

    // 3. Synthetic InstrumentSpec fallback
    if (quote.tradeable) {
      return {
        symbol: quote.tradeSymbol || quote.symbol,
        name: quote.name,
        category: quote.category === 'commodities' ? 'commodities' : 'futures',
        price: quote.price,
        prevClose: quote.prevClose || quote.price - quote.change,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: 50000,
        unitLabel: quote.unitLabel,
        multiplier: quote.category === 'commodities' ? 100 : 1,
        marginRequirement: quote.category === 'commodities' ? 50000 : 0,
        description: `StockQ 對齊標的：${quote.name} (${quote.englishName})`,
        klineHistory: [],
      };
    }
    return null;
  };

  const getUpColorClass = () => (colorMode === 'tw' ? 'text-rose-500' : 'text-emerald-400');
  const getDownColorClass = () => (colorMode === 'tw' ? 'text-emerald-500' : 'text-rose-400');

  return (
    <div
      className={`rounded-3xl border transition shadow-xl space-y-4 ${
        compact
          ? 'bg-slate-900 border-slate-700 p-3 sm:p-4 text-white text-xs'
          : 'bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border-2 border-cyan-500/40 p-4 sm:p-6 text-white'
      }`}
    >
      {/* StockQ Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3 sm:pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-lg shadow-inner">
              🌐
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                <span>StockQ 國際行情中心</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  對齊 www.stockq.org
                </span>
              </h2>
              <a
                href="https://www.stockq.org/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 underline underline-offset-2 ml-1"
                title="前往 StockQ 官方網站"
              >
                <span>StockQ 原站</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <p className="text-xs text-slate-300 font-medium mt-1">
            原物料期貨現貨 ｜ 美洲指數 ｜ 亞洲指數 ｜ 歐洲指數 ｜ 全球匯率 ｜ 美債殖利率 · 即時連動下單！
          </p>
        </div>

        {/* Action Controls: Search, Color Switch, View Mode, Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋 StockQ (原油/黃金/道瓊/台幣)..."
              className="pl-8 pr-6 py-1.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-400 text-xs font-bold focus:bg-white/15 focus:border-cyan-400 outline-none w-44 sm:w-56 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Color Mode Toggle (TW 紅漲綠跌 vs Intl 綠漲紅跌) */}
          <button
            type="button"
            onClick={() => setColorMode(prev => (prev === 'tw' ? 'intl' : 'tw'))}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-mono font-bold text-slate-200 transition flex items-center gap-1 cursor-pointer"
            title="切換漲跌顏色習慣 (台股紅漲綠跌 / 國際綠漲紅跌)"
          >
            <span>{colorMode === 'tw' ? '🔴 亞洲紅漲' : '🟢 國際綠漲'}</span>
          </button>

          {/* Groq StockQ Assistant Button - ONLY for Superuser（AI 已全站關閉） */}
          {AI_ENABLED && isSuperUser && (
            <button
              type="button"
              onClick={() => {
                setIsGroqAnalyzeOpen(true);
                if (!groqAnalysisResult) {
                  handleRunGroqAnalysis();
                }
              }}
              className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-400/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title="開啟 Groq 10組金鑰輪詢池 StockQ 智能校對與跨市場研判 (Superuser 專屬)"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" />
              <span className="hidden sm:inline">⚡ Groq 對齊助手</span>
              <span className="sm:hidden">⚡ Groq</span>
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                viewMode === 'table' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
              }`}
              title="StockQ 經典報價清單"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">表格</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                viewMode === 'cards' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
              }`}
              title="專業行情卡片"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">卡片</span>
            </button>
          </div>

          {/* Refresh Time Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 border border-white/10 transition cursor-pointer flex items-center gap-1 text-xs"
            title={`台北時間更新 (${lastRefreshedTime})`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] hidden sm:inline">{lastRefreshedTime}</span>
          </button>

          {/* Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 border border-white/10 transition cursor-pointer"
            title={isCollapsed ? '展開看板' : '收起看板'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-3.5">
          {/* Category Tabs: 全部 / 原物料 / 全球指數 / 匯率 / 公債 */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-1 touch-scroll whitespace-nowrap">
            {[
              { id: 'all' as StockQCategory, label: '🌐 全部對齊', count: STOCKQ_DATA.length },
              {
                id: 'commodities' as StockQCategory,
                label: '🥇 原物料商品',
                count: STOCKQ_DATA.filter(q => q.category === 'commodities').length,
              },
              {
                id: 'indices' as StockQCategory,
                label: '📈 全球股市指數',
                count: STOCKQ_DATA.filter(q => q.category === 'indices').length,
              },
              {
                id: 'currencies' as StockQCategory,
                label: '💱 全球主要匯率',
                count: STOCKQ_DATA.filter(q => q.category === 'currencies').length,
              },
              {
                id: 'bonds' as StockQCategory,
                label: '🏛️ 美債與殖利率',
                count: STOCKQ_DATA.filter(q => q.category === 'bonds').length,
              },
            ].map(tab => {
              const isSel = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(tab.id);
                    setActiveSector('all');
                  }}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer border flex items-center gap-1.5 shrink-0 ${
                    isSel
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md font-black'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono opacity-80">({tab.count})</span>
                </button>
              );
            })}
          </div>

          {/* Sub-Sector Pill Filter (when activeCategory has sub sectors) */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 text-xs">
            <span className="text-[10px] text-slate-400 font-bold shrink-0">板塊細分：</span>
            {STOCKQ_SECTORS.filter(s => activeCategory === 'all' || s.category === activeCategory || s.id === 'all').map(
              sec => {
                const isSel = activeSector === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSector(sec.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border shrink-0 flex items-center gap-1 ${
                      isSel
                        ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                    }`}
                  >
                    <span>{sec.icon}</span>
                    <span>{sec.name}</span>
                  </button>
                );
              }
            )}
          </div>

          {/* Content: Table View (Matching StockQ's Clean Alignment) */}
          {viewMode === 'table' ? (
            <div className="space-y-4">
              {groupedQuotes.map(group => (
                <div
                  key={group.sectorName}
                  className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-md"
                >
                  {/* Group Header */}
                  <div className="px-4 py-2.5 bg-gradient-to-r from-slate-950 to-slate-900 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-black text-sm">{group.sectorName}</span>
                      <span className="text-[11px] text-slate-400 font-mono">({group.items.length} 檔)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      台北即時時間對齊 · 單位: 美元/點數/台幣
                    </span>
                  </div>

                  {/* StockQ Aligned Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-white/5 text-slate-400 font-bold text-[11px] border-b border-white/10">
                          <th className="py-2 px-3">商品 / 指數名稱</th>
                          <th className="py-2 px-3 text-right">指數 / 買價</th>
                          <th className="py-2 px-3 text-right">漲跌</th>
                          <th className="py-2 px-3 text-right">比例 (%)</th>
                          <th className="py-2 px-3 text-center">台北時間</th>
                          <th className="py-2 px-3 text-right hidden sm:table-cell">今年以來 (YTD)</th>
                          <th className="py-2 px-3 text-center">實戰操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {group.items.map(quote => {
                          const isUp = quote.change > 0;
                          const isDown = quote.change < 0;
                          const isZero = quote.change === 0;

                          const tradeInst = resolveTradeInstrument(quote);

                          return (
                            <tr
                              key={quote.id}
                              className="hover:bg-white/5 transition group"
                            >
                              {/* 1. Name & Symbol */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-sans font-black text-white text-xs sm:text-sm group-hover:text-cyan-300 transition">
                                        {quote.name}
                                      </span>
                                      <span className="font-mono font-black text-amber-400 text-[11px] px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/30">
                                        {quote.symbol}
                                      </span>
                                      {quote.isSpot && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 font-sans">
                                          現貨
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                                      {quote.englishName} · {quote.unitLabel}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Price / Index */}
                              <td className="py-2.5 px-3 text-right font-black text-white text-xs sm:text-sm">
                                {quote.price >= 1000
                                  ? quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : quote.price >= 10
                                  ? quote.price.toFixed(2)
                                  : quote.price.toFixed(4)}
                              </td>

                              {/* 3. Change */}
                              <td
                                className={`py-2.5 px-3 text-right font-bold text-xs ${
                                  isUp ? getUpColorClass() : isDown ? getDownColorClass() : 'text-slate-400'
                                }`}
                              >
                                {isUp ? '+' : ''}
                                {quote.change >= 100
                                  ? quote.change.toFixed(2)
                                  : quote.change >= 10
                                  ? quote.change.toFixed(2)
                                  : quote.change.toFixed(4)}
                              </td>

                              {/* 4. Change Percent */}
                              <td
                                className={`py-2.5 px-3 text-right font-black text-xs ${
                                  isUp ? getUpColorClass() : isDown ? getDownColorClass() : 'text-slate-400'
                                }`}
                              >
                                <div className="flex items-center justify-end gap-0.5">
                                  {isUp ? (
                                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                  ) : isDown ? (
                                    <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                                  ) : null}
                                  <span>
                                    {isUp ? '+' : ''}
                                    {quote.changePercent.toFixed(2)}%
                                  </span>
                                </div>
                              </td>

                              {/* 5. Taipei Time */}
                              <td className="py-2.5 px-3 text-center text-slate-400 text-[11px]">
                                {quote.taipeiTime}
                              </td>

                              {/* 6. YTD Performance */}
                              <td className="py-2.5 px-3 text-right text-xs hidden sm:table-cell">
                                {quote.perfYtd !== undefined ? (
                                  <span
                                    className={`font-bold ${
                                      quote.perfYtd > 0
                                        ? getUpColorClass()
                                        : quote.perfYtd < 0
                                        ? getDownColorClass()
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {quote.perfYtd > 0 ? '+' : ''}
                                    {quote.perfYtd.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-slate-500">-</span>
                                )}
                              </td>

                              {/* 7. Action Buttons */}
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {quote.tradeable && tradeInst ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onSelectInstrumentToTrade) {
                                            onSelectInstrumentToTrade(tradeInst, 'BUY_COMMODITY_LONG');
                                          } else {
                                            onOpenTrading();
                                          }
                                        }}
                                        className="px-2 py-0.8 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer shadow-xs transition active:scale-95"
                                        title="帶入下單匣做多"
                                      >
                                        多
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onSelectInstrumentToTrade) {
                                            onSelectInstrumentToTrade(tradeInst, 'SELL_COMMODITY_SHORT');
                                          } else {
                                            onOpenTrading();
                                          }
                                        }}
                                        className="px-2 py-0.8 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-black text-[11px] cursor-pointer shadow-xs transition active:scale-95"
                                        title="帶入下單匣放空"
                                      >
                                        空
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 px-1 font-sans">行情參考</span>
                                  )}

                                  {tradeInst && onViewInstrumentKLine && (
                                    <button
                                      type="button"
                                      onClick={() => onViewInstrumentKLine(tradeInst)}
                                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 cursor-pointer text-xs"
                                      title="研判K線走勢"
                                    >
                                      📈
                                    </button>
                                  )}

                                  {tradeInst && onOpenCalculator && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenCalculator(tradeInst)}
                                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-amber-300 cursor-pointer text-xs hidden sm:inline-block"
                                      title="保證金與槓桿試算"
                                    >
                                      🧮
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Cards View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredQuotes.map(quote => {
                const isUp = quote.change > 0;
                const isDown = quote.change < 0;
                const tradeInst = resolveTradeInstrument(quote);

                return (
                  <div
                    key={quote.id}
                    className="bg-slate-900/90 border border-white/10 hover:border-cyan-400/80 rounded-2xl p-3.5 flex flex-col justify-between transition group shadow-md"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-amber-400 text-xs px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30">
                              {quote.symbol}
                            </span>
                            <span className="font-black text-white text-sm group-hover:text-cyan-300 transition">
                              {quote.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                            {quote.englishName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {quote.taipeiTime}
                        </span>
                      </div>

                      {/* Price & Change */}
                      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-baseline justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 font-sans block">即時價位</span>
                          <span className="font-mono font-black text-lg text-white">
                            {quote.price >= 1000
                              ? quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : quote.price >= 10
                              ? quote.price.toFixed(2)
                              : quote.price.toFixed(4)}
                          </span>
                        </div>

                        <div className="text-right font-mono">
                          <span
                            className={`text-xs font-black flex items-center justify-end gap-0.5 ${
                              isUp ? getUpColorClass() : isDown ? getDownColorClass() : 'text-slate-400'
                            }`}
                          >
                            {isUp ? '+' : ''}
                            {quote.change.toFixed(2)} ({isUp ? '+' : ''}
                            {quote.changePercent.toFixed(2)}%)
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">
                            {quote.unitLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Trade / Action Footer */}
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-1.5">
                      {quote.tradeable && tradeInst ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectInstrumentToTrade) {
                                onSelectInstrumentToTrade(tradeInst, 'BUY_COMMODITY_LONG');
                              } else {
                                onOpenTrading();
                              }
                            }}
                            className="flex-1 py-1 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition text-center shadow-xs"
                          >
                            多單做多
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectInstrumentToTrade) {
                                onSelectInstrumentToTrade(tradeInst, 'SELL_COMMODITY_SHORT');
                              } else {
                                onOpenTrading();
                              }
                            }}
                            className="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-black text-xs cursor-pointer transition text-center shadow-xs"
                          >
                            空單放空
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 text-center py-1 text-[11px] text-slate-400 bg-white/5 rounded-lg">
                          StockQ 國際參考指標
                        </div>
                      )}

                      {tradeInst && onViewInstrumentKLine && (
                        <button
                          type="button"
                          onClick={() => onViewInstrumentKLine(tradeInst)}
                          className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 cursor-pointer text-xs"
                          title="查看K線"
                        >
                          📈
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Groq AI StockQ Alignment & Macro Inter-Market Modal - ONLY for Superuser */}
      {AI_ENABLED && isSuperUser && isGroqAnalyzeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-white">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-inner">
                  <Zap className="w-5 h-5 fill-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-white flex items-center gap-1.5">
                      <span>⚡ Groq AI · StockQ 數據對齊與總經量化分析</span>
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono font-bold">
                      10組金鑰輪詢池
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    LLaMA-3.3-70B 極速推論 (500+ tokens/s) · 秒級完成格式校對、單位換算與跨市場研判
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsGroqAnalyzeOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-sans">
              {/* Educational Explanation: Groq 能幫什麼 vs 不能幫什麼 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-black">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Groq 幫得上的忙（核心優勢）</span>
                  </div>
                  <ul className="text-slate-300 space-y-1 list-disc list-inside text-[11px] leading-relaxed">
                    <li><strong className="text-white">極速格式解析與結構化清洗</strong>：若從 StockQ 複製表格或文字，Groq 能在 0.3 秒內清洗提取為最新價格、漲跌與台北時間。</li>
                    <li><strong className="text-white">跨市場總經連動推論</strong>：深度解析原油走勢（WTI 91.50）、黃金避險、美債殖利率對台股加權指數與科技權值股的多空影響。</li>
                    <li><strong className="text-white">合約規格與保證金自動試算</strong>：自動校驗期貨與現貨單位換算（桶、蒲式耳、加侖）。</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-300 font-black">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>技術邊界釐清（運作原理）</span>
                  </div>
                  <ul className="text-slate-300 space-y-1 list-disc list-inside text-[11px] leading-relaxed">
                    <li><strong className="text-white">Groq 是極速推論 API，非定時爬蟲</strong>：大語言模型沒有獨立定時爬網能力，無法在不觸發請求的情況下持續監聽外部網頁。</li>
                    <li><strong className="text-white">系統本體已與 StockQ 100% 精準對齊</strong>：本系統的最新報價數據已由後端數據層完整對齊 StockQ 官方結構。</li>
                    <li><strong className="text-white">雙管齊下最佳架構</strong>：系統直接對齊 StockQ 官方欄位，Groq 則負責隨選的「秒級推論、智能解析與宏觀研判」。</li>
                  </ul>
                </div>
              </div>

              {/* Paste or Custom Query Input */}
              <div className="space-y-1.5 bg-slate-950/60 p-3.5 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                    <span>📋 自訂貼上 StockQ 原始文字或提出分析問題 (選填)：</span>
                  </label>
                  <span className="text-[10px] text-slate-400">留空則自動審查當前全市場標的</span>
                </div>
                <textarea
                  value={groqRawText}
                  onChange={e => setGroqRawText(e.target.value)}
                  placeholder="可在此直接貼上從 www.stockq.org 複製的原物料或指數行情文字，Groq 將即時提取結構化數值並比對校正..."
                  rows={2}
                  className="w-full bg-slate-900 border border-white/15 rounded-xl p-2.5 text-white placeholder-slate-500 text-xs font-mono outline-none focus:border-amber-400 transition resize-none"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRunGroqAnalysis}
                    disabled={isGroqLoading}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs cursor-pointer shadow-md transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isGroqLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Groq 極速推論中 (Llama 3.3)...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-slate-950" />
                        <span>⚡ 立即以 Groq 進行 StockQ 數據校對與市場解析</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Groq Inference Meta Badge */}
              {groqMeta && (
                <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/10 text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold">推論引擎:</span>
                    <span className="text-white font-bold">{groqMeta.provider.toUpperCase()} ({groqMeta.model})</span>
                    {groqMeta.slot && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        輪詢槽位 #{groqMeta.slot}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400">
                    延遲耗時: <span className="text-emerald-400 font-bold">{groqMeta.latencyMs}ms</span>
                  </div>
                </div>
              )}

              {/* Groq Analysis Results */}
              {groqAnalysisResult && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Summary Banner */}
                  <div className="p-3.5 bg-gradient-to-r from-slate-950 to-slate-900 border border-cyan-500/40 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-cyan-300">
                        {groqAnalysisResult.alignmentTitle || 'StockQ 數據對齊與總經量化審查'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-mono text-[10px] font-bold">
                        狀態：{groqAnalysisResult.dataStatus === 'aligned' ? '✅ 數據一致對齊' : '⚡ 需更新校正'}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed mt-1">
                      {groqAnalysisResult.alignmentSummary}
                    </p>
                  </div>

                  {/* Macro Insights Cards */}
                  {groqAnalysisResult.macroInsights && groqAnalysisResult.macroInsights.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-black text-xs text-amber-400 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>跨市場宏觀連動研判 (Macro Inter-Market)</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {groqAnalysisResult.macroInsights.map((insight: any, idx: number) => {
                          const isBull = insight.impact === 'bullish';
                          const isBear = insight.impact === 'bearish';
                          return (
                            <div
                              key={idx}
                              className="p-3 bg-slate-950/70 border border-white/10 rounded-xl space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-black text-white text-xs">{insight.title}</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    isBull
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      : isBear
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                      : 'bg-slate-700 text-slate-300'
                                  }`}
                                >
                                  {isBull ? '偏多看待' : isBear ? '偏空看待' : '中性震盪'}
                                </span>
                              </div>
                              <span className="text-[10px] text-amber-400 font-mono block">
                                {insight.indicator}
                              </span>
                              <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                                {insight.detail}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Parsed Items List if available */}
                  {groqAnalysisResult.parsedItems && groqAnalysisResult.parsedItems.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="font-black text-xs text-cyan-400 flex items-center gap-1.5">
                        <span>🔍 經 Groq 結構化提取之行情標的</span>
                      </h4>
                      <div className="divide-y divide-white/5 bg-slate-950 rounded-xl border border-white/10 overflow-hidden">
                        {groqAnalysisResult.parsedItems.map((item: any, idx: number) => (
                          <div key={idx} className="p-2.5 px-3 flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-400">{item.symbol}</span>
                              <span className="font-sans text-white font-bold">{item.name}</span>
                              <span className="text-slate-400 text-[10px] font-sans">{item.unitLabel}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-white">{item.price}</span>
                              <span className={item.change >= 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {item.change >= 0 ? '+' : ''}{item.change} ({item.changePercent}%)
                              </span>
                              <span className="text-slate-500 text-[10px]">{item.taipeiTime}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-950 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span className="text-[11px]">
                💡 提示：本模擬交易系統的原物料報價已全面對齊 StockQ 官方現貨與期貨標準。
              </span>
              <button
                type="button"
                onClick={() => setIsGroqAnalyzeOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
