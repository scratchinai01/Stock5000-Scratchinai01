import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Download, X } from 'lucide-react';

/**
 * 教學卡片視窗（型態選股、下跌預警共用）：卡片區塊可下載成 PNG。
 * 下載固定用 720px 寬，手機和電腦存下來的卡片長得一樣；手機會開啟分享選單，可存到相簿。
 */
export const PAPER = '#fbf8f2';
export const COPYRIGHT = '© 版權所有 智慧未來領袖學苑';
export const DESIGNER = '系統設計暨執行長 程瑋翔｜LINE ID：snake0203cheng';
export const INK = '#1f2630';

export function StudyCardModal({ title, filename, onClose, children }: { title: string; filename: string; onClose: () => void; children: React.ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    setMsg(null);
    const prev = node.style.width;
    // 「尊長超大」等字體設定會放大整頁的間距（rem），下載時暫時還原成標準大小，卡片排版才不會被擠壞
    const root = document.documentElement;
    const prevRoot = root.style.fontSize;
    try {
      root.style.fontSize = '16px';
      node.style.width = '720px';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: PAPER, skipFonts: true, filter: n => !(n instanceof HTMLElement && n.dataset.noexport === '1') });
      node.style.width = prev;
      root.style.fontSize = prevRoot;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await nav.share({ files: [file], title });
        setMsg('已開啟分享，可以選「儲存影像」存到相簿。');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setMsg(`已下載：${filename}`);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setMsg(`下載失敗：${e?.message || e}`);
    } finally {
      node.style.width = prev;
      root.style.fontSize = prevRoot;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center" style={{ background: 'rgba(10,14,20,0.62)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className="w-full md:w-[820px] h-[94dvh] md:h-auto md:max-h-[92vh] rounded-t-[28px] md:rounded-[28px] overflow-hidden flex flex-col shadow-2xl" style={{ background: PAPER }}>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div ref={cardRef} style={{ background: PAPER, color: INK, fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif" }}>
            {children}
          </div>
        </div>
        <div className="shrink-0 border-t p-3 flex flex-wrap items-center gap-2" style={{ borderColor: '#e6dfd1', background: '#fffdf8' }}>
          <button type="button" onClick={download} disabled={busy} className="flex-1 min-h-[56px] rounded-full text-[20px] font-black text-white disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: INK }}>
            <Download className="w-6 h-6" />{busy ? '製作圖片中…' : '下載這張教學卡片'}
          </button>
          <button type="button" onClick={onClose} className="min-h-[56px] px-6 rounded-full text-[18px] font-black border-2 flex items-center gap-1" style={{ borderColor: INK, color: INK }}>
            <X className="w-5 h-5" />關閉
          </button>
          {msg && <div className="w-full text-[15px] text-slate-600">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

/** 卡片內的小標題區段 */
export function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="text-[21px] font-black" style={{ color: INK, whiteSpace: 'nowrap', flexShrink: 0 }}>{title}</span>
        <span className="flex-1 h-px" style={{ background: '#e6dfd1', minWidth: 24 }} />
      </div>
      {children}
    </div>
  );
}

export const CardStat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="bg-white border rounded-2xl px-3.5 py-2.5 flex flex-col gap-0.5 min-w-0" style={{ borderColor: '#e6dfd1' }}>
    <span className="text-[15px] font-bold text-slate-600">{label}</span>
    <span className="text-[21px] font-extrabold font-mono break-all" style={{ color: color || INK }}>{value}</span>
  </div>
);

export const cardNow = () =>
  new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

export const CardFooter = ({ note }: { note: string }) => (
  <div className="px-6 pb-6 pt-2 space-y-2">
    <div className="text-[14px] leading-relaxed text-slate-500">{note}</div>
    <div className="flex items-center justify-between gap-3 text-[14px] text-slate-500 border-t pt-2" style={{ borderColor: '#e6dfd1' }}>
      <span style={{ whiteSpace: 'nowrap' }}>📈 5000萬股市大富翁 · 教學用途</span>
      <span className="font-mono" style={{ whiteSpace: 'nowrap' }}>製卡 {cardNow()}</span>
    </div>
    <div className="rounded-xl px-3 py-2 text-[14px] leading-relaxed text-center" style={{ background: '#f4efe4', color: '#4b5563' }}>
      <div className="font-black" style={{ color: INK }}>{COPYRIGHT}</div>
      <div>{DESIGNER}</div>
    </div>
  </div>
);
