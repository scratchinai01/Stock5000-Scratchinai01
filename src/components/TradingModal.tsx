import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  InstrumentSpec,
  OrderAction,
  AssetCategory,
  StudentProfile,
} from '../types/market';
import { KLineChart } from './KLineChart';
import { computeOrderCost } from '../utils/orderMath';
import { LimitUpAlternativeModal } from './LimitUpAlternativeModal';
import { SmartInstrumentSearchBoard } from './SmartInstrumentSearchBoard';
import { CommoditiesBoard } from './CommoditiesBoard';
import { StockQMarketBoard } from './StockQMarketBoard';
import { TradingBottomTools } from './TradingBottomTools';
import { getSystemDateStr } from '../utils/dateUtils';
import rawQuotes from '../data/realFinmindQuotes.json';

const quotesMap = rawQuotes as Record<string, any>;
import {
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Info,
  Check,
  ArrowRight,
  Calculator,
  ChevronLeft,
  ArrowLeft,
  Layers,
  Percent,
  Compass,
  Zap,
  ShieldCheck,
  Flame,
  Search,
  Plus,
  Sliders,
  X,
  FileText,
  CheckCircle2,
  Loader2,
  Tag,
  AlertTriangle,
  Minus,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Bot,
  Globe,
  LayoutDashboard,
  BookOpen,
  Briefcase,
  BarChart3,
  ShoppingCart,
} from 'lucide-react';

export type MainCategoryTab =
  | 'stocks'
  | 'bonds'
  | 'etfs'
  | 'futures'
  | 'options_warrants'
  | 'us_stocks'
  | 'commodities'
  | 'crypto';

interface CategoryConfig {
  id: MainCategoryTab;
  number: string;
  name: string;
  subTitle: string;
  badge: string;
  iconEmoji: string;
  description: string;
  colorScheme: {
    border: string;
    bgGradient: string;
    accentText: string;
    tagBg: string;
    hoverBorder: string;
  };
  sampleSymbols: string[];
}

interface CustomSuggestion {
  symbol: string;
  name: string;
  price: number;
  category: AssetCategory;
  multiplier: number;
  unitLabel: string;
  margin?: number;
  strikePrice?: number;
}

const CATEGORY_CUSTOM_SUGGESTIONS: Record<MainCategoryTab, CustomSuggestion[]> = {
  stocks: [
    { symbol: '2382', name: '廣達', price: quotesMap['2382']?.close21 || 334, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '3231', name: '緯創', price: quotesMap['3231']?.close21 || 190.5, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '3008', name: '大立光', price: quotesMap['3008']?.close21 || 6205, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '2376', name: '技嘉', price: quotesMap['2376']?.close21 || 368.5, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '3017', name: '奇鋐', price: quotesMap['3017']?.close21 || 3510, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '2882', name: '國泰金', price: quotesMap['2882']?.close21 || 110.5, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '2303', name: '聯電', price: quotesMap['2303']?.close21 || 161.5, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '2609', name: '陽明', price: quotesMap['2609']?.close21 || 58.8, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
    { symbol: '2634', name: '漢翔', price: quotesMap['2634']?.close21 || 64.4, category: 'stocks', multiplier: 1000, unitLabel: '張 (1,000股)' },
  ],
  crypto: [
    { symbol: 'BTC', name: '比特幣 (BTC/USDT)', price: 84850, category: 'crypto', multiplier: 1, unitLabel: '枚 (1 BTC · 24/7)' },
    { symbol: 'ETH', name: '以太坊 (ETH/USDT)', price: 2280, category: 'crypto', multiplier: 1, unitLabel: '枚 (1 ETH · 24/7)' },
    { symbol: 'USDT', name: '泰達幣 (Tether USDT)', price: 1.0002, category: 'crypto', multiplier: 1, unitLabel: 'USDT (目標價值 ≈ US$1)' },
    { symbol: 'USDC', name: '數位美元 (USD Coin)', price: 0.9999, category: 'crypto', multiplier: 1, unitLabel: 'USDC (目標價值 ≈ US$1)' },
  ],
  bonds: [
    { symbol: '00679B', name: '元大美債20年', price: quotesMap['00679B']?.close21 || 24.64, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00687B', name: '國泰20年美債', price: quotesMap['00687B']?.close21 || 25.6, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00720B', name: '元大投資級公司債', price: quotesMap['00720B']?.close21 || 30.76, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00772B', name: '中信高評級公司債', price: quotesMap['00772B']?.close21 || 31.11, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00937B', name: '群益ESG投等債20+', price: quotesMap['00937B']?.close21 || 13.74, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00933B', name: '國泰10Y+金融債', price: quotesMap['00933B']?.close21 || 14.95, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00751B', name: '元大AAA至A公司債', price: quotesMap['00751B']?.close21 || 28.82, category: 'bonds', multiplier: 1000, unitLabel: '張 (1,000單位)' },
  ],
  etfs: [
    { symbol: '0050', name: '元大台灣50', price: quotesMap['0050']?.close21 || 112.9, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '0056', name: '元大高股息', price: quotesMap['0056']?.close21 || 56.85, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00878', name: '國泰永續高股息', price: quotesMap['00878']?.close21 || 34.89, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00919', name: '群益台灣精選高息', price: quotesMap['00919']?.close21 || 31.63, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00929', name: '復華台灣科技優息', price: quotesMap['00929']?.close21 || 29.59, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00940', name: '元大台灣價值高息', price: quotesMap['00940']?.close21 || 13.18, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00981A', name: '主動統一台股增長', price: quotesMap['00981A']?.close21 || 31, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '00713', name: '元大台灣高息低波', price: quotesMap['00713']?.close21 || 62.85, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '006208', name: '富邦台50', price: quotesMap['006208']?.close21 || 258.25, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
    { symbol: '0052', name: '富邦科技', price: quotesMap['0052']?.close21 || 66, category: 'etfs', multiplier: 1000, unitLabel: '張 (1,000單位)' },
  ],
  futures: [
    { symbol: 'TX', name: '台指期 (大台)', price: quotesMap['TX']?.close21 || 22850, category: 'futures', multiplier: 200, unitLabel: '口 (1點=200元)', margin: 320000 },
    { symbol: 'MTX', name: '小型台指期 (小台)', price: quotesMap['MTX']?.close21 || 22850, category: 'futures', multiplier: 50, unitLabel: '口 (1點=50元)', margin: 80000 },
    { symbol: 'TMF', name: '微型台指期 (微台)', price: quotesMap['TMF']?.close21 || 22850, category: 'futures', multiplier: 10, unitLabel: '口 (1點=10元)', margin: 16000 },
    { symbol: 'CDF', name: '台積電股票期貨', price: quotesMap['2330']?.close21 || 2510, category: 'futures', multiplier: 2000, unitLabel: '口 (一口=2,000股)', margin: 677700 },
    { symbol: 'DHF', name: '鴻海股票期貨', price: quotesMap['2317']?.close21 || 254, category: 'futures', multiplier: 2000, unitLabel: '口 (一口=2,000股)', margin: 68580 },
    { symbol: 'CCF', name: '聯電股票期貨', price: quotesMap['2303']?.close21 || 161.5, category: 'futures', multiplier: 2000, unitLabel: '口 (一口=2,000股)', margin: 43605 },
    { symbol: '2634F', name: '漢翔股票期貨', price: quotesMap['2634']?.close21 || 64.4, category: 'futures', multiplier: 2000, unitLabel: '口 (一口=2,000股)', margin: 17388 },
  ],
  options_warrants: [
    { symbol: 'TXO-48500-C', name: '台指買權 48500-Call', price: 865, category: 'options', multiplier: 50, unitLabel: '口 (1點=50元)', strikePrice: 48500 },
    { symbol: 'TXO-47000-P', name: '台指賣權 47000-Put', price: 980, category: 'options', multiplier: 50, unitLabel: '口 (1點=50元)', strikePrice: 47000 },
    { symbol: 'TXO-46000-P', name: '台指賣權 46000-Put', price: 385, category: 'options', multiplier: 50, unitLabel: '口 (1點=50元)', strikePrice: 46000 },
    { symbol: '08643P', name: '台積電凱基43購01', price: 2.45, category: 'warrants', multiplier: 1000, unitLabel: '張 (1,000份)' },
    { symbol: '08644P', name: '鴻海元大43購02', price: 1.82, category: 'warrants', multiplier: 1000, unitLabel: '張 (1,000份)' },
    { symbol: '08303P', name: '聯電凱基43購01', price: 0.85, category: 'warrants', multiplier: 1000, unitLabel: '張 (1,000份)' },
  ],
  us_stocks: [
    { symbol: 'YAHOO', name: '雅虎 (Yahoo! Inc.)', price: quotesMap['YAHOO']?.close21 || 52.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'YHOO', name: '雅虎 (Yahoo! Inc. 歷史代號)', price: quotesMap['YHOO']?.close21 || 52.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'YUM', name: '百勝餐飲 (Yum! Brands - KFC/必勝客)', price: quotesMap['YUM']?.close21 || 138.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'YELP', name: 'Yelp (美國本地生活點評網)', price: quotesMap['YELP']?.close21 || 36.2, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'NVDA', name: '輝達 (NVIDIA)', price: quotesMap['NVDA']?.close21 || 125.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'AAPL', name: '蘋果 (Apple)', price: quotesMap['AAPL']?.close21 || 230.2, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'TSLA', name: '特斯拉 (Tesla)', price: quotesMap['TSLA']?.close21 || 258.4, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'TSM', name: '台積電 ADR', price: quotesMap['TSM']?.close21 || 185.0, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'MSFT', name: '微軟 (Microsoft)', price: quotesMap['MSFT']?.close21 || 442.1, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'GOOGL', name: 'Alphabet / Google', price: quotesMap['GOOGL']?.close21 || 182.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'AMZN', name: '亞馬遜 (Amazon)', price: quotesMap['AMZN']?.close21 || 192.6, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'META', name: 'Meta Platforms (臉書 Facebook)', price: quotesMap['META']?.close21 || 582.4, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'NFLX', name: '網飛 (Netflix)', price: quotesMap['NFLX']?.close21 || 708.2, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'AMD', name: '超微半導體 (AMD)', price: quotesMap['AMD']?.close21 || 162.8, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'INTC', name: '英特爾 (Intel)', price: quotesMap['INTC']?.close21 || 22.8, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'PLTR', name: '帕蘭提爾 (Palantir)', price: quotesMap['PLTR']?.close21 || 38.6, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'BABA', name: '阿里巴巴 ADR (Alibaba)', price: quotesMap['BABA']?.close21 || 106.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'COIN', name: 'Coinbase Global', price: quotesMap['COIN']?.close21 || 178.5, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'QQQ', name: '那斯達克100 ETF', price: quotesMap['QQQ']?.close21 || 498.2, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'SPY', name: '標普500 ETF', price: quotesMap['SPY']?.close21 || 575.4, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
    { symbol: 'SOXX', name: '費城半導體 ETF', price: quotesMap['SOXX']?.close21 || 245.8, category: 'us_stocks', multiplier: 32, unitLabel: '股 (1股起，匯率1:32)' },
  ],
  commodities: [
    { symbol: 'CL', name: 'WTI 原油', price: quotesMap['CL']?.close21 || 91.50, category: 'commodities', multiplier: 100, unitLabel: '口 (100桶 · 1點=100美元)', margin: 65000 },
    { symbol: 'BZ', name: 'Brent 原油', price: quotesMap['BZ']?.close21 || 102.39, category: 'commodities', multiplier: 100, unitLabel: '口 (100桶 · 1點=100美元)', margin: 62000 },
    { symbol: 'NG', name: '天然氣 (Natural Gas)', price: quotesMap['NG']?.close21 || 3.010, category: 'commodities', multiplier: 2500, unitLabel: '口 (2,500 mmBtu)', margin: 48000 },
    { symbol: 'RB', name: '汽油 (RBOB Gasoline)', price: quotesMap['RB']?.close21 || 3.3052, category: 'commodities', multiplier: 4200, unitLabel: '口 (4,200加侖)', margin: 52000 },
    { symbol: 'GC', name: '黃金 (Gold)', price: quotesMap['GC']?.close21 || 4169.80, category: 'commodities', multiplier: 10, unitLabel: '口 (微型 10盎司 · 1點=10美元)', margin: 42000 },
    { symbol: 'SI', name: '白銀 (Silver)', price: quotesMap['SI']?.close21 || 60.45, category: 'commodities', multiplier: 1000, unitLabel: '口 (微型 1,000盎司)', margin: 38000 },
    { symbol: 'PL', name: '鉑金 (Platinum)', price: quotesMap['PL']?.close21 || 1690.00, category: 'commodities', multiplier: 50, unitLabel: '口 (50盎司)', margin: 45000 },
    { symbol: 'PA', name: '鈀金 (Palladium)', price: quotesMap['PA']?.close21 || 1187.00, category: 'commodities', multiplier: 100, unitLabel: '口 (100盎司)', margin: 58000 },
    { symbol: 'ZS', name: '大豆 / 黃豆 (Soybeans)', price: quotesMap['ZS']?.close21 || 10.255, category: 'commodities', multiplier: 1000, unitLabel: '口 (1,000蒲式耳)', margin: 32000 },
    { symbol: 'ZC', name: '玉米 (Corn)', price: quotesMap['ZC']?.close21 || 4.280, category: 'commodities', multiplier: 1000, unitLabel: '口 (1,000蒲式耳)', margin: 25000 },
    { symbol: 'ZW', name: '小麥 (Wheat)', price: quotesMap['ZW']?.close21 || 5.850, category: 'commodities', multiplier: 1000, unitLabel: '口 (1,000蒲式耳)', margin: 28000 },
    { symbol: 'ZL', name: '黃豆油 (Soybean Oil)', price: quotesMap['ZL']?.close21 || 43.80, category: 'commodities', multiplier: 600, unitLabel: '口 (60,000磅)', margin: 35000 },
    { symbol: 'ZM', name: '黃豆粉 (Soybean Meal)', price: quotesMap['ZM']?.close21 || 324.50, category: 'commodities', multiplier: 100, unitLabel: '口 (100短噸)', margin: 36000 },
    { symbol: 'KC', name: '咖啡 (Coffee)', price: quotesMap['KC']?.close21 || 248.50, category: 'commodities', multiplier: 375, unitLabel: '口 (37,500磅)', margin: 46000 },
    { symbol: 'SB', name: '11號糖 (Sugar #11)', price: quotesMap['SB']?.close21 || 22.40, category: 'commodities', multiplier: 1120, unitLabel: '口 (112,000磅)', margin: 34000 },
    { symbol: 'CC', name: '可可 (Cocoa)', price: quotesMap['CC']?.close21 || 7850.00, category: 'commodities', multiplier: 10, unitLabel: '口 (10公噸)', margin: 58000 },
    { symbol: 'OJ', name: '冷凍濃縮橙汁 (Orange Juice)', price: quotesMap['OJ']?.close21 || 465.00, category: 'commodities', multiplier: 150, unitLabel: '口 (15,000磅)', margin: 42000 },
    { symbol: 'CT', name: '2號棉花 (Cotton)', price: quotesMap['CT']?.close21 || 72.50, category: 'commodities', multiplier: 500, unitLabel: '口 (50,000磅)', margin: 30000 },
    { symbol: 'HG', name: '高級銅 (Copper 銅博士)', price: quotesMap['HG']?.close21 || 4.520, category: 'commodities', multiplier: 250, unitLabel: '口 (25,000磅)', margin: 55000 },
    { symbol: 'ALI', name: '鋁 (Aluminum)', price: quotesMap['ALI']?.close21 || 2650.00, category: 'commodities', multiplier: 25, unitLabel: '口 (25公噸)', margin: 40000 },
    { symbol: 'NI', name: '鎳 (Nickel)', price: quotesMap['NI']?.close21 || 17500.00, category: 'commodities', multiplier: 6, unitLabel: '口 (6公噸)', margin: 52000 },
    { symbol: 'ZN', name: '鋅 (Zinc)', price: quotesMap['ZN']?.close21 || 3120.00, category: 'commodities', multiplier: 25, unitLabel: '口 (25公噸)', margin: 42000 },
    { symbol: 'LE', name: '活牛 (Live Cattle)', price: quotesMap['LE']?.close21 || 186.50, category: 'commodities', multiplier: 400, unitLabel: '口 (40,000磅)', margin: 36000 },
    { symbol: 'HE', name: '瘦肉豬 (Lean Hogs)', price: quotesMap['HE']?.close21 || 84.20, category: 'commodities', multiplier: 400, unitLabel: '口 (40,000磅)', margin: 32000 },
    { symbol: 'GF', name: '育肥牛 (Feeder Cattle)', price: quotesMap['GF']?.close21 || 254.00, category: 'commodities', multiplier: 500, unitLabel: '口 (50,000磅)', margin: 42000 },
  ],
};

// Taiwan Index Options Strike T-Quote board data (matching user attached image)
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
  { strike: 48000, callBid: 1110, callAsk: 1130, callPrice: 1120, callChange: 170, callOi: 1200, putBid: 640, putAsk: 660, putPrice: 650, putChange: -210, putOi: 2850 },
  { strike: 48500, callBid: 855, callAsk: 875, callPrice: 865, callChange: 170, callOi: 4300, putBid: 480, putAsk: 500, putPrice: 490, putChange: -190, putOi: 3200 },
  { strike: 49000, callBid: 660, callAsk: 680, callPrice: 670, callChange: 145, callOi: 1520, putBid: 350, putAsk: 370, putPrice: 360, putChange: -160, putOi: 2400 },
  { strike: 50000, callBid: 340, callAsk: 360, callPrice: 350, callChange: 90, callOi: 3410, putBid: 170, putAsk: 190, putPrice: 180, putChange: -120, putOi: 4100 },
];

export const CATEGORY_OPTIONS: CategoryConfig[] = [
  {
    id: 'stocks',
    number: '1',
    name: '股票型 (多/空)',
    subTitle: '現股買進 · 融券放空 · 融資槓桿',
    badge: '權值主流 · 半導體AI',
    iconEmoji: '📈',
    description: '涵蓋台積電 2330、聯發科 2454、鴻海 2317 等半導體龍頭。支援現股長期持有、融資 2.5 倍槓桿或融券放空避險。',
    colorScheme: {
      border: 'border-rose-300',
      bgGradient: 'from-rose-50 to-white',
      accentText: 'text-rose-800',
      tagBg: 'bg-rose-100 text-rose-900 border-rose-300',
      hoverBorder: 'hover:border-rose-500',
    },
    sampleSymbols: ['2330', '2454', '2317', '2382', '2308', '2603'],
  },
  {
    id: 'bonds',
    number: '2',
    name: '債券型 / 債券ETF',
    subTitle: '長天期美債 · 投資級公司債 · 降息鎖利',
    badge: '防守基石 · 降息紅利',
    iconEmoji: '🛡️',
    description: '配置元大美債20年 00679B、國泰美債 00687B 與投資級公司債，鎖定降息循環固定高息收益與長天期公債資本利得。',
    colorScheme: {
      border: 'border-sky-300',
      bgGradient: 'from-sky-50 to-white',
      accentText: 'text-sky-800',
      tagBg: 'bg-sky-100 text-sky-900 border-sky-300',
      hoverBorder: 'hover:border-sky-500',
    },
    sampleSymbols: ['00679B', '00687B', '00720B', '00772B'],
  },
  {
    id: 'etfs',
    number: '3',
    name: '指數 / 反向 ETF',
    subTitle: '元大台灣50 · 台灣50反1 · 高股息',
    badge: '大盤連動 · 空頭對沖',
    iconEmoji: '📊',
    description: '買進 0050 掌握台股權值主升段；或在震盪盤局建立 00632R 反向 ETF，降低 5000 萬投資組合總體下行回撤。',
    colorScheme: {
      border: 'border-indigo-300',
      bgGradient: 'from-indigo-50 to-white',
      accentText: 'text-indigo-800',
      tagBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      hoverBorder: 'hover:border-indigo-500',
    },
    sampleSymbols: ['00981A', '0050', '0056', '00878'],
  },
  {
    id: 'futures',
    number: '4',
    name: '期貨 (大台/小台/個股期)',
    subTitle: '大台指期 (TX) · 小台指 (MTX) · 台積期貨',
    badge: '高槓桿 · 雙向多空避險',
    iconEmoji: '⚡',
    description: '以保證金交易制度進行槓桿攻擊或對沖現貨。放空一口大台指相當於避險 457 萬現貨市值，為法人必備工具。',
    colorScheme: {
      border: 'border-amber-300',
      bgGradient: 'from-amber-50 to-white',
      accentText: 'text-amber-900',
      tagBg: 'bg-amber-100 text-amber-950 border-amber-300',
      hoverBorder: 'hover:border-amber-500',
    },
    sampleSymbols: ['TX', 'MTX', 'CDF'],
  },
  {
    id: 'options_warrants',
    number: '5',
    name: '選擇權 / 權證 (衍生品)',
    subTitle: '台指買權 Call · 賣權 Put · 認購/認售權證',
    badge: '非對稱報酬 · 災難保險',
    iconEmoji: '🎯',
    description: '以有限權利金獲得倍數槓桿暴擊；或買進價外 Put 避險，為 5000 萬現貨現行最便宜之「崩跌保險單」。',
    colorScheme: {
      border: 'border-purple-300',
      bgGradient: 'from-purple-50 to-white',
      accentText: 'text-purple-900',
      tagBg: 'bg-purple-100 text-purple-950 border-purple-300',
      hoverBorder: 'hover:border-purple-500',
    },
    sampleSymbols: ['TXO-22800-C', 'TXO-22600-P', '08643P', '08645P'],
  },
  {
    id: 'us_stocks',
    number: '6',
    name: '美股複委託 (US Stocks)',
    subTitle: '輝達 · 蘋果 · 特斯拉 · 標普500 · 跨國全球龍頭',
    badge: '全球旗艦 · 1股起下單 · 美元即時折算NT$',
    iconEmoji: '🇺🇸',
    description: '涵蓋 NVIDIA (NVDA)、Apple (AAPL)、Tesla (TSLA)、台積電 ADR (TSM)、微軟 (MSFT)、Google (GOOGL)、QQQ 與 SPY 等。支援 1 股起小額建倉，以實時匯率（1 USD ≈ 32 TWD）自動台幣結算圈存交割。',
    colorScheme: {
      border: 'border-blue-300',
      bgGradient: 'from-blue-50 to-white',
      accentText: 'text-blue-900',
      tagBg: 'bg-blue-100 text-blue-950 border-blue-300',
      hoverBorder: 'hover:border-blue-500',
    },
    sampleSymbols: ['NVDA', 'AAPL', 'TSLA', 'TSM', 'QQQ', 'SPY'],
  },
  {
    id: 'commodities',
    number: '7',
    name: '全球原物料期貨 (Commodities)',
    subTitle: '能源 · 貴金屬 · 農產品 · 軟性商品 · 工業金屬 · 牲畜',
    badge: 'CME/NYMEX/ICE · 24H撮合 · 雙向多空',
    iconEmoji: '🌍',
    description: '涵蓋 能源｜貴金屬｜農產品｜軟性商品｜工業金屬｜牲畜 六大板塊！WTI 原油、黃金、白銀、天然氣、大豆、玉米、小麥、咖啡、可可、銅博士等。以台幣保證金直接參與全球大宗原物料多空交易。',
    colorScheme: {
      border: 'border-amber-400',
      bgGradient: 'from-amber-50 to-orange-50',
      accentText: 'text-amber-950',
      tagBg: 'bg-amber-100 text-amber-950 border-amber-400',
      hoverBorder: 'hover:border-amber-600',
    },
    sampleSymbols: ['CL', 'GC', 'SI', 'NG', 'ZS', 'KC', 'HG', 'LE'],
  },
  {
    id: 'crypto',
    number: '8',
    name: '加密貨幣與穩定幣 (Crypto 24/7)',
    subTitle: 'BTC · ETH · USDT · USDC · 全球 24/7 永續市場',
    badge: '24/7 全天候 · 高波動＆資金停泊',
    iconEmoji: '🪙',
    description: '涵蓋 BTC (比特幣)、ETH (以太坊) 高波動主要加密資產，以及 USDT、USDC 美元穩定幣（目標價值 ≈ US$1 資金停泊與避險結算）。24/7 全年無休連線，平倉收益持續性累計入已平倉已實現損益！',
    colorScheme: {
      border: 'border-emerald-400',
      bgGradient: 'from-emerald-50 to-teal-50',
      accentText: 'text-emerald-950',
      tagBg: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      hoverBorder: 'hover:border-emerald-600',
    },
    sampleSymbols: ['BTC', 'ETH', 'USDT', 'USDC'],
  },
];

interface TradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInstrument: InstrumentSpec;
  instrumentsList: InstrumentSpec[];
  availableCash: number;
  onSelectInstrument: (inst: InstrumentSpec) => void;
  onAddCustomInstrument?: (inst: InstrumentSpec) => void;
  onOpenGeminiAssistant: () => void;
  onOpenCalculator?: (inst?: InstrumentSpec) => void;
  onOpenGlossary?: () => void;
  initialStep?: 'select_category' | 'order_form';
  initialAction?: OrderAction;
  currentProfile?: StudentProfile | null;
  onViewInstrumentKLine?: (inst: InstrumentSpec) => void;
  onClosePosition?: (posId: string) => void;
  isSuperUser?: boolean;
  onExecuteTrade: (trade: {
    symbol: string;
    name: string;
    category: AssetCategory;
    action: OrderAction;
    price: number;
    quantity: number;
    unitMultiplier: number;
    totalAmountOrMargin: number;
    notionalValue: number;
    rationale: string;
  }) => void;
  onForceRefresh?: () => void;
}

export type TradingToolTab = 'smart_search' | 'kline' | 'my_positions' | 'commodities' | 'stockq' | 'options_t_quote';

function calcTwseLimit(prevClose: number, isUp: boolean): number {
  const raw = isUp ? prevClose * 1.10 : prevClose * 0.90;
  if (prevClose < 10) return Number((Math.round(raw * 100) / 100).toFixed(2));
  if (prevClose < 50) return Number((Math.round(raw * 20) / 20).toFixed(2));
  if (prevClose < 100) return Number((Math.round(raw * 10) / 10).toFixed(2));
  if (prevClose < 500) return Number((Math.round(raw * 2) / 2).toFixed(2));
  if (prevClose < 1000) return Math.round(raw);
  return isUp ? Math.floor(raw / 5) * 5 : Math.ceil(raw / 5) * 5;
}

export const TradingModal: React.FC<TradingModalProps> = ({
  isOpen,
  onClose,
  selectedInstrument,
  instrumentsList,
  availableCash,
  onSelectInstrument,
  onAddCustomInstrument,
  onOpenGeminiAssistant,
  onOpenCalculator,
  onOpenGlossary,
  initialStep = 'select_category',
  initialAction,
  currentProfile,
  onViewInstrumentKLine,
  onClosePosition,
  isSuperUser = false,
  onExecuteTrade,
  onForceRefresh,
}) => {
  const [step, setStep] = useState<'select_category' | 'order_form'>(initialStep);
  const [categorySelectMode, setCategorySelectMode] = useState<'smart_search' | 'categories'>('smart_search');
  const [activeToolTab, setActiveToolTab] = useState<TradingToolTab>('smart_search');
  const [mobileActiveView, setMobileActiveView] = useState<'order' | 'tools'>('order');
  const [leftToolNotice, setLeftToolNotice] = useState<string | null>(null);

  const orderTicketRef = useRef<HTMLDivElement>(null);
  const bottomToolsRef = useRef<HTMLDivElement>(null);
  const [isBottomToolsExpanded, setIsBottomToolsExpanded] = useState<boolean>(true);

  const scrollToTools = (tab?: TradingToolTab) => {
    if (tab) setActiveToolTab(tab);
    setIsBottomToolsExpanded(true);
    setTimeout(() => {
      bottomToolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const scrollToOrder = () => {
    setMobileActiveView('order');
    orderTicketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Positions calculation for selected instrument
  const myPositions = currentProfile?.positions || [];
  const currentInstPositions = useMemo(() => {
    const s = selectedInstrument.symbol;
    const name = selectedInstrument.name;
    return myPositions.filter(p => {
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
  }, [myPositions, selectedInstrument]);

  const totalHeldQty = currentInstPositions.reduce((sum, p) => sum + p.quantity, 0);
  const totalHeldCost = currentInstPositions.reduce((sum, p) => sum + p.totalCostOrMargin, 0);
  const totalHeldMarketVal = currentInstPositions.reduce((sum, p) => sum + p.notionalValue, 0);
  const totalHeldPnL = currentInstPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const avgHeldCost = totalHeldQty > 0 && totalHeldCost > 0 ? Math.round(totalHeldCost / totalHeldQty) : 0;

  const getCategoryTabFromInstrument = (inst: InstrumentSpec): MainCategoryTab => {
    if (inst.category === 'stocks') return 'stocks';
    if (inst.category === 'bonds') return 'bonds';
    if (inst.category === 'etfs') return 'etfs';
    if (inst.category === 'futures') return 'futures';
    if (inst.category === 'us_stocks') return 'us_stocks';
    if (inst.category === 'commodities') return 'commodities';
    if (inst.category === 'crypto') return 'crypto';
    return 'options_warrants';
  };

  const [activeCategoryTab, setActiveCategoryTab] = useState<MainCategoryTab>(() =>
    getCategoryTabFromInstrument(selectedInstrument)
  );

  const [orderAction, setOrderAction] = useState<OrderAction>('BUY_STOCK');
  const [quantity, setQuantity] = useState<number>(10);
  const [customPrice, setCustomPrice] = useState<number>(selectedInstrument.price);
  const [useCustomPrice, setUseCustomPrice] = useState<boolean>(false);
  const [rationale, setRationale] = useState<string>('');
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  // Quick Search & Filter Chips in Active Category
  const [searchQuery, setSearchQuery] = useState('');

  // Direct Symbol Input & Real-Time Price Fetching on Order Form
  const [directSymbolInput, setDirectSymbolInput] = useState('');
  const [isDirectFetching, setIsDirectFetching] = useState(false);
  const [directFetchMsg, setDirectFetchMsg] = useState<string | null>(null);
  const [fairTradeWarning, setFairTradeWarning] = useState<string | null>(null);
  const [showLimitUpAlternatives, setShowLimitUpAlternatives] = useState(false);

  // Custom Instrument Specification Modal
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customCategory, setCustomCategory] = useState<AssetCategory>('stocks');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [customMultiplier, setCustomMultiplier] = useState(1000);
  const [customUnitLabel, setCustomUnitLabel] = useState('張 (1,000股)');
  const [customMargin, setCustomMargin] = useState(0);
  const [customStrike, setCustomStrike] = useState('');
  const [customExpiry, setCustomExpiry] = useState('2026-10-21');
  const [isAiFetching, setIsAiFetching] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Taiwan Index Options T-Quote Board Modal (Matching user image)
  const [isOptionsBoardOpen, setIsOptionsBoardOpen] = useState(false);
  const [optionsContract, setOptionsContract] = useState('台指2610');
  const [optionsBoardType, setOptionsBoardType] = useState<'TXO' | 'TFO' | 'TEO'>('TXO');

  // Dual-Mode Architecture: Student Detailed Calculation & PPT Report Card toggle
  const [isStudentCalcExpanded, setIsStudentCalcExpanded] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      setActiveCategoryTab(getCategoryTabFromInstrument(selectedInstrument));
      setCustomPrice(selectedInstrument.price);
      if (initialAction) {
        setOrderAction(initialAction);
      }
    }
  }, [isOpen, initialStep, initialAction]);

  useEffect(() => {
    setCustomPrice(selectedInstrument.price);
    setActiveCategoryTab(getCategoryTabFromInstrument(selectedInstrument));

    if (initialAction) {
      setOrderAction(initialAction);
      return;
    }

    if (selectedInstrument.category === 'stocks') setOrderAction('BUY_STOCK');
    else if (selectedInstrument.category === 'us_stocks') setOrderAction('BUY_US_STOCK');
    else if (selectedInstrument.category === 'commodities') setOrderAction('BUY_COMMODITY_LONG');
    else if (selectedInstrument.category === 'crypto') {
      const sym = selectedInstrument.symbol.toUpperCase();
      if (sym === 'TWDT' || sym === 'TWDC') {
        setOrderAction('BUY_TW_STABLECOIN');
        setQuantity(10000);
      } else if (sym === 'USDT' || sym === 'USDC') {
        setOrderAction('BUY_STABLECOIN');
        setQuantity(10000);
      } else {
        setOrderAction('BUY_CRYPTO');
        setQuantity(0.1);
      }
    } else if (selectedInstrument.category === 'bonds') setOrderAction('BUY_BOND');
    else if (selectedInstrument.category === 'etfs') {
      setOrderAction(selectedInstrument.symbol === '00632R' ? 'BUY_ETF' : 'BUY_ETF');
    } else if (selectedInstrument.category === 'futures') setOrderAction('BUY_FUTURES_LONG');
    else if (selectedInstrument.category === 'options') {
      setOrderAction(selectedInstrument.name.includes('賣權') ? 'BUY_PUT_OPTION' : 'BUY_CALL_OPTION');
    } else if (selectedInstrument.category === 'warrants') {
      setOrderAction(selectedInstrument.name.includes('售') ? 'BUY_PUT_WARRANT' : 'BUY_CALL_WARRANT');
    }
  }, [selectedInstrument, initialAction]);

  const currentPrice = useCustomPrice ? customPrice : selectedInstrument.price;
  const multiplier = selectedInstrument.multiplier || (selectedInstrument.category === 'us_stocks' ? 32 : 1000);

  const prevClose = selectedInstrument.prevClose || selectedInstrument.price;
  const limitUpPrice = selectedInstrument.limitUpPrice || calcTwseLimit(prevClose, true);
  const limitDownPrice = selectedInstrument.limitDownPrice || calcTwseLimit(prevClose, false);
  const isCurrentlyLimitUp =
    selectedInstrument.category !== 'us_stocks' &&
    selectedInstrument.category !== 'commodities' &&
    selectedInstrument.category !== 'crypto' && (
      selectedInstrument.isLimitUp ||
      selectedInstrument.price >= limitUpPrice ||
      selectedInstrument.changePercent >= 9.8
    );
  const isCurrentlyLimitDown =
    selectedInstrument.category !== 'us_stocks' &&
    selectedInstrument.category !== 'commodities' &&
    selectedInstrument.category !== 'crypto' && (
      selectedInstrument.isLimitDown ||
      selectedInstrument.price <= limitDownPrice ||
      selectedInstrument.changePercent <= -9.8
    );

  // 金額與保證金規則集中在 utils/orderMath（手機版共用）
  const { totalCostOrMargin, notionalValue } = computeOrderCost(selectedInstrument, orderAction, currentPrice, quantity);

  const hasEnoughCash = availableCash >= totalCostOrMargin;

  // Taiwan stock/futures/US stocks tick rules for stepping price
  const getTickSize = (price: number): number => {
    if (selectedInstrument.category === 'crypto') {
      const sym = selectedInstrument.symbol.toUpperCase();
      if (sym === 'TWDT' || sym === 'TWDC' || sym === 'USDT' || sym === 'USDC') return 0.0001;
      return price < 10 ? 0.01 : price < 1000 ? 0.1 : 1;
    }
    if (selectedInstrument.category === 'us_stocks') return 0.1;
    if (selectedInstrument.category === 'futures') return 1;
    if (selectedInstrument.category === 'options') return price < 10 ? 0.1 : price < 50 ? 0.5 : 1;
    if (selectedInstrument.category === 'warrants') return price < 5 ? 0.01 : 0.05;
    if (price < 10) return 0.01;
    if (price < 50) return 0.05;
    if (price < 100) return 0.1;
    if (price < 500) return 0.5;
    if (price < 1000) return 1;
    return 5;
  };

  const handleStepPrice = (delta: number) => {
    const tick = getTickSize(currentPrice);
    const next = Math.max(0.01, Number((currentPrice + delta * tick).toFixed(2)));
    setCustomPrice(next);
    setUseCustomPrice(true);
  };

  const handleStepQuantity = (delta: number) => {
    if (selectedInstrument.category === 'crypto') {
      const sym = selectedInstrument.symbol.toUpperCase();
      if (sym === 'TWDT' || sym === 'TWDC' || sym === 'USDT' || sym === 'USDC') {
        setQuantity(prev => Math.max(100, Math.round(prev + delta * 1000)));
      } else {
        setQuantity(prev => Math.max(0.01, Number((prev + delta * 0.05).toFixed(2))));
      }
    } else {
      setQuantity(prev => Math.max(1, prev + delta));
    }
  };

  // Contract Specification & Unit Conversion (Matching Student's exact screenshot & Taiwan broker standards)
  const contractSpec = useMemo(() => {
    const cat = selectedInstrument.category;
    const sym = selectedInstrument.symbol.toUpperCase();
    const name = selectedInstrument.name;
    const mult = selectedInstrument.multiplier || 1000;

    if (cat === 'crypto') {
      const isTwStable = sym === 'TWDT' || sym === 'TWDC';
      if (isTwStable) {
        return {
          unitName: sym,
          unitFull: `${sym} (新台幣穩定幣 · 目標價值 ≈ NT$1)`,
          perUnitShares: 1,
          specTitle: `${name} · 台灣金管會架構穩定幣 (100% 銀行信託)`,
          specFormula: `${sym} 目標價值 ≈ NT$1 · 100% 台灣特許商業銀行信託隔離 · 零匯率風險`,
          convertedText: `${quantity.toLocaleString()} ${sym} (等值新台幣 NT$ ${quantity.toLocaleString()})`,
          tickValueText: '零匯率波動 · 本幣 1:1 錨定 · 金管會虛擬資產管理專法保障',
          leverageText: '1.0 倍 (本土合規穩定幣，隨時可 1:1 兌回新台幣現金)',
          isStockFutures: false,
        };
      }
      const isGlobalStable = sym === 'USDT' || sym === 'USDC';
      if (isGlobalStable) {
        return {
          unitName: sym,
          unitFull: `${sym} (全球加密美元穩定幣 · 目標價值 ≈ US$1)`,
          perUnitShares: 1,
          specTitle: `${name} · 全球加密美元穩定資產 (境外發行)`,
          specFormula: `${sym} 目標價值 ≈ US$1 · 全球交易對結算與資金停泊 (美元匯率 1:32.5)`,
          convertedText: `${quantity.toLocaleString()} ${sym} (折合 NT$ ${Math.round(currentPrice * quantity * 32.5).toLocaleString()})`,
          tickValueText: '目標維持在 1 美元附近 · ⚠️ 具美元/台幣匯率波動風險',
          leverageText: '1.0 倍 (全球穩定幣，隨時可兌換回新台幣現金)',
          isStockFutures: false,
        };
      }
      return {
        unitName: sym,
        unitFull: `枚 (1 ${sym} · 24/7 永續市場)`,
        perUnitShares: 1,
        specTitle: `${name} · 24/7 高波動主要加密資產`,
        specFormula: `${sym}/USDT · Binance 公開 WebSocket 直連 (匯率 1:32.5)`,
        convertedText: `${quantity} ${sym} = USD $${(currentPrice * quantity).toFixed(2)} (折合 NT$ ${Math.round(currentPrice * quantity * 32.5).toLocaleString()})`,
        tickValueText: `跳動 1 美元 = NT$ ${(32.5 * quantity).toLocaleString()} 元`,
        leverageText: '1.0 倍 (24/7 撮合，平倉損益持續性累計入已實現損益)',
        isStockFutures: false,
      };
    }

    if (cat === 'us_stocks') {
      return {
        unitName: '股',
        unitFull: '股 (1股起，美股複委託)',
        perUnitShares: 1,
        specTitle: '美股複委託現貨 (US Stocks)',
        specFormula: '1 股 = 1 單位 (美元計價，以匯率 32.0 自動台幣圈存交割)',
        convertedText: `${quantity} 股 = USD $${(currentPrice * quantity).toFixed(2)} (折合 NT$ ${Math.round(currentPrice * quantity * 32).toLocaleString()})`,
        tickValueText: `跳動 $1 美元 = NT$ ${(32 * quantity).toLocaleString()} 元`,
        leverageText: '1.0 倍 (無融資槓桿，全額現貨買進)',
        isStockFutures: false,
      };
    }

    if (cat === 'commodities') {
      const marginReq = selectedInstrument.marginRequirement || 50000;
      return {
        unitName: '口',
        unitFull: selectedInstrument.unitLabel || '口 (原物料期貨合約)',
        perUnitShares: 1,
        specTitle: '全球大宗原物料商品期貨 (CME/NYMEX/ICE)',
        specFormula: `${name} (${sym}) · 美元國際報價 · 台灣台幣保證金圈存 (匯率 1:32)`,
        convertedText: `${quantity} 口 = 保證金 NT$ ${(marginReq * quantity).toLocaleString()} (契約總值約 USD $${(currentPrice * mult * quantity).toFixed(2)})`,
        tickValueText: `跳動 1 點 = 約 NT$ ${Math.round(mult * 32 * quantity).toLocaleString()} 元`,
        leverageText: '約 10~15 倍槓桿 (保證金交易制度)',
        isStockFutures: false,
      };
    }

    if (cat === 'stocks') {
      return {
        unitName: '張',
        unitFull: '張 (1,000股)',
        perUnitShares: 1000,
        specTitle: '標準現貨股票',
        specFormula: '1 張 = 1,000 股',
        convertedText: `${quantity} 張 = ${(quantity * 1000).toLocaleString()} 股現貨`,
        tickValueText: `跳動 1 元 = NT$ ${(1000 * quantity).toLocaleString()} 元`,
        leverageText:
          orderAction === 'BUY_MARGIN_STOCK'
            ? '2.5 倍槓桿 (融資自備款 40%)'
            : orderAction === 'SHORT_SELL_STOCK'
            ? '放空避險 (融券保證金 90%)'
            : '1.0 倍 (全額現股買進)',
        isStockFutures: false,
      };
    }

    if (cat === 'etfs') {
      return {
        unitName: '張',
        unitFull: '張 (1,000單位)',
        perUnitShares: 1000,
        specTitle: '指數/債券型 ETF',
        specFormula: '1 張 = 1,000 單位/股',
        convertedText: `${quantity} 張 = ${(quantity * 1000).toLocaleString()} 單位`,
        tickValueText: `跳動 1 元 = NT$ ${(1000 * quantity).toLocaleString()} 元`,
        leverageText:
          orderAction === 'SHORT_SELL_ETF' ? '融券放空避險 (保證金 90%)' : '1.0 倍 (全額現貨持有)',
        isStockFutures: false,
      };
    }

    if (cat === 'bonds') {
      return {
        unitName: '張',
        unitFull: '張 (1,000單位)',
        perUnitShares: 1000,
        specTitle: '長天期美債 ETF',
        specFormula: '1 張 = 1,000 單位',
        convertedText: `${quantity} 張 = ${(quantity * 1000).toLocaleString()} 單位`,
        tickValueText: `跳動 1 元 = NT$ ${(1000 * quantity).toLocaleString()} 元`,
        leverageText: '1.0 倍 (固定收益與降息資本利得)',
        isStockFutures: false,
      };
    }

    if (cat === 'warrants') {
      return {
        unitName: '張',
        unitFull: '張 (1,000份)',
        perUnitShares: 1000,
        specTitle: '認購/認售權證',
        specFormula: '1 張 = 1,000 份權證',
        convertedText: `${quantity} 張 = ${(quantity * 1000).toLocaleString()} 份`,
        tickValueText: `跳動 1 元 = NT$ ${(1000 * quantity).toLocaleString()} 元`,
        leverageText: '約 5 ~ 10 倍實質非對稱槓桿',
        isStockFutures: false,
      };
    }

    if (cat === 'futures') {
      // 學生截圖核心：股票期貨、小型期貨、ETF期貨、指數期貨
      if (sym === 'TX' || name.includes('台指期') || name.includes('大台')) {
        return {
          unitName: '口',
          unitFull: '口 (1點=200元)',
          perUnitShares: 0,
          specTitle: '台股旗艦 · 大台指期 (TX)',
          specFormula: '1 口 = 點數 × 200 元',
          convertedText: `下單 ${quantity} 口 (跳動 1 點 = NT$ ${(200 * quantity).toLocaleString()} 元)`,
          tickValueText: `每跳動 1 點 = NT$ ${(200 * quantity).toLocaleString()} 元`,
          leverageText: `約 ${((currentPrice * 200) / (selectedInstrument.marginRequirement || 320000)).toFixed(1)} 倍實質槓桿`,
          isStockFutures: false,
        };
      }
      if (sym === 'MTX' || name.includes('小台')) {
        return {
          unitName: '口',
          unitFull: '口 (1點=50元)',
          perUnitShares: 0,
          specTitle: '小型台指期 (MTX)',
          specFormula: '1 口 = 點數 × 50 元 (大台 1/4)',
          convertedText: `下單 ${quantity} 口 (跳動 1 點 = NT$ ${(50 * quantity).toLocaleString()} 元)`,
          tickValueText: `每跳動 1 點 = NT$ ${(50 * quantity).toLocaleString()} 元`,
          leverageText: `約 ${((currentPrice * 50) / (selectedInstrument.marginRequirement || 80000)).toFixed(1)} 倍實質槓桿`,
          isStockFutures: false,
        };
      }
      if (sym === 'TMF' || name.includes('微台')) {
        return {
          unitName: '口',
          unitFull: '口 (1點=10元)',
          perUnitShares: 0,
          specTitle: '微型台指期 (TMF)',
          specFormula: '1 口 = 點數 × 10 元 (大台 1/20)',
          convertedText: `下單 ${quantity} 口 (跳動 1 點 = NT$ ${(10 * quantity).toLocaleString()} 元)`,
          tickValueText: `每跳動 1 點 = NT$ ${(10 * quantity).toLocaleString()} 元`,
          leverageText: `約 ${((currentPrice * 10) / (selectedInstrument.marginRequirement || 16000)).toFixed(1)} 倍實質槓桿`,
          isStockFutures: false,
        };
      }
      if (mult === 10000 || name.includes('ETF期')) {
        return {
          unitName: '口',
          unitFull: '口 (1口=10,000股)',
          perUnitShares: 10000,
          specTitle: 'ETF 股票期貨',
          specFormula: '1 口 = 10,000 股（相當於 10 張 ETF 現貨）',
          convertedText: `下單 ${quantity} 口 = 等同控制 ${(quantity * 10000).toLocaleString()} 股（${quantity * 10} 張現貨）`,
          tickValueText: `每跳動 1 元 = NT$ ${(10000 * quantity).toLocaleString()} 元`,
          leverageText: '約 7.4 倍槓桿 (原始保證金比率 13.5%)',
          isStockFutures: true,
        };
      }
      if (mult === 100 || name.includes('小型') || sym.endsWith('S')) {
        return {
          unitName: '口',
          unitFull: '口 (1口=100股)',
          perUnitShares: 100,
          specTitle: '小型股票期貨',
          specFormula: '1 口 = 100 股（相當於 0.1 張現貨股票）',
          convertedText: `下單 ${quantity} 口 = 等同控制 ${(quantity * 100).toLocaleString()} 股（${(quantity * 0.1).toFixed(1)} 張現貨）`,
          tickValueText: `每跳動 1 元 = NT$ ${(100 * quantity).toLocaleString()} 元`,
          leverageText: '約 7.4 倍槓桿 (原始保證金比率 13.5%)',
          isStockFutures: true,
        };
      }
      // 標準個股期貨 (CDF, DHF, CCF)
      return {
        unitName: '口',
        unitFull: '口 (1口=2,000股)',
        perUnitShares: 2000,
        specTitle: '標準股票期貨（個股期貨）',
        specFormula: '1 口 = 2,000 股（相當於 2 張現貨股票）',
        convertedText: `下單 ${quantity} 口 = 等同控制 ${(quantity * 2000).toLocaleString()} 股（${quantity * 2} 張現貨股票）`,
        tickValueText: `每跳動 1 元 = NT$ ${(2000 * quantity).toLocaleString()} 元`,
        leverageText: '約 7.4 倍實質槓桿 (原始保證金約 13.5%)',
        isStockFutures: true,
      };
    }

    if (cat === 'options') {
      return {
        unitName: '口',
        unitFull: '口 (1點=50元)',
        perUnitShares: 0,
        specTitle: '台指選擇權 (TXO)',
        specFormula: '1 口 = 點數 × 50 元',
        convertedText: `下單 ${quantity} 口 (點數 ${currentPrice} = 權利金 NT$ ${(currentPrice * 50 * quantity).toLocaleString()})`,
        tickValueText: `每跳動 1 點 = NT$ ${(50 * quantity).toLocaleString()} 元`,
        leverageText: '非對稱非線性槓桿 (有限風險，爆發力無窮)',
        isStockFutures: false,
      };
    }

    return {
      unitName: '單位',
      unitFull: '單位',
      perUnitShares: 1000,
      specTitle: '金融商品',
      specFormula: '1 單位',
      convertedText: `${quantity} 單位`,
      tickValueText: '依市場跳動',
      leverageText: '1.0 倍',
      isStockFutures: false,
    };
  }, [selectedInstrument, quantity, currentPrice, orderAction]);

  // 成本拆解計算（供學生學習細算與 PPT 報告使用）
  const costBreakdown = useMemo(() => {
    let estFee = 0;
    let estTax = 0;

    if (
      selectedInstrument.category === 'stocks' ||
      selectedInstrument.category === 'etfs' ||
      selectedInstrument.category === 'bonds' ||
      selectedInstrument.category === 'warrants'
    ) {
      // 券商手續費 0.1425% (基本低消 20元)
      estFee = Math.max(20, Math.round(notionalValue * 0.001425));
      if (orderAction === 'SHORT_SELL_STOCK') {
        estTax = Math.round(notionalValue * 0.003); // 0.3%
      } else if (orderAction === 'SHORT_SELL_ETF') {
        estTax = Math.round(notionalValue * 0.001); // 0.1%
      }
    } else if (selectedInstrument.category === 'futures') {
      estFee = quantity * 40; // 期貨手續費規費約 40 元 / 口
      estTax = Math.round(notionalValue * 0.00002); // 期交稅十萬分之二
    } else if (selectedInstrument.category === 'options') {
      estFee = quantity * 30; // 選擇權手續費規費約 30 元 / 口
      estTax = Math.round(notionalValue * 0.001); // 選擇權千分之一
    }

    const totalDeduction = totalCostOrMargin + estFee + estTax;

    return {
      estFee,
      estTax,
      totalDeduction,
    };
  }, [selectedInstrument, notionalValue, totalCostOrMargin, orderAction, quantity]);

  const handleExecuteWithAction = (action: OrderAction) => {
    setOrderAction(action);
    if (!hasEnoughCash || quantity <= 0) return;
    if (selectedInstrument.isMock) {
      setFairTradeWarning(`🚫 ${selectedInstrument.name}（${selectedInstrument.symbol}）目前查無 FinMind 真實報價，無法下單。`);
      return;
    }

    // 💡 設計方案 B：若現貨股票觸及漲停鎖死，市價買單無法成交，彈出【智慧金融教育引導：轉向衍生性商品】
    if ((action === 'BUY_STOCK' || action === 'BUY_MARGIN_STOCK') && isCurrentlyLimitUp) {
      setShowLimitUpAlternatives(true);
      return;
    }

    if (
      (action === 'BUY_STOCK' || action === 'BUY_MARGIN_STOCK' || action === 'BUY_ETF') &&
      useCustomPrice &&
      customPrice < selectedInstrument.price
    ) {
      setFairTradeWarning(
        `🚫 公平撮合阻擋：該標的當前盤中撮合價為 NT$ ${selectedInstrument.price}，禁止以昨日收盤價（NT$ ${prevClose}）偷跑買進！已校正為當前市場公平撮合價。`
      );
      setCustomPrice(selectedInstrument.price);
      setUseCustomPrice(false);
      return;
    }

    setFairTradeWarning(null);

    onExecuteTrade({
      symbol: selectedInstrument.symbol,
      name: selectedInstrument.name,
      category: selectedInstrument.category,
      action,
      price: currentPrice,
      quantity,
      unitMultiplier: multiplier,
      totalAmountOrMargin: totalCostOrMargin,
      notionalValue,
      rationale:
        rationale.trim() ||
        `依據當下即時撮合價 ${currentPrice} 建立 ${quantity} ${contractSpec.unitName} 部位 (${contractSpec.specFormula})。`,
    });

    setOrderSuccessMsg(
      isCurrentlyLimitUp
        ? `下單成功！已依漲停價 NT$ ${currentPrice} 委託建立 ${quantity} ${contractSpec.unitName} 之部位。`
        : `下單成功！已成功建立 ${quantity} ${contractSpec.unitName} (${contractSpec.specFormula}) 之部位。`
    );
    setTimeout(() => {
      setOrderSuccessMsg(null);
      onClose();
    }, 1500);
  };

  const getFilteredInstruments = (tab: MainCategoryTab) => {
    let list: InstrumentSpec[] = [];
    if (tab === 'stocks') list = instrumentsList.filter(i => i.category === 'stocks');
    else if (tab === 'bonds') list = instrumentsList.filter(i => i.category === 'bonds');
    else if (tab === 'etfs') list = instrumentsList.filter(i => i.category === 'etfs');
    else if (tab === 'futures') list = instrumentsList.filter(i => i.category === 'futures');
    else if (tab === 'us_stocks') list = instrumentsList.filter(i => i.category === 'us_stocks');
    else if (tab === 'commodities') list = instrumentsList.filter(i => i.category === 'commodities');
    else if (tab === 'crypto') list = instrumentsList.filter(i => i.category === 'crypto');
    else list = instrumentsList.filter(i => i.category === 'options' || i.category === 'warrants');

    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(i => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  };

  const updateDefaultsForCategory = (cat: AssetCategory) => {
    if (cat === 'stocks') {
      setCustomMultiplier(1000);
      setCustomUnitLabel('張 (1,000股)');
      setCustomMargin(0);
    } else if (cat === 'bonds') {
      setCustomMultiplier(1000);
      setCustomUnitLabel('張 (1,000單位)');
      setCustomMargin(0);
    } else if (cat === 'etfs') {
      setCustomMultiplier(1000);
      setCustomUnitLabel('張 (1,000單位)');
      setCustomMargin(0);
    } else if (cat === 'futures') {
      setCustomMultiplier(200);
      setCustomUnitLabel('口 (1點=200元)');
      setCustomMargin(180000);
    } else if (cat === 'commodities') {
      setCustomMultiplier(100);
      setCustomUnitLabel('口 (商品期貨)');
      setCustomMargin(50000);
    } else if (cat === 'us_stocks') {
      setCustomMultiplier(32);
      setCustomUnitLabel('股 (1股起買)');
      setCustomMargin(0);
    } else {
      setCustomMultiplier(1000);
      setCustomUnitLabel('口/張');
      setCustomMargin(45000);
    }
  };

  const fetchAndApplySymbol = async (rawSym: string) => {
    const sym = rawSym.trim().toUpperCase();
    if (!sym) return;

    // 1. Check existing instruments list
    const existing = instrumentsList.find(i => i.symbol.toUpperCase() === sym);
    if (existing) {
      onSelectInstrument(existing);
      setCustomPrice(existing.price);
      setUseCustomPrice(false);
      setFairTradeWarning(null);
      setDirectFetchMsg(`已成功載入「${existing.name} (${existing.symbol})」，當下撮合價 NT$ ${existing.price}`);
      setStep('order_form');
      setSearchQuery('');
      setDirectSymbolInput('');
      return;
    }

    setIsDirectFetching(true);
    setDirectFetchMsg(null);
    setFairTradeWarning(null);

    // 2. 優先向真實行情端點查詢 (0 AI Token · 100% 官方真實盤口)
    try {
      const qRes = await fetch(`/api/market/query-quote?symbol=${encodeURIComponent(sym)}`);
      const qJson = await qRes.json();
      if (qRes.ok && qJson.success && qJson.data) {
        const d = qJson.data;
        const parsedPrice = Number(d.closePrice);
        const parsedPrevClose = Number(d.prevClosePrice) || parsedPrice;
        const parsedLimitUp = Number(d.limitUpPrice) || Number((parsedPrevClose * 1.10).toFixed(2));
        const parsedLimitDown = Number(d.limitDownPrice) || Number((parsedPrevClose * 0.90).toFixed(2));

        let cat: AssetCategory = 'stocks';
        if (['CL', 'BZ', 'NG', 'RB', 'GC', 'SI', 'PL', 'PA', 'ZS', 'ZC', 'ZW', 'ZL', 'ZM', 'KC', 'SB', 'CC', 'OJ', 'CT', 'HG', 'ALI', 'NI', 'ZN', 'LE', 'HE', 'GF'].includes(sym)) {
          cat = 'commodities';
        } else if (['NVDA', 'AAPL', 'TSLA', 'TSM', 'MSFT', 'GOOGL', 'AMZN', 'QQQ', 'SPY', 'SOXX', 'META', 'NFLX', 'AMD', 'INTC', 'PLTR', 'BABA', 'COIN', 'YAHOO', 'YHOO'].includes(sym)) {
          cat = 'us_stocks';
        } else if (sym.startsWith('00') && sym.endsWith('B')) {
          cat = 'bonds';
        } else if (sym.startsWith('00')) {
          cat = 'etfs';
        } else if (sym.includes('TX') || sym.includes('MTX') || sym.includes('TMF') || sym.endsWith('F')) {
          cat = 'futures';
        }

        const newInst: InstrumentSpec = {
          symbol: d.symbol || sym,
          name: d.name || sym,
          category: cat,
          price: parsedPrice,
          prevClose: parsedPrevClose,
          open: d.openPrice,
          high: d.highPrice,
          low: d.lowPrice,
          avgPrice: d.avgPrice,
          turnover: d.turnover,
          fiveBids: d.fiveBids,
          fiveAsks: d.fiveAsks,
          limitUpPrice: parsedLimitUp,
          limitDownPrice: parsedLimitDown,
          isLimitUp: parsedPrice >= parsedLimitUp,
          isLimitDown: parsedPrice <= parsedLimitDown,
          change: Number(d.change) || Number((parsedPrice - parsedPrevClose).toFixed(2)),
          changePercent: Number(d.changePercent) || 0,
          volume: Number(d.volume) || 10000,
          unitLabel: d.unitDescription || (cat === 'futures' || cat === 'commodities' ? '口' : cat === 'us_stocks' ? '股' : '張 (1,000股)'),
          multiplier: Number(d.contractMultiplier) || (cat === 'futures' ? 200 : cat === 'commodities' ? 100 : cat === 'us_stocks' ? 32 : 1000),
          marginRequirement: Number(d.marginRequirement) || 0,
          description: `【官方真實行情 · 0 AI Token】${d.name || sym}，當下成交價 NT$ ${parsedPrice}，昨收 NT$ ${parsedPrevClose}，漲停價 NT$ ${parsedLimitUp}。`,
          klineHistory: [],
        };

        if (onAddCustomInstrument) {
          onAddCustomInstrument(newInst);
        }
        onSelectInstrument(newInst);
        setCustomPrice(newInst.price);
        setUseCustomPrice(false);
        setDirectFetchMsg(`✅ 已成功載入真實市場行情「${newInst.name} (${newInst.symbol})」，當下成交價 NT$ ${newInst.price} (昨收 NT$ ${newInst.prevClose}) [0 AI Token 消耗]`);
        setStep('order_form');
        setSearchQuery('');
        setDirectSymbolInput('');
        return;
      }
    } catch (e) {
      console.warn('Query quote failed, attempting assistant fallback:', e);
    }

    try {
      let targetCat: AssetCategory = 'stocks';
      if (sym.startsWith('00') && sym.endsWith('B')) targetCat = 'bonds';
      else if (sym.startsWith('00')) targetCat = 'etfs';
      else if (sym.includes('TX') || sym.includes('MTX') || sym.includes('TMF') || sym.includes('期')) targetCat = 'futures';
      else if (sym.includes('TXO') || sym.endsWith('-C') || sym.endsWith('-P')) targetCat = 'options';

      const res = await fetch('/api/gemini/quote-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: sym,
          category: targetCat,
          benchmarkDate: '2026-09-21',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        const failMsg = json.message || `官方資料庫查無「${sym}」，請確認標的代號是否正確。系統已停用 AI 模擬假數據以確保資料真實性。`;
        setDirectFetchMsg(`❌ ${failMsg}`);
        return;
      }
      const d = json.data;
      const parsedPrice = Number(d.closePrice);
      if (!parsedPrice || isNaN(parsedPrice) || parsedPrice <= 0) {
        setDirectFetchMsg(`❌ 查無「${sym}」有效盤中成交價。系統已停用 AI 模擬假數據。`);
        return;
      }
      const parsedPrevClose = Number(d.prevClosePrice) || Number(d.openPrice) || parsedPrice;
      const parsedLimitUp = Number(d.limitUpPrice) || Number((parsedPrevClose * 1.10).toFixed(2));
      const parsedLimitDown = Number(d.limitDownPrice) || Number((parsedPrevClose * 0.90).toFixed(2));

      const newInst: InstrumentSpec = {
        symbol: d.symbol || sym,
        name: d.name || `${sym}`,
        category: (d.category as AssetCategory) || targetCat,
        price: parsedPrice,
        prevClose: parsedPrevClose,
        limitUpPrice: parsedLimitUp,
        limitDownPrice: parsedLimitDown,
        isLimitUp: d.isLimitUp || parsedPrice >= parsedLimitUp,
        isLimitDown: d.isLimitDown || parsedPrice <= parsedLimitDown,
        change: Number(d.change) || Number((parsedPrice - parsedPrevClose).toFixed(2)),
        changePercent: Number(d.changePercent) || 0,
        volume: Number(d.volume) || 10000,
        unitLabel: d.unitDescription || (targetCat === 'futures' ? '口' : '張 (1,000單位)'),
        multiplier: Number(d.contractMultiplier) || (targetCat === 'futures' ? 200 : 1000),
        marginRequirement: Number(d.marginRequirement) || 0,
        strikePrice: d.strikePrice ? Number(d.strikePrice) : undefined,
        expiryDate: d.expiryDate || '2026-10-21',
        description: `【官方真實行情】${d.name || sym}，當下成交價 NT$ ${parsedPrice}，昨收 NT$ ${parsedPrevClose}，漲停價 NT$ ${parsedLimitUp}。`,
        klineHistory: Array.isArray(d.klineHistory) ? d.klineHistory : [],
      };

      if (onAddCustomInstrument) {
        onAddCustomInstrument(newInst);
      }
      onSelectInstrument(newInst);
      setCustomPrice(newInst.price);
      setUseCustomPrice(false);
      setDirectFetchMsg(`已成功載入真實報價「${newInst.name} (${newInst.symbol})」，當下成交價 NT$ ${newInst.price}！(昨收 NT$ ${newInst.prevClose})`);
      setStep('order_form');
      setSearchQuery('');
      setDirectSymbolInput('');
    } catch (e: any) {
      console.warn('Direct fetch quote error:', e);
      setDirectFetchMsg(`❌ 查無「${sym}」或連線異常：${e.message || '資料庫無此標的'}。嚴禁以 AI 虛擬假數據。`);
    } finally {
      setIsDirectFetching(false);
    }
  };

  const openCustomSymbolModal = (tab?: MainCategoryTab, initialSymbol?: string) => {
    const targetTab = tab || activeCategoryTab;
    let initialCat: AssetCategory = 'stocks';
    if (targetTab === 'stocks') initialCat = 'stocks';
    else if (targetTab === 'bonds') initialCat = 'bonds';
    else if (targetTab === 'etfs') initialCat = 'etfs';
    else if (targetTab === 'futures') initialCat = 'futures';
    else initialCat = 'options';

    const rawSym = (initialSymbol || searchQuery).trim().toUpperCase();
    if (rawSym.startsWith('00') && !rawSym.endsWith('B')) initialCat = 'etfs';
    else if (rawSym.startsWith('00') && rawSym.endsWith('B')) initialCat = 'bonds';

    setCustomCategory(initialCat);
    updateDefaultsForCategory(initialCat);
    setCustomSymbol(rawSym);
    setCustomName('');
    setCustomPriceInput('');
    setCustomStrike('');
    setAiMsg(null);
    setIsCustomModalOpen(true);

    if (rawSym) {
      // Auto fetch price immediately so user doesn't face blank price
      setTimeout(() => {
        handleFetchAiQuoteForSymbol(rawSym, initialCat);
      }, 50);
    }
  };

  const handleSelectCustomCategory = (cat: AssetCategory) => {
    setCustomCategory(cat);
    updateDefaultsForCategory(cat);
  };

  const handleSelectSuggestion = (sug: CustomSuggestion) => {
    setCustomSymbol(sug.symbol);
    setCustomName(sug.name);
    setCustomPriceInput(String(sug.price));
    setCustomCategory(sug.category);
    setCustomMultiplier(sug.multiplier);
    setCustomUnitLabel(sug.unitLabel);
    setCustomMargin(sug.margin || 0);
    if (sug.strikePrice) setCustomStrike(String(sug.strikePrice));
    setAiMsg(null);
  };

  const handleFetchAiQuoteForSymbol = async (symToFetch: string, catToUse: AssetCategory) => {
    if (!symToFetch.trim()) return;
    setIsAiFetching(true);
    setAiMsg(null);
    try {
      const res = await fetch('/api/gemini/quote-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: symToFetch.trim(),
          category: catToUse,
          benchmarkDate: '2026-09-21',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || '查詢失敗');
      }
      const d = json.data;
      if (d.name) setCustomName(d.name);
      if (d.closePrice) setCustomPriceInput(String(d.closePrice));
      if (d.category) setCustomCategory(d.category as AssetCategory);
      if (d.contractMultiplier) setCustomMultiplier(Number(d.contractMultiplier));
      if (d.unitDescription) setCustomUnitLabel(d.unitDescription);
      if (d.marginRequirement !== undefined) setCustomMargin(Number(d.marginRequirement));
      if (d.strikePrice) setCustomStrike(String(d.strikePrice));
      setAiMsg({ type: 'success', text: `已成功取得當下最新成交價 NT$ ${d.closePrice} (昨收 NT$ ${d.prevClosePrice || d.closePrice}) 與合約規格！` });
    } catch (e: any) {
      console.warn('AI quote fetch error:', e);
      setAiMsg({ type: 'error', text: '智能查詢連線異常，您仍可直接手動輸入價格並完成指定！' });
    } finally {
      setIsAiFetching(false);
    }
  };

  const handleFetchAiQuote = async () => {
    if (!customSymbol.trim()) {
      setAiMsg({ type: 'error', text: '請先輸入欲查詢的商品代號或中文名稱' });
      return;
    }
    await handleFetchAiQuoteForSymbol(customSymbol, customCategory);
  };

  const handleConfirmCustomInstrument = () => {
    if (!customSymbol.trim()) return;
    const sym = customSymbol.trim().toUpperCase();
    const name = customName.trim() || sym;
    const price = Number(customPriceInput) > 0 ? Number(customPriceInput) : 100;
    const mult = Number(customMultiplier) > 0 ? Number(customMultiplier) : 1000;
    const margin = Number(customMargin) || 0;
    const strike = customStrike ? Number(customStrike) : undefined;

    const newInst: InstrumentSpec = {
      symbol: sym,
      name,
      category: customCategory,
      price,
      prevClose: price,
      change: 0,
      changePercent: 0,
      volume: 18500,
      unitLabel: customUnitLabel || (customCategory === 'futures' ? '口' : '張 (1,000股)'),
      multiplier: mult,
      marginRequirement: margin,
      strikePrice: strike,
      expiryDate: customExpiry || '2026-10-21',
      description: `【自訂指定標的】${name} (${sym})，21號收盤基準價 NT$ ${price}`,
      klineHistory: [],
    };

    if (onAddCustomInstrument) {
      onAddCustomInstrument(newInst);
    }
    onSelectInstrument(newInst);
    setIsCustomModalOpen(false);
    setSearchQuery('');
    setStep('order_form');
  };

  const handleSelectOptionStrike = (strikeRow: StrikeRow, type: 'Call' | 'Put') => {
    const isCall = type === 'Call';
    const sym = `TXO-${strikeRow.strike}-${isCall ? 'C' : 'P'}`;
    const price = isCall ? strikeRow.callPrice : strikeRow.putPrice;
    const name = `台指${isCall ? '買權' : '賣權'} ${strikeRow.strike}-${isCall ? 'Call' : 'Put'}`;
    const optionInst: InstrumentSpec = {
      symbol: sym,
      name,
      category: 'options',
      price,
      prevClose: price - (isCall ? strikeRow.callChange : strikeRow.putChange),
      change: isCall ? strikeRow.callChange : strikeRow.putChange,
      changePercent: Number((((isCall ? strikeRow.callChange : strikeRow.putChange) / (price || 1)) * 100).toFixed(2)),
      volume: isCall ? strikeRow.callOi * 20 : strikeRow.putOi * 20,
      unitLabel: '口 (1點=50元)',
      multiplier: 50,
      marginRequirement: 0,
      strikePrice: strikeRow.strike,
      expiryDate: '2026-10-21',
      description: `${optionsContract} 履約價 ${strikeRow.strike.toLocaleString()} 點 ${isCall ? '買權 Call' : '賣權 Put'}，成交價 ${price} 點`,
      klineHistory: [],
    };

    if (onAddCustomInstrument) {
      onAddCustomInstrument(optionInst);
    }
    onSelectInstrument(optionInst);
    setOrderAction(isCall ? 'BUY_CALL_OPTION' : 'BUY_PUT_OPTION');
    setIsOptionsBoardOpen(false);
    setActiveCategoryTab('options_warrants');
    setStep('order_form');
  };

  const handleSelectCategory = (catId: MainCategoryTab) => {
    setActiveCategoryTab(catId);
    setSearchQuery('');
    const categoryInsts = getFilteredInstruments(catId);
    if (categoryInsts.length > 0) {
      onSelectInstrument(categoryInsts[0]);
    }
    setStep('order_form');
  };

  const handleQuickQty = (amount: number) => {
    setQuantity(Math.max(1, amount));
  };

  const handleMaxAffordable = (pct: number) => {
    const targetFund = availableCash * (pct / 100);
    let singleCost = 0;
    if (selectedInstrument.category === 'futures') {
      singleCost =
        selectedInstrument.marginRequirement || (currentPrice * multiplier * 0.135);
    } else if (orderAction === 'BUY_MARGIN_STOCK') {
      singleCost = currentPrice * multiplier * 0.4;
    } else if (orderAction === 'SHORT_SELL_STOCK' || orderAction === 'SHORT_SELL_ETF') {
      singleCost = currentPrice * multiplier * 0.9;
    } else if (orderAction === 'SELL_CALL_OPTION' || orderAction === 'SELL_PUT_OPTION') {
      singleCost = selectedInstrument.marginRequirement || 65000;
    } else {
      singleCost = currentPrice * multiplier;
    }

    if (singleCost > 0) {
      const maxUnits = Math.max(1, Math.floor(targetFund / singleCost));
      setQuantity(maxUnits);
    }
  };

  const handleQuickRationale = (type: 'macro' | 'hedge' | 'growth') => {
    if (type === 'macro') {
      setRationale(
        `【總經策略】看好全球降息循環與台灣半導體景氣燈號續揚，依據 21 號收盤價建立 ${selectedInstrument.name} 核心部位，掌握資金行情。`
      );
    } else if (type === 'hedge') {
      setRationale(
        `【避險對沖】大盤處於高檔震盪區間，建立 ${selectedInstrument.name} 反向/避險部位以對沖 5000 萬投資組合系統性黑天鵝風險。`
      );
    } else {
      setRationale(
        `【產業攻擊】AI 算力擴張與高毛利族群訂單能見度直達明年，利用 ${selectedInstrument.name} 槓桿特性擴大上檔暴擊獲利。`
      );
    }
  };

  const handleSelectAlternativeFromModal = (targetInst: InstrumentSpec, action: OrderAction) => {
    setShowLimitUpAlternatives(false);
    onSelectInstrument(targetInst);
    setOrderAction(action);
  };

  const handleProceedQueuedFromModal = () => {
    setShowLimitUpAlternatives(false);
    onExecuteTrade({
      symbol: selectedInstrument.symbol,
      name: selectedInstrument.name,
      category: selectedInstrument.category,
      action: orderAction,
      price: currentPrice,
      quantity,
      unitMultiplier: multiplier,
      totalAmountOrMargin: totalCostOrMargin,
      notionalValue,
      rationale: rationale.trim() || `以漲停排隊價 NT$ ${currentPrice} 建立 ${quantity} 單位部位。`,
    });
    setOrderSuccessMsg(`排隊委託成功！已依漲停價 NT$ ${currentPrice} 排隊掛單 ${quantity} ${contractSpec.unitName}。`);
    setTimeout(() => {
      setOrderSuccessMsg(null);
      onClose();
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEnoughCash || quantity <= 0) return;

    // 沒有 FinMind 真實報價的商品不允許下單，避免用示範價格成交
    if (selectedInstrument.isMock) {
      setFairTradeWarning(`🚫 ${selectedInstrument.name}（${selectedInstrument.symbol}）目前查無 FinMind 真實報價，無法下單。`);
      return;
    }

    // 💡 設計方案 B：若現貨股票觸及漲停鎖死，市價買單無法成交，彈出【智慧金融教育引導：轉向衍生性商品】
    if ((orderAction === 'BUY_STOCK' || orderAction === 'BUY_MARGIN_STOCK') && isCurrentlyLimitUp) {
      setShowLimitUpAlternatives(true);
      return;
    }

    // Fair Trading Check:
    // Only block if the stock is actually limit-up (cannot buy below limit-up when limit-up)
    if (
      (orderAction === 'BUY_STOCK' || orderAction === 'BUY_MARGIN_STOCK' || orderAction === 'BUY_ETF') &&
      useCustomPrice &&
      customPrice < selectedInstrument.price &&
      isCurrentlyLimitUp
    ) {
      setFairTradeWarning(
        `🚫 盤中漲停公平撮合：該標的當前盤中處於漲停價 NT$ ${limitUpPrice}，禁止低於漲停價排單！委託價已自動校正為當前漲停價 NT$ ${limitUpPrice}。`
      );
      setCustomPrice(limitUpPrice);
      setUseCustomPrice(false);
      return;
    }

    setFairTradeWarning(null);

    onExecuteTrade({
      symbol: selectedInstrument.symbol,
      name: selectedInstrument.name,
      category: selectedInstrument.category,
      action: orderAction,
      price: currentPrice,
      quantity,
      unitMultiplier: multiplier,
      totalAmountOrMargin: totalCostOrMargin,
      notionalValue,
      rationale: rationale.trim() || `依據當下即時撮合價 ${currentPrice} 進行實戰下單作業。`,
    });

    setOrderSuccessMsg(
      isCurrentlyLimitUp
        ? `下單成功！已依漲停價 NT$ ${currentPrice} 委託建立 ${quantity} ${selectedInstrument.unitLabel} 之部位 (遵守公平撮合規則)。`
        : `下單成功！已成功建立 ${quantity} ${selectedInstrument.unitLabel} 之部位。`
    );
    setTimeout(() => {
      setOrderSuccessMsg(null);
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col sm:items-center sm:justify-center p-0 sm:p-3 overflow-hidden text-slate-900">
      <div className={`bg-white border-0 sm:border border-slate-300 sm:rounded-3xl w-full ${
        step === 'order_form' ? 'sm:max-w-6xl lg:max-w-7xl xl:max-w-[95vw]' : 'sm:max-w-5xl'
      } h-full sm:h-[94vh] shadow-2xl flex flex-col overflow-hidden`}>
        {/* Modal Top Header - Daytime High Contrast */}
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 px-4 sm:px-6 py-3.5 border-b border-amber-300 flex items-center justify-between shrink-0 gap-2 text-slate-950">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white text-slate-950 border border-amber-300 flex items-center justify-center text-lg sm:text-xl font-black shadow-sm shrink-0">
              🎲
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-950 truncate">
                  5,000 萬大富翁多空下單終端機
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-slate-950 text-amber-300 border border-slate-800 shrink-0">
                  {step === 'select_category' ? '步驟 1: 選擇 7 大資產類別' : '步驟 2: 自主建倉委託'}
                </span>
              </div>
              <p className="text-[11px] text-slate-900 font-semibold truncate">
                {selectedInstrument.isMock ? '⚠️ 尚未取得 FinMind 真實行情，暫停下單' : `FinMind 行情：${selectedInstrument.fetchTime || '資料時間不明'}`} · 涵蓋股票/債券/ETF/期貨/選擇權/美股/原物料
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-amber-300 text-xs font-mono font-black text-slate-950 shadow-2xs">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>可用現金: NT$ {Math.round(availableCash).toLocaleString()}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-950 transition border border-amber-300 cursor-pointer text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* STEP 1: 選擇 7 大資產類別導引卡片 (Select 7 Categories) */}
        {step === 'select_category' && (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1 touch-scroll overscroll-contain pb-28 sm:pb-8 bg-slate-50">
            {/* Top Switcher: 🔍 標的智能查詢 (最棒搜尋) vs 📂 7大資產類別瀏覽 */}
            <div className="flex items-center justify-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setCategorySelectMode('smart_search')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  categorySelectMode === 'smart_search'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-300'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-amber-600" />
                <span>🔍 標的智能查詢</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                  最棒搜尋
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCategorySelectMode('categories')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  categorySelectMode === 'categories'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-300'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <span>📂 7大資產類別瀏覽</span>
              </button>
            </div>

            {categorySelectMode === 'smart_search' ? (
              /* Embedded Smart Search Board - The ultimate stock & 7-derivative search */
              <div className="space-y-4">
                <SmartInstrumentSearchBoard
                  allInstruments={instrumentsList}
                  onSelectInstrumentToTrade={(inst, action) => {
                    onSelectInstrument(inst);
                    if (action) {
                      setOrderAction(action);
                    }
                    setActiveCategoryTab(getCategoryTabFromInstrument(inst));
                    setCustomPrice(inst.price);
                    setStep('order_form');
                  }}
                  onViewInstrumentKLine={inst => {
                    if (onViewInstrumentKLine) {
                      onViewInstrumentKLine(inst);
                    }
                  }}
                  onAddInstrument={onAddCustomInstrument}
                  currentProfile={currentProfile}
                  initialSymbol={selectedInstrument.symbol || '2317'}
                  isCollapsible={false}
                />

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setCategorySelectMode('categories')}
                    className="text-xs font-bold text-slate-600 hover:text-amber-800 underline cursor-pointer"
                  >
                    或切換至 📂 瀏覽 7 大資產類別卡片 (股票/債券/ETF/期貨/選擇權/美股/原物料) ➔
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center max-w-2xl mx-auto space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-950 text-xs font-black">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>實戰資產配置：七大資產類別全覆蓋 · 100% 官方真實行情</span>
                  </div>
                  <h2 className="text-lg sm:text-2xl font-black text-slate-950">
                    請選擇您要下單建倉的金融工具類別
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-700 font-semibold">
                    點選下列 7 大類別之一，直接載入該類別標的進入自主下單機：
                  </p>
                </div>

                {/* 7 Big Category Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 pt-1">
                  {CATEGORY_OPTIONS.map(cat => {
                    const categoryInsts = getFilteredInstruments(cat.id);
                    return (
                      <div
                        key={cat.id}
                        onClick={() => handleSelectCategory(cat.id)}
                        className={`group relative p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 transition duration-200 cursor-pointer flex flex-col justify-between bg-white border-slate-200 hover:border-amber-500 hover:shadow-lg hover:bg-amber-50/40`}
                      >
                        <div>
                          {/* Top Category Badge */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-950 font-black text-xs flex items-center justify-center border border-slate-300">
                                {cat.number}
                              </span>
                              <span className="text-2xl">{cat.iconEmoji}</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-950 border border-amber-300">
                              {cat.badge}
                            </span>
                          </div>

                          {/* Title & Subtitle */}
                          <div className="space-y-0.5 mb-2">
                            <h3 className="text-base sm:text-lg font-black text-slate-950 group-hover:text-amber-800 transition">
                              {cat.name}
                            </h3>
                            <p className="text-xs font-bold text-slate-600">
                              {cat.subTitle}
                            </p>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-slate-700 leading-relaxed mb-3 font-semibold">
                            {cat.description}
                          </p>

                          {/* Samples Chips */}
                          <div className="pt-2 border-t border-slate-200">
                            <span className="text-[10px] text-slate-500 font-bold block mb-1">
                              真實行情包含：
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {categoryInsts.slice(0, 4).map(inst => (
                                <span
                                  key={inst.symbol}
                                  className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-800 flex items-center gap-1 font-bold"
                                >
                                  <span className="font-black text-amber-800">{inst.symbol}</span>
                                  <span className="truncate max-w-[70px] sm:max-w-none">{inst.name}</span>
                                  <span className="text-slate-500 ml-0.5">
                                    NT${inst.price >= 1000 ? inst.price.toLocaleString() : inst.price}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Action button */}
                        <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-600 font-bold group-hover:text-amber-800 transition">
                            支援自訂指定任意代號 ➔
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                openCustomSymbolModal(cat.id);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-slate-800 hover:text-amber-950 font-bold text-xs border border-slate-300 transition shadow-2xs"
                            >
                              ➕ 指定代號
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-sm group-hover:bg-amber-400 transition"
                            >
                              進入下單
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Helper Banner */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-700 font-semibold shadow-sm">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-cyan-700 shrink-0" />
                    <span>
                      點選任一類別即可進入實戰終端機進行現股買進、融券放空、期貨多空或選擇權避險。
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectCategory('stocks')}
                    className="text-amber-800 hover:text-amber-950 font-black underline shrink-0 cursor-pointer self-end sm:self-auto"
                  >
                    直接進入預設下單機 ➔
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 2: 下單表單 (Order Form - Professional Dual-Column Workstation) */}
        {step === 'order_form' && (
          <div className="flex flex-col flex-1 overflow-hidden min-h-0 bg-slate-100">
            {/* Mobile & Desktop Quick Action Jump Bar */}
            <div className="bg-slate-900 text-white px-3 sm:px-4 py-2 border-b border-slate-800 shrink-0 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar touch-pan-x">
              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                <button
                  type="button"
                  onClick={scrollToOrder}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black cursor-pointer shadow-xs flex items-center gap-1.5 shrink-0 transition active:scale-95"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-slate-950" />
                  <span>📝 核心下單匣</span>
                </button>
                <span className="text-slate-600">|</span>
                <span className="text-[11px] text-slate-400 font-bold shrink-0 hidden sm:inline">直達下方輔助工具：</span>
                <button
                  type="button"
                  onClick={() => scrollToTools('kline')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1 active:scale-95 ${
                    activeToolTab === 'kline'
                      ? 'bg-slate-700 text-amber-300 border border-amber-400/40 shadow-2xs'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>📈 即時K線</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTools('smart_search')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1 active:scale-95 ${
                    activeToolTab === 'smart_search'
                      ? 'bg-slate-700 text-amber-300 border border-amber-400/40 shadow-2xs'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>🔍 標的查詢</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTools('my_positions')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1 active:scale-95 ${
                    activeToolTab === 'my_positions'
                      ? 'bg-slate-700 text-amber-300 border border-amber-400/40 shadow-2xs'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>💼 持倉狀況</span>
                  {totalHeldQty > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black">
                      {totalHeldQty}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTools('commodities')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1 active:scale-95 ${
                    activeToolTab === 'commodities'
                      ? 'bg-slate-700 text-amber-300 border border-amber-400/40 shadow-2xs'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>🌍 6大原物料</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTools('stockq')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1 active:scale-95 ${
                    activeToolTab === 'stockq'
                      ? 'bg-slate-700 text-amber-300 border border-amber-400/40 shadow-2xs'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>🌐 StockQ</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToTools('options_t_quote')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition shrink-0 flex items-center gap-1 active:scale-95 ${
                    activeToolTab === 'options_t_quote'
                      ? 'bg-slate-700 text-amber-300 border border-amber-400/40 shadow-2xs'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>📊 T字報價</span>
                </button>
              </div>

              <div className="shrink-0 ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollToTools()}
                  className="text-xs text-amber-400 hover:text-amber-300 font-bold underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>直達下方工具 ▾</span>
                </button>
              </div>
            </div>

            {/* Main Workstation Scrollable Flow (Top: Order Ticket, Bottom: Tools) */}
            <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-4 touch-scroll overscroll-contain min-h-0 bg-slate-100">
              {/* ─── TOP SECTION: 下單操作匣 (Order Form Ticket - Full Width) ─── */}
              <div
                ref={orderTicketRef}
                className="bg-slate-50 border border-slate-200 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm space-y-3.5"
              >
                {/* Current Instrument Focus Indicator Banner in Order Ticket */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-3 rounded-2xl flex items-center justify-between gap-2 shadow-sm shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shrink-0">
                      🎯
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-amber-400 font-black text-sm">{selectedInstrument.symbol}</span>
                        <h4 className="font-black text-sm text-white truncate">{selectedInstrument.name}</h4>
                        <span className="text-[10px] px-2 py-0.2 rounded-full font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                          {selectedInstrument.category === 'stocks'
                            ? '股票現貨'
                            : selectedInstrument.category === 'futures'
                            ? '期貨合約'
                            : selectedInstrument.category === 'options'
                            ? '選擇權'
                            : selectedInstrument.category === 'warrants'
                            ? '權證'
                            : selectedInstrument.category === 'bonds'
                            ? '債券'
                            : selectedInstrument.category === 'us_stocks'
                            ? '美股複委託'
                            : selectedInstrument.category === 'commodities'
                            ? '大宗原物料'
                            : 'ETF'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-300 font-mono">
                        最新成交: NT$ {selectedInstrument.price.toLocaleString()} ({selectedInstrument.change >= 0 ? '+' : ''}{selectedInstrument.change}) · 1{selectedInstrument.unitLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('select_category');
                        setCategorySelectMode('smart_search');
                      }}
                      className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow-2xs transition flex items-center gap-1"
                      title="展開完整全螢幕標的智能查詢"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">全屏查詢</span>
                    </button>
                  </div>
                </div>

            {/* 1. Category Switcher Tabs */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    切換 7 大金融商品類別：
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('select_category');
                      setCategorySelectMode('categories');
                    }}
                    className="text-[11px] text-amber-800 hover:text-amber-950 underline font-bold cursor-pointer"
                  >
                    [返回大卡片]
                  </button>
                </div>
                <span className="text-[11px] text-slate-600 font-mono font-bold">
                  可用現金: NT$ {Math.round(availableCash).toLocaleString()}
                </span>
              </div>

              {/* 7 Prominent Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-1 text-xs whitespace-nowrap">
                {CATEGORY_OPTIONS.map(cat => {
                  const isActive = activeCategoryTab === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`shrink-0 py-2 px-3 rounded-xl text-center font-black transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200'
                      }`}
                    >
                      <span>{cat.iconEmoji}</span>
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Instrument Selection & Custom Specification Bar */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-800 font-black shrink-0 flex items-center gap-1">
                      <span>標的選擇：</span>
                      <span className="text-[10px] text-slate-500 font-semibold font-mono">
                        ({getFilteredInstruments(activeCategoryTab).length} 檔)
                      </span>
                    </span>

                    {/* Quick Search & Filter Input */}
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const matched = getFilteredInstruments(activeCategoryTab);
                            if (matched.length === 1) {
                              onSelectInstrument(matched[0]);
                            } else if (searchQuery.trim()) {
                              fetchAndApplySymbol(searchQuery.trim());
                            }
                          }
                        }}
                        placeholder="🔍 輸入代號 (如 00981A, 2382)... 按 Enter 抓取"
                        className="pl-8 pr-7 py-1 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white w-52 sm:w-64 font-medium transition"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2 text-slate-400 hover:text-slate-700 text-xs font-bold p-0.5"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Prominent Action Buttons: Specify Any Custom Symbol & Options T-Quote */}
                  <div className="flex items-center gap-2 shrink-0">
                    {activeCategoryTab === 'options_warrants' && (
                      <button
                        type="button"
                        onClick={() => setIsOptionsBoardOpen(true)}
                        className="px-2.5 py-1 rounded-xl text-xs font-black bg-purple-100 hover:bg-purple-200 text-purple-950 border border-purple-300 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <span>📊</span>
                        <span>台指選擇權 T字報價表</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openCustomSymbolModal(activeCategoryTab)}
                      className="px-3 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 border border-amber-500 transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>指定自訂股票代號</span>
                    </button>
                  </div>
                </div>

                {/* Direct fetch warning or success banner */}
                {directFetchMsg && (
                  <div className={`text-xs font-bold px-3 py-2 rounded-xl border flex items-center justify-between gap-1.5 shrink-0 ${
                    directFetchMsg.startsWith('❌')
                      ? 'text-rose-950 bg-rose-50 border-rose-300'
                      : 'text-emerald-950 bg-emerald-50 border-emerald-300'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      {directFetchMsg.startsWith('❌') ? (
                        <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      )}
                      <span>{directFetchMsg}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDirectFetchMsg(null)}
                      className="text-slate-400 hover:text-slate-700 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Horizontal Instrument Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-1 pt-0.5 whitespace-nowrap">
                  {getFilteredInstruments(activeCategoryTab).map(inst => {
                    const isSel = selectedInstrument.symbol === inst.symbol;
                    const isCustom = inst.description?.includes('自訂');
                    return (
                      <button
                        key={inst.symbol}
                        type="button"
                        onClick={() => onSelectInstrument(inst)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                          isSel
                            ? 'bg-slate-950 text-white border-slate-950 shadow-sm ring-2 ring-amber-400'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        <span className="font-mono text-amber-500 font-black">{inst.symbol}</span>
                        <span>{inst.name}</span>
                        <span className="text-[11px] font-mono text-slate-500 ml-0.5">
                          NT${inst.price >= 1000 ? inst.price.toLocaleString() : inst.price}
                        </span>
                        {isCustom && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-amber-400 text-slate-950 border border-amber-500">
                            自訂
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* If user typed a search query that isn't matched, show 1-click fetch button */}
                  {searchQuery.trim() && !getFilteredInstruments(activeCategoryTab).some(i => i.symbol.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => fetchAndApplySymbol(searchQuery.trim())}
                      className="px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 border border-amber-500 flex items-center gap-1.5 cursor-pointer transition shrink-0 shadow-sm"
                    >
                      {isDirectFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-900" />}
                      <span>⚡ 立即抓取「{searchQuery.trim().toUpperCase()}」當下價格並載入 ➔</span>
                    </button>
                  )}

                  {/* Inline quick specify button */}
                  <button
                    type="button"
                    onClick={() => openCustomSymbolModal(activeCategoryTab)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-dashed border-slate-300 flex items-center gap-1 cursor-pointer transition shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>指定更多代號...</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Direct Code Input Bar */}
            <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100 border border-amber-300 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
                  ⚡
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-slate-950">
                      快速指定股票代號 · 抓取當下即時價：
                    </span>
                    <span className="text-[10px] text-amber-950 font-bold bg-amber-200 px-1.5 py-0.2 rounded border border-amber-300">
                      支援 00981A、台股全商品
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      type="text"
                      value={directSymbolInput}
                      onChange={e => setDirectSymbolInput(e.target.value.toUpperCase())}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          fetchAndApplySymbol(directSymbolInput);
                        }
                      }}
                      placeholder="輸入 00981A, 2382, MTX, 00919..."
                      className="px-2.5 py-1.5 text-xs bg-white border-2 border-amber-400 rounded-xl text-slate-950 font-mono font-black uppercase focus:outline-none focus:border-amber-600 w-44 sm:w-56 shadow-inner placeholder:font-normal"
                    />
                    <button
                      type="button"
                      onClick={() => fetchAndApplySymbol(directSymbolInput)}
                      disabled={isDirectFetching || !directSymbolInput.trim()}
                      className="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-950 hover:bg-slate-800 text-amber-300 flex items-center gap-1.5 cursor-pointer transition shadow-xs disabled:opacity-50"
                    >
                      {isDirectFetching ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>抓取當下價格並載入</span>
                    </button>
                  </div>
                </div>
              </div>

              {directFetchMsg && (
                <div className="text-xs font-bold text-emerald-950 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{directFetchMsg}</span>
                </div>
              )}
            </div>

            {/* 💡 設計方案 B：現貨漲停鎖死買不到引導橫幅 */}
            {isCurrentlyLimitUp && (
              <div className="bg-amber-500/10 border-2 border-amber-500/60 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shrink-0">
                    💡
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-amber-900 flex items-center gap-1.5">
                      <span>現貨漲停鎖死買不到？</span>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                        法人 3 種替代實戰策略
                      </span>
                    </h4>
                    <p className="text-[11px] text-amber-800 font-medium">
                      該標的已達漲停價 NT$ {limitUpPrice}。可切換至【個股期貨】、【認購權證】或【權重 ETF】參與行情！
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLimitUpAlternatives(true)}
                  className="py-1.5 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-1 shadow-xs transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>展開替代方案 ➔</span>
                </button>
              </div>
            )}

            {/* Dual-Mode Form: Pro Quick Order Layer + Student Detailed Calculation Layer */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* ─────────────────────────────────────────────────────────────
                  【第一層：老手極速下單區】（三竹／元大券商慣用直覺介面）
                 ───────────────────────────────────────────────────────────── */}
              <div className="bg-white border-2 border-slate-200 rounded-3xl p-4 sm:p-5 space-y-4 shadow-sm">
                {/* 1. 操作類別切換按鈕列 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>委託類別：</span>
                    </label>
                    <span className="text-[11px] font-bold text-slate-500">
                      當前標的：{selectedInstrument.name} ({selectedInstrument.symbol})
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedInstrument.category === 'stocks' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_STOCK')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_STOCK'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📈 現股買進 (多)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('SHORT_SELL_STOCK')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'SHORT_SELL_STOCK'
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📉 融券賣出 (放空避險)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_MARGIN_STOCK')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_MARGIN_STOCK'
                              ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>⚡ 融資買進 (2.5x槓桿)</span>
                        </button>
                      </>
                    )}

                    {selectedInstrument.category === 'futures' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_FUTURES_LONG')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_FUTURES_LONG'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📈 期貨多單 (做多買進)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('SELL_FUTURES_SHORT')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'SELL_FUTURES_SHORT'
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📉 期貨空單 (放空避險)</span>
                        </button>
                      </>
                    )}

                    {selectedInstrument.category === 'options' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_CALL_OPTION')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_CALL_OPTION'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>🎯 買進買權 (Buy Call)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_PUT_OPTION')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_PUT_OPTION'
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>🛡️ 買進賣權 (Buy Put 避險)</span>
                        </button>
                      </>
                    )}

                    {(selectedInstrument.category === 'bonds' || selectedInstrument.category === 'etfs') && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOrderAction(selectedInstrument.category === 'bonds' ? 'BUY_BOND' : 'BUY_ETF')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_ETF' || orderAction === 'BUY_BOND'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📈 現金買進持有</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('SHORT_SELL_ETF')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'SHORT_SELL_ETF'
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📉 融券放空避險</span>
                        </button>
                      </>
                    )}

                    {selectedInstrument.category === 'warrants' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_CALL_WARRANT')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_CALL_WARRANT'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📈 買進認購權證</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_PUT_WARRANT')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_PUT_WARRANT'
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>🛡️ 買進認售權證 (看空避險)</span>
                        </button>
                      </>
                    )}

                    {selectedInstrument.category === 'crypto' && (
                      <>
                        {selectedInstrument.symbol === 'TWDT' || selectedInstrument.symbol === 'TWDC' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setOrderAction('BUY_TW_STABLECOIN')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                                orderAction === 'BUY_TW_STABLECOIN'
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                              }`}
                            >
                              <span>🇹🇼 申購新台幣穩定幣 (100% 銀行信託)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderAction('SELL_TW_STABLECOIN')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                                orderAction === 'SELL_TW_STABLECOIN'
                                  ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                              }`}
                            >
                              <span>🔄 贖回新台幣現金 (1:1 零匯差)</span>
                            </button>
                          </>
                        ) : selectedInstrument.symbol === 'USDT' || selectedInstrument.symbol === 'USDC' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setOrderAction('BUY_STABLECOIN')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                                orderAction === 'BUY_STABLECOIN'
                                  ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                              }`}
                            >
                              <span>💵 買進全球美元穩定幣 (Park USD)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderAction('SELL_STABLECOIN')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                                orderAction === 'SELL_STABLECOIN'
                                  ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                              }`}
                            >
                              <span>🔄 結算贖回換回台幣 (Redeem)</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setOrderAction('BUY_CRYPTO')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                                orderAction === 'BUY_CRYPTO'
                                  ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                              }`}
                            >
                              <span>🚀 買進做多現貨 (Buy Long)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderAction('SHORT_SELL_CRYPTO')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                                orderAction === 'SHORT_SELL_CRYPTO'
                                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                              }`}
                            >
                              <span>📉 融券放空避險 (Sell Short)</span>
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {selectedInstrument.category === 'commodities' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOrderAction('BUY_COMMODITY_LONG')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'BUY_COMMODITY_LONG'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📈 原物料多單 (做多)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderAction('SELL_COMMODITY_SHORT')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                            orderAction === 'SELL_COMMODITY_SHORT'
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                          }`}
                        >
                          <span>📉 原物料空單 (放空)</span>
                        </button>
                      </>
                    )}

                    {selectedInstrument.category === 'us_stocks' && (
                      <button
                        type="button"
                        onClick={() => setOrderAction('BUY_US_STOCK')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border flex items-center gap-1 ${
                          orderAction === 'BUY_US_STOCK'
                            ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300'
                        }`}
                      >
                        <span>🇺🇸 美股複委託買進 (現貨)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. 即時報價與快速填價列 */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>公平撮合行情 (點擊價位可快速帶入)：</span>
                      </span>
                      {isCurrentlyLimitUp && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-rose-600 text-white">
                          🔴 盤中漲停
                        </span>
                      )}
                      {isCurrentlyLimitDown && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-emerald-700 text-white">
                          🟢 盤中跌停
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold font-mono">
                      {selectedInstrument.category === 'commodities'
                        ? 'CME / NYMEX 國際原物料連續撮合 (無漲跌停限制)'
                        : selectedInstrument.category === 'us_stocks'
                        ? '美股市場無漲跌停限制 (熔斷機制)'
                        : '台股真實 ±10% 價格限制'}
                    </span>
                  </div>

                  {/* 4 快捷價位卡 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPrice(prevClose);
                        setUseCustomPrice(true);
                      }}
                      className="bg-white hover:bg-slate-100 border border-slate-200 rounded-xl p-2 text-center transition cursor-pointer shadow-2xs"
                      title="點擊帶入昨收價"
                    >
                      <span className="text-[10px] text-slate-500 font-bold block">昨收基準</span>
                      <span className="font-mono font-black text-slate-700 text-xs sm:text-sm">
                        {selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? 'US$ ' : 'NT$ '}
                        {prevClose >= 1000 ? prevClose.toLocaleString() : prevClose}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomPrice(selectedInstrument.price);
                        setUseCustomPrice(false);
                      }}
                      className="bg-amber-50 hover:bg-amber-100 border-2 border-amber-400 rounded-xl p-2 text-center transition cursor-pointer shadow-xs"
                      title="點擊帶入當前撮合價"
                    >
                      <span className="text-[10px] text-amber-900 font-black block">當下成交價 (推薦)</span>
                      <span className="font-mono font-black text-amber-950 text-xs sm:text-sm">
                        {selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? 'US$ ' : 'NT$ '}
                        {selectedInstrument.price >= 1000 ? selectedInstrument.price.toLocaleString() : selectedInstrument.price}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const targetP = (selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks')
                          ? Number((prevClose * 1.05).toFixed(2))
                          : limitUpPrice;
                        setCustomPrice(targetP);
                        setUseCustomPrice(true);
                      }}
                      className="bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl p-2 text-center transition cursor-pointer shadow-2xs"
                      title={selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? '點擊帶入參考高檔 (+5%)' : '點擊帶入漲停價'}
                    >
                      <span className="text-[10px] text-rose-800 font-black block">
                        {selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? '參考高檔 (+5%)' : '漲停價 (+10%)'}
                      </span>
                      <span className="font-mono font-black text-rose-700 text-xs sm:text-sm">
                        {selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? 'US$ ' : 'NT$ '}
                        {(selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks')
                          ? Number((prevClose * 1.05).toFixed(2))
                          : (limitUpPrice >= 1000 ? limitUpPrice.toLocaleString() : limitUpPrice)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const targetP = (selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks')
                          ? Number((prevClose * 0.95).toFixed(2))
                          : limitDownPrice;
                        setCustomPrice(targetP);
                        setUseCustomPrice(true);
                      }}
                      className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl p-2 text-center transition cursor-pointer shadow-2xs"
                      title={selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? '點擊帶入參考低檔 (-5%)' : '點擊帶入跌停價'}
                    >
                      <span className="text-[10px] text-emerald-800 font-black block">
                        {selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? '參考低檔 (-5%)' : '跌停價 (-10%)'}
                      </span>
                      <span className="font-mono font-black text-emerald-700 text-xs sm:text-sm">
                        {selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks' ? 'US$ ' : 'NT$ '}
                        {(selectedInstrument.category === 'commodities' || selectedInstrument.category === 'us_stocks')
                          ? Number((prevClose * 0.95).toFixed(2))
                          : (limitDownPrice >= 1000 ? limitDownPrice.toLocaleString() : limitDownPrice)}
                      </span>
                    </button>
                  </div>

                  {fairTradeWarning && (
                    <div className="p-2 rounded-xl bg-amber-100 border border-amber-400 text-amber-950 text-xs font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
                      <span>{fairTradeWarning}</span>
                    </div>
                  )}
                </div>

                {/* 2.5 官方真實五檔委買委賣盤口 (5-Depth Order Book - 對齊真實看盤軟體 · 0 AI Token) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">
                        📊
                      </span>
                      <span className="font-black text-xs text-slate-950">
                        即時委買賣五檔盤口 · 點擊價位直接帶入委託單
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {selectedInstrument.fiveBids?.length || selectedInstrument.fiveAsks?.length
                        ? `FinMind 盤中最佳一檔 · ${selectedInstrument.fetchTime || ''}`
                        : '收盤後無委買賣掛單資料'}
                    </span>
                  </div>

                  {/* Summary Bar: 開盤、最高、最低、均價、總量 */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-50 rounded-xl p-2 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">成交</span>
                      <span className="font-mono font-black text-emerald-700">
                        {selectedInstrument.price >= 1000 ? selectedInstrument.price.toLocaleString() : selectedInstrument.price}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">開盤</span>
                      <span className="font-mono font-black text-slate-800">
                        {(selectedInstrument.open || selectedInstrument.prevClose) >= 1000 ? (selectedInstrument.open || selectedInstrument.prevClose).toLocaleString() : (selectedInstrument.open || selectedInstrument.prevClose)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">最高</span>
                      <span className="font-mono font-black text-rose-700">
                        {(selectedInstrument.high || selectedInstrument.price) >= 1000 ? (selectedInstrument.high || selectedInstrument.price).toLocaleString() : (selectedInstrument.high || selectedInstrument.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">最低</span>
                      <span className="font-mono font-black text-emerald-700">
                        {(selectedInstrument.low || selectedInstrument.price) >= 1000 ? (selectedInstrument.low || selectedInstrument.price).toLocaleString() : (selectedInstrument.low || selectedInstrument.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">均價</span>
                      <span className="font-mono font-black text-slate-800">
                        {(selectedInstrument.avgPrice || selectedInstrument.price) >= 1000 ? (selectedInstrument.avgPrice || selectedInstrument.price).toLocaleString() : (selectedInstrument.avgPrice || selectedInstrument.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">總量</span>
                      <span className="font-mono font-black text-slate-900">
                        {Math.round(selectedInstrument.volume / (selectedInstrument.category === 'stocks' || selectedInstrument.category === 'etfs' ? 1000 : 1)).toLocaleString()} {selectedInstrument.category === 'stocks' || selectedInstrument.category === 'etfs' ? '張' : '口'}
                      </span>
                    </div>
                  </div>

                  {/* 5-Depth Order Book Table */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* 委買 5 檔 (Buy depth) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
                        <span>委買量</span>
                        <span>委買價 (點擊填入)</span>
                      </div>
                      <div className="space-y-1">
                        {!selectedInstrument.fiveBids?.length && (
                          <div className="px-2.5 py-3 rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 text-center">
                            無委買資料
                          </div>
                        )}
                        {(selectedInstrument.fiveBids || []).map((b, idx) => {
                          const maxVol = 2000;
                          const pct = Math.min(100, Math.round((b.volume / maxVol) * 100));
                          const isMatch = customPrice === b.price;
                          return (
                            <button
                              key={`bid-${idx}`}
                              type="button"
                              onClick={() => {
                                setCustomPrice(b.price);
                                setUseCustomPrice(true);
                              }}
                              className={`w-full relative px-2.5 py-1.5 rounded-lg border transition flex items-center justify-between cursor-pointer overflow-hidden group ${
                                isMatch
                                  ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-500'
                                  : 'border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/30'
                              }`}
                              title={`帶入委買價 NT$ ${b.price}`}
                            >
                              <div
                                className="absolute left-0 top-0 bottom-0 bg-emerald-100/60 transition-all pointer-events-none"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="relative z-10 font-mono text-[11px] text-slate-600 font-bold">
                                {b.volume.toLocaleString()}
                              </span>
                              <span className="relative z-10 font-mono font-black text-xs text-emerald-700 group-hover:underline">
                                {b.price >= 1000 ? b.price.toLocaleString() : b.price}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 委賣 5 檔 (Sell depth) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
                        <span>委賣價 (點擊填入)</span>
                        <span>委賣量</span>
                      </div>
                      <div className="space-y-1">
                        {!selectedInstrument.fiveAsks?.length && (
                          <div className="px-2.5 py-3 rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 text-center">
                            無委賣資料
                          </div>
                        )}
                        {(selectedInstrument.fiveAsks || []).map((a, idx) => {
                          const maxVol = 2000;
                          const pct = Math.min(100, Math.round((a.volume / maxVol) * 100));
                          const isMatch = customPrice === a.price;
                          return (
                            <button
                              key={`ask-${idx}`}
                              type="button"
                              onClick={() => {
                                setCustomPrice(a.price);
                                setUseCustomPrice(true);
                              }}
                              className={`w-full relative px-2.5 py-1.5 rounded-lg border transition flex items-center justify-between cursor-pointer overflow-hidden group ${
                                isMatch
                                  ? 'border-rose-600 bg-rose-50 ring-1 ring-rose-500'
                                  : 'border-slate-200 hover:border-rose-400 bg-white hover:bg-rose-50/30'
                              }`}
                              title={`帶入委賣價 NT$ ${a.price}`}
                            >
                              <div
                                className="absolute right-0 top-0 bottom-0 bg-rose-100/60 transition-all pointer-events-none"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="relative z-10 font-mono font-black text-xs text-rose-700 group-hover:underline">
                                {a.price >= 1000 ? a.price.toLocaleString() : a.price}
                              </span>
                              <span className="relative z-10 font-mono text-[11px] text-slate-600 font-bold">
                                {a.volume.toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 內外盤比例原本是寫死的 54.41%，已移除 */}
                </div>

                {/* 3. 價格與數量步進器（券商標準三竹版型） */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* 價格輸入框 + 步進器 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-slate-950">
                        委託單價 (NT$)：
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomPrice(selectedInstrument.price);
                          setUseCustomPrice(false);
                        }}
                        className="text-[10px] text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                      >
                        重設為即時市價
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStepPrice(-1)}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-800 font-black text-base flex items-center justify-center transition cursor-pointer shadow-2xs shrink-0"
                        title="價格減一個跳動檔位"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <input
                        type="number"
                        step="any"
                        value={currentPrice}
                        onChange={e => {
                          setCustomPrice(parseFloat(e.target.value) || 0);
                          setUseCustomPrice(true);
                        }}
                        className={`flex-1 py-2 px-3 text-center rounded-xl border-2 font-mono font-black text-base text-slate-950 focus:outline-none transition ${
                          useCustomPrice ? 'bg-amber-50/50 border-amber-500' : 'bg-white border-slate-300'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleStepPrice(1)}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-800 font-black text-base flex items-center justify-center transition cursor-pointer shadow-2xs shrink-0"
                        title="價格加一個跳動檔位"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-500 font-medium mt-1 block">
                      每次跳動 ±{getTickSize(currentPrice)} 元 · 支援市價或自訂委託
                    </span>
                  </div>

                  {/* 數量輸入框 + 步進器（張數 / 口數 自動本土化） */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-slate-950 flex items-center gap-1">
                        <span>委託數量（{contractSpec.unitName}數）：</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-black bg-amber-100 text-amber-900 border border-amber-300">
                          {contractSpec.unitFull}
                        </span>
                      </label>
                      <span className="text-[10px] text-emerald-800 font-mono font-bold">
                        {contractSpec.convertedText}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStepQuantity(-1)}
                        disabled={quantity <= (selectedInstrument.category === 'crypto' && selectedInstrument.symbol !== 'USDT' && selectedInstrument.symbol !== 'USDC' ? 0.01 : 1)}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-800 font-black text-base flex items-center justify-center transition cursor-pointer shadow-2xs shrink-0 disabled:opacity-40"
                        title={`減 ${selectedInstrument.category === 'crypto' ? '數量' : '1 ' + contractSpec.unitName}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <input
                        type="number"
                        min={selectedInstrument.category === 'crypto' && selectedInstrument.symbol !== 'USDT' && selectedInstrument.symbol !== 'USDC' ? '0.01' : '1'}
                        step="any"
                        value={quantity}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          const minVal = selectedInstrument.category === 'crypto' && selectedInstrument.symbol !== 'USDT' && selectedInstrument.symbol !== 'USDC' ? 0.01 : 1;
                          setQuantity(isNaN(val) ? minVal : Math.max(minVal, val));
                        }}
                        className="flex-1 py-2 px-3 text-center rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 font-mono font-black text-base text-slate-950 focus:outline-none transition shadow-inner"
                      />

                      <button
                        type="button"
                        onClick={() => handleStepQuantity(1)}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-800 font-black text-base flex items-center justify-center transition cursor-pointer shadow-2xs shrink-0"
                        title={`加 ${selectedInstrument.category === 'crypto' ? '數量' : '1 ' + contractSpec.unitName}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 快捷倉位與數量按鈕列（支援股票/期貨張口數、穩定幣 10,000 USDT/TWDT、比特幣 0.01 BTC 等小數） */}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {selectedInstrument.category === 'crypto' && (selectedInstrument.symbol === 'USDT' || selectedInstrument.symbol === 'USDC' || selectedInstrument.symbol === 'TWDT') ? (
                        [1000, 5000, 10000, 50000].map(q => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setQuantity(q)}
                            className={`px-2 py-0.5 rounded-lg border text-xs font-mono font-black transition cursor-pointer ${
                              quantity === q
                                ? 'bg-slate-950 text-white border-slate-950'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                          >
                            {q.toLocaleString()} {contractSpec.unitName}
                          </button>
                        ))
                      ) : selectedInstrument.category === 'crypto' ? (
                        [0.01, 0.05, 0.1, 0.5, 1].map(q => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setQuantity(q)}
                            className={`px-2 py-0.5 rounded-lg border text-xs font-mono font-black transition cursor-pointer ${
                              quantity === q
                                ? 'bg-slate-950 text-white border-slate-950'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                          >
                            {q} {contractSpec.unitName}
                          </button>
                        ))
                      ) : (
                        [1, 5, 10, 20].map(q => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleQuickQty(q)}
                            className={`px-2 py-0.5 rounded-lg border text-xs font-mono font-black transition cursor-pointer ${
                              quantity === q
                                ? 'bg-slate-950 text-white border-slate-950'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                          >
                            {q}{contractSpec.unitName}
                          </button>
                        ))
                      )}

                      <div className="w-px h-4 bg-slate-300 mx-0.5" />

                      <button
                        type="button"
                        onClick={() => handleMaxAffordable(25)}
                        className="px-1.5 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold cursor-pointer"
                        title="以可用資金 25% 試算最大張/口數"
                      >
                        1/4倉
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMaxAffordable(50)}
                        className="px-1.5 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold cursor-pointer"
                        title="以可用資金 50% 試算最大張/口數"
                      >
                        半倉
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMaxAffordable(90)}
                        className="px-1.5 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 text-[10px] font-black cursor-pointer ml-auto"
                        title="以可用資金 90% 試算最大張/口數"
                      >
                        全倉
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. 券商級雙色大委託按鈕（老手 3 秒完成下單！） */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    {/* 買進委託大按鈕 */}
                    <button
                      type="button"
                      onClick={() => {
                        const sym = selectedInstrument.symbol.toUpperCase();
                        const isTwStable = sym === 'TWDT' || sym === 'TWDC';
                        const isGlobalStable = sym === 'USDT' || sym === 'USDC';
                        const targetAction: OrderAction =
                          selectedInstrument.category === 'crypto'
                            ? (isTwStable ? 'BUY_TW_STABLECOIN' : isGlobalStable ? 'BUY_STABLECOIN' : 'BUY_CRYPTO')
                            : selectedInstrument.category === 'commodities'
                            ? 'BUY_COMMODITY_LONG'
                            : selectedInstrument.category === 'us_stocks'
                            ? 'BUY_US_STOCK'
                            : selectedInstrument.category === 'futures'
                            ? 'BUY_FUTURES_LONG'
                            : selectedInstrument.category === 'options'
                            ? 'BUY_CALL_OPTION'
                            : selectedInstrument.category === 'warrants'
                            ? 'BUY_CALL_WARRANT'
                            : selectedInstrument.category === 'bonds'
                            ? 'BUY_BOND'
                            : selectedInstrument.category === 'etfs'
                            ? 'BUY_ETF'
                            : orderAction === 'BUY_MARGIN_STOCK'
                            ? 'BUY_MARGIN_STOCK'
                            : 'BUY_STOCK';
                        handleExecuteWithAction(targetAction);
                      }}
                      disabled={!hasEnoughCash || quantity <= 0}
                      className={`flex-1 py-3 px-4 rounded-2xl font-black text-sm transition cursor-pointer shadow-md flex items-center justify-between active:scale-98 ${
                        hasEnoughCash
                          ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700 ring-2 ring-rose-300'
                          : 'bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🔴</span>
                        <div className="text-left leading-tight">
                          <span className="block text-sm">
                            {selectedInstrument.category === 'crypto'
                              ? (selectedInstrument.symbol === 'TWDT' || selectedInstrument.symbol === 'TWDC'
                                ? `🇹🇼 申購新台幣穩定幣 (${selectedInstrument.symbol})`
                                : selectedInstrument.symbol === 'USDT' || selectedInstrument.symbol === 'USDC'
                                ? `💵 買進全球美元穩定幣 (${selectedInstrument.symbol})`
                                : `🚀 買進做多現貨 (${selectedInstrument.symbol})`)
                              : selectedInstrument.category === 'commodities'
                              ? '🌍 原物料多單 (做多)'
                              : selectedInstrument.category === 'us_stocks'
                              ? '🇺🇸 美股複委託買進 (做多)'
                              : selectedInstrument.category === 'futures'
                              ? '期貨多單買進 (做多)'
                              : selectedInstrument.category === 'options'
                              ? '買進買權 (Buy Call)'
                              : orderAction === 'BUY_MARGIN_STOCK'
                              ? '融資買進委託'
                              : '買進委託 (做多現貨)'}
                          </span>
                          <span className="text-[10px] text-rose-100 font-normal">
                            {selectedInstrument.category === 'crypto'
                              ? (selectedInstrument.symbol === 'TWDT' || selectedInstrument.symbol === 'TWDC'
                                ? `${quantity.toLocaleString()} ${contractSpec.unitName} · 錨定 NT$ 1 (零匯差)`
                                : `${quantity} ${contractSpec.unitName} · 依 USD $${currentPrice} (匯率 1:32.5)`)
                              : selectedInstrument.category === 'commodities'
                              ? `${quantity} 口 · 依 USD $${currentPrice}`
                              : selectedInstrument.category === 'us_stocks'
                              ? `${quantity} 股 · 依 USD $${currentPrice} (匯率 1:32)`
                              : `${quantity} ${contractSpec.unitName} · 依 NT$ ${currentPrice}`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right leading-tight font-mono">
                        <span className="text-xs font-normal text-rose-100 block">所需台幣圈存</span>
                        <span className="text-sm font-black">
                          NT$ {Math.round(totalCostOrMargin).toLocaleString()}
                        </span>
                      </div>
                    </button>

                    {/* 賣出/放空委託大按鈕 */}
                    {selectedInstrument.category === 'us_stocks' ? (
                      <div className="flex-1 bg-blue-50 border border-blue-200 rounded-2xl p-2.5 flex items-center justify-between text-xs text-blue-900 font-bold">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">🇺🇸</span>
                          <span>美股複委託帳戶：依法僅限現股多頭交易 (直接台幣圈存，免繁瑣換匯)</span>
                        </div>
                        <span className="font-mono text-blue-700 font-black shrink-0">1 USD = 32.0 TWD</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const sym = selectedInstrument.symbol.toUpperCase();
                          const isTwStable = sym === 'TWDT' || sym === 'TWDC';
                          const isGlobalStable = sym === 'USDT' || sym === 'USDC';
                          const targetAction: OrderAction =
                            selectedInstrument.category === 'crypto'
                              ? (isTwStable ? 'SELL_TW_STABLECOIN' : isGlobalStable ? 'SELL_STABLECOIN' : 'SHORT_SELL_CRYPTO')
                              : selectedInstrument.category === 'commodities'
                              ? 'SELL_COMMODITY_SHORT'
                              : selectedInstrument.category === 'futures'
                              ? 'SELL_FUTURES_SHORT'
                              : selectedInstrument.category === 'options'
                              ? 'BUY_PUT_OPTION'
                              : selectedInstrument.category === 'warrants'
                              ? 'BUY_PUT_WARRANT'
                              : selectedInstrument.category === 'etfs' || selectedInstrument.category === 'bonds'
                              ? 'SHORT_SELL_ETF'
                              : 'SHORT_SELL_STOCK';
                          handleExecuteWithAction(targetAction);
                        }}
                        disabled={!hasEnoughCash || quantity <= 0}
                        className={`flex-1 py-3 px-4 rounded-2xl font-black text-sm transition cursor-pointer shadow-md flex items-center justify-between active:scale-98 ${
                          hasEnoughCash
                            ? 'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-800 ring-2 ring-emerald-300'
                            : 'bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">🟢</span>
                          <div className="text-left leading-tight">
                            <span className="block text-sm">
                              {selectedInstrument.category === 'crypto'
                                ? (selectedInstrument.symbol === 'TWDT' || selectedInstrument.symbol === 'TWDC'
                                  ? `🇹🇼 1:1 贖回新台幣現金 (${selectedInstrument.symbol})`
                                  : selectedInstrument.symbol === 'USDT' || selectedInstrument.symbol === 'USDC'
                                  ? `🔄 結算贖回換回台幣 (${selectedInstrument.symbol})`
                                  : `📉 融券放空避險 (${selectedInstrument.symbol})`)
                                : selectedInstrument.category === 'commodities'
                                ? '🌍 原物料空單 (放空)'
                                : selectedInstrument.category === 'futures'
                                ? '期貨空單賣出 (放空)'
                                : selectedInstrument.category === 'options'
                                ? '買進賣權 (Buy Put 避險)'
                                : '融券賣出 (放空避險)'}
                            </span>
                            <span className="text-[10px] text-emerald-100 font-normal">
                              {selectedInstrument.category === 'crypto'
                                ? (selectedInstrument.symbol === 'TWDT' || selectedInstrument.symbol === 'TWDC'
                                  ? `${quantity.toLocaleString()} ${contractSpec.unitName} · 依 1:1 兌回 NT$`
                                  : `${quantity} ${contractSpec.unitName} · 依 USD $${currentPrice}`)
                                : selectedInstrument.category === 'commodities'
                                ? `${quantity} 口 · 依 USD $${currentPrice}`
                                : `${quantity} ${contractSpec.unitName} · 依 NT$ ${currentPrice}`}
                            </span>
                          </div>
                        </div>
                        <div className="text-right leading-tight font-mono">
                          <span className="text-xs font-normal text-emerald-100 block">
                            {selectedInstrument.category === 'crypto' && (selectedInstrument.symbol === 'TWDT' || selectedInstrument.symbol === 'TWDC' || selectedInstrument.symbol === 'USDT' || selectedInstrument.symbol === 'USDC') ? '預計回收台幣' : '保證金/交割圈存'}
                          </span>
                          <span className="text-sm font-black">
                            NT$ {Math.round(totalCostOrMargin).toLocaleString()}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>

                  {!hasEnoughCash && (
                    <div className="mt-2 text-center">
                      <span className="text-xs text-rose-700 font-black bg-rose-100 px-3 py-1 rounded-xl border border-rose-300 inline-block">
                        ⚠️ 現金不足：可用 NT$ {Math.round(availableCash).toLocaleString()}，尚缺 NT${' '}
                        {Math.round(totalCostOrMargin - availableCash).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────────
                  【第二層：學生學習細節與 PPT 細算報告】（隨需展開 / 學生必看）
                 ───────────────────────────────────────────────────────────── */}
              <div className="bg-slate-50 border-2 border-slate-200 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
                {/* 展開/收合切換標題 */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs border border-indigo-200">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 flex items-center gap-1.5">
                        <span>學生學習細節與 PPT 細算報告</span>
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-100 text-indigo-900 font-bold border border-indigo-200">
                          彰師大財金系實習專用
                        </span>
                      </h4>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                        完整合約換算、稅費公式、槓桿倍數，自動存證帶入 PPT 期末報告
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsStudentCalcExpanded(!isStudentCalcExpanded)}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <span>{isStudentCalcExpanded ? '收起細算 ▴' : '展開學習細算 ▾'}</span>
                  </button>
                </div>

                {isStudentCalcExpanded && (
                  <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                    {/* 1. 商品合約規格換算表（對應學生截圖與期交所規格） */}
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 flex items-center gap-1">
                          <span>📦 1. 臺灣期交所 / 證交所 合約規格換算：</span>
                        </span>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {contractSpec.specTitle}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-bold block">合約標準規格</span>
                          <span className="font-mono font-black text-slate-900 text-xs">
                            {contractSpec.specFormula}
                          </span>
                          <span className="text-[10px] text-slate-600 block mt-0.5">
                            {contractSpec.isStockFutures
                              ? '股票期貨 1口 = 2張現貨'
                              : '現貨股票 1張 = 1,000股'}
                          </span>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-bold block">名目契約總價值</span>
                          <span className="font-mono font-black text-slate-900 text-xs">
                            NT$ {Math.round(notionalValue).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-600 block mt-0.5">
                            實質槓桿：{contractSpec.leverageText}
                          </span>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                          <span className="text-[10px] text-slate-500 font-bold block">跳動點價值 (Tick Value)</span>
                          <span className="font-mono font-black text-emerald-800 text-xs">
                            {contractSpec.tickValueText}
                          </span>
                          <span className="text-[10px] text-slate-600 block mt-0.5">
                            當前等價掌控：{contractSpec.convertedText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2. 交易成本與稅費透明拆解公式 */}
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900">
                          💰 2. 交易成本與稅費扣款精算：
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 font-bold">
                          手續費率 0.1425% · 期交稅 0.002%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] text-slate-500 font-bold block font-sans">
                            {selectedInstrument.category === 'futures' ? '原始保證金' : '成交價金'}
                          </span>
                          <span className="font-black text-slate-900">
                            NT$ {Math.round(totalCostOrMargin).toLocaleString()}
                          </span>
                        </div>

                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] text-slate-500 font-bold block font-sans">券商手續費</span>
                          <span className="font-black text-slate-700">
                            NT$ {costBreakdown.estFee.toLocaleString()}
                          </span>
                        </div>

                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] text-slate-500 font-bold block font-sans">預估交易稅</span>
                          <span className="font-black text-slate-700">
                            NT$ {costBreakdown.estTax.toLocaleString()}
                          </span>
                        </div>

                        <div className="bg-amber-50 p-2 rounded-xl border border-amber-300 text-center">
                          <span className="text-[10px] text-amber-900 font-black block font-sans">本次扣款總額</span>
                          <span className="font-black text-amber-950">
                            NT$ {Math.round(costBreakdown.totalDeduction).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3. PPT 作業報告研究理由存證 */}
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <label className="text-xs font-black text-slate-900 flex items-center gap-1">
                          <span>📝 3. PPT 報告研究理由與對沖依據（自動存證）：</span>
                        </label>
                        <div className="flex gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleQuickRationale('macro')}
                            className="text-[10px] px-2 py-0.5 rounded bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 font-bold cursor-pointer"
                          >
                            + 總經降息
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickRationale('hedge')}
                            className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold cursor-pointer"
                          >
                            + 避險對沖
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickRationale('growth')}
                            className="text-[10px] px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-bold cursor-pointer"
                          >
                            + AI產業
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={rationale}
                        onChange={e => setRationale(e.target.value)}
                        placeholder="請輸入為何在此時點建立此部位之總經邏輯、產業題材或對沖理由（將自動同步至期末 PPT 講稿報告）..."
                        className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-indigo-500 text-xs text-slate-950 font-semibold transition"
                      />

                      <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>上述合約規格換算、成本與研究理由，將自動存入部位存證紀錄，並直接同步至「PPT 報告工作室」生成投影片與講稿。</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {orderSuccessMsg && (
                <div className="p-3 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-black flex items-center gap-2 shadow-xs">
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>{orderSuccessMsg}</span>
                </div>
              )}
            </form>
              </div>

              {/* ─── BOTTOM SECTION: 操盤手下方實戰輔助工具箱 (Moved from left to bottom!) ─── */}
              <div ref={bottomToolsRef}>
                <TradingBottomTools
                  activeToolTab={activeToolTab}
                  setActiveToolTab={setActiveToolTab}
                  selectedInstrument={selectedInstrument}
                  onSelectInstrument={onSelectInstrument}
                  setOrderAction={setOrderAction}
                  setActiveCategoryTab={setActiveCategoryTab}
                  setCustomPrice={setCustomPrice}
                  setUseCustomPrice={setUseCustomPrice}
                  setQuantity={setQuantity}
                  scrollToOrder={scrollToOrder}
                  currentProfile={currentProfile || undefined}
                  instrumentsList={instrumentsList}
                  onViewInstrumentKLine={onViewInstrumentKLine}
                  onClosePosition={onClosePosition}
                  onAddCustomInstrument={onAddCustomInstrument}
                  onOpenCalculator={onOpenCalculator}
                  onOpenGlossary={onOpenGlossary}
                  setShowLimitUpAlternatives={setShowLimitUpAlternatives}
                  openCustomSymbolModal={openCustomSymbolModal}
                  activeCategoryTab={activeCategoryTab}
                  getFilteredInstruments={getFilteredInstruments}
                  totalHeldQty={totalHeldQty}
                  avgHeldCost={avgHeldCost}
                  totalHeldMarketVal={totalHeldMarketVal}
                  totalHeldPnL={totalHeldPnL}
                  myPositions={myPositions}
                  isSuperUser={isSuperUser}
                  getCategoryTabFromInstrument={getCategoryTabFromInstrument}
                  isExpanded={isBottomToolsExpanded}
                  onToggleExpand={() => setIsBottomToolsExpanded(!isBottomToolsExpanded)}
                  onForceRefresh={onForceRefresh}
                />
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: 自訂指定任意商品代號 (Custom Symbol Specification Modal - All 5 Categories) */}
        {isCustomModalOpen && (
          <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            <div className="bg-white border-2 border-slate-300 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-5 py-4 border-b border-amber-400 flex items-center justify-between text-slate-950">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white border border-amber-300 flex items-center justify-center font-black shadow-xs">
                    ➕
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-950">
                      五大類別 · 自訂指定任意商品代號
                    </h4>
                    <p className="text-xs font-bold text-slate-900">
                      不受限於預設清單，自由輸入任何台股、債券ETF、期貨或選擇權
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/80 hover:bg-white text-slate-800 hover:text-slate-950 transition font-black text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
                {/* 1. Category Switcher */}
                <div>
                  <label className="text-xs font-black text-slate-900 block mb-1.5">
                    1. 選擇商品類別 (五大類別均可自訂)：
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs font-black">
                    <button
                      type="button"
                      onClick={() => handleSelectCustomCategory('stocks')}
                      className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer ${
                        customCategory === 'stocks'
                          ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                      }`}
                    >
                      📈 股票型
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCustomCategory('bonds')}
                      className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer ${
                        customCategory === 'bonds'
                          ? 'bg-sky-500 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                      }`}
                    >
                      🛡️ 債券型
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCustomCategory('etfs')}
                      className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer ${
                        customCategory === 'etfs'
                          ? 'bg-indigo-500 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                      }`}
                    >
                      📊 指數ETF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCustomCategory('futures')}
                      className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer ${
                        customCategory === 'futures'
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                      }`}
                    >
                      ⚡ 期貨
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCustomCategory('options')}
                      className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer col-span-2 sm:col-span-1 ${
                        customCategory === 'options' || customCategory === 'warrants'
                          ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                      }`}
                    >
                      🎯 選擇權/權證
                    </button>
                  </div>
                </div>

                {/* Popular suggestions chips for this category */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <span className="text-[11px] font-black text-slate-700 block mb-1.5 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-amber-600" />
                    <span>常用或熱門標的快速帶入：</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      CATEGORY_CUSTOM_SUGGESTIONS[
                        customCategory === 'stocks'
                          ? 'stocks'
                          : customCategory === 'bonds'
                          ? 'bonds'
                          : customCategory === 'etfs'
                          ? 'etfs'
                          : customCategory === 'futures'
                          ? 'futures'
                          : 'options_warrants'
                      ] || []
                    ).map(sug => (
                      <button
                        key={sug.symbol}
                        type="button"
                        onClick={() => handleSelectSuggestion(sug)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white hover:bg-amber-100 border border-slate-300 hover:border-amber-400 text-slate-800 transition flex items-center gap-1 cursor-pointer"
                      >
                        <span className="font-mono text-amber-700 font-black">{sug.symbol}</span>
                        <span>{sug.name}</span>
                        <span className="text-slate-500 font-mono text-[10px]">
                          NT${sug.price}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Symbol */}
                  <div>
                    <label className="text-xs font-black text-slate-900 block mb-1">
                      商品代號 <span className="text-rose-600">*</span>：
                    </label>
                    <input
                      type="text"
                      value={customSymbol}
                      onChange={e => setCustomSymbol(e.target.value.toUpperCase())}
                      placeholder="如 2382, 00919, 00937B, CZF..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-sm font-mono font-black text-slate-950 uppercase"
                    />
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      可輸入任一股票代號、期貨合約代號或選擇權代碼
                    </span>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="text-xs font-black text-slate-900 block mb-1">
                      商品中文名稱：
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder="如 廣達電腦、群益台灣精選高息..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-sm font-semibold text-slate-950"
                    />
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      若未填寫將預設使用商品代號
                    </span>
                  </div>

                  {/* Entry Price */}
                  <div>
                    <label className="text-xs font-black text-slate-900 block mb-1">
                      當下即時撮合進場價 (NT$) <span className="text-rose-600">*</span>：
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customPriceInput}
                      onChange={e => setCustomPriceInput(e.target.value)}
                      placeholder="如 344.5 或 24.35"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-sm font-mono font-black text-slate-950"
                    />
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      作為 5,000 萬投資組合建倉損益計算之起算點
                    </span>
                  </div>

                  {/* Multiplier */}
                  <div>
                    <label className="text-xs font-black text-slate-900 block mb-1">
                      合約乘數 / 每單位股數：
                    </label>
                    <input
                      type="number"
                      value={customMultiplier}
                      onChange={e => setCustomMultiplier(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-sm font-mono font-bold text-slate-950"
                    />
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      現股/ETF為1,000；大台200/小台50/微台10/個股期2000；選擇權50
                    </span>
                  </div>

                  {/* Margin Requirement (for Futures / Short Options) */}
                  {(customCategory === 'futures' || customCategory === 'options') && (
                    <div>
                      <label className="text-xs font-black text-slate-900 block mb-1">
                        每口所需原始保證金 (NT$)：
                      </label>
                      <input
                        type="number"
                        value={customMargin}
                        onChange={e => setCustomMargin(Number(e.target.value))}
                        placeholder="如 320000, 80000, 16000..."
                        className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-sm font-mono font-bold text-slate-950"
                      />
                      <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                        大台約32萬、小台約8萬、微台約1.6萬
                      </span>
                    </div>
                  )}

                  {/* Strike Price (for Options / Warrants) */}
                  {(customCategory === 'options' || customCategory === 'warrants') && (
                    <div>
                      <label className="text-xs font-black text-slate-900 block mb-1">
                        履約價 (點數/價格)：
                      </label>
                      <input
                        type="number"
                        value={customStrike}
                        onChange={e => setCustomStrike(e.target.value)}
                        placeholder="如 42000, 48500..."
                        className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-sm font-mono font-bold text-slate-950"
                      />
                    </div>
                  )}
                </div>

                {/* AI / FinMind Auto Quote Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleFetchAiQuote}
                    disabled={isAiFetching || !customSymbol.trim()}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer border ${
                      isAiFetching
                        ? 'bg-slate-100 text-slate-500 border-slate-300 cursor-not-allowed'
                        : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-950 border-cyan-300 shadow-2xs'
                    }`}
                  >
                    {isAiFetching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-700" />
                        <span>正在透過 AI 與真實資料庫查詢 21 號收盤行情...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-cyan-700" />
                        <span>🤖 點此讓 AI 智能查詢該代號之 21 號真實收盤價與合約規格</span>
                      </>
                    )}
                  </button>

                  {aiMsg && (
                    <div
                      className={`mt-2 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        aiMsg.type === 'success'
                          ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                          : 'bg-rose-100 text-rose-950 border border-rose-300'
                      }`}
                    >
                      {aiMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                      )}
                      <span>{aiMsg.text}</span>
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsCustomModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-black text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 transition cursor-pointer border border-slate-300"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCustomInstrument}
                    disabled={!customSymbol.trim()}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-md ${
                      customSymbol.trim()
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 border border-amber-500'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>確認指定並載入下單機</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: 台指選擇權 T字報價表 (Taiwan Index Options T-Quote Board Modal - Inspired by Image 3) */}
        {isOptionsBoardOpen && (
          <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white border-2 border-slate-300 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-800 to-indigo-900 px-5 py-3.5 border-b border-purple-700 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-lg font-black shadow-xs">
                    📊
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-white">
                        台指選擇權 T字即時行情報價表
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-purple-500/40 text-purple-200 border border-purple-400/30">
                        點選任意履約價 Call / Put 即刻下單
                      </span>
                    </div>
                    <p className="text-xs text-purple-200 font-semibold">
                      對照期交所真實行情 · 基準日 2026-09-21 收盤價 48,077 點
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOptionsBoardOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition font-black text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Subheader Controls (matching image 3) */}
              <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                {/* Product Tabs */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOptionsBoardType('TXO')}
                    className={`px-3 py-1 rounded-lg font-black transition cursor-pointer ${
                      optionsBoardType === 'TXO'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    台指選
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionsBoardType('TFO')}
                    className={`px-3 py-1 rounded-lg font-black transition cursor-pointer ${
                      optionsBoardType === 'TFO'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    金指選
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptionsBoardType('TEO')}
                    className={`px-3 py-1 rounded-lg font-black transition cursor-pointer ${
                      optionsBoardType === 'TEO'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    電指選
                  </button>
                </div>

                {/* Contract Month Selector (matching image 3 dropdown) */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600 text-xs">合約月份：</span>
                  <select
                    value={optionsContract}
                    onChange={e => setOptionsContract(e.target.value)}
                    className="px-3 py-1 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:border-purple-600"
                  >
                    <option value="台指2610">台指2610 (近月主力)</option>
                    <option value="台指1W2610">台指1W2610 (週選擇權1)</option>
                    <option value="台指2W2610">台指2W2610 (週選擇權2)</option>
                    <option value="台指2611">台指2611 (次月合約)</option>
                    <option value="台指2612">台指2612 (季月合約)</option>
                  </select>
                  <span className="font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-black border border-emerald-300 text-[11px]">
                    大盤現貨: 48,077.36 ▲+659 (+1.39%)
                  </span>
                </div>
              </div>

              {/* T-Quote Table Body (matching user uploaded image 3 table) */}
              <div className="overflow-y-auto flex-1 p-2 sm:p-3">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-200 text-slate-800 font-black text-center border-b-2 border-slate-300 z-10">
                    <tr>
                      <th colSpan={5} className="py-2 bg-rose-100 text-rose-950 border-r border-slate-300">
                        買權 Call (多頭進攻 / 槓桿暴擊)
                      </th>
                      <th className="py-2 px-3 bg-slate-300 text-slate-950 font-black border-r border-slate-300">
                        履約價
                      </th>
                      <th colSpan={5} className="py-2 bg-emerald-100 text-emerald-950">
                        賣權 Put (空頭防禦 / 黑天鵝保單)
                      </th>
                    </tr>
                    <tr className="text-[11px] text-slate-600 border-b border-slate-300 bg-slate-100">
                      <th className="py-1 px-1.5 font-bold">未平倉</th>
                      <th className="py-1 px-1.5 font-bold">漲跌</th>
                      <th className="py-1 px-2 text-rose-800 font-black">成交價</th>
                      <th className="py-1 px-1.5 font-bold">買進/賣出</th>
                      <th className="py-1 px-2 font-black text-rose-900">下單Call</th>

                      <th className="py-1 px-3 bg-slate-200 text-slate-900 font-mono font-black border-x border-slate-300">
                        Strike
                      </th>

                      <th className="py-1 px-2 font-black text-emerald-900">下單Put</th>
                      <th className="py-1 px-1.5 font-bold">買進/賣出</th>
                      <th className="py-1 px-2 text-emerald-800 font-black">成交價</th>
                      <th className="py-1 px-1.5 font-bold">漲跌</th>
                      <th className="py-1 px-1.5 font-bold">未平倉</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-center font-mono">
                    {OPTIONS_STRIKES_BOARD.map(row => (
                      <tr
                        key={row.strike}
                        className="hover:bg-amber-50/70 transition duration-100 group"
                      >
                        {/* Call OI */}
                        <td className="py-1.5 px-1.5 text-slate-500 text-[11px]">
                          {row.callOi.toLocaleString()}
                        </td>
                        {/* Call Change */}
                        <td className="py-1.5 px-1.5 text-rose-700 font-bold text-[11px]">
                          ▲+{row.callChange}
                        </td>
                        {/* Call Price */}
                        <td className="py-1.5 px-2 text-rose-800 font-black text-xs">
                          {row.callPrice >= 1000 ? row.callPrice.toLocaleString() : row.callPrice}
                        </td>
                        {/* Call Bid/Ask */}
                        <td className="py-1.5 px-1.5 text-slate-500 text-[10px]">
                          {row.callBid}/{row.callAsk}
                        </td>
                        {/* Select Call Action Button */}
                        <td className="py-1 px-2 border-r border-slate-300">
                          <button
                            type="button"
                            onClick={() => handleSelectOptionStrike(row, 'Call')}
                            className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] shadow-2xs transition cursor-pointer group-hover:scale-105"
                          >
                            選Call
                          </button>
                        </td>

                        {/* Strike Price */}
                        <td className="py-1.5 px-3 font-black text-slate-950 bg-slate-100 text-xs border-x border-slate-300 font-mono">
                          {row.strike.toLocaleString()}
                        </td>

                        {/* Select Put Action Button */}
                        <td className="py-1 px-2 border-l border-slate-300">
                          <button
                            type="button"
                            onClick={() => handleSelectOptionStrike(row, 'Put')}
                            className="px-2 py-0.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] shadow-2xs transition cursor-pointer group-hover:scale-105"
                          >
                            選Put
                          </button>
                        </td>
                        {/* Put Bid/Ask */}
                        <td className="py-1.5 px-1.5 text-slate-500 text-[10px]">
                          {row.putBid}/{row.putAsk}
                        </td>
                        {/* Put Price */}
                        <td className="py-1.5 px-2 text-emerald-800 font-black text-xs">
                          {row.putPrice}
                        </td>
                        {/* Put Change */}
                        <td className="py-1.5 px-1.5 text-slate-600 font-bold text-[11px]">
                          {row.putChange === 0 ? '0.00' : `${row.putChange}`}
                        </td>
                        {/* Put OI */}
                        <td className="py-1.5 px-1.5 text-slate-500 text-[11px]">
                          {row.putOi.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Board Footer */}
              <div className="bg-slate-100 border-t border-slate-300 px-4 py-2.5 flex items-center justify-between text-xs text-slate-700 font-semibold shrink-0">
                <span>
                  💡 點擊「選Call」或「選Put」直接帶入下單機，每點乘數 NT$ 50 元。
                </span>
                <button
                  type="button"
                  onClick={() => setIsOptionsBoardOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-black hover:bg-slate-800 transition cursor-pointer text-xs"
                >
                  關閉報價表
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 💡 設計方案 B：現貨漲停鎖死買不到 · 專業操盤手替代方案引導面板 */}
        {showLimitUpAlternatives && (
          <LimitUpAlternativeModal
            isOpen={showLimitUpAlternatives}
            onClose={() => setShowLimitUpAlternatives(false)}
            instrument={selectedInstrument}
            allInstruments={instrumentsList}
            onSelectAlternative={handleSelectAlternativeFromModal}
            onProceedQueuedOrder={handleProceedQueuedFromModal}
          />
        )}
      </div>
    </div>
  );
};
