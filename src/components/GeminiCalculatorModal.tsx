import React, { useState } from 'react';
import {
  Calculator,
  Sparkles,
  TrendingUp,
  Shield,
  Zap,
  Target,
  ArrowRight,
  RefreshCw,
  HelpCircle,
  Percent,
  CheckCircle2,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { InstrumentSpec, StudentProfile } from '../types/market';
import { Term } from './Term';
import { useGlossary } from '../context/GlossaryContext';
import { BookOpen, Key } from 'lucide-react';
import { GroqKeyManagerModal } from './GroqKeyManagerModal';

interface GeminiCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: StudentProfile;
  allInstruments: InstrumentSpec[];
  initialInstrument?: InstrumentSpec;
  isSuperUser?: boolean;
  onApplyTradeOrder: (order: {
    symbol: string;
    name: string;
    category: any;
    orderType: any;
    price: number;
    quantity: number;
    notes: string;
  }) => void;
}

export type CalcMode =
  | 'position_sizing'
  | 'futures_leverage'
  | 'options_breakeven'
  | 'hedging_ratio'
  | 'custom_prompt';

export const GeminiCalculatorModal: React.FC<GeminiCalculatorModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  allInstruments,
  initialInstrument,
  isSuperUser = false,
  onApplyTradeOrder,
}) => {
  const { openDrawer } = useGlossary();
  const [calcMode, setCalcMode] = useState<CalcMode>('position_sizing');
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    initialInstrument?.symbol || '2330'
  );
  const [targetAmountInput, setTargetAmountInput] = useState<string>('10000000'); // 10M default
  const [targetQuantityInput, setTargetQuantityInput] = useState<string>('4');
  const [orderDirection, setOrderDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [customPromptInput, setCustomPromptInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState<'groq' | 'gemini'>('groq');
  const [isGroqManagerOpen, setIsGroqManagerOpen] = useState<boolean>(false);
  const [groqKeyCount, setGroqKeyCount] = useState<number>(0);
  const [lastRunMeta, setLastRunMeta] = useState<{
    provider: string;
    model: string;
    slot?: number;
    latencyMs?: number;
    keyMasked?: string;
  } | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Check Groq pool status
  const refreshGroqStatus = () => {
    fetch('/api/groq/status')
      .then(r => r.json())
      .then(d => {
        if (d && typeof d.configuredCount === 'number') {
          setGroqKeyCount(d.configuredCount);
          if (d.configuredCount > 0) {
            setSelectedProvider('groq');
          }
        }
      })
      .catch(() => {});
  };

  React.useEffect(() => {
    if (isOpen) {
      refreshGroqStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentInstrument =
    allInstruments.find(i => i.symbol === selectedSymbol) || allInstruments[0];

  // Quick preset amounts (percentage of 50M)
  const setQuickPct = (pct: number) => {
    const amt = Math.round(50000000 * (pct / 100));
    setTargetAmountInput(amt.toString());
  };

  // Run AI Financial Calculation
  const handleRunAiCalculation = async (overridePrompt?: string) => {
    setLoading(true);
    setCalcResult(null);
    setCalcError(null);
    setLastRunMeta(null);

    const promptToSend = overridePrompt || customPromptInput;

    try {
      const res = await fetch('/api/gemini/financial-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calcType: calcMode,
          provider: selectedProvider,
          instrument: currentInstrument,
          portfolio: {
            studentName: currentProfile.studentName,
            availableCash: currentProfile.availableCash,
            marginDeposits: currentProfile.marginDeposits,
            currentPositions: currentProfile.positions.map(p => ({
              symbol: p.symbol,
              name: p.name,
              category: p.category,
              quantity: p.quantity,
              entryPrice: p.entryPrice,
              notionalValue: p.notionalValue,
            })),
          },
          targetAmount: parseFloat(targetAmountInput) || 0,
          targetQuantity: parseFloat(targetQuantityInput) || 1,
          scenarioChangePct: '5%',
          userQuery: promptToSend,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setCalcResult(json.data);
        setLastRunMeta({
          provider: json.provider || selectedProvider,
          model: json.model || (json.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-3.8-flash'),
          slot: json.slot,
          latencyMs: json.latencyMs,
          keyMasked: json.keyMasked,
        });
      } else {
        setCalcError(json.message || '計算失敗，請檢查金鑰或網路連線');
      }
    } catch (e: any) {
      console.error('Calculation error:', e);
      setCalcError('網路連線失敗，請檢查後端服務');
    } finally {
      setLoading(false);
    }
  };

  // Local instant math metrics before clicking AI
  const unitMultiplier = currentInstrument.multiplier || 1000;
  const currentPrice = currentInstrument.price || 1;
  const targetAmtNum = parseFloat(targetAmountInput) || 0;
  const targetQtyNum = parseFloat(targetQuantityInput) || 1;

  // Local math: estimated units based on amount
  const estimatedShares = Math.floor(targetAmtNum / currentPrice);
  const estimatedSheets = Math.floor(estimatedShares / (unitMultiplier || 1));
  const estimatedTotalCost =
    currentInstrument.category === 'futures'
      ? (currentInstrument.marginRequirement || 320000) * targetQtyNum
      : currentInstrument.category === 'options'
      ? currentPrice * (currentInstrument.multiplier || 50) * targetQtyNum
      : estimatedSheets * (unitMultiplier || 1000) * currentPrice;

  const pctOf50M = ((estimatedTotalCost / 50000000) * 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-hidden">
      <div className="relative w-full sm:max-w-4xl bg-slate-900 border-0 sm:border border-cyan-500/40 sm:rounded-3xl shadow-2xl shadow-cyan-950/80 overflow-hidden h-full sm:h-auto sm:max-h-[92vh] flex flex-col">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/80 border-b border-slate-800 px-3.5 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950 ring-1 ring-cyan-400/40 shrink-0">
              <Calculator className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
                  {selectedProvider === 'groq' ? '⚡ Groq Llama 3.3 財務量化計算機' : '✨ Gemini AI 智能財務量化計算機'}
                </h2>
                <span className="hidden xs:inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  即時行情連線
                </span>
              </div>

              {/* Provider Selection & 10-Key Secrets Manager */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <div className="inline-flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-700 text-[10px] font-black">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider('groq')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
                      selectedProvider === 'groq'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="優先使用 Groq 免費極速算力 (Llama-3.3-70B)"
                  >
                    <span>⚡ Groq (免費極速)</span>
                    {groqKeyCount > 0 && (
                      <span className="px-1 py-0.2 bg-black/20 rounded font-mono text-[9px]">
                        {groqKeyCount}組就緒
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedProvider('gemini')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
                      selectedProvider === 'gemini'
                        ? 'bg-sky-600 text-white font-black shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="使用 Google Gemini 2.5 Flash"
                  >
                    <span>✨ Gemini 2.5</span>
                  </button>
                </div>

                {/* Groq Key Manager Button - ONLY for Superuser */}
                {isSuperUser && (
                  <button
                    type="button"
                    onClick={() => setIsGroqManagerOpen(true)}
                    className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 text-[10px] font-black flex items-center gap-1 cursor-pointer transition active:scale-95"
                    title="管理 10 組 Groq Token 輪詢池 (Secrets) · 僅 Superuser"
                  >
                    <Key className="w-3 h-3 text-amber-400" />
                    <span>10組金鑰輪詢池 ({groqKeyCount}/10)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-slate-300 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition cursor-pointer text-base font-bold shrink-0"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-3 sm:px-5 pt-2 sm:pt-3 border-b border-slate-800/80 bg-slate-950/50 flex gap-1.5 overflow-x-auto no-scrollbar scrollbar-none shrink-0 text-xs">
          {[
            {
              id: 'position_sizing',
              label: '1. 部位規模與資金佔比',
              icon: TrendingUp,
              color: 'text-cyan-400',
            },
            {
              id: 'futures_leverage',
              label: '2. 期貨槓桿與跳動點損益',
              icon: Zap,
              color: 'text-amber-400',
            },
            {
              id: 'options_breakeven',
              label: '3. 選擇權/權證損益打平點',
              icon: Target,
              color: 'text-purple-400',
            },
            {
              id: 'hedging_ratio',
              label: '4. 5000萬全資產多空對沖',
              icon: Shield,
              color: 'text-emerald-400',
            },
            {
              id: 'custom_prompt',
              label: '5. Gemini 自然語言提問計算',
              icon: Sparkles,
              color: 'text-sky-400',
            },
          ].map(tab => {
            const Icon = tab.icon;
            const isSelected = calcMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setCalcMode(tab.id as CalcMode);
                  setCalcResult(null);
                }}
                className={`px-3 py-2 rounded-t-xl transition font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 border-t border-x border-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Content Area */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 sm:space-y-5 flex-1 touch-scroll overscroll-contain pb-28 sm:pb-6">
          {/* Top Instrument Selector Bar (Applicable to Mode 1, 2, 3) */}
          {calcMode !== 'hedging_ratio' && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">試算目標商品：</span>
                <select
                  value={selectedSymbol}
                  onChange={e => setSelectedSymbol(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-bold focus:border-cyan-400 focus:outline-none"
                >
                  <optgroup label="股票型 (TWSE 收盤價)">
                    {allInstruments
                      .filter(i => i.category === 'stocks')
                      .map(i => (
                        <option key={i.symbol} value={i.symbol}>
                          {i.symbol} {i.name} (NT$ {i.price.toLocaleString()})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="債券型與 ETF (收盤價)">
                    {allInstruments
                      .filter(i => i.category === 'bonds' || i.category === 'etfs')
                      .map(i => (
                        <option key={i.symbol} value={i.symbol}>
                          {i.symbol} {i.name} (NT$ {i.price.toLocaleString()})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="期貨型 (TAIFEX 收盤點數/保證金)">
                    {allInstruments
                      .filter(i => i.category === 'futures')
                      .map(i => (
                        <option key={i.symbol} value={i.symbol}>
                          {i.symbol} {i.name} ({i.price.toLocaleString()} 點 · 保證金 {((i.marginRequirement || 0) / 10000).toFixed(0)}萬)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="選擇權與權證 (權利金點數)">
                    {allInstruments
                      .filter(i => i.category === 'options' || i.category === 'warrants')
                      .map(i => (
                        <option key={i.symbol} value={i.symbol}>
                          {i.symbol} {i.name} ({i.price} 點)
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Real Quote Pill */}
              <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl">
                <span className="text-slate-400">真實基準日收盤：</span>
                <span className="font-mono font-bold text-slate-100">
                  {currentInstrument.price >= 1000
                    ? currentInstrument.price.toLocaleString()
                    : currentInstrument.price}{' '}
                  {currentInstrument.category === 'futures' ? '點' : '元'}
                </span>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    currentInstrument.change >= 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {currentInstrument.change >= 0 ? '+' : ''}
                  {currentInstrument.changePercent}%
                </span>
              </div>
            </div>
          )}

          {/* Mode 1: 部位規模與資金佔比 */}
          {calcMode === 'position_sizing' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Input Card */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      欲配置之資金金額 (NT$)：
                    </label>
                    <div className="flex gap-1">
                      {[10, 20, 30, 50].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setQuickPct(pct)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-mono text-xs">
                      NT$
                    </span>
                    <input
                      type="number"
                      value={targetAmountInput}
                      onChange={e => setTargetAmountInput(e.target.value)}
                      className="w-full pl-12 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono font-bold text-sm focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  {/* Quick Local Math Readout */}
                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>可換算買進張數：</span>
                      <span className="font-mono font-bold text-cyan-300">
                        {estimatedSheets} 張 ({estimatedSheets * 1000} 股)
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>預計實際支出：</span>
                      <span className="font-mono font-bold text-slate-200">
                        NT$ {estimatedTotalCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>佔 5000 萬總部位比重：</span>
                      <span className="font-mono font-bold text-amber-300">
                        {pctOf50M} %
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunAiCalculation()}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-bold text-xs shadow-lg shadow-cyan-950 flex items-center justify-center gap-1.5 transition"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    )}
                    <span>Gemini 智能深度試算（損益矩陣與防守線）</span>
                  </button>
                </div>

                {/* Strategy Insight */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        <span>5000萬<Term id="position_sizing">部位配置</Term>紀律指引：</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => openDrawer('position_sizing', 'risk')}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>名詞小學堂</span>
                      </button>
                    </div>
                    <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
                      <li>
                        • <strong className="text-slate-200">單一<Term id="qvstock">權值股</Term>上限：</strong>
                        建議單一個股（如台積電 2330）資金不宜超過總資本 40% (2000萬)，以防<Term id="systemic_risk">系統性風險</Term>與大幅<Term id="max_drawdown">回撤</Term>。
                      </li>
                      <li>
                        • <strong className="text-slate-200">現金緩衝水庫：</strong>
                        維持至少 10%~20% (500萬~1000萬) 現金，以便在<Term id="maintenance_margin_fut">期貨保證金</Term><Term id="margin_call_fut">追繳</Term>或拉回加碼時保有絕對彈性。
                      </li>
                      <li>
                        • <strong className="text-slate-200">股債均衡效益：</strong>
                        若重押現股 3000 萬，搭配 1000 萬長天期<Term id="bond_etf">美債 ETF</Term> (00679B)，可獲取配息與降息利得。
                      </li>
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
                    目前帳戶可用現金：NT$ {currentProfile.availableCash.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: 期貨槓桿與跳動點損益 */}
          {calcMode === 'futures_leverage' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      計畫下單口數 (Contracts)：
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOrderDirection('LONG')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                          orderDirection === 'LONG'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        作多買進
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderDirection('SHORT')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                          orderDirection === 'SHORT'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        作空避險
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={targetQuantityInput}
                      onChange={e => setTargetQuantityInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono font-bold text-sm focus:border-amber-400 focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-400 shrink-0">口</span>
                  </div>

                  {/* Futures Margin Calculation Box */}
                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                       <span>契約總市值 (Notional Value)：</span>
                      <span className="font-mono font-bold text-slate-200">
                        NT${' '}
                        {(
                          currentInstrument.price *
                          (currentInstrument.multiplier || 200) *
                          targetQtyNum
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>需繳交原始保證金：</span>
                      <span className="font-mono font-bold text-amber-300">
                        NT${' '}
                        {(
                          (currentInstrument.marginRequirement || 320000) * targetQtyNum
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>實質槓桿倍數 (Leverage)：</span>
                      <span className="font-mono font-bold text-rose-400">
                        {(
                          (currentInstrument.price *
                            (currentInstrument.multiplier || 200)) /
                          (currentInstrument.marginRequirement || 320000)
                        ).toFixed(1)}{' '}
                        倍
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>每跳動 1 點之盈虧：</span>
                      <span className="font-mono font-bold text-cyan-300">
                        NT${' '}
                        {(
                          (currentInstrument.multiplier || 200) * targetQtyNum
                        ).toLocaleString()}{' '}
                        元
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunAiCalculation()}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-bold text-xs shadow-lg shadow-amber-950 flex items-center justify-center gap-1.5 transition"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Gemini 試算跳動點損益與追繳警戒</span>
                  </button>
                </div>

                {/* Futures Sensitivity Table */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-2">
                    指數波動損益即時敏感度矩陣（{targetQtyNum} 口）：
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-500 text-[11px]">
                          <th className="py-1 text-left">指數變動</th>
                          <th className="py-1 text-right">目標點數</th>
                          <th className="py-1 text-right">損益金額</th>
                          <th className="py-1 text-right">保證金報酬率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {[
                          { pts: 500, label: '+500 點噴出' },
                          { pts: 200, label: '+200 點波段' },
                          { pts: -200, label: '-200 點震盪' },
                          { pts: -500, label: '-500 點大跌' },
                        ].map((row, idx) => {
                          const multiplier = currentInstrument.multiplier || 200;
                          const pnl =
                            orderDirection === 'LONG'
                              ? row.pts * multiplier * targetQtyNum
                              : -row.pts * multiplier * targetQtyNum;
                          const totalMargin =
                            (currentInstrument.marginRequirement || 320000) * targetQtyNum;
                          const ret = ((pnl / totalMargin) * 100).toFixed(1);
                          return (
                            <tr key={idx} className="hover:bg-slate-900/60">
                              <td className="py-1.5 text-slate-300 font-sans">{row.label}</td>
                              <td className="py-1.5 text-right text-slate-400">
                                {(currentInstrument.price + row.pts).toLocaleString()}
                              </td>
                              <td
                                className={`py-1.5 text-right font-bold ${
                                  pnl >= 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {pnl >= 0 ? '+' : ''}NT$ {pnl.toLocaleString()}
                              </td>
                              <td
                                className={`py-1.5 text-right font-bold ${
                                  pnl >= 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {pnl >= 0 ? '+' : ''}
                                {ret}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 3: 選擇權/權證損益打平點 */}
          {calcMode === 'options_breakeven' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <label className="text-xs font-bold text-slate-300 block">
                    購買口數 (Contracts)：
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={targetQuantityInput}
                    onChange={e => setTargetQuantityInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 font-mono font-bold text-sm focus:border-purple-400 focus:outline-none"
                  />

                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>每口權利金成本 (50元/點)：</span>
                      <span className="font-mono font-bold text-purple-300">
                        NT$ {(currentInstrument.price * 50).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>總投資金額 (最大風險)：</span>
                      <span className="font-mono font-bold text-slate-200">
                        NT$ {(currentInstrument.price * 50 * targetQtyNum).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>損益兩平點 (Breakeven)：</span>
                      <span className="font-mono font-bold text-yellow-300">
                        {currentInstrument.strikePrice
                          ? currentInstrument.symbol.includes('-C')
                            ? currentInstrument.strikePrice + currentInstrument.price
                            : currentInstrument.strikePrice - currentInstrument.price
                          : '履約價 ± 權利金點數'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunAiCalculation()}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-950 flex items-center justify-center gap-1.5 transition"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    )}
                    <span>Gemini 試算非線性到期損益圖</span>
                  </button>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-purple-400 flex items-center gap-1 mb-2">
                      <Target className="w-4 h-4" />
                      選擇權非對稱特性分析：
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      買方（Buyer）具備「<strong>損失有限、獲利無窮</strong>」之數學優勢。
                      例如買進 47000-Put 作為 5000 萬資產避險，若市場平穩僅損失微薄權利金；若發生系統性黑天鵝崩跌，賣權權利金將噴漲數十倍，完全補償現貨回撤。
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-800/60 text-[11px] text-purple-200">
                    💡 提示：若結算點數超過損益兩平點，每一點獲利 NT$ 50 × {targetQtyNum} 口！
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 4: 5000萬全資產多空避險比率 */}
          {calcMode === 'hedging_ratio' && (
            <div className="space-y-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <Shield className="w-4 h-4" />
                      5000萬資產組合多空對沖比率 (Portfolio Beta & Delta Hedging)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      分析您目前持有的現貨總額，精算需要配置多少口台指期空單或賣權以達最佳防禦
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleRunAiCalculation(
                        '請精算我目前的現貨資產市值，需要放空幾口大台指期或買進幾口 TXO 47000 賣權才能達到完全避險？並分析避險成本與極端行情下的損益抵銷效果。'
                      )
                    }
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 shrink-0"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Gemini 全面精算避險組合</span>
                  </button>
                </div>

                {/* Portfolio Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">現有持倉部位數</span>
                    <span className="text-sm font-bold text-slate-100">
                      {currentProfile.positions.length} 檔
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">現貨與ETF總市值</span>
                    <span className="text-sm font-mono font-bold text-cyan-400">
                      NT${' '}
                      {Math.round(
                        currentProfile.positions
                          .filter(p => p.category !== 'futures')
                          .reduce((s, p) => s + p.notionalValue, 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">期貨多/空淨口數</span>
                    <span className="text-sm font-mono font-bold text-amber-400">
                      {currentProfile.positions
                        .filter(p => p.category === 'futures')
                        .reduce(
                          (s, p) =>
                            p.orderType.includes('SHORT') ? s - p.quantity : s + p.quantity,
                          0
                        )}{' '}
                      口
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">避險保險箱資金</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">
                      NT$ {currentProfile.availableCash.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 5: Gemini 萬能自然語言提問計算 */}
          {calcMode === 'custom_prompt' && (
            <div className="space-y-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  輸入任何想要 Gemini 幫您量化計算的投資情境：
                </label>
                <textarea
                  rows={3}
                  value={customPromptInput}
                  onChange={e => setCustomPromptInput(e.target.value)}
                  placeholder="例如：如果我拿 1500 萬買台積電、1000 萬買元大美債20年，剩下的錢放空台指期避險，大盤跌 1000 點時我的整體損益是多少？"
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:border-sky-400 focus:outline-none placeholder-slate-500"
                />

                {/* Preset Prompt Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-500 self-center mr-1">推薦試算範例：</span>
                  {[
                    '如果台積電漲到 2800 元，我買 8 張能賺多少？',
                    '放空 2 口台指期(48077點)，大盤跌 500 點我能賺多少錢？',
                    '買 10 口 TXO-49000-C 買權，到期結算到 51000 點的獲利倍數？',
                    '用 2000 萬資金配置美債 00679B，年化息收與降息資本利得是多少？',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCustomPromptInput(preset);
                        handleRunAiCalculation(preset);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-800 text-[11px] transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleRunAiCalculation()}
                  disabled={loading || !customPromptInput.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-sky-950 flex items-center justify-center gap-1.5 transition"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Calculator className="w-3.5 h-3.5" />
                  )}
                  <span>啟動 Gemini AI 智能量化精算</span>
                </button>
              </div>
            </div>
          )}

          {/* AI Calculation Results Box */}
          {calcResult && (
            <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl p-5 space-y-4 shadow-xl shadow-cyan-950/40 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs">
                    AI
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-100">
                      {calcResult.calculatorTitle || 'Gemini 智能試算成果'}
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      公式依據：{calcResult.formulaUsed || '金融工程精算法則'}
                    </span>
                  </div>
                </div>

                {calcResult.suggestedOrder?.canApplyToTrade && (
                  <button
                    onClick={() => {
                      onApplyTradeOrder({
                        symbol: calcResult.suggestedOrder.symbol || currentInstrument.symbol,
                        name: calcResult.suggestedOrder.name || currentInstrument.name,
                        category: calcResult.suggestedOrder.category || currentInstrument.category,
                        orderType:
                          calcResult.suggestedOrder.orderType ||
                          (currentInstrument.category === 'futures'
                            ? orderDirection === 'SHORT'
                              ? 'SELL_FUTURES_SHORT'
                              : 'BUY_FUTURES_LONG'
                            : 'BUY_STOCK'),
                        price: calcResult.suggestedOrder.price || currentInstrument.price,
                        quantity: calcResult.suggestedOrder.quantity || targetQtyNum,
                        notes:
                          calcResult.suggestedOrder.notes ||
                          `依 Gemini AI 計算機試算配置 (${calcResult.calculatorTitle})`,
                      });
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-md shadow-emerald-950 flex items-center gap-1.5 transition"
                  >
                    <span>📥 一鍵將 AI 試算部位帶入下單終端機</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Key Metrics Grid */}
              {calcResult.keyMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {calcResult.keyMetrics.map((metric: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border ${
                        metric.highlight
                          ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400 block line-clamp-1">
                        {metric.label}
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-100 mt-0.5 block">
                        {metric.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Scenario Matrix Table */}
              {calcResult.scenarioMatrix && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-1.5">
                    多空情境損益矩陣分析 (Scenario Analysis)：
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-xs text-left bg-slate-900/60">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px]">
                        <tr>
                          <th className="py-2 px-3">情境設定</th>
                          <th className="py-2 px-3 text-right">目標價/點數</th>
                          <th className="py-2 px-3 text-right">預期損益金額</th>
                          <th className="py-2 px-3 text-right">報酬率</th>
                          <th className="py-2 px-3">策略意涵</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono text-xs">
                        {calcResult.scenarioMatrix.map((row: any, idx: number) => {
                          const isPos = String(row.pnlAmount).startsWith('+') || Number(row.pnlAmount) > 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="py-2 px-3 font-sans font-bold text-slate-200">
                                {row.scenario}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-300">
                                {row.targetPrice?.toLocaleString?.() || row.targetPrice}
                              </td>
                              <td
                                className={`py-2 px-3 text-right font-bold ${
                                  isPos ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                NT$ {row.pnlAmount?.toLocaleString?.() || row.pnlAmount}
                              </td>
                              <td
                                className={`py-2 px-3 text-right font-bold ${
                                  isPos ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {row.returnPct}
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                                {row.description}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* AI Narrative Analysis */}
              {calcResult.aiAnalysis && (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold text-sky-400 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Gemini 量化操盤與風險防守建議：</span>
                  </div>
                  <p>{calcResult.aiAnalysis}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Groq 10-Slot Token Secrets Manager Modal - ONLY for Superuser */}
      {isSuperUser && (
        <GroqKeyManagerModal
          isOpen={isGroqManagerOpen}
          onClose={() => {
            setIsGroqManagerOpen(false);
            refreshGroqStatus();
          }}
          onKeysUpdated={refreshGroqStatus}
          isSuperUser={isSuperUser}
        />
      )}
    </div>
  );
};
