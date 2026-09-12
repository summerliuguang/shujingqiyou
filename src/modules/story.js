/* ---------------- 场景文本 / 探索 / 可用选项 ---------------- */
import { game } from '../core/registry.js';
import { fmt } from '../core/text.js';
import { testCond, testOne, describeCond } from '../core/cond.js';
import { pushLine } from '../core/ctx.js';
import { runFx } from '../core/effects.js';
import { realmNeed } from './cultivation.js';

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
  if (scene.explorePool) list.push({ kind: 'free', act: 'explore', t: '🔍 探索周遭', sub: '搜寻此处的机缘与危险' });
  const hasRealm = (def.realms || []).length > 0;
  /* cultivate 可为 true 或条件数组（如 [['skill','changchun']]——未习得功法不可修炼） */
  const canCultivate = scene.cultivate && (scene.cultivate === true || testCond(scene.cultivate, s));
  if (canCultivate && hasRealm && s.realmIdx < def.realms.length - 1) {
    list.push({ kind: 'free', act: 'cultivate', t: '🧘 打坐修炼', sub: `突破进度 ${s.exp}/${realmNeed(s)}` });
    if (s.exp >= realmNeed(s)) list.push({ kind: 'free', act: 'breakthrough', t: '⚡ 冲击瓶颈', sub: `尝试晋入【${(def.realms[s.realmIdx + 1] || {}).name}】`, hot: true });
  }
  if (scene.rest) list.push({ kind: 'free', act: 'rest', t: '🏕️ 休息片刻', sub: '恢复部分生命与法力' });
  if (s.history.length && scene.back !== false) list.push({ kind: 'free', act: 'back', t: '↩️ 回到上一幕' });
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
