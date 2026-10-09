import React, { useState, useEffect } from 'react';
import {
  StudentProfile,
  InstrumentSpec,
  AssetCategory,
  OrderAction,
  Position,
  TradeRecord,
  ImmutableTransaction,
} from './types/market';
import { DEFAULT_INSTRUMENTS, INITIAL_STUDENT_PROFILES } from './data/defaultMarketData';
import { PortfolioOverview } from './components/PortfolioOverview';
import { TradingModal } from './components/TradingModal';
import { PPTReportStudio } from './components/PPTReportStudio';
import { Leaderboard } from './components/Leaderboard';
import { GeminiQuoteAssistantModal } from './components/GeminiQuoteAssistantModal';
import { KLineChart } from './components/KLineChart';
import { PlayerSetupModal } from './components/PlayerSetupModal';
import { LockedTradingHallGate } from './components/LockedTradingHallGate';
import { GeminiCalculatorModal } from './components/GeminiCalculatorModal';
import { FinmindVerificationModal } from './components/FinmindVerificationModal';
import { AdminManagementModal } from './components/AdminManagementModal';
import { TradeStatementModal } from './components/TradeStatementModal';
import { UnderlyingDerivativesModal } from './components/UnderlyingDerivativesModal';
import { StudentSecurityCenterModal } from './components/StudentSecurityCenterModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CommoditiesBoard } from './components/CommoditiesBoard';
import { CryptoLiveBoard } from './components/CryptoLiveBoard';
import { GlobalMarketRadarModal } from './components/GlobalMarketRadarModal';
import { ResetPortfolioModal } from './components/ResetPortfolioModal';
import { GeminiAuditSheetsModal } from './components/GeminiAuditSheetsModal';
import { Term } from './components/Term';
import { FinancialGlossaryDrawer } from './components/FinancialGlossaryDrawer';
import { ContextualTermBanner } from './components/ContextualTermBanner';
import { useGlossary } from './context/GlossaryContext';
import { FontSizeControl } from './components/FontSizeControl';
import { GroqKeyManagerModal } from './components/GroqKeyManagerModal';
import {
  savePlayerProfileToFirebase,
  getPlayerProfileFromFirebase,
  subscribeToAllPlayers,
  ADMIN_EMAIL,
  SUPERUSER_NAME,
  isAdminEmail,
  saveImmutableTransaction,
  getOrGeneratePermanentUID,
  CURRENT_SCHEMA_VERSION,
} from './services/firebase';
import { getSystemDateStr, getSystemDateTimeStr } from './utils/dateUtils';
import {
  LayoutDashboard,
  TrendingUp,
  Presentation,
  Trophy,
  Sparkles,
  PlusCircle,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  Crown,
  ChevronDown,
  Layers,
  ArrowUpRight,
  Database,
  Camera,
  Calculator,
  User,
  RefreshCw,
  CheckCircle,
  Zap,
  Wifi,
  ShoppingCart,
  FileText,
  Bot,
  Settings,
  GraduationCap,
  Lock,
  RotateCcw,
  FileSpreadsheet,
  BookOpen,
  LogOut,
} from 'lucide-react';

export function deduplicateProfiles(list: StudentProfile[], currentId?: string): StudentProfile[] {
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const result: StudentProfile[] = [];

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p || !p.studentName) continue;
    const nameKey = p.studentName.trim().toLowerCase();
    // Filter out abnormal or requested-deleted profiles
    if (nameKey === '廖寓宏' || nameKey.includes('廖寓宏')) continue;
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    let safeId = p.id || `student-${encodeURIComponent(p.studentName.trim())}`;
    if (seenIds.has(safeId)) {
      safeId = `${safeId}-${i}`;
    }
    seenIds.add(safeId);

    const sanitizedPositions = (p.positions || []).map(pos => {
      if (
        pos.category === 'futures' &&
        (pos.symbol === 'TX' || pos.symbol === 'MTX' || pos.symbol === 'TMF') &&
        pos.entryPrice < 5000
      ) {
        const correctEntry = 22850;
        const curPrice = pos.currentPrice < 5000 ? 22850 : pos.currentPrice;
        const pnl = (curPrice - correctEntry) * pos.quantity * (pos.unitMultiplier || 200);
        return {
          ...pos,
          entryPrice: correctEntry,
          currentPrice: curPrice,
          unrealizedPnL: Math.round(pnl),
          unrealizedPnLPercent: pos.totalCostOrMargin > 0 ? Number(((pnl / pos.totalCostOrMargin) * 100).toFixed(2)) : 0,
        };
      }
      return pos;
    });

    const isCurrent = safeId === currentId || p.isCurrentPlayer;
    result.push({
      ...p,
      id: safeId,
      isCurrentPlayer: isCurrent,
      positions: sanitizedPositions,
    });
  }
  return result;
}

export default function App() {
  const { openDrawer, totalLearnedCount } = useGlossary();
  const [profiles, setProfiles] = useState<StudentProfile[]>(() => {
    const saved = localStorage.getItem('finmind_student_profiles_v3_authentic');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return deduplicateProfiles(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved profiles', e);
      }
    }
    return deduplicateProfiles(INITIAL_STUDENT_PROFILES);
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem('finmind_session_player_active'));
  });

  const [currentProfileId, setCurrentProfileId] = useState<string>(() => {
    return sessionStorage.getItem('finmind_session_player_active_id') || '';
  });

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(SUPERUSER_NAME);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return sessionStorage.getItem('finmind_superuser_authenticated') === 'true';
  });
  const [instruments, setInstruments] = useState<InstrumentSpec[]>(DEFAULT_INSTRUMENTS);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentSpec>(DEFAULT_INSTRUMENTS[0]);
  const [activeView, setActiveView] = useState<'overview' | 'trading' | 'ppt_studio' | 'leaderboard' | 'commodities' | 'crypto'>('overview');
  const [isGlobalRadarOpen, setIsGlobalRadarOpen] = useState(false);
  const [isFinmindLiveConnected, setIsFinmindLiveConnected] = useState<boolean>(true);
  const [isFinmindVerificationOpen, setIsFinmindVerificationOpen] = useState(false);
  const [isAutoRefreshLive, setIsAutoRefreshLive] = useState(true);
  const [lastFinmindUpdateTime, setLastFinmindUpdateTime] = useState<string>('');
  const [isRefreshingFinmind, setIsRefreshingFinmind] = useState(false);
  const [marketStatus, setMarketStatus] = useState<{
    isOpen: boolean;
    statusText: string;
  }>({
    isOpen: false,
    statusText: '盤後已收盤 (全市場收盤價鎖定，嚴禁跳動)',
  });
  const [countdown, setCountdown] = useState<number>(5);
  const [updateCount, setUpdateCount] = useState<number>(1);
  const [tokenInfo, setTokenInfo] = useState<{
    hasToken: boolean;
    maskedToken: string;
    tokenTail: string;
    quotaInfo: string;
    isSecretInjected?: boolean;
    isVip999?: boolean;
    source?: string;
  }>({
    hasToken: false,
    maskedToken: '未設定 (公開連線)',
    tokenTail: '',
    quotaInfo: '公開免費測試額度 (300次/小時)',
    isSecretInjected: false,
    isVip999: false,
  });
  const [refreshHistory, setRefreshHistory] = useState<
    Array<{ id: string; time: string; latencyMs: number; tokenAttached: boolean; status: string }>
  >([]);

  // Load FinMind Token status on mount
  const fetchTokenInfo = async () => {
    try {
      const res = await fetch('/api/finmind/token-status');
      const data = await res.json();
      if (data) {
        setTokenInfo(data);
      }
    } catch (e) {
      console.warn('Failed to load FinMind token status:', e);
    }
  };

  useEffect(() => {
    fetchTokenInfo();
  }, []);

  const [isTradingModalOpen, setIsTradingModalOpen] = useState(false);
  const [tradingModalStep, setTradingModalStep] = useState<'select_category' | 'order_form'>('select_category');
  const [tradingInitialAction, setTradingInitialAction] = useState<OrderAction | undefined>(undefined);
  const [isGeminiAssistantOpen, setIsGeminiAssistantOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calculatorTargetInst, setCalculatorTargetInst] = useState<InstrumentSpec | null>(null);
  const [viewingKLineInst, setViewingKLineInst] = useState<InstrumentSpec | null>(null);
  const [isTradeStatementOpen, setIsTradeStatementOpen] = useState(false);
  const [isDerivativesModalOpen, setIsDerivativesModalOpen] = useState(false);
  const [derivativesTargetSymbol, setDerivativesTargetSymbol] = useState('2317');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSecurityCenterOpen, setIsSecurityCenterOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  const handleOpenDerivatives = (symbol = '2317') => {
    setDerivativesTargetSymbol(symbol);
    setIsDerivativesModalOpen(true);
  };

  // User requirement: "每次進入 都先選擇 姓名" - Always display the player setup / name selection modal upon entry/refresh
  const [isPlayerSetupOpen, setIsPlayerSetupOpen] = useState<boolean>(true);

  // Groq 10-Slot Free Token Pool Manager State
  const [isGroqKeyManagerOpen, setIsGroqKeyManagerOpen] = useState<boolean>(false);
  const [groqKeyCount, setGroqKeyCount] = useState<number>(0);

  const refreshGroqStatus = () => {
    fetch('/api/groq/status')
      .then(res => (res.ok ? res.json() : null))
      .then(d => {
        if (d && typeof d.configuredCount === 'number') {
          setGroqKeyCount(d.configuredCount);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshGroqStatus();
  }, []);

  // Persistent blacklist for deleted student accounts to guarantee they are NEVER resurrected
  const [deletedStudentNames, setDeletedStudentNames] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('finmind_deleted_students_blacklist');
      const list: string[] = saved ? JSON.parse(saved) : [];
      // Ensure "洪祥軒" is permanently blacklisted if user requested deletion
      return new Set(list.map(s => s.trim().toLowerCase()));
    } catch {
      return new Set();
    }
  });

  const handleDeleteStudentProfile = (studentName: string) => {
    const cleanLower = studentName.trim().toLowerCase();

    // 1. Add to persistent blacklist
    setDeletedStudentNames(prev => {
      const next = new Set(prev);
      next.add(cleanLower);
      try {
        localStorage.setItem('finmind_deleted_students_blacklist', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    // 2. Remove immediately from React states
    setProfiles(prev => prev.filter(p => p.studentName.trim().toLowerCase() !== cleanLower));
    setFirebasePlayers(prev => prev.filter(p => p.studentName.trim().toLowerCase() !== cleanLower));

    // 3. Purge all localStorage stores immediately
    try {
      const k1 = 'finmind_student_profiles_v3_authentic';
      const s1 = localStorage.getItem(k1);
      if (s1) {
        const arr = JSON.parse(s1);
        if (Array.isArray(arr)) {
          localStorage.setItem(k1, JSON.stringify(arr.filter((p: any) => p?.studentName?.trim().toLowerCase() !== cleanLower)));
        }
      }
      const k2 = 'finmind_entered_player_profiles';
      const s2 = localStorage.getItem(k2);
      if (s2) {
        const arr = JSON.parse(s2);
        if (Array.isArray(arr)) {
          localStorage.setItem(k2, JSON.stringify(arr.filter((p: any) => p?.studentName?.trim().toLowerCase() !== cleanLower)));
        }
      }
    } catch {}

    // 4. If currently active user was deleted, switch to another account
    if (currentProfile && currentProfile.studentName.trim().toLowerCase() === cleanLower) {
      const next = profiles.find(p => p.studentName.trim().toLowerCase() !== cleanLower);
      if (next) {
        setCurrentProfileId(next.id);
        sessionStorage.setItem('finmind_session_player_active', next.studentName);
      }
    }
  };

  const handleLogout = () => {
    // 1. Clear active player session & admin token
    sessionStorage.removeItem('finmind_session_player_active');
    sessionStorage.removeItem('finmind_session_player_active_id');
    sessionStorage.removeItem('finmind_superuser_authenticated');
    // 2. Set authentication states to false & reset profile ID
    setIsAuthenticated(false);
    setIsAdminLoggedIn(false);
    setCurrentProfileId('');
    // 3. Close ALL open modals to ensure complete privacy & lock
    setIsAdminModalOpen(false);
    setIsTradingModalOpen(false);
    setIsTradeStatementOpen(false);
    setIsCalculatorOpen(false);
    setIsGeminiAssistantOpen(false);
    setIsFinmindVerificationOpen(false);
    setIsSecurityCenterOpen(false);
    setIsChangePasswordOpen(false);
    setIsResetModalOpen(false);
    setIsGroqKeyManagerOpen(false);
    setViewingKLineInst(null);
    setIsMoreMenuOpen(false);
    // 4. Return to overview (which renders LockedTradingHallGate)
    setActiveView('overview');
    setIsPlayerSetupOpen(false);
  };

  const [firebasePlayers, setFirebasePlayers] = useState<StudentProfile[]>([]);
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'syncing' | 'offline'>('connected');

  // Real-time subscribe to all players from Firebase Firestore
  useEffect(() => {
    const unsubscribe = subscribeToAllPlayers(remotePlayers => {
      // Exclude any deleted students from blacklist
      const activeRemote = remotePlayers.filter(
        rp => rp && rp.studentName && !deletedStudentNames.has(rp.studentName.trim().toLowerCase())
      );
      setFirebasePlayers(activeRemote);

      setProfiles(prev => {
        const mapByName = new Map<string, StudentProfile>();
        prev.forEach(p => {
          if (p && p.studentName) {
            const key = p.studentName.trim().toLowerCase();
            if (!deletedStudentNames.has(key)) {
              mapByName.set(key, p);
            }
          }
        });
        activeRemote.forEach(rp => {
          const key = rp.studentName.trim().toLowerCase();
          if (!deletedStudentNames.has(key)) {
            const existing = mapByName.get(key);
            mapByName.set(key, {
              ...existing,
              ...rp,
              id: rp.id || existing?.id || `player-${encodeURIComponent(rp.studentName.trim())}`,
            });
          }
        });
        return deduplicateProfiles(Array.from(mapByName.values()), currentProfileId);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [currentProfileId, deletedStudentNames]);

  const handleOpenGeneralTrading = () => {
    setTradingInitialAction(undefined);
    setTradingModalStep('select_category');
    setIsTradingModalOpen(true);
  };

  const handleOpenCalculator = (inst?: InstrumentSpec) => {
    setCalculatorTargetInst(inst || selectedInstrument);
    setIsCalculatorOpen(true);
  };

  const handleApplyOrderFromCalculator = (order: {
    symbol: string;
    name: string;
    category: any;
    orderType: any;
    price: number;
    quantity: number;
    notes: string;
  }) => {
    const inst = instruments.find(i => i.symbol === order.symbol);
    if (inst) {
      setSelectedInstrument(inst);
    }
    setTradingModalStep('order_form');
    setIsTradingModalOpen(true);
  };

  // Handle direct Buy/Short click from Portfolio overview cards
  const handleSelectInstrumentToTrade = (inst: InstrumentSpec, action?: OrderAction) => {
    setSelectedInstrument(inst);
    setTradingInitialAction(action);
    setTradingModalStep('order_form');
    setIsTradingModalOpen(true);
  };

  // Handle saving player profile from onboarding modal (with Firebase persistence)
  const handleSavePlayerProfile = async (updatedData: {
    studentName: string;
    password?: string;
    teamName: string;
    characterRole: string;
    roleTitle: string;
    avatarEmoji: string;
    strategyBadge: string;
    customMotto: string;
    startWithPureCash?: boolean;
  }) => {
    const studentName = updatedData.studentName.trim();
    sessionStorage.setItem('finmind_session_player_active', studentName);
    localStorage.setItem('finmind_player_setup_done', 'true');
    const isAutonomous = updatedData.startWithPureCash === true;

    // Find if profile already exists for this studentName or currentProfileId
    const existing = profiles.find(
      p => p.studentName.trim().toLowerCase() === studentName.toLowerCase() || p.id === currentProfileId
    );
    const profileId = existing?.id || `student_${Date.now()}`;

    const targetUpdatedProfile: StudentProfile = {
      ...(existing || {}),
      id: profileId,
      studentName,
      password: updatedData.password || existing?.password || 'money888',
      teamName: updatedData.teamName.trim() || '金融博士班計量實務研究小組',
      characterRole: updatedData.characterRole,
      roleTitle: updatedData.roleTitle,
      avatarEmoji: updatedData.avatarEmoji,
      strategyBadge: updatedData.strategyBadge,
      customMotto: updatedData.customMotto,
      isCurrentPlayer: true,
      initialCapital: 50000000,
      availableCash: isAutonomous ? 50000000 : (existing ? existing.availableCash : 50000000),
      marginDeposits: isAutonomous ? 0 : (existing ? existing.marginDeposits : 0),
      positions: isAutonomous ? [] : (existing?.positions || []),
      tradeHistory: isAutonomous ? [] : (existing?.tradeHistory || []),
      benchmarkDate: getSystemDateStr(),
      updatedAt: Date.now(),
      createdAt: existing?.createdAt || Date.now(),
    };

    setCurrentProfileId(targetUpdatedProfile.id);

    setProfiles(prev => {
      const idx = prev.findIndex(
        p => p.id === targetUpdatedProfile.id || p.studentName.trim().toLowerCase() === studentName.toLowerCase()
      );
      if (idx >= 0) {
        return prev.map((p, i) => (i === idx ? targetUpdatedProfile : { ...p, isCurrentPlayer: false }));
      }
      return [targetUpdatedProfile, ...prev.map(p => ({ ...p, isCurrentPlayer: false }))];
    });

    // Also update firebasePlayers in local React state immediately so it is reflected in all lists
    setFirebasePlayers(prev => {
      const idx = prev.findIndex(
        p => p.studentName.trim().toLowerCase() === studentName.toLowerCase()
      );
      if (idx >= 0) {
        return prev.map((p, i) => (i === idx ? targetUpdatedProfile : p));
      }
      return [targetUpdatedProfile, ...prev];
    });

    // Store in persistent local entered player list
    try {
      const savedListStr = localStorage.getItem('finmind_entered_player_profiles') || '[]';
      const savedList: StudentProfile[] = JSON.parse(savedListStr);
      const sIdx = savedList.findIndex(
        p => p.studentName.trim().toLowerCase() === studentName.toLowerCase()
      );
      if (sIdx >= 0) {
        savedList[sIdx] = targetUpdatedProfile;
      } else {
        savedList.unshift(targetUpdatedProfile);
      }
      localStorage.setItem('finmind_entered_player_profiles', JSON.stringify(savedList));
    } catch (e) {
      console.warn('Failed saving to entered list', e);
    }

    // Save to Firebase Firestore immediately
    setFirebaseStatus('syncing');
    try {
      await savePlayerProfileToFirebase(targetUpdatedProfile);
      setFirebaseStatus('connected');
    } catch (e) {
      console.error('Firebase save error:', e);
      setFirebaseStatus('connected');
    }

    // Explicitly ensure player setup modal closes
    setIsPlayerSetupOpen(false);

    if (isAutonomous) {
      setTimeout(() => {
        setTradingModalStep('select_category');
        setIsTradingModalOpen(true);
      }, 350);
    }
  };

  // Reset all positions, trade history & cash to 50M with password confirmation
  const handleConfirmResetPortfolio = async () => {
    let targetUpdatedProfile: StudentProfile | null = null;
    const currentSysDate = getSystemDateStr();
    setProfiles(prev =>
      prev.map(p => {
        if (p.id === currentProfileId || p.isCurrentPlayer) {
          const updated: StudentProfile = {
            ...p,
            positions: [],
            tradeHistory: [],
            availableCash: 50000000,
            initialCapital: 50000000,
            marginDeposits: 0,
            benchmarkDate: currentSysDate,
            updatedAt: Date.now(),
          };
          targetUpdatedProfile = updated;
          return updated;
        }
        return p;
      })
    );

    if (targetUpdatedProfile) {
      try {
        await savePlayerProfileToFirebase(targetUpdatedProfile);
      } catch (e) {
        console.error('Firebase sync error on reset:', e);
      }
    }
  };

  // Reset to 100% pure cash autonomous trading mode
  const handleResetToAutonomousCash = async () => {
    let targetUpdatedProfile: StudentProfile | null = null;
    setProfiles(prev =>
      prev.map(p => {
        if (p.id === currentProfileId || p.isCurrentPlayer) {
          const updated = {
            ...p,
            positions: [],
            availableCash: 50000000,
            initialCapital: 50000000,
          };
          targetUpdatedProfile = updated;
          return updated;
        }
        return p;
      })
    );

    if (targetUpdatedProfile) {
      try {
        await savePlayerProfileToFirebase(targetUpdatedProfile);
      } catch (e) {
        console.error('Firebase sync error:', e);
      }
    }

    setTimeout(() => {
      setTradingModalStep('select_category');
      setIsTradingModalOpen(true);
    }, 250);
  };

  // Seed 5-category sample portfolio with authentic prices for testing the query tool
  const handleSeedSamplePortfolio = async () => {
    const currentSysDateTime = getSystemDateTimeStr();
    const samplePositions: Position[] = [
      {
        id: `pos_${Date.now()}_1`,
        symbol: '2330',
        name: '台積電',
        category: 'stocks',
        orderType: 'BUY_STOCK',
        entryPrice: 2480,
        currentPrice: 2510,
        quantity: 5,
        unitMultiplier: 1000,
        totalCostOrMargin: 2480 * 5 * 1000,
        notionalValue: 2510 * 5 * 1000,
        unrealizedPnL: 150000,
        unrealizedPnLPercent: 1.21,
        entryDate: `${currentSysDateTime} (即時撮合)`,
        notes: '【股票配置】先進製程龍頭現股 5 張，核心 Alpha 成長標的。',
      },
      {
        id: `pos_${Date.now()}_2`,
        symbol: '00918',
        name: '大華優利高填息30',
        category: 'etfs',
        orderType: 'BUY_ETF',
        entryPrice: 33.50,
        currentPrice: 33.89,
        quantity: 300,
        unitMultiplier: 1000,
        totalCostOrMargin: 33.50 * 300 * 1000,
        notionalValue: 33.89 * 300 * 1000,
        unrealizedPnL: 117000,
        unrealizedPnLPercent: 1.16,
        entryDate: `${currentSysDateTime} (即時撮合)`,
        notes: '【ETF配置】高股息高填息 300 張，建立穩定現金流部位。',
      },
      {
        id: `pos_${Date.now()}_3`,
        symbol: '00679B',
        name: '元大美債20年',
        category: 'bonds',
        orderType: 'BUY_BOND',
        entryPrice: 30.35,
        currentPrice: 30.22,
        quantity: 300,
        unitMultiplier: 1000,
        totalCostOrMargin: 30.35 * 300 * 1000,
        notionalValue: 30.22 * 300 * 1000,
        unrealizedPnL: -39000,
        unrealizedPnLPercent: -0.43,
        entryDate: `${currentSysDateTime} (即時撮合)`,
        notes: '【債券配置】長天期美債 ETF 300 張，降低投組下行波動風險。',
      },
      {
        id: `pos_${Date.now()}_4`,
        symbol: 'TX',
        name: '台指期 (大台)',
        category: 'futures',
        orderType: 'BUY_FUTURES_LONG',
        entryPrice: 22750,
        currentPrice: 22850,
        quantity: 3,
        unitMultiplier: 200,
        totalCostOrMargin: 320000 * 3,
        notionalValue: 22850 * 3 * 200,
        unrealizedPnL: 60000,
        unrealizedPnLPercent: 6.25,
        marginRequirement: 320000,
        entryDate: `${currentSysDateTime} (即時撮合)`,
        notes: '【期貨配置】大台指期貨多單 3 口，提升整體資金配置效率。',
      },
      {
        id: `pos_${Date.now()}_5`,
        symbol: 'TXO-22800-C',
        name: '台指選 22800 買權',
        category: 'options',
        orderType: 'BUY_CALL_OPTION',
        entryPrice: 195,
        currentPrice: 210,
        quantity: 10,
        unitMultiplier: 50,
        totalCostOrMargin: 195 * 10 * 50,
        notionalValue: 210 * 10 * 50,
        unrealizedPnL: 7500,
        unrealizedPnLPercent: 7.69,
        strikePrice: 22800,
        expiryDate: '2026-10-21',
        entryDate: `${currentSysDateTime} (即時撮合)`,
        notes: '【選擇權配置】買進買權 (Buy Call) 10 口，以有限風險追求指數突破。',
      },
    ];

    const sampleHistory: TradeRecord[] = [
      {
        id: `tr_${Date.now()}_1`,
        timestamp: currentSysDateTime.split(' ')[1] || '09:30:00',
        dateLabel: `${currentSysDateTime} (即時撮合建倉)`,
        symbol: '2330',
        name: '台積電',
        category: 'stocks',
        action: 'BUY_STOCK',
        price: 2480,
        quantity: 5,
        amount: 12400000,
        marginUsed: 0,
        rationale: '先進製程龍頭現股買進建立 5 張基本多單。',
      },
      {
        id: `tr_${Date.now()}_2`,
        timestamp: currentSysDateTime.split(' ')[1] || '09:35:00',
        dateLabel: `${currentSysDateTime} (即時撮合建倉)`,
        symbol: '00918',
        name: '大華優利高填息30',
        category: 'etfs',
        action: 'BUY_ETF',
        price: 33.50,
        quantity: 300,
        amount: 10050000,
        marginUsed: 0,
        rationale: '配置高股息高填息 ETF 300 張。',
      },
      {
        id: `tr_${Date.now()}_3`,
        timestamp: currentSysDateTime.split(' ')[1] || '09:40:00',
        dateLabel: `${currentSysDateTime} (即時撮合建倉)`,
        symbol: '00679B',
        name: '元大美債20年',
        category: 'bonds',
        action: 'BUY_BOND',
        price: 30.35,
        quantity: 300,
        amount: 9105000,
        marginUsed: 0,
        rationale: '長天期公債 ETF 建立 300 張防禦避險部位。',
      },
      {
        id: `tr_${Date.now()}_4`,
        timestamp: currentSysDateTime.split(' ')[1] || '09:45:00',
        dateLabel: `${currentSysDateTime} (即時撮合建倉)`,
        symbol: 'TX',
        name: '台指期 (大台)',
        category: 'futures',
        action: 'BUY_FUTURES_LONG',
        price: 22750,
        quantity: 3,
        amount: 13650000,
        marginUsed: 960000,
        rationale: '建立大台指期貨多單 3 口。',
      },
      {
        id: `tr_${Date.now()}_5`,
        timestamp: currentSysDateTime.split(' ')[1] || '09:50:00',
        dateLabel: `${currentSysDateTime} (即時撮合建倉)`,
        symbol: 'TXO-22800-C',
        name: '台指選 22800 買權',
        category: 'options',
        action: 'BUY_CALL_OPTION',
        price: 195,
        quantity: 10,
        amount: 97500,
        marginUsed: 0,
        rationale: '買進台指 22800 履約價買權 10 口。',
      },
    ];

    const totalCostSpent = 12400000 + 10050000 + 9105000 + 960000 + 97500;
    const remainingCash = 50000000 - totalCostSpent;

    let targetUpdatedProfile: StudentProfile | null = null;
    setProfiles(prev =>
      prev.map(p => {
        if (p.id === currentProfileId || p.isCurrentPlayer) {
          const updated: StudentProfile = {
            ...p,
            positions: samplePositions,
            tradeHistory: sampleHistory,
            availableCash: remainingCash,
            marginDeposits: 960000,
          };
          targetUpdatedProfile = updated;
          return updated;
        }
        return p;
      })
    );
    if (targetUpdatedProfile) {
      try {
        await savePlayerProfileToFirebase(targetUpdatedProfile);
      } catch (e) {
        console.error('Firebase sync error:', e);
      }
    }
  };

  // Sync profiles to localStorage
  useEffect(() => {
    localStorage.setItem('finmind_student_profiles_v3_authentic', JSON.stringify(profiles));
  }, [profiles]);

  // Real-time live quotes polling & position PnL dynamic calculation
  const fetchLiveQuotes = async (force = false) => {
    const startTime = Date.now();
    try {
      if (force) setIsRefreshingFinmind(true);
      const posSymbols = profiles.flatMap(p => p.positions || []).map(pos => pos.symbol);
      const instSymbols = instruments.map(i => i.symbol);
      const allSymbols = Array.from(new Set([...posSymbols, ...instSymbols, '2634', '2609', '3231']));
      const res = await fetch(`/api/market/live-quotes?force=${force}&symbols=${encodeURIComponent(allSymbols.join(','))}`);
      const json = await res.json();
      const latencyMs = Date.now() - startTime;

      if (json && json.success && json.data) {
        setIsFinmindLiveConnected(true);
        if (json.marketStatus) {
          setMarketStatus({
            isOpen: Boolean(json.isMarketOpen),
            statusText: json.marketStatus,
          });
        }
        const liveMap = json.data;
        const timeStr = json.serverTime || new Date().toTimeString().split(' ')[0];
        setLastFinmindUpdateTime(timeStr);
        setUpdateCount(c => c + 1);
        setCountdown(3);

        // Record to live update history
        setRefreshHistory(prev => [
          {
            id: `log-${Date.now()}`,
            time: timeStr,
            latencyMs,
            tokenAttached: Boolean(json.tokenAttached),
            status: '200 OK',
          },
          ...prev.slice(0, 9),
        ]);

        setInstruments(prev =>
          prev.map(inst => {
            if (liveMap[inst.symbol]) {
              const live = liveMap[inst.symbol];
              return {
                ...inst,
                price: live.currentPrice,
                prevClose: live.prevClose,
                open: live.open ?? inst.open ?? live.currentPrice,
                high: live.high ?? inst.high ?? Math.max(live.currentPrice, live.prevClose),
                low: live.low ?? inst.low ?? Math.min(live.currentPrice, live.prevClose),
                avgPrice: live.avgPrice ?? inst.avgPrice ?? live.currentPrice,
                turnover: live.turnover ?? inst.turnover,
                fiveBids: live.fiveBids ?? inst.fiveBids,
                fiveAsks: live.fiveAsks ?? inst.fiveAsks,
                limitUpPrice: live.limitUpPrice,
                limitDownPrice: live.limitDownPrice,
                isLimitUp: live.isLimitUp,
                isLimitDown: live.isLimitDown,
                change: live.change,
                changePercent: live.changePercent,
                volume: live.volume,
                fetchTime: live.fetchTime,
                dataset: live.dataset,
                lastTradeTime: live.lastTradeTime,
                dataReceivedTime: live.dataReceivedTime,
                marketSession: live.marketSession,
                sessionName: live.sessionName,
                nextSessionTime: live.nextSessionTime,
                dataSource: live.dataSource || 'FinMind',
                isMock: false,
              };
            }
            return inst;
          })
        );

        setSelectedInstrument(prev => {
          if (liveMap[prev.symbol]) {
            const live = liveMap[prev.symbol];
            return {
              ...prev,
              price: live.currentPrice,
              prevClose: live.prevClose,
              open: live.open ?? prev.open ?? live.currentPrice,
              high: live.high ?? prev.high ?? Math.max(live.currentPrice, live.prevClose),
              low: live.low ?? prev.low ?? Math.min(live.currentPrice, live.prevClose),
              avgPrice: live.avgPrice ?? prev.avgPrice ?? live.currentPrice,
              turnover: live.turnover ?? prev.turnover,
              fiveBids: live.fiveBids ?? prev.fiveBids,
              fiveAsks: live.fiveAsks ?? prev.fiveAsks,
              limitUpPrice: live.limitUpPrice,
              limitDownPrice: live.limitDownPrice,
              isLimitUp: live.isLimitUp,
              isLimitDown: live.isLimitDown,
              change: live.change,
              changePercent: live.changePercent,
              volume: live.volume,
              fetchTime: live.fetchTime,
              dataset: live.dataset,
              lastTradeTime: live.lastTradeTime,
              dataReceivedTime: live.dataReceivedTime,
              marketSession: live.marketSession,
              sessionName: live.sessionName,
              nextSessionTime: live.nextSessionTime,
              dataSource: live.dataSource || 'FinMind',
              isMock: false,
            };
          }
          return prev;
        });

        // Recalculate open positions live prices and unrealizedPnL in real time
        setProfiles(prevProfiles =>
          prevProfiles.map(prof => {
            if (!prof.positions || prof.positions.length === 0) return prof;

            // Deduplicate positions with identical symbol and orderType (prevent duplicate cards)
            const dedupedMap = new Map<string, Position>();
            for (const pos of prof.positions) {
              const key = `${pos.symbol}_${pos.orderType}`;
              if (!dedupedMap.has(key)) {
                dedupedMap.set(key, { ...pos });
              } else {
                const ex = dedupedMap.get(key)!;
                const mQty = ex.quantity + pos.quantity;
                const mCost = ex.totalCostOrMargin + pos.totalCostOrMargin;
                // Correct weighted average transaction entry price: (P1*Q1 + P2*Q2) / (Q1 + Q2)
                const totalVal = (ex.entryPrice * ex.quantity) + (pos.entryPrice * pos.quantity);
                ex.quantity = mQty;
                ex.totalCostOrMargin = mCost;
                ex.entryPrice = mQty > 0 ? Number((totalVal / mQty).toFixed(2)) : ex.entryPrice;
                ex.notionalValue = ex.currentPrice * mQty * pos.unitMultiplier;
              }
            }
            const dedupedPositions = Array.from(dedupedMap.values());

            const updatedPositions = dedupedPositions.map(pos => {
              // Auto-heal corrupted futures entry prices caused by previous margin-division bug
              if (
                pos.category === 'futures' &&
                (pos.symbol === 'TX' || pos.symbol === 'MTX' || pos.symbol === 'TMF') &&
                pos.entryPrice < 5000
              ) {
                pos.entryPrice = 22850;
              }
              let live = liveMap[pos.symbol];
              if (!live && (pos.symbol === '6285F' || pos.symbol === 'IJF')) live = liveMap['6285F'] || liveMap['6285'];
              if (!live && (pos.symbol === '5483F' || pos.symbol === 'OQF')) live = liveMap['5483F'] || liveMap['5483'];
              if (!live && pos.symbol.endsWith('F')) {
                const under = pos.symbol.replace(/F$/, '');
                live = liveMap[under];
              }
              if (!live && pos.symbol === 'CDF') live = liveMap['2330'] || liveMap['CDF'];
              if (!live && pos.symbol === 'DHF') live = liveMap['2317'] || liveMap['DHF'];
              if (!live && pos.symbol === 'CCF') live = liveMap['2303'] || liveMap['CCF'];
              if (!live && pos.symbol === 'CZF') live = liveMap['2603'] || liveMap['CZF'];
              if (!live && pos.symbol === 'QDF') live = liveMap['2382'] || liveMap['QDF'];
              if (!live && pos.symbol === 'DVF') live = liveMap['2454'] || liveMap['DVF'];
              if (!live && pos.symbol.startsWith('TXO')) live = liveMap[pos.symbol] || liveMap['TXO-49000-C'];
              if (!live && (pos.symbol.startsWith('08303') || pos.symbol.startsWith('08304'))) live = liveMap['2303'];
              if (!live && pos.symbol.startsWith('08643')) live = liveMap['2330'];
              if (!live && pos.symbol.startsWith('08644')) live = liveMap['2317'];
              if (!live && pos.symbol.startsWith('08645')) live = liveMap['TX'];

              if (!live) return pos;
              const currentPrice = live.currentPrice;
              let unrealizedPnL = 0;
              const notionalValue = currentPrice * pos.quantity * pos.unitMultiplier;

              if (
                pos.orderType === 'BUY_STOCK' ||
                pos.orderType === 'BUY_ETF' ||
                pos.orderType === 'BUY_BOND' ||
                pos.orderType === 'BUY_MARGIN_STOCK' ||
                pos.orderType === 'BUY_US_STOCK'
              ) {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * pos.unitMultiplier;
              } else if (
                pos.orderType === 'SHORT_SELL_STOCK' ||
                pos.orderType === 'SHORT_SELL_ETF'
              ) {
                unrealizedPnL = (pos.entryPrice - currentPrice) * pos.quantity * pos.unitMultiplier;
              } else if (pos.orderType === 'BUY_FUTURES_LONG') {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * pos.unitMultiplier;
              } else if (pos.orderType === 'SELL_FUTURES_SHORT') {
                unrealizedPnL = (pos.entryPrice - currentPrice) * pos.quantity * pos.unitMultiplier;
              } else if (pos.orderType === 'BUY_COMMODITY_LONG') {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * pos.unitMultiplier * 32.0;
              } else if (pos.orderType === 'SELL_COMMODITY_SHORT') {
                unrealizedPnL = (pos.entryPrice - currentPrice) * pos.quantity * pos.unitMultiplier * 32.0;
              } else if (pos.orderType === 'BUY_CRYPTO') {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * pos.unitMultiplier * 32.5;
              } else if (pos.orderType === 'SHORT_SELL_CRYPTO') {
                unrealizedPnL = (pos.entryPrice - currentPrice) * pos.quantity * pos.unitMultiplier * 32.5;
              } else if (pos.orderType === 'BUY_STABLECOIN') {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * 32.5;
              } else if (pos.orderType === 'BUY_CALL_OPTION' || pos.orderType === 'BUY_CALL_WARRANT') {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * pos.unitMultiplier;
              } else if (pos.orderType === 'BUY_PUT_OPTION' || pos.orderType === 'BUY_PUT_WARRANT') {
                unrealizedPnL = (currentPrice - pos.entryPrice) * pos.quantity * pos.unitMultiplier;
              }

              const unrealizedPnLPercent =
                pos.totalCostOrMargin > 0 ? (unrealizedPnL / pos.totalCostOrMargin) * 100 : 0;

              return {
                ...pos,
                currentPrice,
                notionalValue,
                unrealizedPnL: Math.round(unrealizedPnL),
                unrealizedPnLPercent: Number(unrealizedPnLPercent.toFixed(2)),
                lastTradeTime: live.lastTradeTime || '13:44:52',
                dataReceivedTime: live.dataReceivedTime || timeStr,
                marketSession: live.marketSession || 'CLOSED',
                sessionName: live.sessionName || '非交易時段',
                nextSessionTime: live.nextSessionTime || '17:25 (夜盤)',
                dataSource: live.dataSource || 'FinMind',
                isMock: false,
              };
            });

            return {
              ...prof,
              positions: updatedPositions,
            };
          })
        );
      }
    } catch (err) {
      console.warn('FinMind live quote sync err:', err);
    } finally {
      if (force) setIsRefreshingFinmind(false);
    }
  };

  // Adaptive FinMind quote sync and countdown ticker (Zero API quota exhaustion)
  useEffect(() => {
    fetchLiveQuotes(true);

    if (!isAutoRefreshLive) return;

    // 💡 使用者智慧解方：若非交易時段（已收盤定格），直接由伺服器本地下載資料庫極速提供，客戶端僅每 60 秒背景同步一次；
    // 盤中交易時段則以 15 秒為間隔刷新，配合伺服器端 30 秒全域共享快取，徹底杜絕 API 耗盡！
    const isClosed = !marketStatus.isOpen;
    const pollInterval = isClosed ? 60000 : 15000;
    const initialCountdown = isClosed ? 60 : 15;

    setCountdown(initialCountdown);

    const countdownTimer = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? initialCountdown : prev - 1));
    }, 1000);

    const quoteTimer = setInterval(() => {
      fetchLiveQuotes(false);
    }, pollInterval);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(quoteTimer);
    };
  }, [isAutoRefreshLive, marketStatus.isOpen]);

  // Current active profile (null when logged out)
  const currentProfile = isAuthenticated
    ? (profiles.find(p => p.id === currentProfileId) ||
       profiles.find(p => p.studentName.trim().toLowerCase() === sessionStorage.getItem('finmind_session_player_active')?.trim().toLowerCase()) ||
       null)
    : null;

  // Superuser check: Only authenticated superuser (程瑋翔 / superuser / scratchinai01@gmail.com) can see admin controls and secrets/Groq manager
  const isSuperUser = Boolean(
    isAuthenticated &&
    isAdminLoggedIn &&
    (currentProfile?.studentName === '程瑋翔' ||
     currentProfile?.studentName?.toLowerCase() === 'superuser' ||
     currentProfile?.studentName?.toLowerCase() === 'admin' ||
     isAdminEmail(currentProfile?.studentName) ||
     currentProfile?.roleTitle?.includes('SUPERUSER'))
  );

  // Calculate current profile NAV safely
  let totalSecuritiesVal = 0;
  let totalFuturesMargin = 0;
  let totalFuturesPnL = 0;
  let totalUnrealizedPnL = 0;

  if (currentProfile) {
    (currentProfile.positions || []).forEach(pos => {
      totalUnrealizedPnL += (pos.unrealizedPnL || 0);
      if (pos.category === 'futures' || pos.category === 'commodities' || pos.orderType === 'SHORT_SELL_CRYPTO') {
        totalFuturesMargin += pos.totalCostOrMargin;
        totalFuturesPnL += (pos.unrealizedPnL || 0);
      } else {
        totalSecuritiesVal += pos.notionalValue;
      }
    });
  }

  const netAssetValue = currentProfile
    ? currentProfile.availableCash + totalSecuritiesVal + (totalFuturesMargin + totalFuturesPnL)
    : 50000000;
  const totalReturn = currentProfile ? netAssetValue - currentProfile.initialCapital : 0;
  const totalReturnPct = currentProfile ? ((netAssetValue - currentProfile.initialCapital) / currentProfile.initialCapital) * 100 : 0;

  // Execute Trade Handler
  const handleExecuteTrade = async (trade: {
    symbol: string;
    name: string;
    category: AssetCategory;
    action: OrderAction;
    price: number;
    quantity: number;
    unitMultiplier: number;
    totalAmountOrMargin: number;
    notionalValue: number;
    rationale: string;
  }) => {
    const isFutures = trade.category === 'futures' || trade.category === 'commodities';
    const isSeller = trade.action === 'SELL_CALL_OPTION' || trade.action === 'SELL_PUT_OPTION';
    const usesMargin =
      isFutures ||
      isSeller ||
      trade.action === 'SHORT_SELL_STOCK' ||
      trade.action === 'SHORT_SELL_ETF' ||
      trade.action === 'SHORT_SELL_CRYPTO' ||
      trade.action === 'BUY_COMMODITY_LONG' ||
      trade.action === 'SELL_COMMODITY_SHORT';
    const execDateTime = getSystemDateTimeStr();

    const newPosition: Position = {
      id: `pos-${Date.now()}`,
      symbol: trade.symbol,
      name: trade.name,
      category: trade.category,
      orderType: trade.action,
      entryDate: execDateTime,
      entryPrice: trade.price,
      quantity: trade.quantity,
      unitMultiplier: trade.unitMultiplier,
      currentPrice: trade.price,
      totalCostOrMargin: trade.totalAmountOrMargin,
      notionalValue: trade.notionalValue,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      marginRequirement: usesMargin ? trade.totalAmountOrMargin : 0,
      notes: trade.rationale,
    };

    const newTradeRecord: TradeRecord = {
      id: `trade-${Date.now()}`,
      timestamp: execDateTime.split(' ')[1] || new Date().toLocaleTimeString('zh-TW', { hour12: false }),
      dateLabel: `${execDateTime} (即時撮合建倉)`,
      symbol: trade.symbol,
      name: trade.name,
      category: trade.category,
      action: trade.action,
      price: trade.price,
      quantity: trade.quantity,
      amount: trade.totalAmountOrMargin,
      marginUsed: usesMargin ? trade.totalAmountOrMargin : 0,
      realizedPnL: 0,
      rationale: trade.rationale,
    };

    const currentP =
      profiles.find(p => p.id === currentProfileId || p.isCurrentPlayer) || currentProfile || profiles[0];
    if (!currentP) return;

    const studentUid = currentP.uid || getOrGeneratePermanentUID(currentP.studentName);

    // 1. Construct and save immutable ledger transaction
    const txId = `TX_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const immutableTx: ImmutableTransaction = {
      transactionId: txId,
      uid: studentUid,
      studentName: currentP.studentName,
      symbol: trade.symbol,
      name: trade.name,
      category: trade.category,
      side: trade.action.includes('BUY') ? 'BUY' : trade.action.includes('SHORT') ? 'SHORT' : 'BUY',
      orderType: trade.action,
      price: trade.price,
      quantity: trade.quantity,
      amount: trade.totalAmountOrMargin,
      marginUsed: usesMargin ? trade.totalAmountOrMargin : 0,
      timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
      status: 'FILLED',
      rationale: trade.rationale || '金融博士班模擬策略委託',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: Date.now(),
    };
    saveImmutableTransaction(immutableTx).catch(e => console.warn('Immutable ledger sync:', e));

    // Consolidate with existing position if identical symbol and action (no duplicate cards)
    const existingIndex = (currentP.positions || []).findIndex(
      pos => pos.symbol === trade.symbol && pos.orderType === trade.action
    );
    let updatedPositionsList: Position[] = [];
    if (existingIndex >= 0) {
      const existing = currentP.positions[existingIndex];
      const mergedQty = existing.quantity + trade.quantity;
      const mergedCost = existing.totalCostOrMargin + trade.totalAmountOrMargin;
      // Correct weighted average transaction entry price: (P1*Q1 + P2*Q2) / (Q1 + Q2)
      const totalEntryVal = (existing.entryPrice * existing.quantity) + (trade.price * trade.quantity);
      const weightedEntryPrice = mergedQty > 0 ? Number((totalEntryVal / mergedQty).toFixed(2)) : trade.price;
      const mergedPos: Position = {
        ...existing,
        quantity: mergedQty,
        totalCostOrMargin: mergedCost,
        entryPrice: weightedEntryPrice,
        notionalValue: existing.currentPrice * mergedQty * trade.unitMultiplier,
      };
      updatedPositionsList = currentP.positions.map((p, idx) => (idx === existingIndex ? mergedPos : p));
    } else {
      updatedPositionsList = [...(currentP.positions || []), newPosition];
    }

    const updatedProfile: StudentProfile = {
      ...currentP,
      uid: studentUid,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      availableCash: currentP.availableCash - trade.totalAmountOrMargin,
      marginDeposits: currentP.marginDeposits + (usesMargin ? trade.totalAmountOrMargin : 0),
      positions: updatedPositionsList,
      tradeHistory: [newTradeRecord, ...(currentP.tradeHistory || [])],
      immutableTransactions: [immutableTx, ...(currentP.immutableTransactions || [])],
      updatedAt: Date.now(),
    };

    setProfiles(prev =>
      prev.map(p =>
        p.id === currentP.id || p.studentName.trim().toLowerCase() === currentP.studentName.trim().toLowerCase()
          ? updatedProfile
          : p
      )
    );

    // Save to Firebase Firestore immediately for real-time class ranking
    savePlayerProfileToFirebase(updatedProfile).catch(e =>
      console.error('Firebase save trade error:', e)
    );
  };

  // Close Position Handler
  const handleClosePosition = async (positionId: string) => {
    const currentP =
      profiles.find(p => p.id === currentProfileId || p.isCurrentPlayer) || currentProfile || profiles[0];
    if (!currentP) return;

    const targetPos = currentP.positions?.find(pos => pos.id === positionId);
    if (!targetPos) return;

    const isFutures = targetPos.category === 'futures' || targetPos.category === 'commodities';
    const isSeller =
      targetPos.orderType === 'SELL_CALL_OPTION' || targetPos.orderType === 'SELL_PUT_OPTION';
    const usesMargin =
      isFutures ||
      isSeller ||
      targetPos.orderType === 'SHORT_SELL_STOCK' ||
      targetPos.orderType === 'SHORT_SELL_ETF' ||
      targetPos.orderType === 'SHORT_SELL_CRYPTO' ||
      targetPos.orderType === 'BUY_COMMODITY_LONG' ||
      targetPos.orderType === 'SELL_COMMODITY_SHORT';

    const refundCash = targetPos.totalCostOrMargin + targetPos.unrealizedPnL;
    const refundMargin = usesMargin ? targetPos.totalCostOrMargin : 0;
    const studentUid = currentP.uid || getOrGeneratePermanentUID(currentP.studentName);

    // Write offset close transaction to immutable ledger
    const closeTxId = `TX_CLOSE_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const closeImmutableTx: ImmutableTransaction = {
      transactionId: closeTxId,
      uid: studentUid,
      studentName: currentP.studentName,
      symbol: targetPos.symbol,
      name: targetPos.name,
      category: targetPos.category,
      side: targetPos.orderType.includes('SHORT') ? 'COVER' : 'SELL',
      orderType: 'CLOSE_POSITION',
      price: targetPos.currentPrice,
      quantity: targetPos.quantity,
      amount: refundCash,
      marginUsed: 0,
      timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
      status: 'FILLED',
      rationale: `平倉沖銷 ${targetPos.name} (${targetPos.symbol})，實現損益 NT$ ${Math.round(targetPos.unrealizedPnL).toLocaleString()}`,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: Date.now(),
    };
    saveImmutableTransaction(closeImmutableTx).catch(e => console.warn('Immutable ledger close sync:', e));

    const closeTradeRecord: TradeRecord = {
      id: `close-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
      dateLabel: '平倉沖銷結算',
      symbol: targetPos.symbol,
      name: targetPos.name,
      category: targetPos.category,
      action: targetPos.orderType,
      price: targetPos.currentPrice,
      quantity: targetPos.quantity,
      amount: refundCash,
      marginUsed: 0,
      realizedPnL: targetPos.unrealizedPnL,
      rationale: `平倉沖銷 ${targetPos.symbol} 部位，回收現金 NT$ ${Math.round(refundCash).toLocaleString()}`,
    };

    const priorRealizedPnL = currentP.realizedPnL ?? (currentP.tradeHistory || []).reduce((acc, h) => acc + (h.realizedPnL || 0), 0);
    const newCumulativeRealizedPnL = priorRealizedPnL + targetPos.unrealizedPnL;

    const updatedProfile: StudentProfile = {
      ...currentP,
      uid: studentUid,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      availableCash: currentP.availableCash + refundCash,
      marginDeposits: Math.max(0, currentP.marginDeposits - refundMargin),
      positions: (currentP.positions || []).filter(pos => pos.id !== positionId),
      tradeHistory: [closeTradeRecord, ...(currentP.tradeHistory || [])],
      immutableTransactions: [closeImmutableTx, ...(currentP.immutableTransactions || [])],
      realizedPnL: newCumulativeRealizedPnL,
      cumulativeRealizedPnL: newCumulativeRealizedPnL,
      updatedAt: Date.now(),
    };

    setProfiles(prev =>
      prev.map(p =>
        p.id === currentP.id || p.studentName.trim().toLowerCase() === currentP.studentName.trim().toLowerCase()
          ? updatedProfile
          : p
      )
    );

    // Save to Firebase Firestore immediately for real-time class ranking
    savePlayerProfileToFirebase(updatedProfile).catch(e =>
      console.error('Firebase close pos error:', e)
    );
  };

  // Add New Student Profile Handler
  const handleAddNewStudent = async (name: string, team: string, strategy: string) => {
    const studentName = name.trim();
    if (!studentName) return;

    const newStudent: StudentProfile = {
      id: `student-${Date.now()}`,
      studentName,
      teamName: team.trim() || '自訂模擬投資戰隊',
      strategyBadge: strategy.trim() || '全天候策略',
      isCurrentPlayer: false,
      initialCapital: 50000000,
      availableCash: 50000000,
      marginDeposits: 0,
      benchmarkDate: getSystemDateStr(),
      positions: [],
      tradeHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setProfiles(prev => {
      if (prev.some(p => p.studentName.trim().toLowerCase() === studentName.toLowerCase())) {
        return prev;
      }
      return [newStudent, ...prev];
    });

    setFirebasePlayers(prev => {
      if (prev.some(p => p.studentName.trim().toLowerCase() === studentName.toLowerCase())) {
        return prev;
      }
      return [newStudent, ...prev];
    });

    savePlayerProfileToFirebase(newStudent).catch(e =>
      console.error('Firebase save student error:', e)
    );
  };

  // Add Instrument Found by Gemini or Custom Specified by Student
  const handleApplyGeminiInstrument = (inst: InstrumentSpec) => {
    handleAddCustomInstrument(inst);
    setIsTradingModalOpen(true);
  };

  const handleAddCustomInstrument = (inst: InstrumentSpec) => {
    setInstruments(prev => {
      const idx = prev.findIndex(i => i.symbol === inst.symbol);
      if (idx >= 0) {
        return prev.map((item, i) => (i === idx ? inst : item));
      }
      return [inst, ...prev];
    });
    setSelectedInstrument(inst);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-amber-200">
      {/* Top Header - Layer 1 (Portfolio Header) & Layer 2 (Core Actions) */}
      <header className="relative sm:sticky sm:top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs text-slate-900 transition-all">
        {isHeaderCollapsed ? (
          /* Ultra-compact collapsed mobile/desktop top bar */
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">📈</span>
              <span className="font-black text-slate-950 truncate text-xs sm:text-sm">
                5000萬大富翁
              </span>
              <span className="text-slate-300">·</span>
              {isAuthenticated && currentProfile ? (
                <button
                  type="button"
                  onClick={() => setIsPlayerSetupOpen(true)}
                  className="flex items-center gap-1 text-slate-800 hover:text-slate-950 font-bold px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0 cursor-pointer text-xs"
                  title="切換操盤手"
                >
                  <span>{currentProfile.avatarEmoji || '👑'}</span>
                  <span className="font-black truncate max-w-[80px] sm:max-w-[120px]">{currentProfile.studentName}</span>
                  <span className="text-[10px] text-amber-700">▾</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPlayerSetupOpen(true)}
                  className="flex items-center gap-1 text-slate-950 font-black px-2 py-0.5 rounded-lg bg-amber-400 hover:bg-amber-500 border border-amber-500 shrink-0 cursor-pointer text-xs shadow-2xs"
                  title="點擊登入操盤手帳號"
                >
                  <Lock className="w-3 h-3" />
                  <span>未登入 · 點此登入</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="text-right">
                <span className="font-mono font-black text-slate-950 text-xs sm:text-sm block">
                  {isAuthenticated && currentProfile
                    ? `NT$ ${Math.round(netAssetValue).toLocaleString()}`
                    : 'NT$ -- (已鎖定)'}
                </span>
              </div>

              {/* Font Size Controller (A- / A / A+) in Collapsed View */}
              <FontSizeControl compact={true} showLabels={false} />

              {isAuthenticated && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsChangePasswordOpen(true)}
                    className="px-2 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs border border-amber-300 flex items-center gap-1 shadow-2xs transition cursor-pointer"
                    title="修改個人登入密碼"
                  >
                    <Lock className="w-3 h-3 text-amber-700" />
                    <span className="hidden xs:inline">密碼</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs border border-rose-300 flex items-center gap-1 shadow-2xs transition cursor-pointer"
                    title="立即安全登出"
                  >
                    <LogOut className="w-3 h-3 text-rose-600" />
                    <span className="hidden xs:inline">登出</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setIsHeaderCollapsed(false)}
                className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs border border-amber-300 flex items-center gap-1 shadow-2xs transition cursor-pointer"
                title="展開詳細狀態"
              >
                <span>展開 ▾</span>
              </button>
            </div>
          </div>
        ) : (
          /* Expanded header view with convenient Collapse toggle */
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            {/* Left: Brand & Trader Identity */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-base sm:text-lg shadow-2xs border border-amber-400 shrink-0">
                📈
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h1 className="text-xs sm:text-base font-black text-slate-950 tracking-tight">
                    FinMind 5000萬股市大富翁
                  </h1>
                  <span className="text-slate-300 hidden sm:inline">｜</span>
                  <div className="flex items-center gap-1.5">
                    {isAuthenticated && currentProfile ? (
                      <>
                        {/* Trader Selector */}
                        <button
                          type="button"
                          onClick={() => setIsPlayerSetupOpen(true)}
                          className="flex items-center gap-1 sm:gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer shadow-2xs"
                          title="點擊切換操盤手帳號或修改個人資料"
                        >
                          <span>{currentProfile.avatarEmoji || '👑'}</span>
                          <span className="font-black text-slate-900 truncate max-w-[100px] sm:max-w-none">{currentProfile.studentName}</span>
                          <span className="text-[10px] text-slate-500 font-semibold hidden sm:inline">操盤手</span>
                          <span className="text-[10px] text-amber-700 font-bold ml-0.5">切換 / 設定 ▾</span>
                        </button>

                        {/* Prominent & Clear 個人設定 Button */}
                        <button
                          type="button"
                          onClick={() => setIsPlayerSetupOpen(true)}
                          className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-950 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer shadow-2xs"
                          title="修改個人資料、組別、頭銜與風格設定"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-500" />
                          <span>設定</span>
                        </button>

                        {/* Prominent & Clear 修改密碼 Button */}
                        <button
                          type="button"
                          onClick={() => setIsChangePasswordOpen(true)}
                          className="flex items-center gap-1.5 text-xs font-black text-amber-950 hover:text-slate-950 px-2.5 sm:px-3 py-1 rounded-xl bg-gradient-to-r from-amber-100 via-amber-200 to-yellow-200 hover:from-amber-200 hover:to-yellow-300 border-2 border-amber-400 shadow-xs hover:shadow-sm transition active:scale-95 cursor-pointer"
                          title="修改個人登入密碼"
                        >
                          <Lock className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                          <span>修改密碼</span>
                        </button>

                        {/* Prominent 登出 Button */}
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-1.5 text-xs font-black text-rose-700 hover:text-rose-900 px-2.5 sm:px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-300 shadow-2xs hover:shadow-xs transition active:scale-95 cursor-pointer"
                          title="立即登出當前帳號並鎖定交易室"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>登出</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsPlayerSetupOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-black text-slate-950 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 hover:brightness-105 border border-amber-500 shadow-sm transition cursor-pointer active:scale-95"
                        title="點擊進行操盤手身分登入或新加入者登記"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-950" />
                        <span>未登入 · 點此身分登入 / 註冊</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Center: Total Asset & Today Return */}
            <div className="flex items-center gap-3 sm:gap-4 bg-slate-50 border border-slate-200 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-2xl shadow-2xs">
              <div>
                <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold block">
                  <Term id="inventory">總淨資產</Term>
                </span>
                <span className="text-xs sm:text-base font-black font-mono text-slate-950">
                  {isAuthenticated && currentProfile
                    ? `NT$ ${Math.round(netAssetValue).toLocaleString()}`
                    : 'NT$ 50,000,000 (未登入)'}
                </span>
              </div>
              <div className="w-px h-5 sm:h-6 bg-slate-200" />
              <div>
                <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold block">
                  <Term id="turnover_rate">今日損益</Term>
                </span>
                <span
                  className={`text-[11px] sm:text-sm font-black font-mono ${
                    !isAuthenticated || !currentProfile
                      ? 'text-slate-500'
                      : totalReturn >= 0
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {isAuthenticated && currentProfile
                    ? `${totalReturn >= 0 ? '+' : ''}NT$ ${Math.round(totalReturn).toLocaleString()} (${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%)`
                    : 'NT$ 0 (未登入)'}
                </span>
              </div>
            </div>

            {/* Right: Clean Status Indicator, Font Size Controller & Collapse Toggle Button */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${marketStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span>
                    {marketStatus.isOpen ? (
                      <Term id="continuous_trading">盤中撮合</Term>
                    ) : (
                      <Term id="after_market">盤後定格</Term>
                    )}
                  </span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span>
                    <Term id="settlement">雲端同步</Term>
                  </span>
                </span>
              </div>

              {/* Font Size Controller (A- / A / A+) in Expanded View */}
              <FontSizeControl compact={false} showLabels={true} />

              {/* Close / Collapse Toggle */}
              <button
                type="button"
                onClick={() => setIsHeaderCollapsed(true)}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 flex items-center gap-1 shadow-2xs transition cursor-pointer"
                title="收起頂部面板，釋放更多手機畫面"
              >
                <span>收起 ▴</span>
              </button>
            </div>
          </div>
        )}

        {/* Layer 2: Core Action Nav Bar - Visible on desktop/tablet, hidden on mobile to avoid duplicating the bottom bar */}
        <div className="hidden sm:flex max-w-7xl mx-auto px-4 sm:px-6 py-2 border-t border-slate-100 items-center justify-between gap-3 text-xs overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            {/* 1. 資產儀表板 */}
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  setIsPlayerSetupOpen(true);
                  return;
                }
                setActiveView('overview');
              }}
              className={`px-3.5 py-1.5 rounded-xl font-black transition flex items-center gap-1.5 cursor-pointer border ${
                activeView === 'overview'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 border-transparent'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>{isAuthenticated ? '📊 資產儀表板' : '🔒 資產儀表板'}</span>
            </button>

            {/* 2. 下單交易 - ⭐ 最重要，唯一亮黃色主 CTA */}
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  setIsPlayerSetupOpen(true);
                  return;
                }
                handleOpenGeneralTrading();
              }}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black shadow-sm border border-amber-500 flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-slate-950" />
              <span>{isAuthenticated ? '🛒 下單交易' : '🔒 下單交易 (需登入)'}</span>
            </button>

            {/* 3. 持倉與交易紀錄 */}
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  setIsPlayerSetupOpen(true);
                  return;
                }
                setIsTradeStatementOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl font-bold text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer border border-transparent"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>{isAuthenticated ? '📒 持倉與交易紀錄' : '🔒 持倉紀錄'}</span>
            </button>

            {/* 4. 全球大宗原物料 (6大板塊) & StockQ 全球行情 */}
            <button
              type="button"
              onClick={() => setActiveView('commodities')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                activeView === 'commodities'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs font-black'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 border-transparent'
              }`}
            >
              <span className="text-amber-500">🌍</span>
              <span>原物料 / StockQ</span>
            </button>

            {/* 4b. 🌐 24/7 Crypto & 穩定幣 (BTC/ETH/USDT/USDC/TWDT) */}
            <button
              type="button"
              onClick={() => setActiveView('crypto')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                activeView === 'crypto'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-700 to-indigo-900 text-white border-amber-500 shadow-sm font-black'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 border-transparent'
              }`}
            >
              <span className="text-amber-400">🪙</span>
              <span>24/7 Crypto & 穩定幣</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-700 font-mono font-bold border border-emerald-500/30">
                TWDT · USDT · USDC
              </span>
            </button>

            {/* 4c. 🛰️ 全球 7 大市場交易時鐘雷達 */}
            <button
              type="button"
              onClick={() => setIsGlobalRadarOpen(true)}
              className="px-3 py-1.5 rounded-xl font-bold text-cyan-900 bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 transition flex items-center gap-1.5 cursor-pointer text-xs"
              title="查看全球 7 大市場營業時鐘與 24 小時接力模擬器"
            >
              <span>🛰️</span>
              <span>7大市場時鐘</span>
            </button>

            {/* 5. 行情分析 */}
            <button
              type="button"
              onClick={() => setActiveView('trading')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                activeView === 'trading'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs font-black'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 border-transparent'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
              <span>📈 行情分析</span>
            </button>

            {/* 6. AI 財務分析 - 紫色/藍色標識 */}
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  setIsPlayerSetupOpen(true);
                  return;
                }
                handleOpenCalculator();
              }}
              className="px-3.5 py-1.5 rounded-xl font-bold text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isAuthenticated ? '🧮 AI 財務分析' : '🔒 AI 財務分析'}</span>
            </button>

            {/* 7. 全班排行 */}
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  setIsPlayerSetupOpen(true);
                  return;
                }
                setActiveView('leaderboard');
              }}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                activeView === 'leaderboard'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs font-black'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 border-transparent'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>{isAuthenticated ? '🏆 全班排行' : '🔒 全班排行'}</span>
            </button>
          </div>

          {/* Right: Superuser 直接入口按鈕 + 更多工具 ▾ 下拉選單 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 名詞小學堂 📚 直接入口按鈕 */}
            <button
              type="button"
              onClick={() => openDrawer()}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-amber-950 font-black border border-amber-300 transition flex items-center gap-1.5 cursor-pointer text-xs shadow-2xs active:scale-95"
              title="開啟 300 筆金融詞庫小學堂"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-600" />
              <span>📚 名詞小學堂</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-full font-mono font-bold">
                {totalLearnedCount}/300
              </span>
            </button>

            {/* Superuser (程瑋翔) button - ONLY when logged in as authenticated 程瑋翔 */}
            {isSuperUser && (
              <button
                type="button"
                onClick={() => setIsAdminModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/10 hover:from-amber-500/30 hover:to-yellow-500/30 text-amber-950 font-black border border-amber-400/60 transition flex items-center gap-1.5 cursor-pointer text-xs shadow-2xs active:scale-95"
                title="進入管理系統 (最高管理者: 程瑋翔)"
              >
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                <span>👑 Superuser (程瑋翔)</span>
              </button>
            )}

            {/* Groq 10-Slot Free Token Pool Manager Button - ONLY for Superuser */}
            {isSuperUser && (
              <button
                type="button"
                onClick={() => setIsGroqKeyManagerOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-yellow-500/15 hover:from-amber-500/25 hover:to-orange-500/25 text-amber-950 font-black border border-amber-400/50 transition flex items-center gap-1.5 cursor-pointer text-xs shadow-2xs active:scale-95"
                title="管理 10 組 Groq Token 輪詢池 (Secrets) · 0 費用享極速推論 (僅 Superuser)"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                <span>⚡ Groq 免費金鑰</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  groqKeyCount > 0 ? 'bg-amber-300 text-amber-950' : 'bg-slate-200 text-slate-700'
                }`}>
                  {groqKeyCount}/10
                </span>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border border-slate-200 transition flex items-center gap-1 cursor-pointer text-xs"
              >
                <span>更多工具</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {isMoreMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 text-xs font-bold text-slate-800 animate-in fade-in zoom-in-95 duration-100"
                  onClick={() => setIsMoreMenuOpen(false)}
                >
                  {/* Groq Key Pool Quick Entrance in More Menu - ONLY for Superuser */}
                  {isSuperUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        setIsGroqKeyManagerOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center justify-between text-amber-950 font-black cursor-pointer border-b border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-600 fill-amber-500" />
                        <span>⚡ Groq 10組金鑰輪詢池</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-mono font-bold">
                        {groqKeyCount}/10 組
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      openDrawer();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center justify-between text-amber-950 font-black cursor-pointer border-b border-slate-100"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-600" />
                      <span>📚 名詞小學堂 (300詞庫)</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-mono">
                      {totalLearnedCount}/300
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenDerivatives('2317')}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>🎯 標的衍生商品矩陣</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveView('ppt_studio')}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Presentation className="w-4 h-4 text-indigo-600" />
                    <span>📑 PPT 報告評分生成</span>
                  </button>

                  {isSuperUser && (
                    <button
                      type="button"
                      onClick={() => setIsAdminModalOpen(true)}
                      className="w-full text-left px-4 py-2 hover:bg-amber-50/70 flex items-center gap-2 text-amber-900 font-black cursor-pointer border-t border-slate-100"
                    >
                      <Crown className="w-4 h-4 text-amber-600" />
                      <span>👑 管理系統 Superuser (程瑋翔)</span>
                    </button>
                  )}

                  {/* Font Size Scaling Row */}
                  <div
                    onClick={e => e.stopPropagation()}
                    className="w-full px-4 py-2 hover:bg-slate-50 flex items-center justify-between border-t border-slate-100"
                  >
                    <div className="flex items-center gap-1.5 text-slate-800">
                      <span className="text-amber-600 font-black text-xs">🔠</span>
                      <span>字體大小調整</span>
                    </div>
                    <FontSizeControl compact={true} showLabels={true} />
                  </div>

                  {/* Sensitive tools hidden when unauthenticated */}
                  {isAuthenticated && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsSecurityCenterOpen(true)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-emerald-800 cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>🛡️ 學生資產安全中心 (PITR/帳本)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsChangePasswordOpen(true)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                      >
                        <Lock className="w-4 h-4 text-amber-600" />
                        <span>🔐 修改個人登入密碼</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsResetModalOpen(true)}
                        className="w-full text-left px-4 py-2 hover:bg-rose-50 flex items-center gap-2 text-rose-800 font-bold cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4 text-rose-600" />
                        <span>🔄 清空部位重來 (密碼確認)</span>
                      </button>

                      <div className="border-t border-slate-100 my-1" />

                      <button
                        type="button"
                        onClick={handleResetToAutonomousCash}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-blue-800 cursor-pointer"
                      >
                        <GraduationCap className="w-4 h-4 text-blue-600" />
                        <span>🎓 博士班 5,000萬純現金還原</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsFinmindVerificationOpen(true)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-600 cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-slate-500" />
                        <span>⚙️ 系統工程資訊與 Token 檢驗</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content View Switcher */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 pb-28 sm:pb-12 text-slate-900">
        {!isAuthenticated || !currentProfile ? (
          /* Locked Trading Hall Gate: When logged out, strictly lock room and block account management & portfolio inspection */
          <LockedTradingHallGate
            allProfiles={profiles}
            firebasePlayers={firebasePlayers}
            onLoginSuccess={(player: StudentProfile) => {
              setProfiles(prev => {
                let next: StudentProfile[];
                if (!prev.some(p => p.id === player.id || p.studentName === player.studentName)) {
                  next = [{ ...player, isCurrentPlayer: true }, ...prev.map(p => ({ ...p, isCurrentPlayer: false }))];
                } else {
                  next = prev.map(p =>
                    p.id === player.id || p.studentName === player.studentName
                      ? { ...player, isCurrentPlayer: true }
                      : { ...p, isCurrentPlayer: false }
                  );
                }
                return deduplicateProfiles(next, player.id);
              });
              setCurrentProfileId(player.id);
              sessionStorage.setItem('finmind_session_player_active', player.studentName);
              sessionStorage.setItem('finmind_session_player_active_id', player.id);
              localStorage.setItem('finmind_player_setup_done', 'true');
              setIsAuthenticated(true);
              if (player.studentName === '程瑋翔') {
                setIsAdminLoggedIn(true);
                sessionStorage.setItem('finmind_superuser_authenticated', 'true');
              }
            }}
            onRegisterNewStudent={(name, password, team, roleId) => {
              handleSavePlayerProfile({
                studentName: name,
                password,
                teamName: team || '金融博士班計量實務組',
                characterRole: roleId || 'phd_autonomous',
                roleTitle: '自主操盤手 (現金5,000萬起步)',
                avatarEmoji: '🎓',
                strategyBadge: '純自主現金配置',
                customMotto: '「立足真實市場數據，100% 自主決策下單！」',
                startWithPureCash: true,
              });
              setIsAuthenticated(true);
            }}
            onOpenGlossary={openDrawer}
            marketStatus={marketStatus}
          />
        ) : (
          <>
            {/* VIEW 1: Portfolio Overview */}
            {activeView === 'overview' && (
              <PortfolioOverview
                currentProfile={currentProfile}
                onOpenTrading={handleOpenGeneralTrading}
                onClosePosition={handleClosePosition}
                onViewInstrumentKLine={inst => setViewingKLineInst(inst)}
                allInstruments={instruments}
                onEditPlayer={() => setIsPlayerSetupOpen(true)}
                onOpenCalculator={handleOpenCalculator}
                onSelectInstrumentToTrade={handleSelectInstrumentToTrade}
                onResetToAutonomousCash={handleResetToAutonomousCash}
                onOpenResetPortfolio={() => setIsResetModalOpen(true)}
                isAutoRefresh={isAutoRefreshLive}
                lastUpdatedTime={lastFinmindUpdateTime}
                countdownSeconds={countdown}
                tokenInfo={tokenInfo}
                onOpenFinmindVerification={() => setIsFinmindVerificationOpen(true)}
                onForceRefreshAll={() => fetchLiveQuotes(true)}
                marketStatus={marketStatus}
                onOpenStatement={() => setIsTradeStatementOpen(true)}
                onSeedSamplePortfolio={handleSeedSamplePortfolio}
                onOpenDerivativesModal={handleOpenDerivatives}
                onOpenSecurityCenter={() => setIsSecurityCenterOpen(true)}
                onOpenChangePassword={() => setIsChangePasswordOpen(true)}
                onAddInstrument={handleAddCustomInstrument}
                onOpenGlobalRadar={() => setIsGlobalRadarOpen(true)}
                onOpenCryptoLiveBoard={() => setActiveView('crypto')}
              />
            )}

            {/* VIEW 2: Trading Terminal & K-Line Studio */}
            {activeView === 'trading' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">
                      行情檢視與 FinMind 當下即時價 K 線存證中心
                    </h2>
                    <p className="text-xs text-slate-600 font-medium">
                      點擊切換上方商品以檢視 FinMind 當下即時行情、價量走勢與均線支撐，並直接進行下單或截圖保存於 PPT 簡報中。
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOpenGeneralTrading}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-sm border border-amber-400 cursor-pointer"
                    >
                      + 建立新下單 (選擇5大類別)
                    </button>
                  </div>
                </div>

                {/* Selected Instrument K-Line Showcase */}
                <div className="space-y-4">
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scrollbar-none">
                    {instruments.map(inst => (
                      <button
                        key={inst.symbol}
                        onClick={() => setSelectedInstrument(inst)}
                        className={`px-3 py-2 rounded-xl border text-xs font-black shrink-0 transition cursor-pointer ${
                          selectedInstrument.symbol === inst.symbol
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-mono text-amber-500 mr-1.5">{inst.symbol}</span>
                        <span>{inst.name}</span>
                        <span className="ml-2 font-mono text-slate-300">
                          NT$ {inst.price >= 1000 ? inst.price.toLocaleString() : inst.price}
                        </span>
                      </button>
                    ))}
                  </div>

                  <KLineChart
                    instrument={selectedInstrument}
                    benchmarkDate={getSystemDateStr()}
                    orderRationale={`依據系統即時撮合行情建立 ${selectedInstrument.name} 之部位，配合總經與產業題材進行資產配置。`}
                  />
                </div>
              </div>
            )}

            {/* VIEW 3: PPT Studio */}
            {activeView === 'ppt_studio' && (
              <PPTReportStudio
                currentProfile={currentProfile}
                allInstruments={instruments}
                onOpenTrading={handleOpenGeneralTrading}
              />
            )}

            {/* VIEW 4: Leaderboard */}
            {activeView === 'leaderboard' && (
              <Leaderboard
                profiles={profiles}
                currentProfileId={currentProfileId}
                onSelectProfile={id => {
                  setCurrentProfileId(id);
                  setActiveView('overview');
                }}
                onAddNewStudent={handleAddNewStudent}
                onDeleteProfile={handleDeleteStudentProfile}
                isSuperUser={isSuperUser}
              />
            )}

            {/* VIEW 5: Commodities & StockQ Board */}
            {activeView === 'commodities' && (
              <div className="space-y-4">
                <CommoditiesBoard
                  allInstruments={instruments}
                  onSelectInstrumentToTrade={handleSelectInstrumentToTrade}
                  onOpenTrading={handleOpenGeneralTrading}
                  onViewInstrumentKLine={inst => setViewingKLineInst(inst)}
                  onOpenCalculator={inst => handleOpenCalculator(inst || selectedInstrument)}
                  isSuperUser={isSuperUser}
                />
              </div>
            )}

            {/* VIEW 6: 🌐 24/7 Crypto & 穩定幣 (BTC/ETH/USDT/USDC/TWDT) */}
            {activeView === 'crypto' && (
              <div className="space-y-4">
                <CryptoLiveBoard
                  allInstruments={instruments}
                  onSelectInstrumentToTrade={handleSelectInstrumentToTrade}
                  onOpenTrading={handleOpenGeneralTrading}
                  onOpenGlobalRadar={() => setIsGlobalRadarOpen(true)}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Trading Modal */}
      <TradingModal
        isOpen={isTradingModalOpen}
        onClose={() => setIsTradingModalOpen(false)}
        availableCash={currentProfile ? currentProfile.availableCash : 50000000}
        selectedInstrument={selectedInstrument}
        instrumentsList={instruments}
        onSelectInstrument={inst => setSelectedInstrument(inst)}
        onAddCustomInstrument={handleAddCustomInstrument}
        initialStep={tradingModalStep}
        initialAction={tradingInitialAction}
        currentProfile={currentProfile}
        onViewInstrumentKLine={inst => setViewingKLineInst(inst)}
        isSuperUser={isSuperUser}
        onOpenGeminiAssistant={() => {
          setIsTradingModalOpen(false);
          setIsGeminiAssistantOpen(true);
        }}
        onOpenCalculator={() => {
          setIsTradingModalOpen(false);
          handleOpenCalculator(selectedInstrument);
        }}
        onOpenGlossary={openDrawer}
        onExecuteTrade={handleExecuteTrade}
      />

      {/* Gemini AI Financial Calculator Modal */}
      <GeminiCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        currentProfile={currentProfile || profiles[0]}
        allInstruments={instruments}
        initialInstrument={calculatorTargetInst || selectedInstrument}
        onApplyTradeOrder={handleApplyOrderFromCalculator}
        isSuperUser={isSuperUser}
      />

      {/* Gemini Quote Assistant Modal */}
      <GeminiQuoteAssistantModal
        isOpen={isGeminiAssistantOpen}
        onClose={() => setIsGeminiAssistantOpen(false)}
        existingInstruments={instruments}
        onSelectInstrument={handleApplyGeminiInstrument}
      />

      {/* Quick View K-Line Modal */}
      {viewingKLineInst && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-3xl w-full max-w-4xl p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-black text-slate-950 text-base flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-600" />
                FinMind 歷史行情與量化技術分析：{viewingKLineInst.name} ({viewingKLineInst.symbol})
              </h3>
              <button
                onClick={() => setViewingKLineInst(null)}
                className="text-slate-400 hover:text-slate-800 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <KLineChart
              instrument={viewingKLineInst}
              benchmarkDate={getSystemDateStr()}
              orderRationale="依據 FinMind 官方收盤歷史資料集建倉分析，作為五千萬資產配置實戰憑證。"
            />

            <div className="flex justify-end">
              <button
                onClick={() => setViewingKLineInst(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-black cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FinMind Live Real-time Verification & Sync Center Modal */}
      <FinmindVerificationModal
        isOpen={isFinmindVerificationOpen}
        onClose={() => setIsFinmindVerificationOpen(false)}
        instruments={instruments}
        isAutoRefresh={isAutoRefreshLive}
        onToggleAutoRefresh={setIsAutoRefreshLive}
        onForceRefreshAll={() => fetchLiveQuotes(true)}
        lastUpdatedTime={lastFinmindUpdateTime}
        countdownSeconds={countdown}
        updateCount={updateCount}
        tokenInfo={tokenInfo}
        refreshHistory={refreshHistory}
        onTokenUpdated={fetchTokenInfo}
      />

      {/* Player Setup & Character Selection Modal */}
      <PlayerSetupModal
        isOpen={isPlayerSetupOpen}
        onClose={() => {
          if (isAuthenticated) {
            setIsPlayerSetupOpen(false);
          }
        }}
        currentProfile={currentProfile}
        onSaveProfile={handleSavePlayerProfile}
        firebasePlayers={firebasePlayers}
        allProfiles={profiles}
        onDeleteProfile={handleDeleteStudentProfile}
        onLogout={handleLogout}
        isSuperUser={isSuperUser}
        isAuthenticated={isAuthenticated}
        canClose={isAuthenticated}
        onLoadExistingProfile={(player: StudentProfile) => {
          setProfiles(prev => {
            let next: StudentProfile[];
            if (!prev.some(p => p.id === player.id || p.studentName === player.studentName)) {
              next = [{ ...player, isCurrentPlayer: true }, ...prev.map(p => ({ ...p, isCurrentPlayer: false }))];
            } else {
              next = prev.map(p =>
                p.id === player.id || p.studentName === player.studentName
                  ? { ...player, isCurrentPlayer: true }
                  : { ...p, isCurrentPlayer: false }
              );
            }
            return deduplicateProfiles(next, player.id);
          });
          setCurrentProfileId(player.id);
          sessionStorage.setItem('finmind_session_player_active', player.studentName);
          sessionStorage.setItem('finmind_session_player_active_id', player.id);
          localStorage.setItem('finmind_player_setup_done', 'true');
          setIsAuthenticated(true);
          if (player.studentName === '程瑋翔') {
            setIsAdminLoggedIn(true);
            sessionStorage.setItem('finmind_superuser_authenticated', 'true');
          }
          setIsPlayerSetupOpen(false);
        }}
      />

      {/* Admin Management Modal (Authorized for Scratchinai01@gmail.com) */}
      <AdminManagementModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        profiles={profiles}
        onRefreshProfiles={() => {
          fetchLiveQuotes(true);
        }}
        onDeleteProfile={handleDeleteStudentProfile}
        onUpdateProfile={(updated: StudentProfile) => {
          const cleanName = updated.studentName.trim().toLowerCase();
          setProfiles(prev => {
            const idx = prev.findIndex(
              p => p.studentName.trim().toLowerCase() === cleanName || p.id === updated.id
            );
            if (idx >= 0) {
              return prev.map((p, i) => (i === idx ? updated : p));
            }
            return [updated, ...prev];
          });
          setFirebasePlayers(prev => {
            const idx = prev.findIndex(
              p => p.studentName.trim().toLowerCase() === cleanName || p.id === updated.id
            );
            if (idx >= 0) {
              return prev.map((p, i) => (i === idx ? updated : p));
            }
            return [updated, ...prev];
          });
        }}
        adminEmail={adminEmail}
        isAdminLoggedIn={isAdminLoggedIn}
        onAdminLogin={email => {
          setAdminEmail(email);
          setIsAdminLoggedIn(true);
        }}
        onAdminLogout={() => {
          setIsAdminLoggedIn(false);
        }}
        onOpenGroqManager={() => setIsGroqKeyManagerOpen(true)}
        groqKeyCount={groqKeyCount}
      />

      {/* Trade Statement & Position Query Modal */}
      <TradeStatementModal
        isOpen={isTradeStatementOpen}
        onClose={() => setIsTradeStatementOpen(false)}
        profile={currentProfile || profiles[0]}
        allInstruments={instruments}
        onClosePosition={handleClosePosition}
        onViewInstrumentKLine={inst => setViewingKLineInst(inst)}
        onOpenTrading={inst => {
          if (inst) setSelectedInstrument(inst);
          setIsTradingModalOpen(true);
        }}
        onSeedSamplePortfolio={handleSeedSamplePortfolio}
      />

      {/* Underlying Derivatives Matrix & 50,000,000 Capital Allocation Simulator */}
      <UnderlyingDerivativesModal
        isOpen={isDerivativesModalOpen}
        onClose={() => setIsDerivativesModalOpen(false)}
        allInstruments={instruments}
        onSelectInstrumentToTrade={handleSelectInstrumentToTrade}
        initialSymbol={derivativesTargetSymbol}
      />

      {/* Student Asset Security Center Modal (Zero-Loss Architecture, Immutable Ledger, 7-Day PITR) */}
      <StudentSecurityCenterModal
        isOpen={isSecurityCenterOpen}
        onClose={() => setIsSecurityCenterOpen(false)}
        profiles={profiles}
        currentProfile={currentProfile || profiles[0]}
        onStudentRestored={restored => {
          setProfiles(prev =>
            prev.map(p =>
              p.id === restored.id || p.studentName.trim().toLowerCase() === restored.studentName.trim().toLowerCase()
                ? restored
                : p
            )
          );
        }}
      />

      {/* Change Password Modal (Default: money888, Custom Self-Modification Supported) */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        profile={currentProfile || profiles[0]}
        onPasswordChanged={newPassword => {
          if (!currentProfile) return;
          setProfiles(prev =>
            prev.map(p =>
              p.id === currentProfile.id || p.studentName.trim().toLowerCase() === currentProfile.studentName.trim().toLowerCase()
                ? { ...p, password: newPassword, updatedAt: Date.now() }
                : p
            )
          );
        }}
      />

      {/* Reset Portfolio Modal with Password Confirmation */}
      <ResetPortfolioModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        profile={currentProfile || profiles[0]}
        onConfirmReset={handleConfirmResetPortfolio}
      />

      {/* 300 Financial Terms Educational Glossary Drawer */}
      <FinancialGlossaryDrawer />

      {/* Contextual Scenario Proactive Guidance Toast */}
      <ContextualTermBanner />

      {/* 🌐 全球 7 大市場 × 24/7 交易時鐘雷達 Modal */}
      <GlobalMarketRadarModal
        isOpen={isGlobalRadarOpen}
        onClose={() => setIsGlobalRadarOpen(false)}
      />

      {/* Groq 10-Slot Free Token Secrets Manager Modal - ONLY for Superuser */}
      {isSuperUser && (
        <GroqKeyManagerModal
          isOpen={isGroqKeyManagerOpen}
          onClose={() => {
            setIsGroqKeyManagerOpen(false);
            refreshGroqStatus();
          }}
          onKeysUpdated={refreshGroqStatus}
          isSuperUser={isSuperUser}
        />
      )}

      {/* Mobile Sticky Bottom Navigation Bar - Daytime Light Mode */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-xl safe-area-pb text-slate-700">
        <button
          onClick={() => {
            if (!isAuthenticated) {
              setIsPlayerSetupOpen(true);
              return;
            }
            setActiveView('overview');
          }}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
            activeView === 'overview' ? 'text-amber-600 font-black' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">{isAuthenticated ? '資產持倉' : '🔒需登入'}</span>
        </button>

        <button
          onClick={() => {
            if (!isAuthenticated) {
              setIsPlayerSetupOpen(true);
              return;
            }
            setActiveView('leaderboard');
          }}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative ${
            activeView === 'leaderboard' ? 'text-amber-600 font-black' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4 mb-0.5 text-amber-500" />
          <span className="text-[10px]">即時排名</span>
          <span className="absolute -top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </button>

        {/* Center Prominent Trade Action Button */}
        <button
          onClick={() => {
            if (!isAuthenticated) {
              setIsPlayerSetupOpen(true);
              return;
            }
            handleOpenGeneralTrading();
          }}
          className="flex flex-col items-center justify-center -mt-4 py-1.5 px-3 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 shadow-md active:scale-95 transition cursor-pointer border border-amber-300"
        >
          <div className="w-7 h-7 rounded-xl bg-white/40 flex items-center justify-center text-sm font-black mb-0.5">
            🎲
          </div>
          <span className="text-[10px] font-black">{isAuthenticated ? '5大類下單' : '🔒需登入'}</span>
        </button>

        <button
          onClick={() => {
            if (!isAuthenticated) {
              setIsPlayerSetupOpen(true);
              return;
            }
            setActiveView('trading');
          }}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
            activeView === 'trading' ? 'text-amber-600 font-black' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">K線存證</span>
        </button>

        <button
          onClick={() => {
            if (!isAuthenticated) {
              setIsPlayerSetupOpen(true);
              return;
            }
            setActiveView('ppt_studio');
          }}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition ${
            activeView === 'ppt_studio' ? 'text-indigo-600 font-black' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Presentation className="w-4 h-4 mb-0.5 text-indigo-600" />
          <span className="text-[10px]">PPT報告</span>
        </button>
      </nav>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-600 pb-20 sm:pb-6">
        <p className="font-semibold text-slate-700">
          FinMind 5000萬股市大富翁實戰模擬系統 · 串接 FinMind 台灣金融市場報價資料集 & Firebase 雲端遊戲紀錄存證
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          涵蓋股票、長天期美債ETF、大盤ETF、台指期貨(大台/小台/個股期)、台指選擇權(TXO Buy/Sell Call/Put) 與個股認購認售權證
        </p>
      </footer>
    </div>
  );
}
