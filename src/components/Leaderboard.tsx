import React, { useState } from 'react';
import { StudentProfile } from '../types/market';
import {
  Trophy,
  Medal,
  Award,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Eye,
  Trash2,
  X,
  Shield,
  FileText,
  Check,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { deletePlayerFromFirebase } from '../services/firebase';

interface LeaderboardProps {
  profiles: StudentProfile[];
  currentProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onAddNewStudent: (name: string, team: string, strategy: string) => void;
  onDeleteProfile?: (studentName: string) => void;
  isSuperUser?: boolean;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  profiles,
  currentProfileId,
  onSelectProfile,
  onAddNewStudent,
  onDeleteProfile,
  isSuperUser = false,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [newStrategy, setNewStrategy] = useState('');
  const [detailProfile, setDetailProfile] = useState<any | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<StudentProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [switchTarget, setSwitchTarget] = useState<StudentProfile | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Calculate NAV, Compliance and Rank
  const ranked = [...profiles].map(p => {
    let securitiesVal = 0;
    let futuresMargin = 0;
    let unrealizedPnL = 0;

    (p.positions || []).forEach(pos => {
      unrealizedPnL += pos.unrealizedPnL || 0;
      if (pos.category === 'futures') {
        futuresMargin += pos.totalCostOrMargin || 0;
      } else {
        securitiesVal += pos.notionalValue || 0;
      }
    });

    const netAsset = (p.availableCash ?? 50000000) + securitiesVal + futuresMargin + unrealizedPnL;
    const initialCapital = p.initialCapital || 50000000;
    const returnPct = ((netAsset - initialCapital) / initialCapital) * 100;

    const coveredCategories = new Set((p.positions || []).map(pos => pos.category));
    const isOptionsCovered = coveredCategories.has('options') || coveredCategories.has('warrants');
    const toolsCount =
      (coveredCategories.has('stocks') ? 1 : 0) +
      (coveredCategories.has('bonds') ? 1 : 0) +
      (coveredCategories.has('etfs') ? 1 : 0) +
      (coveredCategories.has('futures') ? 1 : 0) +
      (isOptionsCovered ? 1 : 0);

    return {
      ...p,
      calculatedNAV: netAsset,
      calculatedReturnPct: returnPct,
      securitiesVal,
      futuresMargin,
      unrealizedPnL,
      toolsCount,
      isFullyCompliant: toolsCount === 5,
    };
  });

  ranked.sort((a, b) => b.calculatedNAV - a.calculatedNAV);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddNewStudent(
      newName.trim(),
      newTeam.trim() || '自訂模擬投資戰隊',
      newStrategy.trim() || '全天候策略'
    );
    setNewName('');
    setNewTeam('');
    setNewStrategy('');
    setShowAddModal(false);
  };

  // Execute deletion of student account and record
  const handleExecuteDelete = async (p: StudentProfile) => {
    if (!isSuperUser) {
      showToast('【權限不足】僅最高超級管理者（程瑋翔）具備刪除帳號權限！');
      setConfirmDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    const cleanName = p.studentName.trim();
    try {
      // 1. Immediately notify parent to remove from local state & blacklist
      onDeleteProfile?.(cleanName);

      // 2. Perform background delete with timeout protection
      await deletePlayerFromFirebase(cleanName, p.id);

      showToast(`已成功永久刪除學員「${cleanName}」帳號與所有數據紀錄！`);
    } catch (err: any) {
      console.warn('Delete student note:', err);
      onDeleteProfile?.(cleanName);
      showToast(`已成功移除學員「${cleanName}」！`);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteTarget(null);
      setDetailProfile(null);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-70 bg-slate-900/95 backdrop-blur-md text-amber-300 font-black text-xs px-4 py-2 rounded-full shadow-xl border border-amber-400/40 animate-in fade-in zoom-in duration-150 flex items-center gap-2 pointer-events-none">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header Card - Daytime High Contrast */}
      <div className="bg-gradient-to-r from-amber-100 via-amber-50 to-yellow-50 border-2 border-amber-300 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500 text-slate-950 shadow-sm">
            <Trophy className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950 flex items-center gap-2">
              全班 5000 萬股市大富翁實戰模擬排行榜 · Firebase 雲端紀錄
            </h2>
            <p className="text-xs text-slate-700 font-semibold">
              每位同學起始 5,000 萬元，依據 21 號收盤價建倉，涵蓋股票、債券、ETF、期貨與選擇權進行績效較量！點選任一學員「詳情」即可查看五大工具核銷明細。
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-sm transition border border-amber-600 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ 建立新同學 / 操盤紀錄</span>
        </button>
      </div>

      {/* Leaderboard Table Card - Daytime High Contrast */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 text-center">排名</th>
                <th className="py-3 px-4">操盤手 / 組別名稱</th>
                <th className="py-3 px-4">操作策略標籤</th>
                <th className="py-3 px-4 text-right">總資產淨值 (NAV)</th>
                <th className="py-3 px-4 text-right">報酬率 %</th>
                <th className="py-3 px-4 text-center">作業五大工具核銷 (點擊看詳情)</th>
                <th className="py-3 px-4 text-center">詳情與切換控制</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ranked.map((p, idx) => {
                const isCurrent =
                  p.id === currentProfileId ||
                  p.studentName === profiles.find(pr => pr.id === currentProfileId)?.studentName;
                return (
                  <tr
                    key={`leaderboard-profile-${p.id || p.studentName}-${idx}`}
                    onClick={() => setDetailProfile(p)}
                    className={`transition cursor-pointer group/row ${
                      isCurrent ? 'bg-amber-50/70 font-semibold' : 'hover:bg-amber-50/40'
                    }`}
                    title="點擊此列或詳情按鈕查看五大工具核銷明細"
                  >
                    {/* Rank */}
                    <td className="py-4 px-4 text-center">
                      {idx === 0 && <span className="text-xl">🥇</span>}
                      {idx === 1 && <span className="text-xl">🥈</span>}
                      {idx === 2 && <span className="text-xl">🥉</span>}
                      {idx > 2 && (
                        <span className="font-mono text-slate-700 font-black text-sm">#{idx + 1}</span>
                      )}
                    </td>

                    {/* Student Name */}
                    <td className="py-4 px-4">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailProfile(p);
                        }}
                        className="flex items-center gap-2 cursor-pointer group"
                        title="點擊查看該操盤手作業核銷與持倉詳情"
                      >
                        <span className="text-xl shrink-0 group-hover:scale-110 transition">
                          {p.avatarEmoji || '👤'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-950 text-sm group-hover:text-amber-800 transition underline-offset-2 group-hover:underline">
                              {p.studentName}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-950 text-amber-300 shadow-sm">
                                正在操作
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-semibold">{p.teamName}</span>
                        </div>
                      </div>
                    </td>

                    {/* Strategy Badge */}
                    <td className="py-4 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-300">
                        {p.strategyBadge || '自主量化對沖'}
                      </span>
                    </td>

                    {/* NAV */}
                    <td className="py-4 px-4 text-right font-mono font-black text-slate-950 text-sm">
                      NT$ {Math.round(p.calculatedNAV || 50000000).toLocaleString()}
                    </td>

                    {/* Return % */}
                    <td className="py-4 px-4 text-right font-mono">
                      <span
                        className={`font-black text-sm ${
                          (p.calculatedReturnPct || 0) >= 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {(p.calculatedReturnPct || 0) >= 0 ? '+' : ''}
                        {(p.calculatedReturnPct || 0).toFixed(2)}%
                      </span>
                    </td>

                    {/* 5 Tools Check - Clickable Pill Button */}
                    <td className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailProfile(p);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer hover:shadow-md hover:scale-105 active:scale-95 border"
                        title="點擊查看作業五大工具核銷詳情與持倉"
                      >
                        {p.isFullyCompliant ? (
                          <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 font-black">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>已達標 (5/5) · 詳情 ➔</span>
                          </span>
                        ) : (
                          <span className="text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border-2 border-amber-400 flex items-center gap-1 font-black shadow-xs">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>缺 {5 - p.toolsCount} 種 ({p.toolsCount}/5) · 詳情 ➔</span>
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Action Buttons: 詳情 & 切換控制 */}
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* 專屬 詳情 按鈕 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailProfile(p);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-95"
                          title="查看該操盤手持倉與五大工具核銷明細"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-800" />
                          <span>詳情</span>
                        </button>

                        {/* 切換操作 按鈕 */}
                        {isCurrent ? (
                          <span className="text-xs text-amber-800 font-black px-2">● 登入中</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isSuperUser) {
                                onSelectProfile(p.id);
                              } else {
                                setSwitchTarget(p);
                                setSwitchPassword('');
                                setSwitchError('');
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs transition cursor-pointer flex items-center gap-1"
                            title="切換以此帳號登入操作"
                          >
                            <span>切換</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 操盤手作業核銷與持倉詳情 MODAL (解決 按詳情無效 問題) */}
      {/* ========================================================================= */}
      {detailProfile && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={e => {
            if (e.target === e.currentTarget) setDetailProfile(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-amber-400 overflow-hidden text-slate-900">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-950 via-amber-950 to-slate-900 p-4 sm:p-5 text-white flex items-center justify-between border-b border-amber-500/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-2xl flex items-center justify-center border border-amber-400/40 shrink-0">
                  {detailProfile.avatarEmoji || '👑'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-white">
                      {detailProfile.studentName} · 作業核銷與持倉詳情
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                      {detailProfile.strategyBadge || '自主策略'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    {detailProfile.teamName || '金融博士班計量實務組'} · 起始本金 NT$ 50,000,000
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailProfile(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
              {/* Asset & Performance Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block">總淨資產 (NAV)</span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-950 block mt-0.5">
                    NT$ {Math.round(detailProfile.calculatedNAV || 50000000).toLocaleString()}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block">累計報酬率</span>
                  <span
                    className={`text-sm sm:text-base font-black font-mono block mt-0.5 ${
                      (detailProfile.calculatedReturnPct || 0) >= 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {(detailProfile.calculatedReturnPct || 0) >= 0 ? '+' : ''}
                    {(detailProfile.calculatedReturnPct || 0).toFixed(2)}%
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block">可用現金</span>
                  <span className="text-sm sm:text-base font-black font-mono text-slate-900 block mt-0.5">
                    NT$ {Math.round(detailProfile.availableCash || 0).toLocaleString()}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <span className="text-[10px] text-slate-500 font-bold block">未實現損益</span>
                  <span
                    className={`text-sm sm:text-base font-black font-mono block mt-0.5 ${
                      detailProfile.unrealizedPnL >= 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {detailProfile.unrealizedPnL >= 0 ? '+' : ''}
                    NT$ {Math.round(detailProfile.unrealizedPnL || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Section 1: 作業五大工具核銷檢核表 (五項必修審查) */}
              {(() => {
                const positions: any[] = detailProfile.positions || [];
                const stocks = positions.filter(pos => pos.category === 'stocks');
                const bonds = positions.filter(pos => pos.category === 'bonds');
                const etfs = positions.filter(pos => pos.category === 'etfs');
                const futures = positions.filter(pos => pos.category === 'futures');
                const options = positions.filter(
                  pos => pos.category === 'options' || pos.category === 'warrants'
                );

                const tools = [
                  {
                    name: '1. 台股現貨 (個股標的)',
                    desc: '台積電、鴻海、聯發科等指標股',
                    items: stocks,
                    icon: '📈',
                  },
                  {
                    name: '2. 長天期美債 ETF (固定收益)',
                    desc: '00679B 元大美債20年、00687B 國泰美債20年等',
                    items: bonds,
                    icon: '🛡️',
                  },
                  {
                    name: '3. 大盤指數 ETF (核心被動配置)',
                    desc: '0050 元大台灣50、006208 富邦台50 等',
                    items: etfs,
                    icon: '🏛️',
                  },
                  {
                    name: '4. 台指期貨 (多空避險與槓桿)',
                    desc: '大台 (TX)、小台 (MTX)、微台 (TMF) 或個股期貨',
                    items: futures,
                    icon: '⚡',
                  },
                  {
                    name: '5. 台指選擇權 / 權證 (非對稱策略)',
                    desc: 'TXO 買權/賣權 (Buy/Sell Call/Put) 或認購認售權證',
                    items: options,
                    icon: '🎯',
                  },
                ];

                const completedCount = tools.filter(t => t.items.length > 0).length;

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-900">
                          🎯 作業五大工具核銷檢核清單
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                            completedCount === 5
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          核銷進度：{completedCount} / 5
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-bold">
                        {completedCount === 5 ? '🎉 已符合全班實戰核銷標準' : `⚠️ 尚缺 ${5 - completedCount} 項工具未配置`}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {tools.map((t, i) => {
                        const isDone = t.items.length > 0;
                        return (
                          <div
                            key={`tool-check-${i}`}
                            className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                              isDone
                                ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl shrink-0">{t.icon}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-xs sm:text-sm">{t.name}</span>
                                  {isDone ? (
                                    <span className="text-[10px] px-2 py-0.2 bg-emerald-200 text-emerald-900 rounded font-black flex items-center gap-0.5">
                                      <Check className="w-3 h-3" /> 已核銷
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-2 py-0.2 bg-slate-200 text-slate-700 rounded font-bold">
                                      尚未配置
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500 block">{t.desc}</span>
                              </div>
                            </div>

                            <div className="text-right sm:max-w-xs shrink-0 pl-8 sm:pl-0">
                              {isDone ? (
                                <div className="text-xs font-mono font-bold text-emerald-900">
                                  {t.items.map((it, idx) => (
                                    <span
                                      key={`item-tag-${idx}`}
                                      className="inline-block bg-white/80 border border-emerald-300 px-2 py-0.5 rounded-md text-[11px] mr-1 mb-0.5"
                                    >
                                      {it.name} ({it.symbol})
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-amber-700 font-semibold">
                                  尚未持有此類別標的
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Section 2: 完整持倉部位清單 */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-600" />
                    <span>現有持倉部位明細 ({detailProfile.positions?.length || 0} 檔)</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    計價基準：官方真實收盤行情
                  </span>
                </div>

                {!detailProfile.positions || detailProfile.positions.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs font-bold">
                    目前純現金 5,000 萬起手，尚未建立任何持倉部位。
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">標的名稱 / 代碼</th>
                          <th className="py-2.5 px-3">類別</th>
                          <th className="py-2.5 px-3 text-right">持有口/股數</th>
                          <th className="py-2.5 px-3 text-right">成本價</th>
                          <th className="py-2.5 px-3 text-right">現價</th>
                          <th className="py-2.5 px-3 text-right">未實現損益</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {detailProfile.positions.map((pos: any, idx: number) => {
                          const pnl = pos.unrealizedPnL || 0;
                          const isPos = pnl >= 0;
                          return (
                            <tr key={`pos-row-${idx}`} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold font-sans text-slate-900">
                                <div>{pos.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{pos.symbol}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                                  {pos.category}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                {pos.quantity?.toLocaleString() || 0}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">
                                {pos.entryPrice?.toLocaleString() || 0}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                {pos.currentPrice?.toLocaleString() || 0}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-black ${
                                  isPos ? 'text-rose-600' : 'text-emerald-700'
                                }`}
                              >
                                {isPos ? '+' : ''}
                                NT$ {Math.round(pnl).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="bg-slate-50 px-4 sm:px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Danger Zone: Delete this account & record - ONLY Superuser can see & execute */}
              {isSuperUser ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTarget(detailProfile)}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-95"
                  title="【最高管理者專屬權限】永久刪除此學員帳號與所有數據紀錄"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>[管理員] 刪除此筆資料與帳號</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>帳號受 Superuser 密碼安全保護</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isSuperUser) {
                      onSelectProfile(detailProfile.id);
                      setDetailProfile(null);
                    } else {
                      setSwitchTarget(detailProfile);
                      setSwitchPassword('');
                      setSwitchError('');
                      setDetailProfile(null);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-900 text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>切換以此帳號操作</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailProfile(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 永久刪除學員應用內確認對話框 (解決 刪除這一筆資料與帳號 問題) */}
      {/* ========================================================================= */}
      {confirmDeleteTarget && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={e => {
            if (e.target === e.currentTarget) setConfirmDeleteTarget(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border-2 border-rose-300 space-y-4 text-slate-900">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                永久刪除確認
              </span>
              <h4 className="text-base font-black text-slate-900">
                確定刪除「{confirmDeleteTarget.studentName}」帳號？
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                將永久自 Firebase 雲端與本機移除此帳號的 5,000 萬資產、持倉與所有交易紀錄，<strong className="text-rose-600">無法復原！</strong>
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">學員姓名：</span>
                <span className="font-black text-slate-900">{confirmDeleteTarget.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">所屬組別：</span>
                <span className="font-bold text-slate-800">{confirmDeleteTarget.teamName || '無'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">淨資產 (NAV)：</span>
                <span className="font-mono font-black text-rose-600">
                  NT$ {Math.round(confirmDeleteTarget.netAssetValue || (confirmDeleteTarget as any).calculatedNAV || 50000000).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleExecuteDelete(confirmDeleteTarget)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>確定永久刪除</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-900">
            <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-600" />
              建立新同學操盤手檔案 (Firebase 雲端同步)
            </h3>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="text-xs font-black text-slate-950 block mb-1">同學中文姓名 (必填)：</label>
                <input
                  type="text"
                  required
                  placeholder="例如：林宏宇、張子瑄"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-slate-950 font-bold text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-950 block mb-1">專案組別名稱：</label>
                <input
                  type="text"
                  placeholder="例如：金融博士班計量實務組"
                  value={newTeam}
                  onChange={e => setNewTeam(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-slate-950 font-bold text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-950 block mb-1">核心投資策略：</label>
                <input
                  type="text"
                  placeholder="例如：股債均衡配置、大台指避險"
                  value={newStrategy}
                  onChange={e => setNewStrategy(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border-2 border-slate-300 focus:border-amber-500 text-slate-950 font-bold text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600 shadow-sm"
                >
                  確認建立 5000 萬帳戶
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
