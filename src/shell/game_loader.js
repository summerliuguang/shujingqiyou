/* ---------------- 游戏加载器：registry 摘要 + 按需动态 import ---------------- */
import { GAMES, registerGame } from '../core/registry.js';
import { validateDef } from '../core/validate.js';

/* 注册表由 tools/mkregistry.mjs 生成；文件缺失时（公开仓库无数据包）以空库启动 */
let REGISTRY = [];
try {
  ({ REGISTRY } = await import('../../games/registry.js'));
} catch { /* 无注册表 → 空库 */ }

const loading = new Map();

async function loadGame(gid) {
  if (GAMES[gid]) return GAMES[gid];
  if (!REGISTRY.some(e => e.id === gid)) throw new Error('游戏不存在: ' + gid);
  let p = loading.get(gid);
  if (!p) {
    p = import(`../../games/${gid}/data/index.js`)
      .then(m => {
        registerGame(m.default);
        const errs = validateDef(m.default);
        if (errs.length) throw new Error(`游戏数据错误: ${errs[0]}`);
        return GAMES[gid];
      });
    loading.set(gid, p);
    p.catch(() => loading.delete(gid));
  }
  return p;
}

export { REGISTRY, loadGame };
