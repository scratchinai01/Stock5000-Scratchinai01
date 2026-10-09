import { useEffect, useState } from 'react';

/** 名詞小學堂的字級（標準／大／特大），存在瀏覽器，清單與名詞卡共用 */
export const READING_SCALES = [
  { id: 'm', label: '標準', zoom: 1 },
  { id: 'l', label: '大', zoom: 1.15 },
  { id: 'xl', label: '特大', zoom: 1.3 },
] as const;
export type ReadingScaleId = (typeof READING_SCALES)[number]['id'];

const KEY = 'glossary_reading_scale_v1';
const EVT = 'glossary-reading-scale';

function read(): ReadingScaleId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'm' || v === 'l' || v === 'xl') return v;
  } catch {
    /* ignore */
  }
  return 'l'; // 預設「大」，長輩也能讀
}

export function useReadingScale() {
  const [id, setId] = useState<ReadingScaleId>(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const set = (v: ReadingScaleId) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    setId(v);
    window.dispatchEvent(new Event(EVT));
  };
  const zoom = READING_SCALES.find(s => s.id === id)?.zoom ?? 1;
  return { id, zoom, set };
}
