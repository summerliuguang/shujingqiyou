/* ---------------- 修炼能力包：境界 / 修炼 / 突破 ----------------
 * GameDef: realms[]（境界表）、cultivateGain(s)、breakChance(s)、onRealmUp(ctx)
 * 场景字段 cultivate: true | [cond]（未满足条件不出现修炼入口）
 * fx: ['realmup']  cond: ['realm', idx, op?]
 * 自由行动：🧘 打坐修炼 / ⚡ 冲击瓶颈（由引擎按本包 actions 注入渲染）
 */
import { game } from '../../engine/registry.js';
import { roll } from '../../engine/dice.js';
import { pushLine } from '../../engine/ctx.js';
import { bus, EV } from '../../engine/bus.js';
import { registerFx } from '../../engine/effects.js';
import { registerCond, testCond, cmp } from '../../engine/cond.js';

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
  bus.emit(EV.REALM_UP, { gameId: s.gameId, realmIdx: s.realmIdx, name: r.name });
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

/* 场景是否提供修炼入口（cultivate: true | [cond]） */
function sceneCultivable(scene, s) {
  return scene.cultivate && (scene.cultivate === true || testCond(scene.cultivate, s));
}

/* 自由行动注入：引擎 visibleChoices 调用 */
function actions(s) {
  const def = game(s.gameId);
  const scene = def.scenes[s.scene] || {};
  const list = [];
  const hasRealm = (def.realms || []).length > 0;
  if (sceneCultivable(scene, s) && hasRealm && s.realmIdx < def.realms.length - 1) {
    list.push({
      act: 'cultivate', t: '🧘 打坐修炼', sub: `突破进度 ${s.exp}/${realmNeed(s)}`,
      echo: '▶ 打坐修炼', pace: ['闭目凝神，吐纳周天……', 1200],
      run: async (ctx) => {
        let g = cultivateGain(s);
        if (s.flags.聚灵阵) g = Math.round(g * 1.5);
        s.exp += g;
        ctx.lines.push({ cls: 'gain', text: `🧘 你收摄心神，吐纳周天……修为 +${g}（突破进度 ${s.exp}/${realmNeed(s)}）${s.flags.聚灵阵 ? '【聚灵阵】灵气源源不绝。' : ''}` });
      },
    });
    if (s.exp >= realmNeed(s)) {
      list.push({
        act: 'breakthrough', t: '⚡ 冲击瓶颈', sub: `尝试晋入【${(def.realms[s.realmIdx + 1] || {}).name}】`, hot: true,
        echo: '▶ 冲击瓶颈', pace: ['气机涌动，冲击瓶颈……', 1500],
        run: (ctx) => tryBreakthrough(ctx),
      });
    }
  }
  return list;
}

/* 顶栏资源条：境界名 */
function chips(s, def) {
  if ((def.realms || []).length) {
    return [`<span class="qs realm" title="境界">${(def.realms[s.realmIdx] || {}).name || ''}</span>`];
  }
  return [];
}

function install() {
  registerFx('realmup', (e, ctx) => doRealmUp(ctx));
  registerCond('realm',
    (c, s) => cmp(s.realmIdx || 0, c[2] || '>=', c[1]),
    (c, def) => `需要境界：${((def.realms || [])[c[1]] || {}).name || '第' + c[1] + '境'}`);
}

export { realmNeed, cultivateGain, doRealmUp, tryBreakthrough, sceneCultivable, actions, chips, install };
