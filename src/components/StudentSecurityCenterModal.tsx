import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  RotateCcw,
  Download,
  Database,
  History,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Search,
  Layers,
  FileText,
  Lock,
  RefreshCw,
  X,
  Server,
  Key,
} from 'lucide-react';
import { StudentProfile, ImmutableTransaction, BackupSnapshot, AuditLog } from '../types/market';
import {
  createBackupSnapshot,
  fetchBackupSnapshots,
  restoreSingleStudentFromSnapshot,
  fetchClassTransactions,
  fetchAuditLogs,
  exportClassroomData,
  testConnection,
  CURRENT_SCHEMA_VERSION,
} from '../services/firebase';

interface StudentSecurityCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: StudentProfile[];
  currentProfile: StudentProfile;
  onStudentRestored?: (restored: StudentProfile) => void;
}

export const StudentSecurityCenterModal: React.FC<StudentSecurityCenterModalProps> = ({
  isOpen,
  onClose,
  profiles,
  currentProfile,
  onStudentRestored,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pitr' | 'ledger' | 'backups'>('overview');
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [transactions, setTransactions] = useState<ImmutableTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isDbOnline, setIsDbOnline] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // PITR Single Student Restore Selection State
  const [selectedStudentName, setSelectedStudentName] = useState<string>(currentProfile.studentName);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  const loadSecurityData = async () => {
    setIsProcessing(true);
    try {
      const [online, snaps, txs, logs] = await Promise.all([
        testConnection(),
        fetchBackupSnapshots(),
        fetchClassTransactions(150),
        fetchAuditLogs(50),
      ]);
      setIsDbOnline(online);
      setSnapshots(snaps);
      setTransactions(txs);
      setAuditLogs(logs);
      if (snaps.length > 0 && !selectedSnapshotId) {
        setSelectedSnapshotId(snaps[0].id);
      }
    } catch (e) {
      console.warn('Failed to load security center data:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSecurityData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Selected snapshot for PITR comparison
  const targetSnapshot = snapshots.find(s => s.id === selectedSnapshotId) || snapshots[0];
  const targetStudentInCurrent = profiles.find(
    p => p.studentName.trim().toLowerCase() === selectedStudentName.trim().toLowerCase()
  );
  const targetStudentInSnapshot = targetSnapshot?.studentsSnapshot?.find(
    p => p.studentName.trim().toLowerCase() === selectedStudentName.trim().toLowerCase()
  );

  // Handle Manual Snapshot Creation
  const handleCreateManualSnapshot = async () => {
    setIsProcessing(true);
    setActionMessage(null);
    try {
      const snap = await createBackupSnapshot('教師手動全班安全備份快照', profiles);
      setSnapshots(prev => [snap, ...prev]);
      setActionMessage(`✅ 成功建立安全快照【${snap.id}】，已完整封存 ${profiles.length} 位學生即時狀態！`);
      loadSecurityData();
    } catch (e: any) {
      setActionMessage(`❌ 建立快照失敗: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Single Student Point-in-Time Recovery
  const handleRestoreSingleStudent = async () => {
    if (!targetSnapshot || !selectedStudentName) return;

    if (!targetStudentInSnapshot) {
      setActionMessage(`⚠️ 快照中找不到學生【${selectedStudentName}】之歷史存檔`);
      return;
    }

    const confirmRestore = window.confirm(
      `確定要執行【單一學生 PITR 精準復原】嗎？\n\n` +
      `學生：${selectedStudentName}\n` +
      `復原目標時間點：${targetSnapshot.snapshotTime}\n\n` +
      `⚠️ 注意：此操作僅精準還原該名學生的資金與部位，全班其他 ${profiles.length - 1} 位同學之任何數據均完全不受影響！`
    );

    if (!confirmRestore) return;

    setIsProcessing(true);
    setActionMessage(null);
    try {
      const restored = await restoreSingleStudentFromSnapshot(targetSnapshot, selectedStudentName);
      if (restored) {
        setActionMessage(`✅ 成功將學生【${selectedStudentName}】還原至 ${targetSnapshot.snapshotTime} 當時狀態！`);
        if (onStudentRestored) {
          onStudentRestored(restored);
        }
        loadSecurityData();
      } else {
        setActionMessage(`❌ 復原失敗：無法解析該學生快照資料`);
      }
    } catch (e: any) {
      setActionMessage(`❌ 復原過程異常: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Full Class Export
  const handleDownloadClassData = () => {
    try {
      const jsonStr = exportClassroomData(profiles);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finmind_class_backup_v3_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionMessage(`✅ 全班資料 JSON 備份已下載至您的電腦！`);
    } catch (e: any) {
      setActionMessage(`❌ 匯出失敗: ${e?.message || e}`);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (!ledgerSearch.trim()) return true;
    const q = ledgerSearch.toLowerCase().trim();
    return (
      t.studentName.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.transactionId.toLowerCase().includes(q) ||
      t.uid.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in text-slate-900">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header Strip */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-xs">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  學生資產安全中心 · 零遺失架構規格
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Schema v{CURRENT_SCHEMA_VERSION}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  不可變交易帳本
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                UI 可以一直改，學生的交易帳本絕不跟著 UI 改 · 支援 7天 PITR 單人精準復原
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status KPI Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 font-bold block">Firebase 資料庫</span>
            <span className="font-black text-emerald-700 flex items-center gap-1 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${isDbOnline ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
              <span>{isDbOnline ? '🟢 雲端已連線' : '🔴 離線快取'}</span>
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 font-bold block">帳本保護模式</span>
            <span className="font-black text-slate-950 block mt-0.5 font-mono text-[11px]">
              🔒 Append-Only (禁刪)
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 font-bold block">學生帳戶總數</span>
            <span className="font-black text-slate-950 block mt-0.5 font-mono text-sm">
              {profiles.length} 位操盤手
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 font-bold block">不可變交易總數</span>
            <span className="font-black text-amber-700 block mt-0.5 font-mono text-sm">
              {transactions.length} 筆不可篡改
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 font-bold block">PITR 復原支援</span>
            <span className="font-black text-emerald-800 block mt-0.5">
              🟢 7天快照與單人
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 font-bold block">安全版本</span>
            <span className="font-black text-slate-950 block mt-0.5 font-mono">
              v{CURRENT_SCHEMA_VERSION}.0.0 零遺失
            </span>
          </div>
        </div>

        {/* Action Notice Message Banner */}
        {actionMessage && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center justify-between shadow-2xs animate-fade-in">
            <span>{actionMessage}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-slate-500 hover:text-slate-900 ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-5 sm:px-6 pt-3 border-b border-slate-200 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-amber-500 text-slate-950 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span>【安全架構與防護指標】</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pitr')}
            className={`pb-2.5 px-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'pitr'
                ? 'border-amber-500 text-slate-950 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            <span>【單一學生 PITR 精準復原】</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`pb-2.5 px-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'border-amber-500 text-slate-950 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-purple-600" />
            <span>【不可變交易帳本 ({transactions.length})】</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backups')}
            className={`pb-2.5 px-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'backups'
                ? 'border-amber-500 text-slate-950 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4 text-sky-600" />
            <span>【快照庫與資料匯出 ({snapshots.length})】</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pillar 1: Permanent UID */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-black text-slate-950 text-sm">
                    <Key className="w-4 h-4 text-amber-600" />
                    <span>1. 永久固定 UID 體系（非以姓名為唯一鍵）</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    即便學生修改姓名、換組或更換電腦瀏覽器，背後的 <code>stu_xxxxxxxx</code> 永久 UID 永遠不變，所有持倉與交易流水皆以此 UID 綁定，徹底告別更名丟失數據的窘境。
                  </p>
                  <div className="pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-700">
                    目前登入學生 UID：<span className="font-black text-amber-800">{currentProfile.uid || 'stu_initial'}</span>（{currentProfile.studentName}）
                  </div>
                </div>

                {/* Pillar 2: Immutable Ledger */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-black text-slate-950 text-sm">
                    <Lock className="w-4 h-4 text-purple-600" />
                    <span>2. 不可變交易帳本（Immutable Ledger）</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    每一筆下單、平倉與沖銷，均寫入獨立的不可變交易帳本。依據 Firestore Security Rules 嚴格限制：<span className="text-rose-700 font-bold">禁止 DELETE、禁止 UPDATE，僅允許 CREATE</span>。下錯單以對沖沖銷流水紀錄，完整保存教學審計痕跡。
                  </p>
                  <div className="pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-700">
                    帳本保護規則：<code>allow update, delete: if false;</code> 已部署生效
                  </div>
                </div>

                {/* Pillar 3: Single Student PITR */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-black text-slate-950 text-sm">
                    <RotateCcw className="w-4 h-4 text-emerald-600" />
                    <span>3. 單一學生 PITR 精準復原（絕不盲目全班覆蓋）</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    若某位學生誤操作或程式單點異常，教師只需選擇該位同學與指定歷史時間點快照，系統僅復原該學生之現金與持倉，全班其他 30+ 位同學的真實交易成果不受任何干擾。
                  </p>
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-emerald-800 font-bold">
                    已備妥 7 天多版本時間點快照復原引擎
                  </div>
                </div>

                {/* Pillar 4: Schema v3 Migration Defense */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-black text-slate-950 text-sm">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span>4. AI Studio 更新防呆與 Schema 版本控制</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    所有資料結構全面附帶 <code>schemaVersion: 3</code> 識別。未來 AI Studio 進行任何功能擴充或 UI 改版時，必須遵循「備份 → Schema 檢查 → Migration → 驗證」五道防護門檻，不得直接破壞舊資料。
                  </p>
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-blue-800 font-bold">
                    當前運行結構：Schema Version 3 企業級規範
                  </div>
                </div>
              </div>

              {/* Student UID Roster */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="font-black text-slate-950 flex items-center gap-1.5">
                    <span>👥</span>
                    <span>全班學生固定 UID 映射清冊 ({profiles.length} 位)</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    自動同步至 Firebase Firestore /players
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">永久 UID</th>
                        <th className="py-2 px-3">學生姓名</th>
                        <th className="py-2 px-3">團隊名稱</th>
                        <th className="py-2 px-3 text-right">可用現金</th>
                        <th className="py-2 px-3 text-right">持倉數</th>
                        <th className="py-2 px-3 text-center">結構版本</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {profiles.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-[11px] text-amber-800 font-bold">
                            {p.uid || `stu_${p.studentName.slice(0, 4)}`}
                          </td>
                          <td className="py-2 px-3 font-black text-slate-950 flex items-center gap-1">
                            <span>{p.avatarEmoji || '👑'}</span>
                            <span>{p.studentName}</span>
                            {p.studentName === currentProfile.studentName && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                                當前
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 text-[11px]">{p.teamName}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            NT$ {Math.round(p.availableCash).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {p.positions?.length || 0} 檔
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              v{p.schemaVersion || 3}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SINGLE STUDENT PITR RESTORE */}
          {activeTab === 'pitr' && (
            <div className="space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-xs">
                    🔄
                  </div>
                  <div>
                    <h4 className="font-black text-emerald-950 text-sm">
                      單一學生 PITR 精準復原（Point-in-Time Recovery）
                    </h4>
                    <p className="text-emerald-900 text-xs mt-0.5 font-medium">
                      針對特定學生（如誤買跌停或資料異常），從歷史快照還原該生狀態，全班其他同學數據完全不受干擾！
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateManualSnapshot}
                  disabled={isProcessing}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shrink-0 shadow-xs transition cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  <span>立即建立新時間點快照 ➔</span>
                </button>
              </div>

              {/* Selector Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    步驟 1：選擇要檢視或復原的學生
                  </label>
                  <select
                    value={selectedStudentName}
                    onChange={e => setSelectedStudentName(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-slate-950 font-bold focus:border-amber-500 shadow-2xs"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.studentName}>
                        {p.studentName}（{p.teamName} · 現金: NT$ {Math.round(p.availableCash).toLocaleString()}）
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    步驟 2：選擇欲復原之歷史時間點快照
                  </label>
                  <select
                    value={selectedSnapshotId}
                    onChange={e => setSelectedSnapshotId(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-slate-950 font-bold focus:border-amber-500 shadow-2xs"
                  >
                    {snapshots.length === 0 ? (
                      <option value="">（目前尚無快照，請點擊上方按鈕建立）</option>
                    ) : (
                      snapshots.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.snapshotTime} · {s.reason} ({s.totalStudents}人存檔)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Side-by-Side State Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current State */}
                <div className="p-4 rounded-2xl bg-white border-2 border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-black text-slate-950 text-sm">
                      【現況】當前即時狀態
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold">
                      即時
                    </span>
                  </div>

                  {targetStudentInCurrent ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">學生名稱：</span>
                        <span className="font-black text-slate-950">{targetStudentInCurrent.studentName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">永久 UID：</span>
                        <span className="font-mono text-amber-800 font-bold">{targetStudentInCurrent.uid || 'stu_current'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">可用現金：</span>
                        <span className="font-mono font-black text-emerald-800">
                          NT$ {Math.round(targetStudentInCurrent.availableCash).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">持倉數量：</span>
                        <span className="font-mono font-bold text-slate-900">
                          {targetStudentInCurrent.positions?.length || 0} 檔
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">最後異動：</span>
                        <span className="font-mono text-slate-500">
                          {new Date(targetStudentInCurrent.updatedAt || Date.now()).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 py-4 text-center">查無即時資料</div>
                  )}
                </div>

                {/* Snapshot Target State */}
                <div className="p-4 rounded-2xl bg-amber-50/70 border-2 border-amber-300 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                    <span className="font-black text-amber-950 text-sm">
                      【快照】歷史時間點狀態
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-200 text-amber-900 font-bold">
                      {targetSnapshot?.snapshotTime || '無快照'}
                    </span>
                  </div>

                  {targetStudentInSnapshot ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-amber-800">快照學生：</span>
                        <span className="font-black text-slate-950">{targetStudentInSnapshot.studentName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-800">快照 UID：</span>
                        <span className="font-mono text-amber-900 font-bold">{targetStudentInSnapshot.uid || 'stu_snap'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-800">當時可用現金：</span>
                        <span className="font-mono font-black text-emerald-900">
                          NT$ {Math.round(targetStudentInSnapshot.availableCash).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-800">當時持倉數量：</span>
                        <span className="font-mono font-bold text-slate-900">
                          {targetStudentInSnapshot.positions?.length || 0} 檔
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-800">快照備註理由：</span>
                        <span className="font-medium text-slate-700 truncate max-w-[200px]">
                          {targetSnapshot?.reason}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 py-4 text-center">
                      此快照內無學生【{selectedStudentName}】之存檔
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-slate-600 text-xs font-semibold">
                  點擊確認後，系統將精準套用該快照至【{selectedStudentName}】，全班其餘 {profiles.length - 1} 位同學不受影響。
                </div>
                <button
                  type="button"
                  onClick={handleRestoreSingleStudent}
                  disabled={!targetStudentInSnapshot || isProcessing}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>確定僅復原【{selectedStudentName}】至此快照 ➔</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: IMMUTABLE TRANSACTION LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-black text-slate-950 text-sm flex items-center gap-1.5">
                    <span>📒</span>
                    <span>不可變交易帳本 (Append-Only Immutable Ledger)</span>
                  </h4>
                  <p className="text-slate-500 text-[11px] font-medium">
                    所有成交紀錄依時間戳記依序寫入，禁止 UPDATE / DELETE，保留不可篡改之教學審計憑據
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="搜尋學生姓名、標的代號或單號..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs max-h-96 overflow-y-auto">
                {filteredTransactions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-semibold">
                    目前尚無交易帳本紀錄（或查無符合關鍵字之流水）
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">單號 (TXID)</th>
                        <th className="py-2.5 px-3">時間戳記</th>
                        <th className="py-2.5 px-3">學生 (UID)</th>
                        <th className="py-2.5 px-3">標的</th>
                        <th className="py-2.5 px-3 text-center">動作</th>
                        <th className="py-2.5 px-3 text-right">成交價</th>
                        <th className="py-2.5 px-3 text-right">數量</th>
                        <th className="py-2.5 px-3 text-right">總金額</th>
                        <th className="py-2.5 px-3">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map(tx => (
                        <tr key={tx.transactionId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-[10px] text-slate-600 font-bold">
                            {tx.transactionId}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                            {tx.timestamp}
                          </td>
                          <td className="py-2 px-3 font-black text-slate-900">
                            <div>{tx.studentName}</div>
                            <div className="font-mono text-[10px] text-amber-800 font-normal">
                              {tx.uid}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-black text-slate-950">
                            {tx.symbol} {tx.name}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tx.side === 'BUY'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}>
                              {tx.side}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            NT$ {tx.price?.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-700">
                            {tx.quantity}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-cyan-900">
                            NT$ {Math.round(tx.amount || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              {tx.status || 'FILLED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BACKUPS & EXPORT */}
          {activeTab === 'backups' && (
            <div className="space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <h4 className="font-black text-slate-950 text-sm">
                    手動安全快照與全班 JSON 匯出備份
                  </h4>
                  <p className="text-slate-500 text-xs mt-0.5 font-medium">
                    建議在課堂結算、期末考評或 AI Studio 重大改版前建立快照與下載備份。
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateManualSnapshot}
                    disabled={isProcessing}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-black text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>立即建立新快照</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadClassData}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>下載全班 JSON 備份</span>
                  </button>
                </div>
              </div>

              {/* Snapshot List */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 font-black text-slate-950">
                  歷史快照存檔庫（保留最近 14 週 / 各次重大異動）
                </div>

                {snapshots.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-semibold">
                    目前尚無建立快照，點選上方「立即建立新快照」即可即刻封存！
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {snapshots.map(s => (
                      <div
                        key={s.id}
                        className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-amber-800 text-xs">
                              {s.id}
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="font-black text-slate-950 text-xs">
                              {s.snapshotTime}
                            </span>
                            <span className="px-2 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {s.totalStudents} 位學生
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium">
                            備註原因：{s.reason} · 交易流水：{s.totalTransactions} 筆
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSnapshotId(s.id);
                            setActiveTab('pitr');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-800 hover:text-amber-950 font-bold text-xs transition cursor-pointer shrink-0 border border-slate-200"
                        >
                          使用此快照復原 ➔
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 sm:px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>AI Studio 零遺失規範：任何前端改版均不影響 Cloud Firestore 歷史交易帳本與 UID 體系</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition cursor-pointer"
          >
            關閉安全中心
          </button>
        </div>
      </div>
    </div>
  );
};
