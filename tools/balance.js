#!/usr/bin/env node
/* ============================================================
 * 战斗平衡模拟：构造指定境界/装备的角色，与敌人打 N 场
 * 用法：node tools/balance.js
 * ============================================================ */
import { boot } from './_loader.mjs';

const TA = await boot();

function simFight(s, def, enemyId, policy) {
  const e = { ...def.enemies[enemyId], hpNow: def.enemies[enemyId].hp };
  let rounds = 0;
  while (rounds++ < 60) {
    policy(s, e, def);
    const r = TA.combatMath.pcAttack(s, e, def);
    e.hpNow -= r.dmg;
    if (e.hpNow <= 0) return 'win';
    const act = TA.combatMath.enemyAct(s, e, def);
    s.hp -= act.dmg;
    if (s.hp <= 0) return 'lose';
  }
  return 'timeout';
}

function report(name, def, enemyId, mkState, policy, n = 300) {
  let win = 0;
  for (let i = 0; i < n; i++) {
    const s = mkState();
    if (simFight(s, def, enemyId, policy) === 'win') win++;
  }
  console.log(`${name}: 胜率 ${(win / n * 100).toFixed(0)}%`);
}

/* ---- 凡人修仙传 ---- */
const fanren = TA.GAMES.fanren;
function frChar(realmIdx, equip) {
  const s = TA.newGame('fanren', '模拟', { birth: 'four' });
  s.realmIdx = realmIdx;
  for (let i = 1; i <= realmIdx; i++) {
    const r = fanren.realms[i];
    s.hpMax += r.hp || 15; s.mpMax += r.mp || 8; s.atk += r.atk || 3; s.def += r.def || 2;
  }
  s.hp = s.hpMax; s.mp = s.mpMax;
  if (equip.tiejian) s.items.tiejian = 1, s.equip.weapon = 'tiejian';
  if (equip.qingzhu) s.items.qingzhu = 1, s.equip.weapon = 'qingzhu';
  if (equip.pijia) s.items.pijia = 1, s.equip.armor = 'pijia';
  if (equip.changchun) s.skills.push('changchun');
  return s;
}
const healPolicy = (s, e, def) => {
  if (s.hp < s.hpMax * 0.45 && s.mp >= 5 && s.skills.includes('changchun')) {
    s.mp -= 5; s.hp = TA.clamp(s.hp + TA.dice.roll('2d8'), 0, s.hpMax);
    return;
  }
};
console.log('--- 凡人修仙传 ---');
report('墨大夫 @炼气一层(铁剑+长春功)', fanren, 'modafu', () => frChar(1, { tiejian: 1, changchun: 1 }), healPolicy);
report('墨大夫 @炼气三层(铁剑+长春功)', fanren, 'modafu', () => frChar(2, { tiejian: 1, changchun: 1 }), healPolicy);
report('魔道修士 @炼气三层(青竹+皮甲)', fanren, 'modao', () => frChar(2, { qingzhu: 1, pijia: 1, changchun: 1 }), healPolicy);
report('魔道修士 @炼气五层(青竹+皮甲)', fanren, 'modao', () => frChar(3, { qingzhu: 1, pijia: 1, changchun: 1 }), healPolicy);
report('魔道修士 @炼气十层(青竹+皮甲)', fanren, 'modao', () => frChar(5, { qingzhu: 1, pijia: 1, changchun: 1 }), healPolicy);

/* CoC（死光）不做数值模拟：其战斗走 d100 检定与战术检定（火烧/强光），
 * 不由 atk/def 数值曲线决定胜负——平衡靠模组设计的 DC 与 SAN 预算。 */
