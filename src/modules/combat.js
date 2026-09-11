/* ---------------- 战斗（novel 回合制数学） ---------------- */
import { game } from '../core/registry.js';
import { roll } from '../core/dice.js';
import { clamp } from '../core/state.js';

function weaponOf(s, def) {
  const id = s.equip.weapon;
  return id ? (def.items[id] || null) : null;
}
function armorOf(s, def) {
  const id = s.equip.armor;
  return id ? (def.items[id] || null) : null;
}
function pcAtk(s, def) {
  const w = weaponOf(s, def);
  return (s.atk || 0) + (w && w.equip ? (w.equip.atk || 0) : 0);
}
function pcDef(s, def) {
  const a = armorOf(s, def);
  return (s.def || 0) + (a && a.equip ? (a.equip.def || 0) : 0);
}
function pcAttack(s, e, def, mult) {
  const base = Math.max(1, Math.round((pcAtk(s, def) * (mult || 1) - (e.def || 0)) * (0.85 + Math.random() * 0.3)));
  const crit = Math.random() < 0.06;
  return { dmg: crit ? base * 2 : base, crit };
}
function pcSkillDmg(s, e, def, sk) {
  if (sk.heal) return { heal: roll(sk.heal) };
  const base = Math.max(1, Math.round((pcAtk(s, def) * (sk.mult || 1.5) + roll(sk.bonus || '0') - (e.def || 0)) * (0.9 + Math.random() * 0.2)));
  return { dmg: base, crit: Math.random() < 0.06 };
}
function enemyAct(s, e, def) {
  const skills = e.skills || [{ name: '攻击', dmg: e.dmg || '1d6' }];
  const total = skills.reduce((t, x) => t + (x.w || 1), 0);
  let r = Math.random() * total, pick = skills[0];
  for (const x of skills) { r -= (x.w || 1); if (r <= 0) { pick = x; break; } }
  const dmg = Math.max(1, Math.round(roll(pick.dmg) + (e.atk || 0) / 2 - pcDef(s, def) * 0.5));
  return { name: pick.name, text: pick.text, dmg };
}
function fleeChance(s, e) { return clamp(55 + ((s.agi || 0) - (e.agi || 0)) * 5, 15, 95); }
function mkCombat(s, enemyId, ctx) {
  const def = game(s.gameId);
  return { enemy: def.enemies[enemyId], enemyId, state: s, def, ctx };
}

export { weaponOf, armorOf, pcAtk, pcDef, pcAttack, pcSkillDmg, enemyAct, fleeChance, mkCombat };
