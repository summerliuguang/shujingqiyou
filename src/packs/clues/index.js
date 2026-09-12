/* ---------------- 线索能力包（CoC 调查） ----------------
 * GameDef.clues: { <id>: { name, desc } }
 * 运行态 s.clues[id] = true
 * fx: ['clue', id] 登记 / ['clue', id, false] 撤销
 * cond: ['clue', id] / ['clues', n]（已登记条数 ≥ n）
 */
import { pushLine } from '../../engine/ctx.js';
import { registerFx } from '../../engine/effects.js';
import { registerCond } from '../../engine/cond.js';

function clueFind(s, id, on = true) {
  const c = (s.clues = s.clues || {});
  if (on) c[id] = true; else delete c[id];
}
function clueCount(s) { return Object.keys(s.clues || {}).length; }

function install() {
  registerFx('clue', (e, ctx) => {
    clueFind(ctx.state, e[1], e[2] !== false);
    const cl = (ctx.def.clues || {})[e[1]];
    pushLine(ctx, 'skill', `🧩 线索登记：【${cl ? cl.name : e[1]}】`);
  });
  registerCond('clue',
    (c, s) => !!(s.clues && s.clues[c[1]]),
    (c, def) => `需要线索：${((def.clues || {})[c[1]] || {}).name || c[1]}`);
  registerCond('clues',
    (c, s) => Object.keys(s.clues || {}).length >= (c[1] || 1),
    c => `需要线索 ×${c[1] || 1}`);
}

export { clueFind, clueCount, install };
