import React, { useEffect, useState } from 'react';

/** 忘記密碼：顯示密碼的第一個字和最後一個字（由伺服器提供，網頁拿不到完整密碼） */
export function PasswordHint({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ hint?: string | null; note?: string; error?: string } | null>(null);
  useEffect(() => setRes(null), [name]);

  const ask = async () => {
    if (!name.trim()) {
      setRes({ error: '請先在上面輸入你的姓名' });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/players/hint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
      const j = await r.json().catch(() => ({}));
      setRes(j.ok ? { hint: j.hint, note: j.note } : { error: j.error || '查詢失敗' });
    } catch {
      setRes({ error: '無法連線到伺服器，請稍後再試' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-left">
      <button type="button" onClick={ask} disabled={busy} className="text-[13px] font-bold text-sky-700 hover:text-sky-900 underline underline-offset-2 cursor-pointer disabled:opacity-60">
        {busy ? '查詢中…' : '🔑 忘記密碼？看密碼提示'}
      </button>
      {res && (
        <div className={`mt-1.5 rounded-xl border px-3 py-2 text-[13px] leading-relaxed ${res.error ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-sky-50 border-sky-200 text-sky-900'}`}>
          {res.error ? (
            res.error
          ) : res.hint ? (
            <>
              密碼提示：<b className="font-mono text-[16px] tracking-wider">{res.hint}</b>
              <div className="text-[12px] text-sky-800/80">只顯示第一個字和最後一個字（密碼少於 5 個字只顯示第一個字），中間的字數不代表實際長度。</div>
            </>
          ) : null}
          {res.note && <div className="mt-0.5">{res.note}</div>}
          {!res.error && <div className="text-[12px] text-slate-500 mt-0.5">還是想不起來？請洽版主重設密碼。</div>}
        </div>
      )}
    </div>
  );
}
