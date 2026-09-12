#!/usr/bin/env node
/* ============================================================
 * API 服务单测：注入 stub verify，全 HTTP 黑盒走查。
 * 覆盖：健康检查免认证 / 401 门 / 身份注册 / PUT+GET 快照 /
 * 覆盖写 newer-wins / 用户隔离 / 参数与格式校验 / 404。
 * 用法：node tools/test-server.mjs
 * ============================================================ */
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

const SESSIONS = { 'sess-alice': 'alice', 'sess-bob': 'bob' };
const { server } = createApp({
  verify: async cookie => SESSIONS[cookie.split(';')[0].trim()] || null,
  dbPath: ':memory:',
});
const base = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
console.log('测试服务:', base);

async function call(method, path, { cookie, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* healthz 等 */ }
  return { status: res.status, data };
}

const snap = ts => ({ v: 1, gameId: 'fanren', name: '测试', ts, playtime: 1, scene: 'start', sceneTitle: '起点', state: { gameId: 'fanren', hp: 10 } });

/* 1) 健康检查免认证 */
assert.equal((await call('GET', '/api/healthz')).status, 200);

/* 2) 未登录 401（me / saves 读写） */
assert.equal((await call('GET', '/api/me')).status, 401);
assert.equal((await call('GET', '/api/saves/fanren/auto')).status, 401);
assert.equal((await call('PUT', '/api/saves/fanren/auto', { body: { snapshot: snap(1) } })).status, 401);
assert.equal((await call('GET', '/api/me', { cookie: 'sess-nobody' })).status, 401);

/* 3) 身份注册 + me */
const me = await call('GET', '/api/me', { cookie: 'sess-alice' });
assert.equal(me.status, 200);
assert.equal(me.data.username, 'alice');

/* 4) 首次 GET 无云端档 → 404 */
assert.equal((await call('GET', '/api/saves/fanren/auto', { cookie: 'sess-alice' })).status, 404);

/* 5) PUT + GET 往返 */
const p1 = await call('PUT', '/api/saves/fanren/auto', { cookie: 'sess-alice', body: { snapshot: snap(1000) } });
assert.equal(p1.status, 200);
assert.ok(p1.data.updatedAt > 0);
const g1 = await call('GET', '/api/saves/fanren/auto', { cookie: 'sess-alice' });
assert.equal(g1.status, 200);
assert.equal(g1.data.snapshot.ts, 1000);
assert.equal(g1.data.snapshot.state.hp, 10);

/* 6) 覆盖写：新 ts 快照替换旧快照 */
await call('PUT', '/api/saves/fanren/auto', { cookie: 'sess-alice', body: { snapshot: snap(2000) } });
const g2 = await call('GET', '/api/saves/fanren/auto', { cookie: 'sess-alice' });
assert.equal(g2.data.snapshot.ts, 2000, '云端应为最新快照');

/* 7) 用户隔离：bob 看不到 alice 的档 */
assert.equal((await call('GET', '/api/saves/fanren/auto', { cookie: 'sess-bob' })).status, 404);

/* 8) 多槽位独立 + 列表 */
await call('PUT', '/api/saves/fanren/0', { cookie: 'sess-alice', body: { snapshot: snap(1500) } });
await call('PUT', '/api/saves/panlong/auto', { cookie: 'sess-alice', body: { snapshot: { ...snap(1600), gameId: 'panlong' } } });
const list = await call('GET', '/api/saves/fanren', { cookie: 'sess-alice' });
assert.equal(list.data.slots.length, 2, 'fanren 应有 auto+0 两槽');
const slots = list.data.slots.map(x => x.slot).sort();
assert.deepEqual(slots, ['0', 'auto']);

/* 9) 参数与格式校验 */
assert.equal((await call('GET', '/api/saves/BAD/auto', { cookie: 'sess-alice' })).status, 404, '非法 gameId 落 404 路由');
assert.equal((await call('GET', '/api/saves/fanren/9', { cookie: 'sess-alice' })).status, 404, '非法 slot 落 404 路由');
assert.equal((await call('PUT', '/api/saves/fanren/auto', { cookie: 'sess-alice', body: { foo: 1 } })).status, 400, '缺快照结构应 400');
assert.equal((await call('PUT', '/api/saves/fanren/auto', { cookie: 'sess-alice', body: 'not-json' })).status >= 400, true, '坏 JSON 应 4xx');

/* 10) 未知接口 404 */
assert.equal((await call('GET', '/api/unknown', { cookie: 'sess-alice' })).status, 404);

/* 11) 成就：PUT 合并（最早解锁时间胜出）+ GET */
assert.deepEqual((await call('GET', '/api/achievements/fanren', { cookie: 'sess-alice' })).data.achievements, {}, '空成就应返回空映射');
const a1 = await call('PUT', '/api/achievements/fanren', { cookie: 'sess-alice', body: { achievements: { wolf_killer: 2000, first_realm: 3000 } } });
assert.equal(a1.status, 200);
const a2 = await call('PUT', '/api/achievements/fanren', { cookie: 'sess-alice', body: { achievements: { wolf_killer: 1000 } } });  // 更早时间
assert.equal(a2.data.achievements.wolf_killer, 1000, '合并应保留最早解锁时间');
assert.equal(a2.data.achievements.first_realm, 3000, '已有成就不应被覆盖丢失');

/* 12) 分数：clear_time 取最小，realm/achv 取最大 */
const s1 = await call('PUT', '/api/scores', {});
assert.notEqual(s1.status, 200);
assert.equal((await call('PUT', '/api/score/fanren/clear_time', { cookie: 'sess-alice', body: { score: 500 } })).data.score, 500);
assert.equal((await call('PUT', '/api/score/fanren/clear_time', { cookie: 'sess-alice', body: { score: 300 } })).data.score, 300, '更小通关时间应刷新');
assert.equal((await call('PUT', '/api/score/fanren/clear_time', { cookie: 'sess-alice', body: { score: 800 } })).data.score, 300, '更大时间不应覆盖');
assert.equal((await call('PUT', '/api/score/fanren/realm', { cookie: 'sess-alice', body: { score: 2 } })).data.score, 2);
assert.equal((await call('PUT', '/api/score/fanren/realm', { cookie: 'sess-alice', body: { score: 5 } })).data.score, 5, '更大境界应刷新');
assert.equal((await call('PUT', '/api/score/fanren/realm', { cookie: 'sess-alice', body: { score: 3 } })).data.score, 5, '更小境界不应覆盖');
assert.equal((await call('PUT', '/api/score/fanren/bad_board', { cookie: 'sess-alice', body: { score: 1 } })).status, 400, '未知榜单 400');
assert.equal((await call('PUT', '/api/score/fanren/achv', { cookie: 'sess-alice', body: { score: -1 } })).status, 400, '负分 400');

/* 13) 榜单：排序方向 + 用户隔离 */
await call('PUT', '/api/score/fanren/clear_time', { cookie: 'sess-bob', body: { score: 100 } });
await call('PUT', '/api/score/fanren/realm', { cookie: 'sess-bob', body: { score: 7 } });
const lb1 = await call('GET', '/api/leaderboard/fanren/clear_time', { cookie: 'sess-alice' });
assert.equal(lb1.data.rows.length, 2);
assert.equal(lb1.data.rows[0].username, 'bob', 'clear_time 应升序（bob 100 最小）');
assert.equal(lb1.data.rows[0].score, 100);
const lb2 = await call('GET', '/api/leaderboard/fanren/realm', { cookie: 'sess-bob' });
assert.equal(lb2.data.rows[0].username, 'bob', 'realm 应降序（bob 7 最大）');
assert.equal(lb2.data.rows[0].score, 7);

/* 14) 成就/分数未登录 401 */
assert.equal((await call('GET', '/api/achievements/fanren')).status, 401);
assert.equal((await call('PUT', '/api/score/fanren/realm', { body: { score: 1 } })).status, 401);
assert.equal((await call('GET', '/api/leaderboard/fanren/realm')).status, 401);

server.close();
console.log('✅ API 服务单测全部通过（14 组断言）');

