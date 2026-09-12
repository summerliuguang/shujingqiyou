/* ---------------- 战斗能力包（回合制数学 + combat fx） ----------------
 * 数学供 UI 战斗浮层调用；['combat', 敌id, 胜goto?, 败goto?, 逃goto?]
 * 走事件总线 EV.COMBAT（无监听的无头环境按逃跑处理，与 v1 一致）。
 */
import { game } from '../../engine/registry.js';
import { roll } from '../../engine/dice.js';
import { clamp } from '../../engine/state.js';
import { pushLine } from '../../engine/ctx.js';
import { itemAdd } from '../../engine/state.js';
import { bus, EV } from '../../engine/bus.js';
import { registerFx, runFx } from '../../engine/effects.js';

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

async function combatFx(e, ctx) {
  const s = ctx.state, def = ctx.def;
  const items = def.items || {};
  const res = await bus.call(EV.COMBAT, mkCombat(s, e[1], ctx));
  if (res === 'win') {
    s.kills++;
    const en = def.enemies[e[1]] || {};
    /* v1 祖传 bug 修复：此前只打日志不入账，敌人 exp 字段形同虚设 */
    if (en.exp) { s.exp += en.exp; pushLine(ctx, 'gain', `⚔️ 击败【${en.name}】，经验 +${en.exp}`); }
    if (en.money) {
      s.money = (s.money || 0) + en.money;
      pushLine(ctx, 'gain', `拾获 ${en.money} ${def.moneyName || '金钱'}`);
    }
    for (const [id2, chance, n] of (en.drops || [])) {
      if (Math.random() < chance) {
        itemAdd(s, id2, n || 1);
        pushLine(ctx, 'gain', `${(items[id2] || {}).icon || '📦'} 掉落【${(items[id2] || {}).name || id2}】×${n || 1}`);
      }
    }
    if (en.winFx) await runFx(en.winFx, ctx);
    if (e[2]) ctx.goto = e[2];
  } else if (res === 'lose') {
    if (e[3]) ctx.goto = e[3];
    else ctx.end = def.deathEnding || { title: '命丧黄泉', text: '你伤重不治，倒在了半途。修仙路远，唯有来世再战。', kind: 'bad' };
  } else {
    const fleeTo = e[4] || e[3];
    if (fleeTo) ctx.goto = fleeTo;
  }
}

function install() {
  registerFx('combat', combatFx);
}

export { weaponOf, armorOf, pcAtk, pcDef, pcAttack, pcSkillDmg, enemyAct, fleeChance, mkCombat, combatFx, install };
