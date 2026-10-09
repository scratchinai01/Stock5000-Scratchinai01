import React, { useState, useMemo } from 'react';
import {
  Flame,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  LayoutGrid,
  List,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  RAW_COMMODITIES,
  COMMODITY_SECTORS,
  CommodityItem,
  CommoditySector,
} from '../data/commoditiesData';
import { InstrumentSpec, OrderAction } from '../types/market';
import { getInstrumentTradingClock } from '../utils/tradingClock';
import { StockQMarketBoard } from './StockQMarketBoard';
import { CryptoLiveBoard } from './CryptoLiveBoard';

interface CommoditiesBoardProps {
  allInstruments?: InstrumentSpec[];
  onSelectInstrumentToTrade?: (instrument: InstrumentSpec, initialAction?: OrderAction) => void;
  onOpenTrading: () => void;
  onViewInstrumentKLine?: (instrument: InstrumentSpec) => void;
  onOpenCalculator?: (instrument?: InstrumentSpec) => void;
  initialBoard?: 'commodities' | 'stockq' | 'crypto';
  isSuperUser?: boolean;
}

export const CommoditiesBoard: React.FC<CommoditiesBoardProps> = ({
  allInstruments,
  onSelectInstrumentToTrade,
  onOpenTrading,
  onViewInstrumentKLine,
  onOpenCalculator,
  initialBoard = 'commodities',
  isSuperUser = false,
}) => {
  const [boardType, setBoardType] = useState<'commodities' | 'stockq' | 'crypto'>(initialBoard);
  const [activeSector, setActiveSector] = useState<CommoditySector | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');

  // Reactively merge raw commodities with live instrument specs
  const mergedCommodities = useMemo(() => {
    const instMap = new Map((allInstruments || []).map(inst => [inst.symbol, inst]));
    return RAW_COMMODITIES.map(c => {
      const live = instMap.get(c.symbol);
      if (live) {
        return {
          ...c,
          price: live.price ?? c.price,
          prevClose: live.prevClose ?? c.prevClose,
          change: live.change ?? c.change,
          changePercent: live.changePercent ?? c.changePercent,
          volume: live.volume ?? c.volume,
          open: live.open ?? c.open,
          high: live.high ?? c.high,
          low: live.low ?? c.low,
        };
      }
      return c;
    });
  }, [allInstruments]);

  // Sector groups for structured layout matching User's ASCII Diagram
  const sectorsWithItems = useMemo(() => {
    return COMMODITY_SECTORS.map(sec => {
      const items = mergedCommodities.filter(c => c.sector === sec.id);
      return {
        ...sec,
        items: items.filter(item => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase().trim();
          return (
            item.symbol.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.sectorName.toLowerCase().includes(q) ||
            (item.englishName && item.englishName.toLowerCase().includes(q)) ||
            item.aliases.some(a => a.toLowerCase().includes(q))
          );
        }),
      };
    }).filter(sec => (activeSector === 'all' ? sec.items.length > 0 : sec.id === activeSector));
  }, [activeSector, searchQuery, mergedCommodities]);

  const totalVisibleCount = useMemo(() => {
    return sectorsWithItems.reduce((acc, sec) => acc + sec.items.length, 0);
  }, [sectorsWithItems]);

  return (
    <div className="space-y-3">
      {/* Top Level Board Mode Switcher */}
      <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar shadow-sm">
        <button
          type="button"
          onClick={() => setBoardType('commodities')}
          className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            boardType === 'commodities'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <span>🌍</span>
          <span>6大原物料看板 (CME / NYMEX / ICE)</span>
        </button>
        <button
          type="button"
          onClick={() => setBoardType('stockq')}
          className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            boardType === 'stockq'
              ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <span>🌐</span>
          <span>StockQ 國際行情中心</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 font-mono font-bold">
            即時對齊
          </span>
        </button>
        <button
          type="button"
          onClick={() => setBoardType('crypto')}
          className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
            boardType === 'crypto'
              ? 'bg-amber-400 text-slate-950 shadow-md font-black ring-2 ring-amber-300'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <span>⚡</span>
          <span>24/7 加密貨幣 (Binance 免Key直連)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            免Token
          </span>
        </button>
      </div>

      {boardType === 'crypto' ? (
        <CryptoLiveBoard
          allInstruments={allInstruments}
          onSelectInstrumentToTrade={onSelectInstrumentToTrade}
          onOpenTrading={onOpenTrading}
        />
      ) : boardType === 'stockq' ? (
        <StockQMarketBoard
          allInstruments={allInstruments}
          onSelectInstrumentToTrade={onSelectInstrumentToTrade}
          onOpenTrading={onOpenTrading}
          onViewInstrumentKLine={onViewInstrumentKLine}
          onOpenCalculator={onOpenCalculator}
          isSuperUser={isSuperUser}
        />
      ) : (
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white rounded-3xl p-4 sm:p-6 border-2 border-amber-500/40 shadow-xl space-y-4">
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-lg shadow-inner">
                  🌍
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                    <span>全球大宗商品與原物料行情</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      24小時連線 · CME / NYMEX / ICE
                    </span>
                  </h2>
                </div>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-1">
                能源 ｜ 貴金屬 ｜ 農產品 ｜ 軟性商品 ｜ 工業金屬 ｜ 牲畜 · 支援以台幣保證金直接參與多空雙向交易！
              </p>
            </div>

            {/* Search, View Mode & Collapse Toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜尋原物料 (原油、黃金、大豆)..."
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-400 text-xs font-bold focus:bg-white/15 focus:border-amber-400 outline-none w-44 sm:w-56 transition"
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

              {/* View Mode Toggle: List vs Cards */}
              <div className="flex items-center bg-white/10 rounded-xl p-0.5 border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="經典盯盤清單模式 (符合表格直觀排版)"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">清單模式</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="專業期貨卡片模式"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">卡片模式</span>
                </button>
              </div>

              {/* Collapse Toggle */}
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 transition cursor-pointer"
                title={isCollapsed ? '展開原物料看板' : '收起原物料看板'}
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          {!isCollapsed && (
            <div className="space-y-4">
              {/* Sector Category Nav Pills: 能源｜貴金屬｜農產品｜軟性商品｜工業金屬｜牲畜 */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-1 touch-scroll whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setActiveSector('all')}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer border flex items-center gap-1.5 shrink-0 ${
                    activeSector === 'all'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                  }`}
                >
                  <span>🌐</span>
                  <span>全部板塊 ({RAW_COMMODITIES.length})</span>
                </button>

                {COMMODITY_SECTORS.map(sec => {
                  const isActive = activeSector === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveSector(sec.id)}
                      className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer border flex items-center gap-1.5 shrink-0 ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                      }`}
                    >
                      <span>{sec.icon}</span>
                      <span>{sec.name}</span>
                      <span className="text-[10px] opacity-75 font-mono">({sec.count})</span>
                    </button>
                  );
                })}
              </div>

              {/* LIST VIEW: Exactly matching the User's ASCII Diagram */}
              {viewMode === 'list' ? (
                <div className="space-y-3">
                  {sectorsWithItems.map(sec => (
                    <div
                      key={sec.id}
                      className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-md"
                    >
                      {/* Sector Header matching ASCII diagram: e.g. 🔥 能源 */}
                      <div className="px-4 py-2.5 bg-gradient-to-r from-slate-950 to-slate-900 border-b border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{sec.icon}</span>
                          <h3 className="font-black text-sm text-amber-300 tracking-wide">
                            {sec.name}
                          </h3>
                          <span className="text-[11px] text-slate-400 font-mono">
                            ({sec.items.length} 檔商品)
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                          美元計價 · 台幣保證金圈存撮合
                        </span>
                      </div>

                      {/* Commodities Table Rows */}
                      <div className="divide-y divide-white/5">
                        {sec.items.map(item => {
                          const clock = getInstrumentTradingClock(item.symbol, 'commodities');
                          const isUp = item.change >= 0;
                          return (
                            <div
                              key={item.symbol}
                              className="px-3.5 sm:px-4 py-2.5 hover:bg-white/5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs group"
                            >
                              {/* Col 1: Emoji, Symbol & Name */}
                              <div className="flex items-center gap-2.5 min-w-[200px]">
                                <span className="text-xl shrink-0">{item.emoji}</span>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-white text-sm group-hover:text-amber-300 transition">
                                      {item.name}
                                    </span>
                                    <span className="font-mono font-black text-amber-400 text-xs px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/30">
                                      {item.symbol}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                    {item.cmeExchange} · {item.contractUnit}
                                  </span>
                                </div>
                              </div>

                              {/* Col 2: Price (💵 93.20) and Change */}
                              <div className="flex items-center gap-4">
                                <div className="min-w-[120px]">
                                  <span className="text-[10px] text-slate-400 block font-medium">即時行情</span>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-amber-400 font-bold">💵</span>
                                    <span className="font-mono font-black text-base text-white">
                                      {item.price >= 100
                                        ? item.price.toLocaleString(undefined, { minimumFractionDigits: 1 })
                                        : item.price >= 10
                                        ? item.price.toFixed(2)
                                        : item.price.toFixed(3)}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-[100px] text-right sm:text-left font-mono">
                                  <span
                                    className={`text-xs font-black flex items-center gap-0.5 ${
                                      isUp ? 'text-rose-400' : 'text-emerald-400'
                                    }`}
                                  >
                                    {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {isUp ? '+' : ''}
                                    {item.change >= 10 ? item.change.toFixed(1) : item.change.toFixed(2)} (
                                    {isUp ? '+' : ''}
                                    {item.changePercent.toFixed(2)}%)
                                  </span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">
                                    保證金 NT$ {item.marginRequirement.toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              {/* Col 3: Status Badge (🟢 交易中) */}
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  🟢 交易中
                                </span>

                                {/* Col 4: Action Buttons */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onSelectInstrumentToTrade) {
                                        onSelectInstrumentToTrade(item, 'BUY_COMMODITY_LONG');
                                      } else {
                                        onOpenTrading();
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition shadow-2xs active:scale-95"
                                  >
                                    多單做多
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onSelectInstrumentToTrade) {
                                        onSelectInstrumentToTrade(item, 'SELL_COMMODITY_SHORT');
                                      } else {
                                        onOpenTrading();
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-black text-xs cursor-pointer transition shadow-2xs active:scale-95"
                                  >
                                    空單放空
                                  </button>

                                  {onViewInstrumentKLine && (
                                    <button
                                      type="button"
                                      onClick={() => onViewInstrumentKLine(item)}
                                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-sky-300 cursor-pointer text-xs"
                                      title="查看即時K線"
                                    >
                                      📈
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* CARDS VIEW: Detailed Grid Cards */
                <div className="space-y-4">
                  {sectorsWithItems.map(sec => (
                    <div
                      key={sec.id}
                      className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 space-y-3 shadow-md"
                    >
                      {/* Sector Section Header */}
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{sec.icon}</span>
                          <h3 className="font-black text-sm text-amber-300 tracking-wide">
                            {sec.name} ({sec.items.length} 檔)
                          </h3>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          以美金 USD 報價 · 台灣台幣保證金結算
                        </span>
                      </div>

                      {/* Commodities List Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {sec.items.map(item => {
                          const clock = getInstrumentTradingClock(item.symbol, 'commodities');
                          const isUp = item.change >= 0;
                          return (
                            <div
                              key={item.symbol}
                              className="bg-slate-950/70 hover:bg-slate-950 border border-white/10 hover:border-amber-400/80 rounded-xl p-3 flex flex-col justify-between transition group relative shadow-xs"
                            >
                              {/* Top: Emoji, Symbol, Name & Trading Badge */}
                              <div>
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-base shrink-0">{item.emoji}</span>
                                    <div>
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono font-black text-amber-300 text-xs px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/30">
                                          {item.symbol}
                                        </span>
                                        <span className="font-black text-xs text-white truncate max-w-[120px]">
                                          {item.name}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                        {item.cmeExchange} · {item.contractUnit}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Status badge matching user specification */}
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    🟢 交易中
                                  </span>
                                </div>

                                {/* Price & Change matching User Diagram format (💵 93.20) */}
                                <div className="mt-2.5 pt-2 border-t border-white/10 flex items-baseline justify-between">
                                  <div>
                                    <span className="text-[10px] text-slate-400 font-bold block">國際行情</span>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-amber-400 text-xs">💵</span>
                                      <span className="font-mono font-black text-base sm:text-lg text-white">
                                        {item.price >= 100
                                          ? item.price.toLocaleString(undefined, { minimumFractionDigits: 1 })
                                          : item.price >= 10
                                          ? item.price.toFixed(2)
                                          : item.price.toFixed(3)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="text-right font-mono">
                                    <span
                                      className={`text-xs font-black flex items-center justify-end gap-0.5 ${
                                        isUp ? 'text-rose-400' : 'text-emerald-400'
                                      }`}
                                    >
                                      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                      {isUp ? '+' : ''}
                                      {item.change >= 10 ? item.change.toFixed(1) : item.change.toFixed(2)} (
                                      {isUp ? '+' : ''}
                                      {item.changePercent.toFixed(2)}%)
                                    </span>
                                    <span className="text-[10px] text-slate-400 block mt-0.5">
                                      保證金 NT$ {item.marginRequirement.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Trade Buttons Long / Short */}
                              <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onSelectInstrumentToTrade) {
                                      onSelectInstrumentToTrade(item, 'BUY_COMMODITY_LONG');
                                    } else {
                                      onOpenTrading();
                                    }
                                  }}
                                  className="flex-1 py-1 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer transition text-center shadow-xs"
                                >
                                  多單做多
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onSelectInstrumentToTrade) {
                                      onSelectInstrumentToTrade(item, 'SELL_COMMODITY_SHORT');
                                    } else {
                                      onOpenTrading();
                                    }
                                  }}
                                  className="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-black text-[11px] cursor-pointer transition text-center shadow-xs"
                                >
                                  空單放空
                                </button>

                                {onViewInstrumentKLine && (
                                  <button
                                    type="button"
                                    onClick={() => onViewInstrumentKLine(item)}
                                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-sky-300 cursor-pointer text-xs"
                                    title="查看即時K線"
                                  >
                                    📈
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
