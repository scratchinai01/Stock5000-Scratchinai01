import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminFeedbackPanel } from './AdminFeedbackPanel';
import { X, Loader2, ShieldCheck, Download, LogOut, RefreshCw, Ban, CheckCircle2 } from 'lucide-react';

/**
 * 版主後台：查詢誰進入系統、登入紀錄、暫停帳號
 * 帳號密碼由伺服器驗證（密碼只以雜湊存在雲端設定），登入後取得 12 小時有效的權杖。
 */
interface Log { at: number; event: string; name: string; profileId: string; ip: string; device: string; ua: string }

const EVENT_LABEL: Record<string, { label: string; cls: string }> = {
  visit: { label: '進站', cls: 'bg-slate-100 text-slate-700' },
  login: { label: '登入', cls: 'bg-emerald-100 text-emerald-800' },
  register: { label: '註冊', cls: 'bg-sky-100 text-sky-800' },
  logout: { label: '登出', cls: 'bg-slate-200 text-slate-700' },
  login_failed: { label: '密碼錯誤', cls: 'bg-rose-100 text-rose-800' },
  blocked: { label: '暫停中被擋', cls: 'bg-orange-100 text-orange-800' },
  admin_login: { label: '版主登入', cls: 'bg-indigo-100 text-indigo-800' },
  admin_login_failed: { label: '版主登入失敗', cls: 'bg-rose-200 text-rose-900' },
};
const TOKEN_KEY = 'admin_access_token';
const fmt = (t: number) =>
  new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(t));
const dayKey = (t: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date(t));

function readToken() {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    const exp = Number(t.split('.')[1]);
    return exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export const AdminAccessModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ logs: Log[]; blocklist: string[]; truncated: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [section, setSection] = useState<'logs' | 'feedback'>(() => (typeof window !== 'undefined' && window.location.hash === '#feedback' ? 'feedback' : 'logs'));
  const [newFb, setNewFb] = useState<number | null>(null);
  const [ev, setEv] = useState<'people' | 'all' | 'login' | 'login_failed' | 'visit'>('people');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const logout = () => {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    setToken(null); setData(null);
  };

  const load = useCallback(async (tk: string, d: number) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/access-logs?days=${d}`, { headers: { Authorization: `Bearer ${tk}` } });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { logout(); setErr(j.error || '請重新登入'); return; }
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData({ logs: j.logs || [], blocklist: j.blocklist || [], truncated: Boolean(j.truncated) });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (isOpen && token) load(token, days); }, [isOpen, token, days, load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      try { sessionStorage.setItem(TOKEN_KEY, j.token); } catch { /* ignore */ }
      setPass('');
      setToken(j.token);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async (name: string, blocked: boolean) => {
    if (!token) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/blocklist', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, blocked }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { logout(); throw new Error('請重新登入'); }
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(d => (d ? { ...d, blocklist: j.blocklist } : d));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const logs = data?.logs ?? [];
  const blocked = useMemo(() => new Set((data?.blocklist ?? []).map(n => n.toLowerCase())), [data]);
  const kw = q.trim().toLowerCase();
  const match = (l: Log) => !kw || l.name.toLowerCase().includes(kw) || l.ip.includes(kw);

  const people = useMemo(() => {
    const m = new Map<string, { name: string; logins: number; registers: number; failed: number; first: number; last: number; days: Set<string>; device: string; ip: string }>();
    for (const l of logs) {
      if (!l.name || l.event.startsWith('admin') || l.event === 'visit') continue;
      const k = l.name.toLowerCase();
      const p = m.get(k) ?? { name: l.name, logins: 0, registers: 0, failed: 0, first: l.at, last: l.at, days: new Set<string>(), device: l.device, ip: l.ip };
      if (l.event === 'login') { p.logins++; p.days.add(dayKey(l.at)); }
      if (l.event === 'register') { p.registers++; p.days.add(dayKey(l.at)); }
      if (l.event === 'login_failed') p.failed++;
      if (l.at > p.last) { p.last = l.at; p.device = l.device; p.ip = l.ip; }
      if (l.at < p.first) p.first = l.at;
      m.set(k, p);
    }
    return [...m.values()].sort((a, b) => b.last - a.last);
  }, [logs]);

  const stats = useMemo(() => {
    const today = dayKey(Date.now());
    const entered = logs.filter(l => l.event === 'login' || l.event === 'register');
    return {
      visits: logs.filter(l => l.event === 'visit').length,
      entries: entered.length,
      uniq: new Set(entered.map(l => l.name.toLowerCase())).size,
      todayUniq: new Set(entered.filter(l => dayKey(l.at) === today).map(l => l.name.toLowerCase())).size,
      failed: logs.filter(l => l.event === 'login_failed').length,
      adminFailed: logs.filter(l => l.event === 'admin_login_failed').length,
    };
  }, [logs]);

  const shownLogs = logs.filter(l => (ev === 'all' || ev === 'people' || l.event === ev) && match(l)).slice(0, 500);

  const downloadCsv = () => {
    const rows = [['時間（台北）', '事件', '姓名', 'IP', '裝置', '瀏覽器資訊'], ...logs.filter(match).map(l => [fmt(l.at), EVENT_LABEL[l.event]?.label ?? l.event, l.name, l.ip, l.device, l.ua])];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `進站紀錄_${dayKey(Date.now())}_${days}天.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[160] flex items-end md:items-center justify-center bg-slate-950/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="版主後台" onClick={e => e.stopPropagation()}
        className="w-full md:w-[1040px] max-h-[94vh] overflow-y-auto bg-slate-50 rounded-t-[28px] md:rounded-[28px] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-2 px-5 py-4 bg-slate-900 text-white">
          <ShieldCheck className="w-6 h-6 text-amber-300" />
          <div className="text-[20px] font-black">版主後台</div>
          <div className="text-[12px] text-slate-300 hidden sm:block">查詢誰進入系統・登入紀錄・暫停帳號</div>
          <div className="ml-auto flex items-center gap-1">
            {token && <button type="button" onClick={logout} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white/10 hover:bg-white/20 flex items-center gap-1"><LogOut className="w-4 h-4" />登出版主</button>}
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10" aria-label="關閉"><X className="w-6 h-6" /></button>
          </div>
        </div>

        {!token ? (
          <form onSubmit={login} className="max-w-sm mx-auto p-6 space-y-3">
            <div className="text-sm text-slate-600">請輸入版主帳號與密碼。連續輸錯 5 次會暫停 15 分鐘，每次嘗試都會留下紀錄。</div>
            <label className="block text-sm font-bold text-slate-700">版主帳號
              <input value={user} onChange={e => setUser(e.target.value)} autoComplete="username" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base bg-white" />
            </label>
            <label className="block text-sm font-bold text-slate-700">密碼
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base bg-white" />
            </label>
            {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">{err}</div>}
            <button type="submit" disabled={busy || !pass} className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white font-black text-base disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}登入版主後台
            </button>
          </form>
        ) : (
          <>
          <div className="px-4 pt-4 grid grid-cols-2 gap-1">
            {([['logs', '📋 進站紀錄'], ['feedback', `🐞 問題回報${newFb ? `（${newFb} 則新）` : ''}`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSection(k)}
                className={`min-h-[44px] rounded-xl font-black text-[15px] border ${section === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>{l}</button>
            ))}
          </div>
          {section === 'feedback' ? (
            <AdminFeedbackPanel token={token} onUnauthorized={() => { logout(); setErr('請重新登入'); }} onCount={setNewFb} />
          ) : (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-slate-600">期間</span>
              {[1, 7, 30, 90].map(d => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-lg border font-bold ${days === d ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-white border-slate-200 text-slate-700'}`}>{d === 1 ? '今天起 24 小時' : `近 ${d} 天`}</button>
              ))}
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋姓名或 IP" className="ml-auto border border-slate-300 rounded-lg px-3 py-1.5 bg-white w-44" />
              <button type="button" onClick={() => token && load(token, days)} className="px-3 py-1.5 rounded-lg border bg-white font-bold flex items-center gap-1"><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />重新整理</button>
              <button type="button" onClick={downloadCsv} disabled={!logs.length} className="px-3 py-1.5 rounded-lg border bg-white font-bold flex items-center gap-1 disabled:opacity-50"><Download className="w-4 h-4" />下載 CSV</button>
            </div>
            {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">{err}</div>}
            {data?.truncated && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">紀錄超過 5,000 筆，只顯示最新的 5,000 筆，請縮短期間。</div>}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                ['進入人數（不重複）', stats.uniq, '期間內登入或註冊過的人'],
                ['今天進入人數', stats.todayUniq, '台北時間今天'],
                ['登入／註冊次數', stats.entries, ''],
                ['開啟網站次數', stats.visits, '含未登入的訪客'],
                ['學員密碼錯誤', stats.failed, ''],
                ['版主登入失敗', stats.adminFailed, '多次失敗請留意'],
              ].map(([label, v, sub]) => (
                <div key={label as string} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="text-[12px] font-bold text-slate-500">{label}</div>
                  <div className="text-2xl font-black font-mono">{(v as number).toLocaleString()}</div>
                  {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 text-sm">
              {([['people', '依人統計'], ['all', '全部紀錄'], ['login', '只看登入'], ['login_failed', '只看密碼錯誤'], ['visit', '只看進站']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setEv(id)}
                  className={`px-3 py-1.5 rounded-lg border font-bold ${ev === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700'}`}>{label}</button>
              ))}
            </div>

            {busy && !data && <div className="flex items-center gap-2 text-slate-600"><Loader2 className="w-4 h-4 animate-spin" />讀取中…</div>}

            {ev === 'people' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-500 text-left text-[12px]">{['姓名', '最後進入', '登入次數', '進入天數', '密碼錯誤', '最近裝置', '最近 IP', '狀態'].map(h => <th key={h} className="py-1.5 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>
                    {people.filter(p => !kw || p.name.toLowerCase().includes(kw) || p.ip.includes(kw)).map(p => {
                      const isB = blocked.has(p.name.toLowerCase());
                      return (
                        <tr key={p.name} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 font-black whitespace-nowrap">{p.name}{p.registers > 0 && <span className="ml-1 text-[11px] text-sky-700 font-bold">新註冊</span>}</td>
                          <td className="pr-3 font-mono whitespace-nowrap">{fmt(p.last)}</td>
                          <td className="pr-3 font-mono">{p.logins + p.registers}</td>
                          <td className="pr-3 font-mono">{p.days.size}</td>
                          <td className={`pr-3 font-mono ${p.failed ? 'text-rose-700 font-bold' : ''}`}>{p.failed}</td>
                          <td className="pr-3">{p.device}</td>
                          <td className="pr-3 font-mono text-[12px]">{p.ip}</td>
                          <td className="pr-3">
                            <button type="button" disabled={busy} onClick={() => toggleBlock(p.name, !isB)}
                              className={`px-2.5 py-1 rounded-lg text-[12px] font-bold border flex items-center gap-1 whitespace-nowrap ${isB ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                              {isB ? <><Ban className="w-3.5 h-3.5" />已暫停・點此恢復</> : <><CheckCircle2 className="w-3.5 h-3.5" />正常・點此暫停</>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!people.length && <tr><td colSpan={8} className="py-6 text-center text-slate-400">這段期間還沒有人登入</td></tr>}
                  </tbody>
                </table>
                {(data?.blocklist?.length ?? 0) > 0 && (
                  <div className="mt-3 text-[12px] text-slate-600">
                    目前暫停中：{data!.blocklist.map(n => (
                      <button key={n} type="button" onClick={() => toggleBlock(n, false)} className="ml-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold">{n} ✕</button>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[11px] text-slate-400">暫停後，該姓名無法登入或用同名重新註冊；已經登入中的人，下次登入時生效。</div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-500 text-left text-[12px]">{['時間（台北）', '事件', '姓名', 'IP', '裝置'].map(h => <th key={h} className="py-1.5 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>
                    {shownLogs.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100" title={l.ua}>
                        <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{fmt(l.at)}</td>
                        <td className="pr-3"><span className={`px-2 py-0.5 rounded-full text-[12px] font-bold whitespace-nowrap ${EVENT_LABEL[l.event]?.cls ?? ''}`}>{EVENT_LABEL[l.event]?.label ?? l.event}</span></td>
                        <td className="pr-3 font-bold">{l.name || <span className="text-slate-400 font-normal">（未登入）</span>}</td>
                        <td className="pr-3 font-mono text-[12px]">{l.ip}</td>
                        <td className="pr-3">{l.device}</td>
                      </tr>
                    ))}
                    {!shownLogs.length && <tr><td colSpan={5} className="py-6 text-center text-slate-400">沒有符合的紀錄</td></tr>}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] text-slate-400">最多顯示 500 筆；完整資料請下載 CSV。滑鼠停在列上可看瀏覽器資訊。</div>
              </div>
            )}
            <div className="text-[11px] text-slate-500">紀錄從本功能上線後開始累積；姓名是學員登入時輸入的操盤手姓名。IP 為連線位址，可能是學校或電信業者的共用位址。</div>
          </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};
