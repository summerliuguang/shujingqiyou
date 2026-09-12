#!/usr/bin/env node
/* ============================================================
 * AI KP 代理端到端单测：spawn Go 二进制（tarpg-api）+ stub SSO + stub LiteGate。
 * 覆盖：未登录 401 / 登录后透传（key 与归因头、system prompt 断言）/
 *       上游错误 502 / 未配置 key 503 / 非法请求 400。
 * 用法：node tools/test-kp.mjs （需先编译 server-go/tarpg-api）
 * ============================================================ */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'server-go', 'tarpg-api');
if (!existsSync(BIN)) { console.log('⚠️ 未找到 tarpg-api 二进制，跳过（先 go build）'); process.exit(0); }

/* stub LiteGate 上游 */
let upstreamBehavior = { status: 200, body: { choices: [{ message: { content: '{"narrative":"PONG"}' } }] } };
const seen = [];
const upstream = http.createServer((req, res) => {
  let raw = '';
  req.on('data', d => raw += d);
  req.on('end', () => {
    seen.push({ auth: req.headers.authorization, app: req.headers['x-litegate-app'], body: JSON.parse(raw || '{}') });
    res.writeHead(upstreamBehavior.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(upstreamBehavior.body));
  });
});
await new Promise(r => upstream.listen(0, '127.0.0.1', r));
const upBase = `http://127.0.0.1:${upstream.address().port}`;

/* stub SSO /whoami */
const sso = http.createServer((req, res) => {
  res.writeHead(req.headers.cookie === 'sess-alice' ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ u: 'alice' }));
});
await new Promise(r => sso.listen(0, '127.0.0.1', r));
const ssoBase = `http://127.0.0.1:${sso.address().port}`;

async function startServer(env) {
  const child = spawn(BIN, ['-addr', '127.0.0.1:0'], {
    env: { ...process.env, TEXT_RPG_DB: ':memory:', TEXT_RPG_SSO_URL: ssoBase + '/whoami', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  /* Go 的 log.Printf 走 stderr——启动日志（含实际端口）从 stderr 提取 */
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('api 启动超时')), 5000);
    child.on('exit', code => { clearTimeout(timer); reject(new Error('api 进程退出 code=' + code)); });
    child.stderr.on('data', d => {
      const m = String(d).match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); }
    });
  });
  return { child, base };
}

async function call(base, method, path, { cookie, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 空 */ }
  return { status: res.status, data };
}

/* --- 配置齐全的实例 --- */
const { child, base } = await startServer({
  KP_LITEGATE_URL: upBase + '/v1/chat/completions',
  KP_LITEGATE_KEY: 'sk-lg-test',
  KP_MODEL: 'test-model',
});

/* 未登录 401 */
assert.equal((await call(base, 'POST', '/api/kp/chat', { body: { messages: [{ role: 'user', content: 'hi' }] } })).status, 401, '未登录应 401');

/* 登录后 200 + 透传断言 */
seen.length = 0;
const ok = await call(base, 'POST', '/api/kp/chat', {
  cookie: 'sess-alice',
  body: { gameId: 'coc_deadlight', messages: [{ role: 'system', content: '【模组】背景' }, { role: 'user', content: '我推门进去' }] },
});
assert.equal(ok.status, 200, '登录后应 200');
assert.equal(ok.data.text, '{"narrative":"PONG"}', '应透传模型文本');
assert.equal(seen.length, 1, '应恰好请求一次上游');
assert.equal(seen[0].auth, 'Bearer sk-lg-test', '应带 LiteGate key');
assert.equal(seen[0].app, 'tarpg-kp', '应带归因头');
assert.equal(seen[0].body.model, 'test-model', '应带模型名');
assert.equal(seen[0].body.messages[0].role, 'system', '应注入 KP 系统提示');
assert.ok(seen[0].body.messages[0].content.includes('KP'), '系统提示应是 KP 人设');
assert.equal(seen[0].body.messages.at(-1).content, '我推门进去', '玩家输入应在末尾');

/* 上游 500 → 502 */
upstreamBehavior = { status: 500, body: { error: 'x' } };
assert.equal((await call(base, 'POST', '/api/kp/chat', { cookie: 'sess-alice', body: { messages: [{ role: 'user', content: 'x' }] } })).status, 502, '上游错误应 502');

/* 非法请求 400 */
upstreamBehavior = { status: 200, body: { choices: [{ message: { content: 'x' } }] } };
assert.equal((await call(base, 'POST', '/api/kp/chat', { cookie: 'sess-alice', body: { hello: 1 } })).status, 400, '缺 messages 应 400');

child.kill();

/* --- 未配置 key 的实例 → 503 --- */
const { child: child2, base: base2 } = await startServer({ KP_LITEGATE_KEY: '' });
assert.equal((await call(base2, 'POST', '/api/kp/chat', { cookie: 'sess-alice', body: { messages: [{ role: 'user', content: 'hi' }] } })).status, 503, '未配置 key 应 503');
child2.kill();

upstream.close();
sso.close();
console.log('✅ AI KP 代理单测全部通过（401/透传+头断言/502/400/503）');
