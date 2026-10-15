/**
 * 美元兌新台幣匯率：由伺服器每 10 分鐘抓一次真實匯率（Yahoo Finance TWD=X），
 * 隨行情一起送到前端。收到之前用 32.5 暫代，畫面會標示「匯率載入中」。
 */
export interface FxInfo {
  rate: number;
  time: string;
  source: string;
  live: boolean;
}

let info: FxInfo = { rate: 32.5, time: '', source: '尚未取得即時匯率（暫以 32.5 估算）', live: false };
const listeners = new Set<(i: FxInfo) => void>();

export const getUsdTwd = () => info.rate;
export const getFxInfo = () => info;

export function setUsdTwd(rate: number, time: string, source: string) {
  if (!(rate > 20 && rate < 50)) return; // 不合理的數字不採用
  if (info.live && info.rate === rate && info.time === time) return;
  info = { rate, time, source, live: true };
  listeners.forEach(fn => fn(info));
}

export function subscribeFx(fn: (i: FxInfo) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const fxText = (i: FxInfo = info) => `1 USD = ${i.rate.toFixed(3)} TWD${i.live ? '' : '（暫估）'}`;
