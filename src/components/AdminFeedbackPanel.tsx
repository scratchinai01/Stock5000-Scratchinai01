import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthImage, FEEDBACK_STATUS } from './FeedbackModal';

/** 版主後台：問題回報清單（看截圖、改狀態、回覆學員） */
const fmt = (t: number) =>
  new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));

export function AdminFeedbackPanel({ token, onUnauthorized, onCount }: { token: string; onUnauthorized: () => void; onCount?: (n: number) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('open');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const cb = useRef({ onUnauthorized, onCount });
  cb.current = { onUnauthorized, onCount };

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch('/api/admin/feedback', { headers });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return cb.current.onUnauthorized();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setList(j.list);
      cb.current.onCount?.(j.list.filter((f: any) => f.status === 'new').length);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: { status?: string; reply?: string }) => {
    setSaving(id);
    try {
      const r = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || '更新失敗');
      setList(prev => {
        const next = (prev || []).map(f => (f.id === id ? j.feedback : f));
        cb.current.onCount?.(next.filter(f => f.status === 'new').length);
        return next;
      });
      if (patch.reply !== undefined) setDrafts(d => { const n = { ...d }; delete n[id]; return n; });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(null);
    }
  };

  const shown = (list || []).filter(f => (filter === 'all' ? true : filter === 'done' ? f.status === 'done' : f.status !== 'done'));
  const counts = { open: (list || []).filter(f => f.status !== 'done').length, done: (list || []).filter(f => f.status === 'done').length, all: list?.length || 0 };

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {([['open', '未解決'], ['done', '已解決'], ['all', '全部']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg border font-bold ${filter === k ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-white border-slate-200 text-slate-700'}`}>{l}（{counts[k]}）</button>
        ))}
        <button type="button" onClick={load} className="ml-auto px-3 py-1.5 rounded-lg border bg-white font-bold">重新整理</button>
      </div>
      {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">{err}</div>}
      {list === null && !err && <div className="text-slate-500">讀取中…</div>}
      {list && shown.length === 0 && <div className="py-10 text-center text-slate-400">沒有回報</div>}
      {shown.map(f => {
        const draft = drafts[f.id] ?? f.reply ?? '';
        return (
          <div key={f.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-black ${FEEDBACK_STATUS[f.status]?.cls}`}>{FEEDBACK_STATUS[f.status]?.label}</span>
              <b className="text-[16px]">{f.name}</b>
              {!f.loggedIn && <span className="text-[12px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">未登入時回報</span>}
              <span className="text-[14px] font-bold text-slate-600">{f.category}</span>
              <span className="ml-auto text-[13px] text-slate-500 font-mono">{fmt(f.createdAt)}</span>
            </div>
            <div className="text-[15px] whitespace-pre-wrap leading-relaxed">{f.text}</div>
            {f.imageIds?.length > 0 && (
              <div className="flex gap-2 flex-wrap">{f.imageIds.map((id: string) => <AuthImage key={id} id={id} headers={headers} className="w-40 h-28 rounded-lg border" />)}</div>
            )}
            <div className="text-[12px] text-slate-500 leading-relaxed">
              頁面：{f.page || '—'}｜裝置：{f.device || '—'}｜版本：{f.version || '—'}{f.contact ? `｜聯絡：${f.contact}` : ''}
            </div>
            <textarea value={draft} onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))} rows={2} placeholder="回覆學員（學員在「問題回報 → 我的回報與回覆」看得到）"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-[14px]" />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={saving === f.id || draft === (f.reply || '')} onClick={() => update(f.id, { reply: draft, ...(f.status === 'new' && draft ? { status: 'doing' } : {}) })}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-sm disabled:opacity-40">儲存回覆</button>
              {(['new', 'doing', 'done'] as const).map(s => (
                <button key={s} type="button" disabled={saving === f.id || f.status === s} onClick={() => update(f.id, { status: s })}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-sm disabled:opacity-40 ${f.status === s ? 'bg-amber-100 border-amber-300' : 'bg-white'}`}>標為{FEEDBACK_STATUS[s].label}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
