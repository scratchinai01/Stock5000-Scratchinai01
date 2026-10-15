/**
 * 裝置判斷：手機、平板、電腦
 * - 看「這台裝置」而不是「目前視窗」：手機轉橫向（寬 844）仍是手機；iPad 直向（寬 768）是平板。
 * - 依據：系統回報的裝置型態（UA / iPadOS 觸控點）、是否為觸控螢幕、螢幕短邊長度。
 */
export type DeviceKind = 'phone' | 'tablet' | 'desktop';
export interface DeviceInfo {
  kind: DeviceKind;
  touch: boolean;
  landscape: boolean;
  width: number;
  height: number;
  /** 建議使用的介面 */
  ui: 'mobile' | 'desktop';
}

export function detectDevice(): DeviceInfo {
  if (typeof window === 'undefined') return { kind: 'desktop', touch: false, landscape: true, width: 1280, height: 800, ui: 'desktop' };
  const nav: any = navigator;
  const ua = String(nav.userAgent || '');
  const touchPoints = Number(nav.maxTouchPoints || 0);
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touch = coarse || touchPoints > 0;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const sw = Math.min(window.screen?.width || w, window.screen?.height || h);

  let kind: DeviceKind;
  const uaMobile = nav.userAgentData?.mobile;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1) || /Tablet|SM-T|Tab\b/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) kind = 'tablet';
  else if (uaMobile === true || /iPhone|iPod|Android.*Mobile|Windows Phone|Mobile Safari/i.test(ua)) kind = 'phone';
  else if (touch && coarse) kind = sw < 600 ? 'phone' : 'tablet';
  else kind = 'desktop';
  // 平板的螢幕短邊不到 600（小型 Android 平板）時，介面比照手機
  if (kind === 'tablet' && sw < 600) kind = 'phone';

  const landscape = w > h;
  // 手機：一律手機版（直向、橫向都是）
  // 平板：完整版；分割畫面或視窗太窄（< 700）時改手機版
  // 電腦：視窗寬 < 768 時改手機版
  const ui: 'mobile' | 'desktop' = kind === 'phone' ? 'mobile' : kind === 'tablet' ? (w < 700 ? 'mobile' : 'desktop') : w < 768 ? 'mobile' : 'desktop';
  return { kind, touch, landscape, width: w, height: h, ui };
}

/** 把裝置型態寫到 <html>，讓 CSS 依裝置微調（觸控按鈕大小、輸入框字級） */
export function applyDeviceAttributes(d: DeviceInfo) {
  const el = document.documentElement;
  el.dataset.device = d.kind;
  el.dataset.touch = d.touch ? '1' : '0';
  el.dataset.orient = d.landscape ? 'landscape' : 'portrait';
}

export const DEVICE_LABEL: Record<DeviceKind, string> = { phone: '手機', tablet: '平板', desktop: '電腦' };
