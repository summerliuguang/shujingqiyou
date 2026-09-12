/* ---------------- 全局成就收集（跨存档，随游戏） ----------------
 * state.achievements 只存在于单个存档内；成就殿堂/个人资料/云同步
 * 需要按游戏聚合的收集记录，故镜像一份到这里（key: tarpg:v2:achv:<gid>）。
 * checkAchievements 解锁时双写，并对旧存档的既有成就做自愈回填。
 */
const P = 'tarpg:v2:achv:';

function achvStore(gid) {
  try { return JSON.parse(localStorage.getItem(P + gid)) || {}; } catch { return {}; }
}
function writeAchv(gid, map) {
  localStorage.setItem(P + gid, JSON.stringify(map));
}
function recordAchv(gid, id, unlockedAt) {
  const a = achvStore(gid);
  const ts = unlockedAt || Date.now();
  if (!a[id] || a[id].unlockedAt > ts) {
    a[id] = { unlockedAt: ts };
    writeAchv(gid, a);
  }
  return a;
}

export { achvStore, writeAchv, recordAchv };
