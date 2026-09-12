/* ---------------- NPC 能力包：好感 / 状态补丁 ----------------
 * GameDef.npcs: { <id>: { name, desc?, affinity?: { default, min, max } } }
 * 运行态 s.npc[id] = { affinity, ...任意补丁字段(mood/alive等) }
 * fx: ['npc', id, { affinity:+3, mood:'friendly' }]  affinity 按配置钳制
 * cond: ['npcmet', id] / ['npcaff', id, n]
 */
import { pushLine } from '../../engine/ctx.js';
import { registerFx } from '../../engine/effects.js';
import { registerCond } from '../../engine/cond.js';

function npcOf(s, id, def) {
  const map = (s.npc = s.npc || {});
  if (!map[id]) {
    const cfg = ((def.npcs || {})[id] || {}).affinity || {};
    map[id] = { affinity: cfg.default != null ? cfg.default : 0 };
  }
  return map[id];
}
function npcPatch(s, id, patch, def) {
  const n = npcOf(s, id, def);
  const cfg = (((def.npcs || {})[id] || {}).affinity) || {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'affinity') {
      n.affinity = Math.max(cfg.min != null ? cfg.min : -10, Math.min(cfg.max != null ? cfg.max : 10, (n.affinity || 0) + v));
    } else n[k] = v;
  }
  return n;
}

function install() {
  registerFx('npc', (e, ctx) => {
    const s = ctx.state, def = ctx.def;
    npcPatch(s, e[1], e[2], def);
    const n = npcOf(s, e[1], def);
    pushLine(ctx, 'skill', `🤝 【${((def.npcs || {})[e[1]] || {}).name || e[1]}】好感 ${n.affinity}`);
  });
  registerCond('npcmet',
    (c, s) => !!(s.npc && s.npc[c[1]]),
    (c, def) => `需要见过：${((def.npcs || {})[c[1]] || {}).name || c[1]}`);
  registerCond('npcaff',
    (c, s) => !!((s.npc || {})[c[1]] && ((s.npc[c[1]].affinity || 0) >= (c[2] != null ? c[2] : 1))),
    (c, def) => `需要${((def.npcs || {})[c[1]] || {}).name || c[1]}更信任你`);
}

export { npcOf, npcPatch, install };
