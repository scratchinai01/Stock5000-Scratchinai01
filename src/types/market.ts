export type AssetCategory =
  | 'stocks'
  | 'bonds'
  | 'etfs'
  | 'futures'
  | 'options'
  | 'warrants'
  | 'us_stocks'
  | 'commodities'
  | 'crypto';

export type OrderAction =
  | 'BUY_STOCK'          // 現股買進
  | 'BUY_MARGIN_STOCK'   // 融資買進 (40% 自備款)
  | 'SHORT_SELL_STOCK'   // 融券放空 (90% 保證金)
  | 'BUY_BOND'           // 債券/債券ETF買進
  | 'BUY_ETF'            // ETF 買進
  | 'SHORT_SELL_ETF'     // ETF 融券賣出放空
  | 'BUY_FUTURES_LONG'   // 期貨做多買進一口/多口
  | 'SELL_FUTURES_SHORT' // 期貨放空賣出一口/多口
  | 'BUY_CALL_OPTION'    // 買進買權 (支付權利金看大漲)
  | 'BUY_PUT_OPTION'     // 買進賣權 (支付權利金看大跌)
  | 'SELL_CALL_OPTION'   // 賣出買權 (收取權利金看盤整或不漲，需保證金)
  | 'SELL_PUT_OPTION'    // 賣出賣權 (收取權利金看盤整或不跌，需保證金)
  | 'BUY_CALL_WARRANT'   // 認購權證買進 (槓桿做多)
  | 'BUY_PUT_WARRANT'    // 認售權證買進 (槓桿放空)
  | 'BUY_US_STOCK'       // 美股複委託買進 (1股起，美元報價折算台幣交割)
  | 'SELL_US_STOCK'      // 美股賣出平倉
  | 'BUY_COMMODITY_LONG' // 原物料期貨做多 (能源/貴金屬/農產/軟性/工業金屬/牲畜)
  | 'SELL_COMMODITY_SHORT' // 原物料期貨放空
  | 'BUY_CRYPTO'         // 加密貨幣現貨買進 (BTC/ETH 24/7 高波動資產)
  | 'SHORT_SELL_CRYPTO'  // 加密貨幣放空做空
  | 'BUY_STABLECOIN'     // 全球加密美元穩定幣買進 (USDT/USDC 資金停泊，目標價值 ≈ US$1)
  | 'SELL_STABLECOIN'    // 全球加密美元穩定幣結算贖回 (換回現金 NTD)
  | 'BUY_TW_STABLECOIN'  // 台灣監理新台幣穩定幣申購 (TWDT 目標價值 ≈ NT$1 · 100% 銀行信託隔離)
  | 'SELL_TW_STABLECOIN';// 台灣監理新台幣穩定幣贖回 (換回現金 NTD · 零匯差)

export interface CandlestickBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstrumentSpec {
  symbol: string;
  name: string;
  category: AssetCategory;
  price: number;              // 基準日/當前市價
  prevClose: number;          // 昨收價 (昨日收盤基準)
  limitUpPrice?: number;      // 漲停價 (昨收 x 1.10)
  limitDownPrice?: number;    // 跌停價 (昨收 x 0.90)
  isLimitUp?: boolean;        // 中午/當前是否已達漲停板
  isLimitDown?: boolean;      // 中午/當前是否已達跌停板
  change: number;
  changePercent: number;
  volume: number;
  unitLabel: string;          // 如 "張 (1000股)", "口 (點數x200)", "口 (點數x50)"
  multiplier: number;         // 單位乘數 (股票1000, 大台200, 小台50, 選擇權50, 權證1000)
  marginRequirement: number;  // 每口/張所需保證金 (期貨或賣出選擇權)
  strikePrice?: number;       // 履約價
  expiryDate?: string;        // 到期日/合約月份
  description: string;
  klineHistory: CandlestickBar[];
  open?: number;
  high?: number;
  low?: number;
  avgPrice?: number;
  turnover?: number;
  fiveBids?: { price: number; volume: number }[];
  fiveAsks?: { price: number; volume: number }[];
  fetchTime?: string;         // FinMind 官方資料抓取時間 (例如 "2026-10-02 14:30:00 (收盤撮合)")
  dataset?: string;           // FinMind 官方資料集 (例如 "TaiwanStockPrice")
  lastTradeTime?: string;     // 最後成交時間 (e.g. "13:44:52" 或 "13:30:00")
  dataReceivedTime?: string;  // 資料取得時間 (e.g. "14:10:05")
  marketSession?: 'TRADING' | 'CLOSED'; // 交易狀態: TRADING 盤中撮合中 或 CLOSED 非交易時段
  sessionName?: string;       // 時段名稱 (e.g. "股票期貨非交易時段 (13:45~17:25)")
  nextSessionTime?: string;   // 下一交易時段 (e.g. "17:25 (夜盤開盤)")
  dataSource?: string;        // 資料來源: FinMind 官方 API
  isMock?: boolean;           // 嚴格為 false
}

export interface Position {
  id: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  orderType: OrderAction;
  entryPrice: number;
  currentPrice: number;
  quantity: number;           // 張數或口數
  unitMultiplier: number;
  totalCostOrMargin: number;  // 實際佔用之現金本金或保證金
  notionalValue: number;      // 名目總市值
  unrealizedPnL: number;      // 未實現損益 (新台幣)
  unrealizedPnLPercent: number; // 報酬率 %
  marginRequirement?: number; // 期貨或賣出選擇權保證金
  entryDate: string;          // 下單基準日 (如 2026-09-21 13:30)
  strikePrice?: number;
  expiryDate?: string;
  notes?: string;             // 投資與避險理由
  lastTradeTime?: string;     // 最後成交時間 (e.g. "13:44:52")
  dataReceivedTime?: string;  // 資料取得時間 (e.g. "14:10:05")
  marketSession?: 'TRADING' | 'CLOSED'; // 交易狀態: TRADING or CLOSED
  sessionName?: string;       // 時段說明
  nextSessionTime?: string;   // 下一交易時段
  dataSource?: string;        // FinMind
  isMock?: boolean;
}

export interface TradeRecord {
  id: string;
  timestamp: string;
  dateLabel: string;          // 例如 "2026-09-21 13:30 (21號收盤價)"
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction;
  price: number;
  quantity: number;
  amount: number;             // 交易總值或支付金額
  marginUsed: number;
  realizedPnL?: number;
  rationale: string;
}

export interface ImmutableTransaction {
  transactionId: string;      // e.g. TX_20261001_000001
  uid: string;                // Permanent student UID (e.g. stu_8f73a91x)
  studentName: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  side: 'BUY' | 'SELL' | 'SHORT' | 'COVER';
  orderType: string;
  price: number;
  quantity: number;
  amount: number;
  marginUsed: number;
  timestamp: string;
  status: 'FILLED' | 'CANCELLED';
  rationale: string;
  schemaVersion: number;      // 3
  createdAt: number;
}

export interface BackupSnapshot {
  id: string;                 // e.g. SNAP_20261001_180000
  snapshotTime: string;
  timestamp: number;
  reason: string;
  totalStudents: number;
  totalTransactions: number;
  schemaVersion: number;
  studentsSnapshot: StudentProfile[];
}

export interface AuditLog {
  id: string;
  action: string;
  uid?: string;
  actorName: string;
  details: string;
  timestamp: string;
  createdAt: number;
}

export const DEFAULT_STUDENT_PASSWORD = 'money888';

export interface StudentProfile {
  id: string;
  uid?: string;               // Permanent fixed UID (stu_...) independent of student rename
  studentId?: string;         // Official student ID (e.g. S202601)
  schemaVersion?: number;     // Schema version (e.g. 3)
  role?: 'student' | 'teacher' | 'admin';
  status?: 'active' | 'archived';
  studentName: string;
  password?: string;          // 預設密碼 'money888'，學生可自行修改
  teamName: string;
  strategyBadge: string;
  isCurrentPlayer: boolean;
  initialCapital: number;     // 50,000,000
  availableCash: number;      // 可用現金
  marginDeposits: number;     // 凍結的期權保證金
  positions: Position[];
  tradeHistory: TradeRecord[];
  immutableTransactions?: ImmutableTransaction[];
  benchmarkDate: string;      // '2026-09-21'
  characterRole?: 'hedge_master' | 'tech_alpha' | 'macro_guardian' | 'options_arbitrage' | 'wealth_tycoon' | string;
  roleTitle?: string;
  avatarEmoji?: string;
  customMotto?: string;
  netAssetValue?: number;
  totalReturnPct?: number;
  realizedPnL?: number;       // 持續性累計已平倉已實現損益 (包含比特幣/期貨/股票)
  cumulativeRealizedPnL?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface PPTOutlineResponse {
  reportTitle: string;
  subtitle: string;
  executiveSummary: string;
  macroAnalysis: {
    title: string;
    interestRateCycle: string;
    inflationAndGdp: string;
    marketValuation: string;
  };
  industryTrends: {
    title: string;
    aiAndSemiconductors: string;
    bondsOutlook: string;
    hedgingNecessity: string;
  };
  assetAllocationStrategy: {
    title: string;
    coreEquityPercent: number;
    bondAllocationPercent: number;
    etfPassivePercent: number;
    futuresDerivativesPercent: number;
    optionsWarrantsPercent: number;
    strategyRationale: string;
  };
  derivativesHedgingPlan: {
    title: string;
    futuresRole: string;
    optionsRole: string;
    warrantsRole: string;
  };
  slides: Array<{
    slideNumber: number;
    title: string;
    subtitle: string;
    bulletPoints: string[];
    speechNote: string;
  }>;
}
