import React, { useState } from 'react';
import { RotateCcw, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { StudentProfile, DEFAULT_STUDENT_PASSWORD } from '../types/market';
import { getPlayerProfileFromFirebase, recordAuditLog } from '../services/firebase';

interface ResetPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: StudentProfile;
  onConfirmReset: () => Promise<void> | void;
}

export const ResetPortfolioModal: React.FC<ResetPortfolioModalProps> = ({
  isOpen,
  onClose,
  profile,
  onConfirmReset,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!password) {
      setErrorMsg('請輸入操盤手密碼進行身分確認');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Fetch latest profile from Firebase if possible to verify against updated password
      let expectedPwd = profile.password || DEFAULT_STUDENT_PASSWORD;
      try {
        const cloudProf = await getPlayerProfileFromFirebase(profile.studentName);
        if (cloudProf && cloudProf.password) {
          expectedPwd = cloudProf.password;
        }
      } catch (err) {
        console.warn('Could not fetch cloud profile for pwd check:', err);
      }

      if (password !== expectedPwd) {
        setErrorMsg('密碼不正確！請確認後重新輸入');
        setIsProcessing(false);
        return;
      }

      // 2. Password verified! Record audit log
      try {
        await recordAuditLog(
          'PORTFOLIO_RESET',
          profile.studentName,
          `操盤手【${profile.studentName}】密碼驗證通過，執行 5,000 萬資產清空重來`
        );
      } catch {}

      // 3. Execute reset
      await onConfirmReset();

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setPassword('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(`重置失敗：${err?.message || '請稍後再試'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-3xl w-full max-w-lg p-6 sm:p-7 shadow-2xl space-y-5 text-slate-900 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-950 text-base">
                清空部位並重新開始
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                操盤手：{profile.studentName}（{profile.teamName}）
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-black text-slate-950">
              部位已全數清空！
            </h4>
            <p className="text-xs text-slate-600 font-bold max-w-sm mx-auto">
              現金已恢復為完整 NT$ 50,000,000，您可以重新擬定策略並重新開始下單配置！
            </p>
          </div>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            {/* Warning Explanation Box */}
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-black text-rose-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>一開始玩錯了想重新來過？</span>
              </div>
              <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside text-[11px] leading-relaxed">
                <li>將會<strong>清空目前持有的全部 {profile.positions?.length || 0} 檔商品部位</strong>。</li>
                <li>可用現金<strong>完整重置為 NT$ 50,000,000</strong>。</li>
                <li>清空先前所有交易對帳記錄，重新建立初始狀態。</li>
                <li>嚴防誤觸保護：<strong>必須輸入您的操盤手密碼</strong>方可執行。</li>
              </ul>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-800">
                請輸入【{profile.studentName}】的密碼：
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="請輸入密碼以確認重置"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-rose-500 focus:bg-white rounded-xl text-slate-900 text-xs font-mono font-bold focus:outline-none transition shadow-2xs pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                💡 請輸入該操盤手個人的登入密碼以確認執行重置。
              </p>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-black transition cursor-pointer"
              >
                取消返回
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isProcessing ? '驗證中並重置中...' : '確認密碼，清空所有部位重來'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
