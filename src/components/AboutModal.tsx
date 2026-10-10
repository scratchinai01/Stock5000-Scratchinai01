import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { COPYRIGHT, DESIGNER, CONTACT, LEGAL, DATA_NOTE } from './StudyCardModal';

/** 關於本系統：版權、設計者與聯絡方式、用途聲明、方法與限制（此頁不出現任何個股） */
export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-[19px] font-black text-slate-900 pt-2">{children}</h3>;
  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-slate-950/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="關於本系統" onClick={e => e.stopPropagation()}
        className="w-full md:w-[760px] max-h-[92vh] overflow-y-auto bg-[#fbf8f2] rounded-t-[28px] md:rounded-[28px] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-[#fbf8f2] border-b border-[#e6dfd1]">
          <div className="text-[22px] font-black text-slate-900">ℹ️ 關於本系統</div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-black/5" aria-label="關閉"><X className="w-6 h-6" /></button>
        </div>
        <div className="px-6 py-5 space-y-3 text-[16.5px] leading-relaxed text-slate-800">
          <div className="rounded-2xl bg-[#f4efe4] p-4 space-y-1">
            <div className="text-[20px] font-black text-slate-900">📈 5000萬股市大富翁</div>
            <div className="font-black">{COPYRIGHT}</div>
            <div>{DESIGNER}</div>
            <div>聯絡：{CONTACT}</div>
            <div className="text-[14px] text-slate-500">聯絡方式僅供教學合作、系統問題回報與使用意見；恕不回覆任何個股或投資相關諮詢。</div>
          </div>

          <H>用途聲明</H>
          <p className="font-bold">{LEGAL}</p>
          <p>本系統提供模擬交易、技術分析與量化研究的教學展示。模擬帳戶使用虛擬資金，與真實下單無關。</p>

          <H>資料來源與版權範圍</H>
          <p>{DATA_NOTE}</p>
          <p>歷史資料涵蓋 1995 年以來的上市櫃股票，包含已下市公司；每個交易日收盤後更新一次，可能因資料更正而有落差。</p>

          <H>研究方法與已知限制</H>
          <ul className="list-disc pl-6 space-y-1">
            <li>「型態選股」依固定規則辨識三角收斂，參數為本系統自訂；回測未扣手續費與稅。</li>
            <li>「下跌預警」的權重與門檻是初始設計；回測顯示原始六因子權重的辨識力有限，2020 年代接近隨機，仍在校準。</li>
            <li>利空警戒分數的權重只用 2015 年以前資料決定，再以 2015 年以後資料驗證，避免用答案出題。</li>
            <li>所有「機率」都是過去相似情況的統計比例，不是對任何個股的預測。</li>
            <li>完整的回測表格、事件定義與限制，請見「全市場海搜」中的「歷史回測統計」、「歷史回測驗證」與「因子說明與限制」。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
