import type { OrderAction } from '../types/market';

/** 對帳單每一種部位的教學內容（持倉小學堂卡片） */
export interface PositionLesson {
  title: string; // 這筆部位叫什麼
  plain: string; // 白話說明
  win: string; // 什麼情況會賺
  lose: string; // 什麼情況會賠
  risks: string[]; // 風險提醒
  terms: string[]; // 相關名詞（名詞卡 id）
  unitWord: string; // 「每 1 元」或「每 1 點」
}

const STOCK_TERMS = ['lot_size', 'limit_up', 'brokerage_fee', 'transaction_tax', 'avg_cost'];

export const POSITION_LESSONS: Partial<Record<OrderAction, PositionLesson>> = {
  BUY_STOCK: {
    title: '現股買進（做多）',
    plain: '用自己的現金買進股票，成為公司的股東。股價上漲就賺錢，下跌就賠錢；有配息時還能領股利。',
    win: '股價高於你的買進成本',
    lose: '股價低於你的買進成本',
    risks: ['台股每天最多漲跌 10%，連續跌停時可能賣不掉。', '只買一檔股票，公司出事就會重傷，記得分散。', '賣出時要付手續費和千分之 3 證交稅。'],
    terms: STOCK_TERMS,
    unitWord: '元',
  },
  BUY_MARGIN_STOCK: {
    title: '融資買進（借錢做多）',
    plain: '自己出一部分錢、向券商借一部分錢買股票。賺賠都以整筆股票計算，所以報酬和虧損都被放大，還要付融資利息。',
    win: '股價上漲，扣掉利息後仍高於成本',
    lose: '股價下跌，虧損以整筆股票計算',
    risks: ['融資維持率低於 130% 會被追繳，沒補錢就會被強制賣出（斷頭）。', '借來的錢要付利息，持有越久成本越高。'],
    terms: ['margin_trading', 'maintenance_ratio', 'margin_call', 'leverage_risk'],
    unitWord: '元',
  },
  SHORT_SELL_STOCK: {
    title: '融券賣出（放空）',
    plain: '向券商借股票先賣掉，等股價下跌再買回來還，賺中間的價差。股價上漲就會虧損。',
    win: '股價低於你賣出的價格',
    lose: '股價高於你賣出的價格',
    risks: ['股價理論上可以一直漲，放空的虧損沒有上限。', '股東會、除權息前可能被強制回補。', '大家都放空時容易出現軋空，股價急漲。'],
    terms: ['short_selling_credit', 'short_squeeze', 'compulsory_short_covering', 'stop_loss_concept'],
    unitWord: '元',
  },
  BUY_ETF: {
    title: 'ETF 買進',
    plain: 'ETF 是一籃子股票（或債券）組成的基金，買一張就等於分散投資很多公司，常用來長期配置。',
    win: 'ETF 市價高於你的買進成本',
    lose: 'ETF 市價低於你的買進成本',
    risks: ['市價可能高於淨值（溢價），追高等於買貴。', '指數型 ETF 跟著大盤漲跌，大盤下跌時一樣會賠。'],
    terms: ['etf_basic', 'nav_etf', 'premium_discount', 'broad_market_etf'],
    unitWord: '元',
  },
  BUY_BOND: {
    title: '債券 ETF 買進',
    plain: '債券 ETF 持有一籃子債券，價格通常比股票穩定，常用來平衡股票的波動。',
    win: '利率下降時，債券價格通常上漲',
    lose: '利率上升時，債券價格通常下跌',
    risks: ['長天期債券對利率很敏感，升息時跌幅可能不小。', '投資美國公債 ETF 還有美元匯率的漲跌。'],
    terms: ['bond_etf', 'nav_etf', 'premium_discount', 'asset_allocation'],
    unitWord: '元',
  },
  SHORT_SELL_ETF: {
    title: 'ETF 融券賣出（放空）',
    plain: '借 ETF 先賣出，等價格下跌再買回，賺中間的價差。價格上漲就虧損。',
    win: 'ETF 價格低於你賣出的價格',
    lose: 'ETF 價格高於你賣出的價格',
    risks: ['放空的虧損沒有上限。', '放空也要付借券相關費用。'],
    terms: ['short_selling_credit', 'etf_basic', 'stop_loss_concept'],
    unitWord: '元',
  },
  BUY_FUTURES_LONG: {
    title: '期貨多單（買進期貨）',
    plain: '用一筆保證金買進期貨合約，賭指數（或股價）會上漲。每漲 1 點賺「1 點 × 契約乘數」，跌 1 點就賠一樣多。',
    win: '期貨價格高於你的進場價',
    lose: '期貨價格低於你的進場價',
    risks: ['期貨有槓桿，指數小小變動就是保證金的大幅漲跌。', '權益數低於維持保證金會被追繳，風險指標低於 25% 會被砍倉。', '合約有到期日，要延續就得轉倉。'],
    terms: ['tx_futures', 'point_value', 'initial_margin', 'futures_leverage', 'risk_indicator', 'settlement_day_fut'],
    unitWord: '點',
  },
  SELL_FUTURES_SHORT: {
    title: '期貨空單（賣出期貨）',
    plain: '用一筆保證金賣出期貨合約，賭指數（或股價）會下跌。每跌 1 點賺「1 點 × 契約乘數」，漲 1 點就賠一樣多。',
    win: '期貨價格低於你的進場價',
    lose: '期貨價格高於你的進場價',
    risks: ['期貨有槓桿，行情反向時虧損很快。', '跳空大漲時可能賠超過保證金。', '合約到期前要決定平倉或轉倉。'],
    terms: ['short_futures', 'point_value', 'initial_margin', 'futures_leverage', 'risk_indicator'],
    unitWord: '點',
  },
  BUY_CALL_OPTION: {
    title: '買進買權（Buy Call）',
    plain: '付權利金買下「到期時能用履約價買進」的權利，看好會大漲。最多只會賠掉付出的權利金。',
    win: '權利金上漲（通常是指數上漲、且越接近或超過履約價）',
    lose: '權利金下跌；到期時指數沒超過履約價，權利金歸零',
    risks: ['時間價值每天流失，盤整不動也會賠。', '價外合約到期可能變成 0。'],
    terms: ['call_option', 'premium_opt', 'strike_price', 'intrinsic_value', 'time_value', 'buyer_seller'],
    unitWord: '點',
  },
  BUY_PUT_OPTION: {
    title: '買進賣權（Buy Put）',
    plain: '付權利金買下「到期時能用履約價賣出」的權利，看壞會大跌，常被當成股票部位的保險。最多只會賠掉權利金。',
    win: '權利金上漲（通常是指數下跌、且越接近或低於履約價）',
    lose: '權利金下跌；到期時指數沒跌破履約價，權利金歸零',
    risks: ['時間價值每天流失，指數不跌也會賠。', '價外合約到期可能變成 0。'],
    terms: ['put_option', 'premium_opt', 'strike_price', 'intrinsic_value', 'time_value', 'buyer_seller'],
    unitWord: '點',
  },
  SELL_CALL_OPTION: {
    title: '賣出買權（Sell Call）',
    plain: '收權利金、承擔「買方要求履約時要賣給他」的義務，賭指數不會大漲。要繳保證金。',
    win: '權利金下跌（指數沒有大漲、時間流逝）',
    lose: '權利金上漲；指數大漲時虧損可能很大',
    risks: ['賺的最多就是收到的權利金，賠的可能是好幾倍。', '大漲行情時保證金可能不足而被追繳。'],
    terms: ['call_option', 'premium_opt', 'buyer_seller', 'time_value', 'leverage_risk'],
    unitWord: '點',
  },
  SELL_PUT_OPTION: {
    title: '賣出賣權（Sell Put）',
    plain: '收權利金、承擔「買方要求履約時要向他買」的義務，賭指數不會大跌。要繳保證金。',
    win: '權利金下跌（指數沒有大跌、時間流逝）',
    lose: '權利金上漲；指數大跌時虧損可能很大',
    risks: ['賺的最多就是收到的權利金，賠的可能是好幾倍。', '崩盤時保證金可能不足而被追繳。'],
    terms: ['put_option', 'premium_opt', 'buyer_seller', 'time_value', 'leverage_risk'],
    unitWord: '點',
  },
  BUY_CALL_WARRANT: {
    title: '認購權證（看多）',
    plain: '用小錢買進券商發行的權證，參與股票上漲。槓桿高，但有到期日，時間價值會一直流失。',
    win: '權證價格上漲（通常是標的股票上漲）',
    lose: '權證價格下跌；股票不漲時也會因時間流逝而下跌',
    risks: ['到期前沒有價值就歸零。', '流動性主要靠發行券商造市，買賣價差可能很大。'],
    terms: ['call_warrant', 'effective_gearing', 'warrant_time_decay', 'spread', 'liquidity'],
    unitWord: '元',
  },
  BUY_PUT_WARRANT: {
    title: '認售權證（看空）',
    plain: '用小錢買進認售權證，參與股票下跌。槓桿高，但有到期日，時間價值會一直流失。',
    win: '權證價格上漲（通常是標的股票下跌）',
    lose: '權證價格下跌；股票不跌時也會因時間流逝而下跌',
    risks: ['到期前沒有價值就歸零。', '流動性主要靠發行券商造市。'],
    terms: ['put_warrant', 'effective_gearing', 'warrant_time_decay', 'liquidity'],
    unitWord: '元',
  },
};

export const GENERIC_LESSON: PositionLesson = {
  title: '持有部位',
  plain: '這筆部位以即時報價計算損益。價格朝你預期的方向移動就賺錢，反向就賠錢。',
  win: '價格朝你預期的方向移動',
  lose: '價格反向移動',
  risks: ['海外商品還有匯率與不同交易時段的風險。', '槓桿商品的漲跌會被放大。'],
  terms: ['position_sizing', 'stop_loss_concept', 'asset_allocation'],
  unitWord: '元',
};
