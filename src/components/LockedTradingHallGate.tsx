import React, { useState, useMemo } from 'react';
import { StudentProfile } from '../types/market';
import { verifyPassword, hashPassword } from '../utils/cryptoUtils';
import {
  Lock,
  ShieldCheck,
  User,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Award,
} from 'lucide-react';

interface LockedTradingHallGateProps {
  allProfiles: StudentProfile[];
  firebasePlayers: StudentProfile[];
  onLoginSuccess: (profile: StudentProfile) => void;
  onRegisterNewStudent: (name: string, password: string, team?: string, roleId?: string) => void;
  onOpenGlossary?: () => void;
  marketStatus?: {
    isOpen: boolean;
    statusText: string;
  };
}

export const LockedTradingHallGate: React.FC<LockedTradingHallGateProps> = ({
  allProfiles = [],
  firebasePlayers = [],
  onLoginSuccess,
  onRegisterNewStudent,
  onOpenGlossary,
  marketStatus,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regTeam, setRegTeam] = useState('金融博士班計量實務組');

  // Messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Merged entered players list for quick reference
  const enteredPlayers = useMemo(() => {
    const map = new Map<string, StudentProfile>();
    allProfiles.forEach(p => {
      if (p.studentName && p.studentName.trim()) {
        map.set(p.studentName.trim().toLowerCase(), p);
      }
    });
    firebasePlayers.forEach(p => {
      if (p.studentName && p.studentName.trim()) {
        map.set(p.studentName.trim().toLowerCase(), p);
      }
    });
    return Array.from(map.values());
  }, [allProfiles, firebasePlayers]);

  // Handle Login
  const handleExecuteLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanName = loginName.trim();
    const cleanLower = cleanName.toLowerCase();
    const cleanPwd = loginPassword.trim();

    if (!cleanName) {
      setErrorMsg('請輸入操盤手姓名！');
      return;
    }

    if (!cleanPwd) {
      setErrorMsg('請輸入您的專屬密碼！');
      return;
    }

    // Match player
    const match = enteredPlayers.find(
      p => p.studentName && p.studentName.trim().toLowerCase() === cleanLower
    );

    const isSuperUserAccount =
      cleanName === '程瑋翔' || cleanLower === 'admin' || cleanLower === 'superuser';

    if (match) {
      const expectedPwd = match.password || (isSuperUserAccount ? '3226' : 'money888');
      const isMatch = (await verifyPassword(cleanPwd, expectedPwd)) || (isSuperUserAccount && cleanPwd === '3226');
      if (!isMatch) {
        setErrorMsg('密碼不正確！請確認您的個人密碼，或向最高管理者程瑋翔確認。');
        return;
      }
      setSuccessMsg(`驗證成功！歡迎操盤手「${match.studentName}」回歸交易大廳。`);
      setTimeout(() => {
        onLoginSuccess(match);
      }, 350);
    } else {
      // Not registered
      setErrorMsg(`找不到學員「${cleanName}」。若是新加入者，請切換至【新加入者 註冊登記】標籤建立帳號！`);
    }
  };

  // Handle Registration
  const handleExecuteRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanName = regName.trim();
    const cleanLower = cleanName.toLowerCase();
    const cleanPwd = regPassword.trim();
    const cleanConfirm = regConfirmPassword.trim();

    if (!cleanName) {
      setErrorMsg('請決定您的操盤手姓名！');
      return;
    }

    if (!cleanPwd) {
      setErrorMsg('未來新加入者請決定您的專屬密碼！');
      return;
    }

    if (cleanPwd.length < 4) {
      setErrorMsg('密碼長度建議至少 4 碼以上，以確保資金與持倉隱私！');
      return;
    }

    if (cleanPwd !== cleanConfirm) {
      setErrorMsg('兩次輸入的密碼不一致，請再次確認！');
      return;
    }

    // Check if name already taken
    const exists = enteredPlayers.some(
      p => p.studentName && p.studentName.trim().toLowerCase() === cleanLower
    );
    if (exists) {
      setErrorMsg(`「${cleanName}」操盤手帳號已存在！請切換至【操盤手身分登入】標籤輸入密碼登入。`);
      return;
    }

    setSuccessMsg(`🎉 註冊成功！已為「${cleanName}」建立 5,000 萬資產帳號並設定密碼。正在解鎖交易大廳...`);
    setTimeout(() => {
      onRegisterNewStudent(cleanName, cleanPwd, regTeam, 'phd_autonomous');
    }, 400);
  };

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-10 px-4 space-y-6">
      {/* 1. Locked Status Banner */}
      <div className="bg-gradient-to-r from-amber-50 via-amber-100/50 to-orange-50 border-2 border-amber-300 rounded-3xl p-5 sm:p-7 shadow-sm text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-900 border border-amber-400 mx-auto flex items-center justify-center shadow-inner text-2xl">
          🔒
        </div>
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200/80 text-amber-950 text-xs font-black border border-amber-300 mb-1.5 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-800" />
            <span>交易室安全鎖定防護已啟用</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
            您已安全登出 · 操盤手身分驗證大廳
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto mt-1 font-medium">
            為落實競賽公平與學員個人資產隱私防護，登出後交易大廳、個人持倉損益、帳號管理與總體檢資產數據均已完全隱藏保護。
          </p>
        </div>

        {marketStatus && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${marketStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{marketStatus.statusText}</span>
          </div>
        )}
      </div>

      {/* 2. Main Authentication Card */}
      <div className="bg-white border-2 border-slate-200 rounded-3xl shadow-lg overflow-hidden max-w-xl mx-auto">
        {/* Tabs: Login vs Register */}
        <div className="grid grid-cols-2 bg-slate-100 p-1.5 border-b border-slate-200 text-xs font-black">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2.5 rounded-2xl transition cursor-pointer flex items-center justify-center gap-2 ${
              tab === 'login'
                ? 'bg-white text-slate-950 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>操盤手身分登入</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2.5 rounded-2xl transition cursor-pointer flex items-center justify-center gap-2 ${
              tab === 'register'
                ? 'bg-white text-slate-950 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>新加入者 註冊登記</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="m-4 mb-0 p-3 bg-rose-50 border border-rose-300 rounded-2xl text-xs font-black text-rose-800 flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="m-4 mb-0 p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-black text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab 1: Login Form */}
        {tab === 'login' && (
          <form onSubmit={handleExecuteLogin} className="p-5 sm:p-7 space-y-4">
            <div className="text-left">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-600" />
                  <span>操盤手姓名</span>
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  例如：程瑋翔 或 已登記學員
                </span>
              </label>
              <input
                type="text"
                value={loginName}
                onChange={e => {
                  setLoginName(e.target.value);
                  setErrorMsg('');
                }}
                required
                placeholder="請輸入您的姓名 (例如：程瑋翔)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-950 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition"
              />
            </div>

            <div className="text-left">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>專屬登入密碼</span>
                </span>
                <span className="text-[11px] text-amber-800 font-medium">
                  密碼保護 · 無人可隨意殺號
                </span>
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => {
                    setLoginPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  required
                  placeholder="請輸入密碼以解鎖交易室"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-950 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 font-black text-sm shadow-md border border-amber-500 flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
            >
              <ShieldCheck className="w-4 h-4 text-slate-950" />
              <span>驗證密碼 · 解鎖進入 5,000 萬交易大廳</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Quick Pick from Registered Players */}
            {enteredPlayers.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-2">
                  <span>👥 快捷選擇已有學員姓名：</span>
                  <span className="text-[10px] text-slate-400">點擊帶入姓名後輸入密碼</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {enteredPlayers.slice(0, 12).map(p => (
                    <button
                      key={p.studentName}
                      type="button"
                      onClick={() => {
                        setLoginName(p.studentName);
                        setLoginPassword('');
                        setErrorMsg('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1 ${
                        loginName.trim().toLowerCase() === p.studentName.trim().toLowerCase()
                          ? 'bg-amber-100 border-amber-500 text-amber-950 font-black ring-1 ring-amber-300'
                          : 'bg-slate-50 hover:bg-amber-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span>{p.avatarEmoji || '👤'}</span>
                      <span>{p.studentName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

        {/* Tab 2: Register Form (Fulfills: 未來新加入者 應該就要決定 姓名 密碼) */}
        {tab === 'register' && (
          <form onSubmit={handleExecuteRegister} className="p-5 sm:p-7 space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 font-bold flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                歡迎新操盤手加入！依競賽規定，新加入者<strong>必須決定姓名與自訂專屬密碼</strong>。此密碼為日後登入與資產保護的唯一依據。
              </span>
            </div>

            <div className="text-left">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-600" />
                  <span>決定您的姓名 / 操盤手名稱</span>
                </span>
                <span className="text-[11px] text-rose-600 font-bold">* 必填</span>
              </label>
              <input
                type="text"
                value={regName}
                onChange={e => {
                  setRegName(e.target.value);
                  setErrorMsg('');
                }}
                required
                placeholder="請輸入您的真實姓名或操盤手代號"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-950 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition"
              />
            </div>

            <div className="text-left">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>決定您的專屬密碼</span>
                </span>
                <span className="text-[11px] text-rose-600 font-bold">* 必填 (至少 4 碼)</span>
              </label>
              <div className="relative">
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={e => {
                    setRegPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  required
                  placeholder="請自訂 4 碼以上個人安全密碼"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-950 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="text-left">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>再次確認密碼</span>
                </span>
                <span className="text-[11px] text-rose-600 font-bold">* 必填</span>
              </label>
              <input
                type={showRegPassword ? 'text' : 'password'}
                value={regConfirmPassword}
                onChange={e => {
                  setRegConfirmPassword(e.target.value);
                  setErrorMsg('');
                }}
                required
                placeholder="請再次輸入相同的密碼"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-950 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition"
              />
            </div>

            <div className="text-left">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between mb-1.5">
                <span>所屬研究組別 (選填)</span>
              </label>
              <input
                type="text"
                value={regTeam}
                onChange={e => setRegTeam(e.target.value)}
                placeholder="例如：金融博士班計量實務組"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-950 font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-sm shadow-md border border-emerald-600 flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>完成決定姓名與密碼 · 立即以 5,000 萬現金起步</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* 3. Safe Public Information & Academic Resources (No Private Data Leaked) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg font-black shrink-0">
            📚
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-slate-950 text-xs">金融專有名詞小學堂</h4>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              內建 300 筆計量金融詞庫，未登入亦可自由研讀
            </p>
          </div>
          {onOpenGlossary && (
            <button
              type="button"
              onClick={onOpenGlossary}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-black border border-amber-300 transition cursor-pointer"
            >
              研讀詞庫
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-lg font-black shrink-0">
            🛡️
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-slate-950 text-xs">資產隱私與防弊機制</h4>
            <p className="text-[11px] text-slate-500 font-medium">
              非 Superuser 無法刪除他人帳號，登出即全面封鎖
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
