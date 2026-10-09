import React, { useState, useRef, useEffect } from 'react';
import {
  TERMS_BY_ID,
  TERMS_BY_TITLE,
  TERMS_BY_ALIAS,
  TERM_CATEGORIES,
  FinancialTerm,
} from '../data/financialTerms';
import { useGlossary } from '../context/GlossaryContext';
import { BookOpen, Check, ExternalLink, HelpCircle, X, Sparkles } from 'lucide-react';

interface TermProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  hideIcon?: boolean;
}

export const Term: React.FC<TermProps> = ({ id, children, className = '', hideIcon = false }) => {
  const { isTermLearned, toggleTermLearned, markTermAsRead, openDrawer } = useGlossary();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect mobile device / touch screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Lookup term by id, title, or alias
  const term: FinancialTerm | undefined =
    TERMS_BY_ID.get(id.toLowerCase()) ||
    TERMS_BY_TITLE.get(id.toLowerCase()) ||
    TERMS_BY_ALIAS.get(id.toLowerCase());

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  if (!term) {
    // Graceful fallback if term not found
    return <span className={className}>{children}</span>;
  }

  const category = TERM_CATEGORIES[term.c];
  const learned = isTermLearned(term.id);

  const handleMouseEnter = () => {
    if (isMobile) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsOpen(true);
      markTermAsRead(term.id);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    markTermAsRead(term.id);
    setIsOpen(!isOpen);
  };

  const handleOpenInDrawer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    openDrawer(term.id, term.c);
  };

  return (
    <span
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={`relative inline-flex items-center cursor-help group select-none ${className}`}
    >
      {/* Label with delicate dotted underline */}
      <span className="border-b border-dotted border-amber-500/80 group-hover:border-amber-600 transition-colors">
        {children}
      </span>

      {/* Superscript / Small ? indicator */}
      {!hideIcon && (
        <span
          className="ml-0.5 -mt-1 text-[9px] font-black text-amber-600/90 group-hover:text-amber-800 transition-colors select-none"
          title="點擊或移至此處查看名詞解釋"
        >
          ﹖
        </span>
      )}

      {/* Desktop Hover Card (Short Mode Tooltip) */}
      {!isMobile && isOpen && (
        <div
          ref={popoverRef}
          onMouseEnter={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={handleMouseLeave}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 sm:w-80 bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-700/80 animate-in fade-in zoom-in-95 duration-150 text-left cursor-default select-text"
        >
          {/* Caret pointing down */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-x-6 border-x-transparent border-t-6 border-t-slate-900" />

          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base">{category.icon}</span>
              <span className="font-black text-xs text-white truncate">{term.t}</span>
              {term.en && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-mono font-bold shrink-0">
                  {term.en}
                </span>
              )}
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              {category.name}
            </span>
          </div>

          {/* One-sentence core answer */}
          <p className="text-xs text-slate-200 leading-relaxed font-normal">{term.s}</p>

          {/* Footer Actions */}
          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                toggleTermLearned(term.id);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition cursor-pointer font-bold ${
                learned
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Check className={`w-3 h-3 ${learned ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>{learned ? '已掌握 ✓' : '標記已讀'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenInDrawer}
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold hover:underline cursor-pointer"
            >
              <BookOpen className="w-3 h-3" />
              <span>小學堂詳情 ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Slide-Up Bottom Sheet */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end justify-center animate-in fade-in duration-150"
          onClick={e => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          <div
            ref={popoverRef}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 text-white shadow-2xl animate-in slide-in-from-bottom duration-200 text-left"
          >
            {/* Grab handle */}
            <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">{category.icon}</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-base font-black text-white">{term.t}</h4>
                    {term.en && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-mono font-bold">
                        {term.en}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-amber-400 font-bold">{category.name}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed mb-5 font-normal">{term.s}</p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => toggleTermLearned(term.id)}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                  learned
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{learned ? '已掌握知識點 ✓' : '標記為已學會'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenInDrawer}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <BookOpen className="w-4 h-4" />
                <span>開啟名詞小學堂</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
};
