/* ---------------- 任务能力包：目标勾稽 ----------------
 * GameDef.quests: { <id>: { title, desc, type:'main'|'side',
 *   objectives: [{ desc, kind:'flag'|'item'|'kill', target, count }],
 *   rewards: [fx] } }
 * 运行态 s.questState[id] = { state:'active'|'done'|'fail', obj:{} }
 * v1 的字符串支线（s.quests + ['quest',名,'done']）由引擎直接支持；
 * 本包只负责注册表任务的自动勾稽与奖励发放（afterFx 钩子）。
 */
import { hasItem } from '../../engine/state.js';
import { pushLine } from '../../engine/ctx.js';
import { runFx } from '../../engine/effects.js';

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

/* afterFx 钩子：场景进入/选项/自由行动之后由引擎调用 */
async function afterFx(ctx) { await checkQuests(ctx.state, ctx); }

export { checkQuests, afterFx };
