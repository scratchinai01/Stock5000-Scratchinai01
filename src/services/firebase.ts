/**
 * 學員資料服務
 *
 * 原本直接連 AI Studio 附帶的 Firebase 專案；該專案已失效（每個人的資料只留在自己的瀏覽器，彼此看不到）。
 * 現在一律透過本系統伺服器（/api/players*）讀寫，密碼只在伺服器驗證。
 * 不可變帳本、稽核紀錄、快照仍保存在這台瀏覽器（localStorage）。
 */
import { StudentProfile, ImmutableTransaction, BackupSnapshot, AuditLog } from '../types/market';
import { adminHeaders, playerHeaders, getPlayerToken } from './playerSession';

export const CURRENT_SCHEMA_VERSION = 3;

// Designated Administrator & Superuser
export const SUPERUSER_NAME = '程瑋翔';
export const ADMIN_EMAIL = 'scratchinai01@gmail.com';

export function isAdminEmail(identifier?: string | null): boolean {
  if (!identifier) return false;
  const clean = identifier.trim().toLowerCase();
  return (
    clean === ADMIN_EMAIL.toLowerCase() ||
    clean === SUPERUSER_NAME.toLowerCase() ||
    clean === 'admin' ||
    clean === 'superuser' ||
    clean.includes('程瑋翔') ||
    clean.includes('scratchinai01@gmail.com')
  );
}

/** 伺服器學員資料是否可用 */
export async function testConnection(): Promise<boolean> {
  try {
    const r = await fetch('/api/players', { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchAllPlayers(): Promise<StudentProfile[]> {
  const r = await fetch('/api/players', { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.players || []) as StudentProfile[];
}

// 1. Permanent Deterministic Student UID Generation (Decoupled from name/machine changes)
export function getOrGeneratePermanentUID(studentName: string, existingUid?: string): string {
  if (existingUid && existingUid.startsWith('stu_')) {
    return existingUid;
  }
  const clean = studentName.trim().toLowerCase();
  // Simple deterministic 8-char hash
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
  return `stu_${hex}`;
}

// Deterministic document ID in /players/{playerId}
export function getPlayerDocId(studentName: string): string {
  const sanitized = studentName.trim().replace(/[\/\s#?\[\]]/g, '_');
  const encoded = encodeURIComponent(sanitized);
  return `player_${encoded.slice(0, 115)}`;
}

// 讀取單一學員（不含密碼）
export async function getPlayerProfileFromFirebase(studentName: string): Promise<StudentProfile | null> {
  try {
    const key = studentName.trim().toLowerCase();
    return (await fetchAllPlayers()).find(p => p.studentName?.trim().toLowerCase() === key) || null;
  } catch {
    return null;
  }
}

function summarize(profile: StudentProfile) {
  let sec = 0, margin = 0, unreal = 0;
  (profile.positions || []).forEach(pos => {
    unreal += pos.unrealizedPnL || 0;
    if (pos.category === 'futures') margin += pos.totalCostOrMargin || 0;
    else sec += pos.notionalValue || 0;
  });
  const initialCapital = profile.initialCapital || 50000000;
  const availableCash = typeof profile.availableCash === 'number' ? profile.availableCash : 50000000;
  const netAssetValue = availableCash + sec + margin + unreal;
  return { initialCapital, availableCash, netAssetValue, totalReturnPct: ((netAssetValue - initialCapital) / initialCapital) * 100 };
}

/** 儲存資產資料到伺服器：只有本人（學員權杖）或版主可以寫入；密碼欄位一律不送 */
export async function savePlayerProfileToFirebase(profile: StudentProfile): Promise<boolean> {
  try {
    const name = profile.studentName.trim();
    const headers = getPlayerToken(name) ? playerHeaders(name) : adminHeaders();
    if (!headers) return false;
    const { password: _pw, ...rest } = profile as any;
    const body = {
      ...rest,
      uid: getOrGeneratePermanentUID(name, profile.uid),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      role: profile.role || 'student',
      status: profile.status || 'active',
      ...summarize(profile),
      createdAt: profile.createdAt || Date.now(),
    };
    const r = await fetch('/api/players/me', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ profile: body }) });
    if (r.status === 409) {
      // 版主已統一還原（例如正式競賽開始）：這台裝置上的舊資料作廢，重新載入拿伺服器的新資料
      window.dispatchEvent(new CustomEvent('season-reset'));
      return false;
    }
    return r.ok;
  } catch (err: any) {
    console.warn('學員資料同步失敗（已先存在本機）:', err?.message || err);
    return false;
  }
}

/**
 * 改密碼：學員本人需提供目前密碼；版主（已用版主密碼登入）可直接設定臨時密碼，學員下次登入必須再改
 */
export async function updateStudentPassword(studentName: string, newPassword: string, currentPassword?: string): Promise<boolean> {
  try {
    const admin = adminHeaders();
    if (currentPassword === undefined && admin) {
      const r = await fetch('/api/admin/players/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...admin }, body: JSON.stringify({ name: studentName, password: newPassword }) });
      return r.ok;
    }
    const r = await fetch('/api/players/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(playerHeaders(studentName) || {}) },
      body: JSON.stringify({ name: studentName, current: currentPassword || '', next: newPassword }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    recordAuditLog('PASSWORD_UPDATE', studentName, `學生【${studentName}】已成功更新密碼`).catch(() => {});
    return true;
  } catch (err: any) {
    console.warn('更新密碼失敗:', err?.message || err);
    throw err;
  }
}

// 2. Immutable Transaction Ledger (Append-Only, No Delete, No Edit)
export async function saveImmutableTransaction(tx: ImmutableTransaction): Promise<boolean> {
  try {
    // Also mirror into local persistent ledger
    const existingLedgerJson = localStorage.getItem('finmind_immutable_ledger_v3');
    const existingLedger: ImmutableTransaction[] = existingLedgerJson ? JSON.parse(existingLedgerJson) : [];
    if (!existingLedger.some(t => t.transactionId === tx.transactionId)) {
      existingLedger.unshift(tx);
      localStorage.setItem('finmind_immutable_ledger_v3', JSON.stringify(existingLedger.slice(0, 500)));
    }

    // Record Audit Log entry
    await recordAuditLog(
      'TRANSACTION_CREATE',
      tx.studentName,
      `建立了 ${tx.side} ${tx.name} (${tx.symbol}) ${tx.quantity} 單位，成交價 NT$ ${tx.price.toLocaleString()}`,
      tx.uid
    );

    return true;
  } catch (err) {
    console.warn('Firebase immutable transaction write note (cached locally):', err);
    return false;
  }
}

// Fetch all immutable transactions for a student or entire class
export async function fetchClassTransactions(limitCount = 100): Promise<ImmutableTransaction[]> {
  // Fallback to local storage
  const localJson = localStorage.getItem('finmind_immutable_ledger_v3');
  return localJson ? JSON.parse(localJson) : [];
}

// 3. System Audit Log
export async function recordAuditLog(
  action: string,
  actorName: string,
  details: string,
  uid?: string
): Promise<void> {
  const logEntry: AuditLog = {
    id: `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action,
    uid: uid || 'system',
    actorName,
    details,
    timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
    createdAt: Date.now(),
  };

  const localLogsJson = localStorage.getItem('finmind_audit_logs_v3');
  const localLogs: AuditLog[] = localLogsJson ? JSON.parse(localLogsJson) : [];
  localLogs.unshift(logEntry);
  localStorage.setItem('finmind_audit_logs_v3', JSON.stringify(localLogs.slice(0, 200)));
}

export async function fetchAuditLogs(limitCount = 50): Promise<AuditLog[]> {
  const localLogsJson = localStorage.getItem('finmind_audit_logs_v3');
  return localLogsJson ? JSON.parse(localLogsJson) : [];
}

// 4. Point-in-Time Recovery (PITR) & Snapshot Backup System
export async function createBackupSnapshot(
  reason: string,
  profiles: StudentProfile[]
): Promise<BackupSnapshot> {
  const now = Date.now();
  const timeStr = new Date(now).toLocaleString('zh-TW', { hour12: false });
  const snapshotId = `SNAP_${new Date(now).toISOString().replace(/[-:T]/g, '_').split('.')[0]}`;

  const allTx = await fetchClassTransactions(500);

  const snapshot: BackupSnapshot = {
    id: snapshotId,
    snapshotTime: timeStr,
    timestamp: now,
    reason,
    totalStudents: profiles.length,
    totalTransactions: allTx.length,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    studentsSnapshot: profiles,
  };

  // 2. Save to localStorage
  const existingBackupsJson = localStorage.getItem('finmind_backup_snapshots_v3');
  const existingBackups: BackupSnapshot[] = existingBackupsJson ? JSON.parse(existingBackupsJson) : [];
  existingBackups.unshift(snapshot);
  localStorage.setItem('finmind_backup_snapshots_v3', JSON.stringify(existingBackups.slice(0, 14))); // Keep 14 recent backups

  await recordAuditLog(
    'SNAPSHOT_CREATE',
    '系統自動備份',
    `建立快照「${reason}」，涵蓋 ${profiles.length} 位學生，${allTx.length} 筆不可變交易`
  );

  return snapshot;
}

export async function fetchBackupSnapshots(): Promise<BackupSnapshot[]> {
  const localBackupsJson = localStorage.getItem('finmind_backup_snapshots_v3');
  return localBackupsJson ? JSON.parse(localBackupsJson) : [];
}

// 5. Restore SINGLE student data from a snapshot without touching anyone else
export async function restoreSingleStudentFromSnapshot(
  snapshot: BackupSnapshot,
  targetUidOrName: string
): Promise<StudentProfile | null> {
  const cleanTarget = targetUidOrName.trim().toLowerCase();
  const matched = (snapshot.studentsSnapshot || []).find(
    p =>
      (p.uid && p.uid.toLowerCase() === cleanTarget) ||
      p.studentName.trim().toLowerCase() === cleanTarget ||
      p.id.toLowerCase() === cleanTarget
  );

  if (!matched) return null;

  // Save matched student profile back to Firebase & local storage
  const restoredProfile: StudentProfile = {
    ...matched,
    updatedAt: Date.now(),
  };

  await savePlayerProfileToFirebase(restoredProfile);

  await recordAuditLog(
    'SINGLE_STUDENT_RESTORE',
    '教師管理中心',
    `從快照 ${snapshot.snapshotTime} 成功精準復原學生【${restoredProfile.studentName}】資料（現金: ${restoredProfile.availableCash.toLocaleString()}，持倉: ${restoredProfile.positions?.length || 0}筆），全班其餘學生不受影響`,
    restoredProfile.uid
  );

  return restoredProfile;
}

// 6. Export classroom data as JSON string for Teacher Download
export function exportClassroomData(profiles: StudentProfile[]): string {
  const exportPayload = {
    exportDate: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    platform: '5000萬股市大富翁 (教師金融模擬平台)',
    studentCount: profiles.length,
    students: profiles.map(p => ({
      uid: p.uid || getOrGeneratePermanentUID(p.studentName),
      studentId: p.studentId || '',
      studentName: p.studentName,
      teamName: p.teamName,
      initialCapital: p.initialCapital,
      availableCash: p.availableCash,
      marginDeposits: p.marginDeposits,
      netAssetValue: p.netAssetValue,
      totalReturnPct: p.totalReturnPct,
      positions: p.positions,
      tradeHistory: p.tradeHistory,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
  return JSON.stringify(exportPayload, null, 2);
}

// 全班名單：每 20 秒向伺服器更新一次
export function subscribeToAllPlayers(callback: (players: StudentProfile[]) => void): () => void {
  let stopped = false;
  const tick = async () => {
    try {
      const list = await fetchAllPlayers();
      if (!stopped) callback(list.map(p => ({ ...p, uid: p.uid || getOrGeneratePermanentUID(p.studentName, p.uid), schemaVersion: p.schemaVersion || 3 })));
    } catch (e) {
      console.warn('讀取全班名單失敗:', e);
    }
  };
  tick();
  const id = setInterval(tick, 20_000);
  return () => { stopped = true; clearInterval(id); };
}

function purgeLocal(cleanLower: string) {
  try {
    for (const key of ['finmind_entered_player_profiles', 'finmind_student_profiles_v3_authentic']) {
      const str = localStorage.getItem(key);
      if (!str) continue;
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) localStorage.setItem(key, JSON.stringify(parsed.filter((p: any) => p?.studentName?.trim().toLowerCase() !== cleanLower)));
    }
    const bl = JSON.parse(localStorage.getItem('finmind_deleted_students_blacklist') || '[]');
    if (!bl.includes(cleanLower)) { bl.push(cleanLower); localStorage.setItem('finmind_deleted_students_blacklist', JSON.stringify(bl)); }
  } catch { /* ignore */ }
}

/** 刪除學員：伺服器端需版主權限 */
export async function deletePlayerFromFirebase(studentName: string, _docId?: string): Promise<boolean> {
  const name = studentName.trim();
  purgeLocal(name.toLowerCase());
  const admin = adminHeaders();
  if (!admin) return false;
  try {
    const r = await fetch('/api/admin/players/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...admin }, body: JSON.stringify({ name }) });
    recordAuditLog('PLAYER_DELETE', '教師管理中心', `已刪除學生【${name}】帳戶`).catch(() => {});
    return r.ok;
  } catch {
    return false;
  }
}

/** 資金歸零重來（版主） */
export async function resetPlayerInFirebase(studentName: string, _initialCapital = 50000000): Promise<boolean> {
  const admin = adminHeaders();
  if (!admin) return false;
  const r = await fetch('/api/admin/players/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', ...admin }, body: JSON.stringify({ name: studentName }) }).catch(() => null);
  return Boolean(r?.ok);
}

export async function resetAllPlayersInFirebase(): Promise<{ success: boolean; count: number }> {
  const admin = adminHeaders();
  if (!admin) return { success: false, count: 0 };
  const r = await fetch('/api/admin/players/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', ...admin }, body: JSON.stringify({ all: true }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return { success: Boolean(r?.ok), count: j.count || 0 };
}
