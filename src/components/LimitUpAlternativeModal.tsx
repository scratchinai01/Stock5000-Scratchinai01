import React from 'react';
import { InstrumentSpec, OrderAction } from '../types/market';
import {
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Zap,
  Layers,
  Sparkles,
  ShieldAlert,
  Clock,
  CheckCircle2,
  X,
  Target,
  BarChart2,
} from 'lucide-react';

interface LimitUpAlternativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: InstrumentSpec;
  allInstruments: InstrumentSpec[];
  onSelectAlternative: (targetInstrument: InstrumentSpec, action: OrderAction) => void;
  onProceedQueuedOrder?: (instrument: InstrumentSpec) => void;
}

export function LimitUpAlternativeModal({
  isOpen,
  onClose,
  instrument,
  allInstruments,
  onSelectAlternative,
  onProceedQueuedOrder,
}: LimitUpAlternativeModalProps) {
  if (!isOpen || !instrument) return null;

  // 1. Find corresponding Stock Futures (e.g. 2330 -> CDF / 2330F, 2317 -> DHF, 2303 -> CCF, etc.)
  const futuresMatch =
    allInstruments.find(
      i =>
        i.category === 'futures' &&
        (i.symbol === `${instrument.symbol}F` ||
          (instrument.symbol === '2330' && (i.symbol === 'CDF' || i.name.includes('台積電'))) ||
          (instrument.symbol === '2317' && (i.symbol === 'DHF' || i.name.includes('鴻海'))) ||
          (instrument.symbol === '2303' && (i.symbol === 'CCF' || i.name.includes('聯電'))) ||
          (instrument.symbol === '2603' && (i.symbol === 'CZF' || i.name.includes('長榮'))) ||
          (instrument.symbol === '2454' && (i.symbol === 'DVF' || i.name.includes('聯發科'))) ||
          (instrument.symbol === '2382' && (i.symbol === 'QDF' || i.name.includes('廣達'))) ||
          i.name.includes(instrument.name))
    ) ||
    allInstruments.find(i => i.symbol === 'TX') ||
    allInstruments.find(i => i.category === 'futures');

  // 2. Find corresponding Call Warrant (e.g. 2330 -> 08643, 2317 -> 08644, 2303 -> 08303, etc.)
  const warrantMatch =
    allInstruments.find(
      i =>
        i.category === 'warrants' &&
        (i.name.includes(instrument.name) ||
          i.symbol.startsWith(instrument.symbol) ||
          (instrument.symbol === '2330' && i.symbol.startsWith('08643')) ||
          (instrument.symbol === '2317' && i.symbol.startsWith('08644')) ||
          (instrument.symbol === '2303' && i.symbol.startsWith('08303')))
    ) ||
    allInstruments.find(i => i.category === 'warrants' && (i.name.includes('購') || i.name.includes('Call'))) ||
    allInstruments.find(i => i.category === 'warrants');

  // 3. Find corresponding Index / Sector ETF (0050 or 0052)
  const etfMatch =
    allInstruments.find(i => i.symbol === '0050') ||
    allInstruments.find(i => i.symbol === '0052') ||
    allInstruments.find(i => i.category === 'etfs' && (i.name.includes('台灣50') || i.name.includes('科技'))) ||
    allInstruments.find(i => i.category === 'etfs');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border-2 border-amber-500/80 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto text-white">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 p-5 sm:p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white/90 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full bg-black/30 border border-white/20 text-amber-200 text-xs font-black tracking-wide flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              公平撮合防禦機制啟動
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-mono font-bold">
              {instrument.symbol}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>現貨漲停鎖死買不到！</span>
            <span className="text-amber-200 font-mono text-lg font-bold">
              (NT$ {instrument.limitUpPrice || instrument.price})
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-white/90 mt-1 font-medium leading-relaxed">
            【{instrument.name}】目前於集中市場一價到底鎖死漲停（委買排隊萬張，委賣 0 張）。依台股真實撮合規則，現貨市價委託無法立即成交！
          </p>
        </div>

        {/* Strategies Section */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="font-black text-slate-100 text-base">
                💡 現貨漲停買不到？職業機構法人的 3 種替代實戰策略
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline-block">點擊任一卡片立即切換</span>
          </div>

          <div className="space-y-3">
            {/* Strategy 1: Stock Futures */}
            <div className="bg-slate-800/80 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-400 rounded-2xl p-4 transition-all duration-150 group">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono text-xs font-black border border-amber-500/40">
                      策略 1
                    </span>
                    <h4 className="font-black text-amber-300 text-sm sm:text-base flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      轉戰【個股期貨】（Stock Futures）
                    </h4>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    例如{instrument.name}漲停買不到現貨，可以轉下「
                    <span className="text-amber-300 font-bold">
                      {futuresMatch?.name || `${instrument.name}期貨`}
                    </span>
                    」（一口等同兩張股票）。期貨有獨立委託簿，且槓桿達 7.4 倍，資金效率更高。
                  </p>
                  {futuresMatch && (
                    <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-400">
                      <span>當前撮合價：<b className="text-white">NT$ {futuresMatch.price}</b></span>
                      <span>合約乘數：<b className="text-slate-300">{futuresMatch.multiplier} 股/口</b></span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (futuresMatch) {
                      onSelectAlternative(futuresMatch, 'BUY_FUTURES_LONG');
                    }
                  }}
                  className="shrink-0 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                >
                  <span>轉下個股期貨</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Strategy 2: Call Warrants */}
            <div className="bg-slate-800/80 hover:bg-slate-800 border border-purple-500/30 hover:border-purple-400 rounded-2xl p-4 transition-all duration-150 group">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-mono text-xs font-black border border-purple-500/40">
                      策略 2
                    </span>
                    <h4 className="font-black text-purple-300 text-sm sm:text-base flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-purple-400" />
                      轉戰【認購權證】（Call Warrants）
                    </h4>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    買進與該標的連動的「
                    <span className="text-purple-300 font-bold">
                      {warrantMatch?.name || `${instrument.name}認購權證`}
                    </span>
                    」，以極低權利金參與非對稱上漲爆發力，具有以小博大槓桿效應。
                  </p>
                  {warrantMatch && (
                    <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-400">
                      <span>當前權利金：<b className="text-white">NT$ {warrantMatch.price}</b></span>
                      <span>1張 = 1,000 份權證</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (warrantMatch) {
                      onSelectAlternative(warrantMatch, 'BUY_CALL_WARRANT');
                    }
                  }}
                  className="shrink-0 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20 transition cursor-pointer"
                >
                  <span>轉下認購權證</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Strategy 3: Index / Sector ETF */}
            <div className="bg-slate-800/80 hover:bg-slate-800 border border-sky-500/30 hover:border-sky-400 rounded-2xl p-4 transition-all duration-150 group">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-mono text-xs font-black border border-sky-500/40">
                      策略 3
                    </span>
                    <h4 className="font-black text-sky-300 text-sm sm:text-base flex items-center gap-1.5">
                      <BarChart2 className="w-4 h-4 text-sky-400" />
                      買進【權重 ETF】（Index / Sector ETF）
                    </h4>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    轉向買進持有該成分股權重極高的 ETF（如{' '}
                    <span className="text-sky-300 font-bold">
                      {etfMatch?.name || '0050 元大台灣50'}
                    </span>
                    ），即使個股現貨買不到，仍可透過 ETF 參與該龍頭股的漲升波段。
                  </p>
                  {etfMatch && (
                    <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-400">
                      <span>當前市價：<b className="text-white">NT$ {etfMatch.price}</b></span>
                      <span>成分股包含 {instrument.name}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (etfMatch) {
                      onSelectAlternative(etfMatch, 'BUY_ETF');
                    }
                  }}
                  className="shrink-0 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/20 transition cursor-pointer"
                >
                  <span>轉買權重 ETF</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400 text-center sm:text-left">
              🔒 系統遵循臺灣證交所與期交所公平撮合規範，防止偷跑作弊。
            </p>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {onProceedQueuedOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onProceedQueuedOrder(instrument);
                  }}
                  className="w-full sm:w-auto py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition cursor-pointer"
                  title="依台灣股市規則：排在萬張買單後面，若今日無人賣出將不保證成交"
                >
                  堅持以漲停價排隊掛單
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto py-2 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-black transition cursor-pointer"
              >
                關閉面板
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
