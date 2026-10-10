// 測 history.ts：單次抓取、查無資料記憶、LRU 上限（Firestore 不可用時直接走行情來源）
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent.json';
process.env.HISTORY_CACHE_MAX = '3';
let calls: Record<string, number> = {};
const real = globalThis.fetch;
globalThis.fetch = (async (url: any, opts: any) => {
  const u = new URL(String(url));
  if (u.hostname.includes('finmindtrade')) {
    const id = u.searchParams.get('data_id')!; const ds = u.searchParams.get('dataset')!;
    calls[id] = (calls[id] || 0) + 1;
    await new Promise(r => setTimeout(r, 50));
    const data = id === '9999' ? [] : [{ date: '2026-10-08', stock_id: id, open: 10, max: 11, min: 9, close: 10.5, Trading_Volume: 1000, Trading_money: 10500 }];
    return new Response(JSON.stringify({ status: 200, msg: 'success', data }), { status: 200 });
  }
  return real(url, opts);
}) as any;
const { getHistory, historyCacheStats } = await import('../server-lib/history.ts');
const assert = (c: any, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
// 1. 10 人同時查同一檔 → 只抓一次（2 個資料集 = 2 次呼叫）
const r = await Promise.all(Array.from({ length: 10 }, () => getHistory('2330', 't', { name: '台積電', market: 'twse' })));
assert(r.every(x => x && x.close[0] === 10.5), '同時查詢都拿到資料');
assert(calls['2330'] === 2, `同時 10 人只向來源抓一次（實際 ${calls['2330']} 次呼叫）`);
// 2. 快取命中不再抓
await getHistory('2330', 't'); assert(calls['2330'] === 2, '快取命中不再呼叫來源');
// 3. 查無資料記住
assert((await getHistory('9999', 't')) === null, '查無資料回 null');
await getHistory('9999', 't'); await getHistory('9999', 't');
assert(calls['9999'] === 2, `查無資料的代號只查一次（實際 ${calls['9999']}）`);
// 4. LRU 上限 3
for (const id of ['1101', '1102', '1103', '1104']) await getHistory(id, 't');
const st = historyCacheStats(); assert(st.cached === 3, `記憶體快取最多 3 檔（實際 ${st.cached}）`);
await getHistory('2330', 't'); assert(calls['2330'] === 4, '最舊的被淘汰後會重新抓');
// 5. 來源錯誤不記成查無資料
globalThis.fetch = (async () => new Response(JSON.stringify({ status: 402, msg: 'limit' }), { status: 402 })) as any;
let threw = false; try { await getHistory('2603', 't'); } catch { threw = true; }
assert(threw && historyCacheStats().missing === 1, '來源錯誤會回報錯誤、不記入查無資料');
console.log('ALL HISTORY CACHE TESTS PASSED'); process.exit(0);
