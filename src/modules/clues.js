/* ---------------- 线索模块（CoC 调查） ----------------
 * GameDef.clues: { <id>: { name, desc } }
 * 运行态 s.clues[id] = true
 * fx: ['clue', id] 登记 / ['clue', id, false] 撤销
 * cond: ['clue', id] / ['clues', n]（已登记条数 ≥ n）
 */
function clueFind(s, id, on = true) {
  const c = (s.clues = s.clues || {});
  if (on) c[id] = true; else delete c[id];
}
function clueCount(s) { return Object.keys(s.clues || {}).length; }

export { clueFind, clueCount };
