/* ---------------- 条件：cond 注册表 + 引擎通用条件 ----------------
 * 通用原语（旗标/物品/属性/技能/到访/金钱）引擎直接解释；
 * 玩法专属条件（境界/NPC 好感/线索……）由能力包经 registerCond 注册。
 */
import { getStat, hasItem } from './state.js';

const COND = new Map();
/* 注册专属条件：test(c, s) 判定；desc(c, def) 生成锁定原因文案。 */
function registerCond(name, test, desc) { COND.set(name, { test, desc }); }


function cmp(a, op, b) {
  switch (op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: return a >= b;
  }
}
function testOne(c, s) {
  const reg = COND.get(c[0]);
  if (reg) return reg.test(c, s);
  switch (c[0]) {
    case 'flag': return c[2] === undefined ? !!s.flags[c[1]] : s.flags[c[1]] === c[2];
    case '!flag': return !s.flags[c[1]];
    case 'item': return hasItem(s, c[1], c[2]);
    case '!item': return !hasItem(s, c[1], 1);
    case 'stat': return cmp(getStat(s, c[1]), c[3] || '>=', c[2]);
    case 'skill': return s.skills.includes(c[1]) || !!(s.cocSkills && s.cocSkills[c[1]] > 0);
    case 'visited': return !!s.visited[c[1]];
    case 'money': return cmp(s.money || 0, c[2] || '>=', c[1]);
    default: return true;
  }
}
function testCond(cond, s) {
  if (!cond) return true;
  if (typeof cond === 'function') return !!cond(s);
  if (!Array.isArray(cond)) return true;
  return cond.every(c => (Array.isArray(c) && c.length) ? testOne(c, s) : true);
}
function describeCond(c, def) {
  def = def || {};
  const reg = COND.get(c[0]);
  if (reg && reg.desc) return reg.desc(c, def);
  const items = def.items || {};
  switch (c[0]) {
    case 'flag': return `需要契机：${c[1]}`;
    case '!flag': return `不可带有：${c[1]}`;
    case 'item': return `需要：${(items[c[1]] || {}).name || c[1]}${c[2] > 1 ? '×' + c[2] : ''}`;
    case '!item': return `不可持有：${(items[c[1]] || {}).name || c[1]}`;
    case 'stat': return `需要 ${c[1]} ${c[3] || '≥'} ${c[2]}`;
    case 'skill': return `需要技能：${((def.skills || {})[c[1]] || {}).name || c[1]}`;
    case 'money': return `需要${def.moneyName || '金钱'} ≥ ${c[1]}`;
    case 'visited': return '需要先去过某处';
    default: return '';
  }
}

export { cmp, testOne, testCond, describeCond, registerCond };
