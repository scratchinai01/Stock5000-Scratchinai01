import React, { useState, useEffect } from 'react';
import {
  Globe,
  Radio,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  CheckCircle2,
  X,
  Play,
  RotateCcw,
  Layers,
} from 'lucide-react';
import {
  getGlobalMarketStatusOverview,
  GLOBAL_TIMELINE_STATIONS,
  GlobalMarketStation,
  TimeTravelStation,
} from '../utils/tradingClock';

interface GlobalMarketRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateMarket?: (category: string) => void;
}

export const GlobalMarketRadarModal: React.FC<GlobalMarketRadarModalProps> = ({
  isOpen,
  onClose,
  onNavigateMarket,
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [selectedStationIndex, setSelectedStationIndex] = useState<number>(0);
  const [isTimeTraveling, setIsTimeTraveling] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'radar' | 'timetravel'>('radar');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  const overview = getGlobalMarketStatusOverview(currentTime);
  const selectedStation: TimeTravelStation = GLOBAL_TIMELINE_STATIONS[selectedStationIndex];

  const twMarkets = overview.markets.filter(m => m.category === 'TW');
  const usMarkets = overview.markets.filter(m => m.category === 'US');
  const commMarkets = overview.markets.filter(m => m.category === 'COMMODITIES');
  const cryptoMarkets = overview.markets.filter(m => m.category === 'CRYPTO');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150 text-white">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-indigo-500/30 border border-amber-400/40 flex items-center justify-center text-2xl shadow-inner">
              🌐
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  全球金融市場交易時鐘雷達 (Global Market Clock)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  即時時鐘引擎
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 font-mono mt-0.5 flex-wrap">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>台北時間 (Asia/Taipei): </span>
                <strong className="text-amber-300 font-black">{overview.asiaTaipeiDate} {overview.asiaTaipeiTime}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-950/70 p-2 flex border-b border-white/10 text-xs font-black gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className={`flex-1 py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'radar'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>全球市場即時狀態 (4大板塊 · 24/7 Crypto)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timetravel')}
            className={`flex-1 py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'timetravel'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>跨市場時間旅行 (全球金融不只台股)</span>
            <span className="text-[10px] bg-cyan-400/30 text-cyan-900 px-1.5 py-0.2 rounded-full font-mono">
              模擬教學
            </span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-900/60">
          {activeTab === 'radar' ? (
            /* TAB 1: 4大板塊全球市場雷達 */
            <div className="space-y-4">
              {/* Educational Highlight Card */}
              <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-emerald-500/10 border border-amber-400/30 rounded-2xl p-3.5 flex items-start gap-3">
                <Radio className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>核心觀念：全球金融市場交易時鐘 與 24/7 加密資產</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded font-mono">
                      市場開放 ≠ API一定有資料
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    傳統證券期貨依各國交易所營業日與作息開閉盤；唯獨 <strong>Crypto（比特幣 BTC、以太坊 ETH 及美元穩定幣 USDT、USDC）</strong> 具備 <strong>24/7 全天候永續運作</strong> 的市場特性。即使台股或美股休市，學生亦可隨時在 Crypto 市場進行撮合、資金停泊與資產避險配置！
                  </p>
                </div>
              </div>

              {/* 4 Quadrants Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. 🏛️ 台灣市場 */}
                <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <span>🇹🇼</span>
                      <span>台灣市場 (TWSE & TAIFEX)</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">台北交易所</span>
                  </div>
                  <div className="space-y-2">
                    {twMarkets.map(m => (
                      <div key={m.id} className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">{m.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({m.symbol})</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{m.tradingHours}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-md ${
                            m.isOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}>
                            {m.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                          </span>
                          {!m.isOpen && m.statusText.includes('休市') && (
                            <span className="text-[10px] text-rose-300 block mt-1">{m.statusText.replace('🔴 CLOSED ', '')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. 🇺🇸 美國市場 */}
                <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <span>🇺🇸</span>
                      <span>美國市場 (NYSE / NASDAQ)</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">紐約華爾街</span>
                  </div>
                  <div className="space-y-2">
                    {usMarkets.map(m => (
                      <div key={m.id} className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">{m.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({m.symbol})</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{m.tradingHours}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-md ${
                            m.isOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}>
                            {m.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. 🛢️ 全球大宗商品 */}
                <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <span>🛢️</span>
                      <span>全球大宗商品 (CME / NYMEX / COMEX)</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">芝加哥 / 紐約</span>
                  </div>
                  <div className="space-y-2">
                    {commMarkets.map(m => (
                      <div key={m.id} className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">{m.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({m.symbol})</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{m.tradingHours}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-md ${
                            m.isOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}>
                            {m.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. 🌐 24/7 加密貨幣市場 */}
                <div className="bg-slate-950/70 border-2 border-emerald-500/40 rounded-2xl p-4 space-y-3 shadow-lg shadow-emerald-500/5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <span>🌐</span>
                      <span>24/7 加密貨幣市場 (Binance 直連)</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold animate-pulse">
                      永不收盤
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cryptoMarkets.map(m => (
                      <div key={m.id} className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/20 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-sm">{m.icon}</span>
                            <div>
                              <span className="font-bold text-xs text-white block leading-tight">{m.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{m.symbol}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                            24/7
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-300 font-mono bg-slate-950/60 p-1.5 rounded-lg border border-white/5 mt-1">
                          {m.note}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: 🚀 跨市場時間旅行 (Global Market Timeline Simulator) */
            <div className="space-y-4">
              <div className="bg-slate-950/80 border border-cyan-400/40 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                    <span>🚀 跨市場時間旅行模擬器</span>
                    <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-mono font-bold">
                      跨越 24 小時時區
                    </span>
                  </h4>
                  <span className="text-xs text-slate-400">點擊下方不同時段，觀察全球資金接力棒</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  全球金融市場就像一場 24 小時永不停歇的接力賽：從台北早盤、台指夜盤、美股開盤、到深夜大宗商品結算，<strong>唯有 Crypto 24/7 永遠張開雙手</strong>！
                </p>
              </div>

              {/* Timeline Station Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {GLOBAL_TIMELINE_STATIONS.map((st, idx) => {
                  const isSelected = selectedStationIndex === idx;
                  return (
                    <button
                      key={st.timeLabel}
                      type="button"
                      onClick={() => setSelectedStationIndex(idx)}
                      className={`p-3 rounded-2xl border transition cursor-pointer text-left flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-950/90 border-cyan-400 shadow-lg ring-2 ring-cyan-400/40'
                          : 'bg-slate-950/60 hover:bg-slate-900 border-white/10'
                      }`}
                    >
                      <span className="font-black text-xs font-mono text-cyan-300 block mb-1">
                        {st.timeLabel}
                      </span>
                      <span className="font-bold text-xs text-white block truncate">
                        {st.title}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Station Deep Dive Card */}
              <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border-2 border-cyan-500/40 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <span className="text-xs font-mono font-black text-cyan-400 block">{selectedStation.timeLabel}</span>
                    <h3 className="text-lg font-black text-white">{selectedStation.title}</h3>
                  </div>
                  <div className="text-xs text-slate-300 max-w-md bg-white/5 p-2 rounded-xl border border-white/10">
                    💡 {selectedStation.narrative}
                  </div>
                </div>

                {/* State Indicators at this hour */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs font-mono">
                  <div className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center ${
                    selectedStation.states.twStock ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/60 border-white/5 text-slate-500'
                  }`}>
                    <span className="font-black text-sm">🇹🇼 台股現貨</span>
                    <span className="text-[11px] font-bold mt-1">{selectedStation.states.twStock ? '🟢 開盤中' : '🔴 休市'}</span>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center ${
                    selectedStation.states.twFutures ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/60 border-white/5 text-slate-500'
                  }`}>
                    <span className="font-black text-sm">⚡ 台指期 (日/夜)</span>
                    <span className="text-[11px] font-bold mt-1">{selectedStation.states.twFutures ? '🟢 交易中' : '🔴 休市'}</span>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center ${
                    selectedStation.states.usStock ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/60 border-white/5 text-slate-500'
                  }`}>
                    <span className="font-black text-sm">🇺🇸 美股</span>
                    <span className="text-[11px] font-bold mt-1">{selectedStation.states.usStock ? '🟢 開盤激戰' : '🔴 休市'}</span>
                  </div>

                  <div className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center ${
                    selectedStation.states.commodities ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/60 border-white/5 text-slate-500'
                  }`}>
                    <span className="font-black text-sm">🛢️ 原油/黃金</span>
                    <span className="text-[11px] font-bold mt-1">{selectedStation.states.commodities ? '🟢 電子盤撮合' : '🔴 休息'}</span>
                  </div>

                  <div className="p-3 rounded-xl border-2 border-emerald-400 bg-emerald-950/60 text-emerald-300 flex flex-col items-center justify-center text-center col-span-2 sm:col-span-1 shadow-lg shadow-emerald-500/10">
                    <span className="font-black text-sm">🌐 24/7 Crypto</span>
                    <span className="text-[11px] font-black text-white mt-1 bg-emerald-500/30 px-2 py-0.5 rounded-full animate-pulse">
                      🟢 永遠 OPEN
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-white/10 flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-400 font-mono">
            期指股市大富翁 · Global Financial Market Simulation Engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black cursor-pointer shadow-md transition"
          >
            返回交易室
          </button>
        </div>
      </div>
    </div>
  );
};
