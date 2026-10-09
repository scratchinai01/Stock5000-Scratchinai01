/**
 * 台灣資本市場精準商品級別交易時鐘 (Taiwan Exchange Precision Trading Clock)
 * 依照臺灣證券交易所 (TWSE) 與臺灣期貨交易所 (TAIFEX) 官方撮合規則：
 *
 * 1. 股票期貨 (Stock Futures, 如 6285F 啟碁期, 5483F 中美晶期, CDF 台積期, DHF 鴻海期):
 *    - 一般交易 (日盤)：08:45 ~ 13:45
 *    - 盤後交易 (夜盤)：17:25 ~ 次日 05:00 (注意：期交所規定股票期貨夜盤為 17:25 開始，非 15:00！)
 *    - 非交易時段：13:45 ~ 17:25 (清算結算，無交易) 以及 05:00 ~ 08:45
 *
 * 2. 股價指數期貨 (Index Futures: TX 大台, MTX 小台, TMF 微台):
 *    - 一般交易 (日盤)：08:45 ~ 13:45
 *    - 盤後交易 (夜盤)：15:00 ~ 次日 05:00
 *    - 非交易時段：13:45 ~ 15:00 (75分鐘中場清算) 以及 05:00 ~ 08:45
 *
 * 3. 臺指選擇權 (Index Options: TXO):
 *    - 一般交易 (日盤)：08:45 ~ 13:45
 *    - 盤後交易 (夜盤)：15:00 ~ 次日 05:00
 *
 * 4. 現貨股票 / ETF / 債券 (TWSE Cash Market, 如 2330, 6285, 5483, 0050):
 *    - 一般交易 (盤中)：09:00 ~ 13:30
 *    - 盤後定價交易：14:00 ~ 14:30
 *    - 其餘時間全面休市 (CLOSED)
 */

export type InstrumentClass =
  | 'STOCK_FUTURES'
  | 'INDEX_FUTURES'
  | 'INDEX_OPTIONS'
  | 'STOCK_OPTIONS'
  | 'CASH_EQUITY'
  | 'US_EQUITY'
  | 'COMMODITY_FUTURES'
  | 'CRYPTO_24_7'
  | 'WARRANT';

export interface InstrumentClockResult {
  symbol: string;
  instrumentClass: InstrumentClass;
  classLabel: string;
  marketSession: 'TRADING' | 'CLOSED';
  sessionName: string;
  nextSessionTime: string;
  isTradingNow: boolean;
  canTradeNow: boolean;
  hasNightTrading: boolean;
  twTimeStr: string;
  twDateStr: string;
  tradingRules: string;
}

// 臺灣期交所官方納入盤後交易 (夜盤 17:25~05:00) 之個股期貨名單
// 注意：中小型股票期貨 (如 6285F 啟碁、5483F 中美晶、2634F 漢翔) 期交所目前未納入夜盤，僅有日盤！
export const TAIFEX_NIGHT_STOCK_FUTURES = new Set([
  '2330', '2330F', 'CDF', // 台積電期
  '2317', '2317F', 'DHF', // 鴻海期
  '2454', '2454F', 'DVF', // 聯發科期
  '2303', '2303F', 'CCF', // 聯電期
  '2603', '2603F', 'CZF', // 長榮期
  '2382', '2382F', 'QDF', // 廣達期
  '3231', '3231F', 'DJF', // 緯創期
  '2609', '2609F', 'CPF', // 陽明期
]);

export function classifyInstrument(symbol: string, category?: string): InstrumentClass {
  const sym = (symbol || '').toUpperCase().trim();

  // 0. 加密貨幣與穩定幣 24/7 (BTC, ETH, USDT, USDC, SOL, BNB, DOGE)
  if (
    category === 'crypto' ||
    ['BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'BNB', 'DOGE', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT'].includes(sym)
  ) {
    return 'CRYPTO_24_7';
  }

  // 1. 指數期貨 (TX, MTX, TMF)
  if (sym === 'TX' || sym === 'MTX' || sym === 'TMF' || sym.startsWith('TXF') || sym.startsWith('MXF')) {
    return 'INDEX_FUTURES';
  }

  // 2. 指數選擇權 (TXO)
  if (sym.startsWith('TXO')) {
    return 'INDEX_OPTIONS';
  }

  // 3. 股票期貨 (如 6285F, 5483F, 2634F, CDF, DHF, CZF, CCF, DVF, QDF, IJF, OQF, 或 category === 'futures')
  if (
    category === 'futures' ||
    sym.endsWith('F') ||
    ['CDF', 'DHF', 'CZF', 'CCF', 'DVF', 'QDF', 'IJF', 'OQF'].includes(sym)
  ) {
    return 'STOCK_FUTURES';
  }

  // 4. 股票選擇權 (如 CCO)
  if (category === 'options' || sym.startsWith('CCO')) {
    return 'STOCK_OPTIONS';
  }

  // 5. 權證
  if (category === 'warrants' || (sym.length === 6 && /^\d{5}[P|Q|C]$/.test(sym))) {
    return 'WARRANT';
  }

  // 6. 美股複委託
  if (category === 'us_stocks' || ['NVDA', 'AAPL', 'TSLA', 'TSM', 'MSFT', 'GOOGL', 'AMZN', 'QQQ', 'SPY', 'SOXX'].includes(sym)) {
    return 'US_EQUITY';
  }

  // 7. 全球大宗原物料商品期貨 (CME/NYMEX/ICE/LME)
  if (
    category === 'commodities' ||
    ['CL', 'BZ', 'NG', 'RB', 'GC', 'SI', 'PL', 'PA', 'ZS', 'ZC', 'ZW', 'ZL', 'ZM', 'KC', 'SB', 'CC', 'OJ', 'CT', 'HG', 'ALI', 'NI', 'ZN', 'LE', 'HE', 'GF'].includes(sym)
  ) {
    return 'COMMODITY_FUTURES';
  }

  // 8. 現貨 (現股、ETF、債券)
  return 'CASH_EQUITY';
}

export function getInstrumentTradingClock(
  symbol: string,
  category?: string,
  targetDate: Date = new Date()
): InstrumentClockResult {
  const instClass = classifyInstrument(symbol, category);
  const symClean = (symbol || '').toUpperCase().trim();

  // Taiwan local time evaluation
  const twFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = twFormatter.formatToParts(targetDate);
  const partMap: Record<string, string> = {};
  parts.forEach(p => (partMap[p.type] = p.value));

  const twDateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const twTimeStr = `${partMap.hour}:${partMap.minute}:${partMap.second}`;

  const twDate = new Date(`${twDateStr}T${twTimeStr}+08:00`);
  const day = twDate.getDay(); // 0 is Sunday, 6 is Saturday
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const timeNum = hour * 100 + minute;

  const isWeekend = day === 0 || (day === 6 && timeNum >= 500) || (day === 1 && timeNum < 500);

  // ─────────────────────────────────────────────────────────────
  // 0. 加密貨幣與穩定幣 (Crypto 24/7: BTC, ETH, USDT, USDC)
  // ─────────────────────────────────────────────────────────────
  if (instClass === 'CRYPTO_24_7') {
    const isStable = ['USDT', 'USDC'].includes(symClean) || symClean.includes('USD');
    const classLabel = isStable ? '美元穩定幣 (24/7 資金停泊)' : '加密貨幣 (24/7 高波動)';
    return {
      symbol,
      instrumentClass: 'CRYPTO_24_7',
      classLabel,
      marketSession: 'TRADING',
      sessionName: '🟢 市場開放 · 24/7 全天候交易',
      nextSessionTime: '24/7 全年無休 (永不收盤)',
      isTradingNow: true,
      canTradeNow: true,
      hasNightTrading: true,
      twTimeStr,
      twDateStr,
      tradingRules: isStable
        ? '美元穩定幣 (目標價值 ≈ US$1)，24/7 隨時可進行資金停泊、避險換匯與資產結算。'
        : '幣安 (Binance) 開放市場 24/7 永續即時撮合，支援市價/限價自主建倉與平倉損益累計。',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 1. 股票期貨 (Stock Futures: 6285F, 5483F, CDF, DHF, CZF...)
  // ─────────────────────────────────────────────────────────────
  if (instClass === 'STOCK_FUTURES' || instClass === 'STOCK_OPTIONS') {
    const classLabel = '股票期貨 (TAIFEX)';
    const hasNightTrading = TAIFEX_NIGHT_STOCK_FUTURES.has(symClean) || TAIFEX_NIGHT_STOCK_FUTURES.has(symClean.replace(/F$/, ''));
    const tradingRules = hasNightTrading
      ? '一般交易 08:45–13:45 ｜ 盤後夜盤 17:25–05:00'
      : '一般交易 08:45–13:45 (期交所此標的未納入夜盤)';

    if (isWeekend) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'CLOSED',
        sessionName: '週末休市 (非交易時段)',
        nextSessionTime: '週一 08:45 (日盤開盤)',
        isTradingNow: false,
        canTradeNow: false,
        hasNightTrading,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    // 一般交易時段 (日盤): 08:45 ~ 13:45
    const isDayOpen = day >= 1 && day <= 5 && timeNum >= 845 && timeNum < 1345;

    if (isDayOpen) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'TRADING',
        sessionName: '股票期貨日盤撮合中 (08:45~13:45)',
        nextSessionTime: '13:45 (日盤收盤)',
        isTradingNow: true,
        canTradeNow: true,
        hasNightTrading,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    // 盤後交易時段 (夜盤): 17:25 ~ 05:00 (僅限適用契約，如台積電期、鴻海期)
    if (hasNightTrading) {
      const isNightOpen =
        (day >= 1 && day <= 5 && timeNum >= 1725) ||
        (day >= 2 && day <= 6 && timeNum < 500);

      if (isNightOpen) {
        return {
          symbol,
          instrumentClass: instClass,
          classLabel,
          marketSession: 'TRADING',
          sessionName: '股票期貨夜盤撮合中 (17:25~05:00)',
          nextSessionTime: '05:00 (夜盤收盤)',
          isTradingNow: true,
          canTradeNow: true,
          hasNightTrading: true,
          tradingRules,
          twTimeStr,
          twDateStr,
        };
      }

      if (timeNum >= 1345 && timeNum < 1725) {
        return {
          symbol,
          instrumentClass: instClass,
          classLabel,
          marketSession: 'CLOSED',
          sessionName: '日夜盤中場清算 (非交易時段 13:45~17:25)',
          nextSessionTime: '17:25 (夜盤開盤)',
          isTradingNow: false,
          canTradeNow: false,
          hasNightTrading: true,
          tradingRules,
          twTimeStr,
          twDateStr,
        };
      }
    } else {
      // 無夜盤之股票期貨 (如 6285F 啟碁、5483F 中美晶)
      if (timeNum >= 1345) {
        return {
          symbol,
          instrumentClass: instClass,
          classLabel,
          marketSession: 'CLOSED',
          sessionName: '今日一般交易已結束 (此契約無夜盤)',
          nextSessionTime: '明日 08:45 (日盤開盤)',
          isTradingNow: false,
          canTradeNow: false,
          hasNightTrading: false,
          tradingRules,
          twTimeStr,
          twDateStr,
        };
      }
    }

    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'CLOSED',
      sessionName: '早盤前清算 (非交易時段 05:00~08:45)',
      nextSessionTime: '08:45 (日盤開盤)',
      isTradingNow: false,
      canTradeNow: false,
      hasNightTrading,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 股價指數期貨與選擇權 (Index Futures / Options: TX, MTX, TXO)
  // ─────────────────────────────────────────────────────────────
  if (instClass === 'INDEX_FUTURES' || instClass === 'INDEX_OPTIONS') {
    const classLabel = instClass === 'INDEX_FUTURES' ? '指數期貨 (TAIFEX)' : '指數選擇權 (TAIFEX)';
    const tradingRules = '一般交易 08:45–13:45 ｜ 盤後夜盤 15:00–05:00';

    if (isWeekend) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'CLOSED',
        sessionName: '週末休市 (非交易時段)',
        nextSessionTime: '週一 08:45 (日盤開盤)',
        isTradingNow: false,
        canTradeNow: false,
        hasNightTrading: true,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    // 一般交易時段 (日盤): 08:45 ~ 13:45
    const isDayOpen = day >= 1 && day <= 5 && timeNum >= 845 && timeNum < 1345;

    // 盤後交易時段 (夜盤): 15:00 ~ 05:00 (指數期貨為 15:00 開盤)
    const isNightOpen =
      (day >= 1 && day <= 5 && timeNum >= 1500) ||
      (day >= 2 && day <= 6 && timeNum < 500);

    if (isDayOpen) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'TRADING',
        sessionName: '指數期貨日盤撮合中 (08:45~13:45)',
        nextSessionTime: '13:45 (日盤收盤)',
        isTradingNow: true,
        canTradeNow: true,
        hasNightTrading: true,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    if (isNightOpen) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'TRADING',
        sessionName: '指數期貨夜盤撮合中 (15:00~05:00 隨美股跳動)',
        nextSessionTime: '05:00 (夜盤收盤)',
        isTradingNow: true,
        canTradeNow: true,
        hasNightTrading: true,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    // 13:45 ~ 15:00 中場清算
    if (timeNum >= 1345 && timeNum < 1500) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'CLOSED',
        sessionName: '日夜盤中場清算 (非交易時段 13:45~15:00)',
        nextSessionTime: '15:00 (夜盤開盤)',
        isTradingNow: false,
        canTradeNow: false,
        hasNightTrading: true,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'CLOSED',
      sessionName: '早盤前休息 (非交易時段 05:00~08:45)',
      nextSessionTime: '08:45 (日盤開盤)',
      isTradingNow: false,
      canTradeNow: false,
      hasNightTrading: true,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 美股複委託現貨 (US Stocks: NYSE / NASDAQ)
  // ─────────────────────────────────────────────────────────────
  if (instClass === 'US_EQUITY') {
    const classLabel = '美股複委託 (NYSE/NASDAQ)';
    const tradingRules = '美股常規交易 21:30–04:00 (台灣時間) / 1股起下單·即時台幣圈存';
    const isUsWeekend = day === 0 || (day === 6 && timeNum >= 400) || (day === 1 && timeNum < 2130);
    const isUsOpen = !isUsWeekend && ((timeNum >= 2130) || (timeNum < 400));

    if (isUsOpen) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'TRADING',
        sessionName: '美股常規盤撮合中 (21:30~04:00)',
        nextSessionTime: '04:00 (美股收盤)',
        isTradingNow: true,
        canTradeNow: true,
        hasNightTrading: false,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'CLOSED',
      sessionName: '美股收盤定格 (支援預約圈存委託)',
      nextSessionTime: isUsWeekend ? '週一 21:30 (美股開盤)' : '今晚 21:30 (美股開盤)',
      isTradingNow: false,
      canTradeNow: true, // 複委託隨時允許預先圈存下單
      hasNightTrading: false,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 全球大宗原物料商品期貨 (Commodity Futures: CME/NYMEX/ICE/LME)
  // ─────────────────────────────────────────────────────────────
  if (instClass === 'COMMODITY_FUTURES') {
    const classLabel = '全球原物料期貨 (CME/NYMEX/ICE)';
    const tradingRules = '全天候約23小時撮合 (06:00~次日05:00) / 雙向多空·台幣保證金結算';
    const isCommodityWeekend = (day === 6 && timeNum >= 500) || day === 0 || (day === 1 && timeNum < 600);
    const isDailyBreak = timeNum >= 500 && timeNum < 600;
    const isTrading = !isCommodityWeekend && !isDailyBreak;

    if (isTrading) {
      return {
        symbol,
        instrumentClass: instClass,
        classLabel,
        marketSession: 'TRADING',
        sessionName: '全球原物料撮合中 (24H國際連線)',
        nextSessionTime: '05:00 (每日結算清算)',
        isTradingNow: true,
        canTradeNow: true,
        hasNightTrading: true,
        tradingRules,
        twTimeStr,
        twDateStr,
      };
    }

    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'CLOSED',
      sessionName: isDailyBreak ? '每日清算休息 (05:00~06:00)' : '週末休市定格',
      nextSessionTime: isDailyBreak ? '06:00 (開盤)' : '週一 06:00 (開盤)',
      isTradingNow: false,
      canTradeNow: true,
      hasNightTrading: true,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. 現貨股票 / ETF / 債券 / 權證 (TWSE Cash Market)
  // ─────────────────────────────────────────────────────────────
  const classLabel = instClass === 'WARRANT' ? '認購/認售權證 (TWSE)' : '現貨股票/ETF (TWSE)';
  const tradingRules = '集中市場 09:00–13:30 (無夜盤交易)';

  if (isWeekend || day === 0 || day === 6) {
    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'CLOSED',
      sessionName: '週末休市 (非交易時段)',
      nextSessionTime: '週一 09:00 (集中市場開盤)',
      isTradingNow: false,
      canTradeNow: false,
      hasNightTrading: false,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  // 盤中交易: 09:00 ~ 13:30
  if (timeNum >= 900 && timeNum < 1330) {
    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'TRADING',
      sessionName: '集中市場盤中撮合中 (09:00~13:30)',
      nextSessionTime: '13:30 (收盤撮合)',
      isTradingNow: true,
      canTradeNow: true,
      hasNightTrading: false,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  // 盤後定價: 14:00 ~ 14:30
  if (timeNum >= 1400 && timeNum < 1430) {
    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'TRADING',
      sessionName: '盤後定價交易中 (14:00~14:30)',
      nextSessionTime: '14:30 (盤後收盤)',
      isTradingNow: true,
      canTradeNow: true,
      hasNightTrading: false,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  if (timeNum >= 1330 && timeNum < 1400) {
    return {
      symbol,
      instrumentClass: instClass,
      classLabel,
      marketSession: 'CLOSED',
      sessionName: '等待盤後定價 (非交易時段 13:30~14:00)',
      nextSessionTime: '14:00 (盤後定價交易)',
      isTradingNow: false,
      canTradeNow: false,
      hasNightTrading: false,
      tradingRules,
      twTimeStr,
      twDateStr,
    };
  }

  return {
    symbol,
    instrumentClass: instClass,
    classLabel,
    marketSession: 'CLOSED',
    sessionName: '收盤定格 (非交易時段)',
    nextSessionTime: '明日 09:00 (開盤撮合)',
    isTradingNow: false,
    canTradeNow: false,
    hasNightTrading: false,
    tradingRules,
    twTimeStr,
    twDateStr,
  };
}

export function getMarketSessionOverview(targetDate: Date = new Date()) {
  const stockClock = getInstrumentTradingClock('2330', 'stocks', targetDate);
  const stockFutClock = getInstrumentTradingClock('2330F', 'futures', targetDate);
  const smallFutClock = getInstrumentTradingClock('6285F', 'futures', targetDate);
  const txClock = getInstrumentTradingClock('TX', 'futures', targetDate);
  const btcClock = getInstrumentTradingClock('BTC', 'crypto', targetDate);

  return {
    twTimeStr: stockClock.twTimeStr,
    twDateStr: stockClock.twDateStr,
    isCashOpen: stockClock.canTradeNow,
    isFuturesDayOpen: stockFutClock.isTradingNow && stockFutClock.sessionName.includes('日盤'),
    isFuturesNightOpen: stockFutClock.isTradingNow && stockFutClock.sessionName.includes('夜盤'),
    isTxNightOpen: txClock.isTradingNow && txClock.sessionName.includes('夜盤'),
    isCryptoOpen: true,
    stockClock,
    stockFutClock,
    smallFutClock,
    txClock,
    btcClock,
  };
}

// ─────────────────────────────────────────────────────────────
// 🌐 全球金融市場交易時鐘雷達 (Global Financial Market Radar)
// 涵蓋：🇹🇼 台灣市場、🇺🇸 美國市場、🛢️ 全球大宗商品、🌐 24/7 加密貨幣
// ─────────────────────────────────────────────────────────────
export interface GlobalMarketStation {
  id: string;
  name: string;
  category: 'TW' | 'US' | 'COMMODITIES' | 'CRYPTO';
  categoryLabel: string;
  symbol: string;
  icon: string;
  isOpen: boolean;
  statusBadge: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS' | 'OPEN_24_7';
  statusText: string;
  tradingHours: string;
  note: string;
}

export function getGlobalMarketStatusOverview(targetDate: Date = new Date()): {
  asiaTaipeiTime: string;
  asiaTaipeiDate: string;
  markets: GlobalMarketStation[];
} {
  const twOverview = getMarketSessionOverview(targetDate);
  const usClock = getInstrumentTradingClock('NVDA', 'us_stocks', targetDate);
  const clClock = getInstrumentTradingClock('CL', 'commodities', targetDate);
  const gcClock = getInstrumentTradingClock('GC', 'commodities', targetDate);

  const markets: GlobalMarketStation[] = [
    // 🏛️ 台灣市場 (Taiwan Markets)
    {
      id: 'tw_stocks',
      name: '台股 (TWSE/TPEx)',
      category: 'TW',
      categoryLabel: '🏛️ 台灣市場',
      symbol: '2330 / 0050',
      icon: '🇹🇼',
      isOpen: twOverview.isCashOpen,
      statusBadge: twOverview.isCashOpen ? 'OPEN' : 'CLOSED',
      statusText: twOverview.isCashOpen ? '🟢 OPEN (盤中撮合)' : '🔴 CLOSED (已收盤)',
      tradingHours: '09:00 ~ 13:30 (盤後定價 14:00~14:30)',
      note: '現貨股票、ETF、債券',
    },
    {
      id: 'tw_futures',
      name: '台指期貨 (TAIFEX)',
      category: 'TW',
      categoryLabel: '🏛️ 台灣市場',
      symbol: 'TX / MTX / TMF',
      icon: '⚡',
      isOpen: twOverview.isFuturesDayOpen || twOverview.isTxNightOpen,
      statusBadge: (twOverview.isFuturesDayOpen || twOverview.isTxNightOpen) ? 'OPEN' : 'CLOSED',
      statusText: twOverview.isFuturesDayOpen
        ? '🟢 OPEN (日盤撮合)'
        : twOverview.isTxNightOpen
        ? '🟢 OPEN (夜盤交易中)'
        : '🔴 CLOSED (中場清算/休市)',
      tradingHours: '日盤 08:45~13:45 ｜ 夜盤 15:00~次日05:00',
      note: '大台、小台、微台、選擇權',
    },

    // 🇺🇸 美國市場 (US Markets)
    {
      id: 'us_stocks',
      name: '美股 (NYSE / NASDAQ)',
      category: 'US',
      categoryLabel: '🇺🇸 美國市場',
      symbol: 'NVDA / AAPL / TSLA',
      icon: '🇺🇸',
      isOpen: usClock.isTradingNow,
      statusBadge: usClock.isTradingNow ? 'OPEN' : 'CLOSED',
      statusText: usClock.isTradingNow ? '🟢 OPEN (常規交易)' : '🔴 CLOSED (已休市)',
      tradingHours: '夏令 21:30~04:00 (台北時間)',
      note: '全球權值科技龍頭與 ETF',
    },

    // 🛢️ 全球大宗商品 (Global Commodities)
    {
      id: 'cme_oil',
      name: '紐約輕原油 (WTI)',
      category: 'COMMODITIES',
      categoryLabel: '🛢️ 大宗商品',
      symbol: 'CL / NYMEX',
      icon: '🛢️',
      isOpen: clClock.isTradingNow,
      statusBadge: clClock.isTradingNow ? 'OPEN' : 'CLOSED',
      statusText: clClock.isTradingNow ? '🟢 OPEN (電子盤撮合)' : '🔴 CLOSED (週末/非交易)',
      tradingHours: '週一至週五 06:00 ~ 次日 05:00 (每天中場休息1小時)',
      note: '全球能源定價核心基準',
    },
    {
      id: 'cme_gold',
      name: '紐約黃金期貨 (Gold)',
      category: 'COMMODITIES',
      categoryLabel: '🛢️ 大宗商品',
      symbol: 'GC / COMEX',
      icon: '🥇',
      isOpen: gcClock.isTradingNow,
      statusBadge: gcClock.isTradingNow ? 'OPEN' : 'CLOSED',
      statusText: gcClock.isTradingNow ? '🟢 OPEN (電子盤撮合)' : '🔴 CLOSED (週末休市)',
      tradingHours: '週一至週五 06:00 ~ 次日 05:00',
      note: '避險資產之王',
    },
    {
      id: 'cme_soybeans',
      name: '芝加哥黃豆 (Soybeans)',
      category: 'COMMODITIES',
      categoryLabel: '🛢️ 大宗商品',
      symbol: 'ZS / CBOT',
      icon: '🌾',
      isOpen: clClock.isTradingNow,
      statusBadge: clClock.isTradingNow ? 'OPEN' : 'CLOSED',
      statusText: clClock.isTradingNow ? '🟢 OPEN (電子盤撮合)' : '🔴 CLOSED (週末/非交易)',
      tradingHours: '週一至週五 08:00 ~ 次日 02:20',
      note: '全球農產期貨之王',
    },
    {
      id: 'ice_coffee',
      name: '咖啡期貨 (Coffee C)',
      category: 'COMMODITIES',
      categoryLabel: '🛢️ 大宗商品',
      symbol: 'KC / ICE',
      icon: '☕',
      isOpen: clClock.isTradingNow,
      statusBadge: clClock.isTradingNow ? 'OPEN' : 'CLOSED',
      statusText: clClock.isTradingNow ? '🟢 OPEN (電子盤撮合)' : '🔴 CLOSED (週末/非交易)',
      tradingHours: '週一至週五 16:15 ~ 次日 01:30',
      note: '軟性民生商品定價指標',
    },

    // 🚀 24/7 高波動加密貨幣 (High-Volatility Crypto)
    {
      id: 'crypto_btc',
      name: '比特幣 (BTC/USDT)',
      category: 'CRYPTO',
      categoryLabel: '🚀 高波動加密資產',
      symbol: 'BTCUSDT',
      icon: '₿',
      isOpen: true,
      statusBadge: 'OPEN_24_7',
      statusText: '🟢 OPEN 24/7 (全天候交易)',
      tradingHours: '24/7 全年無休 (永不收盤)',
      note: '高波動主要加密資產 · 數位黃金',
    },
    {
      id: 'crypto_eth',
      name: '以太坊 (ETH/USDT)',
      category: 'CRYPTO',
      categoryLabel: '🚀 高波動加密資產',
      symbol: 'ETHUSDT',
      icon: 'Ξ',
      isOpen: true,
      statusBadge: 'OPEN_24_7',
      statusText: '🟢 OPEN 24/7 (全天候交易)',
      tradingHours: '24/7 全年無休 (永不收盤)',
      note: '智慧合約公鏈資產 · DeFi 結算',
    },

    // 🌐 全球加密美元穩定幣 (Global Crypto Stablecoins)
    {
      id: 'crypto_usdt',
      name: '泰達幣 (USDT)',
      category: 'CRYPTO',
      categoryLabel: '🌐 全球加密美元穩定幣',
      symbol: 'USDT',
      icon: '💵',
      isOpen: true,
      statusBadge: 'OPEN_24_7',
      statusText: '🟢 OPEN 24/7 (隨時資金停泊)',
      tradingHours: '24/7 全年無休 (目標價值 ≈ US$1)',
      note: '境外發行 · 全球交易對清算 · 目標 ≈ US$1',
    },
    {
      id: 'crypto_usdc',
      name: '數位美元 (USDC)',
      category: 'CRYPTO',
      categoryLabel: '🌐 全球加密美元穩定幣',
      symbol: 'USDC',
      icon: '🟣',
      isOpen: true,
      statusBadge: 'OPEN_24_7',
      statusText: '🟢 OPEN 24/7 (隨時資金停泊)',
      tradingHours: '24/7 全年無休 (目標價值 ≈ US$1)',
      note: 'Circle 美國合規審計 · 機構避險 · 目標 ≈ US$1',
    },

    // 🏛️ 台灣監理架構下的穩定幣 (Taiwan Regulated Compliant Stablecoin)
    {
      id: 'crypto_twdt',
      name: '新台幣穩定幣 (TWDT)',
      category: 'CRYPTO',
      categoryLabel: '🏛️ 台灣監理穩定幣',
      symbol: 'TWDT',
      icon: '🇹🇼',
      isOpen: true,
      statusBadge: 'OPEN_24_7',
      statusText: '🟢 OPEN 24/7 (隨時資金停泊)',
      tradingHours: '24/7 全年無休 (目標價值 ≈ NT$1)',
      note: '台灣金管會架構 · 100% 銀行信託隔離 · 零匯差',
    },
  ];

  return {
    asiaTaipeiTime: twOverview.twTimeStr,
    asiaTaipeiDate: twOverview.twDateStr,
    markets,
  };
}

// ─────────────────────────────────────────────────────────────
// 🚀 跨市場時間旅行站點 (Global Cross-Market Time Travel Stations)
// 讓學生一眼理解不同時段全球各市場開閉盤的連動關係！
// ─────────────────────────────────────────────────────────────
export interface TimeTravelStation {
  timeLabel: string;
  title: string;
  narrative: string;
  states: {
    twStock: boolean;
    twFutures: boolean;
    usStock: boolean;
    commodities: boolean;
    crypto: boolean;
  };
}

export const GLOBAL_TIMELINE_STATIONS: TimeTravelStation[] = [
  {
    timeLabel: '🇹🇼 09:30',
    title: '台北早盤高峰',
    narrative: '台股現貨與台指期貨熱烈撮合；美股已收盤休息；Crypto 依然 24/7 永續運轉。',
    states: { twStock: true, twFutures: true, usStock: false, commodities: true, crypto: true },
  },
  {
    timeLabel: '🇹🇼 13:30',
    title: '台股現貨收盤',
    narrative: '台股 13:30 收盤定格；台指期貨持續交易至 13:45 隨後進入 75 分鐘結算；Crypto 24/7 不受影響。',
    states: { twStock: false, twFutures: true, usStock: false, commodities: true, crypto: true },
  },
  {
    timeLabel: '🇹🇼 15:30',
    title: '台指夜盤開跑',
    narrative: '台指期夜盤 (15:00起) 重新開跑，緊盯美股盤前歐美期貨走勢；台股現貨休市；Crypto 24/7 即時連動。',
    states: { twStock: false, twFutures: true, usStock: false, commodities: true, crypto: true },
  },
  {
    timeLabel: '🇹🇼 21:30',
    title: '美股開盤 · 全球波動核心',
    narrative: '華爾街美股 (NYSE/NASDAQ) 開盤！台指期夜盤高度聯動美股震盪；Crypto 進入歐美主流交易高峰。',
    states: { twStock: false, twFutures: true, usStock: true, commodities: true, crypto: true },
  },
  {
    timeLabel: '🇹🇼 03:00',
    title: '華爾街深水區與商品結算',
    narrative: '美股下午盤激戰，台指期夜盤持續護航至次日 05:00；原油黃金電子盤活躍；Crypto 24/7 毫秒級跳動。',
    states: { twStock: false, twFutures: true, usStock: true, commodities: true, crypto: true },
  },
  {
    timeLabel: '🇹🇼 08:00',
    title: '晨間全球交接',
    narrative: '美股與台指夜盤收盤結算；全球傳統金融大多休息等待 08:45，唯獨 Crypto 依然 24/7 永不收盤！',
    states: { twStock: false, twFutures: false, usStock: false, commodities: false, crypto: true },
  },
];

export type UnifiedMarketStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'PRE_MARKET'
  | 'AFTER_HOURS'
  | 'OPEN_24_7';

/**
 * 24/7 加密貨幣市場核心判斷：全年無休，永不收盤
 * 注意：市場開放 ≠ 你的 API 一定有資料
 */
export function getCryptoMarketStatus(): UnifiedMarketStatus {
  return 'OPEN_24_7';
}


