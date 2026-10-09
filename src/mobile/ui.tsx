import React from 'react';
import { InstrumentSpec } from '../types/market';

/** 手機版設計代號：深色底、紅漲綠跌（台股慣例）、數字等寬 */
export const C = {
  bg: '#0b0f14',
  bar: '#0f141b',
  card: '#121821',
  card2: '#10161e',
  line: '#1f2833',
  line2: '#243041',
  text: '#e6edf3',
  sub: '#c4ced8',
  muted: '#8b98a5',
  accent: '#f5b301',
  accentBg: '#2a1f05',
  up: '#ff4d5a',
  down: '#2bd96b',
  upFill: '#c81e2c',
  downFill: '#11803d',
};

export const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" } as const;

export const fmtPrice = (v: number | undefined | null) => {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
export const fmtMoney = (v: number) => `NT$ ${Math.round(v).toLocaleString('en-US')}`;
export const fmtSigned = (v: number, digits = 2) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
export const dirColor = (v: number) => (v > 0 ? C.up : v < 0 ? C.down : C.sub);
export const arrow = (v: number) => (v > 0 ? '▲' : v < 0 ? '▼' : '');

export function instrumentChange(inst: InstrumentSpec) {
  const chg = inst.change ?? inst.price - (inst.prevClose ?? inst.price);
  const pct = inst.changePercent ?? (inst.prevClose ? (chg / inst.prevClose) * 100 : 0);
  return { chg, pct };
}

export const Icon = {
  star: (filled = false) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l5-5 4 3 8-8" /><path d="M15 7h5v5" />
    </svg>
  ),
  bolt: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  wallet: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="14" rx="2" /><path d="M8 6V4h8v2M3 12h18" />
    </svg>
  ),
  trophy: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" /><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3" />
    </svg>
  ),
  back: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  book: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z" /><path d="M8 7h6" />
    </svg>
  ),
  warn: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" />
    </svg>
  ),
  desktop: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
    </svg>
  ),
};

export const Chip: React.FC<{ children: React.ReactNode; tone?: 'accent' | 'muted' }> = ({ children, tone = 'accent' }) => (
  <span
    className="px-2 py-0.5 rounded-full text-[12px] font-bold whitespace-nowrap"
    style={tone === 'accent' ? { background: C.accentBg, color: C.accent } : { background: C.card, color: C.muted }}
  >
    {children}
  </span>
);

export const Segmented: React.FC<{
  options: string[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}> = ({ options, value, onChange, ariaLabel }) => (
  <div role="tablist" aria-label={ariaLabel} className="flex gap-1.5 overflow-x-auto no-scrollbar">
    {options.map(o => {
      const on = o === value;
      return (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onChange(o)}
          className="flex-none min-h-[36px] px-3.5 rounded-full text-[14px] font-bold border transition-colors"
          style={{ background: on ? C.accent : C.card, color: on ? C.bg : C.sub, borderColor: on ? C.accent : C.line }}
        >
          {o}
        </button>
      );
    })}
  </div>
);
