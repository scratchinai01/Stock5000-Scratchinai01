import React from 'react';
import { READING_SCALES, useReadingScale } from './useReadingScale';

/** 字級切換：大大的按鈕，長輩也好按 */
export function ReadingScaleSwitch({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { id, set } = useReadingScale();
  const dark = tone === 'dark';
  return (
    <div role="radiogroup" aria-label="字級大小" className="inline-flex items-center gap-1 rounded-full p-1" style={{ background: dark ? 'rgba(255,255,255,0.14)' : '#efe9dc' }}>
      <span className="px-2 text-[15px] font-bold" style={{ color: dark ? '#fde68a' : '#5b6573' }}>字級</span>
      {READING_SCALES.map((s, i) => {
        const on = s.id === id;
        return (
          <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => set(s.id)}
            className="min-w-[48px] min-h-[40px] px-2.5 rounded-full font-black transition-colors"
            style={{
              fontSize: 15 + i * 3,
              background: on ? (dark ? '#fbbf24' : '#1f2630') : 'transparent',
              color: on ? (dark ? '#111827' : '#fbf8f2') : dark ? '#f8fafc' : '#1f2630',
            }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
