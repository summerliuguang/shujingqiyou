/* ---------------- 能力包装配器 ----------------
 * 加载器按 GameDef.modules（或按 type 的缺省表）动态 import 各能力包，
 * 调用其 install() 注册 fx/cond，并把模块命名空间按游戏缓存——
 * 自由行动(actions)/顶栏资源条(chips)/动作后钩子(afterFx) 由引擎聚合调用。
 * 引擎内核因此不含任何玩法语义；装配只在数据包加载时发生一次。
 */
const byGame = new Map();      // gid → [module namespace]
const installed = new Set();   // 已 install 的包名（fx/cond 全局注册，幂等）

/* 未声明 modules 的旧数据包按类型给缺省装配 */
const FALLBACK = {
  novel: ['checks', 'npc', 'quests', 'achievements', 'cultivation', 'combat', 'dungeon'],
  coc: ['checks', 'npc', 'quests', 'achievements', 'combat', 'sanity', 'clues', 'cocchar'],
};
const NAME_RE = /^[a-z][a-z0-9_]*$/;

async function assemblePacks(gid, moduleNames) {
  const names = (Array.isArray(moduleNames) && moduleNames.length) ? moduleNames : null;
  if (!names) throw new Error(`游戏 ${gid} 未声明 modules 能力清单`);
  const packs = [];
  for (const name of names) {
    if (!NAME_RE.test(name)) throw new Error(`非法能力包名: ${name}`);
    const m = await import(`../packs/${name}/index.js`);
    if (m.install && !installed.has(name)) { m.install(); installed.add(name); }
    packs.push(m);
  }
  byGame.set(gid, packs);
  return packs;
}

function packsOf(gid) { return byGame.get(gid) || []; }

/* 自由行动注入（修炼/炼丹/……按当前状态返回可用行动） */
function packActions(s) {
  return packsOf(s.gameId).flatMap(m => (m.actions ? m.actions(s) : []));
}
/* 顶栏资源条（境界/理智/……） */
function packChips(s, def) {
  return packsOf(s.gameId).flatMap(m => (m.chips ? m.chips(s, def) : []));
}
/* 场景进入/选项/自由行动之后的状态勾稽钩子 */
async function packAfterFx(ctx) {
  for (const m of packsOf(ctx.state.gameId)) {
    if (m.afterFx) await m.afterFx(ctx);
  }
}

export { assemblePacks, packsOf, packActions, packChips, packAfterFx, FALLBACK };
