#!/usr/bin/env node
/* ============================================================
 * v2 新模块回归：任务勾稽 / NPC 好感 / 线索 / 成就 / 副本
 * 以盘龙示范支线与闹鬼公馆线索为例，走引擎全流程。
 * 用法：node tools/test-modules.mjs
 * ============================================================ */
import assert from 'node:assert/strict';
import { boot } from './_loader.mjs';
import { bus, EV } from '../src/core/bus.js';

const TA = await boot();
bus.on(EV.LOG, () => {});
bus.on(EV.REFRESH, () => {});
bus.on(EV.TOAST, () => {});
bus.on(EV.COMBAT, async () => 'win');   // 副本/战斗必胜

let toasts = [];
bus.on(EV.TOAST, msg => toasts.push(msg));

/* ---------- 盘龙：铁匠的委托（任务+NPC+成就） ---------- */
{
  const def = TA.GAMES.panlong;
  const s = TA.newGame('panlong', '测试者', {});
  await TA.enterScene(s, 'zhi_buke');
  assert.equal(def.scenes.zhi_buke ? true : false, true, 'zhi_buke 场景存在');
  assert.ok(s.npc && s.npc.buke, '进店应登记 NPC buke');

  // 接委托 → 任务 active
  await TA.choose(s, def.scenes.zhi_buke.choices[0], 0);
  assert.equal(s.questState['side_buke']?.state, 'active', '接委托后任务应为 active');
  assert.ok(s.flags['布克委托'], '应设置布克委托旗标');

  // 凑齐魔核 → 任意动作触发勾稽 → 自动完成+奖励
  const atkBefore = s.atk;
  TA.itemAdd(s, 'mofuhe', 3);
  await TA.freeAction(s, 'rest');
  assert.equal(s.questState['side_buke'].state, 'done', '集齐魔核后任务应自动完成');
  assert.equal(s.atk, atkBefore + 2, '奖励应 +2 攻击');
  assert.equal(s.npc.buke.affinity, 1, '奖励应 +1 好感');
  assert.ok((s.items.mofuhe || 0) >= 3, '魔核不应被消耗（借炉火还回）');

  // 好感 ≥1 → 旧事选项可见 → 护腕 + 再 +1 好感
  let vis = TA.visibleChoices(s);
  assert.ok(def.scenes.zhi_buke.choices[1], '旧事选项存在');
  await TA.enterScene(s, 'zhi_buke');
  vis = TA.visibleChoices(s);
  const lore = vis.find(x => x.kind === 'choice' && x.c === def.scenes.zhi_buke.choices[1]);
  assert.ok(lore && lore.enabled, '好感达标后旧事选项应可用');
  await TA.choose(s, def.scenes.zhi_buke.choices[1], 1);
  assert.ok(s.items.jingtie, '应获得精铁护腕');
  assert.ok(s.npc.buke.affinity >= 2, '闲聊后好感 +1');

  // 成就：好感 3 线（buke_friend 需 3，此处仅验证成就机制本身——屠狼者）
  const killsBefore = s.kills;
  s.kills = 3;
  await TA.freeAction(s, 'rest');
  assert.ok(s.achievements.wolf_killer, '击败 3 头魔兽应解锁「屠狼者」');
  assert.ok(toasts.some(t => t.includes('屠狼者')), '成就解锁应有 toast');
  void killsBefore;
}

/* ---------- 盘龙：副本（连战 + 奖励） ---------- */
{
  const s = TA.newGame('panlong', '测试者', { birth: 'warrior' });
  s.realmIdx = 1;
  s.hp = s.hpMax = 100; s.atk = 25;
  const lines = [];
  bus.on(EV.LOG, entries => lines.push(...entries));
  await TA.enterScene(s, 'xigu');
  const vis = TA.visibleChoices(s);
  const dg = vis.find(x => x.kind === 'choice' && String(x.c.t).includes('魔狼巢穴'));
  assert.ok(dg, '溪谷营地应出现副本入口');
  const moneyBefore = s.money;
  await TA.choose(s, dg.c, dg.idx);
  assert.ok(s.exp >= 15, `副本通清应有经验奖励（exp=${s.exp}）`);
  assert.ok(s.money > moneyBefore, '副本通清应有金钱奖励');
}

/* ---------- 闹鬼公馆：线索 + 成就 ---------- */
{
  const def = TA.GAMES.coc_haunting;
  const s = TA.newGame('coc_haunting', '调查员', { occ: '大学生' });
  assert.equal(Object.keys(def.clues || {}).length, 8, '应登记 8 条线索');
  await TA.enterScene(s, 'dangangu');
  // 档案馆检索是 rand/check 混合——直接驱动线索 fx 验证登记与成就
  s.clues.tudai = true;
  s.clues.kongguan = true;
  s.clues.kobite = true;
  s.clues.zhaishi = true;
  await TA.freeAction(s, 'rest');
  assert.ok(s.achievements.xianqu, '登记 4 条线索应解锁「先驱」');
}
console.log('✅ v2 新模块回归全部通过（任务/NPC/成就/副本/线索）');
