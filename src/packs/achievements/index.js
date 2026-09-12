/* ---------------- 成就能力包：惰性条件检查 ----------------
 * GameDef.achievements: { <id>: { name, desc, icon, points, hidden,
 *   condition(s) } }
 * 运行态 s.achievements[id] = { unlockedAt }；每次动作后检查，
 * 解锁即日志 + toast。定义在游戏包内，解锁记录随存档走。
 */
import { pushLine } from '../../engine/ctx.js';
import { bus, EV } from '../../engine/bus.js';
import { achvStore, recordAchv } from '../../engine/achv.js';

async function checkAchievements(s, ctx) {
  const list = ctx.def.achievements || {};
  const got = (s.achievements = s.achievements || {});
  for (const [id, a] of Object.entries(list)) {
    if (got[id] || !a || typeof a.condition !== 'function') continue;
    let ok = false;
    try { ok = !!a.condition(s); } catch (e) { console.warn('成就条件异常', id, e); }
    if (ok) {
      got[id] = { unlockedAt: Date.now() };
      recordAchv(s.gameId, id, got[id].unlockedAt);   // 全局收集（跨存档）
      pushLine(ctx, 'skill', `🏆 成就达成【${a.icon || '🏅'} ${a.name || id}】${a.desc ? '—— ' + a.desc : ''}`);
      bus.emit(EV.TOAST, `🏆 成就达成：${a.name || id}`);
      bus.emit(EV.ACHIEVEMENT, { gameId: s.gameId, id });
    }
  }
  // 旧存档自愈：解锁只存在于存档内时回填全局收集
  for (const [id, rec] of Object.entries(got)) {
    if (!achvStore(s.gameId)[id]) recordAchv(s.gameId, id, rec && rec.unlockedAt);
  }
}

/* afterFx 钩子：场景进入/选项/自由行动之后由引擎调用 */
async function afterFx(ctx) { await checkAchievements(ctx.state, ctx); }

export { checkAchievements, afterFx };
