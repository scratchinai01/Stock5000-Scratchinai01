import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playerHeaders } from '../services/playerSession';

/**
 * 問題回報：文字說明＋截圖（點選、拖曳、Ctrl+V 貼上、擷取目前畫面）
 * 會一併送出目前頁面、裝置與版本，方便版主重現問題。
 */
export const FEEDBACK_CATEGORIES = ['下單／成交', '資產／排行計算', '報價／資料', '登入／密碼', '畫面顯示', '建議', '其他'];
const MAX_IMAGES = 3;
const MAX_CHARS = 650 * 1024 * 1.37;

export const FEEDBACK_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: '已收到', cls: 'bg-sky-100 text-sky-800' },
  doing: { label: '處理中', cls: 'bg-amber-100 text-amber-800' },
  done: { label: '已解決', cls: 'bg-emerald-100 text-emerald-800' },
};

const fmtTime = (t: number) =>
  new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));

/** 把圖片壓成 JPEG（最長邊 1600，必要時再降畫質與尺寸），回傳 data URL */
export async function compressImage(src: Blob | string): Promise<string> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('這個檔案不是圖片，或圖片已損壞'));
      i.src = url;
    });
    let max = 1600;
    let q = 0.82;
    for (let n = 0; n < 8; n++) {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', q);
      if (out.length <= MAX_CHARS) return out;
      if (q > 0.55) q -= 0.12;
      else max = Math.round(max * 0.8);
    }
    throw new Error('圖片太大，請改用較小的截圖');
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}

function deviceText() {
  const d = document.documentElement.dataset;
  const kind = d.device === 'phone' ? '手機' : d.device === 'tablet' ? '平板' : '電腦';
  return `${kind}｜${window.innerWidth}×${window.innerHeight}｜${d.ui === 'mobile' ? '手機版介面' : '電腦版介面'}`;
}
function versionText() {
  const s = [...document.querySelectorAll('script[src]')].map(x => x.getAttribute('src') || '').find(x => /assets\/index-/.test(x));
  return s ? s.replace(/^.*index-/, '').replace(/\.js$/, '') : '';
}

/** 帶權杖讀取截圖（img 標籤無法帶標頭，改用 blob 網址） */
export function AuthImage({ id, headers, className }: { id: string; headers: Record<string, string> | null; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    fetch(`/api/feedback/image/${encodeURIComponent(id)}`, { headers: headers || {} })
      .then(r => (r.ok ? r.blob() : Promise.reject()))
      .then(b => { if (!alive) return; url = URL.createObjectURL(b); setSrc(url); })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (failed) return <div className={`${className} flex items-center justify-center bg-slate-100 text-[12px] text-slate-500`}>截圖讀取失敗</div>;
  if (!src) return <div className={`${className} bg-slate-100 animate-pulse`} />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title="點一下看大圖">
      <img src={src} alt="截圖" className={`${className} object-cover`} />
    </a>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 已登入的學員姓名；未登入為 null（要自己填姓名） */
  studentName: string | null;
  /** 目前所在的頁面，例如「資產儀表板」 */
  page: string;
}

export const FeedbackModal: React.FC<Props> = ({ isOpen, onClose, studentName, page }) => {
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [mine, setMine] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headers = studentName ? playerHeaders(studentName) : null;

  const addFiles = useCallback(async (files: (File | Blob)[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { setErr('只能上傳圖片（截圖、照片）'); return; }
    setErr(null);
    setBusy('處理截圖中…');
    try {
      const out: string[] = [];
      for (const f of imgs) out.push(await compressImage(f));
      setImages(prev => {
        const next = [...prev, ...out].slice(0, MAX_IMAGES);
        if (prev.length + out.length > MAX_IMAGES) setErr(`最多 ${MAX_IMAGES} 張，多的已略過`);
        return next;
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }, []);

  // Ctrl+V／⌘V 貼上截圖
  useEffect(() => {
    if (!isOpen || tab !== 'new') return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[];
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); };
  }, [isOpen, tab, addFiles, busy, onClose]);

  const loadMine = useCallback(async () => {
    if (!headers) return;
    try {
      const r = await fetch('/api/feedback/mine', { headers });
      const j = await r.json();
      setMine(j.ok ? j.list : []);
    } catch { setMine([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentName]);
  useEffect(() => { if (isOpen && tab === 'mine') loadMine(); }, [isOpen, tab, loadMine]);
  useEffect(() => { if (isOpen) { setSent(null); setErr(null); } }, [isOpen]);

  // 擷取目前畫面（先把回報視窗藏起來）
  const capture = async () => {
    if (images.length >= MAX_IMAGES) { setErr(`最多 ${MAX_IMAGES} 張`); return; }
    setErr(null);
    setHidden(true);
    try {
      await new Promise(r => setTimeout(r, 250));
      const { toJpeg } = await import('html-to-image');
      const raw = await toJpeg(document.body, {
        quality: 0.85,
        pixelRatio: 1,
        backgroundColor: '#ffffff',
        width: window.innerWidth,
        height: window.innerHeight,
        style: { transform: `translateY(-${window.scrollY}px)` },
        filter: n => !(n instanceof HTMLElement && n.dataset.feedbackModal === '1'),
      });
      setHidden(false);
      setBusy('處理截圖中…');
      const small = await compressImage(raw);
      setImages(prev => [...prev, small].slice(0, MAX_IMAGES));
    } catch {
      setErr('這台裝置無法自動擷取畫面，請改用手機／電腦的截圖功能後再上傳');
    } finally {
      setHidden(false);
      setBusy(null);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!studentName && !name.trim()) return setErr('請填寫你的姓名');
    if (!category) return setErr('請選一個問題類型');
    if (text.trim().length < 4) return setErr('請簡單描述遇到的問題');
    setBusy('送出中…');
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        body: JSON.stringify({ name: studentName || name, category, text, contact, images, page, device: deviceText(), version: versionText() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `送出失敗（${r.status}）`);
      setSent(j.feedback.id);
      setText(''); setImages([]); setCategory(''); setContact('');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!isOpen) return null;
  return (
    <div data-feedback-modal="1" className={`fixed inset-0 z-[170] flex items-end sm:items-center justify-center bg-slate-950/60 ${hidden ? 'invisible' : ''}`} onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="問題回報" onClick={e => e.stopPropagation()}
        className="w-full sm:w-[600px] max-h-[94vh] overflow-y-auto bg-white text-slate-900 rounded-t-[28px] sm:rounded-[28px] shadow-2xl"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="sticky top-0 z-10 bg-white px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[24px]">🐞</span>
            <div className="text-[20px] font-black">問題回報</div>
            <button type="button" onClick={onClose} aria-label="關閉" className="ml-auto w-10 h-10 rounded-full border border-slate-200 text-[18px]">✕</button>
          </div>
          {studentName && (
            <div className="mt-3 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
              {([['new', '我要回報'], ['mine', '我的回報與回覆']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`min-h-[40px] rounded-xl text-[15px] font-black ${tab === k ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {tab === 'mine' ? (
          <div className="p-5 space-y-3">
            {mine === null && <div className="text-slate-500">讀取中…</div>}
            {mine?.length === 0 && <div className="text-slate-500 py-8 text-center">還沒有回報紀錄。</div>}
            {mine?.map(f => (
              <div key={f.id} className="rounded-2xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-black ${FEEDBACK_STATUS[f.status]?.cls}`}>{FEEDBACK_STATUS[f.status]?.label}</span>
                  <span className="text-[14px] font-bold text-slate-700">{f.category}</span>
                  <span className="ml-auto text-[13px] text-slate-500">{fmtTime(f.createdAt)}</span>
                </div>
                <div className="text-[15px] whitespace-pre-wrap leading-relaxed">{f.text}</div>
                {f.imageIds?.length > 0 && (
                  <div className="flex gap-2">{f.imageIds.map((id: string) => <AuthImage key={id} id={id} headers={headers} className="w-20 h-20 rounded-lg border" />)}</div>
                )}
                {f.reply ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-[15px] leading-relaxed">
                    <b className="text-emerald-800">版主回覆</b>{f.repliedAt ? <span className="text-[12px] text-emerald-700">（{fmtTime(f.repliedAt)}）</span> : null}
                    <div className="whitespace-pre-wrap mt-1">{f.reply}</div>
                  </div>
                ) : (
                  <div className="text-[13px] text-slate-500">版主回覆後會顯示在這裡。</div>
                )}
              </div>
            ))}
          </div>
        ) : sent ? (
          <div className="p-6 space-y-4 text-center">
            <div className="text-[48px]">✅</div>
            <div className="text-[20px] font-black">已收到你的回報，謝謝！</div>
            <div className="text-[15px] text-slate-600">回報編號 <b className="font-mono">{sent}</b>。{studentName ? '版主回覆後，可以在「我的回報與回覆」看到。' : '登入後可在「問題回報 → 我的回報與回覆」看到版主回覆。'}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSent(null)} className="min-h-[50px] rounded-2xl border-2 border-slate-200 font-black">再回報一個</button>
              <button type="button" onClick={onClose} className="min-h-[50px] rounded-2xl bg-slate-900 text-white font-black">關閉</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {!studentName && (
              <label className="block">
                <div className="text-[15px] font-black mb-1">你的姓名 <span className="text-rose-600">*</span></div>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="登入用的姓名"
                  className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 px-3 text-[16px] focus:border-amber-500 outline-none" />
              </label>
            )}

            <div>
              <div className="text-[15px] font-black mb-1.5">問題類型 <span className="text-rose-600">*</span></div>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_CATEGORIES.map(c => (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className={`min-h-[40px] px-3 rounded-full border-2 text-[14px] font-bold ${category === c ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-700'}`}>{c}</button>
                ))}
              </div>
            </div>

            <label className="block">
              <div className="text-[15px] font-black mb-1">發生什麼事？ <span className="text-rose-600">*</span></div>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={3000}
                placeholder={'例如：\n我做了什麼：買 2330 一張，限價 1,050\n看到什麼：一直顯示委託中\n我以為會怎樣：應該馬上成交'}
                className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-[16px] leading-relaxed focus:border-amber-500 outline-none" />
            </label>

            <div>
              <div className="text-[15px] font-black mb-1">截圖（最多 {MAX_IMAGES} 張，可不附）</div>
              <div
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}
                onClick={() => images.length < MAX_IMAGES && fileRef.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                className={`rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer transition ${drag ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                <div className="text-[32px]">📷</div>
                <div className="text-[16px] font-black text-slate-800">點這裡選擇截圖</div>
                <div className="text-[13px] text-slate-500 mt-0.5">
                  <span className="hidden sm:inline">也可以把圖片拖進來，或直接按 Ctrl+V（Mac：⌘+V）貼上</span>
                  <span className="sm:hidden">從相簿選擇手機截圖</span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
              </div>
              <button type="button" onClick={capture} disabled={!!busy || images.length >= MAX_IMAGES}
                className="mt-2 w-full min-h-[44px] rounded-xl border-2 border-slate-200 text-[15px] font-bold text-slate-700 disabled:opacity-50">
                📸 直接擷取目前畫面
              </button>
              {images.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {images.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt={`截圖 ${i + 1}`} className="w-24 h-24 object-cover rounded-xl border border-slate-200" />
                      <button type="button" aria-label={`移除截圖 ${i + 1}`} onClick={() => setImages(prev => prev.filter((_, k) => k !== i))}
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-slate-900 text-white text-[13px]">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block">
              <div className="text-[15px] font-black mb-1">聯絡方式（選填）</div>
              <input value={contact} onChange={e => setContact(e.target.value)} maxLength={100} placeholder="Email 或 LINE ID，需要時版主會聯絡你"
                className="w-full min-h-[48px] rounded-xl border-2 border-slate-200 px-3 text-[16px] focus:border-amber-500 outline-none" />
            </label>

            <div className="text-[12.5px] text-slate-500 leading-relaxed rounded-xl bg-slate-50 p-3">
              會一併送出：目前頁面「{page}」、裝置（{deviceText()}）與系統版本，方便版主找出問題。請不要在截圖或說明裡放密碼。
            </div>
            {err && <div className="text-[15px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">❌ {err}</div>}
            <button type="button" onClick={submit} disabled={!!busy}
              className="w-full min-h-[56px] rounded-full bg-slate-900 text-white text-[18px] font-black disabled:opacity-60">
              {busy || '送出回報'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
