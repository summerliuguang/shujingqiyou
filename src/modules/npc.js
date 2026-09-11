/* ---------------- NPC 模块：好感 / 状态补丁 ----------------
 * GameDef.npcs: { <id>: { name, desc?, affinity?: { default, min, max } } }
 * 运行态 s.npc[id] = { affinity, ...任意补丁字段(mood/alive等) }
 * fx: ['npc', id, { affinity:+3, mood:'friendly' }]  affinity 按配置钳制
 * cond: ['npcmet', id] / ['npcaff', id, n]
 */
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

export { npcOf, npcPatch };
