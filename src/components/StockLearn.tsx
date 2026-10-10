import React, { useEffect, useState } from 'react';
import { Loader2, Play, Info } from 'lucide-react';
import { BacktestParams, DailySeries } from '../utils/analytics';
import { runLearning, topWeights, LearnOptions, DEFAULT_LEARN } from '../utils/learn';

type ChartSeries = { name: string; values: (number | null)[]; color: string; dash?: string };

const pct = (x: number | null | undefined) => (x === null || x === undefined || !isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const upDown = (x: number) => (x > 0 ? 'text-rose-600' : x < 0 ? 'text-emerald-600' : 'text-slate-600');
const score = (x: number) => (isFinite(x) ? x.toFixed(1) : '—');

/**
 * 個股學習（強化學習實驗）：訓練期用真實漲跌當獎勵學出持有規則，再推測下一段沒看過的期間。
 */
export const StockLearn: React.FC<{
  symbol: string;
  name: string;
  series: DailySeries;           // 完整還原股價（不受期間按鈕影響）
  params: BacktestParams;        // 沿用策略回測的指標參數與手續費設定
  renderChart: (dates: string[], series: ChartSeries[]) => React.ReactNode;
}> = ({ symbol, name, series, params, renderChart }) => {
  const [opt, setOpt] = useState<LearnOptions>(DEFAULT_LEARN);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(ReturnType<typeof runLearning> & { key: string }) | null>(null);
  const key = `${symbol}|${series.date.length}|${JSON.stringify(opt)}`;

  useEffect(() => { setRes(null); }, [symbol]);

  const run = () => {
    setBusy(true);
    // 讓「學習中」先畫出來再開始計算
    setTimeout(() => {
      try { setRes({ ...runLearning(series, params, opt, symbol, name), key }); }
      finally { setBusy(false); }
    }, 30);
  };
  const stale = res && res.key !== key;
  const first = series.date[0], last = series.date[series.date.length - 1];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div>
          <div className="font-black text-base">個股學習（強化學習實驗）· {name} {symbol}</div>
          <div className="text-xs text-slate-600 mt-1 leading-relaxed">
            同時學兩件事：<b>循環辨識</b>（現在位於上升段還是下降段）與<b>交易決策</b>（用 27 個複合指標＋循環位置，以訓練期的真實漲跌當獎勵學出「何時持有、何時空手」），
            再拿去推測<b>完全沒看過</b>的下一段期間。第一階段：訓練到 {opt.split1 - 1} 年 → 推測 {opt.split1}～{opt.split2 - 1} 年；
            第二階段：訓練到 {opt.split2 - 1} 年 → 推測 {opt.split2} 年至今。每一段都比較「原始」與「平滑」兩個版本。
          </div>
          <div className="text-[11px] text-slate-500 mt-1">資料期間 {first} ～ {last}（還原股價）。前 250 個交易日用來暖機計算一年區間等指標，不列入訓練。</div>
        </div>
        <div className="flex flex-wrap gap-3 items-end text-xs">
          <Num label="第一段推測起始年" value={opt.split1} onChange={v => setOpt(o => ({ ...o, split1: v }))} />
          <Num label="第二段推測起始年" value={opt.split2} onChange={v => setOpt(o => ({ ...o, split2: v }))} />
          <Num label="平滑天數" value={opt.smooth} onChange={v => setOpt(o => ({ ...o, smooth: Math.max(2, v) }))} />
          <Num label="波段轉折門檻 %" value={Math.round(opt.theta * 100)} onChange={v => setOpt(o => ({ ...o, theta: Math.min(80, Math.max(5, v)) / 100 }))} />
          <Num label="下跌懲罰倍數 κ" value={opt.kappa} step={0.1} allowZero onChange={v => setOpt(o => ({ ...o, kappa: v }))} />
          <label className="flex flex-col gap-1 font-bold text-slate-600">第二階段訓練資料
            <select value={opt.expanding ? '1' : '0'} onChange={e => setOpt(o => ({ ...o, expanding: e.target.value === '1' }))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white">
              <option value="1">從頭累積（{first.slice(0, 4)}～{opt.split2 - 1}）</option>
              <option value="0">只用前一段（{opt.split1}～{opt.split2 - 1}）</option>
            </select>
          </label>
          <button type="button" onClick={run} disabled={busy}
            className="min-h-[40px] px-5 rounded-xl bg-indigo-600 text-white font-black flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}{busy ? '學習中…' : res ? '重新學習' : '開始學習'}
          </button>
          {stale && <span className="text-amber-700 font-bold">設定已變更，請按「重新學習」</span>}
        </div>
        <details className="text-[11px] text-slate-600 leading-relaxed">
          <summary className="cursor-pointer font-bold text-slate-700">方法說明：獎勵、分數、平滑是怎麼算的</summary>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><b>決策</b>：每天收盤後決定「持有」或「空手」，隔天起承擔漲跌。模型輸出持有的機率 π = sigmoid(權重 × 指標)。</li>
            <li><b>循環辨識</b>：在訓練期用「事後」的波段高低點（反向漲跌 ≥ {Math.round(opt.theta * 100)}% 才算轉折）標出上升段／下降段，學一個只看當時資料的判斷模型；推測期再用事後高低點評分（準確率、AUC、轉折後幾天才認出來），並和「最近一次確認的波段方向」這個樸素規則比較。</li>
            <li><b>獎勵</b>：持有時拿到之後的報酬，下跌時的損失乘上 {1 + opt.kappa} 倍（風險調整），換手時扣手續費與證交稅；以梯度上升把「訓練期總獎勵」調到最大（單步強化學習／情境式決策）。循環模型輸出的「上升段機率」也是交易模型的一個指標。</li>
            <li><b>100 分制</b>：100 分 ＝ 每天都事先知道明天漲跌、只在上漲日持有（只做多）。分數 ＝ 持有日報酬加總 ÷ 上漲日報酬加總 × 100；0 分 ＝ 都不持有；負分 ＝ 比空手還差。</li>
            <li><b>原始</b>：獎勵用隔天的漲跌，機率 &gt; 0.5 就持有。</li>
            <li><b>平滑</b>：獎勵改用之後 {opt.smooth} 天的平均漲跌（不追逐單日雜訊）；輸出機率先做 {opt.smooth} 日指數平均，高於 0.55 才買、低於 0.45 才賣，減少來回進出。</li>
            <li><b>防止偷看未來</b>：指標只用當天以前的資料；循環標籤、指標標準化與獎勵都只用訓練期內的價格；推測期的事後高低點只用來評分，完全沒有參與訓練。</li>
          </ul>
        </details>
      </div>

      {res && !stale && res.warnings.map(w => <div key={w} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{w}</div>)}

      {res && !stale && res.rounds.length > 0 && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
            <div className="font-black text-sm mb-1">訓練分數 vs 推測分數</div>
            <div className="text-[11px] text-slate-500 mb-2">「訓練」是模型看過答案的期間，「推測」才是真正的考試。推測分數明顯低於訓練分數，代表學到的多半是過去的雜訊（過度配適）。報酬統計只算推測期間。</div>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 text-left">{['階段', '訓練期', '推測期', '版本', '訓練分數', '推測分數', '推測期年化報酬', '最大回撤', '夏普值', '完成交易', '持股時間'].map(h => <th key={h} className="py-1 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {res.rounds.flatMap(r => [
                  ...r.variants.map((v, k) => (
                    <tr key={r.name + v.label} className={`border-t border-slate-100 font-mono ${v.label === '平滑' ? 'bg-indigo-50/60' : ''}`}>
                      {k === 0 && <td rowSpan={3} className="py-1 pr-3 font-sans font-black align-top whitespace-nowrap">{r.name}</td>}
                      {k === 0 && <td rowSpan={3} className="pr-3 align-top whitespace-nowrap">{r.trainFrom.slice(0, 4)}～{r.trainTo.slice(0, 4)}</td>}
                      {k === 0 && <td rowSpan={3} className="pr-3 align-top whitespace-nowrap">{r.testFrom.slice(0, 4)}～{r.testTo.slice(0, 4)}</td>}
                      <td className="pr-3 font-sans font-bold">{v.label}</td>
                      <td className="pr-3">{score(v.trainScore)}</td>
                      <td className={`pr-3 font-bold ${v.testScore > r.bench.testScore ? 'text-rose-600' : 'text-slate-700'}`}>{score(v.testScore)}</td>
                      <td className={`pr-3 ${upDown(v.bt.stats?.cagr ?? 0)}`}>{pct(v.bt.stats?.cagr)}</td>
                      <td className="pr-3 text-emerald-700">{pct(v.bt.stats?.maxDrawdown)}</td>
                      <td className="pr-3">{v.bt.stats ? v.bt.stats.sharpe.toFixed(2) : '—'}</td>
                      <td className="pr-3">{v.bt.closedTrades} 次</td>
                      <td className="pr-3">{(v.bt.exposure * 100).toFixed(0)}%</td>
                    </tr>
                  )),
                  <tr key={r.name + 'bh'} className="border-t border-slate-100 font-mono text-slate-500">
                    <td className="pr-3 font-sans font-bold">買進持有</td>
                    <td className="pr-3">{score(r.bench.trainScore)}</td>
                    <td className="pr-3">{score(r.bench.testScore)}</td>
                    <td className={`pr-3 ${upDown(r.bench.bt.stats?.cagr ?? 0)}`}>{pct(r.bench.bt.stats?.cagr)}</td>
                    <td className="pr-3">{pct(r.bench.bt.stats?.maxDrawdown)}</td>
                    <td className="pr-3">{r.bench.bt.stats ? r.bench.bt.stats.sharpe.toFixed(2) : '—'}</td>
                    <td className="pr-3">—</td>
                    <td className="pr-3">100%</td>
                  </tr>,
                ])}
              </tbody>
            </table>
            <div className="text-[11px] text-slate-500 mt-2">推測分數以紅字標示者，代表在沒看過的期間贏過買進持有的分數。</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 overflow-x-auto">
            <div className="font-black text-sm mb-1">循環辨識：推測期認得出上升段／下降段嗎？</div>
            <div className="text-[11px] text-slate-500 mb-2">
              全期間（{Math.round(opt.theta * 100)}% 轉折門檻）共 {res.cycles.cycles} 個完整循環
              {res.cycles.avgYears !== null && <>，平均 {res.cycles.avgYears.toFixed(1)} 年一個循環</>}
              {res.cycles.avgRise !== null && <>，上升段平均 {pct(res.cycles.avgRise)}</>}
              {res.cycles.avgFall !== null && <>、下降段平均 {pct(res.cycles.avgFall)}</>}。
              「樸素基準」= 只看最近一次被確認的波段方向；模型要贏過它才算真的學到東西。轉折延遲：事後的低點／高點出現後，模型幾天後才翻向（負數 = 提前）。
            </div>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 text-left">{['階段', '推測期', '模型準確率', '樸素基準', 'AUC', '推測期轉折數', '有認出', '低點延遲（中位數）', '高點延遲（中位數）'].map(h => <th key={h} className="py-1 pr-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {res.rounds.map(r => (
                  <tr key={r.name} className="border-t border-slate-100 font-mono">
                    <td className="py-1 pr-3 font-sans font-black">{r.name}</td>
                    <td className="pr-3">{r.testFrom.slice(0, 4)}～{r.testTo.slice(0, 4)}</td>
                    <td className={`pr-3 font-bold ${(r.cycle.acc ?? 0) > (r.cycle.baseAcc ?? 1) ? 'text-rose-600' : ''}`}>{r.cycle.acc === null ? '—' : `${(r.cycle.acc * 100).toFixed(0)}%`}</td>
                    <td className="pr-3">{r.cycle.baseAcc === null ? '—' : `${(r.cycle.baseAcc * 100).toFixed(0)}%`}</td>
                    <td className="pr-3">{r.cycle.auc === null || !isFinite(r.cycle.auc) ? '—' : r.cycle.auc.toFixed(2)}</td>
                    <td className="pr-3">{r.cycle.turns}</td>
                    <td className="pr-3">{r.cycle.detected}</td>
                    <td className="pr-3">{r.cycle.troughLag === null ? '—' : `${r.cycle.troughLag} 天`}</td>
                    <td className="pr-3">{r.cycle.peakLag === null ? '—' : `${r.cycle.peakLag} 天`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {res.rounds.map(r => (
            <div key={r.name} className="bg-white border border-slate-200 rounded-2xl p-3">
              <div className="font-black text-sm mb-2">{r.name}推測期 {r.testFrom} ～ {r.testTo}：資產淨值走勢</div>
              {renderChart(r.bench.bt.dates, [
                { name: '學習（原始）', values: r.variants[0].bt.equity, color: '#f59e0b' },
                { name: '學習（平滑）', values: r.variants[1].bt.equity, color: '#4f46e5' },
                { name: '買進持有', values: r.bench.bt.equity, color: '#94a3b8', dash: '4 3' },
              ])}
            </div>
          ))}

          {(() => {
            const r = res.rounds[res.rounds.length - 1];
            const t = topWeights(r.models.smooth);
            return (
              <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="font-black text-sm mb-1">這檔股票的「個性」：模型最看重的指標（{r.name}・平滑版）</div>
                <div className="text-[11px] text-slate-500 mb-2">指標都先標準化，長條越長代表影響越大。這是訓練期的統計關係，不代表因果，也不保證未來仍然成立。</div>
                {r.variants[1].bt.exposure < 0.05 && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                    模型在推測期幾乎全程空手：扣掉交易成本、並加重下跌懲罰後，模型判斷這些指標不足以支持進場。可以把「下跌懲罰倍數 κ」調低再試。
                  </div>
                )}
                {r.variants[1].bt.exposure > 0.95 && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                    模型在推測期幾乎全程持有：代表這些指標在訓練期沒有提供比「一直抱著」更好的資訊，下面的長條只是相對大小，實際影響很小。
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  {([['傾向持有', t.pos, '#e11d48'], ['傾向空手', t.neg, '#059669']] as const).map(([title, items, color]) => {
                    const mx = Math.max(...[...t.pos, ...t.neg].map(x => Math.abs(x.w)), 1e-9);
                    return (
                      <div key={title}>
                        <div className="font-black mb-1" style={{ color }}>{title}</div>
                        {items.length === 0 && <div className="text-slate-400">（沒有明顯的指標）</div>}
                        {items.map(x => (
                          <div key={x.name} className="flex items-center gap-2 py-0.5">
                            <span className="w-28 shrink-0 font-bold text-slate-700">{x.name}</span>
                            <span className="h-2.5 rounded-full" style={{ width: `${(Math.abs(x.w) / mx) * 100}%`, background: color, minWidth: 4 }} />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      <div className="text-[11px] text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>本功能是教學用的機器學習實驗，用來說明「訓練／測試分開」與「過度配適」的概念。模型只看單一股票的價格與成交量，樣本有限，
          推測期表現好也可能只是運氣；不構成任何證券之買賣建議。</span>
      </div>
    </div>
  );
};

const Num: React.FC<{ label: string; value: number; step?: number; allowZero?: boolean; onChange: (v: number) => void }> = ({ label, value, step = 1, allowZero, onChange }) => (
  <label className="flex flex-col gap-1 font-bold text-slate-600">{label}
    <input type="number" value={value} step={step} onChange={e => { const v = Number(e.target.value); if (isFinite(v) && (v > 0 || (allowZero && v === 0))) onChange(v); }}
      className="border border-slate-200 rounded-lg px-2 py-1 w-28 font-mono bg-white" />
  </label>
);
