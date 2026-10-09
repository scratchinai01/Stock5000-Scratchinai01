import React, { useState, useMemo, useRef } from 'react';
import { InstrumentSpec, OrderAction, AssetCategory, StudentProfile } from '../types/market';
import { getSystemDateStr } from '../utils/dateUtils';
import {
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Camera,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SmartInstrumentSearchBoardProps {
  allInstruments: InstrumentSpec[];
  onSelectInstrumentToTrade: (instrument: InstrumentSpec, action?: OrderAction) => void;
  onViewInstrumentKLine: (instrument: InstrumentSpec) => void;
  onAddInstrument?: (inst: InstrumentSpec) => void;
  currentProfile?: StudentProfile | null;
  initialSymbol?: string;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  onForceRefresh?: () => void;
}

export const SmartInstrumentSearchBoard: React.FC<SmartInstrumentSearchBoardProps> = ({
  allInstruments,
  onSelectInstrumentToTrade,
  onViewInstrumentKLine,
  onAddInstrument,
  currentProfile,
  initialSymbol = '2317',
  isCollapsible = true,
  defaultCollapsed = false,
  className = '',
  onForceRefresh,
}) => {
  const [focusSymbol, setFocusSymbol] = useState<string>(initialSymbol);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchingStock, setIsSearchingStock] = useState<boolean>(false);
  const [isSearchSectionCollapsed, setIsSearchSectionCollapsed] = useState<boolean>(defaultCollapsed);
  const [isDerivativesListCollapsed, setIsDerivativesListCollapsed] = useState<boolean>(false);
  const [searchNotice, setSearchNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [stockSuggestions, setStockSuggestions] = useState<
    Array<{
      symbol: string;
      name: string;
      industry?: string;
      price?: number;
      type?: string;
      market?: string;
    }>
  >([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

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
    setSearchNotice({ type: 'info', message: `正在連線 FinMind 官方資料庫查詢「${q}」...` });
    setIsSearchDropdownOpen(false);

    try {
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

      // Query FinMind assistant
      const res = await fetch('/api/gemini/quote-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, category: 'stocks', benchmarkDate: getSystemDateStr() }),
      });
      const json = await res.json();

      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || `查無標的「${q}」，請確認台股或美股代號（如 2317、2330、2609、3231、0050、NVDA、AAPL）或中文名稱。`);
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
          : `台灣上市/上櫃真實標的：${d.name} (${d.symbol})，FinMind 撮合報價 NT$ ${d.closePrice}。`,
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
        message: err.message || `連線 FinMind 查詢失敗，請檢查代號是否正確。`,
      });
    } finally {
      setIsSearchingStock(false);
    }
  };

  // Resolve current focus target
  const currentFocus = useMemo<InstrumentSpec>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.includes('聯電') || q === '2303' || q.includes('08303') || q === 'ccf') {
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

  // Derived family items
  const derivedFamilyItems = useMemo(() => {
    const s = currentFocus.symbol;
    const cat = currentFocus.category;

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

    if (cat === 'us_stocks') {
      const priceTwd = Math.round(currentFocus.price * 32);
      const items: any[] = [
        {
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
        },
      ];

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

    // Stocks (2317, 2330, 2303, etc.)
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

    const matchedCall = allInstruments.find(i => {
      if (s === '2303') return i.symbol === 'CCO-55-C' || (i.category === 'options' && i.name.includes('聯電') && i.symbol.endsWith('C'));
      if (s === '2330') return (i.category === 'options' && i.name.includes('台積') && i.symbol.endsWith('C')) || i.symbol === 'TXO-49000-C';
      if (s === '2317') return (i.category === 'options' && i.name.includes('鴻海') && i.symbol.endsWith('C')) || i.symbol === 'TXO-49000-C';
      return i.category === 'options' && i.name.includes(currentFocus.name) && i.symbol.endsWith('C');
    }) || allInstruments.find(i => i.symbol === 'TXO-49000-C') || currentFocus;

    const matchedPut = allInstruments.find(i => {
      if (s === '2303') return i.symbol === 'CCO-52.5-P' || (i.category === 'options' && i.name.includes('聯電') && i.symbol.endsWith('P'));
      if (s === '2330') return (i.category === 'options' && i.name.includes('台積') && i.symbol.endsWith('P')) || i.symbol === 'TXO-47000-P';
      if (s === '2317') return (i.category === 'options' && i.name.includes('鴻海') && i.symbol.endsWith('P')) || i.symbol === 'TXO-47000-P';
      return i.category === 'options' && i.name.includes(currentFocus.name) && i.symbol.endsWith('P');
    }) || allInstruments.find(i => i.symbol === 'TXO-47000-P') || currentFocus;

    const matchedCallWarrant = allInstruments.find(i => {
      if (s === '2303') return i.symbol === '08303P' || (i.category === 'warrants' && i.name.includes('聯電') && (i.name.includes('購') || !i.name.includes('售')));
      if (s === '2330') return i.symbol === '08643P' || (i.category === 'warrants' && i.name.includes('台積'));
      if (s === '2317') return i.symbol === '08644P' || (i.category === 'warrants' && i.name.includes('鴻海'));
      return i.category === 'warrants' && (i.name.includes(currentFocus.name) || i.name.includes('購'));
    }) || allInstruments.find(i => i.category === 'warrants') || currentFocus;

    const matchedPutWarrant = allInstruments.find(i => {
      if (s === '2303') return i.symbol === '08304P' || (i.category === 'warrants' && i.name.includes('聯電') && i.name.includes('售'));
      if (s === '2330' || s === '2317') return i.symbol === '08645P' || (i.category === 'warrants' && i.name.includes('售'));
      return i.category === 'warrants' && i.name.includes('售');
    }) || allInstruments.find(i => i.symbol === '08645P') || currentFocus;

    const etf0050 = allInstruments.find(i => i.symbol === '0050') || currentFocus;

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

  // Positions of current focus for the active player
  const positions = currentProfile?.positions || [];
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

  if (isCollapsible && isSearchSectionCollapsed) {
    return (
      <div className={`bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 shadow-xs flex items-center justify-between gap-2.5 ${className}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="w-6 h-6 rounded-lg bg-slate-900 text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
            🔍
          </span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <span className="font-black text-xs text-slate-950 truncate">
              標的智能查詢：{currentFocus.name} ({currentFocus.symbol})
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 font-bold shrink-0">
              {derivedFamilyItems.length} 檔商品
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSearchSectionCollapsed(false)}
          className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-black text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer shrink-0"
          title="展開標的與衍生品查詢"
        >
          <span>展開查詢 ▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5 ${className}`}>
      {/* Live Price Sync Status Bar (Ensuring prices are always updating in real time) */}
      <div className="bg-slate-900 text-white px-3.5 py-2 rounded-2xl flex items-center justify-between gap-2 text-xs font-mono shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          <span className="font-bold text-amber-300">⚡ 實時買賣報價撮合連線中</span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">(FinMind / 交易所即時更新)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">更新: {new Date().toLocaleTimeString()}</span>
          <button
            type="button"
            onClick={() => {
              if (onForceRefresh) {
                onForceRefresh();
                setSearchNotice({ type: 'success', message: '✅ 已強制同步最新即時買賣報價！' });
              } else {
                window.location.reload();
              }
            }}
            className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow-2xs transition active:scale-95"
          >
            🔄 立即重新整理
          </button>
        </div>
      </div>

      {/* Header with Search Input & Collapse Button */}
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
          {/* Search Box */}
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

          {isCollapsible && (
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
          )}
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

      {/* Quick Common Searches Chips */}
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

      {/* Focus Target Banner & 7 Products Grid */}
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
                            onSelectInstrumentToTrade(item.instrument, action.action);
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
                        <Camera className="w-3 h-3 inline mr-0.5 text-cyan-600" />
                        <span>K線</span>
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

        {/* Quick collapse footer button */}
        {isCollapsible && (
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
        )}
      </div>
    </div>
  );
};
