import React, { useState, useEffect } from 'react';
import {
  Zap,
  Key,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RotateCw,
  Server,
  Play,
  Copy,
  Trash2,
  X,
  Sparkles,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

export interface GroqSlotStatus {
  slot: number;
  isConfigured: boolean;
  maskedKey: string;
  source: 'env' | 'custom' | 'none';
  usageCount: number;
  lastUsedTimestamp: number | null;
  lastError: string | null;
  status: 'ACTIVE' | 'RATE_LIMITED' | 'EMPTY' | 'ERROR';
}

interface GroqKeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysUpdated?: () => void;
  isSuperUser?: boolean;
}

export const GroqKeyManagerModal: React.FC<GroqKeyManagerModalProps> = ({
  isOpen,
  onClose,
  onKeysUpdated,
  isSuperUser = false,
}) => {
  const [slots, setSlots] = useState<GroqSlotStatus[]>([]);
  const [inputKeys, setInputKeys] = useState<string[]>(Array(10).fill(''));
  const [showKeys, setShowKeys] = useState<boolean[]>(Array(10).fill(false));
  const [batchText, setBatchText] = useState<string>('');
  const [showBatchInput, setShowBatchInput] = useState<boolean>(false);
  const [currentActiveSlot, setCurrentActiveSlot] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    slot?: number;
    latencyMs?: number;
    model?: string;
    message?: string;
    replySnippet?: string;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Security check: Only superuser can access Groq token secrets
  if (!isOpen) return null;

  if (!isSuperUser) {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="bg-slate-900 border-2 border-rose-500/60 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-4 text-slate-100">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center shadow-inner">
            <ShieldCheck className="w-8 h-8 text-rose-400" />
          </div>
          <div>
            <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
              🔒 系統權限不足
            </span>
            <h3 className="text-lg font-black text-white mt-2">僅限 Superuser 最高管理者</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Groq 10組金鑰輪詢池與系統 Secrets 安全金鑰僅限最高管理者（程瑋翔 / Superuser）查閱與配置。一般學員無法直接存取金鑰。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs transition cursor-pointer"
          >
            關閉視窗
          </button>
        </div>
      </div>
    );
  }

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Fetch Groq keys status from server
  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/groq/status');
      if (res.ok) {
        const data = await res.json();
        if (data.slots) {
          setSlots(data.slots);
          setCurrentActiveSlot(data.currentActiveSlot || 1);

          // Populate inputKeys with existing keys if returned or leave placeholder
          if (data.fullKeys && Array.isArray(data.fullKeys)) {
            setInputKeys(data.fullKeys);
          } else {
            setInputKeys(prev =>
              prev.map((k, i) => (k ? k : (data.slots[i]?.isConfigured ? '••••••••••••••••••••' : '')))
            );
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load Groq status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle single slot key change
  const handleKeyChange = (index: number, val: string) => {
    setInputKeys(prev => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  // Toggle reveal
  const toggleShowKey = (index: number) => {
    setShowKeys(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  // Apply batch keys
  const handleApplyBatch = () => {
    if (!batchText.trim()) return;
    const lines = batchText
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(k => k.length > 5);

    if (lines.length === 0) {
      showToast('未偵測到有效的金鑰格式');
      return;
    }

    const updated = [...inputKeys];
    lines.forEach((k, idx) => {
      if (idx < 10) {
        updated[idx] = k;
      }
    });

    setInputKeys(updated);
    setBatchText('');
    setShowBatchInput(false);
    showToast(`已成功匯入 ${Math.min(lines.length, 10)} 組金鑰至欄位！請點選儲存。`);
  };

  // Save keys to server
  const handleSaveKeys = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/groq/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: inputKeys }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✅ 已成功儲存並同步 ${data.configuredCount} 組 Groq 免費金鑰輪詢池！`);
        await fetchStatus();
        onKeysUpdated?.();
      } else {
        showToast(`儲存失敗：${data.message || '請檢查網路連線'}`);
      }
    } catch (err: any) {
      showToast(`儲存失敗：${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Test Groq live inference
  const handleTestInference = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/groq/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Explain in Traditional Chinese (繁體中文) why fast inference is critical for financial quantitative models in 2 sentences.',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          slot: data.slot,
          latencyMs: data.latencyMs,
          model: data.model,
          message: '測試成功！Groq 極速推論連線正常。',
          replySnippet: data.reply,
        });
        showToast(`🎉 金鑰 #${data.slot} 測試成功 (延遲 ${data.latencyMs}ms)！`);
        fetchStatus();
      } else {
        setTestResult({
          success: false,
          message: data.message || '測試失敗，請確認已輸入正確金鑰',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `連線異常：${err.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const configuredCount = slots.filter(s => s.isConfigured).length;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-slate-900 border-2 border-amber-400 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-slate-100">
        {/* Toast */}
        {toastMsg && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-70 bg-amber-500 text-slate-950 font-black text-xs px-4 py-2 rounded-full shadow-xl border border-amber-300 animate-in fade-in zoom-in duration-150 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-950" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-amber-950/80 to-slate-900 p-4 sm:p-5 border-b border-amber-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-md shrink-0">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white">
                  Groq 10組免費算力金鑰輪詢池 (Secrets Token Pool)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                  Llama-3.3-70B
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                支援 10 組 Token 輪詢負載平衡 · 遇 429 速率限制自動無感切換下組金鑰 · 0 費用享極速推論
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Status Banner */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-slate-300">
                  當前已配置金鑰：
                  <strong className="text-amber-400 text-sm ml-1 font-mono">
                    {configuredCount} / 10 組
                  </strong>
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  輪詢策略：順序循環 (Round-Robin) + 自動容錯降級 (Gemini 2.5 Flash Fallback)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[11px] font-bold flex items-center gap-1 transition"
                title="前往 Groq 免費申請金鑰"
              >
                <span>領取免費 Groq Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                type="button"
                onClick={() => setShowBatchInput(!showBatchInput)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>批量貼上</span>
              </button>
            </div>
          </div>

          {/* Batch Paste Drawer */}
          {showBatchInput && (
            <div className="bg-slate-800/80 border border-amber-500/40 rounded-2xl p-3 space-y-2 animate-in fade-in">
              <label className="text-xs font-black text-amber-300 block">
                📋 批量快速貼上金鑰（支援一行一組、或逗點隔開）：
              </label>
              <textarea
                rows={3}
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
                placeholder="gsk_11111...&#10;gsk_22222...&#10;gsk_33333..."
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-amber-200 focus:ring-1 focus:ring-amber-400 focus:outline-hidden"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchInput(false)}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleApplyBatch}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs"
                >
                  自動填入 10 個欄位
                </button>
              </div>
            </div>
          )}

          {/* Test Result Banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-1 animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between font-black">
                <span className="flex items-center gap-1.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{testResult.message}</span>
                </span>
                {testResult.latencyMs && (
                  <span className="font-mono text-[11px] bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-300 border border-emerald-700">
                    ⚡ {testResult.latencyMs} ms · 金鑰槽位 #{testResult.slot}
                  </span>
                )}
              </div>
              {testResult.replySnippet && (
                <p className="text-[11px] text-slate-300 font-mono bg-black/40 p-2 rounded-xl mt-1 border border-white/5">
                  💬 AI 回覆：「{testResult.replySnippet}」
                </p>
              )}
            </div>
          )}

          {/* 10 Key Input Slots Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-black text-slate-300 px-1">
              <span>金鑰輪詢池清單 (1 ~ 10 組)</span>
              <span className="text-[10px] text-slate-500 font-normal">
                格式：gsk_ 開頭的 56 位字串
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Array.from({ length: 10 }).map((_, idx) => {
                const slotNum = idx + 1;
                const slotStatus = slots[idx];
                const keyVal = inputKeys[idx] || '';
                const isConfigured = Boolean(keyVal.trim() && keyVal.trim() !== '••••••••••••••••••••') || Boolean(slotStatus?.isConfigured);
                const isShowing = showKeys[idx];

                return (
                  <div
                    key={`groq-slot-${slotNum}`}
                    className={`p-3 rounded-2xl border transition ${
                      isConfigured
                        ? 'bg-slate-950/70 border-slate-700 hover:border-amber-400/50'
                        : 'bg-slate-950/30 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 font-mono font-black text-[11px] flex items-center justify-center">
                          {slotNum}
                        </span>
                        <span className="text-xs font-black text-slate-200">
                          金鑰 #{slotNum}
                        </span>
                        {slotStatus?.source === 'env' && (
                          <span className="text-[9px] px-1 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-mono">
                            ENV
                          </span>
                        )}
                      </div>

                      {/* Status indicator */}
                      <div>
                        {slotStatus?.status === 'RATE_LIMITED' ? (
                          <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-600 font-bold">
                            ⚠️ 429 額度已達
                          </span>
                        ) : isConfigured ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-600 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            就緒 (呼叫: {slotStatus?.usageCount || 0}次)
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            未設定
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <input
                        type={isShowing ? 'text' : 'password'}
                        value={keyVal}
                        onChange={e => handleKeyChange(idx, e.target.value)}
                        placeholder={`請輸入 GROQ_API_KEY_${slotNum} (gsk_...)`}
                        className="w-full pl-3 pr-16 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-amber-200 placeholder-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-hidden"
                      />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleShowKey(idx)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                          title={isShowing ? '隱藏金鑰' : '顯示金鑰'}
                        >
                          {isShowing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        {keyVal && (
                          <button
                            type="button"
                            onClick={() => handleKeyChange(idx, '')}
                            className="p-1 text-slate-500 hover:text-rose-400"
                            title="清空此槽位"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950 px-4 sm:px-6 py-3.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>金鑰僅存放於伺服器端安全記憶體，不對外洩漏</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTesting || configuredCount === 0}
              onClick={handleTestInference}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              title="執行一次快速測試連線"
            >
              {isTesting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isTesting ? '測試中...' : '測試推論 (Ping)'}</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveKeys}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <RotateCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>儲存並啟用金鑰輪詢池</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
