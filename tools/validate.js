#!/usr/bin/env node
/* ============================================================
 * 数据完整性校验：场景死链 / 死路 / 物品敌人技能引用 / 可达性
 * 用法：node tools/validate.js
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = path.join(ROOT, 'games');

const games = [];
globalThis.window = globalThis;   // _shared/coc 求值期写 window.TA_DATA

let errors = 0, warnings = 0;
function err(msg) { errors++; console.log('  ❌ ' + msg); }
function warn(msg) { warnings++; console.log('  ⚠️  ' + msg); }

/* 加载所有数据文件（registry.js 除外），并检测 scenes/maps 内重复键 */
function findDupKeys(code, blockName, fname) {
  const marker = 'export const ' + blockName + ' = ';
  const start = code.indexOf(marker);
  if (start < 0) return;
  let i = code.indexOf('{', start), depth = 0;
  const brace0 = i;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) break; }
  }
  const slice = code.slice(brace0, i);
  const keyRe = /^    ([A-Za-z_][A-Za-z0-9_]*): \{/gm;
  const seen = new Map();
  let m;
  while ((m = keyRe.exec(slice))) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  for (const [k, c] of seen) {
    if (c > 1) { console.log(`❌ ${fname}: ${blockName} 内键 "${k}" 重复定义 ${c} 次（后者静默覆盖前者）`); errors++; }
  }
}
for (const d of fs.readdirSync(GAMES_DIR).sort()) {
  const entryFile = path.join(GAMES_DIR, d, 'data', 'index.js');
  if (!fs.existsSync(entryFile)) continue;
  for (const block of ['scenes', 'maps']) {
    const bf = path.join(GAMES_DIR, d, 'data', block + '.js');
    if (fs.existsSync(bf)) findDupKeys(fs.readFileSync(bf, 'utf8'), block, `${d}/data/${block}.js`);
  }
  try { games.push((await import(`../games/${d}/data/index.js`)).default); }
  catch (e) { console.log(`❌ ${d} 加载失败: ${e.message}`); errors++; }
}

console.log(`\n共加载 ${games.length} 个游戏\n`);

for (const g of games) {
  console.log(`\n📖 ${g.title} (${g.id})`);
  const sceneIds = Object.keys(g.scenes || {});
  if (!sceneIds.length) { err('没有任何场景'); continue; }
  if (!g.scenes[g.start]) err(`起点场景不存在: ${g.start}`);

  const refs = new Set();   // goto 目标
  const hasEnding = new Set();

  function fxWalk(fx, where, targets) {
    if (!fx) return;
    const arr = typeof fx === 'function' ? fx({}) : fx;
    if (!Array.isArray(arr)) return;
    for (const e of arr) {
      if (!Array.isArray(e)) { err(`${where}: 非法效果 ${JSON.stringify(e)}`); continue; }
      const [k, a, b] = e;
      switch (k) {
        case 'text': break;
        case 'flag': case 'delflag': case 'attr': case 'set': break;
        case 'item': case '!item': if (!g.items || !g.items[a]) warn(`${where}: 物品未定义 "${a}"`); break;
        case 'skill': case 'forget': if (!g.skills || !g.skills[a]) warn(`${where}: 技能未定义 "${a}"`); break;
        case 'map': if (!g.maps || !g.maps[a]) err(`${where}: 地图未定义 "${a}"`); break;
        case 'combat': {
          if (!g.enemies || !g.enemies[a]) err(`${where}: 敌人未定义 "${a}"`);
          for (const t of [b, e[3], e[4]]) {
            if (t != null && !g.scenes[t]) err(`${where}: combat 跳转场景不存在 "${t}"`);
            if (t && targets) targets.add(t);
            if (t) refs.add(t);
          }
          if (e[3] == null && e[4] == null && g.deathEnding) hasEnding.add(g.deathEnding.title);
          break;
        }
        case 'check': {
          for (const branch of ['pass', 'fail', 'hard', 'extreme', 'fumble']) fxWalk((a || {})[branch], `${where}.check.${branch}`, targets);
          if (a && a.gotoPass) { if (!g.scenes[a.gotoPass]) err(`${where}: check gotoPass 场景不存在 "${a.gotoPass}"`); refs.add(a.gotoPass); if (targets) targets.add(a.gotoPass); }
          if (a && a.gotoFail) { if (!g.scenes[a.gotoFail]) err(`${where}: check gotoFail 场景不存在 "${a.gotoFail}"`); refs.add(a.gotoFail); if (targets) targets.add(a.gotoFail); }
          break;
        }
        case 'sancheck': break;
        case 'up': break;
        case 'quest': if (g.quests && a && !g.quests[a]) warn(`${where}: 任务未注册 "${a}"`); break;
        case 'npc': if (!g.npcs || !g.npcs[a]) warn(`${where}: NPC 未定义 "${a}"`); break;
        case 'clue': if (!g.clues || !g.clues[a]) warn(`${where}: 线索未定义 "${a}"`); break;
        case 'dungeon': if (!g.dungeons || !g.dungeons[a]) err(`${where}: 副本未定义 "${a}"`); break;
        case 'cocskill': break;
        case 'rand': {
          if (!Array.isArray(a)) { err(`${where}: rand 表不是数组`); break; }
          for (const row of a) { if (!Array.isArray(row) || row.length !== 2) err(`${where}: rand 行格式错误`); else fxWalk(row[1], `${where}.rand`, targets); }
          break;
        }
        case 'goto': {
          const t = typeof a === 'function' ? null : a;
          if (t) { if (!g.scenes[t]) err(`${where}: goto 场景不存在 "${t}"`); refs.add(t); if (targets) targets.add(t); }
          break;
        }
        case 'end': if (typeof a !== 'function') hasEnding.add(a); break;
        case 'realmup': if (!(g.realms || []).length) err(`${where}: realmup 但游戏无境界表`); break;
        case 'hp': case 'mp': case 'san': case 'money': case 'exp': case 'heal': break;
        default: warn(`${where}: 未知效果类型 "${k}"`);
      }
    }
  }

  function condWalk(cond, where) {
    if (!cond || typeof cond === 'function' || !Array.isArray(cond)) return;
    if (Array.isArray(cond[0])) { for (const c of cond) condWalk(c, where); return; }
    if (cond[0] === 'item' && g.items && !g.items[cond[1]]) warn(`${where}: 条件引用未定义物品 "${cond[1]}"`);
    if (cond[0] === 'skill' && g.skills && !g.skills[cond[1]]) warn(`${where}: 条件引用未定义技能 "${cond[1]}"`);
    if (['npcmet', 'npcaff'].includes(cond[0]) && g.npcs && !g.npcs[cond[1]]) warn(`${where}: 条件引用未定义 NPC "${cond[1]}"`);
    if (cond[0] === 'clue' && g.clues && !g.clues[cond[1]]) warn(`${where}: 条件引用未定义线索 "${cond[1]}"`);
    if (cond[0] === 'quest' && g.quests && !g.quests[cond[1]]) warn(`${where}: 条件引用未注册任务 "${cond[1]}"`);
  }

  for (const [sid, sc] of Object.entries(g.scenes)) {
    const where = `${g.id}/${sid}`;
    fxWalk(sc.enter, where + '.enter');
    if (sc.ending) hasEnding.add(sc.ending.title);
    (sc.choices || []).forEach((c, i) => {
      condWalk(c.req, `${where}#${i}.req`);
      condWalk(c.show, `${where}#${i}.show`);
      fxWalk(c.fx, `${where}#${i}.fx`);
      if (c.goto != null && typeof c.goto !== 'function') {
        if (!g.scenes[c.goto]) err(`${where}#${i}: goto 场景不存在 "${c.goto}"`);
        refs.add(c.goto);
      }
    });
    (sc.explorePool || []).forEach((p, i) => {
      condWalk(p.show, `${where}.pool#${i}.show`);
      fxWalk(p.fx, `${where}.pool#${i}.fx`);
      if (p.goto && !g.scenes[p.goto]) err(`${where}.pool#${i}: goto 场景不存在 "${p.goto}"`);
      if (p.goto) refs.add(p.goto);
    });
    for (const loc of ((g.maps[sc.map] || {}).locations || [])) {
      if (!g.scenes[loc.scene]) err(`${where}: 地图地点 "${loc.t}" 场景不存在 "${loc.scene}"`);
      refs.add(loc.scene);
      condWalk(loc.req, `${where}.loc.req`);
    }
    /* 死路检查：无选项、无探索、无地点、非结局 */
    const map = g.maps[sc.map];
    const hasWayOut = (sc.choices || []).length || (sc.explorePool || []).length ||
      ((map && (map.locations || []).length) || 0) > 0 || sc.ending;
    if (!hasWayOut && !sc.enter?.some(e => e[0] === 'combat' || e[0] === 'end' || e[0] === 'goto')) {
      warn(`${where}: 可能死路（无选项/探索/地点/结局）`);
    }
  }

  /* 敌人掉落与技能引用 */
  for (const [eid, en] of Object.entries(g.enemies || {})) {
    for (const [iid] of (en.drops || [])) {
      if (!g.items || !g.items[iid]) err(`${g.id}: 敌人 ${eid} 掉落未定义物品 "${iid}"`);
    }
    if (!en.hp || !en.name) err(`${g.id}: 敌人 ${eid} 缺少 hp/name`);
  }
  /* 结局收集核对 */
  for (const e of (g.endings || [])) {
    if (!hasEnding.has(e.title)) warn(`${g.id}: 结局清单 "${e.title}" 未在场景/效果中使用`);
  }
  for (const t of hasEnding) {
    if (!(g.endings || []).some(x => x.title === t)) warn(`${g.id}: 实际结局 "${t}" 未登记到 endings 清单`);
  }

  /* 可达性 */
  function fxTargets(fx, out) {
    const arr = Array.isArray(fx) ? fx : null;
    if (!arr) return;
    for (const e of arr) {
      if (!Array.isArray(e)) continue;
      if (e[0] === 'goto' && typeof e[1] === 'string') out.push(e[1]);
      if (e[0] === 'combat') [e[2], e[3], e[4]].forEach(t => { if (t) out.push(t); });
      if (e[0] === 'check' && e[1]) {
        if (e[1].gotoPass) out.push(e[1].gotoPass);
        if (e[1].gotoFail) out.push(e[1].gotoFail);
        for (const br of ['pass', 'fail', 'hard', 'extreme', 'fumble']) fxTargets((e[1] || {})[br], out);
      }
      if (e[0] === 'rand' && Array.isArray(e[1])) for (const row of e[1]) fxTargets(row[1], out);
    }
  }
  const reach = new Set([g.start]);
  const queue = [g.start];
  while (queue.length) {
    const sid = queue.shift();
    const sc = g.scenes[sid];
    if (!sc) continue;
    const out = [];
    (sc.choices || []).forEach(c => {
      if (typeof c.goto === 'string') out.push(c.goto);
      fxTargets(c.fx, out);
    });
    (sc.explorePool || []).forEach(p => { if (p.goto) out.push(p.goto); fxTargets(p.fx, out); });
    fxTargets(sc.enter, out);
    const map = g.maps[sc.map];
    ((map && map.locations) || []).forEach(l => out.push(l.scene));
    for (const t of out) if (g.scenes[t] && !reach.has(t)) { reach.add(t); queue.push(t); }
  }
  for (const sid of sceneIds) {
    if (!reach.has(sid)) warn(`${g.id}/${sid}: 从起点不可达`);
  }

  /* 全条件放开可达性：无视一切 req/show/once，找出"永远到不了"的场景 */
  const reach2 = new Set([g.start]);
  const queue2 = [g.start];
  while (queue2.length) {
    const sid = queue2.shift();
    const sc = g.scenes[sid];
    if (!sc) continue;
    const out = [];
    (sc.choices || []).forEach(c => {
      if (typeof c.goto === 'string') out.push(c.goto);
      fxTargets(c.fx, out);
    });
    (sc.explorePool || []).forEach(p => { if (p.goto) out.push(p.goto); fxTargets(p.fx, out); });
    fxTargets(sc.enter, out);
    const map2 = g.maps[sc.map];
    ((map2 && map2.locations) || []).forEach(l => out.push(l.scene));
    for (const t of out) if (g.scenes[t] && !reach2.has(t)) { reach2.add(t); queue2.push(t); }
  }
  for (const sid of sceneIds) {
    if (!reach2.has(sid)) err(`${g.id}/${sid}: 即使放开全部条件也无法到达（支线断链）`);
  }
  /* 结局可达性（全条件放开） */
  for (const e of (g.endings || [])) {
    const via = sceneIds.filter(sid => {
      const sc = g.scenes[sid];
      if (sc.ending && sc.ending.title === e.title && reach2.has(sid)) return true;
      let ok = false;
      const scan = (fx) => {
        const arr = Array.isArray(fx) ? fx : null; if (!arr) return;
        for (const x of arr) {
          if (!Array.isArray(x)) continue;
          if (x[0] === 'end' && typeof x[1] === 'object' && x[1] == null) continue;
          if (x[0] === 'end' && typeof x[1] === 'string' && x[1] === e.title && reach2.has(sid)) ok = true;
          if (x[0] === 'combat') fxTargets([x], []);
          if (x[0] === 'rand' && Array.isArray(x[1])) for (const row of x[1]) scan(row[1]);
          if (x[0] === 'check' && x[1]) for (const br of ['pass', 'fail', 'hard', 'extreme', 'fumble']) scan((x[1] || {})[br]);
        }
      };
      scan(sc.choices || []); scan(sc.explorePool || []); scan(sc.enter || []);
      const map3 = g.maps[sc.map];
      ((map3 && map3.locations) || []).forEach(l => { if (reach2.has(l.scene) && g.scenes[l.scene] && g.scenes[l.scene].ending && g.scenes[l.scene].ending.title === e.title) ok = true; });
      return ok;
    });
    if (!via.length) warn(`${g.id}: 结局「${e.title}」在全条件放开下仍无法达成（函数式结局可忽略）`);
  }

  const nEnd = (g.endings || []).length;
  console.log(`  场景 ${sceneIds.length} · 敌人 ${Object.keys(g.enemies || {}).length} · 物品 ${Object.keys(g.items || {}).length} · 技能 ${Object.keys(g.skills || {}).length} · 结局 ${nEnd}`);
}

console.log(`\n==============================`);
console.log(`校验完成：${errors} 个错误，${warnings} 个警告`);
process.exit(errors > 0 ? 1 : 0);
