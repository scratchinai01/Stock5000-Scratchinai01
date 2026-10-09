import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  User,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Plus,
  Dice5,
  TrendingUp,
  Building2,
  Award,
  CheckCircle2,
  KeyRound,
  Shield,
  ChevronDown,
  ChevronUp,
  Crown,
  Trash2,
  AlertTriangle,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { StudentProfile, DEFAULT_STUDENT_PASSWORD } from '../types/market';
import { getPlayerProfileFromFirebase, savePlayerProfileToFirebase, deletePlayerFromFirebase, updateStudentPassword } from '../services/firebase';
import { hashPassword, verifyPassword } from '../utils/cryptoUtils';
import { getSystemDateStr } from '../utils/dateUtils';

export interface CharacterRoleConfig {
  id: string;
  name: string;
  title: string;
  avatar: string;
  badge: string;
  buffTitle: string;
  buffDescription: string;
  motto: string;
}

export const CHARACTER_ROLES: CharacterRoleConfig[] = [
  {
    id: 'phd_autonomous',
    name: '金融博士班操盤手 (100% 自主下單)',
    title: '財務金融學博士研究生 / 計量投資專案',
    avatar: '🎓',
    badge: '金融博士班·100%自主下單',
    buffTitle: '【學術計量自主決策】',
    buffDescription: '5,000 萬全額純現金起手，零預設持倉，自由運用資產定價與多空對沖模型自主建倉',
    motto: '「立足計量金融學術研究，嚴格實踐 5,000 萬真實市場數據檢驗，100% 自主決策與下單！」',
  },
  {
    id: 'wealth_tycoon',
    name: '阿土伯首富 (穩健大富翁霸主)',
    title: '5000萬資產配置旗艦掌門人',
    avatar: '👑',
    badge: '大富翁·攻守兼備',
    buffTitle: '【資本規模碾壓】',
    buffDescription: '股債平衡 50:50 配置，追求最高夏普值與最低資產回撤',
    motto: '「五千萬資本是最大武器，嚴守資產配置紀律，讓時間複利滾出最大財富！」',
  },
  {
    id: 'tech_alpha',
    name: '錢夫人晶圓女王 (AI動能突破先鋒)',
    title: '半導體與高槓桿暴擊攻擊手',
    avatar: '⚡',
    badge: 'AI動能·高槓桿暴擊',
    buffTitle: '【AI算力暴擊】',
    buffDescription: '重押台積電先進製程，善用個股期貨 7 倍槓桿放大波段獲利',
    motto: '「站在 AI 算力風口上，以台積電與個股期貨全力突破波段天花板！」',
  },
  {
    id: 'hedge_master',
    name: '金貝貝對沖神仙 (華爾街多空總舵手)',
    title: '對沖基金級多空避險大師',
    avatar: '🏦',
    badge: '多空對沖·絕對報酬',
    buffTitle: '【空頭免疫護盾】',
    buffDescription: '大台指期空單 + 賣權 Put 雙重防禦，大盤崩盤時獲利翻倍',
    motto: '「大盤漲我能賺錢，大盤崩盤我賺更多！多空雙向完美對沖，絕不留致命盲點。」',
  },
  {
    id: 'macro_guardian',
    name: '沙隆巴斯美債大亨 (降息鎖利守護神)',
    title: '降息循環固定收益策略家',
    avatar: '🛡️',
    badge: '長線美債·防禦堡壘',
    buffTitle: '【無風險鎖利堡壘】',
    buffDescription: '美債殖利率反轉下行，長天期美債 ETF 坐收豐厚息收與資本利得',
    motto: '「資本保全是致勝之母，在降息循環中坐收長天期美債資本利得與優渥息收。」',
  },
  {
    id: 'options_arbitrage',
    name: '忍太郎期權賭神 (非對稱波動率天才)',
    title: '非對稱報酬非線性玩家',
    avatar: '🎯',
    badge: '波動率交易·期權勒式',
    buffTitle: '【十倍非對稱槓桿】',
    buffDescription: '有限權利金成本，鎖定極端行情獲利倍數無窮大',
    motto: '「以有限的權利金賭注，撬動數十倍非對稱獲利；買權賣權雙向靈活佈局。」',
  },
];

const SUGGESTED_NAMES = ['林宏宇', '張子瑄', '陳研究員', '王承翰', '李怡君', '黃冠霖'];
const RANDOM_TEAMS = ['金融博士班計量實務組', '台大財金研討小組', '政大風管計量團隊', '量化避險交易室', '資產配置研發部'];

interface PlayerSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile?: StudentProfile | null;
  firebasePlayers?: StudentProfile[];
  allProfiles?: StudentProfile[];
  onSaveProfile: (updatedData: {
    studentName: string;
    password?: string;
    teamName: string;
    characterRole: string;
    roleTitle: string;
    avatarEmoji: string;
    strategyBadge: string;
    customMotto: string;
    startWithPureCash?: boolean;
  }) => void;
  onLoadExistingProfile?: (profile: StudentProfile) => void;
  onDeleteProfile?: (studentName: string) => void;
  onLogout?: () => void;
  isSuperUser?: boolean;
  isAuthenticated?: boolean;
  canClose?: boolean;
}

export const PlayerSetupModal: React.FC<PlayerSetupModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  firebasePlayers = [],
  allProfiles = [],
  onSaveProfile,
  onLoadExistingProfile,
  onDeleteProfile,
  onLogout,
  isSuperUser = false,
  isAuthenticated = true,
  canClose = true,
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'leaderboard'>('login');
  const [chineseName, setChineseName] = useState<string>(currentProfile?.studentName || '');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [teamName, setTeamName] = useState<string>(currentProfile?.teamName || '金融博士班計量實務研究小組');
  const [selectedRoleId, setSelectedRoleId] = useState<string>(currentProfile?.characterRole || 'phd_autonomous');
  const [showAdvancedRole, setShowAdvancedRole] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<StudentProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Local persistent entered profiles list from localStorage
  const [localEnteredProfiles, setLocalEnteredProfiles] = useState<StudentProfile[]>(() => {
    try {
      const stored = localStorage.getItem('finmind_entered_player_profiles');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Master merged list of all entered / registered players
  const enteredPlayers = useMemo(() => {
    const map = new Map<string, StudentProfile>();
    localEnteredProfiles.forEach(p => {
      if (p.studentName && p.studentName.trim()) {
        map.set(p.studentName.trim().toLowerCase(), p);
      }
    });
    allProfiles.forEach(p => {
      if (p.studentName && p.studentName.trim()) {
        const key = p.studentName.trim().toLowerCase();
        map.set(key, { ...(map.get(key) || {}), ...p });
      }
    });
    firebasePlayers.forEach(p => {
      if (p.studentName && p.studentName.trim()) {
        const key = p.studentName.trim().toLowerCase();
        map.set(key, { ...(map.get(key) || {}), ...p });
      }
    });
    return Array.from(map.values());
  }, [localEnteredProfiles, allProfiles, firebasePlayers]);

  // Ranked players for leaderboard view ("也秀一秀排名")
  const rankedPlayers = useMemo(() => {
    return [...enteredPlayers]
      .map(p => {
        let totalSecuritiesVal = 0;
        let totalMargin = 0;
        let totalUnrealized = 0;
        (p.positions || []).forEach(pos => {
          totalUnrealized += pos.unrealizedPnL || 0;
          if (pos.category === 'futures') {
            totalMargin += pos.totalCostOrMargin || 0;
          } else {
            totalSecuritiesVal += pos.notionalValue || 0;
          }
        });
        const cash = typeof p.availableCash === 'number' ? p.availableCash : 50000000;
        const initial = p.initialCapital || 50000000;
        const nav = p.netAssetValue || cash + totalSecuritiesVal + totalMargin + totalUnrealized;
        const retPct = p.totalReturnPct ?? ((nav - initial) / initial) * 100;
        return {
          ...p,
          calculatedNav: nav,
          calculatedReturnPct: retPct,
        };
      })
      .sort((a, b) => b.calculatedNav - a.calculatedNav);
  }, [enteredPlayers]);

  if (!isOpen) return null;

  const currentRoleConfig = CHARACTER_ROLES.find(r => r.id === selectedRoleId) || CHARACTER_ROLES[0];

  const handleRandomName = () => {
    const randomN = SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)];
    setChineseName(randomN);
    setPasswordInput(''); // Strictly empty
    setErrorMsg('');
  };

  const handleQuickSelectStudent = (p: StudentProfile) => {
    setChineseName(p.studentName);
    setPasswordInput(''); // Strictly empty! Never expose or autofill someone else's password!
    setShowPassword(false);
    if (p.teamName) setTeamName(p.teamName);
    if (p.characterRole) setSelectedRoleId(p.characterRole);
    setErrorMsg('');
  };

  const handleDirectLogin = (profileToLoad: StudentProfile) => {
    // When clicking a student on the podium, switch to login tab and require password input
    setChineseName(profileToLoad.studentName);
    setPasswordInput('');
    setShowPassword(false);
    setActiveTab('login');
    setErrorMsg(`已選擇【${profileToLoad.studentName}】，請輸入密碼以登入帳號。`);
  };

  const handleExecuteDelete = async (p: StudentProfile) => {
    if (!isSuperUser) {
      setErrorMsg('【權限不足】僅最高超級管理者（程瑋翔）具備刪除學員帳號與紀錄之權限！');
      setConfirmDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    setErrorMsg('');
    try {
      const cleanName = p.studentName.trim();
      const ok = await deletePlayerFromFirebase(cleanName, p.id);
      if (ok) {
        setLocalEnteredProfiles(prev =>
          prev.filter(x => x.studentName.trim().toLowerCase() !== cleanName.toLowerCase())
        );
        onDeleteProfile?.(cleanName);
        setSuccessMsg(`已成功永久刪除學員「${cleanName}」帳號與所有資料！`);
        setConfirmDeleteTarget(null);
        if (chineseName.trim().toLowerCase() === cleanName.toLowerCase()) {
          setChineseName('');
          setPasswordInput('');
          setConfirmPasswordInput('');
        }
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setErrorMsg('刪除失敗，請檢查網路連線。');
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      setErrorMsg(`刪除失敗：${err?.message || '發生錯誤'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRegisterOrEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const trimmed = chineseName.trim();
    if (!trimmed) {
      setErrorMsg('請輸入您的中文姓名！');
      return;
    }

    const inputPwd = passwordInput.trim();
    if (!inputPwd) {
      setErrorMsg('請輸入或決定您的登入密碼！');
      return;
    }

    const existing = enteredPlayers.find(
      p => p.studentName.trim().toLowerCase() === trimmed.toLowerCase()
    );

    const isSuperUserAccount =
      trimmed === '程瑋翔' ||
      trimmed.toLowerCase() === 'admin' ||
      trimmed.toLowerCase() === 'superuser';

    if (existing) {
      const expectedPwd = existing.password || (isSuperUserAccount ? '3226' : DEFAULT_STUDENT_PASSWORD);
      const isPwdCorrect =
        (await verifyPassword(inputPwd, expectedPwd)) || (isSuperUserAccount && inputPwd === '3226');

      if (!isPwdCorrect) {
        setErrorMsg(`密碼不正確！請輸入【${trimmed}】正確的個人密碼。`);
        return;
      }

      const hashedPwd = await hashPassword(inputPwd !== '3226' ? inputPwd : (existing.password || '3226'));

      // Update existing profile with edited team, character role, avatar, motto, and password
      const updatedProfile: StudentProfile = {
        ...existing,
        studentName: trimmed,
        teamName: teamName.trim() || existing.teamName || '金融博士班計量實務研究小組',
        characterRole: currentRoleConfig.id,
        roleTitle: currentRoleConfig.title,
        avatarEmoji: currentRoleConfig.avatar,
        strategyBadge: currentRoleConfig.badge,
        customMotto: currentRoleConfig.motto || existing.customMotto,
        password: hashedPwd,
        updatedAt: Date.now(),
      };

      // Persist to local storage
      setLocalEnteredProfiles(prev => {
        const filtered = prev.filter(p => p.studentName.trim().toLowerCase() !== trimmed.toLowerCase());
        const updated = [updatedProfile, ...filtered];
        try {
          localStorage.setItem('finmind_entered_player_profiles', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      savePlayerProfileToFirebase(updatedProfile).catch(err => console.warn('Cloud sync:', err));

      if (onLoadExistingProfile) {
        onLoadExistingProfile(updatedProfile);
      }
      onClose();
      return;
    }

    // New profile registration: 未來新加入者決定姓名與密碼
    if (isSuperUserAccount && inputPwd !== '3226') {
      setErrorMsg('此為系統最高超級管理者帳號，請輸入正確的管理員密碼！');
      return;
    }

    if (inputPwd.length < 3) {
      setErrorMsg('未來新加入者請決定您的專屬密碼（至少 3 位數以上）！');
      return;
    }

    if (inputPwd !== confirmPasswordInput.trim()) {
      setErrorMsg('兩次輸入的密碼不一致，請再次確認「確認密碼」！');
      return;
    }

    const hashedNewPwd = await hashPassword(inputPwd);

    const newProfile: StudentProfile = {
      id: `player_${Date.now()}`,
      studentName: trimmed,
      password: hashedNewPwd,
      teamName: teamName.trim() || '金融博士班計量實務研究小組',
      characterRole: currentRoleConfig.id,
      roleTitle: currentRoleConfig.title,
      avatarEmoji: currentRoleConfig.avatar,
      strategyBadge: currentRoleConfig.badge,
      customMotto: currentRoleConfig.motto,
      isCurrentPlayer: true,
      initialCapital: 50000000,
      availableCash: 50000000,
      marginDeposits: 0,
      positions: [],
      tradeHistory: [],
      benchmarkDate: '2026-09-21',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setLocalEnteredProfiles(prev => {
      const filtered = prev.filter(p => p.studentName.trim().toLowerCase() !== trimmed.toLowerCase());
      const updated = [newProfile, ...filtered];
      try {
        localStorage.setItem('finmind_entered_player_profiles', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    savePlayerProfileToFirebase(newProfile).catch(err => console.warn('Cloud sync:', err));

    onSaveProfile({
      studentName: trimmed,
      password: hashedNewPwd,
      teamName: teamName.trim() || '金融博士班計量實務研究小組',
      characterRole: currentRoleConfig.id,
      roleTitle: currentRoleConfig.title,
      avatarEmoji: currentRoleConfig.avatar,
      strategyBadge: currentRoleConfig.badge,
      customMotto: currentRoleConfig.motto,
      startWithPureCash: true,
    });

    onClose();
  };

  return (
    <div
      onClick={e => {
        if (canClose && e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-hidden text-slate-900 animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Compact, Clean Header - NO massive screen coverage! */}
        <div className="bg-slate-900 px-5 py-3.5 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
              🎓
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black tracking-tight text-white">
                  5000萬股市大富翁
                </h3>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  實戰連線
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                初始資金 NT$ 5,000 萬 · 即時全班雲端連線
              </p>
            </div>
          </div>

          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition cursor-pointer"
              title="關閉"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tab Navigation: 簡短乾淨 (登入 / 排行榜) */}
        <div className="bg-slate-100 p-1 flex border-b border-slate-200 text-xs font-black shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'login'
                ? 'bg-white text-slate-950 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <User className="w-3.5 h-3.5 text-amber-600" />
            <span>操盤手身分登入</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'leaderboard'
                ? 'bg-white text-slate-950 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            <span>即時全班排名榜 ({rankedPlayers.length}人)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {activeTab === 'login' ? (
            /* TAB 1: 簡潔清爽的登入與登記卡片 */
            <form onSubmit={handleRegisterOrEnter} className="space-y-3.5">
              {/* Account Status Banner */}
              {isAuthenticated && currentProfile?.studentName ? (
                <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-3 flex items-center justify-between text-xs text-emerald-950 font-bold">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currentProfile.avatarEmoji || '👑'}</span>
                    <div>
                      <span className="text-[10px] text-emerald-700 block font-semibold">目前交易室登入帳號</span>
                      <span className="font-black text-slate-950 text-sm">{currentProfile.studentName}</span>
                    </div>
                  </div>
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        setSuccessMsg('已安全登出！請重新登入或註冊。');
                        setPasswordInput('');
                        setConfirmPasswordInput('');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95"
                      title="立即登出目前操盤手帳號"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-600" />
                      <span>登出帳號</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-amber-500/10 border-2 border-amber-400 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-amber-950 font-bold animate-in fade-in">
                  <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-950 flex items-center justify-center shrink-0 text-lg border border-amber-300">
                    🔒
                  </div>
                  <div>
                    <span className="font-black text-slate-950 block text-xs">交易室處於安全鎖定狀態</span>
                    <span className="text-[11px] text-slate-600 block font-normal leading-relaxed mt-0.5">
                      您已登出系統。已登記學員請輸入密碼登入；未來新加入者請輸入姓名並自訂密碼以註冊。
                    </span>
                  </div>
                </div>
              )}

              {/* Main Credentials Box */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                {/* Chinese Name Field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-black text-slate-900 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-amber-600" />
                      <span>操盤手姓名 (中文姓名)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleRandomName}
                      className="text-[11px] text-amber-800 hover:text-amber-950 font-bold flex items-center gap-1 cursor-pointer bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200"
                    >
                      <Dice5 className="w-3 h-3" />
                      <span>隨機名字</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={chineseName}
                    onChange={e => {
                      setChineseName(e.target.value);
                      setPasswordInput(''); // Security: Clear password when switching name
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="請輸入中文姓名 (例如：程瑋翔、林宏宇)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-slate-950 text-sm font-black placeholder-slate-400 bg-white transition"
                  />
                  {chineseName.trim() === '程瑋翔' && (
                    <div className="mt-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-2.5 flex items-center justify-between text-xs text-amber-950 font-bold animate-in fade-in">
                      <span className="flex items-center gap-1.5">
                        <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>最高超級管理者 (Superuser) · 請輸入管理員密碼驗證</span>
                      </span>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-black shrink-0">
                        SUPERUSER
                      </span>
                    </div>
                  )}

                  {/* Future New Joiner Notification Banner */}
                  {chineseName.trim() && !enteredPlayers.some(p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase()) && chineseName.trim() !== '程瑋翔' && (
                    <div className="mt-2.5 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-950 font-bold animate-in fade-in">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black text-amber-900 block text-xs">✨ 未來新加入操盤手登記</span>
                        <span className="text-[11px] text-amber-850 font-medium leading-relaxed block mt-0.5">
                          歡迎加入！請決定您的操盤手姓名與自訂專屬密碼。密碼為您日後登入交易室的唯一憑證，其他學員與 AI 均無法查看或刪除您的帳號。
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Existing Trader Recognized Banner */}
                  {chineseName.trim() && enteredPlayers.some(p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase()) && (
                    <div className="mt-2.5 bg-blue-50/80 border border-blue-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-blue-950 font-bold animate-in fade-in">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-blue-600" />
                        <span>已註冊學員身分 · 請輸入您自訂的個人密碼</span>
                      </span>
                      <span className="text-[10px] text-blue-800 bg-blue-100 px-2 py-0.5 rounded font-black">
                        已註冊
                      </span>
                    </div>
                  )}
                </div>

                {/* Password Field 1: 輸入密碼 / 決定專屬密碼 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-black text-slate-900 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        {enteredPlayers.some(p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase())
                          ? '登入密碼驗證'
                          : '決定個人專屬密碼 (自訂至少 3 位數)'}
                      </span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-semibold">密碼安全防護 · 請手動輸入</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={e => {
                        setPasswordInput(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder={
                        enteredPlayers.some(p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase())
                          ? '請輸入個人登入密碼'
                          : '請決定並設定您的個人專屬密碼'
                      }
                      autoComplete="current-password"
                      className="w-full px-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-slate-950 text-sm font-mono font-bold placeholder-slate-400 bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showPassword ? '隱藏密碼' : '顯示密碼'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Field 2: 未來新加入者需再次確認密碼 */}
                {chineseName.trim() && !enteredPlayers.some(p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase()) && (
                  <div className="animate-in fade-in">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black text-slate-900 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                        <span>再次輸入確認密碼</span>
                      </label>
                      <span className="text-[10px] text-amber-700 font-semibold">防呆校驗 · 確保密碼正確</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPasswordInput}
                        onChange={e => {
                          setConfirmPasswordInput(e.target.value);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="請再次輸入相同密碼以確認"
                        autoComplete="new-password"
                        className="w-full px-3.5 pr-10 py-2.5 rounded-xl border border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-slate-950 text-sm font-mono font-bold placeholder-slate-400 bg-white transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showConfirmPassword ? '隱藏密碼' : '顯示密碼'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Button: 一鍵進入與儲存 */}
                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 border border-amber-300 active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>
                    {enteredPlayers.some(p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase())
                      ? `以【${chineseName.trim() || '學員'}】驗證密碼並進入交易室`
                      : `決定密碼並建立【${chineseName.trim() || '新操盤手'}】進入 5000 萬實戰`}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-950" />
                </button>

                {/* Optional Delete Button for Existing Profile - ONLY Superuser can see & execute */}
                {(() => {
                  if (!isSuperUser) return null;
                  const existingMatch = enteredPlayers.find(
                    p => p.studentName.trim().toLowerCase() === chineseName.trim().toLowerCase()
                  );
                  if (!existingMatch) return null;
                  return (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTarget(existingMatch)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                        title="【最高管理者權限】永久刪除此學員帳號與紀錄"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>[管理員] 刪除「{existingMatch.studentName}」帳號與資料</span>
                      </button>
                      <span className="text-[10px] text-slate-400">僅 Superuser 具備刪除權限</span>
                    </div>
                  );
                })()}
              </div>

              {/* Success Message Banner */}
              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-800 flex items-center gap-2 animate-in fade-in">
                  <span>✅</span>
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-black text-rose-800 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Fast Select Existing Students List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-900 border-b border-slate-100 pb-2">
                  <span className="flex items-center gap-1.5">
                    <span>👥 已登記的學員名單</span>
                    <span className="text-[10px] text-slate-500 font-semibold">(點選姓名一鍵帶入)</span>
                  </span>
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                    共 {enteredPlayers.length} 位
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                  {enteredPlayers.map((p, idx) => {
                    const isSelected =
                      chineseName.trim().toLowerCase() === p.studentName.trim().toLowerCase();
                    return (
                      <div
                        key={`fast-pick-${p.id || p.studentName}-${idx}`}
                        onClick={() => handleQuickSelectStudent(p)}
                        className={`group relative p-2 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-1.5 ${
                          isSelected
                            ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-300'
                            : 'bg-slate-50 hover:bg-amber-50/70 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0 pr-4">
                          <span className="text-xs font-black text-slate-950 block truncate">
                            {p.studentName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            NT$ {Math.round((p.netAssetValue || 50000000) / 10000)}萬
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-sm">{p.avatarEmoji || '👤'}</span>
                          {isSuperUser && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmDeleteTarget(p);
                              }}
                              title={`【最高管理者專屬】刪除【${p.studentName}】帳號`}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advanced optional drawer for team & character */}
              <div className="border border-slate-200 bg-white rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedRole(!showAdvancedRole)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span>⚙️ 自訂組別與操盤角色風格</span>
                    <span className="text-[10px] text-slate-400 font-normal">(選填，預設純現金起手)</span>
                  </span>
                  {showAdvancedRole ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {showAdvancedRole && (
                  <div className="p-3.5 pt-1 border-t border-slate-100 space-y-3 bg-slate-50">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        研究組別名稱
                      </label>
                      <input
                        type="text"
                        value={teamName}
                        onChange={e => setTeamName(e.target.value)}
                        placeholder="例如：金融博士班計量實務組"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        大富翁風格角色
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {CHARACTER_ROLES.map(role => (
                          <div
                            key={role.id}
                            onClick={() => setSelectedRoleId(role.id)}
                            className={`p-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                              selectedRoleId === role.id
                                ? 'bg-amber-100 border-amber-500 ring-1 ring-amber-400'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <span className="text-base mr-1">{role.avatar}</span>
                            <span className="text-[11px] text-slate-950 font-black">{role.name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>
          ) : (
            /* TAB 2: 「也秀一秀排名」- 即時全班排行榜 */
            <div className="space-y-3">
              {/* Podium: Top 3 Leaders */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {rankedPlayers.slice(0, 3).map((player, idx) => {
                  const medals = ['🥇 第一名', '🥈 第二名', '🥉 第三名'];
                  const borderColors = ['border-amber-400 bg-amber-50', 'border-slate-300 bg-slate-50', 'border-amber-600/40 bg-orange-50'];
                  const ret = player.calculatedReturnPct || 0;
                  return (
                    <div
                      key={`podium-${player.studentName}-${idx}`}
                      onClick={() => handleDirectLogin(player)}
                      className={`p-2.5 rounded-2xl border-2 ${borderColors[idx]} shadow-2xs transition cursor-pointer hover:scale-[1.02] flex flex-col justify-between`}
                      title="點擊以此帳號登入"
                    >
                      <div>
                        <span className="text-[10px] font-black text-slate-700 block mb-1">
                          {medals[idx]}
                        </span>
                        <span className="text-2xl block mb-1">{player.avatarEmoji || '👑'}</span>
                        <span className="text-xs font-black text-slate-950 block truncate">
                          {player.studentName}
                        </span>
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-black/5">
                        <span className="text-[11px] font-mono font-black text-slate-900 block">
                          {(player.calculatedNav / 10000).toFixed(0)}萬
                        </span>
                        <span
                          className={`text-[10px] font-bold block ${
                            ret >= 0 ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {ret >= 0 ? '+' : ''}
                          {ret.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full Leaderboard Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-black text-slate-900">
                  <span className="flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    <span>即時戰況排名 (點選直接載入)</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    基準資金 NT$ 5,000 萬
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {rankedPlayers.map((p, idx) => {
                    const ret = p.calculatedReturnPct || 0;
                    const isPositive = ret >= 0;
                    return (
                      <div
                        key={`rank-row-${p.studentName}-${idx}`}
                        onClick={() => handleDirectLogin(p)}
                        className="p-2.5 px-3 hover:bg-amber-50/80 transition cursor-pointer flex items-center justify-between gap-2"
                        title="點擊直接以該學員登入"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                              idx === 0
                                ? 'bg-amber-400 text-slate-950'
                                : idx === 1
                                ? 'bg-slate-300 text-slate-900'
                                : idx === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-base shrink-0">{p.avatarEmoji || '👤'}</span>
                          <div className="min-w-0">
                            <span className="text-xs font-black text-slate-950 block truncate">
                              {p.studentName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium block truncate">
                              {p.teamName || '金融博士班'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-black text-slate-900 block">
                            NT$ {Math.round(p.calculatedNav).toLocaleString()}
                          </span>
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={`text-[10px] font-bold ${
                                isPositive ? 'text-rose-600' : 'text-emerald-700'
                              }`}
                            >
                              {isPositive ? '+' : ''}
                              {ret.toFixed(2)}%
                            </span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-[10px] text-slate-600 font-semibold">
                              {p.positions?.length || 0}檔持倉
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compact Footer Helper */}
        <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-bold shrink-0">
          <span className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
            <span>帳號受安全密碼防護 · 登入後可隨時至設定修改個人密碼</span>
          </span>
          <span className="text-slate-400 font-normal hidden sm:inline">Firebase 雲端即時存證</span>
        </div>
      </div>

      {/* In-app Delete Confirmation Modal */}
      {confirmDeleteTarget && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={e => {
            if (e.target === e.currentTarget) setConfirmDeleteTarget(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border-2 border-rose-300 space-y-4 text-slate-900">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
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
                  NT$ {Math.round(confirmDeleteTarget.netAssetValue || 50000000).toLocaleString()}
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
    </div>
  );
};
