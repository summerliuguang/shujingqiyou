/* ---------------- 游戏加载器：registry 摘要 + 按需动态 import + 能力装配 ----------------
 * 加载数据包 → 运行时校验 → 按 def.modules（或按 type 缺省表）装配能力包。
 * modules 声明什么是本游戏真实启用的能力（修炼/战斗/理智/线索……），
 * 未装配的效果/条件/自由行动在本游戏中不存在。
 */
import { GAMES, registerGame } from '../engine/registry.js';
import { validateDef } from '../engine/validate.js';
import { assemblePacks, FALLBACK } from '../engine/packs.js';

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
      .then(async m => {
        registerGame(m.default);
        const errs = validateDef(m.default);
        if (errs.length) throw new Error(`游戏数据错误: ${errs[0]}`);
        await assemblePacks(gid, m.default.modules || FALLBACK[m.default.type] || FALLBACK.novel);
        return GAMES[gid];
      });
    loading.set(gid, p);
    p.catch(() => loading.delete(gid));
  }
  return p;
}

export { REGISTRY, loadGame };
