/* ---------------- 运行上下文 ---------------- */
import { game } from './registry.js';

function mkCtx(s) {
  return { state: s, def: game(s.gameId), lines: [], entries: [], goto: null, end: null, via: null };
}
function pushLine(ctx, cls, text) { ctx.lines.push({ cls, text }); }

export { mkCtx, pushLine };
