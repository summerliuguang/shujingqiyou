/* ---------------- 成就模块：惰性条件检查 ----------------
 * GameDef.achievements: { <id>: { name, desc, icon, points, hidden,
 *   condition(s) } }
 * 运行态 s.achievements[id] = { unlockedAt }；每次动作后检查，
 * 解锁即日志 + toast。定义在游戏包内，解锁记录随存档走（阶段 5 上云）。
 */
import { pushLine } from '../core/ctx.js';
import { bus, EV } from '../core/bus.js';

async function checkAchievements(s, ctx) {
  const list = ctx.def.achievements || {};
  const got = (s.achievements = s.achievements || {});
  for (const [id, a] of Object.entries(list)) {
    if (got[id] || !a || typeof a.condition !== 'function') continue;
    let ok = false;
    try { ok = !!a.condition(s); } catch (e) { console.warn('成就条件异常', id, e); }
    if (ok) {
      got[id] = { unlockedAt: Date.now() };
      pushLine(ctx, 'skill', `🏆 成就达成【${a.icon || '🏅'} ${a.name || id}】${a.desc ? '—— ' + a.desc : ''}`);
      bus.emit(EV.TOAST, `🏆 成就达成：${a.name || id}`);
    }
  }
}

export { checkAchievements };
