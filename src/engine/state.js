/* ---------------- 属性访问 / 状态创建 / CoC 建卡 ---------------- */
import { game } from './registry.js';
import { roll } from './dice.js';

function getStat(s, key) {
  if (key in s) return s[key];
  if (s.attrs && key in s.attrs) return s.attrs[key];
  if (s.cocAttrs && key in s.cocAttrs) return s.cocAttrs[key];
  return 0;
}
function setStat(s, key, v) {
  if (key in s) s[key] = v;
  else if (s.cocAttrs && key in s.cocAttrs) s.cocAttrs[key] = v;
  else s.attrs[key] = v;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function itemAdd(s, id, n) {
  n = n == null ? 1 : n;
  s.items[id] = (s.items[id] || 0) + n;
  if (s.items[id] <= 0) {
    delete s.items[id];
    if (s.equip.weapon === id) s.equip.weapon = null;
    if (s.equip.armor === id) s.equip.armor = null;
  }
}
function hasItem(s, id, n) { return (s.items[id] || 0) >= (n || 1); }

function baseState(gid, name) {
  return {
    gameId: gid, name: name || '无名者', created: Date.now(), playtime: 0,
    scene: null, map: null, prevScene: null,
    hp: 0, hpMax: 0, mp: 0, mpMax: 0, san: 0, sanMax: 0,
    atk: 0, def: 0, agi: 0, money: 0, exp: 0, realmIdx: 0,
    attrs: {}, flags: {}, items: {}, skills: [], equip: { weapon: null, armor: null },
    used: {}, visited: {}, kills: 0, history: [], quests: [],
    npc: {}, clues: {}, questState: {}, achievements: {},
    cocAttrs: null, cocSkills: null, cocDB: '',
  };
}
/* 旧存档恢复时补齐 v2 新增字段（不覆盖已有值） */
function normalizeState(s) {
  for (const k of ['npc', 'clues', 'questState', 'achievements']) {
    if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  }
  return s;
}
function newGame(gid, name, opts) {
  const def = game(gid);
  const s = baseState(gid, name);
  def.createChar(s, name, opts || {});
  s.scene = def.start;
  return s;
}

/* ---------------- CoC 建卡 ---------------- */
const COC_ATTRS = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'];
function cocRollAttrs() {
  const a = {};
  for (const k of COC_ATTRS) {
    a[k] = (k === 'SIZ' || k === 'INT' || k === 'EDU') ? roll('2d6+6') * 5 : roll('3d6') * 5;
  }
  return a;
}
function cocDerived(a) {
  const strSiz = a.STR + a.SIZ;
  let db = '-2';
  if (strSiz >= 65) db = '-1';
  if (strSiz >= 85) db = '0';
  if (strSiz >= 125) db = '1d4';
  if (strSiz >= 165) db = '1d6';
  return {
    hp: Math.max(1, Math.ceil((a.CON + a.SIZ) / 10)),
    mp: Math.max(1, Math.floor(a.POW / 5)),
    db,
  };
}

export {
  getStat, setStat, clamp, itemAdd, hasItem,
  baseState, newGame, normalizeState,
  COC_ATTRS, cocRollAttrs, cocDerived,
};
