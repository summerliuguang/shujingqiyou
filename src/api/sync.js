/* ---------------- 云同步（本地优先 · 时间戳取胜 · 静默降级） ----------------
 * 规范 §9：游玩零依赖后端。init() 探测登录态；每次进入游戏时对 4 个
 * 槽位做一次 reconcile（pull 只发生在读档入口之前，杜绝会话中被覆盖）；
 * 本地存档写入（EV.SAVED）即后台推送。冲突按快照 ts 取新者（<1s 视为
 * 同源），整槽替换不做字段合并。未登录/离线一律静默跳过。
 */
import { api, _configure } from './client.js';
import { readSlot, saveStore, writeSaveStore } from '../core/save.js';
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
    return actions;
  },

  /* 测试钩子（Node 侧注入 base/cookie） */
  _configure(o) { _configure(o); },
};

bus.on(EV.SAVED, ({ gameId, slot, snapshot }) => {
  if (sync.username && !sync.disabled) push(gameId, slot, snapshot);
});
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (sync.username) flushQueue(); });
}
