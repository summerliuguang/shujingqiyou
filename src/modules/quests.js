/* ---------------- 任务模块：目标勾稽 ----------------
 * GameDef.quests: { <id>: { title, desc, type:'main'|'side',
 *   objectives: [{ desc, kind:'flag'|'item'|'kill', target, count }],
 *   rewards: [fx] } }
 * 运行态 s.questState[id] = { state:'active'|'done'|'fail', obj:{} }
 * v1 的字符串支线（s.quests + ['quest',名,'done']）保持兼容；
 * 注册表任务由 checkQuests 在每次动作后自动勾稽并发放奖励。
 */
import { hasItem } from '../core/state.js';
import { pushLine } from '../core/ctx.js';
import { runFx } from '../core/effects.js';

async function checkQuests(s, ctx) {
  const reg = ctx.def.quests || {};
  const st = s.questState || {};
  for (const [id, q] of Object.entries(st)) {
    if (q.state !== 'active') continue;
    const qd = reg[id];
    if (!qd || !qd.objectives || !qd.objectives.length) continue;
    let all = true;
    for (let i = 0; i < qd.objectives.length; i++) {
      const o = qd.objectives[i];
      let ok = false;
      if (o.kind === 'flag') ok = !!s.flags[o.target];
      else if (o.kind === 'item') ok = hasItem(s, o.target, o.count || 1);
      else if (o.kind === 'kill') ok = (s.kills || 0) >= (o.count || 1);
      q.obj[i] = ok;
      if (!ok) all = false;
    }
    if (all) {
      q.state = 'done';
      pushLine(ctx, 'skill', `✅ 任务完成：【${qd.title || id}】`);
      if (qd.rewards) await runFx(qd.rewards, ctx);
    }
  }
}

export { checkQuests };
