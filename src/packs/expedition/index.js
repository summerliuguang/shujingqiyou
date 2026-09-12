/* ---------------- 秘境能力包：多层 roguelike 探索 ----------------
 * GameDef.expeditions: { <id>: {
 *   name, icon, desc,
 *   ticket: [[物品id, 数量]...],       // 入场券（可选）
 *   layers: 5,                        // 层数
 *   budget: 10,                       // 行动步数预算（用尽强制撤离）
 *   // 每层三选一事件：按层深分池，w 加权抽取，同层不重复
 *   shallow: [offer...], mid: [offer...], deep: [offer...],
 * } }
 * offer: { t, icon, w, kind: 'combat'|'loot'|'event'|'heal'|'exit',
 *          enemy?|fx?|goto? }
 *
 * fx: ['expedition', id] —— 经 bus.call(EV.EXPEDITION) 逐层让玩家三选一
 * （无监听=首层即撤，无头安全）；战斗复用战斗浮层；撤离保留已获战利品；
 * 战败走 deathEnding。深层（第 3 层起）用 mid/deep 池，奖励更厚。
 */
import { pushLine } from '../../engine/ctx.js';
import { runFx, registerFx } from '../../engine/effects.js';
import { hasItem, itemAdd } from '../../engine/state.js';
import { combatFx } from '../combat/index.js';
import { bus, EV } from '../../engine/bus.js';

/* 层深 → 池：浅/中/深（后缺前补） */
function poolOf(exp, layer) {
  if (layer >= Math.ceil(exp.layers * 0.66)) return (exp.deep || exp.mid || exp.shallow);
  if (layer >= Math.ceil(exp.layers * 0.33)) return (exp.mid || exp.shallow);
  return exp.shallow;
}

/* 从池中不重复抽 3 个 offer（w 加权） */
function pickOffers(exp, layer) {
  const offers = [...poolOf(exp, layer)];
  const out = [];
  for (let i = 0; i < 3 && offers.length; i++) {
    const total = offers.reduce((t, o) => t + (o.w || 1), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < offers.length; idx++) { r -= (offers[idx].w || 1); if (r <= 0) break; }
    out.push(offers.splice(Math.min(idx, offers.length - 1), 1)[0]);
  }
  return out;
}

async function runExpedition(id, ctx) {
  const s = ctx.state, def = ctx.def;
  const exp = (def.expeditions || {})[id];
  if (!exp) { pushLine(ctx, 'fx', '此秘境并无入口。'); return; }
  if (exp.ticket && !exp.ticket.every(([iid, n]) => hasItem(s, iid, n || 1))) {
    pushLine(ctx, 'fx', `入场所需不齐（${exp.ticket.map(([iid, n]) => `${((def.items || {})[iid] || {}).name || iid}×${n}`).join('、')}）。`);
    return;
  }
  if (exp.ticket) for (const [iid, n] of exp.ticket) itemAdd(s, iid, -(n || 1));

  pushLine(ctx, 'map', `${exp.icon || '🌌'} 步入【${exp.name}】${exp.desc ? '——' + exp.desc : ''}（共 ${exp.layers} 层 · 行动预算 ${exp.budget} 步）`);
  let budget = exp.budget || 10;
  const loots = [];

  for (let layer = 1; layer <= exp.layers; layer++) {
    const offers = pickOffers(exp, layer);
    const res = await bus.call(EV.EXPEDITION, {
      state: s, def, exp, layer, budget, offers, loots,
      name: exp.name, totalLayers: exp.layers,
    });
    let pick = res && typeof res.pick === 'number' ? Math.min(Math.max(res.pick, 0), offers.length - 1) : -1;
    if (pick < 0 || budget <= 0) {
      if (layer > 1 || res) pushLine(ctx, 'fx', '你护住怀中之物，循着来路标记退出了秘境。');
      else pushLine(ctx, 'fx', '你在入口处探了探，终究没敢深入。');
      break;
    }
    const o = offers[pick];
    budget--;
    pushLine(ctx, 'fx', `—— 第 ${layer}/${exp.layers} 层 —— ${o.icon || '·'} ${o.t}`);
    if (o.kind === 'combat' && o.enemy) {
      const before = ctx.end;
      await combatFx(['combat', o.enemy, null, null, null], ctx);
      if (ctx.end && ctx.end !== before) return;   // 战死：秘境即终
    } else if (o.fx) {
      await runFx(o.fx, ctx);
      if (ctx.end) return;
    }
    if (o.loot) for (const [iid, n] of o.loot) { itemAdd(s, iid, n || 1); loots.push(`${((def.items || {})[iid] || {}).name || iid}×${n || 1}`); }
    if (o.kind === 'exit') { pushLine(ctx, 'fx', '一扇微光门户在眼前洞开——你抬步跨出，秘境的威压瞬间远去。'); break; }
    if (layer === exp.layers) {
      s.flags['秘境深处'] = true;
      pushLine(ctx, 'gain', `🎉 你抵达了秘境最深处并全身而退！【${exp.name}】之行，圆满落幕。`);
    }
  }
  if (loots.length) pushLine(ctx, 'gain', `🎒 秘境收获：${loots.join('、')}`);
}

function install() {
  registerFx('expedition', (e, ctx) => runExpedition(e[1], ctx));
}

export { runExpedition, pickOffers, poolOf, install };
