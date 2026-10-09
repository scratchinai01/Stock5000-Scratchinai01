import React, { useState, useEffect, useRef } from 'react';
import { Type, ZoomIn, ZoomOut, Check, Sparkles } from 'lucide-react';

export type FontSizeScale = 'normal' | 'large' | 'xlarge' | 'huge';

interface ScaleOption {
  key: FontSizeScale;
  label: string;
  sublabel: string;
  percentage: string;
  pxSize: string;
}

export const FONT_SCALE_OPTIONS: ScaleOption[] = [
  { key: 'normal', label: '標準字體', sublabel: '預設 100%', percentage: '100%', pxSize: '16px' },
  { key: 'large', label: '舒適放大', sublabel: '推薦日常與手機', percentage: '115%', pxSize: '18.4px' },
  { key: 'xlarge', label: '特大字體', sublabel: '清晰長輩友善', percentage: '130%', pxSize: '20.8px' },
  { key: 'huge', label: '尊長超大', sublabel: '最大字體輕鬆看盤', percentage: '145%', pxSize: '23.2px' },
];

export function applyRootFontSize(scale: FontSizeScale) {
  const root = document.documentElement;
  const option = FONT_SCALE_OPTIONS.find(o => o.key === scale) || FONT_SCALE_OPTIONS[0];
  root.style.fontSize = option.pxSize;
  try {
    localStorage.setItem('finmind_font_scale', scale);
    window.dispatchEvent(new CustomEvent('finmind-font-scale-changed', { detail: { scale } }));
  } catch (e) {
    console.warn('Storage font scale error:', e);
  }
}

export function getInitialFontSize(): FontSizeScale {
  try {
    const saved = localStorage.getItem('finmind_font_scale') as FontSizeScale;
    if (saved && ['normal', 'large', 'xlarge', 'huge'].includes(saved)) {
      return saved;
    }
  } catch {}
  return 'normal';
}

interface FontSizeControlProps {
  compact?: boolean;
  className?: string;
  showLabels?: boolean;
}

export const FontSizeControl: React.FC<FontSizeControlProps> = ({
  compact = false,
  className = '',
  showLabels = true,
}) => {
  const [scale, setScale] = useState<FontSizeScale>(getInitialFontSize);
  const [isOpen, setIsOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initialize and listen to cross-component sync
  useEffect(() => {
    const initial = getInitialFontSize();
    setScale(initial);
    applyRootFontSize(initial);

    const handleSync = (e: any) => {
      if (e.detail?.scale) {
        setScale(e.detail.scale);
      }
    };
    window.addEventListener('finmind-font-scale-changed', handleSync);
    return () => window.removeEventListener('finmind-font-scale-changed', handleSync);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const changeScale = (newScale: FontSizeScale) => {
    setScale(newScale);
    applyRootFontSize(newScale);
    const opt = FONT_SCALE_OPTIONS.find(o => o.key === newScale);
    const msg = `字體已切換至【${opt?.label} · ${opt?.percentage}】`;
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };

  const scaleOrder: FontSizeScale[] = ['normal', 'large', 'xlarge', 'huge'];
  const currentIndex = scaleOrder.indexOf(scale);

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) {
      changeScale(scaleOrder[currentIndex - 1]);
    }
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex < scaleOrder.length - 1) {
      changeScale(scaleOrder[currentIndex + 1]);
    }
  };

  const currentOption = FONT_SCALE_OPTIONS.find(o => o.key === scale) || FONT_SCALE_OPTIONS[0];

  return (
    <div className={`relative inline-flex items-center ${className}`} ref={menuRef}>
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-70 bg-slate-900/90 backdrop-blur-md text-amber-300 font-black text-xs px-3.5 py-1.5 rounded-full shadow-lg border border-amber-400/40 animate-in fade-in zoom-in duration-150 flex items-center gap-1.5 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Button Group Control */}
      <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl shadow-2xs p-0.5 text-xs">
        {/* Decrease button: A- */}
        <button
          type="button"
          onClick={handleDecrease}
          disabled={currentIndex === 0}
          className={`px-1.5 sm:px-2 py-1 rounded-lg font-black transition cursor-pointer flex items-center justify-center ${
            currentIndex === 0
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 active:scale-95'
          }`}
          title="縮小字體 (A-)"
        >
          <span className="text-[11px] font-bold">A⁻</span>
        </button>

        {/* Current scale button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200/80 font-black text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
          title="點選切換字體大小 (標準 / 放大 / 特大 / 超大)"
        >
          <Type className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          {showLabels && (
            <span className="font-black text-[11px] whitespace-nowrap">
              {compact ? currentOption.percentage : `${currentOption.label.replace('字體', '')} (${currentOption.percentage})`}
            </span>
          )}
          <span className="text-[9px] text-amber-700">▾</span>
        </button>

        {/* Increase button: A+ */}
        <button
          type="button"
          onClick={handleIncrease}
          disabled={currentIndex === scaleOrder.length - 1}
          className={`px-1.5 sm:px-2 py-1 rounded-lg font-black transition cursor-pointer flex items-center justify-center ${
            currentIndex === scaleOrder.length - 1
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 active:scale-95'
          }`}
          title="放大字體 (A+)"
        >
          <span className="text-[12px] font-bold">A⁺</span>
        </button>
      </div>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-56 sm:w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-60 animate-in fade-in zoom-in-95 duration-100 text-slate-900">
          <div className="px-2.5 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-amber-600" />
              <span>調整全站字體大小</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">即時縮放排版</span>
          </div>

          <div className="space-y-1">
            {FONT_SCALE_OPTIONS.map(opt => {
              const isSelected = opt.key === scale;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    changeScale(opt.key);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-100 text-amber-950 font-black border border-amber-300 shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-700 font-bold border border-transparent'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-xs flex items-center gap-1.5">
                      <span>{opt.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-white/70 text-slate-700 rounded font-mono font-bold border border-slate-200">
                        {opt.percentage}
                      </span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {opt.sublabel}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-700 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 px-2 text-[10px] text-slate-500 leading-tight">
            💡 提示：字體放大後，報價、表格與 K 線數值會同步等比放大，方便手機閱覽。
          </div>
        </div>
      )}
    </div>
  );
};
