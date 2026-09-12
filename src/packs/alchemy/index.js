/* ---------------- 炼丹能力包 ----------------
 * GameDef.recipes: { <id>: {
 *   name, icon, desc,
 *   need: [[物品id, 数量]...],          // 药材（开炉即消耗）
 *   dc: 45,                            // 基础成丹难度（def.alchemyMod 可动态增减）
 *   output: [fx],                      // 成丹效果（一般给 ['item', 丹id, 1]）
 *   fine: [fx],                        // 上品（骰值 ≤ ⌊dc/2⌋，一般 ×2 产量或特效）
 *   failFx: [fx],                      // 废丹（可选，默认只损失药材）
 * } }
 * GameDef.alchemyMod?: (s) => number   // 丹炉/口诀等对 dc 的总修正（负值更易）
 *
 * 场景字段 alchemy: true | [cond]（丹房/有炉之处）→ 自由行动「开炉炼丹」。
 * UI 经 bus.call(EV.ALCHEMY) 让玩家选丹方（无监听=取消，无头安全）。
 * 品质三档：上品(≤dc/2) / 成丹(≤dc) / 废丹；骰值与产量全在引擎侧。
 */
import { game } from '../../engine/registry.js';
import { hasItem, itemAdd, clamp } from '../../engine/state.js';
import { pushLine } from '../../engine/ctx.js';
import { runFx } from '../../engine/effects.js';
import { d100 } from '../../engine/dice.js';
import { testCond } from '../../engine/cond.js';
import { bus, EV } from '../../engine/bus.js';

function needOk(s, need) { return (need || []).every(([id, n]) => hasItem(s, id, n || 1)); }
function needText(def, need) {
  return (need || []).map(([id, n]) => `${((def.items || {})[id] || {}).name || id}×${n || 1}`).join('、');
}

function recipeDc(s, def, recipe) {
  const mod = def.alchemyMod ? def.alchemyMod(s) : 0;
  return clamp(recipe.dc + mod, 5, 95);
}

async function craft(recipeId, ctx) {
  const s = ctx.state, def = ctx.def;
  const r = (def.recipes || {})[recipeId];
  if (!r) return;
  if (!needOk(s, r.need)) { pushLine(ctx, 'fx', `药材不齐（需 ${needText(def, r.need)}）。`); return; }
  const dc = recipeDc(s, def, r);
  const roll = d100(0);
  const fineLine = Math.floor(dc / 2);
  const grade = roll <= fineLine ? 'fine' : (roll <= dc ? 'ok' : 'fail');
  const gradeText = { fine: '<span class="roll-crit">上品</span>', ok: '<span class="roll-good">成丹</span>', fail: '<span class="roll-fail">废丹</span>' }[grade];
  pushLine(ctx, 'roll',
    `⚗️ <b>炼制【${r.name}】</b>（成丹 ${dc}，上品 ${fineLine}）文火慢焙，腕底生风——掷出 <b>${roll}</b> —— ${gradeText}`);
  for (const [id, n] of r.need) itemAdd(s, id, -(n || 1));
  pushLine(ctx, 'loss', `药材入炉：${needText(def, r.need)}，一缕药香散开……`);
  if (grade === 'fine' && r.fine) await runFx(r.fine, ctx);
  else if (grade === 'ok' && r.output) await runFx(r.output, ctx);
  else if (grade === 'fail') {
    if (r.failFx) await runFx(r.failFx, ctx);
    pushLine(ctx, 'loss', `💥 炉温失控，丹成了一滩焦黑的药渣。${r.desc ? '' : ''}`);
  }
}

function actions(s) {
  const def = game(s.gameId);
  const scene = def.scenes[s.scene] || {};
  const list = [];
  const ok = scene.alchemy && (scene.alchemy === true || testCond(scene.alchemy, s));
  const recipes = Object.entries(def.recipes || {});
  if (ok && recipes.length) {
    list.push({
      act: 'alchemy', t: '⚗️ 开炉炼丹', sub: '以药材炼制丹药，火候定成败',
      echo: '▶ 开炉炼丹', pace: ['净手焚香，起火温炉……', 800],
      run: async (ctx) => {
        const rid = await bus.call(EV.ALCHEMY, { state: s, def });
        if (rid) await craft(rid, ctx);
        else pushLine(ctx, 'fx', '你来到丹炉前，掂量再三，还是先收了手。');
      },
    });
  }
  return list;
}

export { craft, needOk, needText, recipeDc, actions };
