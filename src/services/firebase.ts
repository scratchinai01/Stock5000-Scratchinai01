import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  onSnapshot,
  getDocFromServer,
  query,
  limit,
  orderBy,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { StudentProfile, ImmutableTransaction, BackupSnapshot, AuditLog } from '../types/market';
import { hashPassword, isHashedPassword, verifyPassword } from '../utils/cryptoUtils';

export const CURRENT_SCHEMA_VERSION = 3;

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use the specific firestoreDatabaseId provisioned
export const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

// Designated Administrator & Superuser
export const SUPERUSER_NAME = '程瑋翔';
export const DEFAULT_SUPERUSER_PASSWORD = '3226';
export const ADMIN_EMAIL = 'scratchinai01@gmail.com';

export function isAdminEmail(identifier?: string | null): boolean {
  if (!identifier) return false;
  const clean = identifier.trim().toLowerCase();
  return (
    clean === ADMIN_EMAIL.toLowerCase() ||
    clean === SUPERUSER_NAME.toLowerCase() ||
    clean === '程瑋翔' ||
    clean === 'admin' ||
    clean === 'superuser' ||
    clean.includes('程瑋翔') ||
    clean.includes('scratchinai01@gmail.com')
  );
}

let currentUser: User | null = null;

export const ensureAuth = async (): Promise<User | null> => {
  if (currentUser) return currentUser;
  if (auth.currentUser) {
    currentUser = auth.currentUser;
    return currentUser;
  }
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      currentUser = user;
      resolve(user);
    });
    setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 300);
  });
};

// Validate Firestore connection
export async function testConnection(): Promise<boolean> {
  try {
    await ensureAuth().catch(() => null);
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error: any) {
    if (error?.message && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or permissions pending.');
    }
    return false;
  }
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

// Fetch player profile from Firebase by name
export async function getPlayerProfileFromFirebase(
  studentName: string
): Promise<StudentProfile | null> {
  try {
    const docId = getPlayerDocId(studentName);
    const snap = await getDoc(doc(db, 'players', docId));
    if (snap.exists()) {
      return snap.data() as StudentProfile;
    }
    return null;
  } catch (err) {
    console.warn('Failed to fetch player profile from Firebase:', err);
    return null;
  }
}

// Save player profile to Firebase with Schema v3 and Permanent UID
export async function savePlayerProfileToFirebase(
  profile: StudentProfile
): Promise<boolean> {
  try {
    const docId = getPlayerDocId(profile.studentName);
    const uid = getOrGeneratePermanentUID(profile.studentName, profile.uid);

    let totalSecuritiesVal = 0;
    let totalMargin = 0;
    let totalUnrealized = 0;

    (profile.positions || []).forEach(pos => {
      totalUnrealized += pos.unrealizedPnL || 0;
      if (pos.category === 'futures') {
        totalMargin += pos.totalCostOrMargin || 0;
      } else {
        totalSecuritiesVal += pos.notionalValue || 0;
      }
    });

    const initialCapital = profile.initialCapital || 50000000;
    const availableCash = typeof profile.availableCash === 'number' ? profile.availableCash : 50000000;
    const netAssetValue = availableCash + totalSecuritiesVal + totalMargin + totalUnrealized;
    const totalReturnPct = ((netAssetValue - initialCapital) / initialCapital) * 100;

    // Cryptographic SHA-256 Password Hash Protection
    let secureHashedPassword = profile.password;
    if (!secureHashedPassword) {
      secureHashedPassword = await hashPassword(
        profile.studentName.trim() === SUPERUSER_NAME ? DEFAULT_SUPERUSER_PASSWORD : 'money888'
      );
    } else if (!isHashedPassword(secureHashedPassword)) {
      secureHashedPassword = await hashPassword(secureHashedPassword);
    }

    const rawData = {
      ...profile,
      id: docId,
      uid,
      password: secureHashedPassword,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      role: profile.role || 'student',
      status: profile.status || 'active',
      studentName: profile.studentName.trim() || '未命名操盤手',
      initialCapital,
      availableCash,
      netAssetValue,
      totalReturnPct,
      updatedAt: Date.now(),
      createdAt: profile.createdAt || Date.now(),
    };

    // Strip any undefined keys
    const dataToSave: Record<string, any> = {};
    Object.entries(rawData).forEach(([key, val]) => {
      if (val !== undefined) {
        dataToSave[key] = val;
      }
    });
    await setDoc(doc(db, 'players', docId), dataToSave, { merge: true });
    return true;
  } catch (err: any) {
    console.warn('Could not sync player profile to Firebase (saved locally):', err?.message || err);
    return false;
  }
}

// Update student password in Firebase and record audit
export async function updateStudentPassword(studentName: string, newPassword: string): Promise<boolean> {
  try {
    const cleanName = studentName.trim();
    const cleanLower = cleanName.toLowerCase();
    const docId = getPlayerDocId(cleanName);

    // Cryptographic SHA-256 Hash
    const secureHashedPassword = isHashedPassword(newPassword)
      ? newPassword
      : await hashPassword(newPassword);
    
    await setDoc(
      doc(db, 'players', docId),
      {
        password: secureHashedPassword,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Also update any matching documents by studentName
    try {
      const snap = await getDocs(collection(db, 'players'));
      for (const d of snap.docs) {
        const data = d.data() as StudentProfile;
        if (data && data.studentName && data.studentName.trim().toLowerCase() === cleanLower && d.id !== docId) {
          await setDoc(doc(db, 'players', d.id), { password: secureHashedPassword, updatedAt: Date.now() }, { merge: true });
        }
      }
    } catch (e) {
      console.warn('Sync other matching password docs error:', e);
    }

    // Mirror to local caches (hashed to prevent plain text in localStorage)
    try {
      const enteredStr = localStorage.getItem('finmind_entered_player_profiles');
      if (enteredStr) {
        const parsed = JSON.parse(enteredStr);
        if (Array.isArray(parsed)) {
          const updated = parsed.map((p: any) =>
            p?.studentName?.trim().toLowerCase() === cleanLower ? { ...p, password: secureHashedPassword } : p
          );
          localStorage.setItem('finmind_entered_player_profiles', JSON.stringify(updated));
        }
      }
      const savedStr = localStorage.getItem('finmind_student_profiles_v3_authentic');
      if (savedStr) {
        const parsed = JSON.parse(savedStr);
        if (Array.isArray(parsed)) {
          const updated = parsed.map((p: any) =>
            p?.studentName?.trim().toLowerCase() === cleanLower ? { ...p, password: secureHashedPassword } : p
          );
          localStorage.setItem('finmind_student_profiles_v3_authentic', JSON.stringify(updated));
        }
      }
    } catch {}

    await recordAuditLog(
      'PASSWORD_UPDATE',
      studentName,
      `學生【${studentName}】已成功更新密碼`
    );
    return true;
  } catch (err: any) {
    console.warn('Failed to update student password in Firebase:', err?.message || err);
    return false;
  }
}

// 2. Immutable Transaction Ledger (Append-Only, No Delete, No Edit)
export async function saveImmutableTransaction(tx: ImmutableTransaction): Promise<boolean> {
  try {
    // Write to Firestore /transactions/{txId}
    await setDoc(doc(db, 'transactions', tx.transactionId), {
      ...tx,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: tx.createdAt || Date.now(),
    });

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
  try {
    const q = query(collection(db, 'transactions'), limit(limitCount));
    const snap = await getDocs(q);
    const list: ImmutableTransaction[] = [];
    snap.forEach(d => {
      list.push(d.data() as ImmutableTransaction);
    });
    if (list.length > 0) {
      return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch (e) {
    console.warn('Fetch remote transactions error, using local mirror:', e);
  }

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

  try {
    await setDoc(doc(db, 'audit_logs', logEntry.id), logEntry);
  } catch {
    // Local fallback
  }

  const localLogsJson = localStorage.getItem('finmind_audit_logs_v3');
  const localLogs: AuditLog[] = localLogsJson ? JSON.parse(localLogsJson) : [];
  localLogs.unshift(logEntry);
  localStorage.setItem('finmind_audit_logs_v3', JSON.stringify(localLogs.slice(0, 200)));
}

export async function fetchAuditLogs(limitCount = 50): Promise<AuditLog[]> {
  try {
    const snap = await getDocs(query(collection(db, 'audit_logs'), limit(limitCount)));
    const list: AuditLog[] = [];
    snap.forEach(d => list.push(d.data() as AuditLog));
    if (list.length > 0) {
      return list.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch (e) {
    console.warn('Fetch audit logs error, using local logs:', e);
  }

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

  // 1. Save to Firestore
  try {
    await setDoc(doc(db, 'backups', snapshotId), {
      ...snapshot,
      // For firestore document size safety, serialize students JSON
      studentsSnapshotJson: JSON.stringify(profiles),
    });
  } catch (e) {
    console.warn('Remote backup snapshot write error, saved locally:', e);
  }

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
  try {
    const snap = await getDocs(query(collection(db, 'backups'), limit(20)));
    const list: BackupSnapshot[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: data.id,
        snapshotTime: data.snapshotTime,
        timestamp: data.timestamp,
        reason: data.reason,
        totalStudents: data.totalStudents,
        totalTransactions: data.totalTransactions,
        schemaVersion: data.schemaVersion || 3,
        studentsSnapshot: data.studentsSnapshot || (data.studentsSnapshotJson ? JSON.parse(data.studentsSnapshotJson) : []),
      });
    });
    if (list.length > 0) {
      return list.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (e) {
    console.warn('Fetch backup snapshots error, using local snapshots:', e);
  }

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
    platform: 'FinMind 5000萬股市大富翁 (教師金融模擬平台)',
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

// Subscribe to all players for class leaderboard (Real-time updates! Supports 100+ players)
export function subscribeToAllPlayers(
  callback: (players: StudentProfile[]) => void
): () => void {
  try {
    const q = query(collection(db, 'players'), limit(150));
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const players: StudentProfile[] = [];
        const seenNames = new Set<string>();
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as StudentProfile;
          if (data && data.studentName) {
            const cleanName = data.studentName.trim();
            if (!seenNames.has(cleanName.toLowerCase())) {
              seenNames.add(cleanName.toLowerCase());
              players.push({
                ...data,
                id: docSnap.id || data.id,
                uid: data.uid || getOrGeneratePermanentUID(data.studentName, data.uid),
                schemaVersion: data.schemaVersion || 3,
              });
            }
          }
        });
        callback(players);
      },
      err => {
        console.warn('Failed to subscribe to players:', err);
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn('Subscribe error:', e);
    return () => {};
  }
}

// Delete player from Firebase and local caches
export async function deletePlayerFromFirebase(studentName: string, docId?: string): Promise<boolean> {
  const cleanName = studentName.trim();
  const cleanLower = cleanName.toLowerCase();

  // 1. Synchronously purge all local storage keys immediately
  try {
    const enteredStr = localStorage.getItem('finmind_entered_player_profiles');
    if (enteredStr) {
      const parsed = JSON.parse(enteredStr);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((p: any) => p?.studentName?.trim().toLowerCase() !== cleanLower);
        localStorage.setItem('finmind_entered_player_profiles', JSON.stringify(filtered));
      }
    }
    const savedStr = localStorage.getItem('finmind_student_profiles_v3_authentic');
    if (savedStr) {
      const parsed = JSON.parse(savedStr);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((p: any) => p?.studentName?.trim().toLowerCase() !== cleanLower);
        localStorage.setItem('finmind_student_profiles_v3_authentic', JSON.stringify(filtered));
      }
    }
    // Add to persistent blacklist
    const blacklistStr = localStorage.getItem('finmind_deleted_students_blacklist');
    const blacklist = blacklistStr ? JSON.parse(blacklistStr) : [];
    if (!blacklist.includes(cleanLower)) {
      blacklist.push(cleanLower);
      localStorage.setItem('finmind_deleted_students_blacklist', JSON.stringify(blacklist));
    }
  } catch (e) {
    console.warn('Purge local storage error:', e);
  }

  // 2. Wrap remote Firestore delete in a 2500ms timeout race so UI NEVER hangs
  const remoteDelete = async (): Promise<boolean> => {
    try {
      // Direct docId delete
      if (docId) {
        try {
          await deleteDoc(doc(db, 'players', docId));
        } catch (e) {
          console.warn('Delete by docId error:', e);
        }
      }

      // Standard calculated docId delete
      const stdDocId = getPlayerDocId(cleanName);
      try {
        await deleteDoc(doc(db, 'players', stdDocId));
      } catch (e) {
        console.warn('Delete by getPlayerDocId error:', e);
      }

      // Scan all docs in players to find any document matching studentName or id
      try {
        const snap = await getDocs(collection(db, 'players'));
        for (const d of snap.docs) {
          const data = d.data() as StudentProfile;
          if (
            (data && data.studentName && data.studentName.trim().toLowerCase() === cleanLower) ||
            d.id === docId ||
            d.id === stdDocId
          ) {
            await deleteDoc(doc(db, 'players', d.id));
          }
        }
      } catch (e) {
        console.warn('Scan & delete matching players error:', e);
      }

      recordAuditLog('PLAYER_DELETE', '教師管理中心', `已永久刪除學生【${studentName}】帳戶與所有紀錄`).catch(() => {});
      return true;
    } catch (err) {
      console.warn('Remote delete warning:', err);
      return true;
    }
  };

  const timeoutPromise = new Promise<boolean>(resolve => setTimeout(() => resolve(true), 2500));
  return Promise.race([remoteDelete(), timeoutPromise]);
}

// Reset single player profile in Firebase back to initial 50,000,000 cash
export async function resetPlayerInFirebase(
  studentName: string,
  initialCapital = 50000000
): Promise<boolean> {
  try {
    const docId = getPlayerDocId(studentName);
    const snap = await getDoc(doc(db, 'players', docId));
    const current = snap.exists() ? (snap.data() as StudentProfile) : null;
    const uid = current?.uid || getOrGeneratePermanentUID(studentName);

    let securePwd = current?.password;
    if (!securePwd) {
      securePwd = await hashPassword(
        studentName.trim() === SUPERUSER_NAME ? DEFAULT_SUPERUSER_PASSWORD : 'money888'
      );
    } else if (!isHashedPassword(securePwd)) {
      securePwd = await hashPassword(securePwd);
    }

    const resetData: Record<string, any> = {
      id: docId,
      uid,
      password: securePwd,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      role: 'student',
      status: 'active',
      studentName: studentName.trim(),
      teamName: current?.teamName || '實務投資隊',
      characterRole: current?.characterRole || 'wealth_tycoon',
      roleTitle: current?.roleTitle || '5000萬資產掌門人',
      avatarEmoji: current?.avatarEmoji || '👑',
      strategyBadge: current?.strategyBadge || '大富翁·全新起跑',
      customMotto: current?.customMotto || '重新配置，再戰股海！',
      initialCapital,
      availableCash: initialCapital,
      marginDeposits: 0,
      netAssetValue: initialCapital,
      totalReturnPct: 0,
      positions: [],
      tradeHistory: [],
      benchmarkDate: 'FinMind 即時撮合',
      updatedAt: Date.now(),
      createdAt: current?.createdAt || Date.now(),
    };

    await setDoc(doc(db, 'players', docId), resetData, { merge: false });
    await recordAuditLog(
      'PLAYER_RESET',
      '教師管理中心',
      `重設學生【${studentName}】資金為 5,000 萬，保留永久 UID ${uid}`,
      uid
    );
    return true;
  } catch (err) {
    console.warn('Failed to reset player in Firebase:', err);
    return false;
  }
}

// Reset ALL players in Firebase back to initial 50M
export async function resetAllPlayersInFirebase(): Promise<{ success: boolean; count: number }> {
  try {
    const snap = await getDocs(collection(db, 'players'));
    let count = 0;
    const promises = snap.docs.map(async docSnap => {
      const p = docSnap.data() as StudentProfile;
      if (p && p.studentName) {
        await resetPlayerInFirebase(p.studentName);
        count++;
      }
    });
    await Promise.all(promises);
    await recordAuditLog('ALL_PLAYERS_RESET', '教師管理中心', `已將全班 ${count} 位學生帳戶初始化為 5,000 萬純現金`);
    return { success: true, count };
  } catch (err) {
    console.warn('Failed to reset all players in Firebase:', err);
    return { success: false, count: 0 };
  }
}

// Run connection check on initialization
testConnection().catch(() => {});
