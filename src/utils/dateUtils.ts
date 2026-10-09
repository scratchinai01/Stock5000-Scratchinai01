// Utility for dynamic system current date & time formatting

export function getSystemDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getSystemTimeStr(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function getSystemDateTimeStr(): string {
  return `${getSystemDateStr()} ${getSystemTimeStr()}`;
}

export function formatEntryTimestamp(): string {
  return `${getSystemDateTimeStr()} (即時撮合)`;
}
