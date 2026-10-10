import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  TrendingUp,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ShoppingCart,
  Calculator,
  PieChart,
  HelpCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Flame,
  Zap,
  Info
} from 'lucide-react';
import { InstrumentSpec, AssetCategory, OrderAction } from '../types/market';

interface UnderlyingDerivativesModalProps {
  isOpen: boolean;
  onClose: () => void;
  allInstruments: InstrumentSpec[];
  onSelectInstrumentToTrade: (instrument: InstrumentSpec, action?: OrderAction) => void;
  initialSymbol?: string;
}

export const UnderlyingDerivativesModal: React.FC<UnderlyingDerivativesModalProps> = ({
  isOpen,
  onClose,
  allInstruments,
  onSelectInstrumentToTrade,
  initialSymbol = '2317',
}) => {
  const [activeUnderlying, setActiveUnderlying] = useState<string>(initialSymbol || '2317');
  const [activeTab, setActiveTab] = useState<'matrix' | 'simulator'>('matrix');
  const [simCapital, setSimCapital] = useState<number>(50000000); // 100萬, 500萬, 1000萬, 5000萬
  const [priceDelta, setPriceDelta] = useState<number>(10); // 上漲/下跌 10 元
  const [customSearch, setCustomSearch] = useState<string>('');

  React.useEffect(() => {
    if (initialSymbol) {
      setActiveUnderlying(initialSymbol);
    }
  }, [initialSymbol]);

  if (!isOpen) return null;

  // Preset core underlying stocks with rich derivative families
  const presetUnderlyings = [
    {
      symbol: '2317',
      name: '鴻海',
      price: 254,
      futuresSymbol: 'DH',
      futuresName: '鴻海股票期貨 (DH)',
      optionsSymbol: 'DHO',
      optionsName: '鴻海股票選擇權 (DHO)',
      weeklyOptionsSymbol: 'DHO-W',
      weeklyOptionsName: '鴻海週選擇權 (DHO-W)',
      warrantSymbol: '089217',
      warrantName: '鴻海元大53購01',
      description: '全球電子代工巨擘與 AI 伺服器機櫃量產核心，具備完整期貨與選擇權週月契約。',
    },
    {
      symbol: '2330',
      name: '台積電',
      price: 2510,
      futuresSymbol: 'CD',
      futuresName: '台積電股票期貨 (CD)',
      optionsSymbol: 'CDO',
      optionsName: '台積電股票選擇權 (CDO)',
      weeklyOptionsSymbol: 'CDO-W',
      weeklyOptionsName: '台積電週選擇權 (CDO-W)',
      warrantSymbol: '08643P',
      warrantName: '台積電凱基43購01',
      description: '全球先進晶圓代工龍頭，市值破兆美元，全市場最活躍之股票期貨與選擇權。',
    },
    {
      symbol: '2454',
      name: '聯發科',
      price: 4980,
      futuresSymbol: 'DVF',
      futuresName: '聯發科股票期貨 (DVF)',
      optionsSymbol: 'DVO',
      optionsName: '聯發科股票選擇權 (DVO)',
      weeklyOptionsSymbol: 'DVO-W',
      weeklyOptionsName: '聯發科週選擇權 (DVO-W)',
      warrantSymbol: '08645P',
      warrantName: '聯發科群益43購01',
      description: '邊緣 AI 與天璣手機旗艦晶片霸主，高價股代表，期貨一口價值近千萬台幣。',
    },
    {
      symbol: '2382',
      name: '廣達',
      price: 334,
      futuresSymbol: 'QDF',
      futuresName: '廣達股票期貨 (QDF)',
      optionsSymbol: 'QDO',
      optionsName: '廣達股票選擇權 (QDO)',
      weeklyOptionsSymbol: 'QDO-W',
      weeklyOptionsName: '廣達週選擇權 (QDO-W)',
      warrantSymbol: '08647P',
      warrantName: '廣達元大43購01',
      description: '全球雲端伺服器龍頭，北美各大 CSP 訂單核心受惠者，流動性充沛。',
    },
    {
      symbol: '2308',
      name: '台達電',
      price: 1905,
      futuresSymbol: 'DLF',
      futuresName: '台達電股票期貨 (DLF)',
      optionsSymbol: 'DLO',
      optionsName: '台達電股票選擇權 (DLO)',
      weeklyOptionsSymbol: 'DLO-W',
      weeklyOptionsName: '台達電週選擇權 (DLO-W)',
      warrantSymbol: '08649P',
      warrantName: '台達電元大43購01',
      description: '電源管理與水冷散熱關鍵技術整合大廠，伺服器電源市佔率居全球之冠。',
    },
    {
      symbol: '2603',
      name: '長榮',
      price: 242,
      futuresSymbol: 'CZF',
      futuresName: '長榮股票期貨 (CZF)',
      optionsSymbol: 'CZO',
      optionsName: '長榮股票選擇權 (CZO)',
      weeklyOptionsSymbol: 'CZO-W',
      weeklyOptionsName: '長榮週選擇權 (CZO-W)',
      warrantSymbol: '08651P',
      warrantName: '長榮元大43購01',
      description: '全球航運貨櫃龍頭，高股息與海運運價波動，期貨流動性極大。',
    },
    {
      symbol: '2882',
      name: '國泰金',
      price: 68.4,
      futuresSymbol: 'CFF',
      futuresName: '國泰金股票期貨 (CFF)',
      optionsSymbol: 'CFO',
      optionsName: '國泰金股票選擇權 (CFO)',
      weeklyOptionsSymbol: 'CFO-W',
      weeklyOptionsName: '國泰金週選擇權 (CFO-W)',
      warrantSymbol: '08653P',
      warrantName: '國泰金凱基43購01',
      description: '指標金融金控龍頭，降息循環壽險避險收益題材，期貨保證金門檻親民。',
    },
    {
      symbol: '0050',
      name: '元大台灣50',
      price: 111.35,
      futuresSymbol: 'NYF',
      futuresName: '台灣50指數期貨 (NYF)',
      optionsSymbol: 'TXO',
      optionsName: '台指選擇權 (TXO連動)',
      weeklyOptionsSymbol: 'TXO-W',
      weeklyOptionsName: '台指週選擇權 (TXO-W)',
      warrantSymbol: '08655P',
      warrantName: '台50元大43購01',
      description: '涵蓋台灣前50大權值巨頭，可透過現貨、ETF期貨與台指期貨進行多層次對沖。',
    },
  ];

  // Dynamic lookup for any custom stock from allInstruments
  const customInst = allInstruments.find(
    i => i.symbol === activeUnderlying || i.symbol.toLowerCase() === customSearch.toLowerCase().trim() || i.name.includes(customSearch.trim())
  );

  const currentMeta = presetUnderlyings.find(u => u.symbol === activeUnderlying) || (customInst ? {
    symbol: customInst.symbol,
    name: customInst.name,
    price: customInst.price,
    futuresSymbol: `${customInst.symbol}F`,
    futuresName: `${customInst.name}股票期貨`,
    optionsSymbol: `${customInst.symbol}O`,
    optionsName: `${customInst.name}股票選擇權`,
    weeklyOptionsSymbol: `${customInst.symbol}O-W`,
    weeklyOptionsName: `${customInst.name}週選擇權`,
    warrantSymbol: `08${customInst.symbol.slice(0, 3)}P`,
    warrantName: `${customInst.name}元大43購01`,
    description: customInst.description || `${customInst.name} 集中市場上市櫃商品，支援期貨、選擇權與權證衍生架構。`,
  } : presetUnderlyings[0]);

  const underlyingPrice = currentMeta.price;

  // 7 derivative instrument categories for current underlying
  const matrixData = [
    {
      id: 1,
      categoryLabel: '① 現貨股票',
      productName: `${currentMeta.name} (${currentMeta.symbol})`,
      symbol: currentMeta.symbol,
      direction: '做多 / 融資 / 融券賣出(放空)',
      leverage: '1.0x (現股) / 2.5x (融資) / 1.1x (融券)',
      specs: '1 張 = 1,000 股，現價 NT$ ' + underlyingPrice,
      marginInfo: '自備 100% 現金 (NT$ ' + (underlyingPrice * 1000).toLocaleString() + '/張) 或融資 40% 自備款',
      useCase: '長期持有、配息、核心資產配置、波段投資',
      defaultAction: 'BUY_STOCK' as OrderAction,
      isCore: true,
      category: 'stocks' as AssetCategory,
    },
    {
      id: 2,
      categoryLabel: '② 股票期貨',
      productName: `${currentMeta.name}期貨 (${currentMeta.futuresSymbol})`,
      symbol: currentMeta.futuresSymbol,
      direction: '多／空雙向均可自由建立',
      leverage: '~7.4 倍實質槓桿',
      specs: '1 口 = 2,000 股 (等同 2 張現貨部位)',
      marginInfo: '原始保證金 13.5% (約 NT$ ' + Math.round(underlyingPrice * 2000 * 0.135).toLocaleString() + '/口)',
      useCase: '高效率短線波段、以小博大、現股反向避險對沖',
      defaultAction: 'BUY_FUTURES_LONG' as OrderAction,
      isCore: true,
      category: 'futures' as AssetCategory,
    },
    {
      id: 3,
      categoryLabel: '③ 股票月選擇權',
      productName: `${currentMeta.name}選擇權 (${currentMeta.optionsSymbol})`,
      symbol: `${currentMeta.optionsSymbol}-${Math.round(underlyingPrice * 1.02)}-C`,
      direction: '買Call(大漲) / 買Put(大跌) / 賣方收租',
      leverage: '15 ~ 40 倍高爆發槓桿',
      specs: '1 口 = 2,000 股，月合約第三個週三結算',
      marginInfo: '買方僅需權利金 (約 NT$ 15,000~30,000/口)，免保證金無追繳',
      useCase: '大行情爆發獲利、非對稱下檔避險、跨式波動率策略',
      defaultAction: 'BUY_CALL_OPTION' as OrderAction,
      isCore: true,
      category: 'options' as AssetCategory,
    },
    {
      id: 4,
      categoryLabel: '④ 股票週選擇權',
      productName: `${currentMeta.name}週選擇權 (${currentMeta.weeklyOptionsSymbol})`,
      symbol: `${currentMeta.weeklyOptionsSymbol}-${Math.round(underlyingPrice * 1.01)}-C`,
      direction: '極短線強勢做多 / 避險',
      leverage: '30 ~ 80 倍超高槓桿',
      specs: '1 口 = 2,000 股，當週三即結算',
      marginInfo: '權利金極低 (約 NT$ 4,000~10,000/口)，時間價值衰退快',
      useCase: '財報公佈、法說會、重大發表會當週事件交易 (Event-Driven)',
      defaultAction: 'BUY_CALL_OPTION' as OrderAction,
      isCore: false,
      category: 'options' as AssetCategory,
    },
    {
      id: 5,
      categoryLabel: '⑤ 認購／認售權證',
      productName: `${currentMeta.warrantName}`,
      symbol: currentMeta.warrantSymbol,
      direction: '認購做多(Call) / 認售放空(Put)',
      leverage: '5 ~ 15 倍實質槓桿',
      specs: '1 張 = 1,000 單位，行使比例約 0.1~0.3',
      marginInfo: '每張約 NT$ 1,500 ~ 3,000，損失僅限本金',
      useCase: '小資金靈活切入、高槓桿波段追價、免追繳風險',
      defaultAction: 'BUY_CALL_WARRANT' as OrderAction,
      isCore: true,
      category: 'warrants' as AssetCategory,
    },
    {
      id: 6,
      categoryLabel: '⑥ 重倉成分 ETF',
      productName: '元大台灣50 (0050) / 大華優利高填息 (00918)',
      symbol: '0050',
      direction: '間接多方（分散單一風險）',
      leverage: '1.0 倍 (一籃子優質成分)',
      specs: `含 ${currentMeta.name} 權重 (約 5%~56%)，每張約 10~11 萬`,
      marginInfo: '現股買進，管理費親民，季季配息',
      useCase: '看好整體大盤與權值鏈，分散單一個股非系統性意外風險',
      defaultAction: 'BUY_ETF' as OrderAction,
      isCore: false,
      category: 'etfs' as AssetCategory,
    },
    {
      id: 7,
      categoryLabel: '⑦ 槓反相關 ETF',
      productName: '台灣50正2 (00631L) / 台灣50反1 (00632R)',
      symbol: '00632R',
      direction: '正向 2 倍放大 / 反向 1 倍放空避險',
      leverage: '2.0x (正2) / -1.0x (反1)',
      specs: '追蹤台灣 50 指數單日槓桿/反向表現',
      marginInfo: '免開期權信用戶即可在集中市場一鍵避險放空',
      useCase: '大盤高檔見頂時現貨部位快速避險、指數級波段加速獲利',
      defaultAction: 'BUY_ETF' as OrderAction,
      isCore: false,
      category: 'etfs' as AssetCategory,
    },
  ];

  // Capital Simulation calculations (100萬, 500萬, 1000萬, 5000萬)
  const simStockShares = Math.floor(simCapital / underlyingPrice);
  const simStockLots = Math.floor(simStockShares / 1000);
  const simStockPnlUp = priceDelta * simStockShares;
  const simStockPnlDown = -priceDelta * simStockShares;
  const simStockPct = (simStockPnlUp / simCapital) * 100;

  // Futures: 1 contract = 2,000 shares, margin = 13.5%
  const futuresMarginPerContract = Math.round(underlyingPrice * 2000 * 0.135);
  // Conservative safety margin: use 50% capital for margin, keep 50% buffer
  const simFuturesContracts = Math.max(1, Math.floor((simCapital * 0.5) / futuresMarginPerContract));
  const simFuturesShares = simFuturesContracts * 2000;
  const simFuturesLots = Math.floor(simFuturesShares / 1000);
  const simFuturesPnlUp = priceDelta * simFuturesShares;
  const simFuturesPnlDown = -priceDelta * simFuturesShares;
  const simFuturesPct = (simFuturesPnlUp / simCapital) * 100;
  const simFuturesLeverage = Number(((simFuturesShares * underlyingPrice) / simCapital).toFixed(2));

  // Options: Call option ATM price ~4% of stock price per share
  const optionPremiumPerContract = Math.round(underlyingPrice * 2000 * 0.04);
  // Allocate 20% capital to options, keep 80% cash
  const simOptionContracts = Math.max(1, Math.floor((simCapital * 0.2) / optionPremiumPerContract));
  const simOptionShares = simOptionContracts * 2000;
  const simOptionPnlUp = Math.round(priceDelta * 0.7 * simOptionShares); // Delta ~0.7
  const simOptionPnlDown = -Math.min(simCapital * 0.2, Math.round(priceDelta * 0.6 * simOptionShares));
  const simOptionPct = (simOptionPnlUp / simCapital) * 100;

  // Warrants: ~1.8 NT per warrant, multiplier 1000, delta ~0.4, eff leverage ~7x
  const warrantPrice = 1.85;
  const simWarrantLots = Math.max(1, Math.floor((simCapital * 0.15) / (warrantPrice * 1000)));
  const simWarrantPnlUp = Math.round((simCapital * 0.15) * ((priceDelta / underlyingPrice) * 6.5));
  const simWarrantPnlDown = -Math.round((simCapital * 0.15) * Math.min(1, (priceDelta / underlyingPrice) * 6.5));
  const simWarrantPct = (simWarrantPnlUp / simCapital) * 100;

  const handleLaunchTrade = (symbol: string, defaultAction: OrderAction) => {
    onClose();
    const inst = allInstruments.find(i => i.symbol === symbol || i.symbol.startsWith(symbol));
    if (inst) {
      onSelectInstrumentToTrade(inst, defaultAction);
    } else {
      // Fallback construct spec
      onSelectInstrumentToTrade({
        symbol,
        name: `${currentMeta.name}衍生商品 (${symbol})`,
        category: symbol.includes('-C') || symbol.includes('-P') ? 'options' : (symbol === 'DH' || symbol === 'CD' ? 'futures' : 'stocks'),
        price: underlyingPrice,
        prevClose: underlyingPrice,
        change: 0,
        changePercent: 0,
        volume: 10000,
        unitLabel: symbol.includes('DH') ? '口 (2,000股)' : '張 (1,000股)',
        multiplier: symbol.includes('DH') ? 2000 : 1000,
        marginRequirement: symbol.includes('DH') ? futuresMarginPerContract : 0,
        description: `${currentMeta.name} 臺灣期貨交易所真實掛牌商品`,
        klineHistory: [],
      }, defaultAction);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border-2 border-slate-300 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-150 text-slate-900">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-6 py-4 border-b border-amber-400 flex items-center justify-between text-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white border border-amber-300 flex items-center justify-center text-2xl shadow-xs">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-lg text-slate-950">
                  標的全方位衍生商品矩陣與 5,000 萬槓桿配置試算中心
                </h3>
                <span className="px-2 py-0.5 rounded text-xs font-black bg-slate-950 text-amber-300">
                  期交所 TAIFEX & TWSE 實務架構
                </span>
              </div>
              <p className="text-xs text-slate-900 font-semibold mt-0.5">
                單一標的不僅能買股票：涵蓋「現貨 ➔ 股票期貨 ➔ 股票選擇權 ➔ 週選 ➔ 權證 ➔ 相關ETF」完整武器庫
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-black/10 text-slate-950 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Underlying Selector Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-wrap">
            <span className="text-xs font-black text-slate-700 shrink-0 flex items-center gap-1">
              <Layers className="w-4 h-4 text-amber-600" />
              <span>切換標的：</span>
            </span>
            {presetUnderlyings.map(u => (
              <button
                key={u.symbol}
                type="button"
                onClick={() => {
                  setActiveUnderlying(u.symbol);
                  setCustomSearch('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1.5 shrink-0 ${
                  activeUnderlying === u.symbol
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                }`}
              >
                <span>{u.name} ({u.symbol})</span>
                <span className="font-mono text-amber-400 font-bold">NT$ {u.price}</span>
              </button>
            ))}

            {/* Quick custom stock search */}
            <div className="relative shrink-0">
              <input
                type="text"
                value={customSearch}
                onChange={e => {
                  setCustomSearch(e.target.value);
                  const matched = allInstruments.find(i =>
                    i.symbol.toLowerCase() === e.target.value.toLowerCase().trim() ||
                    i.name.includes(e.target.value.trim())
                  );
                  if (matched) setActiveUnderlying(matched.symbol);
                }}
                placeholder="🔍 輸入其他代號/名稱..."
                className="pl-3 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 w-44 shadow-2xs"
              />
            </div>
          </div>

          {/* Master View Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1.5 ${
                activeTab === 'matrix'
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>7 大金融商品矩陣清單</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1.5 ${
                activeTab === 'simulator'
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>5,000 萬資金配置試算表</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 1: 7 DERIVATIVE MATRIX */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              {/* Highlight Intro Banner */}
              <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-950 text-sm">
                      {currentMeta.name}（{currentMeta.symbol}）台灣期貨交易所 & 集中市場全品項交易矩陣
                    </h4>
                    <p className="text-slate-700 font-medium mt-0.5 leading-relaxed">
                      期交所官方代碼：<strong>{currentMeta.name}股票期貨為「{currentMeta.futuresSymbol}」</strong>；<strong>股票選擇權為「{currentMeta.optionsSymbol}」</strong>。具備完整的現貨、期貨、月選擇權、週選擇權與權證，可多空雙向靈活組合作業策略！
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('simulator')}
                    className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-black text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <span>試算 5,000 萬槓桿損益 ➔</span>
                  </button>
                </div>
              </div>

              {/* 7 Derivatives Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5">類型與品項</th>
                      <th className="py-3 px-3">多空方向</th>
                      <th className="py-3 px-3">實質槓桿</th>
                      <th className="py-3 px-3">規格與保證金機制</th>
                      <th className="py-3 px-3">適合用途與策略特性</th>
                      <th className="py-3 px-3 text-center">快速下單</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {matrixData.map(item => (
                      <tr key={item.id} className="hover:bg-amber-50/40 transition">
                        <td className="py-3.5 px-3.5">
                          <span className="font-bold text-[10px] text-amber-800 block">
                            {item.categoryLabel}
                          </span>
                          <span className="font-black text-slate-950 text-sm block">
                            {item.productName}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-800 font-black">
                            代號: {item.symbol}
                          </span>
                        </td>

                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-50 text-blue-900 border border-blue-200 block max-w-fit">
                            {item.direction}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 font-mono font-black text-slate-950">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${
                            item.leverage.includes('80') || item.leverage.includes('40')
                              ? 'bg-purple-100 text-purple-900 border-purple-300'
                              : item.leverage.includes('7.4')
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}>
                            {item.leverage}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-slate-700 leading-snug">
                          <div className="font-bold text-slate-950">{item.specs}</div>
                          <div className="text-[11px] text-slate-600 mt-0.5">{item.marginInfo}</div>
                        </td>

                        <td className="py-3.5 px-3 text-slate-700 font-medium max-w-xs leading-relaxed text-[11px]">
                          {item.useCase}
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleLaunchTrade(item.symbol, item.defaultAction)}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs inline-flex items-center gap-1 shadow-xs border border-amber-400 cursor-pointer active:scale-95 transition"
                          >
                            <ShoppingCart className="w-3 h-3 text-slate-950" />
                            <span>下單</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: 50,000,000 CAPITAL ALLOCATION SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-5">
              {/* Simulator Controls & Capital Size Selection */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-black text-sm text-slate-950 flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-amber-600" />
                    <span>【{currentMeta.name} 2317】現貨 vs 股票期貨 vs 選擇權 vs 權證 資金配置與損益試算表</span>
                  </h4>
                  <p className="text-xs text-slate-600 font-medium">
                    切換不同資金規模，精確比對上漲或下跌 NT$ {priceDelta} 元時，各項商品的部位控制規模、槓桿倍數與實際獲利差距。
                  </p>
                </div>

                {/* Capital Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: '100 萬', val: 1000000 },
                    { label: '500 萬', val: 5000000 },
                    { label: '1,000 萬', val: 10000000 },
                    { label: '5,000 萬 (大富翁)', val: 50000000 },
                  ].map(c => (
                    <button
                      key={c.val}
                      type="button"
                      onClick={() => setSimCapital(c.val)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                        simCapital === c.val
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Delta Simulation Control */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-950">模擬股價變動幅度：</span>
                  <div className="flex items-center gap-1 font-mono font-black">
                    {[5, 10, 15, 20].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPriceDelta(d)}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                          priceDelta === d
                            ? 'bg-slate-950 text-amber-300 border-slate-950'
                            : 'bg-white text-slate-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        ±{d} 元
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-slate-800 font-bold">
                  基準股價：<strong className="text-slate-950 font-mono">NT$ {underlyingPrice}</strong> ➔ 
                  上漲至 <strong className="text-rose-700 font-mono">NT$ {underlyingPrice + priceDelta}</strong> / 
                  下跌至 <strong className="text-emerald-700 font-mono">NT$ {underlyingPrice - priceDelta}</strong>
                </div>
              </div>

              {/* 4 Financial Instruments Comparison Grid Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5">交易工具</th>
                      <th className="py-3 px-3">投入資金 / 保證金</th>
                      <th className="py-3 px-3">控制現貨名目規模</th>
                      <th className="py-3 px-3">實質槓桿</th>
                      <th className="py-3 px-3 text-right">股價上漲 +{priceDelta}元 (損益)</th>
                      <th className="py-3 px-3 text-right">股價下跌 -{priceDelta}元 (損益)</th>
                      <th className="py-3 px-3">風險與追繳機制</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* 1. 現貨股票 */}
                    <tr className="hover:bg-slate-50 transition">
                      <td className="py-4 px-3.5">
                        <span className="font-black text-slate-950 text-sm block">1. 現貨股票 2317</span>
                        <span className="text-[10px] text-slate-500 font-semibold">傳統全額現股買進</span>
                      </td>
                      <td className="py-4 px-3 font-mono font-black text-slate-950">
                        NT$ {simCapital.toLocaleString()}
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-mono font-black text-slate-950 block">
                          {simStockLots.toLocaleString()} 張 ({simStockShares.toLocaleString()} 股)
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          名目市值 NT$ {Math.round(simStockShares * underlyingPrice).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 px-3 font-mono font-bold text-slate-700">
                        1.00 倍
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-rose-700 text-sm block">
                          +NT$ {Math.round(simStockPnlUp).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-rose-700 font-bold">
                          (+{simStockPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-emerald-700 text-sm block">
                          -NT$ {Math.round(Math.abs(simStockPnlDown)).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold">
                          (-{simStockPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-4 px-3 text-[11px] text-slate-600 font-medium">
                        無追繳問題，可長抱領息，但資金運用效率最低。
                      </td>
                    </tr>

                    {/* 2. 股票期貨 DH */}
                    <tr className="hover:bg-amber-50/50 transition bg-amber-50/20">
                      <td className="py-4 px-3.5">
                        <span className="font-black text-slate-950 text-sm block flex items-center gap-1">
                          <span>2. 股票期貨 ({currentMeta.futuresSymbol})</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 text-rose-800 font-bold">資金效率高</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold">1口=2,000股，留50%浮動保證金邊際</span>
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-mono font-black text-slate-950 block">
                          NT$ {simCapital.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          動用保證金 NT$ {(simFuturesContracts * futuresMarginPerContract).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-mono font-black text-indigo-950 block">
                          {simFuturesContracts.toLocaleString()} 口 ({simFuturesLots.toLocaleString()} 張現貨)
                        </span>
                        <span className="text-[10px] text-indigo-700 font-mono font-bold">
                          控制市值 NT$ {Math.round(simFuturesShares * underlyingPrice).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 px-3 font-mono font-black text-rose-700 text-sm">
                        {simFuturesLeverage} 倍
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-rose-700 text-base block">
                          +NT$ {Math.round(simFuturesPnlUp).toLocaleString()}
                        </span>
                        <span className="text-xs text-rose-700 font-black">
                          (+{simFuturesPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-emerald-700 text-base block">
                          -NT$ {Math.round(Math.abs(simFuturesPnlDown)).toLocaleString()}
                        </span>
                        <span className="text-xs text-emerald-700 font-black">
                          (-{simFuturesPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-4 px-3 text-[11px] text-slate-600 font-medium">
                        維持率低於 130% 需追繳；但若保留 50% 現金儲備，可承受 30% 劇烈逆向波動！
                      </td>
                    </tr>

                    {/* 3. 股票選擇權 DHO */}
                    <tr className="hover:bg-purple-50/50 transition">
                      <td className="py-4 px-3.5">
                        <span className="font-black text-slate-950 text-sm block">3. 股票選擇權 ({currentMeta.optionsSymbol})</span>
                        <span className="text-[10px] text-purple-700 font-semibold">買進買權 (Buy Call)，動用20%本金</span>
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-mono font-black text-slate-950 block">
                          NT$ {(simCapital * 0.2).toLocaleString()} 權利金
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">保留 80% 現金不動</span>
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-mono font-black text-slate-950 block">
                          {simOptionContracts.toLocaleString()} 口 (控制 {simOptionShares.toLocaleString()} 股)
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Delta 約 0.7 敏感度</span>
                      </td>
                      <td className="py-4 px-3 font-mono font-black text-purple-800 text-sm">
                        約 15 ~ 25 倍
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-rose-700 text-sm block">
                          +NT$ {Math.round(simOptionPnlUp).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-rose-700 font-bold">
                          (+{simOptionPct.toFixed(2)}% 全帳戶)
                        </span>
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-emerald-700 text-sm block">
                          -NT$ {Math.round(Math.abs(simOptionPnlDown)).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold">
                          最大虧損僅限權利金
                        </span>
                      </td>
                      <td className="py-4 px-3 text-[11px] text-slate-600 font-medium">
                        買方<strong>絕對沒有保證金追繳斷頭風險</strong>！但若盤整到期權利金會歸零。
                      </td>
                    </tr>

                    {/* 4. 認購權證 */}
                    <tr className="hover:bg-slate-50 transition">
                      <td className="py-4 px-3.5">
                        <span className="font-black text-slate-950 text-sm block">4. 鴻海認購權證</span>
                        <span className="text-[10px] text-slate-500 font-semibold">配置 15% 本金小博大</span>
                      </td>
                      <td className="py-4 px-3 font-mono font-black text-slate-950">
                        NT$ {(simCapital * 0.15).toLocaleString()}
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-mono font-black text-slate-950 block">
                          {simWarrantLots.toLocaleString()} 張
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">行使比例約 0.2</span>
                      </td>
                      <td className="py-4 px-3 font-mono font-bold text-slate-700">
                        約 6.5 倍
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-rose-700 text-sm block">
                          +NT$ {Math.round(simWarrantPnlUp).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-rose-700 font-bold">
                          (+{simWarrantPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-4 px-3 text-right font-mono">
                        <span className="font-black text-emerald-700 text-sm block">
                          -NT$ {Math.round(Math.abs(simWarrantPnlDown)).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-[11px] text-slate-600 font-medium">
                        無追繳，券商造市，需注意時間價值衰減與造市商買賣價差。
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* PhD Quant Insights Card */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 text-xs font-black">
                    🎓 金融博士班計量實務結論
                  </span>
                  <span className="text-xs text-slate-300 font-bold">
                    如何用 5,000 萬資金達到最高夏普值與資金效率？
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-relaxed">
                  <div className="bg-white/10 p-3 rounded-xl border border-white/15">
                    <strong className="text-amber-300 block mb-1">1. 現貨搭配期貨（現期套利/避險）</strong>
                    若持有 100 張鴻海現股，面臨大盤回檔風險時，不需要在現貨市場賤賣！只需在期貨市場放空 50 口 DH 期貨，即可完美鎖定利潤，對沖系統性下跌風險。
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-white/15">
                    <strong className="text-amber-300 block mb-1">2. 資金利用率高達 3.6 倍</strong>
                    5,000 萬買現貨只能控制 196 張（獲利 196 萬）；若配置 360 口股票期貨（控制 720 張），上漲 10 元獲利高達 720 萬，同時帳戶還保有 2,500 萬現金防禦！
                  </div>

                  <div className="bg-white/10 p-3 rounded-xl border border-white/15">
                    <strong className="text-amber-300 block mb-1">3. 買進選擇權的不對稱凸性 (Convexity)</strong>
                    在重大法說會前夕，買進 DHO-Call 或跨式策略，下檔風險嚴格鎖定在 5%~10% 的權利金，上檔獲利無限，是典型「有限風險追求超額報酬」的經典模型。
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>支援 7 大維度下單撮合 · 數據即時對齊台灣期貨交易所 (TAIFEX) 規格</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleLaunchTrade(currentMeta.futuresSymbol, 'BUY_FUTURES_LONG')}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black shadow-xs cursor-pointer transition border border-amber-400"
            >
              直接建立 {currentMeta.name} 期貨多/空單
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black transition cursor-pointer"
            >
              關閉視窗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
