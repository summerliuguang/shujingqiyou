/* ============================================================
 * UI 入口：订阅事件总线 / 键盘 / 启动首页
 * （渲染实现按组件拆分：core/home/create/view/panels/combat/ending）
 * ============================================================ */
import { U } from './core.js';
import { showHome } from './home.js';
import { openMenu, closeAllModals } from './panels.js';
import { bus, EV } from '../core/bus.js';
import { appendLog, refresh } from './view.js';
import { toast } from './core.js';
import { endingOverlay } from './ending.js';
import { combatOverlay } from './combat.js';

/* ---------------- 订阅引擎事件（替代 v1 TA.hooks 赋值） ---------------- */
bus.on(EV.LOG, appendLog);
bus.on(EV.REFRESH, refresh);
bus.on(EV.TOAST, toast);
bus.on(EV.ENDING, endingOverlay);
bus.on(EV.COMBAT, cctx => { closeAllModals(); return combatOverlay(cctx); });

/* ---------------- 启动 ---------------- */
document.querySelector('#btn-menu').addEventListener('click', () => { if (U.S) openMenu(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAllModals(); return; }
  // 数字键 1-9 快速选择剧情选项
  if (!U.S || U.busy) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const n = parseInt(e.key, 10);
  if (!n || n < 1 || n > 9 || document.querySelector('#modal-root').children.length) return;
  const choices = document.querySelector('#choices');
  if (!choices) return;
  const btns = [...choices.querySelectorAll('.choice-btn:not(.disabled)')];
  const target = btns[n - 1];
  if (target) target.click();
});
showHome();
