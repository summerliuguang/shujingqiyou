/* ============================================================
 * Node 工具共享加载器：stub 浏览器环境 → 动态 import ESM 引擎 →
 * 经 game_loader 逐包加载 games/ 数据包，得到完整 TA 门面。
 * ============================================================ */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function stubEnv() {
  const mem = {};
  globalThis.localStorage ??= {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; },
  };
  globalThis.TA_DATA ??= {};
  globalThis.window ??= globalThis;
  return mem;
}

export async function loadEngine() {
  stubEnv();
  const { TA } = await import('../src/engine/api.js');
  return TA;
}

export async function boot() {
  const TA = await loadEngine();
  const { REGISTRY, loadGame } = await import('../src/shell/game_loader.js');
  for (const e of REGISTRY) await loadGame(e.id);
  return TA;
}

export { ROOT };
