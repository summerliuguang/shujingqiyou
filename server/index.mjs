/* ============================================================
 * 书境奇游 API 服务入口：SSO 应用层接入（127.0.0.1:5090 /whoami）
 * 监听 127.0.0.1:8322；nginx 29xxx 站点经 /api/ 反代到此。
 * ============================================================ */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const PORT = parseInt(process.argv[2] || process.env.TEXT_RPG_PORT || '8322', 10);
const DB_PATH = process.env.TEXT_RPG_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'tarpg.sqlite');
const SSO_WHOAMI = 'http://127.0.0.1:5090/whoami';

const verify = (cookie) => new Promise(resolve => {
  if (!cookie) return resolve(null);
  const req = http.request(SSO_WHOAMI, { method: 'GET', headers: { Cookie: cookie }, timeout: 3000 }, res => {
    let body = '';
    res.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
    res.on('end', () => {
      try { resolve(res.statusCode === 200 ? (JSON.parse(body).u || null) : null); }
      catch { resolve(null); }
    });
  });
  req.on('timeout', () => { req.destroy(); resolve(null); });
  req.on('error', () => resolve(null));
  req.end();
});

const { server } = createApp({ verify, dbPath: DB_PATH });
server.listen(PORT, '127.0.0.1', () => console.log(`书境奇游 API: http://127.0.0.1:${PORT}/api/ （DB: ${DB_PATH}，认证: SSO）`));
