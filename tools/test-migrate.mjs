#!/usr/bin/env node
/* ============================================================
 * 存档迁移单测：v1 key → v2 key 惰性迁移、旧 key 保留、空档不落盘、
 * 导入快照校验。用法：node tools/test-migrate.mjs
 * ============================================================ */
import assert from 'node:assert/strict';
import { stubEnv, boot } from './_loader.mjs';

const mem = stubEnv();

/* 构造 v1 时代的 localStorage 内容 */
const v1state = { gameId: 'fanren', name: '旧档玩家', scene: 'start', hp: 10, hpMax: 20, flags: { 测试: true } };
const v1auto = {
  v: 1, gameId: 'fanren', name: '旧档玩家', ts: 1700000000000,
  playtime: 120, scene: 'start', sceneTitle: '青牛镇', state: v1state,
};
mem['tarpg:save:fanren'] = JSON.stringify({ auto: v1auto, slots: [null, null, null] });
mem['tarpg:collect:fanren'] = JSON.stringify({ '陨落': { kind: 'bad', ts: 1 } });

const TA = await boot();

/* 1) saveStore 触发惰性迁移，内容不变、旧 key 保留 */
const store = TA.saves.saveStore('fanren');
assert.equal(store.v, 2, 'store 版本应为 2');
assert.equal(store.auto.name, '旧档玩家');
assert.deepEqual(store.auto, v1auto, '快照结构应与 v1 完全一致');
assert.ok('tarpg:v2:save:fanren' in mem, '应写入 v2 存档 key');
assert.ok('tarpg:save:fanren' in mem, 'v1 存档 key 应保留（降级安全）');

/* 2) 结局收集迁移 */
const ends = TA.saves.endings('fanren');
assert.equal(ends['陨落'].kind, 'bad');
assert.ok('tarpg:v2:collect:fanren' in mem, '应写入 v2 结局 key');
assert.ok('tarpg:collect:fanren' in mem, 'v1 结局 key 应保留');

/* 3) 无任何旧档的游戏：读档返回空且不落盘 */
const st2 = TA.saves.saveStore('panlong');
assert.equal(st2.auto, null);
assert.ok(!('tarpg:v2:save:panlong' in mem), '空档不应写入 key');

/* 4) 新写入走 v2 key；v1 key 不被触碰 */
const before = mem['tarpg:save:fanren'];
const s = TA.newGame('fanren', '新玩家', {});
s.scene = 'start';
TA.saves.autosave(s);
const after = JSON.parse(mem['tarpg:v2:save:fanren']);
assert.equal(after.auto.name, '新玩家');
assert.equal(mem['tarpg:save:fanren'], before, 'v1 key 内容不应变化');
assert.equal(TA.saves.readSlot('fanren', 'auto').name, '新玩家');
TA.saves.saveToSlot(s, 0);
assert.equal(TA.saves.readSlot('fanren', 0).name, '新玩家');
TA.saves.delSlot('fanren', 0);
assert.equal(TA.saves.readSlot('fanren', 0), null);

/* 5) importSnapshot：游戏不符抛错，符合则入手动3 */
assert.throws(() => TA.saves.importSnapshot('fanren', { gameId: 'panlong', state: {} }), /不是本游戏/);
TA.saves.importSnapshot('fanren', { gameId: 'fanren', name: '旧档玩家', state: { ...v1state } });
assert.equal(TA.saves.readSlot('fanren', 2).name, '旧档玩家');

/* 6) recordEnding 只写 v2 key */
TA.saves.recordEnding('fanren', { title: '测试结局', kind: 'true' });
assert.equal(TA.saves.endings('fanren')['测试结局'].kind, 'true');
assert.equal(mem['tarpg:collect:fanren'], JSON.stringify({ '陨落': { kind: 'bad', ts: 1 } }), 'v1 结局 key 不应被改写');

console.log('✅ 存档迁移测试全部通过（6 组断言）');
