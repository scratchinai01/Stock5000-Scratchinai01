/**
 * 學員帳號（伺服器保存）：註冊、登入、預設密碼強制改、舊資料搬家、權限、名單不含密碼
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.PLAYERS_MEMORY = '1';
process.env.PLAYER_TOKEN_SECRET = 'test-secret';
const P = await import('../server-lib/players.ts');

const req = (token?: string) => ({ headers: token ? { 'x-player-token': token } : {} });
const base = { initialCapital: 50000000, availableCash: 50000000, positions: [], tradeHistory: [] };

// 註冊與登入
const r1 = await P.register({ ...base, studentName: '小明' }, 'abcd1234');
assert.equal(r1.status, 200);
assert.equal(r1.body.mustChangePassword, false);
assert.equal((await P.register({ ...base, studentName: ' 小明 ' }, 'x123')).status, 409, '同名不可重複註冊');
assert.equal((await P.register({ ...base, studentName: 'Admin' }, 'x123')).status, 403, '保留名稱不可註冊');
assert.equal((await P.login('小明', 'wrong', '1.1.1.1')).status, 401);
const ok = await P.login('小明', 'abcd1234', '1.1.1.1');
assert.equal(ok.status, 200);
assert.ok(!('passwordHash' in ok.body.profile) && !('password' in ok.body.profile), '回傳資料不可含密碼');
assert.equal((await P.login('不存在', 'x', '1.1.1.1')).body.notFound, true);

// 名單不含密碼
const list = await P.listPlayers();
assert.ok(list.every((p: any) => !('passwordHash' in p) && !('password' in p)));

// 權限：只能存自己的資料
const token = ok.body.token as string;
assert.equal(P.playerFromToken(req(token)), '小明');
assert.equal((await P.saveProfile({ player: '小明', admin: false }, { ...base, studentName: '小明', availableCash: 123 })).status, 200);
assert.equal((await P.saveProfile({ player: '小明', admin: false }, { ...base, studentName: '別人' })).status, 401);
assert.equal((await P.saveProfile({ player: null, admin: false }, { ...base, studentName: '小明' })).status, 401);
await P.saveProfile({ player: '小明', admin: false }, { ...base, studentName: '小明', password: 'hack', passwordHash: 'scrypt$x$y' });
assert.equal((await P.login('小明', 'abcd1234', '1.1.1.2')).status, 200, '網頁送來的密碼欄位不可覆蓋伺服器密碼');
const [n, exp, sig] = token.split('.');
assert.equal(P.playerFromToken(req(`${n}.${Number(exp) + 1}.${sig}`)), null, '竄改權杖無效');

// 預設密碼 money888 → 必須改密碼；改完才解除
await P.register({ ...base, studentName: '老帳號' }, 'money888');
const m = await P.login('老帳號', 'money888', '1.1.1.3');
assert.equal(m.body.mustChangePassword, true);
assert.equal((await P.changePassword({ player: '老帳號', admin: false }, '老帳號', 'money888', 'money888')).status, 400, '不能改回預設密碼');
assert.equal((await P.changePassword({ player: '老帳號', admin: false }, '老帳號', 'wrong', 'newpass1')).status, 401);
assert.equal((await P.changePassword({ player: '老帳號', admin: false }, '老帳號', 'money888', 'newpass1')).status, 200);
assert.equal((await P.login('老帳號', 'newpass1', '1.1.1.3')).body.mustChangePassword, false);

// 版主重設臨時密碼 → 學員登入後必須改
assert.equal((await P.adminResetPassword('小明', 'temp99')).status, 200);
assert.equal((await P.login('小明', 'temp99', '1.1.1.4')).body.mustChangePassword, true);

// 舊資料搬家：本機舊密碼雜湊要和輸入的密碼相符
const legacy = 'sha256:' + crypto.createHash('sha256').update('finmind_nt50m_salt_mypw').digest('hex');
assert.ok(P.legacyMatches('mypw', legacy));
assert.equal((await P.register({ ...base, studentName: '舊學員', availableCash: 777 }, 'other', { migrate: true, legacyHash: legacy })).status, 401);
const mg = await P.register({ ...base, studentName: '舊學員', availableCash: 777 }, 'mypw', { migrate: true, legacyHash: legacy });
assert.equal(mg.status, 200);
assert.equal(mg.body.profile.availableCash, 777, '搬家要保留原本的資產資料');

// 錯誤次數限制
for (let i = 0; i < 8; i++) await P.login('舊學員', 'bad', '9.9.9.9');
assert.equal((await P.login('舊學員', 'mypw', '9.9.9.9')).status, 429);
// 忘記密碼提示：首尾字、不外流到名單
assert.equal(P.makeHint('abc12345'), 'a ＊＊＊ 5');
assert.equal(P.makeHint('abc'), 'a ＊＊＊');
const h1 = await P.passwordHint('老帳號', '7.7.7.7');
assert.equal(h1.body.hint, 'n ＊＊＊ 1');
const h2 = await P.passwordHint('小明', '7.7.7.7');
assert.ok(h2.body.note?.includes('臨時密碼'));
assert.equal((await P.passwordHint('沒這人', '7.7.7.7')).status, 404);
assert.ok(!(await P.listPlayers()).some((x: any) => 'passwordHint' in x), '名單不能帶出提示');
for (let i = 0; i < 10; i++) await P.passwordHint('老帳號', '6.6.6.6');
assert.equal((await P.passwordHint('老帳號', '6.6.6.6')).status, 429);
console.log('players.test：學員帳號檢查通過');
process.exit(0);
