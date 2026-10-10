import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * 循環股學習研究（教學實驗）：讀取排程工作算好的結果
 *   /api/learn/study        研究名單：單檔訓練 vs 同產業合併訓練
 *   /api/learn/cyclicality  全市場：歷史波段循環最明顯的股票
 */
type V = { train: number | null; test: number | null; cagr: number | null; mdd: number | null; sharpe: number | null; trades?: number; exposure?: number | null };
interface Round {
  name: string; trainFrom: string; trainTo: string; testFrom: string; testTo: string; trainYears: number | null;
  raw: V; smooth: V; bench: V;
  cycle: { acc: number | null; baseAcc: number | null; auc: number | null; troughLag: number | null; peakLag: number | null; turns: number; detected: number };
}
interface StudyStock {
  id: string; name: string; industry: string; group: string; first: string; last: string;
  cycles: { cycles: number; avgYears: number | null; avgRise: number | null; avgFall: number | null };
  single: Round[]; pooled: Round[]; singleWarnings: string[];
}
interface Weight { name: string; w: number }
interface Group {
  key: string; label: string; desc: string; ids: string[];
  pooledMembers: { name: string; members: number }[];
  weights: { round: string; pos: Weight[]; neg: Weight[] } | null;
  cycleWeights: { pos: Weight[]; neg: Weight[] } | null;
}
interface Study { asOf: string; generatedAt: string; options: { theta: number; kappa: number; smooth: number; split1: number; split2: number }; groups: Group[]; stocks: StudyStock[] }
interface Cyc {
  asOf: string; theta: number; total: number; skippedBad?: number; skippedThin?: number;
  top: { id: string; name: string; industry: string; years: number; cycles: number; perDecade: number; avgYears: number | null; regularity?: number | null; avgRise: number | null; avgFall: number | null; avgValue?: number }[];
  industries: { industry: string; stocks: number; perDecade: number; avgRise: number }[];
}

const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`);
const f1 = (x: number | null | undefined) => (x === null || x === undefined || !isFinite(x) ? '—' : x.toFixed(1));
const signed = (x: number | null | undefined) => (x === null || x === undefined || !isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}`);
const tone = (x: number | null | undefined) => (x === null || x === undefined || !isFinite(x) || x === 0 ? 'text-slate-600' : x > 0 ? 'text-rose-600' : 'text-emerald-600');
const mean = (a: (number | null | undefined)[]) => { const b = a.filter((x): x is number => x !== null && x !== undefined && isFinite(x)); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
const median = (a: (number | null | undefined)[]) => { const b = a.filter((x): x is number => x !== null && x !== undefined && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

type Mode = 'single' | 'pooled';
const ROUNDS = ['第一階段', '第二階段'];

function summarize(stocks: StudyStock[], mode: Mode, round: string) {
  const rs = stocks.map(s => (mode === 'single' ? s.single : s.pooled).find(r => r.name === round)).filter((r): r is Round => !!r);
  if (!rs.length) return null;
  return {
    n: rs.length,
    edgeRaw: mean(rs.map(r => (r.raw.test ?? NaN) - (r.bench.test ?? NaN))),
    edgeSmooth: mean(rs.map(r => (r.smooth.test ?? NaN) - (r.bench.test ?? NaN))),
    beatSharpe: rs.filter(r => (r.smooth.sharpe ?? -9) > (r.bench.sharpe ?? 9)).length,
    mddGain: mean(rs.map(r => (r.smooth.mdd ?? NaN) - (r.bench.mdd ?? NaN))),
    acc: mean(rs.map(r => r.cycle.acc)),
    baseAcc: mean(rs.map(r => r.cycle.baseAcc)),
    troughLag: median(rs.map(r => r.cycle.troughLag)),
  };
}

export const LearnStudy: React.FC<{ onOpenSymbol: (sym: string) => void }> = ({ onOpenSymbol }) => {
  const [study, setStudy] = useState<Study | null>(null);
  const [cyc, setCyc] = useState<Cyc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>('shipping');

  useEffect(() => {
    let off = false;
    const get = (u: string) => fetch(u).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; });
    Promise.allSettled([get('/api/learn/study'), get('/api/learn/cyclicality')]).then(([a, b]) => {
      if (off) return;
      if (a.status === 'fulfilled') setStudy(a.value); else setErr(a.reason?.message || '讀取失敗');
      if (b.status === 'fulfilled') setCyc(b.value);
      setLoading(false);
    });
    return () => { off = true; };
  }, []);

  const byGroup = useMemo(() => {
    const m = new Map<string, StudyStock[]>();
    for (const s of study?.stocks ?? []) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return m;
  }, [study]);

  if (loading) return <div className="flex items-center gap-2 text-slate-600 text-sm"><Loader2 className="w-4 h-4 animate-spin" />讀取研究結果中…</div>;
  if (err || !study) return <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm"><AlertTriangle className="w-4 h-4" />{err || '研究結果尚未產生'}</div>;
  const o = study.options;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <div className="font-black text-base">循環股學習研究（強化學習實驗）</div>
        <div className="text-xs text-slate-600 leading-relaxed">
          問題：強化學習在哪一類股票最有用？研究名單涵蓋記憶體、面板、航運、鋼鐵、塑化五個景氣循環產業，並以台積電、中華電當對照組。
          每檔都做兩階段前進式驗證（訓練到 {o.split1 - 1} 年 → 推測 {o.split1}～{o.split2 - 1} 年；訓練到 {o.split2 - 1} 年 → 推測 {o.split2} 年至今），
          同時學<b>循環辨識</b>（漲跌 ≥ {Math.round(o.theta * 100)}% 才算一次轉折）與<b>交易決策</b>（下跌損失 × {1 + o.kappa} 倍的風險調整獎勵），
          並比較<b>單檔訓練</b>與<b>同產業合併訓練</b>（樣本較多、較不易過度配適）。
        </div>
        <div className="text-[11px] text-slate-500">資料日 {study.asOf}；扣除手續費 0.1425% 與證交稅 0.3%。分數為 100 分制（100 = 每天事先知道漲跌、只做多）。</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
        <div className="font-black text-sm mb-1">產業總覽：模型比買進持有好多少？</div>
        <div className="text-[11px] text-slate-500 mb-2">
          分數差 = 推測期分數 − 買進持有分數（正數 = 贏）。回撤改善 = 平滑版最大回撤 − 買進持有最大回撤（正數 = 跌得比較少）。循環準確率要高於「樸素基準」（只看最近一次確認的波段方向）才算真的學到東西。
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-slate-500 text-left">{['產業', '訓練方式', '階段', '檔數', '分數差（原始）', '分數差（平滑）', '夏普贏過持有', '回撤改善', '循環準確率', '樸素基準', '低點延遲'].map(h => <th key={h} className="py-1 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {study.groups.flatMap(g => (['single', 'pooled'] as Mode[]).flatMap(mode => ROUNDS.map(rn => {
              const st = summarize(byGroup.get(g.key) ?? [], mode, rn);
              if (!st) return null;
              return (
                <tr key={g.key + mode + rn} className={`border-t border-slate-100 font-mono ${mode === 'pooled' ? 'bg-indigo-50/50' : ''}`}>
                  <td className="py-1 pr-3 font-sans font-black whitespace-nowrap">{g.label}</td>
                  <td className="pr-3 font-sans whitespace-nowrap">{mode === 'single' ? '單檔' : '同產業合併'}</td>
                  <td className="pr-3 font-sans whitespace-nowrap">{rn}</td>
                  <td className="pr-3">{st.n}</td>
                  <td className={`pr-3 ${tone(st.edgeRaw)}`}>{signed(st.edgeRaw)}</td>
                  <td className={`pr-3 font-bold ${tone(st.edgeSmooth)}`}>{signed(st.edgeSmooth)}</td>
                  <td className="pr-3">{st.beatSharpe}／{st.n}</td>
                  <td className={`pr-3 ${tone(st.mddGain)}`}>{pct(st.mddGain)}</td>
                  <td className={`pr-3 ${(st.acc ?? 0) > (st.baseAcc ?? 1) ? 'text-rose-600 font-bold' : ''}`}>{st.acc === null ? '—' : `${(st.acc * 100).toFixed(0)}%`}</td>
                  <td className="pr-3">{st.baseAcc === null ? '—' : `${(st.baseAcc * 100).toFixed(0)}%`}</td>
                  <td className="pr-3">{st.troughLag === null ? '—' : `${st.troughLag} 天`}</td>
                </tr>
              );
            })))}
          </tbody>
        </table>
      </div>

      {study.groups.map(g => {
        const list = byGroup.get(g.key) ?? [];
        const isOpen = open === g.key;
        return (
          <div key={g.key} className="bg-white border border-slate-200 rounded-2xl">
            <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} className="w-full flex items-center gap-2 p-3 text-left">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span className="font-black text-sm">{g.label}</span>
              <span className="text-[11px] text-slate-500">{g.desc}・{list.map(s => `${s.name}`).join('、')}</span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 text-left">{['股票', '循環（全期間）', '階段', '單檔 原始／平滑', '合併 原始／平滑', '買進持有', '平滑回撤 vs 持有', '平滑夏普 vs 持有', '循環準確（合併）', '基準'].map(h => <th key={h} className="py-1 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {list.flatMap(s => ROUNDS.filter(rn => s.single.some(r => r.name === rn) || s.pooled.some(r => r.name === rn)).map((rn, k) => {
                        const a = s.single.find(r => r.name === rn), b = s.pooled.find(r => r.name === rn);
                        const ref = (b ?? a)!;
                        return (
                          <tr key={s.id + rn} className="border-t border-slate-100 font-mono">
                            {k === 0 ? (
                              <>
                                <td className="py-1 pr-3 font-sans whitespace-nowrap">
                                  <button type="button" onClick={() => onOpenSymbol(s.id)} className="font-black text-indigo-700 hover:underline">{s.name} {s.id}</button>
                                  <div className="text-[10px] text-slate-500">資料 {s.first.slice(0, 4)} 起</div>
                                </td>
                                <td className="pr-3 font-sans text-[11px] whitespace-nowrap">{s.cycles.cycles} 次・約 {f1(s.cycles.avgYears)} 年<br />漲 {pct(s.cycles.avgRise, 0)}／跌 {pct(s.cycles.avgFall, 0)}</td>
                              </>
                            ) : (<><td /><td /></>)}
                            <td className="pr-3 font-sans whitespace-nowrap">{rn}<div className="text-[10px] text-slate-500">{ref.testFrom.slice(0, 4)}～{ref.testTo.slice(0, 4)}</div></td>
                            <td className="pr-3">{a ? <><span className={tone((a.raw.test ?? 0) - (a.bench.test ?? 0))}>{f1(a.raw.test)}</span>／<span className={`font-bold ${tone((a.smooth.test ?? 0) - (a.bench.test ?? 0))}`}>{f1(a.smooth.test)}</span></> : <span className="text-slate-400 font-sans">訓練資料不足</span>}</td>
                            <td className="pr-3">{b ? <><span className={tone((b.raw.test ?? 0) - (b.bench.test ?? 0))}>{f1(b.raw.test)}</span>／<span className={`font-bold ${tone((b.smooth.test ?? 0) - (b.bench.test ?? 0))}`}>{f1(b.smooth.test)}</span></> : '—'}</td>
                            <td className="pr-3 text-slate-500">{f1(ref.bench.test)}</td>
                            <td className="pr-3">{pct((b ?? a)!.smooth.mdd, 0)} <span className="text-slate-400">vs {pct(ref.bench.mdd, 0)}</span></td>
                            <td className="pr-3">{(b ?? a)!.smooth.sharpe?.toFixed(2) ?? '—'} <span className="text-slate-400">vs {ref.bench.sharpe?.toFixed(2) ?? '—'}</span></td>
                            <td className="pr-3">{ref.cycle.acc === null ? '—' : `${(ref.cycle.acc * 100).toFixed(0)}%`}</td>
                            <td className="pr-3 text-slate-500">{ref.cycle.baseAcc === null ? '—' : `${(ref.cycle.baseAcc * 100).toFixed(0)}%`}</td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                  <div className="text-[11px] text-slate-500 mt-1">分數紅字 = 贏過買進持有。「合併」= 同產業一起訓練的模型；資料起始較晚、無法單獨訓練的股票也能用合併模型推測。點股票名稱可開啟「個股學習」自己調參數重算。</div>
                </div>
                {g.weights && (
                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    <WeightBars title={`交易模型：傾向持有（合併・${g.weights.round}・平滑）`} items={g.weights.pos} color="#e11d48" />
                    <WeightBars title="交易模型：傾向空手" items={g.weights.neg} color="#059669" />
                    {g.cycleWeights && <WeightBars title="循環模型：越大越像上升段" items={g.cycleWeights.pos} color="#4f46e5" />}
                    {g.cycleWeights && <WeightBars title="循環模型：越大越像下降段" items={g.cycleWeights.neg} color="#64748b" />}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {cyc && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
          <div className="font-black text-sm mb-1">由歷史資料辨識：全市場循環最明顯的股票</div>
          <div className="text-[11px] text-slate-500 mb-2">
            {cyc.total.toLocaleString()} 檔有 10 年以上資料、仍在交易、近 3 年平均每日成交值 1 億元以上的普通股
            {cyc.skippedBad ? `（另排除 ${cyc.skippedBad} 檔還原股價有異常跳動者）` : ''}，以 {Math.round(cyc.theta * 100)}% 轉折門檻找出波段高低點，
            依「每 10 年完整循環次數 × 上升段漲幅中位數」排序（資料日 {cyc.asOf}）。週期離散度越小代表循環越規律。這是事後描述，循環在過去明顯不代表未來會重複。
          </div>
          <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 text-left">{['#', '股票', '產業', '資料年數', '每 10 年循環', '週期中位數', '週期離散度', '上升段中位數', '下降段中位數'].map(h => <th key={h} className="py-1 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {cyc.top.slice(0, 30).map((r, i) => (
                  <tr key={r.id} className="border-t border-slate-100 font-mono">
                    <td className="py-1 pr-3 text-slate-400">{i + 1}</td>
                    <td className="pr-3 font-sans whitespace-nowrap"><button type="button" onClick={() => onOpenSymbol(r.id)} className="font-bold text-indigo-700 hover:underline">{r.name} {r.id}</button></td>
                    <td className="pr-3 font-sans whitespace-nowrap">{r.industry}</td>
                    <td className="pr-3">{f1(r.years)}</td>
                    <td className="pr-3">{r.perDecade.toFixed(1)} 次</td>
                    <td className="pr-3">{r.avgYears === null ? '—' : `${r.avgYears.toFixed(1)} 年`}</td>
                    <td className="pr-3">{r.regularity === null || r.regularity === undefined ? '—' : r.regularity.toFixed(2)}</td>
                    <td className="pr-3 text-rose-600">{pct(r.avgRise, 0)}</td>
                    <td className="pr-3 text-emerald-700">{pct(r.avgFall, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-xs self-start">
              <thead><tr className="text-slate-500 text-left">{['產業（至少 3 檔）', '檔數', '每 10 年循環（中位數）', '上升段中位數'].map(h => <th key={h} className="py-1 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {cyc.industries.slice(0, 20).map(r => (
                  <tr key={r.industry} className="border-t border-slate-100 font-mono">
                    <td className="py-1 pr-3 font-sans whitespace-nowrap">{r.industry}</td>
                    <td className="pr-3">{r.stocks}</td>
                    <td className="pr-3">{r.perDecade.toFixed(1)}</td>
                    <td className="pr-3 text-rose-600">{pct(r.avgRise, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[11px] text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          研究限制：只用價格與成交量，沒有庫存、報價、財報等基本面資料；研究名單是事先挑選的產業代表股，挑選本身就帶有「事後知道它們是循環股」的偏差；
          樣本只有十多檔、兩個推測期，結果的不確定性很大。本頁為教學用機器學習實驗，不構成任何證券之買賣建議。
        </span>
      </div>
    </div>
  );
};

const WeightBars: React.FC<{ title: string; items: Weight[]; color: string }> = ({ title, items, color }) => {
  const mx = Math.max(...items.map(x => Math.abs(x.w)), 1e-9);
  return (
    <div>
      <div className="font-black mb-1" style={{ color }}>{title}</div>
      {items.length === 0 && <div className="text-slate-400">（沒有明顯的指標）</div>}
      {items.map(x => (
        <div key={x.name} className="flex items-center gap-2 py-0.5">
          <span className="w-32 shrink-0 font-bold text-slate-700">{x.name}</span>
          <span className="h-2.5 rounded-full" style={{ width: `${(Math.abs(x.w) / mx) * 100}%`, background: color, minWidth: 4 }} />
        </div>
      ))}
    </div>
  );
};
