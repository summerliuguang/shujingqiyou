/* ---------------- 境界 / 修炼 ---------------- */
import { game } from '../core/registry.js';
import { roll } from '../core/dice.js';
import { pushLine } from '../core/ctx.js';

function realmNeed(s) {
  const r = (game(s.gameId).realms || [])[s.realmIdx];
  return r ? r.need : Infinity;
}
function cultivateGain(s) {
  const def = game(s.gameId);
  if (def.cultivateGain) return def.cultivateGain(s);
  return roll('2d6') + Math.floor((s.attrs.灵性 || 0) / 5);
}
function doRealmUp(ctx) {
  const s = ctx.state, def = ctx.def;
  if (s.realmIdx >= (def.realms || []).length - 1) return false;
  const oldName = (def.realms[s.realmIdx] || {}).name;
  s.realmIdx++;
  s.exp = 0;
  const r = def.realms[s.realmIdx] || {};
  s.hpMax += r.hp || 15; s.mpMax += r.mp || 8; s.atk += r.atk || 3; s.def += r.def || 2;
  s.hp = s.hpMax; s.mp = s.mpMax;
  pushLine(ctx, 'skill', `🌟 <b>突破成功！</b>${oldName ? '由【' + oldName + '】晋入' : '晋入'}【${r.name}】！气血法力尽复，气机圆满。`);
  if (def.onRealmUp) def.onRealmUp(ctx);
  return true;
}
async function tryBreakthrough(ctx) {
  const s = ctx.state, def = ctx.def;
  const chance = def.breakChance ? def.breakChance(s) : 0.7;
  if (Math.random() < chance) { doRealmUp(ctx); return true; }
  s.exp = Math.floor(s.exp * 0.75);
  s.hp = Math.max(1, s.hp - roll('1d6'));
  pushLine(ctx, 'loss', `💥 突破失败！气机紊乱，气血翻涌（剩余突破经验 ${s.exp}）。稍安勿躁，再作冲关。`);
  return false;
}

export { realmNeed, cultivateGain, doRealmUp, tryBreakthrough };
