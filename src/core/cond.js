/* ---------------- 条件 ---------------- */
import { getStat, hasItem } from './state.js';


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
  switch (c[0]) {
    case 'flag': return c[2] === undefined ? !!s.flags[c[1]] : s.flags[c[1]] === c[2];
    case '!flag': return !s.flags[c[1]];
    case 'item': return hasItem(s, c[1], c[2]);
    case '!item': return !hasItem(s, c[1], 1);
    case 'stat': return cmp(getStat(s, c[1]), c[3] || '>=', c[2]);
    case 'realm': return cmp(s.realmIdx || 0, c[2] || '>=', c[1]);
    case 'skill': return s.skills.includes(c[1]) || !!(s.cocSkills && s.cocSkills[c[1]] > 0);
    case 'visited': return !!s.visited[c[1]];
    case 'money': return cmp(s.money || 0, c[2] || '>=', c[1]);
    case 'npcmet': return !!(s.npc && s.npc[c[1]]);
    case 'npcaff': return !!((s.npc || {})[c[1]] && ((s.npc[c[1]].affinity || 0) >= (c[2] != null ? c[2] : 1)));
    case 'clue': return !!(s.clues && s.clues[c[1]]);
    case 'clues': return Object.keys(s.clues || {}).length >= (c[1] || 1);
    case 'quest': {
      const st = (s.questState || {})[c[1]];
      return st ? st.state === (c[2] || 'done') : false;
    }
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
  const items = def.items || {};
  switch (c[0]) {
    case 'flag': return `需要契机：${c[1]}`;
    case '!flag': return `不可带有：${c[1]}`;
    case 'item': return `需要：${(items[c[1]] || {}).name || c[1]}${c[2] > 1 ? '×' + c[2] : ''}`;
    case '!item': return `不可持有：${(items[c[1]] || {}).name || c[1]}`;
    case 'stat': return `需要 ${c[1]} ${c[3] || '≥'} ${c[2]}`;
    case 'realm': return `需要境界：${((def.realms || [])[c[1]] || {}).name || '第' + c[1] + '境'}`;
    case 'skill': return `需要技能：${((def.skills || {})[c[1]] || {}).name || c[1]}`;
    case 'money': return `需要${def.moneyName || '金钱'} ≥ ${c[1]}`;
    case 'visited': return '需要先去过某处';
    case 'npcmet': return `需要见过：${((def.npcs || {})[c[1]] || {}).name || c[1]}`;
    case 'npcaff': return `需要${((def.npcs || {})[c[1]] || {}).name || c[1]}更信任你`;
    case 'clue': return `需要线索：${((def.clues || {})[c[1]] || {}).name || c[1]}`;
    case 'clues': return `需要线索 ×${c[1] || 1}`;
    case 'quest': return `需要任务：${((def.quests || {})[c[1]] || {}).title || c[1]}`;
    default: return '';
  }
}

export { cmp, testOne, testCond, describeCond };
