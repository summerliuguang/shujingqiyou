/* ---------------- 存档 ----------------
 * v2 键：tarpg:v2:save:<gid>（整游戏一档库 {v:2, auto, slots:[3]}）
 *       tarpg:v2:collect:<gid>（结局收集）
 * v1 键（tarpg:save:<gid> / tarpg:collect:<gid>）首次读取时惰性迁移，
 * 旧键保留不删（降级回 v1 仍可读）。快照内部结构与 v1 完全一致，
 * 保证旧导出码可导入。
 */
import { game } from './registry.js';
import { bus, EV } from './bus.js';

const SAVE_V2 = 'tarpg:v2:save:';
const SAVE_V1 = 'tarpg:save:';
const COLLECT_V2 = 'tarpg:v2:collect:';
const COLLECT_V1 = 'tarpg:collect:';

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function saveStore(gid) {
  const cur = readJSON(SAVE_V2 + gid);
  if (cur && typeof cur === 'object' && Array.isArray(cur.slots)) {
    if (cur.v !== 2) cur.v = 2;
    return cur;
  }
  const store = { v: 2, auto: null, slots: [null, null, null] };
  const old = readJSON(SAVE_V1 + gid);
  if (old && typeof old === 'object') {
    if (old.auto) store.auto = old.auto;
    if (Array.isArray(old.slots)) for (let i = 0; i < 3; i++) store.slots[i] = old.slots[i] || null;
    try { localStorage.setItem(SAVE_V2 + gid, JSON.stringify(store)); } catch (e) {}
    return store;
  }
  if (cur) { // 非法结构兜底，尽量保留可识别字段
    store.auto = cur.auto || null;
    return store;
  }
  return store;
}
function writeSaveStore(gid, store) { localStorage.setItem(SAVE_V2 + gid, JSON.stringify(store)); }

function snapshot(s, def) {
  return {
    v: 1, gameId: s.gameId, name: s.name, ts: Date.now(),
    playtime: s.playtime || 0, scene: s.scene,
    sceneTitle: (def.scenes[s.scene] || {}).title || s.scene,
    state: s,
  };
}
function autosave(s) {
  const store = saveStore(s.gameId);
  store.auto = snapshot(s, game(s.gameId));
  writeSaveStore(s.gameId, store);
  bus.emit(EV.SAVED, { gameId: s.gameId, slot: 'auto', snapshot: store.auto });
}
function saveToSlot(s, slot) {
  const store = saveStore(s.gameId);
  store.slots[slot] = snapshot(s, game(s.gameId));
  writeSaveStore(s.gameId, store);
  bus.emit(EV.SAVED, { gameId: s.gameId, slot: String(slot), snapshot: store.slots[slot] });
}
function readSlot(gid, key) {
  const store = saveStore(gid);
  return key === 'auto' ? store.auto : store.slots[key];
}
function delSlot(gid, key) {
  const store = saveStore(gid);
  if (key === 'auto') store.auto = null; else store.slots[key] = null;
  writeSaveStore(gid, store);
}
/* 导入快照到手动3槽（UI 导入按钮用，替代 v1 在 ui.js 里硬编码 localStorage 键） */
function importSnapshot(gid, snap) {
  if (!snap || snap.gameId !== gid || !snap.state) throw new Error('不是本游戏的存档代码');
  const store = saveStore(gid);
  store.slots[2] = snap;
  writeSaveStore(gid, store);
  bus.emit(EV.SAVED, { gameId: gid, slot: '2', snapshot: snap });
}

function endings(gid) {
  const cur = readJSON(COLLECT_V2 + gid);
  if (cur && typeof cur === 'object') return cur;
  const old = readJSON(COLLECT_V1 + gid);
  if (old && typeof old === 'object') {
    try { localStorage.setItem(COLLECT_V2 + gid, JSON.stringify(old)); } catch (e) {}
    return old;
  }
  return {};
}
function recordEnding(gid, end) {
  const all = endings(gid);
  all[end.title] = { kind: end.kind || 'normal', ts: Date.now() };
  localStorage.setItem(COLLECT_V2 + gid, JSON.stringify(all));
}

export {
  saveStore, writeSaveStore, snapshot, autosave, saveToSlot, readSlot, delSlot,
  importSnapshot, endings, recordEnding,
};
