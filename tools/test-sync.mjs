#!/usr/bin/env node
/* ============================================================
 * 云同步语义端到端单测：测试 API 服务（stub SSO）+ 真实 sync 模块。
 * 覆盖：登录探测 / 云新拉取 / 本地新推送 / 同源不动作 / 推送队列重试。
 * 用法：node tools/test-sync.mjs
 * ============================================================ */
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { boot } from './_loader.mjs';
import { sync } from '../src/api/sync.js';
import { saveStore, writeSaveStore } from '../src/core/save.js';
import { bus, EV } from '../src/core/bus.js';

const SESSIONS = { 'sess-alice': 'alice' };
const { server } = createApp({
  verify: async cookie => SESSIONS[cookie.split(';')[0].trim()] || null,
  dbPath: ':memory:',
});
const base = await new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));

const TA = await boot();
sync._configure({ base, cookie: 'sess-alice' });

const snap = (ts, hp) => ({ v: 1, gameId: 'fanren', name: '云同步', ts, playtime: 1, scene: 'start', sceneTitle: '起点', state: { gameId: 'fanren', hp: hp ?? 10 } });
function putLocal(gid, slot, s) {
  const store = saveStore(gid);
  if (slot === 'auto') store.auto = s; else store.slots[+slot] = s;
  writeSaveStore(gid, store);
}

/* 0) 未配置时 init：带 cookie → 登录态 */
assert.equal(await sync.init(), 'alice');
assert.ok(sync.username);

/* 1) 云端较新 → 拉取覆盖本地 */
putLocal('fanren', 'auto', snap(1000));
const put = await fetch(`${base}/api/saves/fanren/auto`, {
  method: 'PUT', headers: { Cookie: 'sess-alice', 'Content-Type': 'application/json' },
  body: JSON.stringify({ snapshot: snap(5000, 99) }),
});
assert.equal(put.status, 200);
const acts1 = await sync.reconcile('fanren');
assert.deepEqual(acts1, [{ slot: 'auto', action: 'pulled' }]);
assert.equal(TA.saves.readSlot('fanren', 'auto').ts, 5000, '本地应被云端新档覆盖');
assert.equal(TA.saves.readSlot('fanren', 'auto').state.hp, 99);

/* 2) 本地较新 → 推送到云端 */
putLocal('fanren', '1', snap(9000));
const acts2 = await sync.reconcile('fanren');
assert.deepEqual(acts2, [{ slot: '1', action: 'pushed' }]);
const back = await fetch(`${base}/api/saves/fanren/1`, { headers: { Cookie: 'sess-alice' } });
assert.equal((await back.json()).snapshot.ts, 9000, '云端应收到本地新档');

/* 3) 同源（<1s 偏差）→ 不动作 */
putLocal('fanren', '2', snap(10000));
await fetch(`${base}/api/saves/fanren/2`, {
  method: 'PUT', headers: { Cookie: 'sess-alice', 'Content-Type': 'application/json' },
  body: JSON.stringify({ snapshot: snap(10000 + 500) }),
});
const acts3 = await sync.reconcile('fanren');
assert.equal(acts3.filter(a => a.slot === '2').length, 0, '1s 内偏差视为同源');

/* 4) 云端有、本地无 → 拉取补齐 */
const acts4 = await sync.reconcile('panlong');  // panlong 本地全空 → 无动作
assert.deepEqual(acts4, []);
await fetch(`${base}/api/saves/panlong/auto`, {
  method: 'PUT', headers: { Cookie: 'sess-alice', 'Content-Type': 'application/json' },
  body: JSON.stringify({ snapshot: { ...snap(7000), gameId: 'panlong' } }),
});
const acts5 = await sync.reconcile('panlong');
assert.deepEqual(acts5, [{ slot: 'auto', action: 'pulled' }]);
assert.equal(TA.saves.readSlot('panlong', 'auto').ts, 7000);

/* 5) 本地写入事件触发后台推送（EV.SAVED） */
const s = TA.newGame('daomu', '同步员', {});
putLocal('daomu', 'auto', snap(1));
s.scene = 'start';
TA.saves.autosave(s);                       // 触发 EV.SAVED → push
await new Promise(r => setTimeout(r, 300)); // 等 fire-and-forget 完成
const remote = await (await fetch(`${base}/api/saves/daomu/auto`, { headers: { Cookie: 'sess-alice' } })).json();
assert.ok(remote.snapshot, '自动档应已推送到云端');

/* 6) 后端不可达 → 静默入队，恢复后冲刷 */
sync._configure({ base: 'http://127.0.0.1:1/', cookie: 'sess-alice' });   // 指向不存在的端口
putLocal('daomu', '0', snap(20000));
const acts6 = await sync.reconcile('daomu');  // push 失败 → 入队
assert.equal(acts6.filter(a => a.slot === '0').length, 0);
sync._configure({ base, cookie: 'sess-alice' });
await sync.init();                            // init 会冲刷队列
const back2 = await (await fetch(`${base}/api/saves/daomu/0`, { headers: { Cookie: 'sess-alice' } })).json();
assert.equal(back2.snapshot.ts, 20000, '队列应在恢复后冲刷推送');

server.close();
console.log('✅ 云同步端到端单测全部通过（拉取/推送/同源/补齐/事件推送/离线队列）');
