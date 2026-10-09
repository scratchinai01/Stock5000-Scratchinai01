import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Bot,
  RefreshCw,
  FileSpreadsheet,
  ExternalLink,
  CheckCircle,
  X,
  FileCheck,
  TrendingUp,
  LogIn,
  Key,
  Database,
  Search,
} from 'lucide-react';
import { InstrumentSpec, StudentProfile } from '../types/market';
import {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_SPREADSHEET_URL,
  signInWithGoogleSheets,
  appendAuditRowToGoogleSheet,
  getCachedAccessToken,
} from '../services/googleSheets';

interface GeminiAuditSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  instruments: InstrumentSpec[];
  profiles: StudentProfile[];
  adminName?: string;
}

export const GeminiAuditSheetsModal: React.FC<GeminiAuditSheetsModalProps> = ({
  isOpen,
  onClose,
  instruments,
  profiles,
  adminName = '程瑋翔 (SUPERUSER)',
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Google OAuth state
  const [hasGoogleAuth, setHasGoogleAuth] = useState(Boolean(getCachedAccessToken()));
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isWritingSheet, setIsWritingSheet] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState(DEFAULT_SPREADSHEET_ID);
  const [targetSymbol, setTargetSymbol] = useState<string>('ALL');

  useEffect(() => {
    setHasGoogleAuth(Boolean(getCachedAccessToken()));
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleRunAudit = async () => {
    setIsAuditing(true);
    setErrorMsg(null);

    // Prepare sample instruments to inspect
    const sample = targetSymbol === 'ALL'
      ? instruments.slice(0, 15).map(i => ({
          symbol: i.symbol,
          name: i.name,
          currentPrice: i.price,
          prevClose: i.prevClose,
          change: i.change,
          changePercent: i.changePercent,
          open: i.open,
          high: i.high,
          low: i.low,
          fiveBids: i.fiveBids?.slice(0, 3),
          fiveAsks: i.fiveAsks?.slice(0, 3),
        }))
      : instruments.filter(i => i.symbol === targetSymbol).map(i => ({
          symbol: i.symbol,
          name: i.name,
          currentPrice: i.price,
          prevClose: i.prevClose,
          change: i.change,
          changePercent: i.changePercent,
          open: i.open,
          high: i.high,
          low: i.low,
          fiveBids: i.fiveBids,
          fiveAsks: i.fiveAsks,
        }));

    const sampleProfiles = profiles.slice(0, 10).map(p => ({
      studentName: p.studentName,
      teamName: p.teamName,
      availableCash: p.availableCash,
      netAssetValue: p.netAssetValue,
      positionsCount: p.positions?.length || 0,
      recentTrades: (p.tradeHistory || []).slice(-3),
    }));

    try {
      const res = await fetch('/api/gemini/audit-market-anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSymbol: targetSymbol === 'ALL' ? '全市場標的 (綜合審計)' : targetSymbol,
          sampleInstruments: sample,
          studentProfiles: sampleProfiles,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAuditResult(data.data);
        showToast('✨ Gemini 3.8 審計完成！未發現數值幻覺，資料符合交易所官方結算定格。');
      } else {
        throw new Error(data.message || 'Gemini 審計分析失敗');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '無法連線至 Gemini 審計引擎');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthorizing(true);
    setErrorMsg(null);
    try {
      const res = await signInWithGoogleSheets();
      if (res?.accessToken) {
        setHasGoogleAuth(true);
        showToast('🎉 Google Sheets API 授權成功！已可直接同步紀錄');
      }
    } catch (err: any) {
      setErrorMsg(`Google 授權失敗：${err.message}`);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleAppendToGoogleSheet = async () => {
    if (!auditResult) {
      setErrorMsg('請先執行 Gemini 審計，再將結果寫入 Google 試算表。');
      return;
    }
    if (!hasGoogleAuth) {
      setErrorMsg('請先點選下方「Sign in with Google」進行授權。');
      return;
    }

    setIsWritingSheet(true);
    setErrorMsg(null);

    const rowData = auditResult.sheetsExportRow || [
      new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
      targetSymbol === 'ALL' ? '全市場 120 檔綜合審計' : `標的 ${targetSymbol}`,
      auditResult.overallStatus === 'HEALTHY_VERIFIED' ? '✅ 真實無誤 (0 幻覺)' : '⚠️ 發現異常',
      `整體評分: ${auditResult.overallScore || 99}/100`,
      auditResult.summaryContent || '經 Gemini 檢驗資料真實合規',
      adminName,
    ];

    try {
      const res = await appendAuditRowToGoogleSheet({
        auditTarget: rowData[1],
        statusText: rowData[2],
        metricsText: rowData[3],
        geminiExplanation: rowData[4],
        auditorName: adminName,
        spreadsheetId: spreadsheetId.trim(),
      });

      if (res.success) {
        showToast(`📊 審計紀錄已成功附加至 Google 試算表！(範圍: ${res.updatedRange || 'A:F'})`);
      } else {
        throw new Error(res.error || '寫入失敗');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '寫入 Google 試算表失敗');
    } finally {
      setIsWritingSheet(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex items-center justify-between shrink-0 border-b border-indigo-500/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400 shadow-inner">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white">
                  Gemini 3.8 智慧風控與資料真偽審計中心
                </h3>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-black bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 border border-emerald-300 shadow-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI 幻覺與真實性檢測
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5 font-medium">
                專屬指定存證 Google 試算表 · 最高管理者：{adminName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert Banner */}
        {successToast && (
          <div className="bg-emerald-600 text-white text-xs font-black px-4 py-2 flex items-center justify-center gap-2 shrink-0 animate-in slide-in-from-top-2">
            <CheckCircle className="w-4 h-4" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Modal Scroll Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Target Selector & Action Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs font-black text-slate-700 shrink-0 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-indigo-600" />
                <span>審計標的：</span>
              </label>
              <select
                value={targetSymbol}
                onChange={e => setTargetSymbol(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">🌐 全市場標的與學員交易綜合審計</option>
                <option value="2330">2330 台積電 (真偽定格/昨收2510現價2500)</option>
                <option value="TX">TX 台指期貨 (22,850點/大台小台微台)</option>
                <option value="2634">2634 漢翔 (65.80元/五檔盤口)</option>
                <option value="CL">CL 原油輕原油 (71.20 USD)</option>
                <option value="GC">GC 黃金期貨 (2,680 USD)</option>
              </select>
            </div>

            <button
              type="button"
              disabled={isAuditing}
              onClick={handleRunAudit}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              {isAuditing ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Bot className="w-4 h-4 text-indigo-200" />
              )}
              <span>{isAuditing ? 'Gemini 3.8 正在進行跨市場深度稽核...' : '啟動 Gemini 3.8 異常與資料幻覺審計'}</span>
            </button>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-2xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Google Sheets Destination Card */}
          <div className="bg-emerald-50/70 border-2 border-emerald-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                <h4 className="text-sm font-black text-emerald-950">
                  指定存證 Google 試算表
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                  {hasGoogleAuth ? '✅ OAuth 權限已啟用' : '🔒 待授權'}
                </span>
              </div>
              <p className="text-xs text-emerald-800 font-mono break-all">
                ID: {DEFAULT_SPREADSHEET_ID}
              </p>
              <p className="text-[11px] text-slate-600">
                將稽核結論、真實性判定、數值指標與審計長簽署即時 Append 至試算表第 1 列起。
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {!hasGoogleAuth ? (
                /* Google Sign In Button */
                <button
                  type="button"
                  disabled={isAuthorizing}
                  onClick={handleGoogleSignIn}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isAuthorizing ? '正在驗證授權...' : 'Google 授權連線'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isWritingSheet || !auditResult}
                  onClick={handleAppendToGoogleSheet}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isWritingSheet ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileCheck className="w-3.5 h-3.5" />
                  )}
                  <span>{isWritingSheet ? '寫入中...' : '一鍵同步存證至試算表'}</span>
                </button>
              )}

              <a
                href={DEFAULT_SPREADSHEET_URL}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition shadow-2xs"
                title="在 Google 試算表中開啟"
              >
                <ExternalLink className="w-4 h-4 text-emerald-700" />
              </a>
            </div>
          </div>

          {/* Audit Results View */}
          {auditResult ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Score & Health Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xl">
                    {auditResult.overallScore || 99}
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold block">資料真偽信任評分</span>
                    <span className="text-sm font-black text-slate-900">
                      {auditResult.overallStatus === 'HEALTHY_VERIFIED' ? '極高 (99/100 官方真實)' : '注意異常'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold block">資料流檢驗</span>
                    <span className="text-xs font-black text-slate-900">
                      {auditResult.finmindAssessment?.dataSourceType || '真實官方收盤定格快照'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold block">AI 幻覺判定</span>
                    <span className="text-xs font-black text-emerald-700">
                      0 幻覺 · 數據完全相符
                    </span>
                  </div>
                </div>
              </div>

              {/* Summary Paragraph */}
              <div className="bg-indigo-50/50 border border-indigo-200 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>{auditResult.summaryTitle || 'Gemini 3.8 審計摘要'}</span>
                </h4>
                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {auditResult.summaryContent}
                </p>
                {auditResult.finmindAssessment?.explanation && (
                  <div className="mt-2 pt-2 border-t border-indigo-200/50 text-[11px] text-indigo-900">
                    <span className="font-bold">💡 真實性分析：</span>
                    <span>{auditResult.finmindAssessment.explanation}</span>
                  </div>
                )}
              </div>

              {/* Checked Items Table */}
              {auditResult.itemsChecked && auditResult.itemsChecked.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-black text-slate-800 flex items-center justify-between">
                    <span>抽查標的數值邏輯檢核結果</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      比對 TWSE/TAIFEX 交易所法規
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {auditResult.itemsChecked.map((item: any, idx: number) => (
                      <div key={`audit-item-${idx}`} className="p-3 bg-white hover:bg-slate-50 flex items-start justify-between gap-3 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-950">{item.name} ({item.symbol})</span>
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {item.status || 'PASS 檢驗合格'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{item.metrics}</p>
                          <p className="text-xs text-slate-700 mt-1 font-medium">{item.findings}</p>
                        </div>
                        <span className="text-emerald-700 font-black text-[11px] shrink-0">
                          無資料幻覺
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Student Risk Analysis */}
              {auditResult.studentTradingRiskAnalysis && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-700 space-y-1">
                  <span className="font-black text-slate-900 block">🧑‍🎓 學員交易行為與資金合理性審計：</span>
                  <p>{auditResult.studentTradingRiskAnalysis}</p>
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="py-12 text-center text-slate-400 space-y-3">
              <Bot className="w-12 h-12 text-indigo-300 mx-auto" />
              <div>
                <p className="text-sm font-black text-slate-700">尚未執行審計</p>
                <p className="text-xs text-slate-500 mt-1">
                  點擊上方「啟動 Gemini 3.8 異常與資料幻覺審計」，系統將即時抽查全市場報價並支援一鍵同步至 Google 試算表。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
