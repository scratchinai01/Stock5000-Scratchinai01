import React, { useState } from 'react';
import { AI_ENABLED } from '../utils/aiFeatures';
import { StudentProfile, InstrumentSpec, PPTOutlineResponse } from '../types/market';
import { KLineChart } from './KLineChart';
import {
  Presentation,
  Sparkles,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Printer,
  FileText,
  PieChart,
  ShieldAlert,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface PPTReportStudioProps {
  currentProfile: StudentProfile;
  allInstruments: InstrumentSpec[];
  onOpenTrading: () => void;
}

export const PPTReportStudio: React.FC<PPTReportStudioProps> = ({
  currentProfile,
  allInstruments,
  onOpenTrading,
}) => {
  const [currentSlide, setCurrentSlide] = useState<number>(1);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<PPTOutlineResponse | null>(null);
  const [copiedSpeech, setCopiedSpeech] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const positions = currentProfile.positions || [];

  // Generate or regenerate Gemini report
  const handleGenerateAiReport = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch('/api/gemini/macro-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: currentProfile.studentName,
          portfolio: {
            availableCash: currentProfile.availableCash,
            marginDeposits: currentProfile.marginDeposits,
            positions: positions.map(p => ({
              symbol: p.symbol,
              name: p.name,
              category: p.category,
              action: p.orderType,
              price: p.entryPrice,
              quantity: p.quantity,
              totalAmount: p.totalCostOrMargin,
              rationale: p.notes,
            })),
          },
          benchmarkDate: '當下即時撮合',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setAiReport(json.data);
      }
    } catch (err) {
      console.error('Failed to generate AI report:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  // Copy speech note
  const handleCopySpeech = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSpeech(true);
    setTimeout(() => setCopiedSpeech(false), 2000);
  };

  // Copy full presentation markdown
  const handleCopyFullMarkdown = () => {
    const md = `
# ${aiReport?.reportTitle || '5000萬資產配置與衍生性商品實務操作報告'}
**報告組別**：${currentProfile.studentName} (${currentProfile.teamName})
**報價基準**：當下即時價 · 涵蓋股票/債券/ETF/期貨/選擇權

## 一、總體經濟環境分析 (Macro Outlook)
${aiReport?.macroAnalysis?.interestRateCycle || '聯準會進入實質降息週期，債券殖利率倒掛修復，台灣出口動能強勁。'}
${aiReport?.macroAnalysis?.inflationAndGdp || '景氣對策信號紅黃燈，半導體與 AI 算力資本支出持續增長。'}

## 二、關鍵產業趨勢與佈局核心 (Industry Trends)
${aiReport?.industryTrends?.aiAndSemiconductors || '台積電 CoWoS 先進封裝產能供不應求，AI 伺服器供應鏈受惠。'}
${aiReport?.industryTrends?.bondsOutlook || '長天期美債 ETF 具備抗跌防禦與利率資本利得雙重優勢。'}

## 三、五千萬資產配置架構
- 初始資金：NT$ 50,000,000
- 股票部位：${positions.filter(p => p.category === 'stocks').map(p => `${p.name} ${p.quantity}張`).join(', ') || '未配置'}
- 債券部位：${positions.filter(p => p.category === 'bonds').map(p => `${p.name} ${p.quantity}張`).join(', ') || '未配置'}
- ETF部位：${positions.filter(p => p.category === 'etfs').map(p => `${p.name} ${p.quantity}張`).join(', ') || '未配置'}
- 期貨部位：${positions.filter(p => p.category === 'futures').map(p => `${p.name} ${p.quantity}口`).join(', ') || '未配置'}
- 選擇權/權證：${positions.filter(p => p.category === 'options' || p.category === 'warrants').map(p => `${p.name} ${p.quantity}口/張`).join(', ') || '未配置'}

## 四、衍生性商品實戰避險策略
${aiReport?.derivativesHedgingPlan?.futuresRole || '以台指期空單對沖大盤系統性修正，降低投資組合波動。'}
${aiReport?.derivativesHedgingPlan?.optionsRole || '買進台指賣權作為防黑天鵝之保險，買進買權掌握非對稱槓桿上漲。'}
    `.trim();

    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const totalSlides = 6;

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/60 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Presentation className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-100">
              五千萬專案 PPT 簡報展示與講稿生成器
            </h2>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            依據老師作業規範：「從總經到產業到個股，怎麼樣把這五千萬包完成。21號收盤截圖截下來，作為下單依據。」一鍵生成專業簡報大綱、口頭講稿與
            K 線截圖存證！
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {AI_ENABLED && <button
            onClick={handleGenerateAiReport}
            disabled={loadingAi}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-950 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loadingAi ? 'Gemini 研析撰寫中...' : 'Gemini AI 智能撰寫/潤飾講稿'}</span>
          </button>}

          <button
            onClick={handleCopyFullMarkdown}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            {copiedMarkdown ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copiedMarkdown ? '已複製簡報大綱' : '複製簡報大綱'}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="列印 / 另存 PDF"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Slide Stage */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative min-h-[580px] flex flex-col justify-between">
        {/* Slide Counter & Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-mono text-xs font-bold">
              SLIDE {currentSlide} / {totalSlides}
            </span>
            <span className="text-xs text-slate-500">
              {currentProfile.teamName} · {currentProfile.studentName}
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2.5 py-1 rounded border border-cyan-800">
            當下即時撮合價
          </span>
        </div>

        {/* Slide Dynamic Content */}
        <div className="py-6 flex-1">
          {/* SLIDE 1: 封面 */}
          {currentSlide === 1 && (
            <div className="flex flex-col items-center justify-center text-center space-y-6 py-10">
              <div className="inline-block px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-wider uppercase">
                5000 萬投資實務期中專題報告
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-slate-100 tracking-tight max-w-3xl leading-tight">
                {aiReport?.reportTitle || '全方位資產配置與多空對沖實務操作'}
              </h1>
              <p className="text-base sm:text-lg text-slate-400 max-w-2xl font-light">
                {aiReport?.subtitle ||
                  '從總經脈絡、產業選股到衍生性金融商品實戰：股票、債券、ETF、期貨與選擇權之 5000 萬資產構建'}
              </p>

              <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl text-left">
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block">報告同學</span>
                  <span className="text-slate-100 font-bold text-sm">{currentProfile.studentName}</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block">所屬組別</span>
                  <span className="text-slate-100 font-bold text-sm">{currentProfile.teamName}</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block">總配置資金</span>
                  <span className="text-cyan-400 font-bold font-mono text-sm">NT$ 50,000,000</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-xs block">建倉基準日</span>
                  <span className="text-emerald-400 font-bold text-sm">21號 13:30 收盤</span>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 2: 總體經濟分析 (Macro Analysis) */}
          {currentSlide === 2 && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">
                  SECTION 01
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1">
                  總體經濟環境分析 (Macroeconomic Outlook)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  報告依據：21 號收盤時點之國際利率環境、通膨走勢、美台利差與台灣景氣對策信號
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                    01
                  </div>
                  <h3 className="font-bold text-slate-200 text-base">全球利率循環與美債</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiReport?.macroAnalysis?.interestRateCycle ||
                      'Fed 啟動降息循環，美國 10 年期與 20 年期公債殖利率自高檔回落，長天期美債 ETF 具備高度利率敏感度，形成下檔保證金與無風險資本利得基石。'}
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                    02
                  </div>
                  <h3 className="font-bold text-slate-200 text-base">台灣景氣信號與出口動能</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiReport?.macroAnalysis?.inflationAndGdp ||
                      '國發會景氣對策燈號維持黃紅燈至紅燈區間，半導體與資通訊硬體出貨暢旺，實質 GDP 成長強勁支撐加權指數基本面，吸引外資熱錢回流。'}
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                    03
                  </div>
                  <h3 className="font-bold text-slate-200 text-base">台股位階與避險必要性</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiReport?.macroAnalysis?.marketValuation ||
                      '加權指數歷史本益比達 20-22 倍中高位階，地緣政治與美國大選變數增加大盤波動，必須運用台指期空單與 TXO 賣權建構非對稱避險安全網。'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 3: 產業關鍵趨勢 (Industry Trends) */}
          {currentSlide === 3 && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">
                  SECTION 02
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1">
                  產業趨勢與戰略核心 (Industry Selection)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  從總經落地到具體產業主線：AI 半導體、伺服器供應鏈、高息 ETF 資金水庫與固定收益
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-xs font-bold">
                      核心攻擊
                    </span>
                    <h3 className="font-bold text-slate-100 text-base">
                      AI 先進製程與半導體聚落 (CoWoS)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {aiReport?.industryTrends?.aiAndSemiconductors ||
                      '台積電 3nm/2nm 先進製程與 CoWoS 產能滿載，全球雲端 CSP 大廠爭相採購算力晶片。鴻海、廣達垂直整合液冷與機櫃組裝，獲利爆發力強勁。'}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                      2330 台積電
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                      2317 鴻海
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                      2454 聯發科
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-xs font-bold">
                      穩健金流
                    </span>
                    <h3 className="font-bold text-slate-100 text-base">
                      長天期美債與投資級公司債
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {aiReport?.industryTrends?.bondsOutlook ||
                      '元大美債20年(00679B)與國泰20年美債(00687B)提供長期穩定配息，並在市場發生系統性風險時成為熱錢安全避風港，提升整個 5000 萬投資組合夏普值。'}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                      00679B 美債20年
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                      00720B 投資級公司債
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 4: 五千萬資產配置架構與圓餅佔比 (Asset Allocation) */}
          {currentSlide === 4 && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">
                  SECTION 03
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1">
                  五千萬資產配置大盤點 (Asset Allocation Blueprint)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  符合規定涵蓋股票、債券、ETF、期貨與選擇權，達成兼具攻擊動能與全天候防禦架構
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                {/* Positions Summary List */}
                <div className="space-y-2.5">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-rose-400">1. 股票型部位 (台積電等核心個股)</span>
                    <span className="font-mono font-bold text-slate-100">
                      NT${' '}
                      {Math.round(
                        positions
                          .filter(p => p.category === 'stocks')
                          .reduce((sum, p) => sum + p.notionalValue, 0)
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-sky-400">2. 債券型部位 (長天期美債 ETF)</span>
                    <span className="font-mono font-bold text-slate-100">
                      NT${' '}
                      {Math.round(
                        positions
                          .filter(p => p.category === 'bonds')
                          .reduce((sum, p) => sum + p.notionalValue, 0)
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-indigo-400">3. 被動與高股息 ETF (0050 / 0056)</span>
                    <span className="font-mono font-bold text-slate-100">
                      NT${' '}
                      {Math.round(
                        positions
                          .filter(p => p.category === 'etfs')
                          .reduce((sum, p) => sum + p.notionalValue, 0)
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-amber-400">4. 期貨保證金 (大台/小台多空避險)</span>
                    <span className="font-mono font-bold text-slate-100">
                      NT${' '}
                      {Math.round(
                        positions
                          .filter(p => p.category === 'futures')
                          .reduce((sum, p) => sum + p.totalCostOrMargin, 0)
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-emerald-400">5. 選擇權與權證權利金 (TXO / 認購售)</span>
                    <span className="font-mono font-bold text-slate-100">
                      NT${' '}
                      {Math.round(
                        positions
                          .filter(p => p.category === 'options' || p.category === 'warrants')
                          .reduce((sum, p) => sum + p.totalCostOrMargin, 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Strategy Highlight Box */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    5000萬資產配置核心哲學
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {aiReport?.assetAllocationStrategy?.strategyRationale ||
                      '「核心資產 50% 鎖定 AI 半導體成長龍頭與被動大盤 ETF；穩健防守 25% 配發長天期美債 ETF 鎖住高殖利率；衍生性商品 15% 建立台指期多空對沖機制，並以 5% 選擇權與權證創造非對稱爆擊回報，保留 5% 機動現金。」'}
                  </p>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div>• 預期年化報酬率目標：18.5% ~ 24.0%</div>
                    <div>• 目標夏普值 (Sharpe Ratio)：1.85</div>
                    <div>• 預期最大回撤 (Max Drawdown)：控制在 8.5% 以內</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 5: 21號收盤 K 線截圖證據庫 (老師作業最高要求) */}
          {currentSlide === 5 && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">
                    SECTION 04
                  </span>
                  <h2 className="text-2xl font-bold text-slate-100 mt-0.5">
                    21號收盤 K 線截圖證據庫 (Trade Proofs)
                  </h2>
                  <p className="text-xs text-slate-400">
                    「把那一天收盤台積電的截圖截下來，就是說我就是用這個收盤價去買的」
                  </p>
                </div>

                <button
                  onClick={onOpenTrading}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow"
                >
                  前往交易終端下載更多截圖
                </button>
              </div>

              {/* Grid of Position Proof Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {positions.slice(0, 4).map(pos => {
                  const inst = allInstruments.find(i => i.symbol === pos.symbol);
                  return (
                    <div
                      key={pos.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 shadow-lg"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-cyan-400">
                            {pos.symbol}
                          </span>
                          <span className="font-bold text-slate-200 text-xs">{pos.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {pos.category.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-rose-400">
                          收盤買進價 NT${' '}
                          {pos.entryPrice >= 1000
                            ? pos.entryPrice.toLocaleString()
                            : pos.entryPrice}
                        </span>
                      </div>

                      {/* Mini K-line embedded */}
                      {inst && (
                        <div className="w-full">
                          <KLineChart
                            instrument={inst}
                            benchmarkDate="2026-09-21"
                            orderRationale={pos.notes}
                            customPrice={pos.entryPrice}
                          />
                        </div>
                      )}

                      <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400">
                        <span className="text-slate-300 font-semibold">下單佐證：</span>
                        {pos.notes || '依21號收盤價建倉'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SLIDE 6: 避險與衍生性商品實務操作 (Hedging Mechanics) */}
          {currentSlide === 6 && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">
                  SECTION 05
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1">
                  期貨與選擇權實戰避險架構 (Derivatives Strategy)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  大盤台指期、個股期貨、認購認售權證與台指選擇權的實務對沖與非對稱獲利
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-bold">
                    期貨空單避險
                  </span>
                  <h3 className="font-bold text-slate-100 text-base">台指期放空 (TX Short)</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiReport?.derivativesHedgingPlan?.futuresRole ||
                      '在加權指數高檔放空大台指期貨(TX)，每點 200 元。若大盤拉回 500 點，1 口期貨空單即可產生 10 萬元獲利，完全對沖股票多頭現貨帳面回撤。'}
                  </p>
                  <div className="text-[11px] text-slate-500 bg-slate-950 p-2 rounded">
                    每口保證金: 32 萬元 | 槓桿約 15 倍
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                    選擇權保單
                  </span>
                  <h3 className="font-bold text-slate-100 text-base">TXO 買進賣權 (Buy Put)</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiReport?.derivativesHedgingPlan?.optionsRole ||
                      '買進價外 47000/46000 點之賣權(Put)或 49000/50000 買權(Call)，僅需支付少許權利金。若市場遭遇非預期地緣黑天鵝突發崩跌，賣權將呈幾何級數暴漲，提供災難級完全防護。'}
                  </p>
                  <div className="text-[11px] text-slate-500 bg-slate-950 p-2 rounded">
                    最大虧損僅限權利金 | 上檔獲利無限
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-xs font-bold">
                    個股權證槓桿
                  </span>
                  <h3 className="font-bold text-slate-100 text-base">認購與認售權證 (Warrants)</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiReport?.derivativesHedgingPlan?.warrantsRole ||
                      '挑選實質槓桿 5~6 倍之台積電與鴻海認購權證，小金額（數十萬元）即可複製數百萬元現股的漲幅爆發力，提高資金周轉效能。'}
                  </p>
                  <div className="text-[11px] text-slate-500 bg-slate-950 p-2 rounded">
                    有限風險 | 免除信用交易追繳限制
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Slide Bottom Navigator & Speech Note Bar */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          {/* Oral Speech Note */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-start justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                第 {currentSlide} 頁口頭報告發言建議 (Speech Notes for Class):
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {aiReport?.slides?.[currentSlide - 1]?.speechNote ||
                  `「各位教授與同學好，我們這一頁著重在 21 號收盤價進場的策略邏輯。我們善用了 5000 萬的規模優勢，從總經降息週期切入，核心配置台積電先進製程，並以美債和台指期貨做好多空避險，展現完整的金融商品實務架構。」`}
              </p>
            </div>

            <button
              onClick={() =>
                handleCopySpeech(
                  aiReport?.slides?.[currentSlide - 1]?.speechNote ||
                    '各位教授與同學好，我們這一組依照 21 號收盤價完成 5000 萬全方位金融衍生性商品配置...'
                )
              }
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 font-medium transition text-[11px] flex items-center gap-1"
            >
              {copiedSpeech ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSpeech ? '已複製' : '複製講稿'}</span>
            </button>
          </div>

          {/* Prev / Next Page Buttons */}
          <div className="flex items-center justify-between">
            <button
              disabled={currentSlide <= 1}
              onClick={() => setCurrentSlide(prev => Math.max(1, prev - 1))}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs font-bold border border-slate-800 flex items-center gap-1.5 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>上一頁</span>
            </button>

            {/* Slide Dots */}
            <div className="flex gap-1.5">
              {Array.from({ length: totalSlides }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx + 1)}
                  className={`w-2.5 h-2.5 rounded-full transition ${
                    currentSlide === idx + 1 ? 'bg-cyan-400 w-6' : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                />
              ))}
            </div>

            <button
              disabled={currentSlide >= totalSlides}
              onClick={() => setCurrentSlide(prev => Math.min(totalSlides, prev + 1))}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs font-bold border border-slate-800 flex items-center gap-1.5 transition"
            >
              <span>下一頁</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
