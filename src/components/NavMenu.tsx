import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * 頂部導覽用的下拉選單。
 * 選單用 position: fixed 定位，不會被可橫向捲動的導覽列裁掉；點外面、按 Esc、捲動或縮放視窗都會關閉。
 */
export const NavMenu: React.FC<{
  label: React.ReactNode;
  buttonClass: string;
  align?: 'left' | 'right';
  width?: number;
  title?: string;
  children: (close: () => void) => React.ReactNode;
}> = ({ label, buttonClass, align = 'left', width = 280, title, children }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    const left = align === 'right' ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - w - 8);
    setPos({ top: r.bottom + 6, left: Math.max(8, left) });
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={buttonClass}>
        {label}
        <ChevronDown className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && (
        <div
          ref={menu}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16) }}
          className="z-[90] bg-white border border-slate-200 rounded-2xl shadow-xl py-2 max-h-[75vh] overflow-y-auto"
        >
          {children(close)}
        </div>
      )}
    </>
  );
};

export const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  desc?: string;
  active?: boolean;
  tone?: 'default' | 'danger' | 'amber';
  right?: React.ReactNode;
  onClick: () => void;
}> = ({ icon, label, desc, active, tone = 'default', right, onClick }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 cursor-pointer ${
      active ? 'bg-slate-900 text-white' : tone === 'danger' ? 'text-rose-700 hover:bg-rose-50' : tone === 'amber' ? 'text-amber-950 hover:bg-amber-50' : 'text-slate-800 hover:bg-slate-50'
    }`}
  >
    <span className="w-6 text-center text-[18px] shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-[15px] font-black leading-tight">{label}</span>
      {desc && <span className={`block text-[12.5px] leading-snug ${active ? 'text-slate-300' : 'text-slate-500'}`}>{desc}</span>}
    </span>
    {right}
  </button>
);

export const MenuDivider = () => <div className="border-t border-slate-100 my-1.5" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <div className="px-4 pt-1.5 pb-1 text-[12px] font-bold text-slate-400">{children}</div>;
