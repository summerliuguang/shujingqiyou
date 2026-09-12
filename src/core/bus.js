/* ============================================================
 * 事件总线：引擎 → UI 的唯一通道（替代 v1 的 TA.hooks 直接回调）
 * emit 单向通知；call 等待监听器返回值（战斗结算用，无监听时
 * 返回 undefined，引擎按"逃跑"处理——与 v1 默认钩子行为一致）
 * ============================================================ */
class EventBus {
  constructor() { this.listeners = {}; }
  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = list.filter(f => f !== fn);
  }
  emit(event, payload) {
    for (const fn of (this.listeners[event] || [])) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  }
  async call(event, payload) {
    const fns = this.listeners[event] || [];
    let result;
    for (const fn of fns) result = await fn(payload);
    return result;
  }
}

export const bus = new EventBus();

export const EV = {
  LOG: 'log:append',        // 追加叙事条目 [{cls,text/html}]
  REFRESH: 'ui:refresh',    // 状态/选项区刷新
  TOAST: 'ui:toast',        // 轻提示 (msg)
  ENDING: 'game:ending',    // 结局 ({title,text,kind})
  COMBAT: 'combat:start',   // 战斗开始，监听器返回 'win'|'lose'|'flee'
  SAVED: 'save:written',    // 本地存档已写入（云同步订阅后推送；后端不可达时静默）
  ACHIEVEMENT: 'achievement:unlocked',  // 成就解锁 {gameId, id}
  REALM_UP: 'realm:up',     // 境界突破 {gameId, realmIdx, name}
};
