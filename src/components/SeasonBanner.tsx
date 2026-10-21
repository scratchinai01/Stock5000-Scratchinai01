import React, { useEffect, useState } from 'react';

/**
 * 全體還原公告：
 * - 還原前 3 天內：提醒「測試期將於 …結束，所有人還原 5,000 萬」
 * - 還原後 2 天內：公告「正式競賽已開始」
 * - 伺服器回報資料已被統一還原時（舊裝置還留著舊資料），自動重新載入
 */
interface Reset { id: string; at: number; label: string; done: boolean }
const fmt = (ms: number) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

export function SeasonBanner() {
  const [r, setR] = useState<Reset | null>(null);
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState<string | null>(() => {
    try { return localStorage.getItem('season_banner_hidden'); } catch { return null; }
  });
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const load = () => fetch('/api/season', { cache: 'no-store' }).then(x => x.json()).then(j => {
      const list: Reset[] = j?.resets || [];
      const t = Date.now();
      setR(list.find(x => t < x.at && x.at - t < 3 * 86400_000) || list.find(x => t >= x.at && t - x.at < 2 * 86400_000) || null);
    }).catch(() => {});
    load();
    const a = setInterval(load, 60_000);
    const b = setInterval(() => setNow(Date.now()), 30_000);
    const onReset = () => {
      setReloading(true);
      setTimeout(() => window.location.reload(), 2500);
    };
    window.addEventListener('season-reset', onReset);
    return () => { clearInterval(a); clearInterval(b); window.removeEventListener('season-reset', onReset); };
  }, []);

  if (reloading) {
    return (
      <div className="fixed inset-x-0 top-0 z-[310] flex justify-center p-3">
        <div className="max-w-[560px] w-full rounded-2xl bg-slate-900 text-white px-4 py-3 text-[15px] font-black shadow-2xl text-center">
          🏁 版主已將所有人資產還原為 NT$5,000萬，正在載入最新資料…
        </div>
      </div>
    );
  }
  if (!r) return null;
  const phase = now < r.at ? 'before' : 'after';
  const key = `${r.id}:${phase}`;
  if (hidden === key) return null;
  const hide = () => { setHidden(key); try { localStorage.setItem('season_banner_hidden', key); } catch { /* ignore */ } };
  return (
    <div className="fixed inset-x-0 bottom-0 z-[95] flex justify-center px-3 pointer-events-none" style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom))' }}>
      <div className={`pointer-events-auto max-w-[620px] w-full rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3 ${phase === 'before' ? 'bg-amber-50 border-2 border-amber-400 text-amber-950' : 'bg-emerald-50 border-2 border-emerald-500 text-emerald-950'}`}>
        <div className="flex-1 text-[14px] leading-relaxed">
          {phase === 'before' ? (
            <>📣 <b>測試期將於 {fmt(r.at)} 結束</b>：屆時所有人的資產一律還原為 <b>NT$5,000萬</b>，持倉、交易紀錄清空，未成交委託取消，<b>正式競賽開始</b>。帳號與密碼不變。</>
          ) : (
            <>🏁 <b>正式競賽已開始</b>（{fmt(r.at)} 起）：所有人都從 <b>NT$5,000萬</b> 重新出發，帳號與密碼不變。祝大家操盤順利！</>
          )}
        </div>
        <button type="button" onClick={hide} aria-label="關閉公告" className="shrink-0 w-8 h-8 rounded-full text-[16px] font-black opacity-70 hover:opacity-100">✕</button>
      </div>
    </div>
  );
}
