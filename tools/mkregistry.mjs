#!/usr/bin/env node
/* ============================================================
 * 生成 games/<id>/manifest.json 与 games/registry.js：
 * 逐包 import 取 def 摘要（不依赖引擎），registry 供首页卡片
 * 与懒加载使用。数据包增删后重跑。用法：node tools/mkregistry.mjs
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = path.join(ROOT, 'games');
globalThis.window = globalThis;   // _shared/coc 求值期写 window.TA_DATA

const MODULES = {
  novel: ['checks', 'npc', 'quests', 'achievements', 'cultivation', 'combat', 'dungeon'],
  coc: ['checks', 'npc', 'quests', 'achievements', 'combat', 'sanity', 'clues', 'cocchar'],
};

const ids = fs.readdirSync(GAMES).filter(d => !d.startsWith('_') && fs.existsSync(path.join(GAMES, d, 'data', 'index.js'))).sort();
if (!ids.length) { console.error('games/ 下没有数据包，先跑 node tools/packify.mjs'); process.exit(1); }

/* v1 首页展示顺序（原 index.html script 顺序）；新包排在末尾 */
const ORDER = ['fanren', 'daomu', 'panlong', 'zhetian', 'longzu', 'wuxian', 'coc_haunting', 'coc_deadlight', 'coc_flames'];

const entries = [];
for (const id of ids) {
  const def = (await import(`../games/${id}/data/index.js`)).default;
  const manifest = {
    id: def.id,
    name: def.title,
    type: def.type === 'coc' ? 'trpg' : 'webnovel',
    version: '2.0.0',
    author: '书境奇游',
    description: def.desc,
    icon: def.icon,
    source: def.source,
    tags: def.tags,
    difficulty: def.difficulty,
    length: def.length,
    entry: 'data/index.js',
    startNode: def.start,
    modules: def.modules || MODULES[def.type] || MODULES.novel,
    theme: def.theme,
    audio: { bgm: def.bgm, narr: def.narr },
    saveVersion: 2,
  };
  fs.writeFileSync(path.join(GAMES, id, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  entries.push({
    id: def.id,
    type: def.type,
    title: def.title,
    source: def.source,
    icon: def.icon,
    desc: def.desc,
    tags: def.tags,
    difficulty: def.difficulty,
    length: def.length,
    theme: def.theme,
    endings: (def.endings || []).map(e => ({ title: e.title, kind: e.kind })),
  });
  console.log(`✅ manifest: ${id}（${def.title} · ${(def.endings || []).length} 结局）`);
}

entries.sort((a, b) => {
  const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
  return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib);
});

fs.writeFileSync(path.join(GAMES, 'registry.js'),
  `/* 由 tools/mkregistry.mjs 生成（数据包增删后重跑），勿手改 */\nexport const REGISTRY = ${JSON.stringify(entries, null, 2)};\n`);
console.log(`\nregistry.js：${entries.length} 个数据包`);
