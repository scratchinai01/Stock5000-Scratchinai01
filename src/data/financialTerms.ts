export type TermCategoryCode =
  | 'mkt'
  | 'trd'
  | 'ord'
  | 'fee'
  | 'cor'
  | 'ta'
  | 'fa'
  | 'chp'
  | 'fut'
  | 'opt'
  | 'etf'
  | 'wnt'
  | 'risk';

export interface FinancialTerm {
  id: string;
  t: string; // 繁體中文標題
  en?: string; // 英文縮寫或全稱
  c: TermCategoryCode; // 分類代碼
  s: string; // 一句話精準答案 (短模式 Tooltip / Sheet)
  long?: string; // 詳細說明 (日後擴充)
  ex?: string; // 實務案例 (日後擴充)
  rel?: string[]; // 關聯名詞 ID
  aliases?: string[]; // 同義詞/搜尋別名 (如 "除息" -> "現金股利")
}

export interface TermCategoryMeta {
  code: TermCategoryCode;
  name: string;
  icon: string;
  color: string;
  badgeName: string;
  description: string;
  expectedCount: number;
}

export const TERM_CATEGORIES: Record<TermCategoryCode, TermCategoryMeta> = {
  mkt: {
    code: 'mkt',
    name: '市場與大盤',
    icon: '🏛️',
    color: 'from-blue-600 to-indigo-600',
    badgeName: '大盤領航者',
    description: '涵蓋整體台股集中市場、店頭櫃買與總體運行環境',
    expectedCount: 34,
  },
  trd: {
    code: 'trd',
    name: '交易機制',
    icon: '⚙️',
    color: 'from-amber-600 to-yellow-600',
    badgeName: '撮合操盤手',
    description: '逐筆撮合、五檔買賣、零股即時撮合與交割清算制度',
    expectedCount: 38,
  },
  ord: {
    code: 'ord',
    name: '委託與操作',
    icon: '🛒',
    color: 'from-emerald-600 to-teal-600',
    badgeName: '下單執行官',
    description: '限價單、市價單、ROD/IOC/FOK委託條件與部位管控',
    expectedCount: 15,
  },
  fee: {
    code: 'fee',
    name: '費用稅務',
    icon: '🪙',
    color: 'from-orange-600 to-amber-600',
    badgeName: '精算精明家',
    description: '手續費折讓、證券交易稅、當沖降稅與二代健保扣繳',
    expectedCount: 10,
  },
  cor: {
    code: 'cor',
    name: '股利公司事件',
    icon: '🏢',
    color: 'from-purple-600 to-pink-600',
    badgeName: '除權息獵手',
    description: '除權除息、除權息參考價、庫藏股、減資與增資收購',
    expectedCount: 26,
  },
  ta: {
    code: 'ta',
    name: '技術分析',
    icon: '📈',
    color: 'from-rose-600 to-red-600',
    badgeName: 'K線形態師',
    description: 'K線形態、均線MA、KD、RSI、MACD與布林通道指標',
    expectedCount: 35,
  },
  fa: {
    code: 'fa',
    name: '基本面財報',
    icon: '📑',
    color: 'from-cyan-600 to-blue-600',
    badgeName: '價值分析師',
    description: 'EPS、本益比PE、淨值比PB、ROE毛利率與三大財務報表',
    expectedCount: 35,
  },
  chp: {
    code: 'chp',
    name: '籌碼與信用',
    icon: '💳',
    color: 'from-violet-600 to-purple-600',
    badgeName: '籌碼追蹤者',
    description: '三大法人、外資投信、融資融券、維持率與主力進出',
    expectedCount: 26,
  },
  fut: {
    code: 'fut',
    name: '期貨',
    icon: '⚡',
    color: 'from-red-600 to-orange-600',
    badgeName: '期貨先鋒隊',
    description: '大台小台、原始與維持保證金、結算日追繳與槓桿倍數',
    expectedCount: 24,
  },
  opt: {
    code: 'opt',
    name: '選擇權',
    icon: '🎯',
    color: 'from-fuchsia-600 to-pink-600',
    badgeName: '衍生品精算師',
    description: '買權Call、賣權Put、履約價、時間價值與隱含波動率',
    expectedCount: 20,
  },
  etf: {
    code: 'etf',
    name: 'ETF基金',
    icon: '🧺',
    color: 'from-green-600 to-emerald-600',
    badgeName: '指數配置家',
    description: '指數型被動投資、折溢價、高股息ETF與追蹤誤差',
    expectedCount: 16,
  },
  wnt: {
    code: 'wnt',
    name: '權證等衍生',
    icon: '🎫',
    color: 'from-sky-600 to-cyan-600',
    badgeName: '槓桿狙擊手',
    description: '認購認售權證、行使比例、實質槓桿與造市商責任',
    expectedCount: 5,
  },
  risk: {
    code: 'risk',
    name: '風險觀念',
    icon: '🛡️',
    color: 'from-slate-700 to-slate-900',
    badgeName: '風險守門人',
    description: '停損停利、資產配置、沉沒成本偏誤與黑天鵝事件防範',
    expectedCount: 16,
  },
};

export const FINANCIAL_TERMS: FinancialTerm[] = [
  // -------------------------------------------------------------
  // 1. 市場與大盤 (mkt, 34 筆)
  // -------------------------------------------------------------
  { id: 'taiex', t: '大盤加權指數', en: 'TAIEX', c: 'mkt', s: '加總所有上市股票市值編製的指數，代表整體台股漲跌。', aliases: ['加權指數', '大盤', '台股指數'], rel: ['qvstock', 'tpex_index'] },
  { id: 'qvstock', t: '權值股', c: 'mkt', s: '市值大、能牽動大盤漲跌的個股，如台積電、鴻海。', aliases: ['大型權值', '佔權值'], rel: ['taiex', 'large_cap'] },
  { id: 'sector', t: '類股', c: 'mkt', s: '依產業分的股票群組，如電子、金融、傳產、生技。', aliases: ['板塊', '產業類別'] },
  { id: 'tpex_index', t: '櫃買指數', en: 'TPEx', c: 'mkt', s: '代表上櫃（多為中小型）股票整體表現的指數。', aliases: ['OTC指數', '櫃買大盤'], rel: ['otc', 'small_cap'] },
  { id: 'listed', t: '上市', c: 'mkt', s: '在台灣證券交易所掛牌交易，門檻較高、流動性較好。', aliases: ['掛牌上市', '集中市場上市'], rel: ['otc', 'emerging'] },
  { id: 'otc', t: '上櫃', c: 'mkt', s: '在櫃買中心掛牌，多為成長型中小企業。', aliases: ['OTC', '上櫃公司'], rel: ['listed', 'emerging'] },
  { id: 'emerging', t: '興櫃', c: 'mkt', s: '尚未上市上櫃、由券商議價交易的股票，無漲跌幅限制，風險高。', aliases: ['興櫃股票', '議價市場'] },
  { id: 'auction_market', t: '集中市場', c: 'mkt', s: '由交易所集中撮合買賣的市場，上市股票的交易場所。', aliases: ['證券交易所', '上市市場'] },
  { id: 'otc_market', t: '店頭市場', c: 'mkt', s: '櫃買中心負責撮合的市場，包含上櫃與興櫃股票。', aliases: ['場外市場', '櫃買市場'] },
  { id: 'constituent', t: '成分股', c: 'mkt', s: '被納入某指數或ETF計算的個股。', aliases: ['指數成分', '持股明細'] },
  { id: 'turnover_rate', t: '周轉率', c: 'mkt', s: '一段期間成交量占流通股數的比例，越高代表換手越頻繁。', aliases: ['換手率', '周轉頻率'] },
  { id: 'large_cap', t: '大型股', c: 'mkt', s: '市值大的股票，價格通常較穩、法人參與多。', aliases: ['大盤股', '藍籌股'], rel: ['qvstock', 'small_cap'] },
  { id: 'small_cap', t: '小型股', c: 'mkt', s: '市值小的股票，波動與炒作風險通常較大。', aliases: ['中小型股', '小股本'] },
  { id: 'penny_stock', t: '雞蛋水餃股', c: 'mkt', s: '股價低於10元的低價股，多為基本面不佳，有下市風險。', aliases: ['低價股', '水餃股'] },
  { id: 'king_stock', t: '股王', c: 'mkt', s: '股價最高的一線公司，象徵產業地位，多為高單價高毛利企業。', aliases: ['高價股王', '股王爭霸'] },
  { id: 'bull', t: '多頭', c: 'mkt', s: '預期上漲、以買進為主力的市場氛圍。', aliases: ['看多', '作多', '多方'], rel: ['bear', 'bull_market'] },
  { id: 'bear', t: '空頭', c: 'mkt', s: '預期下跌、賣壓沉重的市場氛圍。', aliases: ['看空', '作空', '空方'], rel: ['bull', 'bear_market'] },
  { id: 'sideways', t: '盤整', c: 'mkt', s: '價格在區間內來回、沒有明顯方向的走勢。', aliases: ['橫盤', '區間震盪', '箱型整理'] },
  { id: 'bull_market', t: '牛市', c: 'mkt', s: '指數長期走揚的上升市場。', aliases: ['大多頭', '上升趨勢'] },
  { id: 'bear_market', t: '熊市', c: 'mkt', s: '指數長期走跌的下跌市場。', aliases: ['大空頭', '空頭市場'] },
  { id: 'volatility', t: '波動度', c: 'mkt', s: '價格起伏的劇烈程度，越高風險與機會越大。', aliases: ['波動率', '價格震盪'] },
  { id: 'closing_period', t: '尾盤', c: 'mkt', s: '接近收盤的時段（13:25–13:30），收盤價在此決定。', aliases: ['收盤時段', '最後五分鐘'] },
  { id: 'rotation', t: '類股輪動', c: 'mkt', s: '資金在不同產業間輪流進出，造成各類股輪流表現。', aliases: ['板塊輪動', '資金輪動'] },
  { id: 'stock_saving', t: '存股', c: 'mkt', s: '以長期持有、領股利為核心策略的投資方式。', aliases: ['價值存股', '存股族'] },
  { id: 'dca', t: '定期定額', en: 'DCA', c: 'mkt', s: '固定時間扣固定金額買股票或ETF，平滑買入成本。', aliases: ['定投', '定期扣款'] },
  { id: 'ipo_lottery', t: '股票抽籤', c: 'mkt', s: '新股上市前開放小額申購、隨機抽籤配售，中籤才扣款。', aliases: ['公開申購', '新股抽籤'] },
  { id: 'ipo', t: '新股掛牌(IPO)', en: 'IPO', c: 'mkt', s: '公司第一次公開發行股票並上市交易。', aliases: ['首次公開募股', '初次上市'] },
  { id: 'offer_price', t: '承銷價', c: 'mkt', s: '新股IPO時訂出的初次銷售價格。', aliases: ['發行價', '申購價'] },
  { id: 'book_building', t: '競價拍賣', c: 'mkt', s: 'IPO前由投資人出價競標、決定承銷價的機制。', aliases: ['競拍', '詢價圈購'] },
  { id: 'honeymoon', t: '蜜月期', c: 'mkt', s: '新股掛牌初期因籌碼少、話題多而波動劇烈的階段。', aliases: ['新股蜜月行情'] },
  { id: 'msci', t: 'MSCI調整', c: 'mkt', s: '外資指數公司調整成分股，納入或剔除常引來被動資金買賣。', aliases: ['摩根指數調整', 'MSCI季度調整'] },
  { id: 'hot_stock', t: '熱門股', c: 'mkt', s: '成交量與討論度極高的股票，價格波動劇烈。', aliases: ['人氣股', '焦點股'] },
  { id: 'leader_stock', t: '龍頭股', c: 'mkt', s: '產業中市值與市占率最大的指標公司。', aliases: ['產業龍頭', '領頭羊'] },
  { id: 'gift_shareholder', t: '股東會紀念品', c: 'mkt', s: '持有股票參加股東會可領的紀念品，是領股利的附加樂趣。', aliases: ['股東會禮品', '紀念品'] },

  // -------------------------------------------------------------
  // 2. 交易機制 (trd, 38 筆)
  // -------------------------------------------------------------
  { id: 'open_price', t: '開盤價', c: 'trd', s: '09:00開盤競價撮合出的第一筆價格。', aliases: ['開盤', '開市價'], rel: ['close_price', 'prev_close'] },
  { id: 'close_price', t: '收盤價', c: 'trd', s: '13:30收盤競價決定的最後價格，多數下單基準用它。', aliases: ['收盤', '最後成交價'], rel: ['open_price', 'prev_close'] },
  { id: 'prev_close', t: '昨收價', c: 'trd', s: '前一交易日的收盤價，漲跌幅與漲跌停都以它計算。', aliases: ['昨日收盤', '平盤價'], rel: ['limit_up', 'limit_down'] },
  { id: 'limit_up', t: '漲停板', c: 'trd', s: '當日允許的最高價（昨收×1.1），到了通常買不太到。', aliases: ['漲停', '鎖漲停'], rel: ['limit_down', 'price_limit'] },
  { id: 'limit_down', t: '跌停板', c: 'trd', s: '當日允許的最低價（昨收×0.9），到了通常賣不掉。', aliases: ['跌停', '鎖跌停'], rel: ['limit_up', 'price_limit'] },
  { id: 'price_limit', t: '漲跌幅限制', c: 'trd', s: '台股每日漲跌上限10%，期貨與其他商品另有規定。', aliases: ['10%限制', '漲跌幅'] },
  { id: 'tick_size', t: '升降單位(跳動點)', c: 'trd', s: '報價最小跳動間隔，如15–50元的股票每跳0.1元。', aliases: ['跳動點', 'Tick'] },
  { id: 'lot_size', t: '一張(整張)', c: 'trd', s: '股票最小交易單位，1張=1,000股。', aliases: ['整股', '千股', '一張股票'] },
  { id: 'odd_lot', t: '零股', c: 'trd', s: '不滿1張的股數，小資金也能買，累積滿1張可轉整張。', aliases: ['零星股', '碎股'] },
  { id: 'intraday_odd_lot', t: '盤中零股', c: 'trd', s: '09:00–13:30與大盤同步交易的零股市場，採即時撮合。', aliases: ['盤中零股交易', '零股即時撮合'] },
  { id: 'after_market', t: '盤後定價交易', c: 'trd', s: '14:00–14:30以當日收盤價一次性撮合的附屬市場。', aliases: ['盤後交易', '定價交易'] },
  { id: 'trading_hours', t: '交易時段', c: 'trd', s: '股票08:30起可掛單，09:00–13:25逐筆交易，13:25–13:30收盤競價。', aliases: ['交易時間', '開盤時段'] },
  { id: 'trial_match', t: '試撮', c: 'trd', s: '開盤前與收盤前試算的虛擬價格，僅供參考、不是成交價。', aliases: ['模擬撮合', '試撮合'] },
  { id: 'opening_auction', t: '開盤競價', c: 'trd', s: '09:00一次撮合決定開盤價的方式，08:30起可先掛單排隊。', aliases: ['早盤競價', '開市集合競價'] },
  { id: 'continuous_trading', t: '逐筆交易', c: 'trd', s: '09:00起隨到隨撮合的主交易制度，價格連續跳動。', aliases: ['連續撮合', '逐筆撮合'] },
  { id: 'closing_auction', t: '收盤競價', c: 'trd', s: '13:25–13:30集中撮合一次決定收盤價，此時段只能掛限價單。', aliases: ['尾盤競價', '收市撮合'] },
  { id: 'matching', t: '撮合', c: 'trd', s: '交易所把買單與賣單配對成交的動作。', aliases: ['配對成交', '撮合交易'] },
  { id: 'price_time_priority', t: '價格時間優先', c: 'trd', s: '買最高、賣最低者優先成交；同價位先掛的先成交。', aliases: ['優先原則', '先到先成交'] },
  { id: 'five_level_quote', t: '五檔報價', c: 'trd', s: '顯示最佳五個買價與賣價及數量，判斷盤中供需。', aliases: ['五檔', '買賣五檔', '委託簿'] },
  { id: 'bid_ask', t: '委買委賣', c: 'trd', s: '市場上排隊要買（委買）與要賣（委賣）的掛單。', aliases: ['買賣盤', '掛單隊列'] },
  { id: 'inside_outside', t: '內外盤', c: 'trd', s: '成交在買價算內盤（賣方較急），成交在賣價算外盤（買方較急）。', aliases: ['內盤', '外盤', '買賣力道'] },
  { id: 'spread', t: '買賣價差', c: 'trd', s: '最佳買價與賣價的差距，越小代表流動性越好。', aliases: ['價差', 'Bid-Ask Spread'] },
  { id: 'liquidity', t: '流動性', c: 'trd', s: '買賣是否容易成交且不吃虧的指標，冷門股流動性差。', aliases: ['變現性', '市場深度'] },
  { id: 'slippage', t: '滑價', c: 'trd', s: '實際成交價比預期差，常發生在市價單或流動性不足時。', aliases: ['滑點', '成交偏差'] },
  { id: 'order_cancel', t: '掛單與撤單', c: 'trd', s: '委託尚未成交可隨時取消；已成交無法撤銷。', aliases: ['撤單', '取消委託', '刪單'] },
  { id: 'settlement', t: '交割', c: 'trd', s: '買賣完成後錢券互換的程序，買方付款、賣方付券。', aliases: ['結算交割', '款券交割'] },
  { id: 't_plus_2', t: 'T+2交割', c: 'trd', s: '台股成交後第2個營業日完成款券交割。', aliases: ['T+2', '扣款日'] },
  { id: 'settlement_fund', t: '交割款', c: 'trd', s: '買進股票需在T+2備妥的款項，餘額不足即交割失敗。', aliases: ['交割金', '扣款金額'] },
  { id: 'default_settlement', t: '違約交割', c: 'trd', s: '未按時完成交割的違約行為，將被通報且3年內限制開戶。', aliases: ['違約', '跳票交割'] },
  { id: 'full_cash_delivery', t: '全額交割', c: 'trd', s: '風險警示股票須先繳足全額款券才能交易，流動性極差。', aliases: ['全額交割股', '預收款券股'] },
  { id: 'disposal_stock', t: '處置股票', c: 'trd', s: '交易異常被列入注意或處置的股票，處置期間分盤撮合、可能預收款券。', aliases: ['進水桶', '警示處置', '關禁閉'] },
  { id: 'uptick_rule', t: '平盤下不得放空', c: 'trd', s: '股價低於昨收時禁止放空，防止惡意砸盤。', aliases: ['平盤下放空限制', '借券賣出限制'] },
  { id: 'lock_limit', t: '漲停鎖死', c: 'trd', s: '大量買單排隊在漲停價，想買需排隊、想賣可秒成交（跌停相反）。', aliases: ['鎖死', '一字板'] },
  { id: 'auction_matching', t: '集合競價', c: 'trd', s: '收集一段時間的委託、一次撮合定出單一價格的方式。', aliases: ['批次撮合', '定期競價'] },
  { id: 'cooling_off', t: '瞬間價格穩定措施', c: 'trd', s: '價格瞬間劇變時暫緩撮合數秒的保護機制，用於期貨與部分商品。', aliases: ['防爆線', '冷卻措施'] },
  { id: 'order_report', t: '委託回報', c: 'trd', s: '下單後券商回傳的接受、改價、成交等狀態通知。', aliases: ['回報', '下單狀態'] },
  { id: 'inventory', t: '庫存(持股)', c: 'trd', s: '目前帳戶中持有的標的與股數。', aliases: ['持股', '持倉總覽'] },
  { id: 'avg_cost', t: '平均成本', c: 'trd', s: '多次買進後加權計算的每股持有成本。', aliases: ['持倉均價', '買入成本'] },

  // -------------------------------------------------------------
  // 3. 委託與操作 (ord, 15 筆)
  // -------------------------------------------------------------
  { id: 'limit_order', t: '限價單', c: 'ord', s: '指定價格才成交，掛太遠可能一直不成交，但價格可控。', aliases: ['限價', '指定價位'], rel: ['market_order', 'rod'] },
  { id: 'market_order', t: '市價單', c: 'ord', s: '不指定價格立即以最優價成交，快但可能滑價，冷門股不建議。', aliases: ['市價', '立即成交單'], rel: ['limit_order', 'slippage'] },
  { id: 'rod', t: 'ROD(當日有效單)', en: 'ROD', c: 'ord', s: '當日未成交自動取消的委託，收盤前均有效。', aliases: ['當日有效', '一般單'], rel: ['ioc', 'fok'] },
  { id: 'ioc', t: 'IOC(立即成交否則取消)', en: 'IOC', c: 'ord', s: '能成交多少算多少，剩餘未成交數量立即取消。', aliases: ['部分成交取消', '即時成交'], rel: ['rod', 'fok'] },
  { id: 'fok', t: 'FOK(全部成交否則取消)', en: 'FOK', c: 'ord', s: '必須一次全數成交，否則整筆委託直接取消。', aliases: ['全數成交取消', '全成或全撤'], rel: ['rod', 'ioc'] },
  { id: 'day_trade', t: '當日沖銷(現股當沖)', c: 'ord', s: '同日買進又賣出同一檔、只結算價差，需簽署風險預告書。', aliases: ['現股當沖', '當沖', '沖銷'] },
  { id: 'position', t: '部位', c: 'ord', s: '目前持有商品的數量與方向的總稱。', aliases: ['持倉', '倉位'] },
  { id: 'close_position', t: '平倉', c: 'ord', s: '把手上的部位反向了結，多單賣出、空單買回。', aliases: ['結清部位', '平掉'] },
  { id: 'add_position', t: '加碼', c: 'ord', s: '原有方向再加買，抬高部位規模或平均成本。', aliases: ['加倉', '買進更多'] },
  { id: 'reduce_position', t: '減碼', c: 'ord', s: '賣出一部分降低風險，保留剩餘部位獲利。', aliases: ['減倉', '獲利了結一部分'] },
  { id: 'open_position', t: '建倉', c: 'ord', s: '開立新的多頭或空頭部位，邁出交易第一步。', aliases: ['開倉', '建立部位'] },
  { id: 'conditional_order', t: '條件單(觸價單)', c: 'ord', s: '當市價達到指定觸發條件時，系統自動送出買賣委託。', aliases: ['智慧單', '觸價委託'] },
  { id: 'stop_loss_order', t: '停損單', c: 'ord', s: '跌破設定停損價位時自動市價或限價賣出以控制虧損。', aliases: ['止損單', '保命單'] },
  { id: 'take_profit_order', t: '停利單', c: 'ord', s: '達到預期獲利目標價位時自動賣出鎖定獲利。', aliases: ['止盈單', '目標獲利單'] },
  { id: 'trailing_stop', t: '移動停損', en: 'Trailing Stop', c: 'ord', s: '停損點隨最高價往上墊高，保護已累積的利潤。', aliases: ['動態停損', '追蹤停損'] },

  // -------------------------------------------------------------
  // 4. 費用稅務 (fee, 10 筆)
  // -------------------------------------------------------------
  { id: 'brokerage_fee', t: '券商手續費', c: 'fee', s: '法定上限千分之1.425，買進賣出皆收，多數券商有電子下單折讓。', aliases: ['手續費', '交易費'] },
  { id: 'transaction_tax', t: '證券交易稅', c: 'fee', s: '僅賣出時由政府課徵千分之3，ETF為千分之1。', aliases: ['證交稅', '股票稅'] },
  { id: 'day_trade_tax', t: '當沖降稅', c: 'fee', s: '現股當沖賣出證交稅減半為千分之1.5，鼓勵盤中流動性。', aliases: ['當沖半稅', '當沖稅率'] },
  { id: 'fee_discount', t: '手續費折讓', c: 'fee', s: '券商退回給投資人的手續費折扣（如6折、2.8折或退佣）。', aliases: ['手續費折扣', '退佣'] },
  { id: 'min_brokerage_fee', t: '最低手續費', c: 'fee', s: '單筆交易不滿券商規定金額時按最低收取（如1元或20元）。', aliases: ['低收費用', '零股低收'] },
  { id: 'nhi_supplementary_tax', t: '二代健保補充保費', c: 'fee', s: '單檔單次股利達到20,000元以上時，扣繳2.11%補充保費。', aliases: ['二代健保', '健保補充費'] },
  { id: 'dividend_income_tax', t: '股利綜合所得稅', c: 'fee', s: '股利可選擇併入個人綜合所得合併計稅，或採單一稅率28%分開計稅。', aliases: ['股利所得稅', '股利稅'] },
  { id: 'borrow_fee', t: '融券借券費', c: 'fee', s: '放空時向券商借股票需支付的融券手續費與借券利息。', aliases: ['借券費', '放空費用'] },
  { id: 'margin_interest', t: '融資利息', c: 'fee', s: '融資向券商借錢買股，持有期間按年息（約6%左右）計收的利息。', aliases: ['融資利息支出', '借款利息'] },
  { id: 'fut_exchange_tax', t: '期貨交易稅', c: 'fee', s: '期貨買賣雙方各課十萬分之2（大台、小台），成本遠低於現股。', aliases: ['期交稅', '期貨稅'] },

  // -------------------------------------------------------------
  // 5. 股利公司事件 (cor, 26 筆)
  // -------------------------------------------------------------
  { id: 'cash_dividend', t: '現金股利', c: 'cor', s: '公司將盈餘以現金形式直接發放給股東，俗稱「配息」。', aliases: ['配息', '領股息', '除息'], rel: ['stock_dividend', 'ex_dividend'] },
  { id: 'stock_dividend', t: '股票股利', c: 'cor', s: '公司發行新股票分配給股東，俗稱「配股」。', aliases: ['配股', '無償配股'], rel: ['cash_dividend', 'ex_right'] },
  { id: 'ex_dividend', t: '除息', c: 'cor', s: '扣除配發之現金股利後的價格重定日，當日股價相應扣除現金金額。', aliases: ['除息日', '除息扣價'], rel: ['cash_dividend', 'ex_dividend_price'] },
  { id: 'ex_right', t: '除權', c: 'cor', s: '配發股票股利後股本膨脹，當日開盤價依比例向下調整。', aliases: ['除權日', '除權除息'] },
  { id: 'ex_dividend_price', t: '除權息參考價', c: 'cor', s: '除息除權當天早上做為漲跌幅起算基準的計算價格。', aliases: ['參考價', '除權息基準價'] },
  { id: 'fill_dividend', t: '填息', c: 'cor', s: '除息後股價漲回除息前價格，股東才真正賺進股利。', aliases: ['填息完成', '走填息'] },
  { id: 'fill_right', t: '填權', c: 'cor', s: '除權後股價漲回除權前價位，享受股本擴大與資產增值。', aliases: ['填權完成'] },
  { id: 'discount_dividend', t: '貼息', c: 'cor', s: '除息後股價反而跌破除息參考價，賺了股息賠了價差。', aliases: ['貼權貼息', '貼息走勢'] },
  { id: 'dividend_yield', t: '殖利率', c: 'cor', s: '每股股利除以目前股價，是衡量領息回報率的核心指標。', aliases: ['現金殖利率', '股息率'] },
  { id: 'payout_ratio', t: '盈餘分配率', c: 'cor', s: '公司每賺1元EPS，拿出來配發給股東的股利百分比。', aliases: ['配息率', '配發率'] },
  { id: 'treasury_stock', t: '庫藏股', c: 'cor', s: '公司用自有資金自市場買回自家股票，常為護盤或轉讓員工。', aliases: ['買回庫藏股', '庫藏股實施'] },
  { id: 'capital_reduction', t: '減資', c: 'cor', s: '消除股份以退還股東股款（現金減資）或彌補虧損（虧損減資）。', aliases: ['現金減資', '瘦身減資'] },
  { id: 'cash_capital_increase', t: '現金增資(現增)', c: 'cor', s: '公司發行新股募集現金，常給予原股東與員工認購權。', aliases: ['現增', '發行新股'] },
  { id: 'shareholders_meeting', t: '股東常會', c: 'cor', s: '每年至少召開一次的股東集會，承認財報、表決股利與選舉董監。', aliases: ['股東會', '常會'] },
  { id: 'board_of_directors', t: '董事會', c: 'cor', s: '由全體董事組成，負責公司重大經營決策與股利政策研議。', aliases: ['董監事', '董事會決議'] },
  { id: 'last_buying_date', t: '最後買進日', c: 'cor', s: '欲參與除權息或股東會，最晚必須買進持有該股票的交易日。', aliases: ['過戶基準日前', '除息前買進'] },
  { id: 'record_date', t: '停止過戶日', c: 'cor', s: '交易所確定股東名冊的日子，此期間不得辦理過戶。', aliases: ['停過日', '停過期間'] },
  { id: 'dividend_payment_date', t: '股利發放日', c: 'cor', s: '現金股利真正匯入投資人銀行交割帳戶的日子。', aliases: ['入帳日', '發放現金'] },
  { id: 'private_placement', t: '私募', c: 'cor', s: '對特定人（如策略投資人）發行新股募集資金，三年內不得自由買賣。', aliases: ['私募現增', '私募股票'] },
  { id: 'public_tender_offer', t: '公開收購', c: 'cor', s: '收購方不經集中市場，向所有股東公開以固定價格收購股份。', aliases: ['公開收購案', '合意收購'] },
  { id: 'merger_acquisition', t: '併購(M&A)', c: 'cor', s: '企業間透過合併、收購股份或資產以擴大營運版圖。', aliases: ['股權收購', '公司合併'] },
  { id: 'spinoff', t: '分割上市', c: 'cor', s: '公司將旗下具潛力的業務獨立成子公司並推向掛牌上市。', aliases: ['業務分割', '小金雞上市'] },
  { id: 'earnings_call', t: '法說會', c: 'cor', s: '法人說明會，公司高層向機構投資人報告營運現況與展望。', aliases: ['法人說明會', '業績發表會'] },
  { id: 'monthly_revenue', t: '每月營收公告', c: 'cor', s: '台灣法規要求每月10日前公布上月合併營收，是最新動態指標。', aliases: ['營收公布', '月營收'] },
  { id: 'delisting', t: '下市(下櫃)', c: 'cor', s: '因財務困難、併購或自願終止而在交易所停止公開交易。', aliases: ['終止上市', '摘牌'] },
  { id: 'credit_rating', t: '信用評等', c: 'cor', s: '評等機構（如中華信評）對公司償債能力與財務體質的評估等級。', aliases: ['信評', '評級'] },

  // -------------------------------------------------------------
  // 6. 技術分析 (ta, 35 筆)
  // -------------------------------------------------------------
  { id: 'candlestick', t: 'K線(蠟燭線)', c: 'ta', s: '以開盤、最高、最低、收盤四價組成的柱狀圖，台股紅漲綠跌。', aliases: ['蠟燭線', '陰陽燭', 'K棒'] },
  { id: 'moving_average', t: '移動平均線(MA)', en: 'MA', c: 'ta', s: '過去一段時間收盤價的平均軌跡，如5日線、20日月線、季線。', aliases: ['均線', 'MA線'] },
  { id: 'golden_cross', t: '黃金交叉', c: 'ta', s: '短週期指標或均線由下往上突破長週期線，技術面視為買訊。', aliases: ['金叉', '向上交叉'] },
  { id: 'death_cross', t: '死亡交叉', c: 'ta', s: '短週期指標或均線由上往下跌破長週期線，技術面視為賣訊。', aliases: ['死叉', '向下交叉'] },
  { id: 'support_level', t: '支撐線', c: 'ta', s: '價格下跌至某價位時出現買盤承接、不易再跌的防守區。', aliases: ['支撐位', '下檔支撐'] },
  { id: 'resistance_level', t: '壓力線', c: 'ta', s: '價格上漲至某價位時出現解套與獲利賣壓、不易再漲的關卡。', aliases: ['壓力位', '上檔反壓'] },
  { id: 'kd_indicator', t: 'KD指標(隨機指標)', en: 'KD', c: 'ta', s: '衡量價格在近期區間強弱的指標，超買（>80）超賣（<20）。', aliases: ['隨機指標', 'KD'] },
  { id: 'rsi_indicator', t: 'RSI指標(相對強弱)', en: 'RSI', c: 'ta', s: '以一定期間內上漲幅度占總波幅比例衡量買盤力道強弱。', aliases: ['相對強弱指標', 'RSI'] },
  { id: 'macd_indicator', t: 'MACD指標', en: 'MACD', c: 'ta', s: '利用雙指數移動平均線計算出的趨勢動能指標，柱狀體看強弱。', aliases: ['指數平滑異同移動平均線'] },
  { id: 'bollinger_bands', t: '布林通道', en: 'BBands', c: 'ta', s: '由20日均線加減2倍標準差構成的上下軌道，判斷波動區間。', aliases: ['布林帶', '保齡寶加通道'] },
  { id: 'trading_volume', t: '成交量', c: 'ta', s: '當日或當期買賣雙方搓合成交的總股數或口數，量先價行。', aliases: ['交易量', '成交口數'] },
  { id: 'volume_price_correlation', t: '量價關係', c: 'ta', s: '成交量與股價變動的搭配，如量增價漲、量縮價跌、量價背離。', aliases: ['量價配合', '量價分析'] },
  { id: 'breakout', t: '突破', c: 'ta', s: '股價強勢漲過盤整區頂部或長條壓力線，常展開新波段。', aliases: ['向上突破', '突破頸線'] },
  { id: 'breakdown', t: '跌破', c: 'ta', s: '股價跌破盤整區底部或關鍵支撐線，常引發多殺多停損。', aliases: ['向下跌破', '失守支撐'] },
  { id: 'gap_up', t: '跳空開高', c: 'ta', s: '當日開盤價大幅高於前日最高價，中間留下未成交空白缺口。', aliases: ['跳空大漲', '向上跳空'] },
  { id: 'gap_down', t: '跳空開低', c: 'ta', s: '當日開盤價大幅低於前日最低價，顯示市場極度悲觀。', aliases: ['跳空重挫', '向下跳空'] },
  { id: 'gap_fill', t: '回補缺口', c: 'ta', s: '後續價格波動走勢填滿先前跳空所留下的價格空白區間。', aliases: ['回補', '封閉缺口'] },
  { id: 'neckline', t: '頸線', c: 'ta', s: '形態學中連接波段高低點的基準線，跌破或突破具決定性。', aliases: ['形態頸線', '多空分水嶺'] },
  { id: 'head_and_shoulders', t: '頭肩頂/頭肩底', c: 'ta', s: '由左肩、頭部、右肩組成的經典反轉形態，跌破頸線確認。', aliases: ['頭肩形態', '頭肩頂'] },
  { id: 'double_bottom', t: 'W底(雙重底)', c: 'ta', s: '兩次回測同一支撐低點不破後反彈，突破頸線為起漲訊號。', aliases: ['雙底', '雙重底'] },
  { id: 'double_top', t: 'M頭(雙重頂)', c: 'ta', s: '兩次衝擊高點不過後拉回，跌破頸線為頭部反轉確立。', aliases: ['雙頂', '雙重頂'] },
  { id: 'doji', t: '十字線(十字星)', c: 'ta', s: '開盤價與收盤價幾乎相同，上下留影線，象徵多空力道均衡猶豫。', aliases: ['十字星', '十字K棒'] },
  { id: 'upper_shadow', t: '上影線', c: 'ta', s: '最高價與收盤/開盤價間的細線，越長代表高檔遭逢賣壓沉重。', aliases: ['上鬚', '長上影線'] },
  { id: 'lower_shadow', t: '下影線', c: 'ta', s: '最低價與開盤/收盤價間的細線，越長代表低檔買盤承接力道強。', aliases: ['下鬚', '長下影線'] },
  { id: 'quarterly_line', t: '生命線(季線)', c: 'ta', s: '60日移動平均線，機構法人判斷中長期多空趨勢的最核心指標。', aliases: ['60MA', '季線'] },
  { id: 'annual_line', t: '年線', c: 'ta', s: '240日移動平均線，反映一整年持有者的平均成本。', aliases: ['240MA', '牛熊分界線'] },
  { id: 'overbought', t: '超買', c: 'ta', s: '指標處於極高檔位（如KD>80），短線漲幅過大有拉回修正風險。', aliases: ['過熱', '買超超買'] },
  { id: 'oversold', t: '超賣', c: 'ta', s: '指標處於極低檔位（如KD<20），短線跌幅過大隨時可能技術反彈。', aliases: ['超跌', '賣超超賣'] },
  { id: 'divergence', t: '背離', c: 'ta', s: '股價創新高而技術指標未創新高（頂背離），常為趨勢反轉前兆。', aliases: ['指標背離', '頂背離', '底背離'] },
  { id: 'fibonacci_retracement', t: '黃金分割回調(費波那契)', c: 'ta', s: '利用0.382、0.5、0.618等比例推算波段拉回支撐或反彈壓力。', aliases: ['費氏回調', '黃金分割線'] },
  { id: 'consolidation_box', t: '箱型整理', c: 'ta', s: '價格在平行的高低區間內規律上下跳動，靜待帶量方向突破。', aliases: ['箱體', '矩形區間'] },
  { id: 'ascending_triangle', t: '上升三角形', c: 'ta', s: '水平壓力線與向上墊高的支撐線交會，多方氣勢逐日增強。', aliases: ['三角收斂', '上升三角'] },
  { id: 'parabolic_sar', t: '拋物線轉向(SAR)', en: 'SAR', c: 'ta', s: '根據時間與價格加速原理設計的追隨停損與趨勢翻轉指標。', aliases: ['SAR指標', '停損點轉向'] },
  { id: 'atr_indicator', t: '真實波動幅度(ATR)', en: 'ATR', c: 'ta', s: '衡量市場在特定週期內的絕對波動範圍，常用於設定動態停損點。', aliases: ['真實波幅', 'ATR'] },
  { id: 'channel_line', t: '趨勢軌道線', c: 'ta', s: '順著高點連線與低點平行線建立的價格通道，掌握波段規律。', aliases: ['趨勢線', '上升軌道', '下降軌道'] },

  // -------------------------------------------------------------
  // 7. 基本面財報 (fa, 35 筆)
  // -------------------------------------------------------------
  { id: 'eps', t: '每股盈餘(EPS)', en: 'EPS', c: 'fa', s: '公司稅後淨利除以在外流通股數，代表每一股賺了多少錢。', aliases: ['每股利潤', 'EPS'], rel: ['pe', 'net_income'] },
  { id: 'pe', t: '本益比', en: 'P/E', c: 'fa', s: '股價除以EPS，代表投資該股票需要幾年才能回本。', aliases: ['市盈率', 'PE倍數'], rel: ['eps', 'pb'] },
  { id: 'pb', t: '股價淨值比', en: 'P/B', c: 'fa', s: '股價除以每股淨值，小於1通常代表股價低於公司清算淨資產。', aliases: ['市淨率', 'PB比'], rel: ['nav_per_share', 'pe'] },
  { id: 'roe', t: '股東權益報酬率(ROE)', en: 'ROE', c: 'fa', s: '稅後淨利除以股東權益，巴菲特最看重的公司賺錢效率指標。', aliases: ['淨資產回報率', 'ROE'] },
  { id: 'roa', t: '資產報酬率(ROA)', en: 'ROA', c: 'fa', s: '稅後淨利除以資產總額，衡量公司運用所有資產創造利潤的效率。', aliases: ['總資產收益率', 'ROA'] },
  { id: 'gross_margin', t: '毛利率', c: 'fa', s: '營業毛利占營業收入的百分比，反映產品或服務的競爭壁壘。', aliases: ['毛利比率', '毛利水準'] },
  { id: 'operating_margin', t: '營業利益率', c: 'fa', s: '本業獲利占營收比例，排除業外投資干擾，看本業賺不賺錢。', aliases: ['營業利潤率', '營益率'] },
  { id: 'net_profit_margin', t: '淨利率', c: 'fa', s: '最終稅後淨利占總營收比例，反映公司扣除所有成本後的利潤率。', aliases: ['稅後淨利率', '純利率'] },
  { id: 'revenue', t: '營業收入(營收)', c: 'fa', s: '公司在日常營業活動中銷售商品或提供勞務所獲取的總金額。', aliases: ['營收', '營業額', '總收入'] },
  { id: 'net_income', t: '稅後淨利', c: 'fa', s: '營收扣除營業成本、費用、業外損益及所得稅後的最終純益。', aliases: ['淨利潤', '稅後純益'] },
  { id: 'book_value', t: '每股淨值', c: 'fa', s: '公司總資產扣除總負債後除以股數，代表每股在帳面上的實質價值。', aliases: ['每股淨資產', '帳面價值'] },
  { id: 'debt_ratio', t: '負債比率', c: 'fa', s: '總負債除以總資產，衡量財務槓桿與長期償還債務風險。', aliases: ['資產負債率', '槓桿比'] },
  { id: 'current_ratio', t: '流動比率', c: 'fa', s: '流動資產除以流動負債，衡量公司一年內短期償債能力的充裕度。', aliases: ['流動性比率', '短期償債力'] },
  { id: 'quick_ratio', t: '速動比率', c: 'fa', s: '扣除存貨與預付費用後速動資產除以流動負債，檢視應急變現力。', aliases: ['酸性測試比率', '速動資產比'] },
  { id: 'free_cash_flow', t: '自由現金流(FCF)', en: 'FCF', c: 'fa', s: '營運現金流扣除資本支出後的剩餘現金，可用於分紅、還債。', aliases: ['現金自由度', '自由現金流量'] },
  { id: 'operating_cash_flow', t: '營業現金流', c: 'fa', s: '公司本業營運真正收進與支出的真金白銀，照妖鏡不造假。', aliases: ['營運現金流', '現金流量表'] },
  { id: 'capex', t: '資本支出', en: 'CapEx', c: 'fa', s: '用於購買廠房、機台設備或研發等長期資產的重大資金投入。', aliases: ['資本化支出', '設備投資'] },
  { id: 'inventory_turnover', t: '存貨周轉率', c: 'fa', s: '衡量庫存商品銷售與補貨效率，過低代表庫存積壓滯銷。', aliases: ['庫存周轉率', '存貨周轉天數'] },
  { id: 'accounts_receivable_turnover', t: '應收帳款周轉天數', c: 'fa', s: '銷售商品後平均需要多少天才能把現金貨款真正收回來。', aliases: ['收款天數', '應收帳款周轉'] },
  { id: 'yoy', t: '年增率(YoY)', en: 'YoY', c: 'fa', s: '與去年同一時期比較的增長百分比，消除季節性干擾。', aliases: ['同比', '年度成長率'] },
  { id: 'mom', t: '月增率(MoM)', en: 'MoM', c: 'fa', s: '與上一個月相比較的變動百分比，觀察短期即時動能。', aliases: ['環比', '月份增長率'] },
  { id: 'financial_reports', t: '三大財務報表', c: 'fa', s: '資產負債表（體質）、綜合損益表（賺賠）與現金流量表（血脈）。', aliases: ['三大表', '公司財報'] },
  { id: 'balance_sheet', t: '資產負債表', c: 'fa', s: '在特定時間點反映公司「擁有什麼資產」與「欠了什麼負債」的報表。', aliases: ['資產負債狀況', '資產表'] },
  { id: 'income_statement', t: '綜合損益表', c: 'fa', s: '記錄一定期間內營收、各項費用與最終淨利的成敗成績單。', aliases: ['損益表', '盈虧表'] },
  { id: 'cash_flow_statement', t: '現金流量表', c: 'fa', s: '詳細記錄營業、投資與籌資三種活動現金實際進出的動態表。', aliases: ['現金表', '金流動態表'] },
  { id: 'moat', t: '護城河(競爭優勢)', c: 'fa', s: '公司保護長期利潤不受競爭對手侵蝕的獨特優勢（專利、品牌、網絡）。', aliases: ['競爭壁壘', '經濟護城河'] },
  { id: 'pricing_power', t: '定價權', c: 'fa', s: '公司在調漲產品價格時，客戶仍不得不買且不影響銷量的能力。', aliases: ['定價能力', '漲價抗性'] },
  { id: 'dividend_growth', t: '股利成長', c: 'fa', s: '公司連續多年調升每股配發現金股利的紀錄，反映獲利穩健提升。', aliases: ['連續配息成長', '股利續航力'] },
  { id: 'peg_ratio', t: '本益成長比(PEG)', en: 'PEG', c: 'fa', s: '本益比除以盈餘複合成長率，尋找成長型低估潛力股（<1為佳）。', aliases: ['PEG', '成長本益比'] },
  { id: 'goodwill', t: '商譽', c: 'fa', s: '併購公司時收購價高於被併公司淨資產的溢價部分，若劣化需提列減損。', aliases: ['商譽資產', '商譽減損'] },
  { id: 'r_and_d_expense', t: '研發費用比率', c: 'fa', s: '研發費用占總營收之比例，科技半導體與醫藥產業的核心命脈。', aliases: ['研發佔比', 'R&D費用'] },
  { id: 'operating_cycle', t: '營業循環週期', c: 'fa', s: '從投入現金購買原料存貨到最終收回現金貨款所需的總天數。', aliases: ['營業週期', '現金周轉期'] },
  { id: 'contingent_liability', t: '或有負債', c: 'fa', s: '如訴訟或保證背書，未來可能引發重大賠償負債的潛在隱藏風險。', aliases: ['潛在負債', '或有損失'] },
  { id: 'non_operating_income', t: '業外損益', c: 'fa', s: '本業之外如賣地、處分股票、匯兌利得等一次性收入或虧損。', aliases: ['業外收入', '業外投資損益'] },
  { id: 'ebitda', t: '息稅折舊攤銷前盈餘', en: 'EBITDA', c: 'fa', s: '排除利息、稅款與無現金折舊攤銷後，衡量核心現金獲利能力。', aliases: ['EBITDA', '營業毛現金力'] },

  // -------------------------------------------------------------
  // 8. 籌碼與信用 (chp, 26 筆)
  // -------------------------------------------------------------
  { id: 'three_institutions', t: '三大法人', c: 'chp', s: '外資、投信、自營商三種大資金機構的統稱，主導台股行情。', aliases: ['法人動向', '三大機構'] },
  { id: 'foreign_investors', t: '外資', c: 'chp', s: '海外機構投資人與主權基金，資金雄厚，偏好大型權值股。', aliases: ['外國法人', 'QFII', '外資買賣超'] },
  { id: 'investment_trust', t: '投信', c: 'chp', s: '國內基金經理人，季底有做帳拚績效行情，偏好潛力中小型股。', aliases: ['國內基金', '本土投信', '投信作帳'] },
  { id: 'proprietary_dealers', t: '自營商', c: 'chp', s: '券商用自己公司的自有資金進行股票期權短線買賣獲利。', aliases: ['券商自營', '自營部'] },
  { id: 'net_buy_sell', t: '買賣超', c: 'chp', s: '買進金額減去賣出金額，正數為買超（流入）、負數為賣超（流出）。', aliases: ['外資買超', '法人買超'] },
  { id: 'margin_trading', t: '融資', c: 'chp', s: '向券商借錢買股票（自備4成自備款、借6成），槓桿約2.5倍。', aliases: ['資買', '借錢買股', '信用融資'] },
  { id: 'short_selling_credit', t: '融券', c: 'chp', s: '向券商借股票賣出（自備9成保證金），預期股價下跌回補獲利。', aliases: ['券賣', '放空股票', '借券賣出'] },
  { id: 'maintenance_ratio', t: '融資維持率', c: 'chp', s: '融資持股現值除以融資借款金額的百分比，低於130%將遭發追繳令。', aliases: ['維持率', '擔保維持率', '融資斷頭線'] },
  { id: 'margin_call', t: '追繳通知(追繳令)', c: 'chp', s: '維持率低於130%時券商發出通知，要求T+2日內補足保證金差額。', aliases: ['追繳保證金', '融資追繳'] },
  { id: 'liquidation_stop', t: '斷頭(強制平倉)', c: 'chp', s: '未在限期內補繳追繳款，券商於開盤強制以市價拋售你的股票。', aliases: ['強制處分', '斷頭賣出'] },
  { id: 'short_squeeze', t: '軋空(嘎空)', c: 'chp', s: '融券放空者眾多時，股價飆漲迫使空頭不斷停損買回推升漲勢。', aliases: ['嘎空', '軋空行情', '空頭踩踏'] },
  { id: 'margin_squeeze', t: '軋融資(斷頭殺多)', c: 'chp', s: '主力刻意壓低股價打斷融資維持率，引發連鎖斷頭多殺多賣壓。', aliases: ['多殺多', '殺融資'] },
  { id: 'shareholding_distribution', t: '股權分散表(千張大戶)', c: 'chp', s: '集保中心每週公布不同持股級距股東人數，千張大戶比率最關鍵。', aliases: ['集保庫存', '千張大戶比例'] },
  { id: 'major_holders', t: '主力', c: 'chp', s: '擁有龐大資金能左右特定個股短期走勢的幕後大資金或特定買盤。', aliases: ['大戶', '市場大咖'] },
  { id: 'retail_investors', t: '散戶', c: 'chp', s: '資金規模較小、決策易受情緒與新聞左右的一般個人投資者。', aliases: ['散戶大軍', '小股民'] },
  { id: 'securities_lending', t: '借券交易', c: 'chp', s: '外資等機構投資人透過交易所系統出借或借入大量股票以供避險。', aliases: ['借券', '標借'] },
  { id: 'short_interest_ratio', t: '資券比(券資比)', c: 'chp', s: '融券餘額占融資餘額的百分比，券資比過高（>30%）常易引發軋空。', aliases: ['券資比', '信用對沖比'] },
  { id: 'compulsory_short_covering', t: '融券強制回補', c: 'chp', s: '股東常會與除權息前法定必須強制買回融券股票以確定股東身分。', aliases: ['強制回補日', '融券停止賣出'] },
  { id: 'insider_holding', t: '內部人持股', c: 'chp', s: '董事、監察人、經理人及大股東持股，持股比例高代表利益一致。', aliases: ['董監持股', '內部人'] },
  { id: 'insider_pledge', t: '董監質押比', c: 'chp', s: '董監事把手上股票拿去銀行抵押借錢的比率，過高（>50%）有斷頭風險。', aliases: ['股票質押', '質押比率'] },
  { id: 'branch_tracking', t: '分點券商追蹤', c: 'chp', s: '觀察買賣特定股票的券商營業部（如地緣分點、神秘總公司）。', aliases: ['分點明細', '主力分點'] },
  { id: 'margin_balance', t: '融資餘額', c: 'chp', s: '市場或個股目前累積尚未償還的融資總張數或總金額。', aliases: ['融資張數', '資額增減'] },
  { id: 'short_balance', t: '融券餘額', c: 'chp', s: '市場或個股目前累積尚未回補的融券放空總張數。', aliases: ['融券張數', '空單餘額'] },
  { id: 'wash_sale', t: '洗盤(震盪洗浮額)', c: 'chp', s: '主力拉升前刻意劇烈震盪，洗出意志不堅定的短線散戶浮額。', aliases: ['洗浮額', '震盪洗盤'] },
  { id: 'pump_and_dump', t: '倒貨(拉高出貨)', c: 'chp', s: '主力拉抬股價配合利多消息大舉將庫存賣給追高散戶的作手手法。', aliases: ['出貨', '殺尾盤倒貨'] },
  { id: 'lock_up_shares', t: '鎖碼', c: 'chp', s: '主力大戶收購大量在外流通籌碼並鎖在庫存，使市面籌碼枯竭好拉抬。', aliases: ['籌碼集中', '鎖籌碼'] },

  // -------------------------------------------------------------
  // 9. 期貨 (fut, 24 筆)
  // -------------------------------------------------------------
  { id: 'tx_futures', t: '台指期(大台TX)', en: 'TX', c: 'fut', s: '台灣加權指數期貨，每跳動1點價值新台幣200元，槓桿約20倍。', aliases: ['大台', '台股期貨'], rel: ['mtx_futures', 'initial_margin'] },
  { id: 'mtx_futures', t: '小台指(小台MTX)', en: 'MTX', c: 'fut', s: '大台規格的四分之一，每跳動1點價值新台幣50元，門檻親民。', aliases: ['小台', '微型台指'], rel: ['tx_futures', 'margin_multiplier'] },
  { id: 'futures_contract', t: '期貨合約', c: 'fut', s: '雙方約定於未來特定時間以約定價格買賣特定標的的標準化契約。', aliases: ['期貨契約', '期貨商品'] },
  { id: 'initial_margin', t: '原始保證金', c: 'fut', s: '建立期貨新部位前，期貨交易保證金專戶內必須具備的最低存款。', aliases: ['開倉保證金', '原始金'], rel: ['maintenance_margin_fut'] },
  { id: 'maintenance_margin_fut', t: '維持保證金(期貨)', c: 'fut', s: '持有期貨部位期間戶頭不可低於的底線，低於時將收到期貨追繳。', aliases: ['期貨維持率', '維持底線'], rel: ['initial_margin', 'margin_call_fut'] },
  { id: 'margin_call_fut', t: '盤後追繳(期貨)', c: 'fut', s: '每日13:45結算後保證金低於維持保證金時，需在次日12:00前補足至原始保證金。', aliases: ['期貨追繳', '補保證金'] },
  { id: 'margin_liquidation_fut', t: '期貨斷頭(盤中強制砍倉)', c: 'fut', s: '盤中若風險指標跌破25%，期貨商有權立即市價全數砍倉以防超額損失。', aliases: ['期貨砍倉', '強制平倉'] },
  { id: 'risk_indicator', t: '期貨風險指標', c: 'fut', s: '權益總值除以未沖銷所需保證金的百分比，低於100%危險，低於25%砍倉。', aliases: ['風險指標', '權益維持度'] },
  { id: 'settlement_day_fut', t: '結算日(結算價)', c: 'fut', s: '台指期於每月第三個星期三結束交易，並以當日大盤最後30分鐘均價結算。', aliases: ['月結算', '期貨結算日'] },
  { id: 'weekly_tx', t: '週台指(週期貨)', c: 'fut', s: '每週三掛牌並於次週三結算的短期合約，交易活絡、波動快速。', aliases: ['週小台', '週合約'] },
  { id: 'rollover', t: '轉倉', c: 'fut', s: '結算日前平倉近月份合約，並同時建立遠月份相同方向合約以延續部位。', aliases: ['換月', '移倉'] },
  { id: 'basis', t: '基差', c: 'fut', s: '現貨大盤指數與期貨價格之間的差額（現貨價－期貨價）。', aliases: ['正逆基差', '基差套利'] },
  { id: 'contango', t: '正價差', c: 'fut', s: '期貨價格高於現貨大盤價格，通常代表市場多頭預期樂觀。', aliases: ['期貨溢價', '升水'] },
  { id: 'backwardation', t: '逆價差', c: 'fut', s: '期貨價格低於現貨大盤價格，常見於除權息旺季或市場避險悲觀時。', aliases: ['期貨折價', '貼水'] },
  { id: 'open_interest', t: '未平倉量(OI)', en: 'OI', c: 'fut', s: '所有尚未經反向平倉或實物/現金結算的在倉合約總口數。', aliases: ['未平倉', '留倉口數'] },
  { id: 'futures_leverage', t: '期貨實質槓桿', c: 'fut', s: '標的合約總價值除以投入保證金，大台小台常見實質槓桿約15–20倍。', aliases: ['槓桿倍數', '合約槓桿'] },
  { id: 'single_stock_futures', t: '個股期貨(股票期貨)', c: 'fut', s: '以單一上市櫃股票為標的的期貨（1口等於2張現股股票，一口2000股）。', aliases: ['股期', '股票期貨'] },
  { id: 'long_futures', t: '多單(買進期貨)', c: 'fut', s: '看好大盤上漲，買進期貨合約，點數每漲1點賺取固定金額。', aliases: ['做多期貨', '期貨買方'] },
  { id: 'short_futures', t: '空單(賣出期貨)', c: 'fut', s: '看淡大盤下跌，賣出期貨合約，點數每跌1點賺取固定金額。', aliases: ['做空期貨', '放空期貨'] },
  { id: 'night_trading', t: '夜盤交易(盤後盤)', c: 'fut', s: '15:00至次日05:00交易，緊盯美股動態以即時對沖隔夜突發風險。', aliases: ['台指夜盤', '期貨盤後交易'] },
  { id: 'point_value', t: '一點價值(契約乘數)', c: 'fut', s: '期貨指數跳動1點對應的現金金額，大台為200元，小台為50元。', aliases: ['跳動價值', '點數乘數'] },
  { id: 'arbitrage_fut', t: '期現套利', c: 'fut', s: '當期貨與現貨出現過度異常價差時，同時一買一賣鎖定無風險利潤。', aliases: ['基差套利', '指數套利'] },
  { id: 'hedging_fut', t: '期貨避險', c: 'fut', s: '手握大量現貨股票時，放空對應價值的期貨以抵銷市場系統性下挫。', aliases: ['對沖避險', '現貨對沖'] },
  { id: 'circuit_breaker_fut', t: '動態價格穩定措施', c: 'fut', s: '防範肥手指錯單或流動性瞬間匱乏，限制單筆委託成交偏差點數。', aliases: ['期交所防肥手指', '價格防線'] },

  // -------------------------------------------------------------
  // 10. 選擇權 (opt, 20 筆)
  // -------------------------------------------------------------
  { id: 'call_option', t: '買權(看漲期權)', en: 'Call', c: 'opt', s: '付出權利金換取「未來在約定履約價買進標的」的權利。', aliases: ['看漲選擇權', 'Call'] },
  { id: 'put_option', t: '賣權(看跌期權)', en: 'Put', c: 'opt', s: '付出權利金換取「未來在約定履約價賣出標的」的權利。', aliases: ['看跌選擇權', 'Put'] },
  { id: 'strike_price', t: '履約價(執行價)', c: 'opt', s: '合約約定未來買進或賣出標的指數的固定價格標準。', aliases: ['行權價', '約定價'] },
  { id: 'premium_opt', t: '權利金', c: 'opt', s: '買方購買合約權利需支付給賣方的市場報價金額（台指選每點50元）。', aliases: ['期權金', '期權市價'] },
  { id: 'intrinsic_value', t: '內含價值', c: 'opt', s: '假設現在立刻履約所能獲得的實質利益（價外則內含價值為0）。', aliases: ['真實價值', '內在價值'] },
  { id: 'time_value', t: '時間價值', c: 'opt', s: '權利金扣除內含價值後的溢價，隨距離到期日縮短而加速歸零。', aliases: ['時間衰減', 'Theta價值'] },
  { id: 'in_the_money', t: '價內(ITM)', en: 'ITM', c: 'opt', s: '買權現價>履約價；賣權現價<履約價，合約具有實質內含價值。', aliases: ['價內合約', '實值期權'] },
  { id: 'at_the_money', t: '價平(ATM)', en: 'ATM', c: 'opt', s: '標的市價與履約價極為接近，時間價值最大、交易最熱絡。', aliases: ['平值期權', '價平點'] },
  { id: 'out_of_the_money', t: '價外(OTM)', en: 'OTM', c: 'opt', s: '買權現價<履約價；賣權現價>履約價，僅剩時間價值，到期未過變廢紙。', aliases: ['虛值期權', '價外合約'] },
  { id: 'implied_volatility', t: '隱含波動率(IV)', en: 'IV', c: 'opt', s: '從選擇權市場市價反推投資人對未來波動幅度的預期程度。', aliases: ['IV', '市場恐慌度'] },
  { id: 'delta_greeks', t: 'Delta(希臘值)', c: 'opt', s: '標的指數每變動1點時，選擇權權利金理論上變動的點數（0~1）。', aliases: ['Delta係數', '對沖比例'] },
  { id: 'theta_greeks', t: 'Theta(時間衰減率)', c: 'opt', s: '每經過一天，選擇權合約自然流失的時間價值金額。', aliases: ['時間耗損速度', 'Theta值'] },
  { id: 'buyer_seller', t: '買方與賣方', c: 'opt', s: '買方風險有限（賠權利金）、獲利無限；賣方獲利有限、承擔巨大跳空風險。', aliases: ['Buyer vs Seller', '買莊賣莊'] },
  { id: 'covered_call', t: '掩護性買權', en: 'Covered Call', c: 'opt', s: '持有股票現貨的同時，賣出價外買權賺取額外租金權利金收益。', aliases: ['備兌買權', '現貨賣Call'] },
  { id: 'straddle_strategy', t: '跨式組合策略', c: 'opt', s: '同時買進相同履約價的Call與Put，賭市場將出現單邊驚天大行情。', aliases: ['買進跨式', '跨式交易'] },
  { id: 'strangle_strategy', t: '勒式組合策略', c: 'opt', s: '同時買進不同履約價的價外Call與Put，建倉成本更低。', aliases: ['買進勒式', '寬跨式'] },
  { id: 'put_call_ratio', t: 'Put/Call比率(P/C Ratio)', c: 'opt', s: '全市場賣權未平倉量除以買權未平倉量，大於100%偏多、小於偏空。', aliases: ['PC Ratio', '莊家多空指標'] },
  { id: 'weekly_options', t: '週選擇權', c: 'opt', s: '每週三結算的極短期選擇權，週三當天時間價值以極快速度歸零。', aliases: ['週選', '週結算選擇權'] },
  { id: 'iron_condor', t: '鐵兀鷹策略', c: 'opt', s: '同時賣出價外Call與Put並在兩端買保險，賭指數在特定區間平穩盤整。', aliases: ['鐵鷹', '區間收租策略'] },
  { id: 'pin_risk', t: '結算日釘住風險', c: 'opt', s: '結算時指數極為貼近履約價，部位在價內與價外邊界劇烈跳動的結算風險。', aliases: ['針扎風險', '結算點賭局'] },

  // -------------------------------------------------------------
  // 11. ETF基金 (etf, 16 筆)
  // -------------------------------------------------------------
  { id: 'etf_basic', t: '指數股票型基金(ETF)', en: 'ETF', c: 'etf', s: '在證券交易所像股票一樣買賣的一籃子標的，分散單一個股風險。', aliases: ['ETF', '指數基金', '一籃子股票'] },
  { id: 'premium_discount', t: '折溢價', c: 'etf', s: 'ETF市價高於淨值為溢價（買貴）、市價低於淨值為折價（便宜）。', aliases: ['ETF溢價', 'ETF折價'] },
  { id: 'nav_etf', t: 'ETF淨值', c: 'etf', s: 'ETF所持有一籃子股票總市值扣除費用後除以總發行單位的真實價值。', aliases: ['實質淨值', '基金淨值'] },
  { id: 'tracking_error', t: '追蹤誤差', c: 'etf', s: 'ETF走勢報酬率與所追蹤之基準指數之間的偏離差距程度。', aliases: ['誤差率', '追蹤差異'] },
  { id: 'broad_market_etf', t: '市值型ETF', c: 'etf', s: '如0050、006208，依公司市值權重配置，與台股大盤走勢高度連動。', aliases: ['0050', '大盤ETF'] },
  { id: 'high_dividend_etf', t: '高股息ETF', c: 'etf', s: '如0056、00878，篩選高殖利率公司，適合追求穩定現金流投資人。', aliases: ['高息ETF', '配息型ETF', '00878'] },
  { id: 'bond_etf', t: '債券型ETF', c: 'etf', s: '如00679B美國公債ETF，配置各國公債或投資等級公司債，波動通常小於股票。', aliases: ['美債ETF', '長天期美債', '00679B'] },
  { id: 'thematic_etf', t: '主題型ETF', c: 'etf', s: '集中投資於半導體、AI、電動車、ESG等特定未來明星產業的ETF。', aliases: ['產業型ETF', '半導體ETF'] },
  { id: 'leveraged_etf', t: '槓桿型ETF(正2)', c: 'etf', s: '追蹤指數當日報酬2倍表現，僅適合單日操作，長期持有受複利耗損。', aliases: ['正2', '兩倍槓桿ETF'] },
  { id: 'inverse_etf', t: '反向型ETF(反1)', c: 'etf', s: '追蹤指數當日反向1倍表現，現貨市場下跌時可作為避險放空工具。', aliases: ['反1', '看空ETF'] },
  { id: 'expense_ratio', t: '總管理費(內扣費用)', c: 'etf', s: '由經理費與保管費組成，每日自動從基金淨值中扣除，非額外繳納。', aliases: ['內扣費', '總費用率'] },
  { id: 'rebalancing_etf', t: '定期成分股審核', c: 'etf', s: 'ETF每年定期按指數規則剔除不合格個股、納入新成分股的換股動作。', aliases: ['ETF換股', '成分股調整'] },
  { id: 'in_kind_creation', t: '申購與贖回', c: 'etf', s: '大戶與造市商直接拿一籃子股票向投信換取新發行ETF份額的初級市場。', aliases: ['初級市場申購', '實物申贖'] },
  { id: 'market_maker_etf', t: '流動性提供者(造市商)', c: 'etf', s: '負責在次級市場雙邊掛單買賣維持流動性、收斂折溢價的機構。', aliases: ['造市券商', '流動性提供商'] },
  { id: 'distribution_frequency', t: '配息頻率', c: 'etf', s: 'ETF發放股利的期程周期，如月配息、季配息、半年配或年配息。', aliases: ['月月配', '季配息'] },
  { id: 'equal_weight_etf', t: '等權重ETF', c: 'etf', s: '每檔成分股給予相同固定資金比例，不隨市值大小過度集中於單一巨頭。', aliases: ['均權型ETF', '等權指數'] },

  // -------------------------------------------------------------
  // 12. 權證等衍生 (wnt, 5 筆)
  // -------------------------------------------------------------
  { id: 'call_warrant', t: '認購權證', c: 'wnt', s: '付出少額權利金，擁有在到期日前以約定價向券商買進特定股票的權利。', aliases: ['權證多單', '看多權證'] },
  { id: 'put_warrant', t: '認售權證', c: 'wnt', s: '付出少額權利金，擁有在到期日前以約定價賣出特定股票給券商的放空權利。', aliases: ['權證空單', '看空權證'] },
  { id: 'exercise_ratio', t: '行使比例', c: 'wnt', s: '每一單位權證代表可換取標的股票的股數比例（如0.1代表10張權證換1張股票）。', aliases: ['換股比例', '履約比例'] },
  { id: 'effective_gearing', t: '實質槓桿(權證)', c: 'wnt', s: '標的股票漲跌1%時，權證價格預期漲跌的理論倍數，通常高達3–10倍。', aliases: ['權證槓桿', '真實槓桿'] },
  { id: 'warrant_time_decay', t: '權證時間價值損耗', c: 'wnt', s: '權證具有固定到期日，若標的股票橫盤不漲不跌，權證天天流失價值。', aliases: ['權證吃時間', '天期耗損'] },

  // -------------------------------------------------------------
  // 13. 風險觀念 (risk, 16 筆)
  // -------------------------------------------------------------
  { id: 'stop_loss_concept', t: '停損紀律', c: 'risk', s: '設定可承受的最大虧損比例（如-8%），跌到嚴格出場絕不凹單。', aliases: ['停損觀念', '斬倉紀律'], rel: ['risk_reward_ratio'] },
  { id: 'take_profit_concept', t: '停利紀律', c: 'risk', s: '達成預期報酬目標或技術反轉訊號時分批賣出，避免獲利回吐變成虧損。', aliases: ['停利觀念', '獲利了結'] },
  { id: 'risk_reward_ratio', t: '風報酬比(賺賠比)', c: 'risk', s: '預期獲利空間除以潛在最大承擔虧損，建議至少大於2:1再出手交易。', aliases: ['賺賠比', '盈虧比'] },
  { id: 'asset_allocation', t: '資產配置', c: 'risk', s: '將資金分散配置於股票、債券、大宗商品與現金，降低整體投資組合波動。', aliases: ['資產組合', '多元配置'] },
  { id: 'position_sizing', t: '部位規模控制', c: 'risk', s: '單筆交易或單一個股資金絕不超過總資產的特定比例（如20%），保證存活。', aliases: ['倉位控管', '資金分配'] },
  { id: 'black_swan', t: '黑天鵝事件', c: 'risk', s: '極難預測、發生機率極低但一旦爆發會造成市場毀滅性重挫的重大事件。', aliases: ['黑天鵝', '突發風暴'] },
  { id: 'sunk_cost_fallacy', t: '沉沒成本偏誤', c: 'risk', s: '因過去已經虧損大筆金額而不甘心停損，反而繼續加碼攤平越套越深。', aliases: ['不甘心效應', '沉沒成本'] },
  { id: 'loss_aversion', t: '損失厭惡', c: 'risk', s: '人性對同等金額虧損的痛苦感遠大於獲利的快樂感，導致抱不住獲利卻死抱虧損。', aliases: ['厭惡損失', '行為金融學'] },
  { id: 'averaging_down', t: '盲目攤平', c: 'risk', s: '股價破底持續買進以降低平均成本，在空頭走勢中極易演變成滅頂之災。', aliases: ['越跌越買', '向下攤平'] },
  { id: 'fomo', t: '錯失恐懼症(FOMO)', en: 'FOMO', c: 'risk', s: '害怕錯過大漲賺錢機會而盲目跟風追高在股價最高點的非理性衝動。', aliases: ['追高殺低', '恐慌追買'] },
  { id: 'systemic_risk', t: '系統性風險(市場風險)', c: 'risk', s: '戰爭、全球金融危機、疫情等影響整個大盤，無法透過分散持股完全消除。', aliases: ['大盤風險', '不可分散風險'] },
  { id: 'unsystemic_risk', t: '非系統性風險(個股風險)', c: 'risk', s: '單一公司掏空、財報造假或專利官司等特有風險，可透過分散投資有效化解。', aliases: ['個股風險', '可分散風險'] },
  { id: 'max_drawdown', t: '最大歷史回撤(MDD)', en: 'MDD', c: 'risk', s: '投資組合淨值從歷史最高點下跌到波段最低點的最大跌幅百分比。', aliases: ['MDD', '最大本金回檔'] },
  { id: 'liquidity_risk', t: '流動性風險', c: 'risk', s: '買進冷門小型股後想賣出時市場無人排隊承接，面臨折價求售甚至賣不掉的風險。', aliases: ['無量跌停', '變現困難'] },
  { id: 'leverage_risk', t: '過度槓桿風險', c: 'risk', s: '借入過多資金進行融資或高倍數期權交易，只要小幅波動即可導致本金歸零。', aliases: ['爆倉風險', '開過大槓桿'] },
  { id: 'information_asymmetry', t: '資訊不對稱', c: 'risk', s: '公司內部人或特定主力掌握重大未公開訊息，普通散戶往往處於資訊落後劣勢。', aliases: ['內線消息', '資訊落差'] },
];

// Helper dictionaries for lightning-fast O(1) lookup
export const TERMS_BY_ID: Map<string, FinancialTerm> = new Map(
  FINANCIAL_TERMS.map(t => [t.id.toLowerCase(), t])
);

export const TERMS_BY_TITLE: Map<string, FinancialTerm> = new Map(
  FINANCIAL_TERMS.map(t => [t.t.toLowerCase(), t])
);

// Map of alias to term id for intelligent alias searching
export const TERMS_BY_ALIAS: Map<string, FinancialTerm> = new Map();
FINANCIAL_TERMS.forEach(t => {
  TERMS_BY_ALIAS.set(t.t.toLowerCase(), t);
  if (t.en) TERMS_BY_ALIAS.set(t.en.toLowerCase(), t);
  if (t.aliases) {
    t.aliases.forEach(a => TERMS_BY_ALIAS.set(a.toLowerCase(), t));
  }
});

// Comprehensive search helper supporting title, english, aliases, and category
export function searchFinancialTerms(query: string, categoryFilter?: TermCategoryCode): FinancialTerm[] {
  const clean = query.trim().toLowerCase();
  let list = FINANCIAL_TERMS;

  if (categoryFilter) {
    list = list.filter(t => t.c === categoryFilter);
  }

  if (!clean) return list;

  return list.filter(item => {
    // 1. Direct title match
    if (item.t.toLowerCase().includes(clean)) return true;
    // 2. English match
    if (item.en && item.en.toLowerCase().includes(clean)) return true;
    // 3. Short explanation match
    if (item.s.toLowerCase().includes(clean)) return true;
    // 4. Aliases match (e.g. searching "除息" finds "現金股利")
    if (item.aliases && item.aliases.some(a => a.toLowerCase().includes(clean))) return true;
    return false;
  });
}
