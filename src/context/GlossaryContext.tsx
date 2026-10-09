import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  FinancialTerm,
  FINANCIAL_TERMS,
  TERMS_BY_ID,
  TERMS_BY_TITLE,
  TERMS_BY_ALIAS,
  TermCategoryCode,
  TERM_CATEGORIES,
} from '../data/financialTerms';

export interface UnlockedBadge {
  code: TermCategoryCode | 'master';
  title: string;
  icon: string;
  description: string;
  unlockedAt: number;
}

interface GlossaryContextType {
  learnedTermIds: Set<string>;
  toggleTermLearned: (termId: string) => void;
  markTermAsRead: (termId: string) => void;
  isTermLearned: (termId: string) => boolean;
  termViewCounts: Record<string, number>;
  recordTermClick: (termId: string) => void;

  // Drawer state
  isDrawerOpen: boolean;
  activeDrawerTermId: string | null;
  activeCategoryFilter: TermCategoryCode | 'all';
  openDrawer: (termId?: string, category?: TermCategoryCode) => void;
  closeDrawer: () => void;
  setActiveCategoryFilter: (category: TermCategoryCode | 'all') => void;

  // Contextual Trigger
  contextualTerm: FinancialTerm | null;
  triggerContextualTerm: (termIdOrTitle: string) => void;
  dismissContextualTerm: () => void;

  // Gamification & Badges
  unlockedBadges: UnlockedBadge[];
  totalLearnedCount: number;
  totalTermsCount: number;
  newlyUnlockedBadge: UnlockedBadge | null;
  clearNewlyUnlockedBadge: () => void;
}

const GlossaryContext = createContext<GlossaryContextType | undefined>(undefined);

const LEARNED_TERMS_KEY = 'finmind_glossary_learned_terms';
const ANALYTICS_VIEWS_KEY = 'finmind_glossary_term_views';

export const GlossaryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Learned terms set from LocalStorage
  const [learnedTermIds, setLearnedTermIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(LEARNED_TERMS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // Analytics click counters
  const [termViewCounts, setTermViewCounts] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem(ANALYTICS_VIEWS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerTermId, setActiveDrawerTermId] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<TermCategoryCode | 'all'>('all');

  // Contextual Term Popup
  const [contextualTerm, setContextualTerm] = useState<FinancialTerm | null>(null);
  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<UnlockedBadge | null>(null);

  // Sync learned terms to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(LEARNED_TERMS_KEY, JSON.stringify(Array.from(learnedTermIds)));
    } catch (e) {
      console.warn('Failed to save learned terms:', e);
    }
  }, [learnedTermIds]);

  // Sync analytics view counts to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(ANALYTICS_VIEWS_KEY, JSON.stringify(termViewCounts));
    } catch (e) {
      console.warn('Failed to save term views analytics:', e);
    }
  }, [termViewCounts]);

  const recordTermClick = useCallback((termId: string) => {
    const cleanId = termId.toLowerCase();
    setTermViewCounts(prev => ({
      ...prev,
      [cleanId]: (prev[cleanId] || 0) + 1,
    }));
  }, []);

  const markTermAsRead = useCallback((termId: string) => {
    const cleanId = termId.toLowerCase();
    setLearnedTermIds(prev => {
      if (prev.has(cleanId)) return prev;
      const next = new Set(prev);
      next.add(cleanId);
      return next;
    });
    recordTermClick(cleanId);
  }, [recordTermClick]);

  const toggleTermLearned = useCallback((termId: string) => {
    const cleanId = termId.toLowerCase();
    setLearnedTermIds(prev => {
      const next = new Set(prev);
      if (next.has(cleanId)) {
        next.delete(cleanId);
      } else {
        next.add(cleanId);
      }
      return next;
    });
    recordTermClick(cleanId);
  }, [recordTermClick]);

  const isTermLearned = useCallback((termId: string) => {
    return learnedTermIds.has(termId.toLowerCase());
  }, [learnedTermIds]);

  const openDrawer = useCallback((termId?: string, category?: TermCategoryCode) => {
    if (termId) {
      setActiveDrawerTermId(termId);
      recordTermClick(termId);
      markTermAsRead(termId);
      const term = TERMS_BY_ID.get(termId.toLowerCase());
      if (term) {
        setActiveCategoryFilter(term.c);
      }
    }
    if (category) {
      setActiveCategoryFilter(category);
    }
    setIsDrawerOpen(true);
  }, [markTermAsRead, recordTermClick]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const triggerContextualTerm = useCallback((termIdOrTitle: string) => {
    const clean = termIdOrTitle.trim().toLowerCase();
    const term =
      TERMS_BY_ID.get(clean) ||
      TERMS_BY_TITLE.get(clean) ||
      TERMS_BY_ALIAS.get(clean);

    if (term) {
      setContextualTerm(term);
      recordTermClick(term.id);
    }
  }, [recordTermClick]);

  const dismissContextualTerm = useCallback(() => {
    setContextualTerm(null);
  }, []);

  // Compute Unlocked Badges based on completed category terms
  const unlockedBadges = useMemo(() => {
    const badges: UnlockedBadge[] = [];

    // Check each category
    (Object.keys(TERM_CATEGORIES) as TermCategoryCode[]).forEach(catCode => {
      const catMeta = TERM_CATEGORIES[catCode];
      const catTerms = FINANCIAL_TERMS.filter(t => t.c === catCode);
      const learnedInCat = catTerms.filter(t => learnedTermIds.has(t.id));

      // Unlock badge if at least 60% of category or all completed
      if (catTerms.length > 0 && learnedInCat.length >= Math.min(catTerms.length, 5)) {
        badges.push({
          code: catCode,
          title: `${catMeta.name} · ${catMeta.badgeName}`,
          icon: catMeta.icon,
          description: `已掌握 ${learnedInCat.length}/${catTerms.length} 個關鍵概念`,
          unlockedAt: Date.now(),
        });
      }
    });

    if (learnedTermIds.size >= 50) {
      badges.push({
        code: 'master',
        title: '金融小學堂 · 博學大師',
        icon: '👑',
        description: `已精通累計超過 50 個全方位金融術語！`,
        unlockedAt: Date.now(),
      });
    }

    return badges;
  }, [learnedTermIds]);

  const clearNewlyUnlockedBadge = useCallback(() => {
    setNewlyUnlockedBadge(null);
  }, []);

  const value = {
    learnedTermIds,
    toggleTermLearned,
    markTermAsRead,
    isTermLearned,
    termViewCounts,
    recordTermClick,
    isDrawerOpen,
    activeDrawerTermId,
    activeCategoryFilter,
    openDrawer,
    closeDrawer,
    setActiveCategoryFilter,
    contextualTerm,
    triggerContextualTerm,
    dismissContextualTerm,
    unlockedBadges,
    totalLearnedCount: learnedTermIds.size,
    totalTermsCount: FINANCIAL_TERMS.length,
    newlyUnlockedBadge,
    clearNewlyUnlockedBadge,
  };

  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
};

export const useGlossary = (): GlossaryContextType => {
  const context = useContext(GlossaryContext);
  if (!context) {
    throw new Error('useGlossary must be used within a GlossaryProvider');
  }
  return context;
};
