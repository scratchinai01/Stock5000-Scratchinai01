import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

export const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// In-memory cache for OAuth access token (per workspace-integration security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const DEFAULT_SPREADSHEET_ID = '1s3-luh50L5X7-5HxBDxKgLokKK_rXWMPDCjPeNvTS_U';
export const DEFAULT_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_SPREADSHEET_ID}/edit?gid=0#gid=0`;

const provider = new GoogleAuthProvider();
SHEETS_SCOPES.forEach(scope => provider.addScope(scope));

/**
 * Initialize Google Auth listener to keep in-memory token state in sync
 */
export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Sign in with Google to obtain OAuth Access Token for Google Sheets API
 */
export const signInWithGoogleSheets = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('無法從 Google 取得授權金鑰 (AccessToken)，請重試。');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sheets sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export interface AuditRecordPayload {
  timestamp?: string;
  auditTarget: string; // e.g. "2330 台積電 行情真偽" / "全市場 120 檔綜合審計"
  statusText: string;  // e.g. "✅ 資料真實無幻覺" / "⚠️ 發現異常"
  metricsText: string; // e.g. "現價 2,500 / 昨收 2,510 / 漲幅 -0.4% / 五檔合理"
  geminiExplanation: string; // Detailed analysis from Gemini 3.8 Flash
  auditorName?: string; // e.g. "程瑋翔 (SUPERUSER)"
  spreadsheetId?: string;
}

/**
 * Append an anomaly audit record to the user's designated Google Sheet
 */
export async function appendAuditRowToGoogleSheet(
  payload: AuditRecordPayload,
  tokenOverride?: string
): Promise<{ success: boolean; updatedRange?: string; error?: string }> {
  const token = tokenOverride || cachedAccessToken;
  if (!token) {
    return {
      success: false,
      error: '尚未完成 Google 帳號授權，請先點擊「Google 授權連線」取得試算表寫入權限。',
    };
  }

  const spreadsheetId = payload.spreadsheetId || DEFAULT_SPREADSHEET_ID;
  const now = new Date();
  const twDateStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

  const rowValues = [
    twDateStr,
    payload.auditTarget,
    payload.statusText,
    payload.metricsText,
    payload.geminiExplanation,
    payload.auditorName || '程瑋翔 (最高管理者)',
  ];

  try {
    // 1. Fetch spreadsheet sheet title to ensure accurate range
    let targetSheetTitle = 'Sheet1';
    try {
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta?.sheets?.[0]?.properties?.title) {
          targetSheetTitle = meta.sheets[0].properties.title;
        }
      }
    } catch (e) {
      console.warn('Could not read sheets metadata, fallback to Sheet1:', e);
    }

    const range = encodeURIComponent(`${targetSheetTitle}!A:F`);
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${targetSheetTitle}!A:F`,
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `Google Sheets API 回應錯誤代碼 ${res.status}`);
    }

    const data = await res.json();
    return {
      success: true,
      updatedRange: data?.updates?.updatedRange,
    };
  } catch (err: any) {
    console.error('Failed to append row to Google Sheets:', err);
    return {
      success: false,
      error: err?.message || '寫入 Google 試算表失敗，請檢查權限或試算表共用設定。',
    };
  }
}
