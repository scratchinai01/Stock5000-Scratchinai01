import React, { useState } from 'react';
import {
  InstrumentSpec,
  OrderAction,
  StudentProfile,
} from '../types/market';
import { KLineChart } from './KLineChart';
import { SmartInstrumentSearchBoard } from './SmartInstrumentSearchBoard';
import { CommoditiesBoard } from './CommoditiesBoard';
import { StockQMarketBoard } from './StockQMarketBoard';
import { getSystemDateStr } from '../utils/dateUtils';
import {
  Calculator,
  BookOpen,
  Sparkles,
  Plus,
  CheckCircle2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  Search,
  Sliders,
} from 'lucide-react';
import type { MainCategoryTab, TradingToolTab } from './TradingModal';

export interface StrikeRow {
  strike: number;
  callBid: number;
  callAsk: number;
  callPrice: number;
  callChange: number;
  callOi: number;
  putBid: number;
  putAsk: number;
  putPrice: number;
  putChange: number;
  putOi: number;
}

export const OPTIONS_STRIKES_BOARD: StrikeRow[] = [
  { strike: 41600, callBid: 6650, callAsk: 6670, callPrice: 6660, callChange: 240, callOi: 2, putBid: 0.10, putAsk: 0.60, putPrice: 0.20, putChange: 0, putOi: 51 },
  { strike: 41700, callBid: 6550, callAsk: 6570, callPrice: 6560, callChange: 240, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 26 },
  { strike: 41800, callBid: 6450, callAsk: 6470, callPrice: 6460, callChange: 240, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 21 },
  { strike: 41900, callBid: 6350, callAsk: 6370, callPrice: 6360, callChange: 240, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 7 },
  { strike: 42000, callBid: 6200, callAsk: 6220, callPrice: 6210, callChange: 240, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.30, putChange: 0, putOi: 58 },
  { strike: 42100, callBid: 6100, callAsk: 6120, callPrice: 6110, callChange: 230, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 6 },
  { strike: 42200, callBid: 6000, callAsk: 6020, callPrice: 6010, callChange: 230, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 32 },
  { strike: 42300, callBid: 5910, callAsk: 5930, callPrice: 5920, callChange: 230, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 20 },
  { strike: 42400, callBid: 5810, callAsk: 5830, callPrice: 5820, callChange: 230, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 13 },
  { strike: 42500, callBid: 5710, callAsk: 5730, callPrice: 5720, callChange: 230, callOi: 0, putBid: 0.20, putAsk: 0.60, putPrice: 0.30, putChange: 0, putOi: 45 },
  { strike: 42600, callBid: 5610, callAsk: 5630, callPrice: 5620, callChange: 230, callOi: 0, putBid: 0.10, putAsk: 0.60, putPrice: 0.60, putChange: 0, putOi: 10 },
  { strike: 47000, callBid: 1840, callAsk: 1860, callPrice: 1850, callChange: 180, callOi: 350, putBid: 970, putAsk: 990, putPrice: 980, putChange: -250, putOi: 3790 },
  { strike: 47500, callBid: 1360, callAsk: 1380, callPrice: 1370, callChange: 170, callOi: 480, putBid: 1470, putAsk: 1490, putPrice: 1480, putChange: -270, putOi: 2950 },
  { strike: 48000, callBid: 920, callAsk: 940, callPrice: 930, callChange: 150, callOi: 1200, putBid: 2020, putAsk: 2050, putPrice: 2030, putChange: -300, putOi: 1800 },
  { strike: 48500, callBid: 860, callAsk: 870, callPrice: 865, callChange: 130, callOi: 2150, putBid: 2600, putAsk: 2640, putPrice: 2620, putChange: -310, putOi: 920 },
  { strike: 49000, callBid: 520, callAsk: 540, callPrice: 530, callChange: 110, callOi: 3400, putBid: 3250, putAsk: 3300, putPrice: 3270, putChange: -330, putOi: 610 },
];

export interface TradingBottomToolsProps {
  activeToolTab: TradingToolTab;
  setActiveToolTab: (tab: TradingToolTab) => void;
  selectedInstrument: InstrumentSpec;
  onSelectInstrument: (inst: InstrumentSpec) => void;
  setOrderAction: (action: OrderAction) => void;
  setActiveCategoryTab: (tab: MainCategoryTab) => void;
  setCustomPrice: (price: number) => void;
  setUseCustomPrice?: (use: boolean) => void;
  setQuantity: (qty: number) => void;
  scrollToOrder: () => void;
  currentProfile?: StudentProfile;
  instrumentsList: InstrumentSpec[];
  onViewInstrumentKLine?: (inst: InstrumentSpec) => void;
  onClosePosition?: (posId: string, closingPrice: number) => void;
  onAddCustomInstrument?: (inst: InstrumentSpec) => void;
  onOpenCalculator?: (inst: InstrumentSpec) => void;
  onOpenGlossary?: () => void;
  setShowLimitUpAlternatives: (show: boolean) => void;
  openCustomSymbolModal: (cat: MainCategoryTab) => void;
  activeCategoryTab: MainCategoryTab;
  getFilteredInstruments: (cat: MainCategoryTab) => InstrumentSpec[];
  totalHeldQty: number;
  avgHeldCost: number;
  totalHeldMarketVal: number;
  totalHeldPnL: number;
  myPositions: any[];
  isSuperUser?: boolean;
  getCategoryTabFromInstrument: (inst: InstrumentSpec) => MainCategoryTab;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onForceRefresh?: () => void;
}

export const TradingBottomTools: React.FC<TradingBottomToolsProps> = ({
  activeToolTab,
  setActiveToolTab,
  selectedInstrument,
  onSelectInstrument,
  setOrderAction,
  setActiveCategoryTab,
  setCustomPrice,
  setUseCustomPrice,
  setQuantity,
  scrollToOrder,
  currentProfile,
  instrumentsList,
  onAddCustomInstrument,
  onOpenCalculator,
  onOpenGlossary,
  setShowLimitUpAlternatives,
  openCustomSymbolModal,
  activeCategoryTab,
  getFilteredInstruments,
  totalHeldQty,
  avgHeldCost,
  totalHeldMarketVal,
  totalHeldPnL,
  myPositions,
  isSuperUser = false,
  getCategoryTabFromInstrument,
  isExpanded = true,
  onToggleExpand,
  onForceRefresh,
}) => {
  const [toolNotice, setToolNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setToolNotice(msg);
    setTimeout(() => setToolNotice(null), 3500);
  };

  const toolTabs: { id: TradingToolTab; label: string; short: string; badge?: string }[] = [
    { id: 'smart_search', label: '🔍 標的查詢 (7大商品)', short: '🔍 標的查詢', badge: '全覽' },
    { id: 'kline', label: '📈 即時走勢 (K線/均線)', short: '📈 即時K線', badge: '實時' },
    { id: 'my_positions', label: '💼 本標的現有持倉', short: '💼 本標持倉', badge: totalHeldQty > 0 ? `${totalHeldQty}` : undefined },
    { id: 'commodities', label: '🌍 6大原物料板塊', short: '🌍 6大原物料', badge: '全球' },
    { id: 'stockq', label: '🌐 StockQ 全球行情', short: '🌐 StockQ', badge: '行情' },
    { id: 'options_t_quote', label: '📊 台指選擇權 T字報價', short: '📊 T字報價', badge: 'TXO' },
  ];

  return (
    <div
      id="trading-bottom-tools"
      className="bg-white border-2 border-slate-300 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden flex flex-col transition-all duration-200"
    >
      {/* ─── Bottom Tools Header & Tab Switcher (Mobile Ergonomic) ─── */}
      <div className="p-3 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shrink-0 space-y-2.5 border-b border-slate-700">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-sm font-black shadow-sm shrink-0">
              🛠️
            </span>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 flex-wrap">
                <span>操盤手下方實戰輔助工具箱</span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black">
                  已移至下方 · 適宜手機直覺操作
                </span>
              </h4>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                點擊任一工具即時研判走勢，下單數據一鍵自動填入頂部委託匣
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Quick jump back to order ticket button */}
            <button
              type="button"
              onClick={scrollToOrder}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow-sm transition active:scale-95 flex items-center gap-1"
              title="快速滑動回頂部下單操作匣"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>回到下單委託匣</span>
            </button>

            {/* Expand / Collapse toggle */}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs cursor-pointer transition flex items-center gap-1"
                title={isExpanded ? '收起工具箱' : '展開工具箱'}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">收起工具箱</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-300 font-black">展開工具箱</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 6 Bottom Tool Switcher Tabs - Thumb-friendly Horizontal Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-xs touch-pan-x pb-0.5">
          {toolTabs.map(t => {
            const isSel = activeToolTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveToolTab(t.id)}
                className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 border min-h-[38px] active:scale-95 ${
                  isSel
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm font-black ring-2 ring-amber-400/30'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border-slate-700 hover:text-white'
                }`}
              >
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isSel ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notice Banner */}
      {toolNotice && (
        <div className="p-2.5 px-4 bg-amber-50 border-b border-amber-300 text-amber-950 text-xs font-black flex items-center justify-between gap-1.5 shrink-0 animate-in fade-in duration-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toolNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setToolNotice(null)}
            className="text-amber-800 hover:text-amber-950 text-xs px-1 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Expanded Content Area */}
      {isExpanded && (
        <>
          <div className="p-3 sm:p-4 space-y-3.5 bg-slate-50/70">
            {/* TAB 1: 標的智能查詢 (7大可交易衍生品卡片) */}
            {activeToolTab === 'smart_search' && (
              <div className="space-y-3">
                <SmartInstrumentSearchBoard
                  allInstruments={instrumentsList}
                  currentProfile={currentProfile}
                  initialSymbol={selectedInstrument.symbol || '2317'}
                  onForceRefresh={onForceRefresh}
                  onSelectInstrumentToTrade={(inst, action) => {
                    onSelectInstrument(inst);
                    if (action) {
                      setOrderAction(action);
                    }
                    setActiveCategoryTab(getCategoryTabFromInstrument(inst));
                    setCustomPrice(inst.price);
                    scrollToOrder();
                    showNotice(`✅ 已切換下單標的至【${inst.name} (${inst.symbol})】！價格與口數已自動更新`);
                  }}
                  onViewInstrumentKLine={inst => {
                    onSelectInstrument(inst);
                    setActiveToolTab('kline');
                  }}
                  onAddInstrument={onAddCustomInstrument}
                  isCollapsible={false}
                />
              </div>
            )}

            {/* TAB 2: 即時 K 線圖 (走勢研判，邊看邊下單) */}
            {activeToolTab === 'kline' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-2xl text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-amber-400 font-black text-sm">{selectedInstrument.symbol}</span>
                    <span className="font-black text-slate-100 text-sm">{selectedInstrument.name}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full font-mono border border-slate-700">
                      {selectedInstrument.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono font-bold shrink-0">
                    <span className="text-sm text-white">NT$ {selectedInstrument.price.toLocaleString()}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        selectedInstrument.change >= 0 ? 'bg-rose-900/50 text-rose-300' : 'bg-emerald-900/50 text-emerald-300'
                      }`}
                    >
                      {selectedInstrument.change >= 0 ? '+' : ''}
                      {selectedInstrument.change} ({selectedInstrument.changePercent}%)
                    </span>
                    <button
                      type="button"
                      onClick={scrollToOrder}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow-xs transition"
                    >
                      帶入頂部下單 ➔
                    </button>
                  </div>
                </div>

                {/* Quick Switch Chips for Current Category */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                  <span className="text-[10px] text-slate-500 font-bold shrink-0">快捷看盤切換：</span>
                  {getFilteredInstruments(activeCategoryTab).slice(0, 10).map(inst => (
                    <button
                      key={inst.symbol}
                      type="button"
                      onClick={() => {
                        onSelectInstrument(inst);
                        setCustomPrice(inst.price);
                        showNotice(`📊 已切換 K 線至【${inst.name} (${inst.symbol})】`);
                      }}
                      className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold border shrink-0 transition cursor-pointer ${
                        selectedInstrument.symbol === inst.symbol
                          ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {inst.symbol} {inst.name}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 shadow-sm min-h-[460px]">
                  <KLineChart
                    instrument={selectedInstrument}
                    benchmarkDate={getSystemDateStr()}
                    orderRationale={`自主下單研判走勢：${selectedInstrument.name} (${selectedInstrument.symbol})`}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: 本標的持倉與損益 */}
            {activeToolTab === 'my_positions' && (
              <div className="space-y-3">
                <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border border-amber-300 rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-amber-200/80 pb-2.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-amber-700" />
                      <span className="text-xs font-black text-amber-950">
                        本標的現有持倉：{selectedInstrument.name} ({selectedInstrument.symbol})
                      </span>
                    </div>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black bg-amber-200 text-amber-900 border border-amber-300">
                      {totalHeldQty > 0 ? `持有中 (${totalHeldQty} ${selectedInstrument.unitLabel})` : '目前無持倉'}
                    </span>
                  </div>

                  {totalHeldQty > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                        <div className="bg-white p-2.5 rounded-xl border border-amber-200 text-center shadow-2xs">
                          <span className="text-[10px] text-slate-500 font-sans block font-bold">持倉數量</span>
                          <span className="font-black text-slate-900 text-sm">
                            {totalHeldQty} {selectedInstrument.unitLabel}
                          </span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-amber-200 text-center shadow-2xs">
                          <span className="text-[10px] text-slate-500 font-sans block font-bold">平均成本</span>
                          <span className="font-black text-slate-900 text-sm">NT$ {avgHeldCost.toLocaleString()}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-amber-200 text-center shadow-2xs">
                          <span className="text-[10px] text-slate-500 font-sans block font-bold">目前市值</span>
                          <span className="font-black text-slate-900 text-sm">
                            NT$ {Math.round(totalHeldMarketVal).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-amber-200 text-center shadow-2xs">
                          <span className="text-[10px] text-slate-500 font-sans block font-bold">未實現損益</span>
                          <span className={`font-black text-sm ${totalHeldPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {totalHeldPnL >= 0 ? '+' : ''}NT$ {Math.round(totalHeldPnL).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Quick Fill Actions for Selling / Closing - Mobile Ergonomic */}
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQuantity(totalHeldQty);
                            if (selectedInstrument.category === 'stocks') setOrderAction('SHORT_SELL_STOCK');
                            else if (selectedInstrument.category === 'futures') setOrderAction('SELL_FUTURES_SHORT');
                            else if (selectedInstrument.category === 'us_stocks') setOrderAction('SELL_US_STOCK');
                            setCustomPrice(selectedInstrument.price);
                            scrollToOrder();
                            showNotice(`⚡ 已帶入【全數平倉賣出】(${totalHeldQty} ${selectedInstrument.unitLabel})！`);
                          }}
                          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer shadow-sm transition active:scale-95 flex items-center gap-1 min-h-[40px]"
                        >
                          ⚡ 帶入全數賣出/平倉 ({totalHeldQty} {selectedInstrument.unitLabel})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuantity(Math.max(1, Math.floor(totalHeldQty / 2)));
                            if (selectedInstrument.category === 'stocks') setOrderAction('SHORT_SELL_STOCK');
                            else if (selectedInstrument.category === 'futures') setOrderAction('SELL_FUTURES_SHORT');
                            scrollToOrder();
                            showNotice(`⚡ 已帶入【半數減碼】！`);
                          }}
                          className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer shadow-sm transition active:scale-95 flex items-center gap-1 min-h-[40px]"
                        >
                          ⚡ 半數減碼 ({Math.max(1, Math.floor(totalHeldQty / 2))} {selectedInstrument.unitLabel})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomPrice(avgHeldCost);
                            if (setUseCustomPrice) setUseCustomPrice(true);
                            scrollToOrder();
                            showNotice(`⚡ 已帶入成本價 NT$ ${avgHeldCost}！`);
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs cursor-pointer shadow-sm transition active:scale-95 flex items-center gap-1 min-h-[40px]"
                        >
                          ⚡ 成本價平價委託 (NT$ {avgHeldCost})
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-amber-200 text-center text-xs text-slate-600">
                      目前操盤手尚未建立此標的持倉。您可在頂部下單機直接買進或放空建立部位！
                    </div>
                  )}
                </div>

                {/* All Portfolio Positions List */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-black text-slate-900 border-b border-slate-100 pb-2">
                    <span>📋 全組合持倉部位清單 (共 {myPositions.length} 檔)</span>
                    <span className="text-[10px] text-slate-500 font-bold">點擊即可切換至頂部下單</span>
                  </div>

                  {myPositions.length > 0 ? (
                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {myPositions.map(pos => {
                        const isCurrent = pos.symbol === selectedInstrument.symbol;
                        const matchedInst = instrumentsList.find(i => i.symbol === pos.symbol);
                        return (
                          <div
                            key={pos.id}
                            className={`py-2.5 px-2 flex items-center justify-between text-xs rounded-xl transition ${
                              isCurrent ? 'bg-amber-50 border border-amber-300' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-black text-slate-950">{pos.symbol}</span>
                                <span className="font-bold text-slate-800">{pos.name}</span>
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-bold">
                                  {pos.category}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                {pos.quantity} {pos.unitMultiplier === 1000 ? '張' : '口'} · 均價 NT${' '}
                                {pos.entryPrice.toLocaleString()} · 現價 NT$ {pos.currentPrice.toLocaleString()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span
                                className={`font-mono font-black text-xs ${
                                  pos.unrealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                {pos.unrealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(pos.unrealizedPnL).toLocaleString()}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (matchedInst) {
                                    onSelectInstrument(matchedInst);
                                  } else {
                                    onSelectInstrument({
                                      symbol: pos.symbol,
                                      name: pos.name,
                                      category: pos.category,
                                      price: pos.currentPrice,
                                      prevClose: pos.entryPrice,
                                      change: pos.currentPrice - pos.entryPrice,
                                      changePercent: Number(
                                        (((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2)
                                      ),
                                      volume: 1000,
                                      unitLabel: pos.unitMultiplier === 1000 ? '張' : '口',
                                      multiplier: pos.unitMultiplier,
                                      marginRequirement: pos.marginRequirement || 0,
                                      description: '自訂持倉標的',
                                      klineHistory: [],
                                    });
                                  }
                                  scrollToOrder();
                                  showNotice(`✅ 已切換至持倉標的【${pos.name}】！`);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs cursor-pointer shadow-2xs transition active:scale-95"
                              >
                                載入下單 ➔
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-slate-400">目前尚無任何在倉部位</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: 全球大宗原物料 6 大板塊 */}
            {activeToolTab === 'commodities' && (
              <div className="space-y-3">
                <CommoditiesBoard
                  allInstruments={instrumentsList}
                  onSelectInstrumentToTrade={(inst, action) => {
                    onSelectInstrument(inst);
                    if (action) {
                      setOrderAction(action);
                    } else {
                      setOrderAction('BUY_COMMODITY_LONG');
                    }
                    setActiveCategoryTab('commodities');
                    setCustomPrice(inst.price);
                    scrollToOrder();
                    showNotice(`✅ 已切換至原物料【${inst.name} (${inst.symbol})】！`);
                  }}
                  onOpenTrading={scrollToOrder}
                  onViewInstrumentKLine={inst => {
                    onSelectInstrument(inst);
                    setActiveToolTab('kline');
                  }}
                  isSuperUser={isSuperUser}
                />
              </div>
            )}

            {/* TAB: StockQ 全球行情中心 (對齊 www.stockq.org) */}
            {activeToolTab === 'stockq' && (
              <div className="space-y-3">
                <StockQMarketBoard
                  compact={true}
                  allInstruments={instrumentsList}
                  isSuperUser={isSuperUser}
                  onSelectInstrumentToTrade={(inst, action) => {
                    onSelectInstrument(inst);
                    if (action) {
                      setOrderAction(action);
                    } else {
                      setOrderAction(
                        inst.category === 'commodities'
                          ? 'BUY_COMMODITY_LONG'
                          : inst.category === 'futures'
                          ? 'BUY_FUTURES_LONG'
                          : 'BUY_STOCK'
                      );
                    }
                    setActiveCategoryTab(getCategoryTabFromInstrument(inst));
                    setCustomPrice(inst.price);
                    scrollToOrder();
                    showNotice(`✅ 已從 StockQ 載入下單標的【${inst.name} (${inst.symbol})】！`);
                  }}
                  onOpenTrading={scrollToOrder}
                  onViewInstrumentKLine={inst => {
                    onSelectInstrument(inst);
                    setActiveToolTab('kline');
                  }}
                  onOpenCalculator={inst => onOpenCalculator && onOpenCalculator(inst || selectedInstrument)}
                />
              </div>
            )}

            {/* TAB 5: 台指選擇權 T 字報價表 */}
            {activeToolTab === 'options_t_quote' && (
              <div className="space-y-2 bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                  <div>
                    <span className="text-xs sm:text-sm font-black text-slate-950 block">📊 台指選擇權 T 字報價表</span>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                      點選任意履約價的 Call 或 Put，直接自動帶入頂部下單匣！
                    </span>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded bg-purple-100 text-purple-900 font-bold border border-purple-300">
                    台指 2610 合約
                  </span>
                </div>

                <div className="overflow-x-auto text-[11px] font-mono touch-pan-x">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 text-center text-[10px] border-b border-slate-200">
                        <th className="py-2 px-1 text-rose-800 font-black">買權 Call</th>
                        <th className="py-2 px-1">買價</th>
                        <th className="py-2 px-1">賣價</th>
                        <th className="py-2 px-1 font-black bg-slate-200 text-slate-900">履約價</th>
                        <th className="py-2 px-1">買價</th>
                        <th className="py-2 px-1">賣價</th>
                        <th className="py-2 px-1 text-emerald-800 font-black">賣權 Put</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-center">
                      {OPTIONS_STRIKES_BOARD.map(row => (
                        <tr key={row.strike} className="hover:bg-amber-50/70 transition duration-75">
                          <td className="py-1.5 px-1 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                const callInst: InstrumentSpec = {
                                  symbol: `TXO-${row.strike}-C`,
                                  name: `台指買權 ${row.strike}-Call`,
                                  category: 'options',
                                  price: row.callPrice,
                                  prevClose: row.callPrice - row.callChange,
                                  change: row.callChange,
                                  changePercent: 5.5,
                                  volume: 1200,
                                  unitLabel: '口 (1點=50元)',
                                  multiplier: 50,
                                  marginRequirement: 0,
                                  strikePrice: row.strike,
                                  description: `台指買權履約價 ${row.strike}`,
                                  klineHistory: [],
                                };
                                onSelectInstrument(callInst);
                                setOrderAction('BUY_CALL_OPTION');
                                setActiveCategoryTab('options_warrants');
                                setCustomPrice(row.callPrice);
                                scrollToOrder();
                                showNotice(`✅ 已切換至【台指買權 ${row.strike}-Call】！`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer shadow-2xs active:scale-95"
                            >
                              Call {row.callPrice}
                            </button>
                          </td>
                          <td className="py-1.5 px-1 text-slate-600">{row.callBid}</td>
                          <td className="py-1.5 px-1 text-slate-600">{row.callAsk}</td>
                          <td className="py-1.5 px-1 font-black bg-slate-100 text-slate-950 font-mono">{row.strike}</td>
                          <td className="py-1.5 px-1 text-slate-600">{row.putBid}</td>
                          <td className="py-1.5 px-1 text-slate-600">{row.putAsk}</td>
                          <td className="py-1.5 px-1 text-left">
                            <button
                              type="button"
                              onClick={() => {
                                const putInst: InstrumentSpec = {
                                  symbol: `TXO-${row.strike}-P`,
                                  name: `台指賣權 ${row.strike}-Put`,
                                  category: 'options',
                                  price: row.putPrice,
                                  prevClose: row.putPrice - row.putChange,
                                  change: row.putChange,
                                  changePercent: -4.2,
                                  volume: 1500,
                                  unitLabel: '口 (1點=50元)',
                                  multiplier: 50,
                                  marginRequirement: 0,
                                  strikePrice: row.strike,
                                  description: `台指賣權履約價 ${row.strike}`,
                                  klineHistory: [],
                                };
                                onSelectInstrument(putInst);
                                setOrderAction('BUY_PUT_OPTION');
                                setActiveCategoryTab('options_warrants');
                                setCustomPrice(row.putPrice);
                                scrollToOrder();
                                showNotice(`✅ 已切換至【台指賣權 ${row.strike}-Put】！`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] cursor-pointer shadow-2xs active:scale-95"
                            >
                              Put {row.putPrice}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ─── Bottom Tools Utility Footer Bar ─── */}
          <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 shrink-0 flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenCalculator && onOpenCalculator(selectedInstrument)}
                className="px-3 py-2 rounded-xl bg-white hover:bg-indigo-50 text-indigo-950 border border-indigo-200 font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs min-h-[38px] active:scale-95"
                title="開啟 AI 損益與保證金計算機"
              >
                <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                <span>🧮 AI 計算機</span>
              </button>

              {onOpenGlossary && (
                <button
                  type="button"
                  onClick={onOpenGlossary}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border border-amber-300 font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs min-h-[38px] active:scale-95"
                  title="開啟 300 筆金融詞庫小學堂"
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span>📚 名詞小學堂</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowLimitUpAlternatives(true)}
                className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border border-amber-300 font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs min-h-[38px] active:scale-95"
                title="現貨漲停鎖死 3 大替代方案"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>💡 漲停避險方案</span>
              </button>

              <button
                type="button"
                onClick={() => openCustomSymbolModal(activeCategoryTab)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs min-h-[38px] active:scale-95"
                title="指定任意代號 (自訂 4,300+ 檔標的)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>自訂代號</span>
              </button>
            </div>

            {/* Jump to top button */}
            <button
              type="button"
              onClick={scrollToOrder}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center gap-1 cursor-pointer transition shadow-2xs min-h-[38px] ml-auto active:scale-95"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>回到頂部下單</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
