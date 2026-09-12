/* ---------------- 云同步（本地优先 · 时间戳取胜 · 静默降级） ----------------
 * 规范 §9：游玩零依赖后端。init() 探测登录态；每次进入游戏时对 4 个
 * 槽位做一次 reconcile（pull 只发生在读档入口之前，杜绝会话中被覆盖）；
 * 本地存档写入（EV.SAVED）即后台推送。冲突按快照 ts 取新者（<1s 视为
 * 同源），整槽替换不做字段合并。未登录/离线一律静默跳过。
 */
import { api, _configure } from './client.js';
import { readSlot, saveStore, writeSaveStore, endings } from '../core/save.js';
import { achvStore } from '../core/achv.js';
import { game } from '../core/registry.js';
import { bus, EV } from '../core/bus.js';

const SLOTS = ['auto', '0', '1', '2'];
const SKEW_MS = 1000;

const retryQueue = new Set();

function storeRemote(gid, slot, snap) {
  const store = saveStore(gid);
  if (slot === 'auto') store.auto = snap; else store.slots[+slot] = snap;
  writeSaveStore(gid, store);
}

async function push(gid, slot, snap) {
  const ok = await api.putSave(gid, slot, snap);
  if (!ok) retryQueue.add(`${gid}:${slot}`);
  else retryQueue.delete(`${gid}:${slot}`);
  return ok;
}
async function flushQueue() {
  for (const key of [...retryQueue]) {
    const [gid, slot] = key.split(':');
    const local = readSlot(gid, slot);
    if (local) await push(gid, slot, local);
  }
}

export const sync = {
  username: null,
  disabled: false,   // 后端缺席（404/不可达）时置位，本次会话不再探测

  /* 启动时探测登录态；返回用户名或 null */
  async init() {
    const probe = await api.me();
    this.username = probe.username;
    if (probe.status === 0 || probe.status === 404) this.disabled = true;
    if (this.username) await flushQueue();
    return this.username;
  },

  /* 进入游戏/读档入口调用：双向往返，返回动作清单 [{slot, action}] */
  async reconcile(gid) {
    const actions = [];
    if (!this.username || this.disabled) return actions;
    for (const slot of SLOTS) {
      const local = readSlot(gid, slot);
      const remote = await api.getSave(gid, slot);
      if (!remote) {
        if (local && (await push(gid, slot, local))) actions.push({ slot, action: 'pushed' });
        continue;
      }
      if (!local) { storeRemote(gid, slot, remote.snapshot); actions.push({ slot, action: 'pulled' }); continue; }
      const lts = local.ts || 0, rts = remote.snapshot.ts || 0;
      if (rts > lts + SKEW_MS) {
        storeRemote(gid, slot, remote.snapshot);
        actions.push({ slot, action: 'pulled' });
      } else if (lts > rts + SKEW_MS) {
        if (await push(gid, slot, local)) actions.push({ slot, action: 'pushed' });
      }
    }
    try { await mergeAchievements(gid); } catch { /* 静默 */ }
    return actions;
  },

  /* 测试钩子（Node 侧注入 base/cookie） */
  _configure(o) { _configure(o); },
};

bus.on(EV.SAVED, ({ gameId, slot, snapshot }) => {
  if (sync.username && !sync.disabled) push(gameId, slot, snapshot);
});

/* ---- 成就合并（最早解锁时间胜出，双向） ---- */
async function mergeAchievements(gid) {
  if (!sync.username || sync.disabled) return;
  const local = achvStore(gid);
  const remote = await api.getAchievements(gid);
  if (!remote) return;
  const inc = remote.achievements || {};
  const merged = { ...local };
  let pulled = false;
  for (const [id, ts] of Object.entries(inc)) {
    if (!merged[id] || merged[id].unlockedAt > ts) { merged[id] = { unlockedAt: ts }; pulled = true; }
  }
  if (pulled) writeAchvLocal(gid, merged);
  const localOnly = Object.keys(local).some(id => !(id in inc));
  if (localOnly || pulled) await api.putAchievements(gid, merged);
}
function writeAchvLocal(gid, map) {
  try { localStorage.setItem('tarpg:v2:achv:' + gid, JSON.stringify(map)); } catch { /* 静默 */ }
}

/* ---- 分数上报（结局/突破/成就三类时机；fire-and-forget） ---- */
function achvPoints(gid) {
  const defs = (game(gid) || {}).achievements || {};
  const got = achvStore(gid);
  return Object.entries(defs).reduce((t, [id, a]) => t + (got[id] ? (a.points || 0) : 0), 0);
}
bus.on(EV.ENDING, ({ gameId, kind, playtime, realmIdx }) => {
  if (!sync.username || sync.disabled || !gameId) return;
  if (kind === 'true' || kind === 'normal') api.putScore(gameId, 'clear_time', playtime);
  api.putScore(gameId, 'realm', realmIdx || 0);
  api.putScore(gameId, 'endings', Object.keys(endings(gameId)).length);
  api.putScore(gameId, 'achv', achvPoints(gameId));
});
bus.on(EV.REALM_UP, ({ gameId, realmIdx }) => {
  if (sync.username && !sync.disabled && gameId) api.putScore(gameId, 'realm', realmIdx || 0);
});
bus.on(EV.ACHIEVEMENT, ({ gameId }) => {
  if (sync.username && !sync.disabled && gameId) api.putScore(gameId, 'achv', achvPoints(gameId));
});
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (sync.username) flushQueue(); });
}
