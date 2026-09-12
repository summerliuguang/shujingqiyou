/* ---------------- 场景文本 / 探索 / 可用选项 ----------------
 * 选项渲染只包含引擎通用部分（剧情选项/探索/休息/后退/地图出行）；
 * 玩法行动（修炼/突破/炼丹/……）由已装配能力包的 actions 注入。
 */
import { game } from './registry.js';
import { fmt } from './text.js';
import { testCond, testOne, describeCond } from './cond.js';
import { pushLine } from './ctx.js';
import { runFx } from './effects.js';
import { packActions } from './packs.js';

function sceneText(scene, s) {
  const t = typeof scene.text === 'function' ? scene.text(s) : scene.text;
  return t || '';
}

async function exploreAction(ctx) {
  const s = ctx.state;
  const scene = ctx.def.scenes[s.scene];
  const full = scene.explorePool || [];
  const pool = full.map((e, i) => ({ e, i })).filter(x => !(x.e.once && s.used[`exp:${s.scene}:${x.i}`]));
  if (!pool.length) { pushLine(ctx, 'fx', '这里已经没有什么可探寻的了。'); return; }
  const total = pool.reduce((t, x) => t + (x.e.w || 1), 0);
  let r = Math.random() * total;
  let pick = pool[0];
  for (const x of pool) { r -= (x.e.w || 1); if (r <= 0) { pick = x; break; } }
  s.used[`exp:${s.scene}:${pick.i}`] = 1;
  if (pick.e.text) pushLine(ctx, 'fx', fmt(pick.e.text, s));
  await runFx(pick.e.fx, ctx);
  if (pick.e.goto) ctx.goto = pick.e.goto;
}

function visibleChoices(s) {
  const def = game(s.gameId);
  const scene = def.scenes[s.scene] || {};
  const list = [];
  (scene.choices || []).forEach((c, i) => {
    if (c.once && s.used[`${s.scene}:${i}`]) return;
    if (!testCond(c.show != null ? c.show : c.req, s)) return;
    const enabled = testCond(c.req, s);
    let reason = '';
    if (!enabled && Array.isArray(c.req)) {
      const bad = c.req.find(x => !testOne(x, s));
      reason = bad ? describeCond(bad, def) : '条件未满足';
    }
    list.push({ kind: 'choice', idx: i, c, enabled, reason });
  });
  if (scene.explorePool) list.push({ kind: 'free', act: 'explore', t: '🔍 探索周遭', sub: '搜寻此处的机缘与危险', pace: ['放慢脚步，仔细探查四周……', 900] });
  /* 能力包行动（修炼/突破/炼丹……）插在探索之后、休息之前 */
  for (const a of packActions(s)) {
    list.push({ kind: 'free', act: a.act, t: a.t, sub: a.sub, hot: a.hot, pace: a.pace });
  }
  if (scene.rest) list.push({ kind: 'free', act: 'rest', t: '🏕️ 休息片刻', sub: '恢复部分生命与法力', pace: ['寻了处背风地歇脚……', 700] });
  if (s.history.length && scene.back !== false) list.push({ kind: 'free', act: 'back', t: '↩️ 回到上一幕', pace: ['……', 250] });
  const map = def.maps[s.map];
  if (map) {
    const locs = (map.locations || []).filter(l => testCond(l.req, s));
    if (locs.length) {
      list.push({ kind: 'maphead', name: map.name });
      for (const l of locs) list.push({ kind: 'travel', loc: l, enabled: true });
    }
  }
  return list;
}

export { sceneText, exploreAction, visibleChoices };
