/**
 * 版主登入：密碼比對、權杖驗證、過期、竄改、錯誤次數限制
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent.json'; // 測試不寫 Firestore（寫入失敗只會警告）
process.env.ADMIN_PASSWORD_SHA256 = crypto.createHash('sha256').update('stock5000-admin:test-pass-123').digest('hex');
const { adminLogin, isAdmin } = await import('../server-lib/access.ts');

const req = (ip: string, auth?: string) => ({ headers: { 'x-forwarded-for': ip, 'user-agent': 'test', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, socket: {} });

// 正確帳密
const ok = await adminLogin(req('1.1.1.1'), { username: 'Admin', password: 'test-pass-123' });
assert.ok(ok.ok, '正確帳密應登入成功');
const token = (ok as any).token as string;
assert.ok(isAdmin(req('9.9.9.9', token)), '權杖應有效');

// 錯誤帳密
assert.equal((await adminLogin(req('2.2.2.2'), { username: 'admin', password: 'wrong' })).ok, false);
assert.equal((await adminLogin(req('2.2.2.3'), { username: 'root', password: 'test-pass-123' })).ok, false);

// 竄改、過期、沒有權杖
const [u, exp, sig] = token.split('.');
assert.equal(isAdmin(req('x', `${u}.${Number(exp) + 999999}.${sig}`)), false, '竄改到期時間應失效');
assert.equal(isAdmin(req('x', `${u}.${exp}.${sig.slice(0, -2)}xx`)), false, '竄改簽章應失效');
assert.equal(isAdmin(req('x')), false);
const pastPayload = `admin.${Date.now() - 1000}`;
const pastSig = crypto.createHmac('sha256', `admin-token:${process.env.ADMIN_PASSWORD_SHA256}`).update(pastPayload).digest('base64url');
assert.equal(isAdmin(req('x', `${pastPayload}.${pastSig}`)), false, '過期權杖應失效');

// 同一 IP 連續錯 5 次後封鎖（第 6 次即使密碼正確也拒絕）
for (let i = 0; i < 5; i++) await adminLogin(req('3.3.3.3'), { username: 'admin', password: 'nope' });
const locked = await adminLogin(req('3.3.3.3'), { username: 'admin', password: 'test-pass-123' });
assert.equal(locked.ok, false);
assert.equal((locked as any).status, 429);

// 沒設定密碼雜湊時不開放
process.env.ADMIN_PASSWORD_SHA256 = '';
assert.equal((await adminLogin(req('4.4.4.4'), { username: 'admin', password: 'test-pass-123' })).ok, false);
assert.equal(isAdmin(req('x', token)), false);
console.log('access.test：版主登入檢查通過');
process.exit(0);
