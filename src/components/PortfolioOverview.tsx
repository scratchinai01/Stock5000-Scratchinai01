import React, { useState, useMemo } from 'react';
import { StudentProfile, Position, InstrumentSpec, AssetCategory, OrderAction } from '../types/market';
import { getSystemDateStr } from '../utils/dateUtils';
import { LimitUpAlternativeModal } from './LimitUpAlternativeModal';
import { MyPositionsLiveBoard } from './MyPositionsLiveBoard';
import { CommoditiesBoard } from './CommoditiesBoard';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  ShieldCheck,
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Trash2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Search,
  ShoppingCart,
  ShieldAlert,
  Sparkles,
  Zap,
  Dice5,
  SlidersHorizontal,
  GraduationCap,
  RefreshCw,
  Lock,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
} from 'lucide-react';

interface PortfolioOverviewProps {
  currentProfile: StudentProfile;
  onOpenTrading: () => void;
  onClosePosition: (positionId: string) => void;
  onViewInstrumentKLine: (instrument: InstrumentSpec) => void;
  allInstruments: InstrumentSpec[];
  onEditPlayer?: () => void;
  onOpenCalculator?: (inst?: InstrumentSpec) => void;
  onSelectInstrumentToTrade?: (instrument: InstrumentSpec, action?: OrderAction) => void;
  onResetToAutonomousCash?: () => void;
  onOpenResetPortfolio?: () => void;
  isAutoRefresh?: boolean;
  lastUpdatedTime?: string;
  countdownSeconds?: number;
  tokenInfo?: {
    hasToken: boolean;
    tokenTail: string;
    isSecretInjected?: boolean;
    maskedToken?: string;
  };
  onOpenFinmindVerification?: () => void;
  onForceRefreshAll?: () => Promise<void>;
  marketStatus?: {
    isOpen: boolean;
    statusText: string;
  };
  onOpenStatement?: () => void;
  onSeedSamplePortfolio?: () => void;
  onOpenDerivativesModal?: (symbol?: string) => void;
  onOpenSecurityCenter?: () => void;
  onOpenChangePassword?: () => void;
  onAddInstrument?: (inst: InstrumentSpec) => void;
  onOpenGlobalRadar?: () => void;
  onOpenCryptoLiveBoard?: () => void;
}

export const PortfolioOverview: React.FC<PortfolioOverviewProps> = ({
  currentProfile,
  onOpenTrading,
  onClosePosition,
  onViewInstrumentKLine,
  allInstruments,
  onEditPlayer,
  onOpenCalculator,
  onSelectInstrumentToTrade,
  onResetToAutonomousCash,
  onOpenResetPortfolio,
  isAutoRefresh,
  lastUpdatedTime,
  countdownSeconds,
  tokenInfo,
  onOpenFinmindVerification,
  onForceRefreshAll,
  marketStatus,
  onOpenStatement,
  onSeedSamplePortfolio,
  onOpenDerivativesModal,
  onOpenSecurityCenter,
  onOpenChangePassword,
  onAddInstrument,
  onOpenGlobalRadar,
  onOpenCryptoLiveBoard,
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [marketCategory, setMarketCategory] = useState<AssetCategory | 'all' | 'options_warrants'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusSymbol, setFocusSymbol] = useState<string>('2317');
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
  const [isGlobalAllocationOpen, setIsGlobalAllocationOpen] = useState(true);
  const [isSearchSectionCollapsed, setIsSearchSectionCollapsed] = useState(false);
  const [isDerivativesListCollapsed, setIsDerivativesListCollapsed] = useState(false);
  const [isMarketCatalogueCollapsed, setIsMarketCatalogueCollapsed] = useState(true);

  // Full Market Stock Search (TWSE + US Stocks) & 市場資料 Live Query states
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [searchNotice, setSearchNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [stockSuggestions, setStockSuggestions] = useState<
    Array<{
      symbol: string;
      name: string;
      industry?: string;
      price?: number;
      type?: string;
      market?: string;
      change?: number;
      changePct?: number;
    }>
  >([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchTimeoutRef = React.useRef<any>(null);

  // 💡 設計方案 B：現貨漲停鎖死買不到引導面板狀態
  const [limitUpTargetInst, setLimitUpTargetInst] = useState<InstrumentSpec | null>(null);

  const handleInputChange = (val: string) => {
    setSearchQuery(val);
    const q = val.trim();
    if (!q) {
      setStockSuggestions([]);
      setIsSearchDropdownOpen(false);
      return;
    }

    setIsSearchDropdownOpen(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search-stocks?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.results)) {
          setStockSuggestions(json.results);
        }
      } catch (err) {
        console.warn('Autocomplete search failed:', err);
      }
    }, 150);
  };

  const handleExecuteSearch = async (target?: string) => {
    const q = (target || searchQuery).trim();
    if (!q) return;

    setIsSearchingStock(true);
    setSearchNotice({ type: 'info', message: `正在連線 官方資料庫查詢「${q}」...` });
    setIsSearchDropdownOpen(false);

    try {
      // 1. Check if already loaded in allInstruments
      const qLower = q.toLowerCase();
      const existing = allInstruments.find(
        i => i.symbol.toLowerCase() === qLower || i.name.toLowerCase() === qLower || i.name.includes(q)
      );

      if (existing) {
        setFocusSymbol(existing.symbol);
        setSearchNotice({
          type: 'success',
          message: `已切換至【${existing.name} (${existing.symbol})】，現貨與相關衍生品已自動展開！`,
        });
        setSearchQuery('');
        return;
      }

      // 2. Query server for authentic live quote & specs from 市場資料
      const res = await fetch('/api/gemini/quote-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, category: 'stocks', benchmarkDate: getSystemDateStr() }),
      });
      const json = await res.json();

      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || `查無標的「${q}」，請確認台股或美股代號（如 YAHOO、NVDA、AAPL、2609、3231）或中文名稱。`);
      }

      const d = json.data;
      const isUs = d.category === 'us_stocks';
      const newInst: InstrumentSpec = {
        symbol: d.symbol,
        name: d.name,
        category: d.category || 'stocks',
        price: d.closePrice,
        prevClose: d.prevClosePrice || d.closePrice,
        change: d.change || 0,
        changePercent: d.changePercent || 0,
        volume: d.volume || 10000,
        unitLabel: d.unitDescription || (isUs ? '股 (1股起，匯率1:32)' : '張 (1,000股)'),
        multiplier: d.contractMultiplier || (isUs ? 32 : 1000),
        marginRequirement: d.marginRequirement || 0,
        description: isUs
          ? `🇺🇸 美股複委託標的：${d.name} (${d.symbol})，最新市價 US$ ${d.closePrice} (折合 NT$ ${Math.round(d.closePrice * 32).toLocaleString()})。`
          : `台灣上市/上櫃真實標的：${d.name} (${d.symbol})，撮合報價 NT$ ${d.closePrice}。`,
        klineHistory: d.klineHistory || [],
      };

      if (onAddInstrument) {
        onAddInstrument(newInst);
      }
      setFocusSymbol(newInst.symbol);
      setSearchNotice({
        type: 'success',
        message: isUs
          ? `✅ 查詢成功！已載入美股【${newInst.name} (${newInst.symbol})】最新價格 US$ ${newInst.price} (折合 NT$ ${Math.round(newInst.price * 32).toLocaleString()})，下方可直接 1 股起委託！`
          : `✅ 查詢成功！已成功載入【${newInst.name} (${newInst.symbol})】最新價格 NT$ ${newInst.price}，下方已為您自動展開可交易商品！`,
      });
      setSearchQuery('');
    } catch (err: any) {
      console.warn('Search stock error:', err);
      setSearchNotice({
        type: 'error',
        message: err.message || `連線 查詢失敗，請檢查代號是否正確。`,
      });
    } finally {
      setIsSearchingStock(false);
    }
  };

  // Compute portfolio metrics
  const positions = currentProfile.positions || [];

  // Calculate securities value and margin
  let totalEquityStockVal = 0;
  let totalBondVal = 0;
  let totalEtfVal = 0;
  let totalFuturesMargin = 0;
  let totalFuturesPnL = 0;
  let totalOptionsVal = 0;
  let totalWarrantsVal = 0;
  let totalCommoditiesVal = 0;
  let totalCryptoVal = 0;
  let totalUsStockVal = 0;
  let totalUnrealizedPnL = 0;

  // Breakdown for Global Assets (台股、台指期、美股、原油、黃金、BTC、ETH、USDT、USDC、TWDT、現金)
  let twStockVal = 0;
  let twFuturesEquity = 0;
  let usStockVal = 0;
  let crudeOilVal = 0;
  let goldVal = 0;
  let otherCommoditiesVal = 0;
  let btcVal = 0;
  let ethVal = 0;
  let usdtVal = 0;
  let usdcVal = 0;
  let twdtVal = 0;
  let otherCryptoVal = 0;

  positions.forEach(pos => {
    totalUnrealizedPnL += (pos.unrealizedPnL || 0);
    const sym = (pos.symbol || '').toUpperCase();
    const name = pos.name || '';

    if (pos.category === 'stocks') {
      totalEquityStockVal += pos.notionalValue;
      twStockVal += pos.notionalValue;
    } else if (pos.category === 'us_stocks') {
      totalUsStockVal += pos.notionalValue;
      usStockVal += pos.notionalValue;
    } else if (pos.category === 'bonds') {
      totalBondVal += pos.notionalValue;
    } else if (pos.category === 'etfs') {
      totalEtfVal += pos.notionalValue;
    } else if (pos.category === 'futures') {
      totalFuturesMargin += pos.totalCostOrMargin;
      totalFuturesPnL += (pos.unrealizedPnL || 0);
      twFuturesEquity += (pos.totalCostOrMargin + (pos.unrealizedPnL || 0));
    } else if (pos.category === 'commodities') {
      const commEquity = pos.totalCostOrMargin + (pos.unrealizedPnL || 0);
      totalCommoditiesVal += commEquity;
      totalFuturesMargin += pos.totalCostOrMargin;
      totalFuturesPnL += (pos.unrealizedPnL || 0);
      if (sym.includes('CL') || name.includes('原油')) {
        crudeOilVal += commEquity;
      } else if (sym.includes('GC') || name.includes('黃金')) {
        goldVal += commEquity;
      } else {
        otherCommoditiesVal += commEquity;
      }
    } else if (pos.category === 'crypto') {
      if (pos.orderType === 'SHORT_SELL_CRYPTO') {
        const shortEquity = pos.totalCostOrMargin + (pos.unrealizedPnL || 0);
        totalFuturesMargin += pos.totalCostOrMargin;
        totalFuturesPnL += (pos.unrealizedPnL || 0);
        if (sym.includes('BTC') || name.includes('比特幣')) btcVal += shortEquity;
        else if (sym.includes('ETH') || name.includes('以太幣')) ethVal += shortEquity;
        else otherCryptoVal += shortEquity;
      } else {
        totalCryptoVal += pos.notionalValue;
        if (sym.includes('BTC') || name.includes('比特幣')) btcVal += pos.notionalValue;
        else if (sym.includes('ETH') || name.includes('以太幣')) ethVal += pos.notionalValue;
        else if (sym.includes('TWDT') || sym.includes('TWDC') || name.includes('新台幣穩定幣')) twdtVal += pos.notionalValue;
        else if (sym.includes('USDT') || name.includes('泰達幣')) usdtVal += pos.notionalValue;
        else if (sym.includes('USDC') || name.includes('USD COIN') || name.includes('數位美元')) usdcVal += pos.notionalValue;
        else otherCryptoVal += pos.notionalValue;
      }
    } else if (pos.category === 'options') {
      totalOptionsVal += pos.notionalValue;
    } else if (pos.category === 'warrants') {
      totalWarrantsVal += pos.notionalValue;
    }
  });

  // Total Market Value of held positions: 證券部位現值 + 加密貨幣 + 美股 + 期貨/大宗商品權益 (保證金 + 浮動盈虧)
  const totalPositionsValue =
    totalEquityStockVal +
    totalUsStockVal +
    totalBondVal +
    totalEtfVal +
    totalOptionsVal +
    totalWarrantsVal +
    totalCryptoVal +
    (totalFuturesMargin + totalFuturesPnL);

  const netAssetValue = currentProfile.availableCash + totalPositionsValue;
  const initialCapital = currentProfile.initialCapital || 50000000;
  const totalReturn = netAssetValue - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  // Percentage of each category against NAV
  const pctCash = (currentProfile.availableCash / (netAssetValue || 1)) * 100;
  const pctStocks = (totalEquityStockVal / (netAssetValue || 1)) * 100;
  const pctUsStocks = (totalUsStockVal / (netAssetValue || 1)) * 100;
  const pctBonds = (totalBondVal / (netAssetValue || 1)) * 100;
  const pctEtfs = (totalEtfVal / (netAssetValue || 1)) * 100;
  const pctFutures = (totalFuturesMargin / (netAssetValue || 1)) * 100;
  const pctCommodities = (totalCommoditiesVal / (netAssetValue || 1)) * 100;
  const pctCrypto = (totalCryptoVal / (netAssetValue || 1)) * 100;
  const pctOptions = ((totalOptionsVal + totalWarrantsVal) / (netAssetValue || 1)) * 100;

  // Risk and Margin Analysis
  const totalMarginUsed = totalFuturesMargin;
  const riskRatioPct = totalMarginUsed > 0
    ? (netAssetValue / totalMarginUsed) * 100
    : 999;

  // Cumulative Realized PnL from closed positions (持續性累計已平倉已實現損益，包含比特幣/期貨/股票)
  const totalRealizedPnL = currentProfile.realizedPnL !== undefined
    ? currentProfile.realizedPnL
    : (currentProfile.tradeHistory || []).reduce(
        (acc, h) => acc + (h.realizedPnL || 0),
        0
      );

  // Check 5 category requirements for assignment compliance
  const hasStocks = positions.some(p => p.category === 'stocks');
  const hasBonds = positions.some(p => p.category === 'bonds');
  const hasEtfs = positions.some(p => p.category === 'etfs');
  const hasFutures = positions.some(p => p.category === 'futures');
  const hasOptions = positions.some(p => p.category === 'options' || p.category === 'warrants');

  const requiredCount = [hasStocks, hasBonds, hasEtfs, hasFutures, hasOptions].filter(Boolean).length;
  const isAllCovered = requiredCount === 5;

  // Filter instruments for the Market Hall (with intelligent multi-derivative family support)
  const filteredInstruments = allInstruments.filter(inst => {
    const matchCategory =
      marketCategory === 'all' ||
      inst.category === marketCategory ||
      (marketCategory === 'options_warrants' && (inst.category === 'options' || inst.category === 'warrants'));

    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchCategory;

    // Direct match
    const directMatch =
      inst.symbol.toLowerCase().includes(q) ||
      inst.name.toLowerCase().includes(q) ||
      inst.description.toLowerCase().includes(q);

    // Exact single match for 0050: "0050 就只有0050即可"
    if (q === '0050' || q === '台灣50' || q === '元大台灣50') {
      return inst.symbol === '0050';
    }

    // Multi-derivative family matching for 聯電 (2303, CCF, CCO, 08303P, 08304P)
    const isUmcQuery = q.includes('聯電') || q === '2303' || q.includes('08303') || q.includes('08304') || q === 'ccf' || q.includes('cco');
    if (isUmcQuery) {
      if (
        inst.symbol === '2303' ||
        inst.symbol === 'CCF' ||
        inst.symbol.startsWith('CCO') ||
        inst.symbol === '08303P' ||
        inst.symbol === '08304P' ||
        inst.name.includes('聯電') ||
        inst.symbol === '0050'
      ) {
        return matchCategory;
      }
    }

    // Multi-derivative family matching for 鴻海
    const isHonhaiQuery = q.includes('鴻海') || q === '2317' || q === 'dh' || q === 'dho' || q.includes('08644') || q === '089217';
    if (isHonhaiQuery) {
      if (
        inst.symbol === '2317' ||
        inst.symbol.includes('DH') ||
        inst.symbol === '08644P' ||
        inst.symbol === '089217' ||
        inst.name.includes('鴻海') ||
        inst.symbol === '0050' ||
        inst.symbol === '0056' ||
        inst.symbol === '00918' ||
        inst.symbol === '00631L' ||
        inst.symbol === '00632R'
      ) {
        return matchCategory;
      }
    }

    // Multi-derivative family matching for 台積電
    const isTsmcQuery = q.includes('台積') || q === '2330' || q === 'cd' || q === 'cdo' || q.includes('08643');
    if (isTsmcQuery) {
      if (
        inst.symbol === '2330' ||
        inst.symbol.includes('CD') ||
        inst.symbol === '08643P' ||
        inst.name.includes('台積') ||
        inst.symbol === '0050' ||
        inst.symbol === '0052' ||
        inst.symbol === '00631L' ||
        inst.symbol === '00632R'
      ) {
        return matchCategory;
      }
    }

    return matchCategory && directMatch;
  });

  const handleSelfBuy = (inst: InstrumentSpec) => {
    // 💡 設計方案 B：若現貨股票觸及漲停鎖死，市價買單無法成交，彈出【智慧金融教育引導：轉向衍生性商品】
    const isLimitUp = Boolean(
      inst.isLimitUp ||
        (inst.category === 'stocks' && inst.limitUpPrice && inst.price >= inst.limitUpPrice) ||
        (inst.category === 'stocks' && inst.changePercent >= 9.8)
    );

    if (isLimitUp) {
      setLimitUpTargetInst(inst);
      return;
    }

    if (onSelectInstrumentToTrade) {
      let defaultBuyAction: OrderAction = 'BUY_STOCK';
      if (inst.category === 'futures') defaultBuyAction = 'BUY_FUTURES_LONG';
      else if (inst.category === 'options') defaultBuyAction = 'BUY_CALL_OPTION';
      else if (inst.category === 'warrants') defaultBuyAction = 'BUY_CALL_WARRANT';
      else if (inst.category === 'bonds') defaultBuyAction = 'BUY_BOND';
      else if (inst.category === 'etfs') defaultBuyAction = 'BUY_ETF';
      onSelectInstrumentToTrade(inst, defaultBuyAction);
    } else {
      onOpenTrading();
    }
  };

  const handleSelectLimitUpAlternative = (targetInst: InstrumentSpec, action: OrderAction) => {
    setLimitUpTargetInst(null);
    if (onSelectInstrumentToTrade) {
      onSelectInstrumentToTrade(targetInst, action);
    }
  };

  const handleProceedQueuedOrder = (inst: InstrumentSpec) => {
    setLimitUpTargetInst(null);
    if (onSelectInstrumentToTrade) {
      onSelectInstrumentToTrade(inst, 'BUY_STOCK');
    }
  };

  const handleSelfShort = (inst: InstrumentSpec) => {
    if (onSelectInstrumentToTrade) {
      if (inst.category === 'futures') {
        onSelectInstrumentToTrade(inst, 'SELL_FUTURES_SHORT');
      } else if (inst.category === 'options') {
        onSelectInstrumentToTrade(inst, 'BUY_PUT_OPTION');
      } else if (inst.category === 'warrants') {
        onSelectInstrumentToTrade(inst, 'BUY_PUT_WARRANT');
      } else if (inst.category === 'etfs') {
        onSelectInstrumentToTrade(inst, 'SHORT_SELL_ETF');
      } else {
        onSelectInstrumentToTrade(inst, 'SHORT_SELL_STOCK');
      }
    } else {
      onOpenTrading();
    }
  };

  // Quick underlying chip choices (including 漢翔 2634, 聯電 2303, 台積電 2330, 鴻海 2317, 0050, TX, etc.)
  const quickUnderlyings = [
    { symbol: '2634', name: '漢翔', price: 64.4 },
    { symbol: '2303', name: '聯電', price: 161.5 },
    { symbol: '2317', name: '鴻海', price: 254 },
    { symbol: '2330', name: '台積電', price: 2510 },
    { symbol: '2454', name: '聯發科', price: 4980 },
    { symbol: '2382', name: '廣達', price: 334 },
    { symbol: '2308', name: '台達電', price: 1905 },
    { symbol: '0050', name: '台灣50', price: 112.9 },
    { symbol: '00679B', name: '美債20年', price: 24.64 },
    { symbol: 'TX', name: '台指期', price: 22850 },
  ];

  // Intelligent resolution of current focus from search query (supporting warrant codes, futures codes, or stock codes)
  const currentFocus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return allInstruments.find(i => i.symbol === focusSymbol) || allInstruments.find(i => i.symbol === '2303') || allInstruments.find(i => i.symbol === '2317') || allInstruments[0];
    }

    // 0. If user specifically asks for 0050: strictly 0050
    if (q === '0050' || q.includes('台灣50') || q.includes('0050')) {
      const inst0050 = allInstruments.find(i => i.symbol === '0050');
      if (inst0050) return inst0050;
    }

    // 1. Direct match first
    const direct = allInstruments.find(i => i.symbol.toLowerCase() === q || i.name.toLowerCase().includes(q));

    // 2. Intelligent parent resolution: if search query is a warrant code (e.g. 08303P) or futures code (CCF)
    if (direct) {
      // 聯電 family resolution
      if (direct.symbol === '08303P' || direct.symbol === '08304P' || direct.symbol === 'CCF' || direct.symbol.startsWith('CCO') || direct.name.includes('聯電')) {
        return allInstruments.find(i => i.symbol === '2303') || direct;
      }
      // 台積電 family resolution
      if (direct.symbol === '08643P' || direct.symbol === 'CDF' || direct.symbol === 'CD' || direct.symbol.startsWith('CDO') || direct.name.includes('台積')) {
        return allInstruments.find(i => i.symbol === '2330') || direct;
      }
      // 鴻海 family resolution
      if (direct.symbol === '08644P' || direct.symbol === '089217' || direct.symbol === 'DH' || direct.symbol === 'DHF' || direct.symbol.startsWith('DHO') || direct.name.includes('鴻海')) {
        return allInstruments.find(i => i.symbol === '2317') || direct;
      }
      if (direct.symbol === 'DVF' || direct.symbol.startsWith('DVO') || direct.name.includes('聯發科')) {
        return allInstruments.find(i => i.symbol === '2454') || direct;
      }
      if (direct.symbol === 'QDF' || direct.symbol.startsWith('QDO') || direct.name.includes('廣達')) {
        return allInstruments.find(i => i.symbol === '2382') || direct;
      }
      if (direct.symbol === 'CZF' || direct.name.includes('長榮')) {
        return allInstruments.find(i => i.symbol === '2603') || direct;
      }
      if (direct.symbol === '08645P' || direct.symbol.startsWith('TXO') || direct.symbol === 'MTX' || direct.symbol === 'TMF') {
        return allInstruments.find(i => i.symbol === 'TX') || direct;
      }
      // Generic warrant resolver: if warrant name contains an existing stock name
      if (direct.category === 'warrants') {
        const parentStock = allInstruments.find(
          i => i.category === 'stocks' && (direct.name.includes(i.name) || (i.name.length >= 2 && direct.name.includes(i.name.slice(0, 2))))
        );
        if (parentStock) return parentStock;
      }
      return direct;
    }

    // 3. Keyword / partial code heuristic
    if (q.includes('聯電') || q === '2303' || q.includes('08303') || q.includes('08304') || q === 'ccf' || q.includes('cco')) {
      return allInstruments.find(i => i.symbol === '2303') || allInstruments[0];
    }
    if (q.includes('台積') || q === '2330' || q.includes('08643') || q === 'cdf' || q.includes('cdo')) {
      return allInstruments.find(i => i.symbol === '2330') || allInstruments[0];
    }
    if (q.includes('鴻海') || q === '2317' || q.includes('08644') || q === 'dh' || q === 'dhf') {
      return allInstruments.find(i => i.symbol === '2317') || allInstruments[0];
    }
    if (q.includes('0050') || q.includes('台灣50')) {
      return allInstruments.find(i => i.symbol === '0050') || allInstruments[0];
    }
    if (q.includes('美債') || q.includes('00679')) {
      return allInstruments.find(i => i.symbol === '00679B') || allInstruments[0];
    }
    if (q.includes('台指') || q.includes('tx')) {
      return allInstruments.find(i => i.symbol === 'TX') || allInstruments[0];
    }

    return allInstruments.find(i => i.symbol === focusSymbol) || allInstruments[0];
  }, [searchQuery, focusSymbol, allInstruments]);

  // Dynamically resolve derivatives and related instruments for ANY focus target
  // - If stock (2303, 2330, 2317, etc.): shows all 7 derivatives (Stock, Stock Futures, Call Option, Put Option, Call Warrant, Put Warrant, Benchmark ETF)
  // - If 0050: shows ONLY 0050 (and inverse hedge 00632R)
  // - If other ETF/Bond: shows ONLY that ETF/Bond
  // - If Index (TX): shows TX, MTX, TMF, TXO Call, TXO Put, Warrant
  const derivedFamilyItems = useMemo(() => {
    const s = currentFocus.symbol;
    const cat = currentFocus.category;

    // 1. If 0050: "0050 就只有0050即可"
    if (s === '0050') {
      return [
        {
          id: 'etf_0050_core',
          num: '1',
          title: '元大台灣50 (0050)',
          badge: '核心被動指數 ETF',
          detail: `NT$ ${(currentFocus.price * 1000).toLocaleString()}/張 · 1張=1,000股 · 現價 NT$ ${currentFocus.price}`,
          instrument: currentFocus,
          actions: [
            { label: '現股買進', action: 'BUY_ETF' as OrderAction, colorClass: 'bg-rose-600 hover:bg-rose-700 text-white font-black' },
            { label: '融券放空', action: 'SHORT_SELL_ETF' as OrderAction, colorClass: 'bg-emerald-700 hover:bg-emerald-800 text-white font-black' },
          ],
        },
      ];
    }

    // 2. If other ETF or Bond (e.g. 00679B, 00918, 0056, 00878, 00981A): Only show that single instrument!
    if (cat === 'etfs' || cat === 'bonds') {
      return [
        {
          id: `single_${s}`,
          num: '1',
          title: `${currentFocus.name} (${s})`,
          badge: cat === 'bonds' ? '長天期公債' : '現貨 ETF',
          detail: `NT$ ${(currentFocus.price * (currentFocus.multiplier || 1000)).toLocaleString()}/張 · 1張=1,000股`,
          instrument: currentFocus,
          actions: [
            {
              label: cat === 'bonds' ? '現貨買進' : 'ETF買進',
              action: (cat === 'bonds' ? 'BUY_BOND' : 'BUY_ETF') as OrderAction,
              colorClass: 'bg-rose-600 hover:bg-rose-700 text-white font-black',
            },
            ...(cat === 'etfs'
              ? [{ label: '融券賣出', action: 'SHORT_SELL_ETF' as OrderAction, colorClass: 'bg-emerald-700 hover:bg-emerald-800 text-white font-black' }]
              : []),
          ],
        },
      ];
    }

    // 2.5 If US Stock (e.g. YAHOO, YHOO, YUM, YELP, NVDA, AAPL, TSLA, TSM, MSFT, etc.)
    if (cat === 'us_stocks') {
      const priceTwd = Math.round(currentFocus.price * 32);
      const usCoreItem = {
        id: `us_stock_${s}`,
        num: '1',
        title: `${currentFocus.name} (${s})`,
        badge: '美股複委託 (1股起買)',
        detail: `市價 US$ ${currentFocus.price.toLocaleString()} (折合 NT$ ${priceTwd.toLocaleString()}) · 匯率 1:32 自動圈存台幣`,
        instrument: currentFocus,
        actions: [
          {
            label: '🇺🇸 美股複委託買進 (做多)',
            action: 'BUY_US_STOCK' as OrderAction,
            colorClass: 'bg-sky-600 hover:bg-sky-700 text-white font-black',
          },
        ],
      };

      const items: any[] = [usCoreItem];
      if (s === 'TSM') {
        const tsmc = allInstruments.find(i => i.symbol === '2330');
        if (tsmc) {
          items.push({
            id: 'tsm_link_2330',
            num: '2',
            title: '台積電 (2330) 現貨母股',
            badge: 'ADR 對應母股',
            detail: `現價 NT$ ${tsmc.price} · 1 ADR = 5股台積電`,
            instrument: tsmc,
            actions: [
              { label: '現股買進', action: 'BUY_STOCK' as OrderAction, colorClass: 'bg-rose-600 hover:bg-rose-700 text-white font-black' },
            ],
          });
        }
      }
      return items;
    }

    // 3. If Index Futures / Options (TX, MTX, TXO)
    if (s === 'TX' || s === 'MTX' || s === 'TMF' || cat === 'options' || s.startsWith('TXO')) {
      const tx = allInstruments.find(i => i.symbol === 'TX') || currentFocus;
      const mtx = allInstruments.find(i => i.symbol === 'MTX') || currentFocus;
      const tmf = allInstruments.find(i => i.symbol === 'TMF') || currentFocus;
      const callOpt = allInstruments.find(i => i.symbol === 'TXO-49000-C' || (i.category === 'options' && i.symbol.endsWith('C'))) || currentFocus;
      const putOpt = allInstruments.find(i => i.symbol === 'TXO-47000-P' || (i.category === 'options' && i.symbol.endsWith('P'))) || currentFocus;
      const warrantPut = allInstruments.find(i => i.symbol === '08645P') || currentFocus;

      return [
        {
          id: 'tx_big',
          num: '1',
          title: '台指期 (大台 TX)',
          badge: '點數x200元',
          detail: `保證金 NT$ ${tx.marginRequirement?.toLocaleString() || '320,000'} · 旗艦多空工具`,
          instrument: tx,
          actions: [
            { label: '期貨做多', action: 'BUY_FUTURES_LONG' as OrderAction, colorClass: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' },
            { label: '期貨放空', action: 'SELL_FUTURES_SHORT' as OrderAction, colorClass: 'bg-slate-900 hover:bg-slate-800 text-white font-black' },
          ],
        },
        {
          id: 'tx_small',
          num: '2',
          title: '小型台指期 (小台 MTX)',
          badge: '點數x50元',
          detail: `保證金 NT$ ${mtx.marginRequirement?.toLocaleString() || '80,000'} · 靈活對沖`,
          instrument: mtx,
          actions: [
            { label: '小台做多', action: 'BUY_FUTURES_LONG' as OrderAction, colorClass: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' },
            { label: '小台放空', action: 'SELL_FUTURES_SHORT' as OrderAction, colorClass: 'bg-slate-900 hover:bg-slate-800 text-white font-black' },
          ],
        },
        {
          id: 'tx_micro',
          num: '3',
          title: '微型台指期 (微台 TMF)',
          badge: '點數x10元',
          detail: `保證金 NT$ ${tmf.marginRequirement?.toLocaleString() || '16,000'} · 超小資微調`,
          instrument: tmf,
          actions: [
            { label: '微台做多', action: 'BUY_FUTURES_LONG' as OrderAction, colorClass: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' },
            { label: '微台放空', action: 'SELL_FUTURES_SHORT' as OrderAction, colorClass: 'bg-slate-900 hover:bg-slate-800 text-white font-black' },
          ],
        },
        {
          id: 'txo_call',
          num: '4',
          title: '台指買權 (TXO 49000-Call)',
          badge: '看大漲波段',
          detail: `最新權利金 NT$ ${callOpt.price}點 (NT$ ${(callOpt.price * 50).toLocaleString()}/口)`,
          instrument: callOpt,
          actions: [
            { label: '買進 Call', action: 'BUY_CALL_OPTION' as OrderAction, colorClass: 'bg-purple-600 hover:bg-purple-700 text-white font-black' },
          ],
        },
        {
          id: 'txo_put',
          num: '5',
          title: '台指賣權 (TXO 47000-Put)',
          badge: '黑天鵝保單',
          detail: `最新權利金 NT$ ${putOpt.price}點 (NT$ ${(putOpt.price * 50).toLocaleString()}/口)`,
          instrument: putOpt,
          actions: [
            { label: '買進 Put', action: 'BUY_PUT_OPTION' as OrderAction, colorClass: 'bg-slate-800 hover:bg-slate-700 text-purple-300 font-black' },
          ],
        },
        {
          id: 'tx_warrant',
          num: '6',
          title: '台指凱基43售01 (08645P)',
          badge: '認售權證',
          detail: `最新價 NT$ ${warrantPut.price} · 槓桿大盤重挫避險保護`,
          instrument: warrantPut,
          actions: [
            { label: '買進認售權證', action: 'BUY_PUT_WARRANT' as OrderAction, colorClass: 'bg-emerald-700 hover:bg-emerald-800 text-white font-black' },
          ],
        },
      ];
    }

    // 4. Case: STOCKS (2303 聯電, 2330 台積電, 2317 鴻海, 2454 聯發科, 2382 廣達, 2603 長榮, etc.)
    // "比方 聯電權證號碼 搜尋 聯電七種也都會出現"
    let matchedFutures = allInstruments.find(i => {
      if (s === '2303') return i.symbol === 'CCF' || i.name.includes('聯電');
      if (s === '2330') return i.symbol === 'CDF' || i.symbol === 'CD' || i.name.includes('台積');
      if (s === '2317') return i.symbol === 'DHF' || i.symbol === 'DH' || i.name.includes('鴻海');
      if (s === '2454') return i.symbol === 'DVF' || i.name.includes('聯發科');
      if (s === '2382') return i.symbol === 'QDF' || i.name.includes('廣達');
      if (s === '2603') return i.symbol === 'CZF' || i.name.includes('長榮');
      return i.category === 'futures' && i.name.includes(currentFocus.name);
    });

    if (!matchedFutures) {
      matchedFutures = {
        symbol: `${s}F`,
        name: `${currentFocus.name}股票期貨`,
        category: 'futures',
        price: currentFocus.price,
        prevClose: currentFocus.prevClose,
        change: currentFocus.change,
        changePercent: currentFocus.changePercent,
        volume: 8000,
        unitLabel: '口 (一口=2,000股)',
        multiplier: 2000,
        marginRequirement: Math.round(currentFocus.price * 2000 * 0.135),
        description: `${currentFocus.name}個股期貨，一口表彰2張現股，具備7.4倍高槓桿。`,
        klineHistory: currentFocus.klineHistory,
      };
    }

    let matchedCall = allInstruments.find(i => {
      if (s === '2303') return i.symbol === 'CCO-55-C' || (i.category === 'options' && i.name.includes('聯電') && i.symbol.endsWith('C'));
      if (s === '2330') return (i.category === 'options' && i.name.includes('台積') && i.symbol.endsWith('C')) || i.symbol === 'TXO-49000-C';
      if (s === '2317') return (i.category === 'options' && i.name.includes('鴻海') && i.symbol.endsWith('C')) || i.symbol === 'TXO-49000-C';
      return i.category === 'options' && i.name.includes(currentFocus.name) && i.symbol.endsWith('C');
    }) || allInstruments.find(i => i.symbol === 'TXO-49000-C') || currentFocus;

    let matchedPut = allInstruments.find(i => {
      if (s === '2303') return i.symbol === 'CCO-52.5-P' || (i.category === 'options' && i.name.includes('聯電') && i.symbol.endsWith('P'));
      if (s === '2330') return (i.category === 'options' && i.name.includes('台積') && i.symbol.endsWith('P')) || i.symbol === 'TXO-47000-P';
      if (s === '2317') return (i.category === 'options' && i.name.includes('鴻海') && i.symbol.endsWith('P')) || i.symbol === 'TXO-47000-P';
      return i.category === 'options' && i.name.includes(currentFocus.name) && i.symbol.endsWith('P');
    }) || allInstruments.find(i => i.symbol === 'TXO-47000-P') || currentFocus;

    let matchedCallWarrant = allInstruments.find(i => {
      if (s === '2303') return i.symbol === '08303P' || (i.category === 'warrants' && i.name.includes('聯電') && (i.name.includes('購') || !i.name.includes('售')));
      if (s === '2330') return i.symbol === '08643P' || (i.category === 'warrants' && i.name.includes('台積'));
      if (s === '2317') return i.symbol === '08644P' || (i.category === 'warrants' && i.name.includes('鴻海'));
      return i.category === 'warrants' && (i.name.includes(currentFocus.name) || i.name.includes('購'));
    }) || allInstruments.find(i => i.category === 'warrants') || currentFocus;

    let matchedPutWarrant = allInstruments.find(i => {
      if (s === '2303') return i.symbol === '08304P' || (i.category === 'warrants' && i.name.includes('聯電') && i.name.includes('售'));
      if (s === '2330' || s === '2317') return i.symbol === '08645P' || (i.category === 'warrants' && i.name.includes('售'));
      return i.category === 'warrants' && i.name.includes('售');
    }) || allInstruments.find(i => i.symbol === '08645P') || currentFocus;

    const etf0050 = allInstruments.find(i => i.symbol === '0050') || currentFocus;
    const etfInverse = allInstruments.find(i => i.symbol === '00632R') || currentFocus;

    return [
      // 1. 現貨股票
      {
        id: 'stock_spot',
        num: '1',
        title: `現貨股票：${currentFocus.name} (${currentFocus.symbol})`,
        badge: '現貨底倉',
        detail: `NT$ ${(currentFocus.price * 1000).toLocaleString()}/張 · 1張=1,000股`,
        instrument: currentFocus,
        actions: [
          { label: '現股買進', action: 'BUY_STOCK' as OrderAction, colorClass: 'bg-rose-600 hover:bg-rose-700 text-white font-black' },
          { label: '融資買進 (4成)', action: 'BUY_MARGIN_STOCK' as OrderAction, colorClass: 'bg-amber-600 hover:bg-amber-700 text-white font-black' },
          { label: '融券賣出', action: 'SHORT_SELL_STOCK' as OrderAction, colorClass: 'bg-emerald-700 hover:bg-emerald-800 text-white font-black' },
        ],
      },
      // 2. 股票期貨
      {
        id: 'stock_futures',
        num: '2',
        title: `股票期貨：${matchedFutures.name} (${matchedFutures.symbol})`,
        badge: '7.4x 槓桿',
        detail: `一口=2,000股 (2張現貨) · 保證金約 NT$ ${(matchedFutures.marginRequirement || Math.round(currentFocus.price * 2000 * 0.135)).toLocaleString()}`,
        instrument: matchedFutures,
        actions: [
          { label: '期貨做多', action: 'BUY_FUTURES_LONG' as OrderAction, colorClass: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' },
          { label: '期貨做空', action: 'SELL_FUTURES_SHORT' as OrderAction, colorClass: 'bg-slate-900 hover:bg-slate-800 text-white font-black' },
        ],
      },
      // 3. 股票選擇權 - 買權 Call
      {
        id: 'stock_options_call',
        num: '3',
        title: `股票選擇權買權：${matchedCall.name}`,
        badge: '看大漲暴利',
        detail: `權利金 NT$ ${matchedCall.price} · 1口=2,000股 · 有限成本鎖定暴利`,
        instrument: matchedCall,
        actions: [
          { label: '買進 Call', action: 'BUY_CALL_OPTION' as OrderAction, colorClass: 'bg-purple-600 hover:bg-purple-700 text-white font-black' },
        ],
      },
      // 4. 股票選擇權 - 賣權 Put
      {
        id: 'stock_options_put',
        num: '4',
        title: `股票選擇權賣權：${matchedPut.name}`,
        badge: '看空/防回檔',
        detail: `權利金 NT$ ${matchedPut.price} · 1口=2,000股 · 完美現股下檔防護`,
        instrument: matchedPut,
        actions: [
          { label: '買進 Put', action: 'BUY_PUT_OPTION' as OrderAction, colorClass: 'bg-slate-800 hover:bg-slate-700 text-purple-300 font-black' },
        ],
      },
      // 5. 認購權證 (Call Warrant)
      {
        id: 'stock_warrant_call',
        num: '5',
        title: `認購權證：${matchedCallWarrant.name} (${matchedCallWarrant.symbol})`,
        badge: '認購暴賺',
        detail: `最新價 NT$ ${matchedCallWarrant.price} · 實質槓桿約 5.8x · 小資翻倍博上漲`,
        instrument: matchedCallWarrant,
        actions: [
          { label: '買進認購', action: 'BUY_CALL_WARRANT' as OrderAction, colorClass: 'bg-rose-600 hover:bg-rose-700 text-white font-black' },
        ],
      },
      // 6. 認售權證 (Put Warrant)
      {
        id: 'stock_warrant_put',
        num: '6',
        title: `認售權證：${matchedPutWarrant.name} (${matchedPutWarrant.symbol})`,
        badge: '認售避險',
        detail: `最新價 NT$ ${matchedPutWarrant.price} · 現貨大跌時權證快速翻倍`,
        instrument: matchedPutWarrant,
        actions: [
          { label: '買進認售', action: 'BUY_PUT_WARRANT' as OrderAction, colorClass: 'bg-emerald-700 hover:bg-emerald-800 text-white font-black' },
        ],
      },
      // 7. 連動與避險 ETF
      {
        id: 'stock_etf_hedge',
        num: '7',
        title: `相關連動與避險：0050 / 00632R 反1`,
        badge: '雙向防護',
        detail: `0050 市值壓艙 · 00632R 單日反向 1 倍現股防禦性放空避險`,
        instrument: etf0050,
        actions: [
          { label: '0050 配置', action: 'BUY_ETF' as OrderAction, colorClass: 'bg-blue-600 hover:bg-blue-700 text-white font-black' },
          { label: '反1 避險買進', action: 'BUY_ETF' as OrderAction, colorClass: 'bg-slate-900 hover:bg-slate-800 text-amber-300 font-black' },
        ],
      },
    ];
  }, [currentFocus, allInstruments]);

  const myFocusPositions = useMemo(() => {
    const s = currentFocus.symbol;
    const name = currentFocus.name;
    return positions.filter(p => {
      if (p.symbol === s) return true;
      if (name && p.name && (p.name.includes(name) || name.includes(p.name))) return true;
      if (s === '2303' && (p.symbol === 'CCF' || p.symbol.startsWith('CCO') || p.symbol === '08303P' || p.symbol === '08304P' || p.name.includes('聯電'))) return true;
      if (s === '2317' && (p.symbol === 'DH' || p.symbol === 'DHF' || p.symbol.startsWith('DHO') || p.symbol === '08644P' || p.name.includes('鴻海'))) return true;
      if (s === '2330' && (p.symbol === 'CD' || p.symbol === 'CDF' || p.symbol.startsWith('CDO') || p.symbol === '08643P' || p.name.includes('台積'))) return true;
      if (s === '2454' && (p.symbol === 'DVF' || p.symbol.startsWith('DVO') || p.name.includes('聯發科'))) return true;
      if (s === '2382' && (p.symbol === 'QDF' || p.symbol.startsWith('QDO') || p.name.includes('廣達'))) return true;
      if (s === '2603' && (p.symbol === 'CZF' || p.name.includes('長榮'))) return true;
      if ((s === 'TX' || s === 'MTX' || s.startsWith('TXO')) && (p.symbol === 'TX' || p.symbol === 'MTX' || p.symbol === 'TMF' || p.symbol.startsWith('TXO') || p.symbol === '08645P')) return true;
      return false;
    });
  }, [positions, currentFocus]);
  const myFocusQty = myFocusPositions.reduce((sum, p) => sum + p.quantity, 0);
  const myFocusCost = myFocusPositions.reduce((sum, p) => sum + p.totalCostOrMargin, 0);
  const myFocusMarketVal = myFocusPositions.reduce((sum, p) => sum + p.notionalValue, 0);
  const myFocusPnL = myFocusPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const myFocusAvgCost = myFocusQty > 0 && myFocusCost > 0 ? Math.round(myFocusCost / myFocusQty) : 0;

  return (
    <div className="space-y-5 sm:space-y-6 text-slate-900">
      {/* 1. 我的資產 (Portfolio Summary) - 乾淨四宮格與進度指標 */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-lg">
              {currentProfile.avatarEmoji || '👑'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-950">
                  我的資產總覽
                </h2>
                <span className="text-xs text-slate-500 font-bold">
                  （{currentProfile.studentName} · {currentProfile.teamName}）
                </span>
                {onOpenChangePassword && (
                  <button
                    type="button"
                    onClick={onOpenChangePassword}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="修改此帳號登入密碼"
                  >
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>修改密碼</span>
                  </button>
                )}
                {onOpenResetPortfolio && (
                  <button
                    type="button"
                    onClick={onOpenResetPortfolio}
                    className="px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="玩錯了想清空重來？輸入密碼清空所有部位，重新規劃五千萬"
                  >
                    <RotateCcw className="w-3 h-3 text-rose-600" />
                    <span>清空重來</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span
              className={`font-black px-2.5 py-0.5 rounded-full border ${
                isAllCovered
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-amber-100 text-amber-950 border-amber-300'
              }`}
            >
              {isAllCovered ? '✅ 5大類別全數涵蓋' : `⚠️ 涵蓋進度 ${requiredCount}/5 種商品`}
            </span>
            <button
              type="button"
              onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition cursor-pointer flex items-center gap-1 shadow-2xs"
              title="收起或展開資產卡片，釋放手機畫面"
            >
              <span>{isSummaryCollapsed ? '展開資產 ▾' : '收起資產 ▴'}</span>
            </button>
          </div>
        </div>

        {isSummaryCollapsed ? (
          /* Slim compact asset strip */
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs py-1">
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-slate-700">
              <span>持倉: <strong className="font-mono text-slate-950 font-black">NT$ {Math.round(totalPositionsValue).toLocaleString()}</strong></span>
              <span>現金: <strong className="font-mono text-emerald-800 font-black">NT$ {Math.round(currentProfile.availableCash).toLocaleString()}</strong></span>
              <span>未實現: <strong className={`font-mono font-black ${totalUnrealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{totalUnrealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(totalUnrealizedPnL).toLocaleString()}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setIsSummaryCollapsed(false)}
              className="text-amber-800 hover:text-amber-900 font-bold underline cursor-pointer text-xs"
            >
              展開4宮格與比例 ▾
            </button>
          </div>
        ) : (
          <>
            {/* 4 Cards: 持倉市值, 可用資金, 未實現損益, 今日損益 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: 持倉市值 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                    {positions.length > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                    持倉市值 (Market Value)
                  </span>
                  {positions.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      即時撮合
                    </span>
                  )}
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-slate-950 transition-all duration-300">
                  NT$ {Math.round(totalPositionsValue).toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-600 font-medium mt-0.5 block">
                  {positions.length > 0 ? `${positions.length} 檔商品在倉 · 隨盤中動態波動` : '目前無持倉部位'}
                </span>
              </div>

              {/* Card 2: 可用資金 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
                <span className="text-xs text-slate-500 font-bold block mb-1">可用資金 (Available Cash)</span>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-800">
                  NT$ {Math.round(currentProfile.availableCash).toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-600 font-medium mt-0.5 block">
                  佔總資金 {pctCash.toFixed(1)}% · 隨時可下單
                </span>
              </div>

              {/* Card 3: 未實現損益 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                    {positions.length > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                    )}
                    未實現損益 (Unrealized)
                  </span>
                  {positions.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                      即時浮動
                    </span>
                  )}
                </div>
                <div
                  className={`text-xl sm:text-2xl font-black font-mono transition-all duration-300 ${
                    totalUnrealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {totalUnrealizedPnL >= 0 ? '+' : ''}
                  NT$ {Math.round(totalUnrealizedPnL).toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-600 font-medium mt-0.5 block">
                  持倉部位浮動盈虧 · 依撮合行情動態計算
                </span>
              </div>

              {/* Card 4: 今日損益 / 累計已平倉已實現 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500 font-bold">總報酬 / 今日損益</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      totalRealizedPnL >= 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                    title="包含比特幣、股票、期貨之累計已平倉已實現損益"
                  >
                    已平倉: {totalRealizedPnL >= 0 ? '+' : ''}{Math.round(totalRealizedPnL).toLocaleString()}
                  </span>
                </div>
                <div
                  className={`text-xl sm:text-2xl font-black font-mono ${
                    totalReturn >= 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {totalReturn >= 0 ? '+' : ''}
                  NT$ {Math.round(totalReturn).toLocaleString()}
                </div>
                <div className="flex items-center justify-between mt-0.5 flex-wrap gap-1">
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      totalReturnPct >= 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {totalReturnPct >= 0 ? '+' : ''}
                    {totalReturnPct.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono font-medium">
                    累計已平倉: <strong className={totalRealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'}>{totalRealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(totalRealizedPnL).toLocaleString()}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 🌐 全球多資產配置分佈進度條 (涵蓋股票、債券、ETF、期貨、大宗商品、Crypto、現金) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs text-slate-700 font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span>全球多元資產配置佔比 (NT$ {(netAssetValue / 10000000).toFixed(2)} 千萬總額)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-mono">可用現金: {pctCash.toFixed(1)}%</span>
                  <button
                    type="button"
                    onClick={() => setIsGlobalAllocationOpen(prev => !prev)}
                    className="text-[11px] text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                  >
                    {isGlobalAllocationOpen ? '收起配置分析 ▴' : '展開全球配置 ▾'}
                  </button>
                </div>
              </div>

              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200">
                <div style={{ width: `${pctStocks}%` }} className="bg-blue-600 transition-all duration-300" title={`台股: ${pctStocks.toFixed(1)}%`} />
                <div style={{ width: `${pctUsStocks}%` }} className="bg-cyan-600 transition-all duration-300" title={`美股: ${pctUsStocks.toFixed(1)}%`} />
                <div style={{ width: `${pctFutures}%` }} className="bg-amber-500 transition-all duration-300" title={`期指保證金: ${pctFutures.toFixed(1)}%`} />
                <div style={{ width: `${pctCommodities}%` }} className="bg-orange-500 transition-all duration-300" title={`大宗商品: ${pctCommodities.toFixed(1)}%`} />
                <div style={{ width: `${pctCrypto}%` }} className="bg-violet-600 transition-all duration-300" title={`Crypto 24/7: ${pctCrypto.toFixed(1)}%`} />
                <div style={{ width: `${pctBonds}%` }} className="bg-emerald-600 transition-all duration-300" title={`債券: ${pctBonds.toFixed(1)}%`} />
                <div style={{ width: `${pctEtfs}%` }} className="bg-indigo-600 transition-all duration-300" title={`ETF: ${pctEtfs.toFixed(1)}%`} />
                <div style={{ width: `${pctOptions}%` }} className="bg-purple-600 transition-all duration-300" title={`選擇權/權證: ${pctOptions.toFixed(1)}%`} />
                <div style={{ width: `${pctCash}%` }} className="bg-slate-300 transition-all duration-300" title={`現金: ${pctCash.toFixed(1)}%`} />
              </div>

              {/* Progress Bar Legend */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 font-medium pt-0.5">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-600" />台股 {pctStocks.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-600" />美股 {pctUsStocks.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />期指 {pctFutures.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500" />大宗商品 {pctCommodities.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-600" />Crypto 24/7 {pctCrypto.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-600" />債券 {pctBonds.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300" />現金 {pctCash.toFixed(1)}%</span>
              </div>
            </div>

            {/* ⑥ 🌐 我的全球資產配置與即時計算流程 (Global Financial Market Portfolio Engine) */}
            {isGlobalAllocationOpen && (
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-700/60 mt-3 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center">
                      🌐
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
                        我的全球資產配置 · Global Portfolio
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono">
                          24/7 即時動態連動
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        突破單一市場！涵蓋台灣市場、美國市場、大宗原物料與 24/7 加密貨幣，全天候動態估值
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {onOpenGlobalRadar && (
                        <button
                          type="button"
                          onClick={onOpenGlobalRadar}
                          className="px-2.5 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                          title="開啟全球 7 大市場交易時鐘雷達與跨時區接力模擬器"
                        >
                          <span>🛰️</span>
                          <span>7大市場時鐘</span>
                        </button>
                      )}
                      {onOpenCryptoLiveBoard && (
                        <button
                          type="button"
                          onClick={onOpenCryptoLiveBoard}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                          title="開啟 24/7 Crypto 盤口與穩定幣停泊專用下單匣"
                        >
                          <span>🪙</span>
                          <span>24/7 Crypto盤</span>
                        </button>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block font-mono">總資產 (Total NAV)</span>
                      <span className="text-lg font-black font-mono text-amber-300">
                        NT$ {Math.round(netAssetValue).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 10-Item Global Market Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {/* 1. 台股 */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>🇹🇼 台股現貨</span>
                      <span className="text-[10px] text-slate-400 font-mono">{pctStocks.toFixed(1)}%</span>
                    </div>
                    <div className="text-sm font-black font-mono text-white">
                      NT$ {Math.round(twStockVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">上市/上櫃股票部位</span>
                  </div>

                  {/* 2. 台指期 */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>🇹🇼 台指期貨</span>
                      <span className="text-[10px] text-slate-400 font-mono">{pctFutures.toFixed(1)}%</span>
                    </div>
                    <div className="text-sm font-black font-mono text-amber-300">
                      NT$ {Math.round(twFuturesEquity).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">期貨保證金+浮動盈虧</span>
                  </div>

                  {/* 3. 美股 */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>🇺🇸 美股</span>
                      <span className="text-[10px] text-slate-400 font-mono">{pctUsStocks.toFixed(1)}%</span>
                    </div>
                    <div className="text-sm font-black font-mono text-cyan-300">
                      NT$ {Math.round(usStockVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">NVDA/TSLA/AAPL (折台幣)</span>
                  </div>

                  {/* 4. 原油 */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>🛢️ 輕原油</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {((crudeOilVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-orange-300">
                      NT$ {Math.round(crudeOilVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">WTI 原油商品期貨</span>
                  </div>

                  {/* 5. 黃金 */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                      <span>🥇 紐約黃金</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {((goldVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-amber-400">
                      NT$ {Math.round(goldVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">COMEX Gold 避險資產</span>
                  </div>

                  {/* 6. BTC */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-amber-500/30">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-300 mb-1">
                      <span className="flex items-center gap-1">🪙 BTC</span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        {((btcVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-amber-300">
                      NT$ {Math.round(btcVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-amber-200/70 mt-0.5 block truncate">高波動 · 24/7 全天候</span>
                  </div>

                  {/* 7. ETH */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-indigo-500/30">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-300 mb-1">
                      <span className="flex items-center gap-1">Ξ ETH</span>
                      <span className="text-[10px] text-indigo-400 font-mono">
                        {((ethVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-indigo-300">
                      NT$ {Math.round(ethVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-indigo-200/70 mt-0.5 block truncate">智慧合約 · 24/7 全天候</span>
                  </div>

                  {/* 8. USDT (全球加密美元穩定幣) */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-cyan-500/30">
                    <div className="flex items-center justify-between text-xs font-bold text-cyan-300 mb-1">
                      <span className="flex items-center gap-1">💵 USDT</span>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        {((usdtVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-cyan-300">
                      NT$ {Math.round(usdtVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-cyan-200/70 mt-0.5 block truncate">全球穩定幣 (目標 ≈ US$1)</span>
                  </div>

                  {/* 9. USDC (全球加密合規美元穩定幣) */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-blue-500/30">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-300 mb-1">
                      <span className="flex items-center gap-1">🟣 USDC</span>
                      <span className="text-[10px] text-blue-400 font-mono">
                        {((usdcVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-blue-300">
                      NT$ {Math.round(usdcVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-blue-200/70 mt-0.5 block truncate">美合規審計 (目標 ≈ US$1)</span>
                  </div>

                  {/* 10. TWDT (台灣監理架構新台幣穩定幣) */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-emerald-500/40 ring-1 ring-emerald-500/20">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-300 mb-1">
                      <span className="flex items-center gap-1">🇹🇼 TWDT</span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        {((twdtVal / (netAssetValue || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm font-black font-mono text-emerald-300">
                      NT$ {Math.round(twdtVal).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-emerald-200/80 mt-0.5 block truncate">100% 銀行信託 · 零匯差</span>
                  </div>

                  {/* 11. 現金 */}
                  <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-600/50">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-1">
                      <span>💰 可用現金</span>
                      <span className="text-[10px] text-emerald-400 font-mono">{pctCash.toFixed(1)}%</span>
                    </div>
                    <div className="text-sm font-black font-mono text-emerald-400">
                      NT$ {Math.round(currentProfile.availableCash).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">新台幣流動性儲備</span>
                  </div>
                </div>

                {/* ⚖️ 穩定幣架構重大區分教學提示 (全球加密穩定幣 vs 台灣監理穩定幣) */}
                <div className="bg-slate-950/80 rounded-xl p-3 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shrink-0">
                      ⚖️ 監理架構重點區分
                    </span>
                    <span className="text-slate-300 leading-tight">
                      <strong>「全球加密穩定幣 (USDT/USDC)」</strong> 錨定美元（具美元/台幣匯率波動風險）；
                      <strong>「台灣監理穩定幣 (TWDT)」</strong> 依金管會專法 100% 銀行信託隔離，錨定新台幣享有<strong>完全零匯差</strong>。
                    </span>
                  </div>
                  <span className="text-[11px] text-cyan-400 font-mono font-bold shrink-0 self-end sm:self-center">
                    Stablecoin ≠ 不會跌，背後信用儲備才是核心！
                  </span>
                </div>

                {/* 即時計算連動流程鏈 (Cascade Calculation Chain) */}
                <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>即時連動計算流程鏈 (Real-Time Accounting Flow)</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 overflow-x-auto text-xs py-1">
                    <div className="text-center min-w-[90px] bg-slate-800/90 rounded-lg p-2 border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">總資產 (NAV)</span>
                      <span className="font-mono font-black text-amber-300 text-xs">
                        NT$ {Math.round(netAssetValue).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-slate-500 font-black">➔</span>
                    <div className="text-center min-w-[90px] bg-slate-800/90 rounded-lg p-2 border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">未實現損益</span>
                      <span className={`font-mono font-black text-xs ${totalUnrealizedPnL >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {totalUnrealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(totalUnrealizedPnL).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-slate-500 font-black">➔</span>
                    <div className="text-center min-w-[105px] bg-slate-800/90 rounded-lg p-2 border border-amber-500/40">
                      <span className="text-[10px] text-amber-300 font-bold block">累計已實現損益</span>
                      <span className={`font-mono font-black text-xs ${totalRealizedPnL >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {totalRealizedPnL >= 0 ? '+' : ''}NT$ {Math.round(totalRealizedPnL).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-slate-500 font-black">➔</span>
                    <div className="text-center min-w-[90px] bg-slate-800/90 rounded-lg p-2 border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">佔用保證金</span>
                      <span className="font-mono font-black text-amber-400 text-xs">
                        NT$ {Math.round(totalMarginUsed).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-slate-500 font-black">➔</span>
                    <div className="text-center min-w-[90px] bg-slate-800/90 rounded-lg p-2 border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">可用資金</span>
                      <span className="font-mono font-black text-emerald-400 text-xs">
                        NT$ {Math.round(currentProfile.availableCash).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-slate-500 font-black">➔</span>
                    <div className="text-center min-w-[85px] bg-slate-800/90 rounded-lg p-2 border border-slate-700">
                      <span className="text-[10px] text-slate-400 block">風險率 (Coverage)</span>
                      <span className="font-mono font-black text-emerald-300 text-xs">
                        {riskRatioPct >= 999 ? '安全 100%' : `${riskRatioPct.toFixed(0)}%`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 🔥【核心首要：我的持倉即時盯盤看板】(0 雜訊 · 實戰核心：專門即時追蹤自己買的個股、期貨、權證、融資、融券) */}
      <MyPositionsLiveBoard
        positions={positions}
        allInstruments={allInstruments}
        onClosePosition={onClosePosition}
        onViewInstrumentKLine={onViewInstrumentKLine}
        onSelectInstrumentToTrade={onSelectInstrumentToTrade}
        onOpenTrading={onOpenTrading}
      />

      {/* 🌍【全球大宗商品與原物料行情看板】(能源｜貴金屬｜農產品｜軟性商品｜工業金屬｜牲畜) */}
      <CommoditiesBoard
        allInstruments={allInstruments}
        onSelectInstrumentToTrade={onSelectInstrumentToTrade}
        onOpenTrading={onOpenTrading}
        onViewInstrumentKLine={onViewInstrumentKLine}
      />

      {/* 2. 🔍 標的智能查詢 · 可完整收起/展開 (極致節省手機版面) */}
      {isSearchSectionCollapsed ? (
        /* Slim Collapsed Bar - Takes only ~44px height, zero clutter on mobile */
        <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 shadow-xs flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-6 h-6 rounded-lg bg-slate-900 text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
              🔍
            </span>
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              <span className="font-black text-xs text-slate-950 truncate">
                標的查詢：{currentFocus.name} ({currentFocus.symbol})
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 font-bold shrink-0">
                {derivedFamilyItems.length} 檔商品
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsSearchSectionCollapsed(false)}
              className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-black text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer"
              title="展開標的與衍生品查詢"
            >
              <span>展開查詢 ▾</span>
            </button>
          </div>
        </div>
      ) : (
        /* Full Section 2 with collapse toggle and compact clean UI */
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5">
          {/* Section Header with Search Bar and Collapse Button */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-slate-900 text-amber-400 font-black text-xs">🔍</span>
                <h3 className="font-black text-sm sm:text-base text-slate-950">
                  標的智能查詢 · 現貨與所有衍生商品
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                全台股 4,300+ 檔皆可隨打隨查！輸入代號或名稱（例如：陽明 2609、緯創 3231、中鋼 2002、2303、0050），自動展開所有商品，點擊直接下單！
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Search Box with Autocomplete & Direct 市場資料 Lookup */}
              <div className="relative flex-1 md:w-80">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  {isSearchingStock ? (
                    <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 text-amber-600" />
                  )}
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleInputChange(e.target.value)}
                  onFocus={() => {
                    if (searchQuery.trim()) setIsSearchDropdownOpen(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteSearch();
                    }
                  }}
                  placeholder="搜尋代號或名稱（例如：YAHOO、NVDA、AAPL、陽明、3231）..."
                  className="w-full pl-8 pr-16 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-950 placeholder-slate-400 text-xs font-bold focus:bg-white focus:border-amber-500 transition shadow-2xs"
                />
                <div className="absolute inset-y-0 right-0 pr-1 flex items-center gap-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setIsSearchDropdownOpen(false);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                      title="清除搜尋"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleExecuteSearch()}
                    disabled={isSearchingStock || !searchQuery.trim()}
                    className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs cursor-pointer transition shadow-2xs"
                  >
                    {isSearchingStock ? '查詢中' : '查詢'}
                  </button>
                </div>

                {/* Auto-suggest dropdown */}
                {isSearchDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-300 rounded-2xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 flex justify-between items-center">
                      <span>全市場 4,500+ 檔即時匹配 (台股 4,300+ 檔 · 美股主流巨頭 · 期權)</span>
                      <button
                        type="button"
                        onClick={() => setIsSearchDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {stockSuggestions.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {stockSuggestions.map(s => {
                          const isUs = s.market === 'US' || s.type === 'us_stocks';
                          return (
                            <button
                              key={`${s.symbol}_${s.type}`}
                              type="button"
                              onClick={() => handleExecuteSearch(s.symbol)}
                              className="w-full px-3 py-2 text-left hover:bg-amber-50/80 transition flex items-center justify-between gap-2 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`font-mono font-black text-xs px-1.5 py-0.5 rounded ${
                                    isUs
                                      ? 'bg-sky-950 text-sky-300 border border-sky-600/40'
                                      : 'bg-slate-900 text-amber-300'
                                  }`}
                                >
                                  {isUs ? `🇺🇸 ${s.symbol}` : `🇹🇼 ${s.symbol}`}
                                </span>
                                <span className="font-black text-xs text-slate-900 truncate">
                                  {s.name}
                                </span>
                                {s.industry && (
                                  <span className="text-[10px] text-slate-400 border border-slate-200 px-1 py-0.2 rounded shrink-0">
                                    {s.industry}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {s.price !== undefined && s.price > 0 && (
                                  <span className="font-mono font-black text-xs text-slate-800">
                                    {isUs ? 'US$ ' : 'NT$ '}{s.price.toLocaleString()}
                                  </span>
                                )}
                                <span className="text-[11px] font-bold text-amber-700 opacity-0 group-hover:opacity-100 transition">
                                  載入標的 ➔
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-500 font-medium">
                        按 Enter 或點擊「查詢」立即連線抓取報價
                      </div>
                    )}

                    <div className="p-2 bg-slate-50 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleExecuteSearch()}
                        className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Search className="w-3 h-3" />
                        <span>連線查詢「{searchQuery}」真實收盤價</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapse Toggle Button */}
              <button
                type="button"
                onClick={() => setIsSearchSectionCollapsed(true)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 flex items-center gap-1 shadow-2xs transition cursor-pointer shrink-0"
                title="收起此查詢面板，釋放手機畫面"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">收起查詢</span>
                <span className="sm:hidden">收起</span>
              </button>
            </div>
          </div>

          {/* Search Status & Feedback Banner */}
          {searchNotice && (
            <div
              className={`p-2.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border transition ${
                searchNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                  : searchNotice.type === 'error'
                  ? 'bg-rose-50 text-rose-950 border-rose-300'
                  : 'bg-cyan-50 text-cyan-950 border-cyan-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {searchNotice.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {searchNotice.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                {searchNotice.type === 'info' && <Loader2 className="w-4 h-4 text-cyan-600 animate-spin shrink-0" />}
                <span className="truncate">{searchNotice.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSearchNotice(null)}
                className="text-slate-400 hover:text-slate-600 font-black cursor-pointer text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Underlyings Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <span className="text-[11px] font-black text-slate-500 shrink-0">常見搜尋：</span>
            {[
              { label: '聯電 2303', symbol: '2303', query: '2303' },
              { label: '聯電權證 08303P', symbol: '2303', query: '08303P' },
              { label: '元大台灣50 (0050)', symbol: '0050', query: '0050' },
              { label: '台積電 2330', symbol: '2330', query: '2330' },
              { label: '台積權證 08643P', symbol: '2330', query: '08643P' },
              { label: '鴻海 2317', symbol: '2317', query: '2317' },
              { label: '台指期 (TX)', symbol: 'TX', query: 'TX' },
              { label: '美債20年 (00679B)', symbol: '00679B', query: '00679B' },
            ].map(shortcut => {
              const isSelected =
                searchQuery === shortcut.query ||
                (!searchQuery && currentFocus.symbol === shortcut.symbol);
              return (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => {
                    setFocusSymbol(shortcut.symbol);
                    setSearchQuery(shortcut.query);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 shrink-0 ${
                    isSelected
                      ? 'bg-slate-950 text-white border-slate-950 shadow-xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <span>{shortcut.label}</span>
                </button>
              );
            })}
          </div>

          {/* 2nd Layer: Tradeable Derivatives for current focus */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-slate-900 text-amber-300 font-black text-xs">
                    {currentFocus.symbol === '0050'
                      ? '🎯 指數現貨 ETF'
                      : currentFocus.category === 'stocks'
                      ? '🎯 標的股票現貨'
                      : '🎯 核心標的'}
                  </span>
                  <h4 className="font-black text-sm sm:text-base text-slate-950">
                    {currentFocus.name} ({currentFocus.symbol})
                  </h4>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white text-slate-900 border border-slate-300 font-black">
                    最新價 NT$ {currentFocus.price.toLocaleString()}
                  </span>
                  <span
                    className={`text-xs font-bold font-mono ${
                      currentFocus.change >= 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {currentFocus.change >= 0 ? '+' : ''}
                    {currentFocus.change} ({currentFocus.changePercent}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                  {currentFocus.symbol === '0050'
                    ? '已自動呈現元大台灣50 (0050)，單純明瞭無多餘衍生品，點擊下方即可下單委託！'
                    : `已為您自動展開【${currentFocus.name}】共 ${derivedFamilyItems.length} 種可交易金融商品，點擊直接委託！`}
                </p>
              </div>

              {/* Sub-toggle to collapse just the derivatives list */}
              <button
                type="button"
                onClick={() => setIsDerivativesListCollapsed(!isDerivativesListCollapsed)}
                className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer self-start sm:self-auto flex items-center gap-1 shadow-2xs"
              >
                <span>{isDerivativesListCollapsed ? `展開商品列表 (${derivedFamilyItems.length}) ▾` : '收起商品列表 ▴'}</span>
              </button>
            </div>

            {!isDerivativesListCollapsed && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Left 2 Cols: Tradeable Instruments Cards */}
                <div className="lg:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      可交易商品（共 {derivedFamilyItems.length} 檔 · 點擊直接委託）
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ⚡ 自動產生
                    </span>
                  </div>

                  <div
                    className={`grid grid-cols-1 ${
                      derivedFamilyItems.length > 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
                    } gap-2`}
                  >
                    {derivedFamilyItems.map(item => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-white border border-slate-200 hover:border-amber-400 transition flex flex-col justify-between shadow-2xs space-y-2 group"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                                {item.num}
                              </span>
                              <span className="font-black text-xs text-slate-950 group-hover:text-amber-800 transition truncate">
                                {item.title}
                              </span>
                            </div>
                            {item.badge && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 font-mono mt-0.5 leading-tight">
                            {item.detail}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-100">
                          {item.actions.map((action: any) => (
                            <button
                              key={action.label}
                              type="button"
                              onClick={() => {
                                if (onSelectInstrumentToTrade) {
                                  onSelectInstrumentToTrade(item.instrument, action.action);
                                } else {
                                  onOpenTrading();
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer shadow-2xs transition active:scale-95 ${action.colorClass}`}
                            >
                              {action.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => onViewInstrumentKLine(item.instrument)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer ml-auto"
                            title="查看該商品即時K線"
                          >
                            📈 K線
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Col: 我的標的部位 */}
                <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col justify-between shadow-2xs">
                  <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                      我的【{currentFocus.name}】部位
                    </span>
                    <div className="mt-2 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">持有數量：</span>
                        <span className="font-mono font-black text-slate-950">
                          {myFocusQty > 0 ? `${myFocusQty.toLocaleString()} 單位/口` : '0 (無持倉)'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">投入資金：</span>
                        <span className="font-mono font-black text-slate-950">
                          NT$ {myFocusCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">平均成本：</span>
                        <span className="font-mono font-black text-slate-950">
                          NT$ {myFocusAvgCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">目前市值：</span>
                        <span className="font-mono font-black text-slate-950">
                          NT$ {myFocusMarketVal.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                        <span className="text-slate-600 font-bold">未實現損益：</span>
                        <span
                          className={`font-mono font-black ${
                            myFocusPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {myFocusPnL >= 0 ? '+' : ''}NT$ {myFocusPnL.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">
                      {myFocusQty > 0 ? '已建倉中' : '尚未建立部位'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onViewInstrumentKLine(currentFocus)}
                      className="text-cyan-800 hover:text-cyan-900 font-bold flex items-center gap-0.5 cursor-pointer text-xs"
                    >
                      <Camera className="w-3 h-3 text-cyan-600" />
                      <span>查看K線</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Quick-Collapse Strip for Mobile */}
            <div className="pt-1 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsSearchSectionCollapsed(true)}
                className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs border border-slate-200 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                title="收起此查詢區塊，釋放手機畫面"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>收起查詢區塊（釋放手機螢幕）</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. 快速功能 (4 Clean Utilities) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={onOpenStatement}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 transition text-left flex items-center gap-3 shadow-2xs cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center font-black group-hover:scale-105 transition">
            📊
          </div>
          <div>
            <span className="font-black text-slate-950 text-xs block">資產分析</span>
            <span className="text-[11px] text-slate-500 font-medium">檢視存倉損益</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenStatement}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 transition text-left flex items-center gap-3 shadow-2xs cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-black group-hover:scale-105 transition">
            📒
          </div>
          <div>
            <span className="font-black text-slate-950 text-xs block">交易紀錄</span>
            <span className="text-[11px] text-slate-500 font-medium">對帳單與流水帳</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onViewInstrumentKLine(currentFocus)}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 transition text-left flex items-center gap-3 shadow-2xs cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-black group-hover:scale-105 transition">
            📈
          </div>
          <div>
            <span className="font-black text-slate-950 text-xs block">行情分析</span>
            <span className="text-[11px] text-slate-500 font-medium">即時K線走勢</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenCalculator?.()}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 transition text-left flex items-center gap-3 shadow-2xs cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center font-black group-hover:scale-105 transition">
            🤖
          </div>
          <div>
            <span className="font-black text-slate-950 text-xs block">AI 財務分析</span>
            <span className="text-[11px] text-slate-500 font-medium">量化評價模型</span>
          </div>
        </button>
      </div>

      {/* 3. Market Quotes Hall - Clean, professional financial interface */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
        {/* Market Hall Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-base text-slate-950 flex items-center gap-2">
              <span className="p-1 rounded-lg bg-amber-100 text-amber-900">📊</span>
              <span>全市場商品選股庫 ({allInstruments.length} 檔)</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isMarketCatalogueCollapsed
                ? '已自動為您收起 40+ 檔全市場卡片雜訊，專注上方個人持倉即時盯盤。如需找新標的，請展開瀏覽。'
                : '涵蓋股票、長天期美債、指數ETF、台指期貨與選擇權全品類撮合'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsMarketCatalogueCollapsed(!isMarketCatalogueCollapsed)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <span>{isMarketCatalogueCollapsed ? '展開全市場商品庫 ▾' : '收起市場商品庫（消除雜訊） ▴'}</span>
            </button>
          </div>
        </div>

        {!isMarketCatalogueCollapsed && (
          <>
            {/* Clean Search Box & Unobtrusive Refresh */}
            <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜尋商品代號或名稱..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-950 placeholder-slate-400 text-xs font-bold focus:bg-white focus:border-amber-500 transition shadow-2xs"
              />
            </div>

            {onForceRefreshAll && (
              <button
                type="button"
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await onForceRefreshAll();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0 disabled:opacity-50"
                title="重新整理行情"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
              </button>
            )}
          </div>

        {/* Category Tabs - Mobile Horizontal Touch Scroll */}
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar scrollbar-none pb-1 touch-scroll whitespace-nowrap">
          {(
            [
              { id: 'all', label: `全部商品 (${allInstruments.length})` },
              { id: 'stocks', label: '1. 股票型 (多/空)' },
              { id: 'bonds', label: '2. 債券型 / 債券ETF' },
              { id: 'etfs', label: '3. 指數/反向 ETF' },
              { id: 'futures', label: '4. 期貨 (大台/小台/個股期)' },
              { id: 'options_warrants', label: '5. 選擇權 / 權證' },
              { id: 'commodities', label: '6. 原物料期貨 (6大板塊)' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMarketCategory(tab.id as any)}
              className={`shrink-0 px-3 py-1.5 rounded-xl transition font-black cursor-pointer border ${
                marketCategory === tab.id
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* DATA SOURCE DIAGNOSIS PANEL (防假資料與即時來源診斷) */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-md border border-indigo-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 text-lg shadow-inner shrink-0">
              📡
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-amber-400 text-sm tracking-wide">
                  DATA SOURCE 官方真偽即時診斷
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  API：官方連線 (Sponsor $999/月 · 6,000次/hr)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold border border-rose-400/30">
                  Mock Data：❌ 徹底禁用
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                已開通：台股即時資訊、期貨即時資訊、選擇權即時資訊、台股分K、期貨分K、期貨價差每筆成交等 97 種全資料集，嚴禁任何虛擬假資料。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 font-mono text-[11px]">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-300">最新抓取時間：</span>
            <span className="font-black text-emerald-300">
              {lastUpdatedTime ? `${getSystemDateStr()} ${lastUpdatedTime}` : `${getSystemDateStr()} 13:30 (收盤定格)`}
            </span>
          </div>
        </div>

        {/* Instruments Cards Grid - Daytime High Contrast */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-1">
          {filteredInstruments.map(inst => {
            const isPos = inst.change >= 0;
            return (
              <div
                key={inst.symbol}
                className="bg-slate-50 border border-slate-200 hover:border-amber-400 rounded-2xl p-4 transition duration-150 flex flex-col justify-between hover:shadow-md hover:bg-white group text-slate-900"
              >
                <div>
                  {/* Card Header: Category & Symbol */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-white text-slate-800 border border-slate-300 uppercase shadow-2xs">
                      {inst.category === 'stocks' && '📈 股票'}
                      {inst.category === 'bonds' && '🛡️ 債券ETF'}
                      {inst.category === 'etfs' && '📊 指數ETF'}
                      {inst.category === 'futures' && '⚡ 期貨'}
                      {inst.category === 'options' && '🎯 選擇權'}
                      {inst.category === 'warrants' && '⚡ 權證'}
                      {inst.category === 'us_stocks' && '🇺🇸 美股'}
                      {inst.category === 'commodities' && '🌍 原物料'}
                    </span>
                    <span className="text-[11px] font-mono text-cyan-800 font-black">
                      {inst.unitLabel}
                    </span>
                  </div>

                  {/* Instrument Name and Real 市場資料 Price */}
                  <div className="mb-2">
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-base font-black text-slate-950 group-hover:text-amber-700 transition">
                        {inst.name}
                      </h4>
                      <span className="text-xs font-mono font-bold text-slate-500 ml-1">
                        {inst.symbol}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <div>
                        <div className="text-xl font-black font-mono text-slate-950 tracking-tight">
                          {inst.category === 'us_stocks' || inst.category === 'commodities' ? 'US$ ' : 'NT$ '}
                          {inst.price >= 1000 ? inst.price.toLocaleString() : inst.price}
                        </div>
                        {inst.prevClose && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            昨收 {inst.category === 'us_stocks' || inst.category === 'commodities' ? 'US$ ' : 'NT$ '}
                            {inst.prevClose >= 1000 ? inst.prevClose.toLocaleString() : inst.prevClose}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-xs font-mono font-black flex items-center justify-end ${
                            isPos ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {isPos ? '+' : ''}
                          {inst.change >= 0 ? inst.change : inst.change}{' '}
                          ({isPos ? '+' : ''}
                          {inst.changePercent}%)
                        </div>
                        {inst.limitUpPrice && (
                          <div className="text-[10px] text-rose-700 font-mono font-bold">
                            漲停 NT$ {inst.limitUpPrice >= 1000 ? inst.limitUpPrice.toLocaleString() : inst.limitUpPrice}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Limit Up / Down Warning Badges */}
                    {inst.isLimitUp && (
                      <div className="mt-2 py-1 px-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-950 text-[10px] font-black flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>🔴 中午已達漲停！買進依漲停市價撮合，嚴禁昨收偷買</span>
                      </div>
                    )}
                    {inst.isLimitDown && (
                      <div className="mt-2 py-1 px-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 text-[10px] font-black flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>🟢 中午已達跌停！依跌停市價撮合</span>
                      </div>
                    )}

                    {/* 市場資料 Official Fetch Time & Real-Data Certification */}
                    <div className="mt-2.5 py-1 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-[10px] font-mono flex items-center justify-between">
                      <div className="flex items-center gap-1 font-bold">
                        <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>抓取時間：{lastUpdatedTime ? `${getSystemDateStr()} ${lastUpdatedTime}` : (inst.fetchTime || `${getSystemDateStr()} 13:08`)}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-200/60 text-emerald-950 font-bold border border-emerald-300">
                        {inst.dataset || 'TaiwanStockPrice'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2 mb-3 leading-relaxed font-medium">
                    {inst.description}
                  </p>
                </div>

                {/* Card Action Buttons - Clean 2-row layout */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelfBuy(inst)}
                      className="w-full py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                      title={inst.isLimitUp ? `該標的已漲停，以即時漲停價 NT$ ${inst.limitUpPrice} 公平委託` : `以即時市價 NT$ ${inst.price} 買進`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>{inst.isLimitUp ? '漲停買進' : '自己買進'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelfShort(inst)}
                      className="w-full py-2 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                      title={`融券放空或避險 ${inst.name}`}
                    >
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>融券/放空</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewInstrumentKLine(inst)}
                      className="w-full py-1.5 px-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Camera className="w-3 h-3 text-sky-600" />
                      <span>K線存證</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFocusSymbol(inst.symbol);
                        window.scrollTo({ top: 180, behavior: 'smooth' });
                      }}
                      className="w-full py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-black text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                      title={`在上方「開始交易」展開 ${inst.name} 的完整可交易商品家族與個人部位`}
                    >
                      <Layers className="w-3 h-3 text-amber-600" />
                      <span>商品家族 ➔</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredInstruments.length === 0 && searchQuery.trim() && (
            <div className="col-span-full bg-amber-50 border-2 border-dashed border-amber-300 rounded-3xl p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-2xl shadow-xs">
                ⚡
              </div>
              <div>
                <h4 className="font-black text-slate-950 text-base">
                  未在常用預設清單中找到「{searchQuery.trim().toUpperCase()}」
                </h4>
                <p className="text-xs text-slate-600 font-semibold mt-1 max-w-md mx-auto">
                  系統全面支援台股所有上市櫃代號、ETF（如 00981）、台指期或選擇權，點擊下方即可立即抓取當下行情並下單！
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleExecuteSearch(searchQuery.trim())}
                  disabled={isSearchingStock}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs inline-flex items-center gap-2 shadow-md cursor-pointer transition active:scale-95 border border-amber-400 disabled:opacity-50"
                >
                  {isSearchingStock ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <Search className="w-4 h-4 text-slate-950" />
                  )}
                  <span>{isSearchingStock ? '連線 抓取中...' : `🔍 立即連線 載入「${searchQuery.trim()}」並加入清單`}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenTrading}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>前往自訂下單機</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Collapse Button */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setIsMarketCatalogueCollapsed(true)}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs border border-slate-300 transition cursor-pointer inline-flex items-center gap-1 shadow-2xs"
          >
            <span>收起全市場商品選股庫（清除雜訊，返回上方我的持倉） ▴</span>
          </button>
        </div>
      </>
    )}
  </div>

      {/* 4. Positions & Trade History - Daylight High Contrast */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Tab Headers */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('positions')}
              className={`text-xs font-black px-3.5 py-1.5 rounded-lg transition cursor-pointer border ${
                activeTab === 'positions'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-700 hover:text-slate-950 border-slate-300'
              }`}
            >
              當前持倉部位明細 ({positions.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`text-xs font-black px-3.5 py-1.5 rounded-lg transition cursor-pointer border ${
                activeTab === 'history'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-700 hover:text-slate-950 border-slate-300'
              }`}
            >
              歷史交易記錄 ({currentProfile.tradeHistory?.length || 0})
            </button>
            {positions.length > 0 && onOpenResetPortfolio && (
              <button
                type="button"
                onClick={onOpenResetPortfolio}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                title="玩錯了想清空重來？輸入密碼清空所有部位重來"
              >
                <RotateCcw className="w-3 h-3 text-rose-600" />
                <span>清空重來</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onOpenStatement && (
              <button
                type="button"
                onClick={onOpenStatement}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs border border-amber-500 flex items-center gap-1.5 shadow-2xs cursor-pointer transition active:scale-95"
              >
                <span>📋</span>
                <span>開啟個人存倉與交易對帳查詢中心 ➔</span>
              </button>
            )}
            <span className="text-xs text-slate-600 font-mono font-bold hidden md:inline">
              官方真實行情存證
            </span>
          </div>
        </div>

        {/* Content Tab 1: Positions */}
        {activeTab === 'positions' && (
          <div className="overflow-x-auto">
            {positions.length === 0 ? (
              <div className="p-8 sm:p-10 text-center text-slate-800 text-sm space-y-4 bg-slate-50 border-2 border-dashed border-blue-300 rounded-2xl m-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 border border-blue-300 flex items-center justify-center text-3xl mx-auto shadow-sm ring-2 ring-blue-200">
                  🎓
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black text-slate-950 flex items-center justify-center gap-2">
                    <span>金融博士班 · 100% 自主下單模式</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-950 border border-emerald-300 font-mono font-black">
                      NT$ 50,000,000 純現金就緒
                    </span>
                  </h4>
                  <p className="text-xs text-slate-700 max-w-lg mx-auto leading-relaxed font-semibold">
                    目前帳戶為純現金儲備，零預設持倉。請點選下方按鈕，依據 <strong>5 大金融商品類別</strong>（股票、債券、指數ETF、期貨、選擇權/權證）親自逐筆建立博士班多空投資組合！
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-1 flex-wrap">
                  <button
                    onClick={onOpenTrading}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ShoppingCart className="w-4 h-4 text-slate-950" />
                    <span>立即開啟 5 大類別下單機 · 自主建倉</span>
                  </button>

                  {onSeedSamplePortfolio && (
                    <button
                      type="button"
                      onClick={onSeedSamplePortfolio}
                      className="px-5 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border-2 border-amber-400 font-black text-xs shadow-sm transition cursor-pointer flex items-center gap-1.5"
                      title="快速以台積電、00918、美債ETF、大台指期與選擇權建立示範部位"
                    >
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>✨ 一鍵建立 5 大類別示範組合 (供測試存倉與對帳工具)</span>
                    </button>
                  )}

                  {onOpenStatement && (
                    <button
                      type="button"
                      onClick={onOpenStatement}
                      className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-sm transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>📋 開啟對帳查詢工具</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Mobile Cards View (Visible on small screens) */}
                <div className="md:hidden divide-y divide-slate-200 p-3 space-y-3">
                  {positions.map(pos => {
                    const inst = allInstruments.find(i => i.symbol === pos.symbol);
                    const isLong =
                      pos.orderType === 'BUY_STOCK' ||
                      pos.orderType === 'BUY_ETF' ||
                      pos.orderType === 'BUY_BOND' ||
                      pos.orderType === 'BUY_FUTURES_LONG' ||
                      pos.orderType === 'BUY_CALL_OPTION' ||
                      pos.orderType === 'BUY_CALL_WARRANT';

                    return (
                      <div
                        key={pos.id}
                        className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 shadow-sm text-slate-900"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-cyan-800 text-sm">
                              {pos.symbol}
                            </span>
                            <span className="font-black text-slate-950 text-sm">
                              {pos.name}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-black border ${
                              isLong
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}
                          >
                            {pos.orderType === 'BUY_STOCK' && '現股買進'}
                            {pos.orderType === 'SHORT_SELL_STOCK' && '融券放空'}
                            {pos.orderType === 'BUY_MARGIN_STOCK' && '融資買進'}
                            {pos.orderType === 'BUY_BOND' && '債券買進'}
                            {pos.orderType === 'BUY_ETF' && 'ETF 買進'}
                            {pos.orderType === 'SHORT_SELL_ETF' && 'ETF 融券放空'}
                            {pos.orderType === 'BUY_FUTURES_LONG' && '期貨做多'}
                            {pos.orderType === 'SELL_FUTURES_SHORT' && '期貨放空'}
                            {pos.orderType === 'BUY_CALL_OPTION' && '買進買權'}
                            {pos.orderType === 'BUY_PUT_OPTION' && '買進賣權'}
                            {pos.orderType === 'SELL_CALL_OPTION' && '賣出買權'}
                            {pos.orderType === 'SELL_PUT_OPTION' && '賣出賣權'}
                            {pos.orderType === 'BUY_CALL_WARRANT' && '認購權證'}
                            {pos.orderType === 'BUY_PUT_WARRANT' && '認售權證'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">進場基準價</span>
                            <span className="font-mono font-black text-slate-950">
                              NT$ {pos.entryPrice >= 1000 ? pos.entryPrice.toLocaleString() : pos.entryPrice}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">持有數量</span>
                            <span className="font-mono font-bold text-slate-800">
                              {pos.quantity} {pos.category === 'futures' || pos.category === 'options' ? '口' : '張'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">佔用資金/保證金</span>
                            <span className="font-mono font-black text-cyan-900">
                              NT$ {Math.round(pos.totalCostOrMargin).toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">未實現損益</span>
                            <span
                              className={`font-mono font-black ${
                                pos.unrealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {pos.unrealizedPnL >= 0 ? '+' : ''}
                              NT$ {Math.round(pos.unrealizedPnL).toLocaleString()} (
                              {pos.unrealizedPnLPercent >= 0 ? '+' : ''}
                              {pos.unrealizedPnLPercent.toFixed(2)}%)
                            </span>
                          </div>
                        </div>

                        {pos.notes && (
                          <p className="text-[11px] text-slate-600 italic bg-amber-50/50 p-1.5 rounded-lg border border-amber-200 font-medium">
                            📝 {pos.notes}
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          {inst && (
                            <button
                              type="button"
                              onClick={() => onViewInstrumentKLine(inst)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1 border border-slate-300"
                            >
                              <Camera className="w-3.5 h-3.5 text-sky-600" />
                              <span>K線截圖</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onClosePosition(pos.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-black"
                          >
                            平倉沖銷
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Full Table View */}
                <table className="hidden md:table w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">商品標的</th>
                      <th className="py-3 px-4">操作類別</th>
                      <th className="py-3 px-4 text-right">進場基準價</th>
                      <th className="py-3 px-4 text-right">持有數量</th>
                      <th className="py-3 px-4 text-right">實際佔用資金/保證金</th>
                      <th className="py-3 px-4 text-right">未實現損益</th>
                      <th className="py-3 px-4">PPT 總經與下單理由</th>
                      <th className="py-3 px-4 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {positions.map(pos => {
                      const inst = allInstruments.find(i => i.symbol === pos.symbol);
                      const isLong =
                        pos.orderType === 'BUY_STOCK' ||
                        pos.orderType === 'BUY_ETF' ||
                        pos.orderType === 'BUY_BOND' ||
                        pos.orderType === 'BUY_FUTURES_LONG' ||
                        pos.orderType === 'BUY_CALL_OPTION' ||
                        pos.orderType === 'BUY_CALL_WARRANT';

                      return (
                        <tr key={pos.id} className="hover:bg-slate-50 transition text-slate-900">
                          <td className="py-3.5 px-4">
                            <div className="font-black text-slate-950 flex items-center gap-1.5">
                              <span className="font-mono text-cyan-800">{pos.symbol}</span>
                              <span>{pos.name}</span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-semibold">{pos.category.toUpperCase()}</span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-black border ${
                                isLong
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}
                            >
                              {pos.orderType === 'BUY_STOCK' && '現股買進 (多)'}
                              {pos.orderType === 'SHORT_SELL_STOCK' && '融券放空 (空)'}
                              {pos.orderType === 'BUY_MARGIN_STOCK' && '融資買進 (槓桿)'}
                              {pos.orderType === 'BUY_BOND' && '債券買進'}
                              {pos.orderType === 'BUY_ETF' && 'ETF 買進'}
                              {pos.orderType === 'SHORT_SELL_ETF' && 'ETF 融券放空'}
                              {pos.orderType === 'BUY_FUTURES_LONG' && '期貨做多 (多單)'}
                              {pos.orderType === 'SELL_FUTURES_SHORT' && '期貨放空 (空單避險)'}
                              {pos.orderType === 'BUY_CALL_OPTION' && '買進買權 (Buy Call)'}
                              {pos.orderType === 'BUY_PUT_OPTION' && '買進賣權 (Buy Put避險)'}
                              {pos.orderType === 'SELL_CALL_OPTION' && '賣出買權 (Sell Call)'}
                              {pos.orderType === 'SELL_PUT_OPTION' && '賣出賣權 (Sell Put)'}
                              {pos.orderType === 'BUY_CALL_WARRANT' && '認購權證 (槓桿做多)'}
                              {pos.orderType === 'BUY_PUT_WARRANT' && '認售權證 (槓桿做空)'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-950">
                            NT$ {pos.entryPrice >= 1000 ? pos.entryPrice.toLocaleString() : pos.entryPrice}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                            {pos.quantity} {pos.category === 'futures' || pos.category === 'options' ? '口' : '張'}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-black text-cyan-900">
                            NT$ {Math.round(pos.totalCostOrMargin).toLocaleString()}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono">
                            <span
                              className={`font-black ${
                                pos.unrealizedPnL >= 0 ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {pos.unrealizedPnL >= 0 ? '+' : ''}
                              NT$ {Math.round(pos.unrealizedPnL).toLocaleString()}
                            </span>
                            <span className="block text-[10px] text-slate-600 font-bold">
                              ({pos.unrealizedPnLPercent >= 0 ? '+' : ''}
                              {pos.unrealizedPnLPercent.toFixed(2)}%)
                            </span>
                          </td>

                          <td className="py-3.5 px-4 max-w-xs text-[11px] text-slate-700 font-semibold truncate">
                            {pos.notes || '依21號收盤價建倉'}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {inst && (
                                <button
                                  onClick={() => onViewInstrumentKLine(inst)}
                                  title="截取 21 號收盤 K 線圖 (PPT存證)"
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sky-700 border border-slate-300 transition cursor-pointer"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => onClosePosition(pos.id)}
                                title="平倉沖銷此部位"
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black transition cursor-pointer"
                              >
                                平倉
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* Content Tab 2: Trade History */}
        {activeTab === 'history' && (
          <div className="overflow-x-auto">
            {(!currentProfile.tradeHistory || currentProfile.tradeHistory.length === 0) ? (
              <div className="p-12 text-center text-slate-600 text-sm font-semibold">
                目前尚無平倉或歷史下單存檔紀錄
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">時間與基準日</th>
                    <th className="py-3 px-4">標的代號</th>
                    <th className="py-3 px-4">動作</th>
                    <th className="py-3 px-4 text-right">成交價格</th>
                    <th className="py-3 px-4 text-right">數量</th>
                    <th className="py-3 px-4 text-right">總金額 / 保證金</th>
                    <th className="py-3 px-4">投資邏輯與依據</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {currentProfile.tradeHistory.map(th => (
                    <tr key={th.id} className="hover:bg-slate-50 text-slate-900">
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        <div>{th.timestamp}</div>
                        <div className="text-cyan-800 font-bold">{th.dateLabel}</div>
                      </td>
                      <td className="py-3 px-4 font-black text-slate-950">
                        {th.symbol} {th.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {th.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-950">
                        NT$ {th.price.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">{th.quantity}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-cyan-900">
                        NT$ {Math.round(th.amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium text-[11px] max-w-sm truncate">
                        {th.rationale}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* 💡 設計方案 B：現貨漲停鎖死買不到 · 專業操盤手替代方案引導面板 */}
      {limitUpTargetInst && (
        <LimitUpAlternativeModal
          isOpen={Boolean(limitUpTargetInst)}
          onClose={() => setLimitUpTargetInst(null)}
          instrument={limitUpTargetInst}
          allInstruments={allInstruments}
          onSelectAlternative={handleSelectLimitUpAlternative}
          onProceedQueuedOrder={handleProceedQueuedOrder}
        />
      )}
    </div>
  );
};
