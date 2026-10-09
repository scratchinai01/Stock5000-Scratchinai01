import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Clock,
  ShieldCheck,
  Radio,
  ExternalLink,
  DollarSign,
  Layers,
  ChevronRight,
  ShoppingCart,
  Globe,
  Sparkles,
  Info,
} from 'lucide-react';
import { InstrumentSpec, OrderAction } from '../types/market';
import { getGlobalMarketStatusOverview } from '../utils/tradingClock';

export interface CryptoTicker {
  symbol: string;
  name: string;
  symbolShort: string;
  icon: string;
  price: number;
  prevPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  tradesCount: number;
  lastUpdated: number;
  priceFlash?: 'up' | 'down' | null;
  sectorType: 'volatile' | 'global_stable' | 'taiwan_stable';
  targetPeg?: string;
  roleNote: string;
  reserveAudit?: string;
  regulatoryJurisdiction?: string;
  fxRiskNote?: string;
}

export interface LiveTrade {
  id: string;
  symbol: string;
  price: number;
  qty: number;
  quoteQty: number;
  time: number;
  isBuyerMaker: boolean; // true = sell taker, false = buy taker
}

export interface CoinMetaConfig {
  symbol: string;
  name: string;
  short: string;
  icon: string;
  defaultPrice: number;
  sectorType: 'volatile' | 'global_stable' | 'taiwan_stable';
  targetPeg?: string;
  roleNote: string;
  marketText: string;
  typeText: string;
  reserveAudit: string;
  regulatoryJurisdiction: string;
  fxRiskNote: string;
}

const SUPPORTED_COINS: CoinMetaConfig[] = [
  // 🟠 BTC - 高波動主要加密資產
  {
    symbol: 'BTCUSDT',
    name: '比特幣 (Bitcoin)',
    short: 'BTC',
    icon: '₿',
    defaultPrice: 84850,
    sectorType: 'volatile',
    marketText: 'Crypto',
    typeText: '高波動主要加密資產',
    roleNote: '全球市值第一數位黃金 · 24/7 全天候永續交易 · 避險抗通膨',
    reserveAudit: '去中心化 PoW 工作量證明共識驗證',
    regulatoryJurisdiction: '全球去中心化網路 (美國 SEC 已核准現貨 ETF)',
    fxRiskNote: '以美元計價，承受高波動及 USD/TWD 匯率波動',
  },
  // 🔵 ETH - 高波動區塊鏈/智慧合約資產
  {
    symbol: 'ETHUSDT',
    name: '以太坊 (Ethereum)',
    short: 'ETH',
    icon: 'Ξ',
    defaultPrice: 2280,
    sectorType: 'volatile',
    marketText: 'Crypto',
    typeText: '智慧合約與公鏈資產',
    roleNote: '全球第二大加密資產 · 去中心化金融 (DeFi) 與 Web3 結算基石',
    reserveAudit: 'PoS 質押驗證與智慧合約開源程式碼查核',
    regulatoryJurisdiction: '全球去中心化網路 (美 SEC 現貨 ETF)',
    fxRiskNote: '高波動智慧合約生態幣，具台美匯率風險',
  },
  // 🟢 USDT - 全球加密美元穩定幣 (境外發行)
  {
    symbol: 'USDT',
    name: '泰達幣 (Tether USDT)',
    short: 'USDT',
    icon: '💵',
    defaultPrice: 1.0002,
    sectorType: 'global_stable',
    targetPeg: '≈ US$1',
    marketText: '全球加密美元穩定幣 (境外發行)',
    typeText: '全球美元穩定資產',
    roleNote: '全球最大規模交易對結算幣 · 目標價值 ≈ US$1 · 境外信託管理',
    reserveAudit: 'BDO 獨立會計師事務所定期出具儲備證明 (Attestation)',
    regulatoryJurisdiction: '境外開曼/百慕達/離岸信託 (非台灣金管會法規)',
    fxRiskNote: '⚠️ 具美元/台幣匯率波動風險！美元跌則換回台幣有匯損',
  },
  // 🟣 USDC - 全球加密合規美元穩定幣 (Circle 發行)
  {
    symbol: 'USDCUSDT',
    name: '數位美元 (USD Coin USDC)',
    short: 'USDC',
    icon: '🟣',
    defaultPrice: 0.9999,
    sectorType: 'global_stable',
    targetPeg: '≈ US$1',
    marketText: '全球加密合規美元穩定幣 (機構首選)',
    typeText: '合規美元穩定資產',
    roleNote: '100% 現金與短期美債儲備 · 美國監理合規 · 目標價值 ≈ US$1',
    reserveAudit: '德勤 (Deloitte) 每月獨立儲備確信報告 (月度公佈)',
    regulatoryJurisdiction: '美國紐約州金融服務署 (NYDFS) / 歐盟 MiCA 合規',
    fxRiskNote: '⚠️ 具美元/台幣匯率波動風險（受台幣升貶值影響）',
  },
  // 🇹🇼 TWDT - 台灣監理架構下的穩定幣 (新台幣穩定幣)
  {
    symbol: 'TWDT',
    name: '新台幣穩定幣 (TWDT · 台灣監理)',
    short: 'TWDT',
    icon: '🇹🇼',
    defaultPrice: 1.0000,
    sectorType: 'taiwan_stable',
    targetPeg: '≈ NT$1',
    marketText: '台灣監理架構穩定幣 (100% 銀行信託)',
    typeText: '台灣本土合規新台幣穩定資產',
    roleNote: '台灣金管會 (FSC) 監理架構 · 100% 台灣本土商業銀行法定存款信託隔離 · 零匯差',
    reserveAudit: '台灣四大會計師事務所定期查核 · 本土合規信託查驗',
    regulatoryJurisdiction: '中華民國金融監督管理委員會 (FSC) 虛擬資產管理專法與銀行法',
    fxRiskNote: '🛡️ 100% 零匯率風險！1 TWDT 永遠錨定新台幣 NT$ 1，免除任何台美匯差',
  },
  // 輔助生態代幣 (可選觀察)
  {
    symbol: 'SOLUSDT',
    name: '索拉納 (Solana)',
    short: 'SOL',
    icon: '🟡',
    defaultPrice: 135,
    sectorType: 'volatile',
    marketText: 'Crypto',
    typeText: '高效能高頻公鏈',
    roleNote: '高吞吐量底層公鏈 · Web3 高頻支付與生態資產',
    reserveAudit: 'PoH 歷史證明與 PoS 驗證節點',
    regulatoryJurisdiction: '全球開源去中心化網路',
    fxRiskNote: '高波動公鏈代幣，承受市場行情與匯率雙重波動',
  },
];

interface CryptoLiveBoardProps {
  allInstruments?: InstrumentSpec[];
  onSelectInstrumentToTrade?: (instrument: InstrumentSpec, initialAction?: OrderAction) => void;
  onOpenTrading?: () => void;
  onOpenGlobalRadar?: () => void;
}

export const CryptoLiveBoard: React.FC<CryptoLiveBoardProps> = ({
  allInstruments,
  onSelectInstrumentToTrade,
  onOpenTrading,
  onOpenGlobalRadar,
}) => {
  const [tickers, setTickers] = useState<Record<string, CryptoTicker>>({});
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'fallback'>('connecting');
  const [selectedCoin, setSelectedCoin] = useState<string>('BTCUSDT');
  const [displayCurrency, setDisplayCurrency] = useState<'USDT' | 'TWD'>('USDT');
  const [usdToTwdRate] = useState<number>(32.5);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState<number>(Date.now());
  const [tradeTapeSymbol, setTradeTapeSymbol] = useState<'ALL' | 'BTCUSDT' | 'ETHUSDT'>('ALL');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tickersRef = useRef<Record<string, CryptoTicker>>({});

  // 1-second system clock for Asia/Taipei precision display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Bootstrap with initial REST data so UI is instantly populated
  const fetchInitialRestData = async () => {
    try {
      const restSymbols = ['BTCUSDT', 'ETHUSDT', 'USDCUSDT', 'SOLUSDT'];
      const symbolsParam = JSON.stringify(restSymbols);
      let data: any[] | null = null;

      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (directErr) {
        // Fallback to server proxy route if direct browser fetch is blocked by ISP
        const proxyRes = await fetch('/api/crypto/binance-quotes');
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          if (json.data && Array.isArray(json.data)) {
            data = json.data;
          }
        }
      }

      const mapped: Record<string, CryptoTicker> = {};

      // Initialize defaults for all supported coins
      SUPPORTED_COINS.forEach(c => {
        const isStable = c.sectorType === 'global_stable' || c.sectorType === 'taiwan_stable';
        mapped[c.symbol] = {
          symbol: c.symbol,
          name: c.name,
          symbolShort: c.short,
          icon: c.icon,
          price: c.defaultPrice,
          prevPrice: c.defaultPrice,
          priceChange: isStable ? 0.0001 : c.defaultPrice * 0.015,
          priceChangePercent: isStable ? 0.01 : 1.5,
          highPrice: isStable ? (c.sectorType === 'taiwan_stable' ? 1.0001 : 1.0005) : c.defaultPrice * 1.025,
          lowPrice: isStable ? (c.sectorType === 'taiwan_stable' ? 0.9999 : 0.9995) : c.defaultPrice * 0.985,
          volume: isStable ? (c.sectorType === 'taiwan_stable' ? 1850000000 : 68500000000) : 35000,
          quoteVolume: isStable ? (c.sectorType === 'taiwan_stable' ? 1850000000 : 68500000000) : 35000 * c.defaultPrice,
          tradesCount: isStable ? 950000 : 420000,
          lastUpdated: Date.now(),
          priceFlash: null,
          sectorType: c.sectorType,
          targetPeg: c.targetPeg,
          roleNote: c.roleNote,
          reserveAudit: c.reserveAudit,
          regulatoryJurisdiction: c.regulatoryJurisdiction,
          fxRiskNote: c.fxRiskNote,
        };
      });

      // Update with real rest quotes if fetched
      if (data && Array.isArray(data)) {
        data.forEach(item => {
          const coinMeta = SUPPORTED_COINS.find(c => c.symbol === item.symbol);
          if (coinMeta) {
            const currentPrice = parseFloat(item.lastPrice) || coinMeta.defaultPrice;
            mapped[item.symbol] = {
              ...mapped[item.symbol],
              price: currentPrice,
              prevPrice: currentPrice,
              priceChange: parseFloat(item.priceChange) || 0,
              priceChangePercent: parseFloat(item.priceChangePercent) || 0,
              highPrice: parseFloat(item.highPrice) || currentPrice * 1.01,
              lowPrice: parseFloat(item.lowPrice) || currentPrice * 0.99,
              volume: parseFloat(item.volume) || 0,
              quoteVolume: parseFloat(item.quoteVolume) || 0,
              tradesCount: parseInt(item.count, 10) || 0,
              lastUpdated: Date.now(),
            };
          }
        });
      }

      setTickers(mapped);
      tickersRef.current = mapped;
    } catch (e) {
      console.warn('Initial REST crypto quote fetch fallback:', e);
    }
  };

  // Connect to Binance Public Market Data WebSocket (100% Free · No API Key / No Token Required)
  const connectBinanceWebSocket = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    setWsStatus('connecting');

    // Combined stream URL for 24h ticker updates + live aggregate trades
    const streams = [
      'btcusdt@ticker',
      'ethusdt@ticker',
      'usdcusdt@ticker',
      'solusdt@ticker',
      'btcusdt@aggTrade',
      'ethusdt@aggTrade',
    ].join('/');

    const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        setLastMessageTimestamp(Date.now());
      };

      ws.onmessage = (event) => {
        setLastMessageTimestamp(Date.now());
        try {
          const msg = JSON.parse(event.data);

          // Handle 24hr Ticker Stream
          if (msg.e === '24hrTicker') {
            const sym = msg.s;
            const currentPrice = parseFloat(msg.c);
            const prev = tickersRef.current[sym];
            const prevPrice = prev ? prev.price : currentPrice;
            const flash = currentPrice > prevPrice ? 'up' : currentPrice < prevPrice ? 'down' : null;

            const coinMeta = SUPPORTED_COINS.find(c => c.symbol === sym);
            if (coinMeta) {
              const updated: CryptoTicker = {
                symbol: sym,
                name: coinMeta.name,
                symbolShort: coinMeta.short,
                icon: coinMeta.icon,
                price: currentPrice,
                prevPrice,
                priceChange: parseFloat(msg.p),
                priceChangePercent: parseFloat(msg.P),
                highPrice: parseFloat(msg.h),
                lowPrice: parseFloat(msg.l),
                volume: parseFloat(msg.v),
                quoteVolume: parseFloat(msg.q),
                tradesCount: parseInt(msg.n, 10),
                lastUpdated: Date.now(),
                priceFlash: flash,
                sectorType: coinMeta.sectorType,
                targetPeg: coinMeta.targetPeg,
                roleNote: coinMeta.roleNote,
              };

              tickersRef.current = {
                ...tickersRef.current,
                [sym]: updated,
              };
              setTickers(prevMap => ({
                ...prevMap,
                [sym]: updated,
              }));
            }
          }

          // Handle Live Aggregate Trade Stream (Real-Time Trade Tape)
          if (msg.e === 'aggTrade') {
            const trade: LiveTrade = {
              id: `${msg.s}_${msg.a}`,
              symbol: msg.s,
              price: parseFloat(msg.p),
              qty: parseFloat(msg.q),
              quoteQty: parseFloat(msg.p) * parseFloat(msg.q),
              time: msg.T,
              isBuyerMaker: msg.m,
            };

            setLiveTrades(prevTrades => [trade, ...prevTrades.slice(0, 49)]);
          }
        } catch (parseErr) {
          console.warn('Binance WebSocket parse error:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('Binance WebSocket error, attempting auto-reconnect:', err);
        setWsStatus('reconnecting');
      };

      ws.onclose = () => {
        setWsStatus('reconnecting');
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectBinanceWebSocket();
        }, 3000);
      };
    } catch (wsErr) {
      console.warn('Failed to initialize Binance WebSocket, falling back to polling:', wsErr);
      setWsStatus('fallback');
    }
  };

  useEffect(() => {
    fetchInitialRestData();
    connectBinanceWebSocket();

    const pollInterval = setInterval(() => {
      fetchInitialRestData();
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const formatPrice = (p: number, sectorType?: 'volatile' | 'global_stable' | 'taiwan_stable') => {
    if (sectorType === 'taiwan_stable') {
      return `NT$ ${p.toFixed(4)}`;
    }
    if (displayCurrency === 'TWD') {
      const twd = p * usdToTwdRate;
      return `NT$ ${twd >= 1000 ? Math.round(twd).toLocaleString() : twd.toFixed(2)}`;
    }
    if (sectorType === 'global_stable' || p < 2) {
      return `$ ${p.toFixed(4)}`;
    }
    if (p >= 1000) {
      return `$ ${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$ ${p.toFixed(2)}`;
  };

  const activeTicker =
    tickers[selectedCoin] ||
    tickers['BTCUSDT'] || {
      symbol: 'BTCUSDT',
      name: '比特幣 (Bitcoin)',
      symbolShort: 'BTC',
      icon: '₿',
      price: 84850,
      prevPrice: 84850,
      priceChange: 0,
      priceChangePercent: 0,
      highPrice: 86500,
      lowPrice: 83900,
      volume: 35000,
      quoteVolume: 35000 * 84850,
      tradesCount: 420000,
      lastUpdated: Date.now(),
      sectorType: 'volatile',
      roleNote: '全球市值第一數位資產 · 24/7 永續行情',
      reserveAudit: '去中心化 PoW 工作量證明共識',
      regulatoryJurisdiction: '全球去中心化網路 (美 SEC 現貨 ETF)',
      fxRiskNote: '承受高波動與 USD/TWD 匯率波動',
    };

  const handleOpenTradeForCoin = (action: OrderAction) => {
    const sym = activeTicker.symbolShort;
    const isTwStable = activeTicker.sectorType === 'taiwan_stable' || sym === 'TWDT';
    const isGlobalStable = activeTicker.sectorType === 'global_stable' || sym === 'USDT' || sym === 'USDC';

    const targetInst: InstrumentSpec = {
      symbol: sym,
      name: isTwStable
        ? `${activeTicker.name} (台灣監理 · 100% 銀行信託)`
        : isGlobalStable
        ? `${activeTicker.name} (全球加密穩定幣 · 目標 ≈ US$1)`
        : `${activeTicker.name} (24/7 高波動資產)`,
      category: 'crypto',
      price: activeTicker.price,
      prevClose: activeTicker.prevPrice,
      change: activeTicker.priceChange,
      changePercent: activeTicker.priceChangePercent,
      volume: activeTicker.volume,
      unitLabel: isTwStable
        ? `${sym} (目標價值 ≈ NT$1 · 100% 銀行信託)`
        : isGlobalStable
        ? `${sym} (目標價值 ≈ US$1 · 全球境外發行)`
        : `枚 (1 ${sym} · 24/7)`,
      multiplier: 1,
      marginRequirement: 0,
      description: isTwStable
        ? `依台灣金管會 (FSC) 虛擬資產專法與銀行法架構設計，100% 台灣特許本土商業銀行存款信託隔離保證，免除台美匯差風險。`
        : isGlobalStable
        ? `全球美元穩定幣（目標價值 ≈ US$1），由境外發行，用於全球 Crypto 交易對清算結算與跨市場避險。`
        : `全球高波動主要加密資產，Binance 官方公開 WebSocket 24/7 即時撮合，平倉收益即時結算持續性累計入已平倉已實現損益。`,
      klineHistory: [],
    };

    if (onSelectInstrumentToTrade) {
      onSelectInstrumentToTrade(targetInst, action);
    } else if (onOpenTrading) {
      onOpenTrading();
    }
  };

  // Clock overview
  const clockOverview = getGlobalMarketStatusOverview(currentTime);

  const volatileCoins = SUPPORTED_COINS.filter(c => c.sectorType === 'volatile');
  const globalStableCoins = SUPPORTED_COINS.filter(c => c.sectorType === 'global_stable');
  const taiwanStableCoins = SUPPORTED_COINS.filter(c => c.sectorType === 'taiwan_stable');

  return (
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-4 sm:p-6 border-2 border-amber-500/40 shadow-2xl space-y-5 animate-in fade-in">
      {/* ─── SECTION 1: GLOBAL MARKET CLOCK & 24/7 ENGINE STATUS ─── */}
      <div className="bg-slate-900/90 rounded-2xl border border-white/10 p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-2xl shadow-inner">
              ⚡
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>24/7 Crypto 加密貨幣市場模組</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    24/7 全天候永續運作
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Binance 公開 Market Data WebSocket 直連 · </span>
                <span className="text-amber-300 font-bold">100% 免 API Token</span>
                <span className="text-slate-400">· 毫秒級即時成交跳動與高流動性撮合</span>
              </p>
            </div>
          </div>

          {/* Right Clock Box: 精準台北時間與市場開放狀態 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Clock Card */}
            <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-emerald-500/30 text-left">
              <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>🟢 市場開放 24/7 全天候交易</span>
              </div>
              <div className="text-xs font-mono font-black text-white mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>現在時間: {clockOverview.asiaTaipeiDate} {clockOverview.asiaTaipeiTime}</span>
                <span className="text-[9px] px-1 bg-slate-800 text-slate-400 rounded">Asia/Taipei</span>
              </div>
            </div>

            {/* Currency Switcher */}
            <div className="bg-slate-800/90 p-1 rounded-xl border border-white/10 flex text-xs font-black">
              <button
                type="button"
                onClick={() => setDisplayCurrency('USDT')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  displayCurrency === 'USDT' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                USDT (美元)
              </button>
              <button
                type="button"
                onClick={() => setDisplayCurrency('TWD')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  displayCurrency === 'TWD' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                NT$ (台幣 1:32.5)
              </button>
            </div>

            {onOpenGlobalRadar && (
              <button
                type="button"
                onClick={onOpenGlobalRadar}
                className="px-3 py-1.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-400/40 text-xs font-black transition cursor-pointer flex items-center gap-1 shadow-xs"
                title="打開完整全球市場時鐘雷達與跨市場時間旅行"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>全球時鐘雷達</span>
              </button>
            )}
          </div>
        </div>

        {/* ① 交易時鐘：讓學生一眼知道全球市場交易狀態 */}
        <div className="bg-slate-950/70 p-3 rounded-xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-black text-slate-200 flex items-center gap-1.5">
              <span>🌐 全球市場交易狀態 (Global Market Status)</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                市場開放 ≠ 你的 API 一定有資料
              </span>
            </span>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">WebSocket 串流:</span>
              <span className={`font-bold flex items-center gap-1 ${
                wsStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                {wsStatus === 'connected' ? '實時串流中' : wsStatus === 'connecting' ? '連線中...' : '備援輪詢'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
            {clockOverview.markets.slice(0, 8).map(m => (
              <div
                key={m.id}
                className={`p-2 rounded-xl border flex flex-col justify-between ${
                  m.isOpen
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-slate-900/60 border-white/5 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px]">{m.icon} {m.name.split(' ')[0]}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-slate-400">{m.symbol.split(' ')[0]}</span>
                  <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded ${
                    m.isOpen
                      ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}>
                    {m.statusBadge === 'OPEN_24_7' ? '🟢 OPEN 24/7' : m.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: 7 大市場架構與三大 CRYPTO 資產分類 (高波動 vs 全球穩定幣 vs 台灣監理穩定幣) ─── */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white flex items-center gap-1.5">
              <span>🪙 核心加密市場三大板塊配置</span>
              <span className="text-xs text-amber-300 font-bold">（高波動資產 ＆ 全球穩定幣 ＆ 台灣監理穩定幣）</span>
            </span>
          </div>
          <span className="text-xs text-slate-400">點選標的卡片切換即時盤口與專屬下單匣</span>
        </div>

        {/* 3 Column Grid: Volatile vs Global Stablecoins vs Taiwan Regulated Stablecoins */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Group 1: 🚀 高波動資產 (BTC & ETH) */}
          <div className="bg-slate-900/80 rounded-2xl border border-amber-500/30 p-3.5 space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                <span className="font-black text-xs text-amber-300 flex items-center gap-1.5">
                  <span>🚀 高波動主要資產</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                    24/7 · 資本利得
                  </span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">BTC / ETH</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                全球主要加密市值資產，無漲跌停限制，支援 0.01 單位起雙向多空委託。
              </p>
            </div>

            <div className="space-y-2">
              {volatileCoins.slice(0, 2).map(coin => {
                const t = tickers[coin.symbol];
                const isSelected = selectedCoin === coin.symbol;
                const isUp = t ? t.priceChangePercent >= 0 : true;

                return (
                  <div
                    key={coin.symbol}
                    onClick={() => setSelectedCoin(coin.symbol)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between select-none active:scale-[0.98] ${
                      isSelected
                        ? 'bg-slate-850 border-amber-400 shadow-md ring-2 ring-amber-400/30'
                        : 'bg-slate-950/60 hover:bg-slate-900 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/40 flex items-center justify-center font-black text-xs">
                          {coin.icon}
                        </span>
                        <div>
                          <span className="font-black text-white text-xs block leading-tight">{coin.short}</span>
                          <span className="text-[9px] text-slate-400 font-mono">{coin.symbol}</span>
                        </div>
                      </div>
                      <div className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md ${
                        isUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {isUp ? '+' : ''}{t ? t.priceChangePercent.toFixed(2) : '1.50'}%
                      </div>
                    </div>

                    <div className="text-sm font-black font-mono text-white mt-0.5">
                      {t ? formatPrice(t.price, coin.sectorType) : `$ ${coin.defaultPrice.toLocaleString()}`}
                    </div>

                    <div className="text-[9px] text-slate-400 font-mono mt-1 flex justify-between">
                      <span>24H高: {t ? formatPrice(t.highPrice, coin.sectorType) : '-'}</span>
                      <span>24H低: {t ? formatPrice(t.lowPrice, coin.sectorType) : '-'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 2: 🌐 全球加密美元穩定幣 (USDT & USDC · 目標 ≈ US$1 · 境外發行) */}
          <div className="bg-slate-900/80 rounded-2xl border border-cyan-500/30 p-3.5 space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                <span className="font-black text-xs text-cyan-300 flex items-center gap-1.5">
                  <span>🌐 全球加密美元穩定幣</span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-bold">
                    目標 ≈ US$1
                  </span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">境外發行</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                全球規模最大交易對清算幣，境外獨立審計，具<strong>美元/台幣匯率波動</strong>特性。
              </p>
            </div>

            <div className="space-y-2">
              {globalStableCoins.map(coin => {
                const t = tickers[coin.symbol];
                const isSelected = selectedCoin === coin.symbol;

                return (
                  <div
                    key={coin.symbol}
                    onClick={() => setSelectedCoin(coin.symbol)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between select-none active:scale-[0.98] ${
                      isSelected
                        ? 'bg-slate-850 border-cyan-400 shadow-md ring-2 ring-cyan-400/30'
                        : 'bg-slate-950/60 hover:bg-slate-900 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-400/40 flex items-center justify-center font-black text-xs">
                          {coin.icon}
                        </span>
                        <div>
                          <span className="font-black text-white text-xs block leading-tight">{coin.short}</span>
                          <span className="text-[9px] text-cyan-400 font-mono font-bold">目標 ≈ US$1</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                        境外審計
                      </span>
                    </div>

                    <div className="text-sm font-black font-mono text-white mt-0.5 flex items-baseline gap-1">
                      <span>{t ? formatPrice(t.price, coin.sectorType) : '$ 1.0000'}</span>
                      <span className="text-[9px] text-slate-400 font-mono">(≈ US$1)</span>
                    </div>

                    <div className="text-[9px] text-slate-400 font-mono mt-1 flex justify-between">
                      <span>清算結算 / 跨鏈流動</span>
                      <span className="text-cyan-400">24/7 永續</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 3: 🏛️ 台灣監理架構下的穩定幣 (TWDT · 目標 ≈ NT$1 · 100% 銀行信託) */}
          <div className="bg-slate-900/80 rounded-2xl border border-emerald-500/40 p-3.5 space-y-2.5 flex flex-col justify-between ring-1 ring-emerald-500/20">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                <span className="font-black text-xs text-emerald-300 flex items-center gap-1.5">
                  <span>🏛️ 台灣監理架構穩定幣</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-bold">
                    目標 ≈ NT$1
                  </span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400">100% 銀行信託</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 mb-2 leading-relaxed">
                台灣金管會 (FSC) 監理架構，本土商業銀行<strong>100% 法定信託隔離</strong>，<strong>零匯差風險</strong>。
              </p>
            </div>

            <div className="space-y-2">
              {taiwanStableCoins.map(coin => {
                const t = tickers[coin.symbol];
                const isSelected = selectedCoin === coin.symbol;

                return (
                  <div
                    key={coin.symbol}
                    onClick={() => setSelectedCoin(coin.symbol)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between select-none active:scale-[0.98] ${
                      isSelected
                        ? 'bg-slate-850 border-emerald-400 shadow-md ring-2 ring-emerald-400/40'
                        : 'bg-slate-950/60 hover:bg-slate-900 border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 flex items-center justify-center font-black text-xs">
                          {coin.icon}
                        </span>
                        <div>
                          <span className="font-black text-white text-xs block leading-tight">{coin.name}</span>
                          <span className="text-[9px] text-emerald-400 font-mono font-bold">目標 ≈ NT$1 (零匯差)</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        金管會監理
                      </span>
                    </div>

                    <div className="text-sm font-black font-mono text-emerald-300 mt-0.5 flex items-baseline gap-1">
                      <span>NT$ 1.0000</span>
                      <span className="text-[9px] text-emerald-400/80 font-mono">(1:1 本幣零匯差)</span>
                    </div>

                    <div className="text-[9px] text-slate-300 font-mono mt-1 flex justify-between">
                      <span>本土銀行 100% 信託專戶</span>
                      <span className="text-emerald-400 font-bold">本幣安全停泊</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ⚖️ 金融教育專題：【全球加密穩定幣】 vs 【台灣監理架構下的穩定幣】核心對決 */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-cyan-500/40 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">
                ⚖️
              </span>
              <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                <span>金融監理專題：為什麼不能單純把 Stablecoin 當作「不會跌的幣」？</span>
              </h4>
            </div>
            <span className="text-[11px] text-cyan-300 font-mono font-bold">
              「全球加密穩定幣」 vs 「台灣監理架構下的穩定幣」深度對比
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* 1. 錨定貨幣與匯差 */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-white/10 space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                1. 錨定幣別與匯率風險
              </span>
              <div className="text-[11px] text-slate-200 leading-relaxed">
                <p className="text-cyan-300 font-bold">🌐 全球 (USDT/USDC)：</p>
                <p className="text-slate-300">錨定美元 (USD)。當台幣升值時，換回台幣會產生實質匯損，並非「台幣資產不跌」！</p>
                <p className="text-emerald-400 font-bold mt-1">🏛️ 台灣 (TWDT)：</p>
                <p className="text-slate-300">錨定新台幣 (TWD)。1 TWDT 永遠對應 NT$ 1，投資人享有 100% 本幣零匯率風險。</p>
              </div>
            </div>

            {/* 2. 準備金與信託隔離 */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-white/10 space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                2. 準備金隔離與信託保障
              </span>
              <div className="text-[11px] text-slate-200 leading-relaxed">
                <p className="text-cyan-300 font-bold">🌐 全球 (USDT/USDC)：</p>
                <p className="text-slate-300">由境外實體保管短期公債或存款，出具會計師 Attestation 報告，非台灣信託法保障。</p>
                <p className="text-emerald-400 font-bold mt-1">🏛️ 台灣 (TWDT)：</p>
                <p className="text-slate-300"><strong>100% 存入台灣本土特許商業銀行法定信託專戶</strong>，發行商破產亦受信託獨立財產保護！</p>
              </div>
            </div>

            {/* 3. 監理架構與法律權威 */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-white/10 space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                3. 法律監理與管轄權責
              </span>
              <div className="text-[11px] text-slate-200 leading-relaxed">
                <p className="text-cyan-300 font-bold">🌐 全球 (USDT/USDC)：</p>
                <p className="text-slate-300">離岸境外法規（百慕達、英屬維京、美紐約 NYDFS），面臨跨國監理爭端與合規凍結。</p>
                <p className="text-emerald-400 font-bold mt-1">🏛️ 台灣 (TWDT)：</p>
                <p className="text-slate-300">遵循<strong>台灣金管會 (FSC) 虛擬資產專法、洗錢防制法及銀行法</strong>，落實實名制 KYC/AML。</p>
              </div>
            </div>

            {/* 4. 脫錨風險與黑天鵝警示 */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-white/10 space-y-1.5">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                4. 歷史脫錨教訓與抗風險力
              </span>
              <div className="text-[11px] text-slate-200 leading-relaxed">
                <p className="text-amber-300 font-bold">⚠️ 脫錨黑天鵝警示：</p>
                <p className="text-slate-300">2022 年 Terra UST 演算法歸零崩盤、2023 年矽谷銀行破產導致 USDC 短暫跌至 $0.87。</p>
                <p className="text-emerald-300 font-bold mt-1">💡 實戰心得：</p>
                <p className="text-slate-300">穩定幣的價值取決於<strong>背後儲備資產的變現力與信託隔離強度</strong>，絕非憑空保值！</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 3: SPOTLIGHT DEEP DIVE & DEDICATED CRYPTO ORDER SYSTEM ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Spotlight Deep Dive & Order Form (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 rounded-2xl border border-white/10 p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-indigo-500/30 border border-amber-400/40 flex items-center justify-center text-2xl shadow-inner">
                {activeTicker.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-white">{activeTicker.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold ${
                    activeTicker.sectorType === 'taiwan_stable'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : activeTicker.sectorType === 'global_stable'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {activeTicker.symbolShort}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {activeTicker.roleNote}
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black font-mono tracking-tight text-white">
                {formatPrice(activeTicker.price, activeTicker.sectorType)}
              </div>
              <div className={`text-xs font-mono font-bold flex items-center justify-end gap-1 ${
                activeTicker.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {activeTicker.priceChangePercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>
                  {activeTicker.priceChangePercent >= 0 ? '+' : ''}
                  {activeTicker.priceChangePercent.toFixed(2)}% (
                  {activeTicker.priceChange >= 0 ? '+' : ''}
                  {activeTicker.priceChange.toFixed(activeTicker.sectorType === 'volatile' ? 2 : 4)}{' '}
                  {activeTicker.sectorType === 'taiwan_stable' ? 'TWD' : 'USDT'})
                </span>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block font-semibold">
                {activeTicker.sectorType === 'taiwan_stable' ? '目標錨定' : activeTicker.sectorType === 'global_stable' ? '目標價值' : '24小時最高'}
              </span>
              <span className="text-xs font-mono font-black text-white">
                {activeTicker.sectorType === 'taiwan_stable' ? '目標 ≈ NT$1' : activeTicker.sectorType === 'global_stable' ? '目標 ≈ US$1' : formatPrice(activeTicker.highPrice, activeTicker.sectorType)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block font-semibold">
                {activeTicker.sectorType === 'taiwan_stable' ? '信託隔離' : activeTicker.sectorType === 'global_stable' ? '發行管轄' : '24小時最低'}
              </span>
              <span className="text-xs font-mono font-black text-white">
                {activeTicker.sectorType === 'taiwan_stable' ? '100% 本土銀行' : activeTicker.sectorType === 'global_stable' ? '境外發行' : formatPrice(activeTicker.lowPrice, activeTicker.sectorType)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block font-semibold">24小時成交額</span>
              <span className="text-xs font-mono font-black text-amber-300">
                ${(activeTicker.quoteVolume / 1000000).toFixed(1)}M
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block font-semibold">24小時筆數</span>
              <span className="text-xs font-mono font-black text-cyan-300">
                {activeTicker.tradesCount.toLocaleString()} 筆
              </span>
            </div>
          </div>

          {/* ⑤ 專屬分開下單系統：BTC/ETH vs USDT/USDC vs TWDT */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-amber-400/40 space-y-3 shadow-md">
            <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-amber-400" />
                <span>
                  {activeTicker.sectorType === 'taiwan_stable'
                    ? `🇹🇼 台灣監理新台幣穩定幣下單匣【${activeTicker.symbolShort}】`
                    : activeTicker.sectorType === 'global_stable'
                    ? `💵 全球加密美元穩定幣停泊匣【${activeTicker.symbolShort}】`
                    : `🟠 24/7 高波動資產下單匣【${activeTicker.symbolShort}/USDT】`}
                </span>
              </span>
              <span className="text-[11px] text-slate-300 font-mono">
                即時市價: <strong className="text-white">{formatPrice(activeTicker.price, activeTicker.sectorType)}</strong>
              </span>
            </div>

            {activeTicker.sectorType === 'taiwan_stable' ? (
              /* 🇹🇼 台灣監理新台幣穩定幣專屬下單介面 */
              <div className="space-y-3 text-xs">
                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2.5 flex items-start gap-2">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-slate-300 leading-relaxed text-[11px]">
                    <strong className="text-emerald-300">台灣監理穩定幣特點：</strong>
                    目標價值 ≈ NT$1。由<strong>台灣金管會監理沙盒／虛擬資產專法</strong>規範，台灣本土商業銀行 <strong>100% 法定存款信託隔離</strong>保管。本幣計價享<strong>零匯差風險</strong>，為大富翁玩家最穩健的資金避風港。
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleOpenTradeForCoin('BUY_TW_STABLECOIN')}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <span>🇹🇼</span>
                    <span>申購新台幣穩定幣 (Park in TWDT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTradeForCoin('SELL_TW_STABLECOIN')}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <span>🔄</span>
                    <span>贖回新台幣現金 (1:1 零匯差)</span>
                  </button>
                </div>
              </div>
            ) : activeTicker.sectorType === 'global_stable' ? (
              /* 💵 USDT / USDC 全球美元穩定幣專屬下單介面 */
              <div className="space-y-3 text-xs">
                <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-2.5 flex items-start gap-2">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-slate-300 leading-relaxed text-[11px]">
                    <strong className="text-cyan-300">全球美元穩定幣說明：</strong>
                    目標價值 ≈ US$1。境外發行並出具月度儲備審計證明，主要用於<strong>全球 Crypto 交易對清算</strong>與<strong>美元資金停泊</strong>（具 USD/TWD 匯率波動特性）。
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleOpenTradeForCoin('BUY_STABLECOIN')}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <span>💵</span>
                    <span>買進全球美元穩定幣 (Park in {activeTicker.symbolShort})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTradeForCoin('SELL_STABLECOIN')}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <span>🔄</span>
                    <span>結算贖回換回台幣 (Redeem to TWD)</span>
                  </button>
                </div>
              </div>
            ) : (
              /* 🚀 BTC / ETH 高波動資產專屬下單介面 */
              <div className="space-y-3 text-xs">
                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-slate-300 leading-relaxed text-[11px]">
                    <strong className="text-amber-300">高波動資產特性：</strong>
                    24/7 全天候撮合，無每日 10% 漲跌停限制。支援<strong>小數數量下單</strong>（例如 0.01 BTC、0.1 BTC），可即時做多買進或融券賣出避險。
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleOpenTradeForCoin('BUY_CRYPTO')}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <span>🚀</span>
                    <span>買進做多 {activeTicker.symbolShort} (Buy Long)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTradeForCoin('SHORT_SELL_CRYPTO')}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <span>📉</span>
                    <span>融券放空 {activeTicker.symbolShort} (Sell Short)</span>
                  </button>
                </div>
              </div>
            )}

            {/* ⑥ 比特幣平倉已實現損益機制說明 */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 text-[11px] text-amber-200/95 flex items-start gap-2">
              <span className="text-base">💰</span>
              <div className="leading-relaxed">
                <strong>比特幣收益平倉已實現損益機制：</strong>
                平倉賣出後，獲利將全數即時回收至可用現金，並『持續性累計入歷史對帳單與首頁已平倉已實現損益』，永續結算！
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Aggregate Trades Tape (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 rounded-2xl border border-white/10 p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
              <h4 className="text-xs font-black text-white tracking-wider uppercase">即時撮合流水 (Live Trades Tape)</h4>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
              <button
                type="button"
                onClick={() => setTradeTapeSymbol('ALL')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  tradeTapeSymbol === 'ALL' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setTradeTapeSymbol('BTCUSDT')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  tradeTapeSymbol === 'BTCUSDT' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                BTC
              </button>
              <button
                type="button"
                onClick={() => setTradeTapeSymbol('ETHUSDT')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  tradeTapeSymbol === 'ETHUSDT' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                ETH
              </button>
            </div>
          </div>

          {/* Tape Stream Window */}
          <div className="h-80 overflow-y-auto space-y-1.5 font-mono text-xs pr-1 scrollbar-thin">
            <div className="grid grid-cols-12 text-[10px] text-slate-400 pb-1 border-b border-white/5">
              <span className="col-span-3">標的/方向</span>
              <span className="col-span-4 text-right">成交價 (USDT)</span>
              <span className="col-span-3 text-right">數量</span>
              <span className="col-span-2 text-right">時間</span>
            </div>

            {liveTrades
              .filter(t => tradeTapeSymbol === 'ALL' || t.symbol === tradeTapeSymbol)
              .map(t => {
                const isSell = t.isBuyerMaker; // true = taker was seller (sell trade)
                const tradeTime = new Date(t.time).toLocaleTimeString('zh-TW', { hour12: false });
                const coinShort = t.symbol.replace('USDT', '');

                return (
                  <div
                    key={t.id}
                    className="grid grid-cols-12 items-center py-1 px-1.5 rounded hover:bg-white/5 transition duration-75 text-[11px]"
                  >
                    <div className="col-span-3 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${isSell ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                      <span className="font-bold text-white">{coinShort}</span>
                      <span className={`text-[9px] font-bold ${isSell ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isSell ? '賣出' : '買進'}
                      </span>
                    </div>

                    <div className={`col-span-4 text-right font-black ${isSell ? 'text-rose-400' : 'text-emerald-400'}`}>
                      ${t.price >= 1000 ? t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : t.price.toFixed(4)}
                    </div>

                    <div className="col-span-3 text-right text-slate-300">
                      {t.qty >= 1 ? t.qty.toFixed(3) : t.qty.toFixed(4)}
                    </div>

                    <div className="col-span-2 text-right text-[10px] text-slate-500">
                      {tradeTime}
                    </div>
                  </div>
                );
              })}

            {liveTrades.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-12">
                <RefreshCw className="w-5 h-5 animate-spin mb-2 text-amber-400" />
                <span>等待 Binance 公開 WebSocket 即時撮合流水跳動...</span>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-400 border-t border-white/5 pt-2 flex items-center justify-between">
            <span>官方公開行情無延遲直連</span>
            <span className="text-emerald-400 font-mono">24/7 全天候撮合</span>
          </div>
        </div>
      </div>
    </div>
  );
};
