import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Filter,
  Download,
  Copy,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Camera,
  FileSpreadsheet,
  Layers,
  Clock,
  Sparkles,
  PieChart,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { StudentProfile, Position, TradeRecord, InstrumentSpec, AssetCategory, OrderAction } from '../types/market';
import { getInstrumentTradingClock, getMarketSessionOverview, InstrumentClockResult } from '../utils/tradingClock';
import { useGlossary } from '../context/GlossaryContext';

interface TradeStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: StudentProfile;
  allInstruments: InstrumentSpec[];
  onClosePosition: (positionId: string) => void;
  onViewInstrumentKLine?: (instrument: InstrumentSpec) => void;
  onOpenTrading: (inst?: InstrumentSpec) => void;
  onSeedSamplePortfolio?: () => void;
}

export const TradeStatementModal: React.FC<TradeStatementModalProps> = ({
  isOpen,
  onClose,
  profile,
  allInstruments,
  onClosePosition,
  onViewInstrumentKLine,
  onOpenTrading,
  onSeedSamplePortfolio,
}) => {
  const { openPositionLesson } = useGlossary();
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');
  const [actionFilter, setActionFilter] = useState<'all' | 'long' | 'short'>('all');
  const [sortBy, setSortBy] = useState<'pnl_desc' | 'pnl_asc' | 'value_desc' | 'date_desc'>('value_desc');
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [nonTradableAlert, setNonTradableAlert] = useState<{ pos: Position; clock: InstrumentClockResult } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sessionOverview = useMemo(() => {
    return getMarketSessionOverview(currentTime);
  }, [currentTime]);

  const positions = profile?.positions || [];
  const history = profile?.tradeHistory || [];

  // Summary Metrics
  const totalCost = positions.reduce((acc, p) => acc + (p.totalCostOrMargin || 0), 0);
  const totalMarketVal = positions.reduce((acc, p) => acc + (p.notionalValue || 0), 0);
  const totalUnrealizedPnL = positions.reduce((acc, p) => acc + (p.unrealizedPnL || 0), 0);
  const totalRealizedPnL = history.reduce((acc, h) => acc + (h.realizedPnL || 0), 0);
  const totalNetAsset = (profile?.availableCash || 0) + totalCost + totalUnrealizedPnL;

  // Filtered Positions
  const filteredPositions = useMemo(() => {
    return positions.filter(pos => {
      const q = searchQuery.trim().toLowerCase();
      const matchQuery = !q || pos.symbol.toLowerCase().includes(q) || pos.name.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'all' || pos.category === categoryFilter;
      const isLong =
        pos.orderType === 'BUY_STOCK' ||
        pos.orderType === 'BUY_ETF' ||
        pos.orderType === 'BUY_BOND' ||
        pos.orderType === 'BUY_FUTURES_LONG' ||
        pos.orderType === 'BUY_CALL_OPTION' ||
        pos.orderType === 'BUY_CALL_WARRANT';
      const matchAction =
        actionFilter === 'all' ||
        (actionFilter === 'long' && isLong) ||
        (actionFilter === 'short' && !isLong);

      return matchQuery && matchCat && matchAction;
    }).sort((a, b) => {
      if (sortBy === 'pnl_desc') return b.unrealizedPnL - a.unrealizedPnL;
      if (sortBy === 'pnl_asc') return a.unrealizedPnL - b.unrealizedPnL;
      if (sortBy === 'value_desc') return b.notionalValue - a.notionalValue;
      return 0;
    });
  }, [positions, searchQuery, categoryFilter, actionFilter, sortBy]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    return history.filter(rec => {
      const q = searchQuery.trim().toLowerCase();
      const matchQuery = !q || rec.symbol.toLowerCase().includes(q) || rec.name.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'all' || rec.category === categoryFilter;
      const isLong =
        rec.action === 'BUY_STOCK' ||
        rec.action === 'BUY_ETF' ||
        rec.action === 'BUY_BOND' ||
        rec.action === 'BUY_FUTURES_LONG' ||
        rec.action === 'BUY_CALL_OPTION' ||
        rec.action === 'BUY_CALL_WARRANT';
      const matchAction =
        actionFilter === 'all' ||
        (actionFilter === 'long' && isLong) ||
        (actionFilter === 'short' && !isLong);

      return matchQuery && matchCat && matchAction;
    }).sort((a, b) => {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
  }, [history, searchQuery, categoryFilter, actionFilter]);

  if (!isOpen) return null;

  // Export CSV
  const handleExportCSV = () => {
    if (activeTab === 'positions') {
      const headers = ['標的代號', '商品名稱', '商品類別', '方向動作', '成交單價', '最新市價', '持倉單位/數量', '佔用資金/保證金', '部位市值', '未實現損益', '報酬率%', '建倉日期', '投資理由'];
      const rows = filteredPositions.map(p => [
        p.symbol,
        p.name,
        p.category,
        p.orderType,
        p.entryPrice,
        p.currentPrice,
        p.quantity,
        p.totalCostOrMargin,
        p.notionalValue,
        p.unrealizedPnL,
        `${p.unrealizedPnLPercent}%`,
        `"${p.entryDate || ''}"`,
        `"${p.notes || ''}"`,
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${profile.studentName}_存倉部位清單_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = ['成交時間', '標的代號', '商品名稱', '類別', '交易動作', '成交價格', '數量', '成交金額/保證金', '已實現損益', '決策理由'];
      const rows = filteredHistory.map(h => [
        `"${h.dateLabel || h.timestamp}"`,
        h.symbol,
        h.name,
        h.category,
        h.action,
        h.price,
        h.quantity,
        h.amount,
        h.realizedPnL || 0,
        `"${h.rationale || ''}"`,
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${profile.studentName}_歷史交易對帳單_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Copy to clipboard
  const handleCopyText = () => {
    let text = '';
    if (activeTab === 'positions') {
      text = `【${profile.studentName} 5000萬股市大富翁 - 當前存倉部位清單】\n` +
        `總淨值: NT$ ${Math.round(totalNetAsset).toLocaleString()} | 可用現金: NT$ ${Math.round(profile.availableCash).toLocaleString()}\n` +
        `持倉檔數: ${filteredPositions.length} 檔 | 未實現總損益: NT$ ${Math.round(totalUnrealizedPnL).toLocaleString()}\n----------------------------------------\n` +
        filteredPositions.map((p, idx) =>
          `${idx + 1}. [${p.symbol}] ${p.name} (${p.category.toUpperCase()}) | 數量: ${p.quantity} | 成本: NT$ ${p.entryPrice} | 現價: NT$ ${p.currentPrice} | 市值: NT$ ${Math.round(p.notionalValue).toLocaleString()} | 損益: NT$ ${Math.round(p.unrealizedPnL).toLocaleString()} (${p.unrealizedPnLPercent}%)`
        ).join('\n');
    } else {
      text = `【${profile.studentName} 5000萬股市大富翁 - 歷史買賣交易對帳單】\n` +
        `總成交筆數: ${filteredHistory.length} 筆 | 累計已實現損益: NT$ ${Math.round(totalRealizedPnL).toLocaleString()}\n----------------------------------------\n` +
        filteredHistory.map((h, idx) =>
          `${idx + 1}. ${h.dateLabel || h.timestamp} | [${h.symbol}] ${h.name} | 動作: ${h.action} | 單價: NT$ ${h.price} | 數量: ${h.quantity} | 總額: NT$ ${Math.round(h.amount).toLocaleString()}${h.realizedPnL ? ` | 平倉損益: NT$ ${Math.round(h.realizedPnL).toLocaleString()}` : ''}`
        ).join('\n');
    }

    navigator.clipboard.writeText(text);
    setCopiedNotice('已複製對帳清單至剪貼簿！可直接貼上至 PPT、Excel 或 Word 報告。');
    setTimeout(() => setCopiedNotice(null), 3000);
  };

  const getActionBadge = (action: OrderAction) => {
    switch (action) {
      case 'BUY_STOCK': return { label: '現股買進 (多)', bg: 'bg-rose-100 text-rose-900 border-rose-300' };
      case 'SHORT_SELL_STOCK': return { label: '融券放空 (空)', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 'BUY_MARGIN_STOCK': return { label: '融資買進 (槓桿)', bg: 'bg-orange-100 text-orange-900 border-orange-300' };
      case 'BUY_BOND': return { label: '債券ETF買進', bg: 'bg-blue-100 text-blue-900 border-blue-300' };
      case 'BUY_ETF': return { label: '指數ETF買進', bg: 'bg-amber-100 text-amber-900 border-amber-300' };
      case 'SHORT_SELL_ETF': return { label: 'ETF融券放空', bg: 'bg-teal-100 text-teal-900 border-teal-300' };
      case 'BUY_FUTURES_LONG': return { label: '期貨多單 (作多)', bg: 'bg-purple-100 text-purple-900 border-purple-300' };
      case 'SELL_FUTURES_SHORT': return { label: '期貨空單 (避險)', bg: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
      case 'BUY_CALL_OPTION': return { label: '買進買權 (Buy Call)', bg: 'bg-rose-100 text-rose-900 border-rose-300' };
      case 'BUY_PUT_OPTION': return { label: '買進賣權 (Buy Put)', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 'SELL_CALL_OPTION': return { label: '賣出買權 (Sell Call)', bg: 'bg-slate-100 text-slate-900 border-slate-300' };
      case 'SELL_PUT_OPTION': return { label: '賣出賣權 (Sell Put)', bg: 'bg-slate-100 text-slate-900 border-slate-300' };
      case 'BUY_CALL_WARRANT': return { label: '認購權證 (多)', bg: 'bg-pink-100 text-pink-900 border-pink-300' };
      case 'BUY_PUT_WARRANT': return { label: '認售權證 (空)', bg: 'bg-cyan-100 text-cyan-900 border-cyan-300' };
      default: return { label: String(action), bg: 'bg-slate-100 text-slate-900 border-slate-300' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border-2 border-slate-300 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-6 py-4 border-b border-amber-400 flex items-center justify-between text-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-amber-300 flex items-center justify-center text-xl shadow-xs">
              📋
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-lg text-slate-950">
                  個人存倉部位與買賣交易紀錄查詢對帳中心
                </h3>
                <span className="px-2 py-0.5 rounded text-xs font-black bg-slate-950 text-amber-300">
                  操盤手：{profile.studentName}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-white text-slate-900 border border-amber-300">
                  {profile.teamName}
                </span>
              </div>
              <p className="text-xs text-slate-900 font-semibold mt-0.5">
                FinMind 真實交易所連線存證 · 涵蓋股票/債券/ETF/期貨/選擇權全方位對帳
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-black/10 text-slate-950 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Market Session Engine 新手交易時間導航 ─── */}
        <div className="bg-slate-950 text-white px-6 py-3 border-b border-slate-800 shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Current Market Status Light & Clock */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
                sessionOverview.isCashOpen
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}>
                {sessionOverview.isCashOpen ? '🟢' : '🔴'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm sm:text-base">
                    {sessionOverview.isCashOpen ? '台股集中市場｜一般交易撮合中' : '台股集中市場｜目前休市'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700 text-[10px] font-mono">
                    台灣時間 {sessionOverview.twTimeStr}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 font-mono">
                  {sessionOverview.isCashOpen ? (
                    <span className="text-emerald-400 font-bold">🟢 股票現貨可即時委託撮合成交（今日收盤時間 13:30）</span>
                  ) : (
                    <span className="text-amber-300 font-bold">
                      ❌ 股票現貨目前無法成交 ｜ 下一次可交易：<b className="text-white underline">明日 09:00 (集中市場開盤)</b>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 3 Categories Real-time Matrix */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-400 block text-[10px]">📈 股票/ETF (09:00~13:30)</span>
                <span className={`font-bold flex items-center gap-1 ${sessionOverview.isCashOpen ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {sessionOverview.isCashOpen ? '🟢 可成交' : '⚪ 非交易時段'}
                </span>
              </div>

              <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-400 block text-[10px]">📊 股票期貨 (08:45~13:45)</span>
                <span className={`font-bold flex items-center gap-1 ${sessionOverview.isFuturesDayOpen ? 'text-emerald-400' : sessionOverview.isFuturesNightOpen ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {sessionOverview.isFuturesDayOpen ? '🟢 日盤撮合中' : sessionOverview.isFuturesNightOpen ? '🔵 夜盤撮合中' : '⚪ 今日日盤已結束'}
                </span>
              </div>

              <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-400 block text-[10px]">📊 TX指數期權 (日/夜盤)</span>
                <span className={`font-bold flex items-center gap-1 ${sessionOverview.txClock.isTradingNow ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {sessionOverview.txClock.isTradingNow ? (sessionOverview.isTxNightOpen ? '🔵 夜盤撮合中 (15:00~05:00)' : '🟢 日盤撮合中') : '⚪ 中場清算中'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowEncyclopedia(!showEncyclopedia)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-[11px] font-bold cursor-pointer transition flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{showEncyclopedia ? '收起小百科' : '❓ 交易時間小百科'}</span>
              </button>
            </div>
          </div>

          {/* Accordion: 交易時間小百科 */}
          {showEncyclopedia && (
            <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300 font-sans grid grid-cols-1 md:grid-cols-3 gap-3 animate-in fade-in">
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1">
                  📈 台股現貨 (股票/ETF/債券/權證)
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  撮合時間：<b>09:00 ~ 13:30</b><br />
                  盤後定價：14:00 ~ 14:30<br />
                  💡 現貨市場<b>無夜盤交易</b>，收盤後無法進行撮合成交。
                </p>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-sky-400 flex items-center gap-1">
                  📊 股票期貨 (個股期貨)
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  一般日盤：<b>08:45 ~ 13:45</b><br />
                  部分契約夜盤：<b>17:25 ~ 次日 05:00</b><br />
                  💡 僅台積期、鴻海期等大型標的具夜盤；中小型股期 (如中美晶、啟碁) <b>無夜盤</b>。
                </p>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-xl border border-purple-500/30 space-y-1.5 md:col-span-1">
                <div className="font-bold text-purple-300 flex items-center justify-between text-xs">
                  <span>🇹🇼 臺指期權四大旗艦契約</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30">
                    支援夜盤
                  </span>
                </div>
                <div className="space-y-1 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-200 font-bold">🇹🇼 台指期 TX</span>
                    <span className={sessionOverview.txClock.isTradingNow ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {sessionOverview.txClock.isTradingNow
                        ? (sessionOverview.isTxNightOpen ? '🟢 盤後交易中 15:00–05:00' : '🟢 日盤撮合中 08:45–13:45')
                        : '⚪ 清算休市'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-200 font-bold">🇹🇼 小台 MTX</span>
                    <span className={sessionOverview.txClock.isTradingNow ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {sessionOverview.txClock.isTradingNow
                        ? (sessionOverview.isTxNightOpen ? '🟢 盤後交易中 15:00–05:00' : '🟢 日盤撮合中 08:45–13:45')
                        : '⚪ 清算休市'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-200 font-bold">🇹🇼 微台 TMF</span>
                    <span className={sessionOverview.txClock.isTradingNow ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {sessionOverview.txClock.isTradingNow
                        ? (sessionOverview.isTxNightOpen ? '🟢 盤後交易中 15:00–05:00' : '🟢 日盤撮合中 08:45–13:45')
                        : '⚪ 清算休市'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-200 font-bold">🇹🇼 台指選擇權 TXO</span>
                    <span className={sessionOverview.txClock.isTradingNow ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {sessionOverview.txClock.isTradingNow
                        ? (sessionOverview.isTxNightOpen ? '🟢 盤後交易中 15:00–05:00' : '🟢 日盤撮合中 08:45–13:45')
                        : '⚪ 清算休市'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 pt-0.5 leading-tight">
                  💡 每日 13:45~15:00 為清算休市，15:00~次日 05:00 為盤後夜盤，隨美股無縫連線跳動。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Account Financial Metrics Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500 font-bold block text-[11px]">總淨資產 (NAV)</span>
            <span className="font-mono font-black text-slate-950 text-base">
              NT$ {Math.round(totalNetAsset).toLocaleString()}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500 font-bold block text-[11px]">可用現金儲備</span>
            <span className="font-mono font-black text-emerald-700 text-base">
              NT$ {Math.round(profile.availableCash).toLocaleString()}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500 font-bold block text-[11px]">持有存倉檔數 / 市值</span>
            <span className="font-mono font-black text-indigo-700 text-base">
              {positions.length} 檔 / NT$ {Math.round(totalMarketVal).toLocaleString()}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500 font-bold block text-[11px]">未實現總損益</span>
            <span className={`font-mono font-black text-base ${totalUnrealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {totalUnrealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(totalUnrealizedPnL).toLocaleString()}
            </span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-slate-500 font-bold block text-[11px]">累計已平倉已實現損益</span>
            <span className={`font-mono font-black text-base ${totalRealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {totalRealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(totalRealizedPnL).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tab Switcher & Query Filter Toolbar */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Master View Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('positions')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 border ${
                  activeTab === 'positions'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                <Layers className="w-4 h-4 text-amber-400" />
                <span>當前存倉庫存明細 ({positions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 border ${
                  activeTab === 'history'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>歷史買賣交易對帳單 ({history.length})</span>
              </button>
            </div>

            {/* Quick Export & Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                title="複製純文字清單，供貼至報告或 Excel"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>複製清單</span>
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                title="匯出為標準 CSV 檔案"
              >
                <Download className="w-3.5 h-3.5" />
                <span>匯出 CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTrading();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm border border-amber-400"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>前往下單</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 搜尋代號 (如 2330, 00918, TX) 或中文名稱..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: '全部類別' },
                  { id: 'stocks', label: '股票' },
                  { id: 'bonds', label: '債券' },
                  { id: 'etfs', label: 'ETF' },
                  { id: 'futures', label: '期貨' },
                  { id: 'options', label: '選擇權' },
                  { id: 'warrants', label: '權證' },
                ] as const
              ).map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer border shrink-0 ${
                    categoryFilter === cat.id
                      ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Direction Filter */}
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: '全部多空' },
                  { id: 'long', label: '多單' },
                  { id: 'short', label: '空單' },
                ] as const
              ).map(dir => (
                <button
                  key={dir.id}
                  type="button"
                  onClick={() => setActionFilter(dir.id)}
                  className={`px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer border ${
                    actionFilter === dir.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  {dir.label}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            {activeTab === 'positions' && (
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-2.5 py-1 text-xs bg-slate-100 border border-slate-300 rounded-lg text-slate-800 font-bold focus:outline-none"
              >
                <option value="value_desc">依部位市值 (高➔低)</option>
                <option value="pnl_desc">依未實現損益 (獲利高➔低)</option>
                <option value="pnl_asc">依未實現損益 (虧損深➔高)</option>
              </select>
            )}
          </div>

          {/* Copy Notification Toast */}
          {copiedNotice && (
            <div className="p-2 bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{copiedNotice}</span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* TAB 1: POSITIONS (存倉部位明細) */}
          {activeTab === 'positions' && (
            <>
              {filteredPositions.length === 0 ? (
                <div className="p-10 text-center space-y-4 bg-slate-50 border-2 border-dashed border-amber-300 rounded-3xl m-2">
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-3xl mx-auto shadow-xs">
                    📦
                  </div>
                  <div className="space-y-1.5 max-w-md mx-auto">
                    <h4 className="text-base font-black text-slate-950">
                      {searchQuery.trim() ? `查無符合「${searchQuery}」之存倉部位` : '目前帳戶無存倉持倉部位 (零持倉)'}
                    </h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {searchQuery.trim()
                        ? '請嘗試清除搜尋關鍵字或切換類別篩選。'
                        : `操盤手「${profile.studentName}」目前處於純現金狀態（NT$ ${Math.round(profile.availableCash).toLocaleString()} 可用現金）。您可以立即開啟下單機建立部位，或使用實務示範組合快速體驗查詢工具！`}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTrading();
                      }}
                      className="px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-black text-xs inline-flex items-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <ShoppingCart className="w-4 h-4 text-amber-400" />
                      <span>立即開啟下單機自主建立部位</span>
                    </button>
                    {onSeedSamplePortfolio && positions.length === 0 && (
                      <button
                        type="button"
                        onClick={onSeedSamplePortfolio}
                        className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 font-black text-xs inline-flex items-center gap-2 shadow-sm transition cursor-pointer"
                        title="依 21 號真實收盤價配置台積電、00918、美債ETF、大台指期與選擇權"
                      >
                        <Sparkles className="w-4 h-4 text-slate-950" />
                        <span>一鍵建立 5 大類別示範組合 (供測試查詢工具)</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-3.5">標的與代號</th>
                        <th className="py-3 px-3">類別</th>
                        <th className="py-3 px-3">動作方向</th>
                        <th className="py-3 px-3 text-right">進場成本價</th>
                        <th className="py-3 px-3 text-right">FinMind 報價</th>
                        <th className="py-3 px-3 text-right">持倉數量</th>
                        <th className="py-3 px-3 text-right">名目總市值</th>
                        <th className="py-3 px-3 text-right">未實現損益 (報酬率)</th>
                        <th className="py-3 px-3 text-center">交易狀態 / 快捷操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredPositions.map(pos => {
                        const badge = getActionBadge(pos.orderType);
                        const isProfitable = pos.unrealizedPnL >= 0;
                        const matchingInst = allInstruments.find(i => i.symbol === pos.symbol);
                        const clock = getInstrumentTradingClock(pos.symbol, pos.category, currentTime);
                        const canTradeNow = clock.canTradeNow;

                        return (
                          <tr key={pos.id} className="hover:bg-amber-50/40 transition">
                            <td className="py-3 px-3.5 cursor-pointer" onClick={() => openPositionLesson(pos)} title="點一下看這筆部位的小學堂教學">
                              <div className="font-black text-slate-950 flex items-center gap-1.5">
                                <span className="font-mono text-cyan-800 font-black bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-200">
                                  {pos.symbol}
                                </span>
                                <span>{pos.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block truncate max-w-[200px]">
                                {pos.entryDate || '2026-09-21 13:30'} · {pos.notes || '依21號收盤價建倉'}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-800 border border-slate-300">
                                {pos.category.toUpperCase()}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                              NT$ {pos.entryPrice >= 1000 ? pos.entryPrice.toLocaleString() : pos.entryPrice}
                            </td>

                            {/* FinMind 報價動態識別 (最新成交 vs 最後成交) */}
                            <td className="py-3 px-3 text-right font-mono">
                              <div className="font-black text-slate-950 text-sm">
                                NT$ {pos.currentPrice >= 1000 ? pos.currentPrice.toLocaleString() : pos.currentPrice}
                              </div>
                              {canTradeNow ? (
                                <div className="text-[10px] text-emerald-600 font-bold flex items-center justify-end gap-1 mt-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>最新成交價 (撮合中)</span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-500 font-medium flex items-center justify-end gap-1 mt-0.5">
                                  <span>最後成交價 (收盤定格)</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                              {pos.quantity} {pos.category === 'futures' || pos.category === 'options' ? '口' : '張'}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-black text-indigo-950">
                              NT$ {Math.round(pos.notionalValue).toLocaleString()}
                            </td>

                            <td className="py-3 px-3 text-right font-mono">
                              <span className={`font-black ${isProfitable ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {isProfitable ? '+' : ''}NT$ {Math.round(pos.unrealizedPnL).toLocaleString()}
                              </span>
                              <span className="block text-[10px] text-slate-600 font-bold">
                                ({isProfitable ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(2)}%)
                              </span>
                            </td>

                            {/* 交易狀態與平倉操作聯動 */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex flex-col items-center justify-center gap-1">
                                {canTradeNow ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                    現在可成交
                                  </span>
                                ) : (
                                  <div className="text-center">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                      🔴 現在不能成交
                                    </span>
                                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                                      下一時段：<b>{clock.nextSessionTime}</b>
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center gap-1 mt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => openPositionLesson(pos)}
                                    title="這筆部位的小學堂教學，可下載成卡片"
                                    className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-[13px] font-black transition cursor-pointer"
                                  >
                                    📖 小學堂
                                  </button>
                                  {matchingInst && onViewInstrumentKLine && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onClose();
                                        onViewInstrumentKLine(matchingInst);
                                      }}
                                      title="檢視 FinMind K 線存證"
                                      className="p-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 transition cursor-pointer"
                                    >
                                      <Camera className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {canTradeNow ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm(`確定要將【${pos.name} (${pos.symbol})】以即時撮合價 NT$ ${pos.currentPrice} 平倉沖銷嗎？`)) {
                                          onClosePosition(pos.id);
                                        }
                                      }}
                                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 text-[11px] font-black transition cursor-pointer shadow-2xs"
                                    >
                                      平倉
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setNonTradableAlert({ pos, clock })}
                                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-300 text-[11px] font-bold transition cursor-pointer"
                                      title="目前為非交易時段，點擊查看規則與下一開盤時段"
                                    >
                                      暫停交易
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* TAB 2: TRADE HISTORY (買賣歷史交易對帳單) */}
          {activeTab === 'history' && (
            <>
              {filteredHistory.length === 0 ? (
                <div className="p-10 text-center space-y-3 bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl m-2">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-300 flex items-center justify-center text-3xl mx-auto shadow-xs">
                    📜
                  </div>
                  <h4 className="text-base font-black text-slate-950">
                    目前尚無買賣成交或平倉歷史記錄
                  </h4>
                  <p className="text-xs text-slate-600 font-medium max-w-md mx-auto">
                    每一筆在下單機執行的買進、放空或平倉紀錄均會永久保存於對帳單中，供課堂成果與評分檢驗存證。
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-3.5">成交時間 / 基準</th>
                        <th className="py-3 px-3">標的代號</th>
                        <th className="py-3 px-3">交易動作</th>
                        <th className="py-3 px-3 text-right">成交價格</th>
                        <th className="py-3 px-3 text-right">數量</th>
                        <th className="py-3 px-3 text-right">成交總額 / 保證金</th>
                        <th className="py-3 px-3 text-right">平倉已實現損益</th>
                        <th className="py-3 px-3">投資理由與備註</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredHistory.map(rec => {
                        const badge = getActionBadge(rec.action);
                        const hasRealized = typeof rec.realizedPnL === 'number';

                        return (
                          <tr key={rec.id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600">
                              {rec.dateLabel || rec.timestamp}
                            </td>

                            <td className="py-3 px-3">
                              <div className="font-black text-slate-950 flex items-center gap-1.5">
                                <span className="font-mono text-cyan-800 font-black">
                                  {rec.symbol}
                                </span>
                                <span>{rec.name}</span>
                              </div>
                            </td>

                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-950">
                              NT$ {rec.price >= 1000 ? rec.price.toLocaleString() : rec.price}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                              {rec.quantity} {rec.category === 'futures' || rec.category === 'options' ? '口' : '張'}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-black text-indigo-950">
                              NT$ {Math.round(rec.amount).toLocaleString()}
                            </td>

                            <td className="py-3 px-3 text-right font-mono">
                              {hasRealized ? (
                                <span className={`font-black ${rec.realizedPnL! >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                  {rec.realizedPnL! >= 0 ? '+' : ''}NT$ {Math.round(rec.realizedPnL!).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-semibold">-</span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-[11px] text-slate-600 max-w-xs truncate">
                              {rec.rationale || '正常建倉委託'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>FinMind 資料存證無縫同步至 Firebase 雲端伺服器</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black transition cursor-pointer"
          >
            關閉視窗
          </button>
        </div>
      </div>

      {/* ─── Educational Modal: 非交易時段制度提示彈窗 ─── */}
      {nonTradableAlert && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-slate-900 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center text-2xl shrink-0">
                ⏱️
              </div>
              <div>
                <h4 className="font-black text-base text-slate-950">目前為非交易時段 (暫停成交)</h4>
                <p className="text-xs text-slate-500 font-mono">台灣證券與期貨交易所撮合制度導航</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs font-mono">
              <div>商品標的：<b className="text-slate-950">{nonTradableAlert.pos.name} ({nonTradableAlert.pos.symbol})</b></div>
              <div>商品類別：<b className="text-indigo-700">{nonTradableAlert.clock.classLabel}</b></div>
              <div>目前時段：<b className="text-rose-700">{nonTradableAlert.clock.sessionName}</b></div>
              <div>交易時段規範：<b className="text-slate-800">{nonTradableAlert.clock.tradingRules}</b></div>
              <div className="pt-2 border-t border-slate-200 text-amber-800 font-bold">
                下一可交易時段：<span className="text-amber-700 underline font-black">{nonTradableAlert.clock.nextSessionTime}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              依照金融交易市場規定，在非撮合交易時段內，委託簿不撮合成交。請於該商品的下一個開盤時段再進行模擬平倉或下單操作。
            </p>

            <button
              type="button"
              onClick={() => setNonTradableAlert(null)}
              className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-black text-xs transition cursor-pointer shadow-sm"
            >
              知道了，我了解了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
