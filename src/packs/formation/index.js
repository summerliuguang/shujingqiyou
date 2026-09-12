/* ---------------- 阵法能力包 ----------------
 * GameDef.formations: { <id>: {
 *   name, icon, desc,
 *   kind: 'gather' | 'battle',
 *   need: [[物品id, 数量]...],        // 布设/施放的耗材
 *   buff: { atk, def },              // battle：本场战斗的临时加成
 * } }
 *
 * 聚灵阵（gather）：洞府场景 field formation: true 时出现「布设阵法」
 *   行动；布成后 s.flags.聚灵阵 = true，修炼/闭关收益 ×1.5。
 * 战斗阵法（battle）：fx ['formation', 阵id, 敌id?, 胜goto?, 败goto?, 逃goto?]
 *   —— 消耗耗材后带临时攻防加成打一场（复用战斗浮层），战后恢复。
 */
import { game } from '../../engine/registry.js';
import { hasItem, itemAdd } from '../../engine/state.js';
import { pushLine } from '../../engine/ctx.js';
import { registerFx } from '../../engine/effects.js';
import { bus, EV } from '../../engine/bus.js';
import { mkCombat, combatFx } from '../combat/index.js';

function needOk(s, need) {
  return (need || []).every(([id, n]) => hasItem(s, id, n || 1));
}
function needText(def, need) {
  return (need || []).map(([id, n]) => `${((def.items || {})[id] || {}).name || id}×${n || 1}`).join('、');
}

async function runFormation(e, ctx) {
  const s = ctx.state, def = ctx.def;
  const [, id, enemyId, winGoto, loseGoto, fleeGoto] = e;
  const f = (def.formations || {})[id];
  if (!f) { pushLine(ctx, 'fx', '此阵法并未传来。'); return; }
  if (!needOk(s, f.need)) { pushLine(ctx, 'fx', `布阵材料不足（需 ${needText(def, f.need)}）。`); return; }

  if (f.kind === 'gather') {
    if (s.flags.聚灵阵) { pushLine(ctx, 'fx', '此地已有聚灵阵运转，灵气氤氲不散。'); return; }
    for (const [iid, n] of f.need) itemAdd(s, iid, -(n || 1));
    s.flags.聚灵阵 = true;
    pushLine(ctx, 'skill', `🔯 你依${f.name}之法，以${needText(def, f.need)}为阵脚布下聚灵阵——灵气如百川归海，丝丝缕缕汇入洞府。此后修炼、闭关皆事半功倍（收益 ×1.5）。`);
    return;
  }

  /* battle：消耗 + 临时攻防加成打一场，战后恢复（加成不落存档） */
  for (const [iid, n] of f.need) itemAdd(s, iid, -(n || 1));
  const buff = f.buff || {};
  const atk0 = s.atk, def0 = s.def;
  pushLine(ctx, 'skill', `🔯 ${f.name}轰然展开——光幕流转，你的气机与阵势相合！`);
  s.atk += buff.atk || 0; s.def += buff.def || 0;
  try {
    await combatFx([null, enemyId, winGoto, loseGoto, fleeGoto], ctx);
  } finally {
    s.atk = atk0; s.def = def0;
  }
}

/* 洞府布阵行动（gather 类阵法） */
function actions(s) {
  const def = game(s.gameId);
  const scene = def.scenes[s.scene] || {};
  const list = [];
  const gathers = Object.entries(def.formations || {}).filter(([, f]) => f.kind === 'gather');
  if (scene.formation && gathers.length && !s.flags.聚灵阵) {
    for (const [id, f] of gathers) {
      const ok = needOk(s, f.need);
      list.push({
        act: 'formation:' + id, t: `${f.icon || '🔯'} 布设${f.name}`, sub: ok ? `耗 ${needText(def, f.need)} · 此后修炼闭关收益 ×1.5` : `材料不足（需 ${needText(def, f.need)}）`,
        echo: `▶ 布设${f.name}`, pace: ['以阵旗定方位，灵力勾勒阵纹……', 1200],
        run: (ctx) => runFormation(['formation', id], ctx),
      });
    }
  }
  return list;
}

function install() {
  registerFx('formation', (e, ctx) => runFormation(e, ctx));
}

export { runFormation, actions, install };
