import React, { useState } from 'react';
import { InstrumentSpec, AssetCategory } from '../types/market';
import { Search, Sparkles, Loader2, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

interface GeminiQuoteAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInstrument: (instrument: InstrumentSpec) => void;
  existingInstruments: InstrumentSpec[];
}

export const GeminiQuoteAssistantModal: React.FC<GeminiQuoteAssistantModalProps> = ({
  isOpen,
  onClose,
  onSelectInstrument,
  existingInstruments,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AssetCategory | 'auto'>('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InstrumentSpec | null>(null);
  const [reasoning, setReasoning] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setReasoning('');

    // 1. First check existing local catalog
    const localMatch = existingInstruments.find(
      inst =>
        inst.symbol.toLowerCase() === query.trim().toLowerCase() ||
        inst.name.toLowerCase().includes(query.trim().toLowerCase())
    );

    if (localMatch) {
      setResult(localMatch);
      setReasoning('已在內建即時市場資料庫中找到該商品，基準收盤價與完整 K 線皆已就緒。');
      setLoading(false);
      return;
    }

    // 2. Query Gemini & FinMind Quote Assistant endpoint
    try {
      const res = await fetch('/api/gemini/quote-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          category: category === 'auto' ? undefined : category,
          benchmarkDate: '2026-09-21',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || json.error || '查詢失敗');
      }

      const d = json.data;
      const parsedSpec: InstrumentSpec = {
        symbol: d.symbol || query.toUpperCase(),
        name: d.name || query,
        category: (d.category as AssetCategory) || 'stocks',
        price: Number(d.closePrice) || 100,
        prevClose: Number(d.openPrice) || Number(d.closePrice) || 100,
        change: Number(d.change) || 0,
        changePercent: Number(d.changePercent) || 0,
        volume: Number(d.volume) || 10000,
        unitLabel: d.unitDescription || '張 (1,000單位)',
        multiplier: Number(d.contractMultiplier) || 1000,
        marginRequirement: Number(d.marginRequirement) || 0,
        strikePrice: d.strikePrice ? Number(d.strikePrice) : undefined,
        expiryDate: d.expiryDate || '2026-10-21',
        description: d.valuationReasoning || `${d.name} 金融衍生性商品定價與走勢資料`,
        klineHistory: Array.isArray(d.klineHistory) && d.klineHistory.length > 0 ? d.klineHistory : [],
      };

      setResult(parsedSpec);
      setReasoning(d.valuationReasoning || 'Gemini 智能查價完成，已精準計算 21 號收盤基準價與合約規格。');
    } catch (err: any) {
      console.error('Gemini lookup error:', err);
      setErrorMsg(err.message || '查詢連線發生異常，請重試或輸入更具體的商品代號');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onSelectInstrument(result);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-slate-900 border-0 sm:border border-slate-700/80 sm:rounded-2xl w-full sm:max-w-2xl overflow-hidden shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 px-3.5 sm:px-6 py-3 sm:py-4 border-b border-slate-800 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
                <span>Gemini 智能查價助手</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-normal">
                  未收錄商品
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                冷門權證、海外標的或特製選擇權，Gemini 自動精算收盤價
              </p>
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

        {/* Content body */}
        <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 touch-scroll overscroll-contain pb-28 sm:pb-6">
          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="輸入代碼或名稱 (如: 00940, 台積電群益認購權證, NVDA, 微台指...)"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
                  autoFocus
                />
              </div>

              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="px-3 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="auto">商品類別: 自動判斷</option>
                <option value="stocks">股票型 (Stocks)</option>
                <option value="bonds">債券 / 債券ETF (Bonds)</option>
                <option value="etfs">ETF 指數基金</option>
                <option value="futures">期貨 (Futures)</option>
                <option value="options">選擇權 (Options)</option>
                <option value="warrants">權證 (Warrants)</option>
              </select>

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-950 transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{loading ? 'AI 定價估算中...' : '智能查價'}</span>
              </button>
            </div>

            {/* Quick Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span className="text-slate-500">熱門試查：</span>
              {['00940 元大台灣價值高息', '台積電凱基43購01', 'TXO-26000-C 買權', '微型台指期 TMF', '00933B 國泰10Y+金融債'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setQuery(tag);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  {tag}
                </button>
              ))}
            </div>
          </form>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Result Card */}
          {result && (
            <div className="bg-slate-950/90 border border-sky-500/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-xs font-bold rounded bg-sky-950 text-sky-400 border border-sky-800 font-mono">
                    {result.symbol}
                  </span>
                  <span className="font-bold text-slate-100 text-base">{result.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {result.category.toUpperCase()}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">21號基準收盤價</div>
                  <div className="text-lg font-bold font-mono text-cyan-400">
                    NT$ {result.price.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Grid Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-500 block">交易單位規格</span>
                  <span className="text-slate-200 font-medium">{result.unitLabel}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">契約乘數 / 股數</span>
                  <span className="text-slate-200 font-medium">{result.multiplier.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">每口原始保證金</span>
                  <span className="text-amber-400 font-medium">
                    {result.marginRequirement > 0 ? `NT$ ${result.marginRequirement.toLocaleString()}` : '現股/免保證金'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">履約價 / 到期合約</span>
                  <span className="text-slate-200 font-medium">
                    {result.strikePrice ? `${result.strikePrice} 點` : result.expiryDate || '現貨無限期'}
                  </span>
                </div>
              </div>

              {/* Reasoning */}
              {reasoning && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-200">Gemini 智能分析依據：</span> {reasoning}
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleApply}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-950 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>採用此商品並立即進行 5000 萬下單</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
