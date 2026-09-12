/* ---------------- 云端 API 客户端 ----------------
 * 同源 /api/*（nginx 反代到 127.0.0.1:8322）。所有调用都不抛异常：
 * 返回 {status, data}，status 0 = 网络不可达。浏览器自动携带同源
 * Cookie；_configure 的 cookie 字段仅供 Node 测试注入。
 */
const cfg = { base: '/api', cookie: null, timeoutMs: 3000 };

export function _configure(o) { Object.assign(cfg, o); }

async function req(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.base + path, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(cfg.cookie ? { Cookie: cfg.cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* 204 等 */ }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /* 登录态探测：{username, status}；status 0=网络不可达，404=后端缺席（dev 静态服务器），401=未登录 */
  async me() {
    const r = await req('GET', '/api/me');
    return { username: r.status === 200 ? (r.data && r.data.username) || null : null, status: r.status };
  },
  /* 云端快照：200 → {snapshot, updatedAt}；无档/离线 → null */
  async getSave(gid, slot) {
    const r = await req('GET', `/api/saves/${gid}/${slot}`);
    return r.status === 200 ? r.data : null;
  },
  async putSave(gid, slot, snapshot) {
    const r = await req('PUT', `/api/saves/${gid}/${slot}`, { snapshot });
    return r.status === 200;
  },
  /* 云端成就：200 → {achievements:{id:ts}}；无记录/离线 → null */
  async getAchievements(gid) {
    const r = await req('GET', `/api/achievements/${gid}`);
    return r.status === 200 ? r.data : null;
  },
  async putAchievements(gid, map) {
    const r = await req('PUT', `/api/achievements/${gid}`, { achievements: map });
    return r.status === 200 ? r.data : null;
  },
  async putScore(gid, board, score) {
    const r = await req('PUT', `/api/score/${gid}/${board}`, { score });
    return r.status === 200;
  },
  /* 榜单：200 → {rows:[{username,score,achievedAt}]}；离线 → null */
  async getLeaderboard(gid, board) {
    const r = await req('GET', `/api/leaderboard/${gid}/${board}`);
    return r.status === 200 ? r.data : null;
  },
};
