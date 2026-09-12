/* ---------------- 运行时数据校验（加载即校验，浏览器侧 def 级） ----------------
 * manifest 字段与深层内容校验在 tools/validate.js（Node 侧），
 * 这里只做引擎运转所必需的最小不变量。
 */
function validateDef(def) {
  const errs = [];
  if (!def || typeof def !== 'object') return ['GameDef 不是对象'];
  for (const f of ['id', 'type', 'title', 'desc', 'createChar']) {
    if (!def[f]) errs.push(`缺少字段: ${f}`);
  }
  if (def.type && !['novel', 'coc'].includes(def.type)) errs.push(`未知类型: ${def.type}`);
  if (!def.scenes || !Object.keys(def.scenes).length) errs.push('没有任何场景');
  else if (def.start && !def.scenes[def.start]) errs.push(`起始场景不存在: ${def.start}`);
  return errs;
}

export { validateDef };
