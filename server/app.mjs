/* ============================================================
 * 书境奇游 API 服务（应用工厂）
 * 零依赖：node:http + node:sqlite（Node ≥22.13）。只监听回环，
 * 局域网访问一律经 nginx /api/ 反代；认证走本机 SSO 应用层接入
 * （转发 Cookie 换用户名，LiteGate 同款，但需要身份故用 /whoami）。
 * createApp({ verify, dbPath }) 中 verify 注入便于测试。
 * ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const GID_RE = /^[a-z0-9_-]{1,64}$/;
const SLOT_RE = /^(auto|[0-2])$/;
const BODY_LIMIT = 2 * 1024 * 1024;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sso_username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id, slot)
);
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id, achievement_id)
);
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  score NUMERIC NOT NULL,
  achieved_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id, board_id)
);
`;

export function createApp({ verify, dbPath = ':memory:' } = {}) {
  if (typeof verify !== 'function') throw new Error('createApp 需要注入 verify(cookie) → username | null');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const qUser = db.prepare('SELECT id, sso_username, display_name FROM users WHERE sso_username = ?');
  const qUserIns = db.prepare('INSERT INTO users (sso_username, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?)');
  const qUserTouch = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
  const qGet = db.prepare('SELECT snapshot, updated_at FROM saves WHERE user_id = ? AND game_id = ? AND slot = ?');
  const qPut = db.prepare(`INSERT INTO saves (user_id, game_id, slot, snapshot, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, game_id, slot) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`);
  const qList = db.prepare('SELECT slot, updated_at FROM saves WHERE user_id = ? AND game_id = ?');
  const qAchGet = db.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ? AND game_id = ?');
  const qAchUp = db.prepare(`INSERT INTO user_achievements (user_id, game_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, game_id, achievement_id) DO UPDATE SET unlocked_at = min(user_achievements.unlocked_at, excluded.unlocked_at)`);
  const qScoreGet = db.prepare('SELECT score FROM leaderboard_entries WHERE user_id = ? AND game_id = ? AND board_id = ?');
  const qScoreUp = db.prepare(`INSERT INTO leaderboard_entries (user_id, game_id, board_id, score, achieved_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, game_id, board_id) DO UPDATE SET score = excluded.score, achieved_at = excluded.achieved_at`);
  const qLb = db.prepare(`SELECT u.sso_username AS username, le.score, le.achieved_at AS achievedAt
    FROM leaderboard_entries le JOIN users u ON u.id = le.user_id
    WHERE le.game_id = ? AND le.board_id = ?
    ORDER BY le.score ${'ASC'}, le.achieved_at ASC LIMIT 50`);
  const qLbDesc = db.prepare(`SELECT u.sso_username AS username, le.score, le.achieved_at AS achievedAt
    FROM leaderboard_entries le JOIN users u ON u.id = le.user_id
    WHERE le.game_id = ? AND le.board_id = ?
    ORDER BY le.score ${'DESC'}, le.achieved_at ASC LIMIT 50`);
  /* 越小越好的榜单（时间类）；其余越大越好 */
  const MIN_BOARDS = new Set(['clear_time']);
  const BOARDS = new Set(['clear_time', 'realm', 'achv', 'endings']);

  function json(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > BODY_LIMIT) { reject(new Error('body too large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function authUser(req) {
    const username = await verify(req.headers.cookie || '');
    if (!username) return null;
    let row = qUser.get(username);
    const now = Date.now();
    if (!row) {
      qUserIns.run(username, username, now, now);
      row = qUser.get(username);
    } else {
      qUserTouch.run(now, row.id);
    }
    return row;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/api/healthz') return json(res, 200, { ok: true });

      const user = await authUser(req);
      if (!user) return json(res, 401, { error: '未登录' });

      let m;
      if (url.pathname === '/api/me' && req.method === 'GET') {
        return json(res, 200, { username: user.sso_username, displayName: user.display_name });
      }
      if ((m = url.pathname.match(/^\/api\/saves\/([a-z0-9_-]{1,64})\/(auto|[0-2])$/))) {
        const [, gid, slot] = m;
        if (req.method === 'GET') {
          const row = qGet.get(user.id, gid, slot);
          if (!row) return json(res, 404, { error: '无云端存档' });
          return json(res, 200, { snapshot: JSON.parse(row.snapshot), updatedAt: row.updated_at });
        }
        if (req.method === 'PUT') {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw || '{}'); } catch (e) { return json(res, 400, { error: 'JSON 解析失败' }); }
          const snap = body && typeof body === 'object' && body.snapshot ? body.snapshot : body;
          if (!snap || typeof snap !== 'object' || !snap.state || typeof snap.ts !== 'number') {
            return json(res, 400, { error: '快照格式不符（需含 state 与 ts）' });
          }
          const now = Date.now();
          qPut.run(user.id, gid, slot, JSON.stringify(snap), now);
          return json(res, 200, { updatedAt: now });
        }
      }
      if ((m = url.pathname.match(/^\/api\/saves\/([a-z0-9_-]{1,64})$/)) && req.method === 'GET') {
        return json(res, 200, { slots: qList.all(user.id, m[1]) });
      }

      /* ---- 成就：按最早解锁时间合并 ---- */
      if ((m = url.pathname.match(/^\/api\/achievements\/([a-z0-9_-]{1,64})$/))) {
        const gid = m[1];
        if (req.method === 'GET') {
          const map = {};
          for (const r of qAchGet.all(user.id, gid)) map[r.achievement_id] = r.unlocked_at;
          return json(res, 200, { achievements: map });
        }
        if (req.method === 'PUT') {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'JSON 解析失败' }); }
          const inc = body && body.achievements;
          if (!inc || typeof inc !== 'object') return json(res, 400, { error: '需 achievements 映射' });
          for (const [id, ts] of Object.entries(inc)) {
            if (!/^[\w\u4e00-\u9fa5-]{1,64}$/.test(id) || !Number.isFinite(ts)) return json(res, 400, { error: '成就格式不符' });
            qAchUp.run(user.id, gid, id, Math.floor(ts));
          }
          const map = {};
          for (const r of qAchGet.all(user.id, gid)) map[r.achievement_id] = r.unlocked_at;
          return json(res, 200, { achievements: map });
        }
      }

      /* ---- 分数上报与榜单 ---- */
      if ((m = url.pathname.match(/^\/api\/score\/([a-z0-9_-]{1,64})\/([a-z_]{1,32})$/)) && req.method === 'PUT') {
        const [, gid, board] = m;
        if (!BOARDS.has(board)) return json(res, 400, { error: '未知榜单' });
        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'JSON 解析失败' }); }
        const score = body && body.score;
        if (!Number.isFinite(score) || score < 0) return json(res, 400, { error: '分数需为非负数值' });
        const prev = qScoreGet.get(user.id, gid, board);
        const better = !prev || (MIN_BOARDS.has(board) ? score < prev.score : score > prev.score);
        if (better) qScoreUp.run(user.id, gid, board, score, Date.now());
        return json(res, 200, { score: better ? score : prev.score });
      }
      if ((m = url.pathname.match(/^\/api\/leaderboard\/([a-z0-9_-]{1,64})\/([a-z_]{1,32})$/)) && req.method === 'GET') {
        const [, gid, board] = m;
        if (!BOARDS.has(board)) return json(res, 400, { error: '未知榜单' });
        const rows = (MIN_BOARDS.has(board) ? qLb : qLbDesc).all(gid, board);
        return json(res, 200, { rows });
      }
      return json(res, 404, { error: '未知接口' });
    } catch (e) {
      console.error('[api]', req.method, url.pathname, e.message);
      return json(res, e.message === 'body too large' ? 413 : 500, { error: e.message });
    }
  });

  return { server, db };
}
