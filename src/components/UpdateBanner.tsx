import React, { useEffect, useState } from 'react';

/**
 * 新版本提示：部署新版後，已經開著網頁的手機／電腦會在 5 分鐘內（或切回這個分頁時）
 * 偵測到，畫面上方出現「系統已更新」，點一下就載入最新版。
 */
const currentBundle = () => (document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.getAttribute('src') || '';

export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = currentBundle();
    if (!mine) return; // 開發模式沒有打包檔，不檢查
    let stop = false;
    const check = async () => {
      try {
        const html = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store' }).then(r => r.text());
        const m = html.match(/\/assets\/index-[^"']+\.js/);
        if (!stop && m && !mine.endsWith(m[0])) setReady(true);
      } catch {
        /* 離線時略過 */
      }
    };
    const t = setInterval(check, 5 * 60_000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    const first = setTimeout(check, 20_000);
    return () => {
      stop = true;
      clearInterval(t);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  if (!ready) return null;
  return (
    <button type="button" onClick={() => window.location.reload()}
      className="fixed left-1/2 -translate-x-1/2 z-[300] px-5 min-h-[48px] rounded-full bg-sky-600 text-white text-[15px] font-black shadow-2xl flex items-center gap-2 whitespace-nowrap"
      style={{ top: 'calc(10px + env(safe-area-inset-top))' }}>
      🔄 系統已更新，點這裡載入最新版
    </button>
  );
}
