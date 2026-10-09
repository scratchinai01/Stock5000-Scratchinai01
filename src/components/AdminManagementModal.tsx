import React, { useState } from 'react';
import {
  ShieldAlert,
  RotateCcw,
  Trash2,
  DollarSign,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  X,
  Search,
  Users,
  Award,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  LogOut,
  Lock,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Edit3,
  UserPlus,
  Plus,
  Save,
  Key,
  Zap,
} from 'lucide-react';
import { StudentProfile } from '../types/market';
import {
  ADMIN_EMAIL,
  SUPERUSER_NAME,
  DEFAULT_SUPERUSER_PASSWORD,
  resetPlayerInFirebase,
  resetAllPlayersInFirebase,
  deletePlayerFromFirebase,
  savePlayerProfileToFirebase,
  updateStudentPassword,
  getPlayerDocId,
  getOrGeneratePermanentUID,
  CURRENT_SCHEMA_VERSION,
} from '../services/firebase';

interface AdminManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: StudentProfile[];
  onRefreshProfiles: () => void;
  adminEmail: string | null;
  isAdminLoggedIn: boolean;
  onAdminLogin: (email: string) => void;
  onAdminLogout: () => void;
  onDeleteProfile?: (studentName: string) => void;
  onUpdateProfile?: (profile: StudentProfile) => void;
  onOpenGroqManager?: () => void;
  groqKeyCount?: number;
}

export const AdminManagementModal: React.FC<AdminManagementModalProps> = ({
  isOpen,
  onClose,
  profiles,
  onRefreshProfiles,
  adminEmail,
  isAdminLoggedIn,
  onAdminLogin,
  onAdminLogout,
  onDeleteProfile,
  onUpdateProfile,
  onOpenGroqManager,
  groqKeyCount,
}) => {
  const [loginEmailInput, setLoginEmailInput] = useState<string>(SUPERUSER_NAME);
  const [loginPasscodeInput, setLoginPasscodeInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // In-app interactive confirmation dialogs (NEVER use window.confirm / alert)
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<StudentProfile | null>(null);
  const [confirmResetTarget, setConfirmResetTarget] = useState<StudentProfile | null>(null);
  const [confirmPasswordTarget, setConfirmPasswordTarget] = useState<StudentProfile | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState<string>('');

  // Full student edit modal state
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editTeam, setEditTeam] = useState<string>('');
  const [editCash, setEditCash] = useState<number>(50000000);
  const [editPassword, setEditPassword] = useState<string>('');
  const [editRoleTitle, setEditRoleTitle] = useState<string>('');
  const [editAvatarEmoji, setEditAvatarEmoji] = useState<string>('👑');
  const [editCustomMotto, setEditCustomMotto] = useState<string>('');
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);

  // Quick Create student / Superuser account modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState<string>('程瑋翔');
  const [createTeam, setCreateTeam] = useState<string>('金融博士班計量實務組');
  const [createCash, setCreateCash] = useState<number>(50000000);
  const [createPassword, setCreatePassword] = useState<string>('3226');
  const [createRoleTitle, setCreateRoleTitle] = useState<string>('最高操盤手 (SUPERUSER)');
  const [createAvatarEmoji, setCreateAvatarEmoji] = useState<string>('👑');

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setLoginError(null);

    const inputUser = loginEmailInput.trim();
    const inputPass = loginPasscodeInput.trim();

    if (!inputPass) {
      setLoginError('請輸入超級管理者專屬密碼');
      setIsProcessing(false);
      return;
    }

    // 1. Try server-side API verification (validates against process.env.ADMIN_SUPERUSER_PASSWORD secrets)
    try {
      const res = await fetch('/api/admin/verify-superuser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inputUser, password: inputPass }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onAdminLogin('程瑋翔 (SUPERUSER)');
        showToast('👑 最高超級管理者 程瑋翔 (SUPERUSER) 驗證成功！已啟用管理控制權限');
        setIsProcessing(false);
        return;
      } else if (res.status === 401) {
        setLoginError(data.message || '密碼錯誤，請確認輸入正確的 Superuser 管理密碼');
        setIsProcessing(false);
        return;
      }
    } catch (err) {
      console.warn('Backend superuser verification fallback to client rules:', err);
    }

    // 2. Client fallback verification (including VITE_SUPERUSER_PASSWORD)
    const envSuperPass = (import.meta as any).env?.VITE_SUPERUSER_PASSWORD || DEFAULT_SUPERUSER_PASSWORD;
    const isUserValid =
      inputUser === SUPERUSER_NAME ||
      inputUser.toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
      inputUser.toLowerCase() === 'admin' ||
      inputUser.toLowerCase() === 'superuser' ||
      inputUser === '程瑋翔';
    const isPassValid = inputPass === envSuperPass || inputPass === '3226';

    if (isUserValid && isPassValid) {
      onAdminLogin('程瑋翔 (SUPERUSER)');
      showToast('👑 最高超級管理者 程瑋翔 (SUPERUSER) 登入成功！已驗證 Secrets 金鑰密碼');
    } else if (!isPassValid) {
      setLoginError('密碼錯誤！請輸入正確的超級管理員密碼');
    } else {
      setLoginError(`僅授權最高管理者 程瑋翔 (${ADMIN_EMAIL}) 登入使用此重置面板`);
    }
    setIsProcessing(false);
  };

  // Open Full Edit Modal for Student / Superuser
  const handleOpenEditStudent = (p: StudentProfile) => {
    setEditingStudent(p);
    setEditName(p.studentName);
    setEditTeam(p.teamName || '金融博士班計量實務組');
    setEditCash(p.availableCash ?? 50000000);
    setEditPassword(p.password || (p.studentName === '程瑋翔' ? '3226' : 'money888'));
    setEditRoleTitle(p.roleTitle || (p.studentName === '程瑋翔' ? '最高操盤手 (SUPERUSER)' : '操盤手'));
    setEditAvatarEmoji(p.avatarEmoji || (p.studentName === '程瑋翔' ? '👑' : '👤'));
    setEditCustomMotto(p.customMotto || '專注價值，穩健配置！');
    setShowEditPassword(false);
  };

  // Save Full Edit for Student
  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setIsProcessing(true);

    try {
      const cleanName = editName.trim();
      const cleanCash = Number(editCash) || 0;
      const totalSecurities = (editingStudent.positions || []).reduce(
        (sum, pos) => sum + (pos.notionalValue || pos.totalCostOrMargin || 0),
        0
      );
      const totalUnrealized = (editingStudent.positions || []).reduce(
        (sum, pos) => sum + (pos.unrealizedPnL || 0),
        0
      );
      const newNav = cleanCash + totalSecurities + totalUnrealized;
      const initialCapital = editingStudent.initialCapital || 50000000;
      const retPct = ((newNav - initialCapital) / initialCapital) * 100;

      const updated: StudentProfile = {
        ...editingStudent,
        studentName: cleanName,
        teamName: editTeam.trim() || '金融博士班計量實務組',
        availableCash: cleanCash,
        netAssetValue: newNav,
        totalReturnPct: retPct,
        password: editPassword.trim() || 'money888',
        roleTitle: editRoleTitle.trim() || '操盤手',
        avatarEmoji: editAvatarEmoji.trim() || '👤',
        customMotto: editCustomMotto.trim() || '專注價值，穩健配置！',
        updatedAt: Date.now(),
      };

      await savePlayerProfileToFirebase(updated);
      if (editPassword.trim()) {
        await updateStudentPassword(cleanName, editPassword.trim());
      }

      onUpdateProfile?.(updated);
      onRefreshProfiles();
      showToast(`已成功儲存並更新「${cleanName}」的帳號資料與設定！`);
      setEditingStudent(null);
    } catch (err: any) {
      console.error('Save student edit error:', err);
      showToast(`儲存失敗：${err?.message || '請確認網路連線'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Delete Student (In-app confirmed, NO window.confirm)
  const handleExecuteDeleteSingle = async (p: StudentProfile) => {
    setIsProcessing(true);
    try {
      const ok = await deletePlayerFromFirebase(p.studentName, p.id);
      if (ok) {
        onDeleteProfile?.(p.studentName);
        onRefreshProfiles();
        showToast(`已永久刪除學員「${p.studentName}」帳號與雲端紀錄！`);
        setConfirmDeleteTarget(null);
      } else {
        showToast('刪除失敗，請檢查網路連線。');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Reset Single Student (In-app confirmed)
  const handleExecuteResetSingle = async (p: StudentProfile) => {
    setIsProcessing(true);
    try {
      const ok = await resetPlayerInFirebase(p.studentName);
      if (ok) {
        onRefreshProfiles();
        showToast(`已成功將「${p.studentName}」重置為 NT$ 50,000,000！`);
        setConfirmResetTarget(null);
      } else {
        showToast('重置失敗，請檢查網路連線。');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Password Update / Reset (In-app confirmed)
  const handleExecutePasswordUpdate = async (p: StudentProfile) => {
    setIsProcessing(true);
    try {
      const newPwd = customPasswordInput.trim() || (p.studentName === '程瑋翔' ? '3226' : 'money888');
      const ok = await updateStudentPassword(p.studentName, newPwd);
      if (ok) {
        onRefreshProfiles();
        showToast(`已成功將「${p.studentName}」密碼更新為：${newPwd}`);
        setConfirmPasswordTarget(null);
        setCustomPasswordInput('');
      } else {
        showToast('密碼更新失敗，請檢查網路。');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset ALL students in Firebase
  const handleResetAll = async () => {
    setIsProcessing(true);
    try {
      const res = await resetAllPlayersInFirebase();
      if (res.success) {
        setConfirmResetAll(false);
        showToast(`全班重置成功！已將共 ${res.count} 位學員重置為初始 5,000 萬資產！`);
        onRefreshProfiles();
      } else {
        showToast('部分學員重置失敗，請重試。');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Quick Create / Register account for 程瑋翔 or new student
  const handleCreateNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const name = createName.trim();
      const team = createTeam.trim() || '金融博士班計量實務組';
      const cash = Number(createCash) || 50000000;
      const pwd = createPassword.trim() || (name === '程瑋翔' ? '3226' : 'money888');
      const docId = getPlayerDocId(name);
      const uid = getOrGeneratePermanentUID(name);

      const newProf: StudentProfile = {
        id: docId,
        uid,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        role: name === '程瑋翔' ? 'admin' : 'student',
        status: 'active',
        studentName: name,
        teamName: team,
        characterRole: name === '程瑋翔' ? 'phd_autonomous' : 'wealth_tycoon',
        roleTitle: createRoleTitle.trim() || (name === '程瑋翔' ? '最高操盤手 (SUPERUSER)' : '操盤手'),
        avatarEmoji: createAvatarEmoji.trim() || (name === '程瑋翔' ? '👑' : '👤'),
        strategyBadge: name === '程瑋翔' ? '大富翁·超級管理者' : '大富翁·操盤精英',
        customMotto: name === '程瑋翔' ? '掌握全局，引領策略！' : '積極佈局，穩中求勝！',
        password: pwd,
        initialCapital: 50000000,
        availableCash: cash,
        marginDeposits: 0,
        netAssetValue: cash,
        totalReturnPct: 0,
        positions: [],
        tradeHistory: [],
        benchmarkDate: '即時撮合',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isCurrentPlayer: true,
      };

      await savePlayerProfileToFirebase(newProf);
      await updateStudentPassword(name, pwd);

      onUpdateProfile?.(newProf);
      onRefreshProfiles();
      showToast(`已成功建立 / 設定帳號「${name}」！`);
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error('Create account error:', err);
      showToast(`建立失敗：${err?.message || '請稍後重試'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProfiles = profiles.filter(
    p =>
      p.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.teamName && p.teamName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalClassNav = profiles.reduce((sum, p) => sum + (p.netAssetValue || 50000000), 0);
  const hasChengWeiXiang = profiles.some(p => p.studentName.trim() === '程瑋翔');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 p-5 text-white flex items-center justify-between shrink-0 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white">
                  5000萬股市大富翁 · 最高管理者控制台
                </h3>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-black bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 border border-amber-300 shadow-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  SUPERUSER
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5 font-medium">
                最高授權：程瑋翔 (scratchinai01@gmail.com) · Secrets 密碼安全防護 · 全班學員設定與永久刪除管控
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

        {/* Toast Alert */}
        {actionSuccessMsg && (
          <div className="bg-emerald-600 text-white text-xs font-black px-4 py-2 flex items-center justify-center gap-2 shrink-0 animate-in slide-in-from-top-2">
            <CheckCircle className="w-4 h-4" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {!isAdminLoggedIn ? (
            /* Superuser Login Gate */
            <div className="max-w-md mx-auto my-6 bg-gradient-to-b from-amber-50/90 to-amber-100/40 border-2 border-amber-300/80 rounded-3xl p-6 sm:p-7 text-center shadow-xl space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-900 border border-amber-400/50 mx-auto flex items-center justify-center shadow-inner">
                <Crown className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-200/80 text-amber-900 text-[11px] font-black border border-amber-300 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>SUPERUSER 最高超級管理權限</span>
                </div>
                <h4 className="text-lg font-black text-slate-900">管理者身分與 Secrets 密碼驗證</h4>
                <p className="text-xs text-slate-600 mt-1">
                  請登入以管理全班資產、微調個別學員資金、重置、設定或永久刪除學員紀錄
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                <div>
                  <label className="text-xs font-black text-slate-700 flex items-center justify-between mb-1">
                    <span>管理者姓名 / 帳號：</span>
                    <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                      SUPERUSER 認證
                    </span>
                  </label>
                  <input
                    type="text"
                    value={loginEmailInput}
                    onChange={e => setLoginEmailInput(e.target.value)}
                    required
                    placeholder="請輸入管理者姓名 (程瑋翔)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-700 flex items-center justify-between mb-1">
                    <span>管理者密碼：</span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      (支援 Secrets 密碼或 3226)
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPasscodeInput}
                      onChange={e => setLoginPasscodeInput(e.target.value)}
                      required
                      placeholder="請輸入 Superuser 管理密碼 (3226)"
                      autoComplete="current-password"
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                      title={showPassword ? '隱藏密碼' : '顯示密碼'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-2.5 text-[11px] text-amber-950 flex items-start gap-2">
                  <KeyRound className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black">Secrets 安全配置防護：</span>
                    <span className="text-slate-700"> 最高管理者程瑋翔專屬授權，支援全權限修改學員資料與帳號刪除。</span>
                  </div>
                </div>

                {loginError && (
                  <div className="text-xs text-rose-600 font-bold bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-3 bg-gradient-to-r from-amber-600 via-amber-700 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-black text-sm rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Crown className="w-4 h-4 text-amber-200" />
                  )}
                  <span>以超級管理者「程瑋翔」登入控制台</span>
                </button>
              </form>
            </div>
          ) : (
            /* Admin Active Dashboard */
            <>
              {/* Status Bar & Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold block">全班參與人數</span>
                    <span className="font-mono font-black text-lg text-slate-900">
                      {profiles.length} <span className="text-xs text-slate-600 font-semibold">人</span>
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold block">全班總資產市值</span>
                    <span className="font-mono font-black text-lg text-slate-900">
                      {(totalClassNav / 100000000).toFixed(2)} <span className="text-xs text-slate-600 font-semibold">億</span>
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 font-bold block">當前第一名</span>
                    <span className="font-bold text-sm text-slate-900 truncate block max-w-[130px]">
                      {profiles[0]?.studentName || '尚無資料'}
                    </span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between gap-2 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-[10px] text-amber-900 font-black tracking-wide">
                        SUPERUSER 已啟用
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-900 truncate block max-w-[130px] mt-0.5">
                      {adminEmail?.includes('程瑋翔') ? '程瑋翔 (最高管理)' : (adminEmail || '程瑋翔')}
                    </span>
                    <span className="text-[9px] text-emerald-700 font-bold block">
                      Secrets 安全憑證已驗證
                    </span>
                  </div>
                  <button
                    onClick={onAdminLogout}
                    title="登出管理者"
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Banner for 程瑋翔 */}
              {!hasChengWeiXiang ? (
                <div className="bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-transparent border-2 border-amber-400 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-black shadow-xs">
                      👑
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-amber-950">
                        目前名單尚未加入「程瑋翔」操盤手帳號
                      </h4>
                      <p className="text-xs text-amber-800">
                        點擊右側按鈕立即建立「程瑋翔 (SUPERUSER)」帳號，並享有預設 5,000 萬資產與專屬管理標章。
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateName('程瑋翔');
                      setCreateTeam('金融博士班計量實務組');
                      setCreateCash(50000000);
                      setCreatePassword('3226');
                      setCreateRoleTitle('最高操盤手 (SUPERUSER)');
                      setCreateAvatarEmoji('👑');
                      setIsCreateModalOpen(true);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-xs rounded-xl shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>一鍵建立「程瑋翔」帳號</span>
                  </button>
                </div>
              ) : (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-950 font-bold">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <span>
                      最高管理者「程瑋翔」已在學員名單中！點擊清單中的「✏️ 修改/設定」即可隨時自訂資金、密碼、姓名與組別。
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const p = profiles.find(x => x.studentName.trim() === '程瑋翔');
                      if (p) handleOpenEditStudent(p);
                    }}
                    className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded-lg font-black text-[11px] cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>立即設定「程瑋翔」帳號</span>
                  </button>
                </div>
              )}

              {/* Groq 10-Slot Token Secrets Pool Management Card (Superuser Exclusive) */}
              {onOpenGroqManager && (
                <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border-2 border-amber-400/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-xs shrink-0">
                      ⚡
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-amber-950">
                          Groq 10 組免費算力金鑰輪詢池 (Secrets Token Pool)
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 font-mono font-bold">
                          {groqKeyCount ?? 0}/10 組已配置
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-0.5">
                        僅限最高管理者管理。配置 10 組 gsk_* 免費金鑰，AI 財務計算機與總經分析享有 0 費用秒級極速推論。
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenGroqManager}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs rounded-xl shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>設定 10組金鑰池</span>
                  </button>
                </div>
              )}

              {/* Danger Zone: Full Class Reset */}
              <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-200 text-rose-800 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-rose-950">
                      危險操作區 · 一鍵重置全班所有學員數據
                    </h4>
                    <p className="text-xs text-rose-800 mt-0.5">
                      將所有已註冊學員帳號的資產統一歸零並重置回 NT$ 50,000,000 現金，並清空所有持倉與委託。
                    </p>
                  </div>
                </div>

                {!confirmResetAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmResetAll(true)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 shadow-sm shrink-0"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>一鍵全班重置回 5000萬</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleResetAll}
                      className="px-4 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 shadow-md animate-pulse"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      <span>確定執行全班重置！</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetAll(false)}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              {/* Student Profiles List Management */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-slate-900">
                      所有學員即時清單 ({filteredProfiles.length} 筆)
                    </h4>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      點選各學員「✏️ 修改」可自訂資金密碼；「🗑️」可永久刪除帳號
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateName('');
                        setCreateTeam('金融博士班計量實務組');
                        setCreateCash(50000000);
                        setCreatePassword('money888');
                        setCreateRoleTitle('操盤手');
                        setCreateAvatarEmoji('👤');
                        setIsCreateModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-xs flex items-center gap-1 cursor-pointer transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>➕ 新增學員</span>
                    </button>

                    <div className="relative w-full sm:w-60">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜尋學員姓名或組別..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-800">
                      <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">學員姓名 / 組別</th>
                          <th className="py-2.5 px-3">角色頭銜</th>
                          <th className="py-2.5 px-3 text-right">可用現金 (NT$)</th>
                          <th className="py-2.5 px-3 text-right">總淨資產 (NAV)</th>
                          <th className="py-2.5 px-3 text-center">持倉檔數</th>
                          <th className="py-2.5 px-3 text-right">累計報酬率</th>
                          <th className="py-2.5 px-3 text-center">管理與設定操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredProfiles.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              無符合條件的學員資料
                            </td>
                          </tr>
                        ) : (
                          filteredProfiles.map((p, idx) => {
                            const isCheng = p.studentName.trim() === '程瑋翔';
                            const nav = p.netAssetValue || 50000000;
                            const retPct = p.totalReturnPct || 0;
                            const isPositive = retPct >= 0;

                            return (
                              <tr
                                key={`admin-row-${p.id || p.studentName}-${idx}`}
                                className={`transition ${
                                  isCheng ? 'bg-amber-50/60 hover:bg-amber-100/70 border-l-4 border-l-amber-500' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1.5 font-black text-slate-900 text-sm">
                                    <span>{p.studentName}</span>
                                    {isCheng && (
                                      <span className="text-[10px] px-2 py-0.2 bg-amber-400 text-slate-950 rounded-full font-black flex items-center gap-0.5">
                                        <Crown className="w-3 h-3 text-slate-950" />
                                        SUPERUSER
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-medium">
                                    {p.teamName || '個人操作'}
                                  </div>
                                </td>

                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200">
                                    <span>{p.avatarEmoji || '👤'}</span>
                                    <span>{p.roleTitle || '操盤手'}</span>
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-right font-mono font-bold">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span>NT$ {p.availableCash?.toLocaleString() || '50,000,000'}</span>
                                  </div>
                                </td>

                                <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                                  NT$ {Math.round(nav).toLocaleString()}
                                </td>

                                <td className="py-3 px-3 text-center font-mono">
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-[11px]">
                                    {p.positions?.length || 0} 筆
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-right font-mono font-bold">
                                  <span
                                    className={`inline-flex items-center gap-0.5 ${
                                      isPositive ? 'text-rose-600' : 'text-emerald-700'
                                    }`}
                                  >
                                    {isPositive ? '+' : ''}
                                    {retPct.toFixed(2)}%
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {/* 1. 編輯 / 設定按鈕 */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditStudent(p)}
                                      disabled={isProcessing}
                                      title="編輯學員姓名、組別、資金、密碼與設定"
                                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                                      <span>修改/設定</span>
                                    </button>

                                    {/* 2. 密碼按鈕 */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmPasswordTarget(p);
                                        setCustomPasswordInput(p.password || (p.studentName === '程瑋翔' ? '3226' : 'money888'));
                                      }}
                                      disabled={isProcessing}
                                      title="設定/重置此學員密碼"
                                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                                    >
                                      <Lock className="w-3 h-3 text-amber-600" />
                                      <span>密碼</span>
                                    </button>

                                    {/* 3. 重置回 5000萬按鈕 */}
                                    <button
                                      type="button"
                                      onClick={() => setConfirmResetTarget(p)}
                                      disabled={isProcessing}
                                      title="重置回初始 5,000 萬"
                                      className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>重置</span>
                                    </button>

                                    {/* 4. 刪除學員按鈕 (In-app confirm, NO window.confirm) */}
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteTarget(p)}
                                      disabled={isProcessing}
                                      title="永久刪除此學員帳號與紀錄"
                                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-medium">
            管理者操作會即時同步至雲端 Firestore 資料庫與本機快取，全班終端將即時自動更新。
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition cursor-pointer"
          >
            關閉面板
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* IN-APP MODAL 1: 永久刪除學員確認對話框 (解決 SuperUser 無法刪除帳號問題) */}
      {/* ========================================================================= */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-300 space-y-4 text-slate-900">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200 shadow-inner">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="text-center space-y-1.5">
              <div className="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider">
                永久刪除確認
              </div>
              <h4 className="text-base font-black text-slate-900">
                確定要永久刪除學員「{confirmDeleteTarget.studentName}」嗎？
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                此動作將會從雲端 Firestore、本機快取與所有排行榜中徹底刪除該學員的所有資產、持倉與委託紀錄，<strong className="text-rose-600 font-bold">此動作無法復原！</strong>
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
                <span className="text-slate-500">可用現金：</span>
                <span className="font-mono font-bold text-slate-900">
                  NT$ {confirmDeleteTarget.availableCash?.toLocaleString() || '50,000,000'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">總淨資產 (NAV)：</span>
                <span className="font-mono font-black text-rose-600">
                  NT$ {Math.round(confirmDeleteTarget.netAssetValue || 50000000).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleExecuteDeleteSingle(confirmDeleteTarget)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-98"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>確認永久刪除此帳號</span>
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

      {/* ========================================================================= */}
      {/* IN-APP MODAL 2: 重置單一學員確認對話框 (回 5000 萬) */}
      {/* ========================================================================= */}
      {confirmResetTarget && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-blue-300 space-y-4 text-slate-900">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto border border-blue-200 shadow-inner">
              <RotateCcw className="w-7 h-7" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-base font-black text-slate-900">
                重置「{confirmResetTarget.studentName}」回初始 5,000 萬？
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                該學員的可用現金將重置為 NT$ 50,000,000，並清空所有股票、期貨與原物料持倉。
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleExecuteResetSingle(confirmResetTarget)}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span>確定執行重置</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmResetTarget(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IN-APP MODAL 3: 密碼管理與重設對話框 */}
      {/* ========================================================================= */}
      {confirmPasswordTarget && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-300 space-y-4 text-slate-900">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto border border-amber-200 shadow-inner">
              <Key className="w-7 h-7" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-base font-black text-slate-900">
                管理「{confirmPasswordTarget.studentName}」登入密碼
              </h4>
              <p className="text-xs text-slate-600">
                您可以手動輸入新密碼，或點擊快速按鈕重置。
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-black text-slate-700 block mb-1">自訂新密碼：</label>
                <input
                  type="text"
                  value={customPasswordInput}
                  onChange={e => setCustomPasswordInput(e.target.value)}
                  placeholder={confirmPasswordTarget.studentName === '程瑋翔' ? '3226' : 'money888'}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm font-bold bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomPasswordInput(confirmPasswordTarget.studentName === '程瑋翔' ? '3226' : 'money888')}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold"
                >
                  帶入預設密碼 ({confirmPasswordTarget.studentName === '程瑋翔' ? '3226' : 'money888'})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleExecutePasswordUpdate(confirmPasswordTarget)}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>儲存並套用密碼</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmPasswordTarget(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IN-APP MODAL 4: 全功能學員/程瑋翔資料與設定編輯面板 (解決 程瑋翔怎麼不能改或設定) */}
      {/* ========================================================================= */}
      {editingStudent && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border-2 border-amber-400 overflow-hidden text-slate-900">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 p-4 text-white flex items-center justify-between border-b border-amber-500/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">
                    修改與設定學員資料 · {editingStudent.studentName}
                  </h4>
                  <p className="text-[11px] text-amber-200/80">
                    可自訂姓名、組別、可用現金、登入密碼與角色頭銜
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveStudentEdit} className="p-5 overflow-y-auto space-y-4">
              {/* Name & Team */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">學員姓名：</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">所屬組別 / 隊伍：</label>
                  <input
                    type="text"
                    value={editTeam}
                    onChange={e => setEditTeam(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Cash & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1">
                    <span>可用現金 (NT$)：</span>
                    <button
                      type="button"
                      onClick={() => setEditCash(50000000)}
                      className="text-[10px] text-amber-700 underline font-bold"
                    >
                      帶入 5,000 萬
                    </button>
                  </label>
                  <input
                    type="number"
                    required
                    value={editCash}
                    onChange={e => setEditCash(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1">
                    <span>登入密碼：</span>
                    <span className="text-[10px] text-slate-500">(可自由修改)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder="請輸入密碼"
                      className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Role Title & Emoji */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-black text-slate-800 block mb-1">角色頭銜稱號：</label>
                  <input
                    type="text"
                    value={editRoleTitle}
                    onChange={e => setEditRoleTitle(e.target.value)}
                    placeholder="例如：5000萬資產掌門人、最高操盤手"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">代表 Emoji：</label>
                  <input
                    type="text"
                    value={editAvatarEmoji}
                    onChange={e => setEditAvatarEmoji(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-center font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Motto */}
              <div>
                <label className="text-xs font-black text-slate-800 block mb-1">操盤座右銘：</label>
                <input
                  type="text"
                  value={editCustomMotto}
                  onChange={e => setEditCustomMotto(e.target.value)}
                  placeholder="例如：專注價值，穩健配置！"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>儲存設定並同步至雲端 Firestore</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IN-APP MODAL 5: 新增學員或管理員帳號 */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border-2 border-amber-400 overflow-hidden text-slate-900">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 p-4 text-white flex items-center justify-between border-b border-amber-500/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">新增 / 建立學員帳號</h4>
                  <p className="text-[11px] text-amber-200/80">
                    可建立程瑋翔最高管理帳號或任何學員帳號
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateNewAccount} className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">學員姓名：</label>
                  <input
                    type="text"
                    required
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    placeholder="例如：程瑋翔"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">所屬組別 / 隊伍：</label>
                  <input
                    type="text"
                    value={createTeam}
                    onChange={e => setCreateTeam(e.target.value)}
                    placeholder="金融博士班計量實務組"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">初始可用現金 (NT$)：</label>
                  <input
                    type="number"
                    required
                    value={createCash}
                    onChange={e => setCreateCash(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">登入密碼：</label>
                  <input
                    type="text"
                    required
                    value={createPassword}
                    onChange={e => setCreatePassword(e.target.value)}
                    placeholder="例如：3226 或 money888"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-black text-slate-800 block mb-1">角色稱號：</label>
                  <input
                    type="text"
                    value={createRoleTitle}
                    onChange={e => setCreateRoleTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-xs bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-800 block mb-1">代表 Emoji：</label>
                  <input
                    type="text"
                    value={createAvatarEmoji}
                    onChange={e => setCreateAvatarEmoji(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-center font-bold text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>確認建立帳號並寫入 Firestore</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
