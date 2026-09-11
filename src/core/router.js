/* ---------------- 场景流转 / 结局 / 游玩时长 ---------------- */
import { game } from './registry.js';
import { fmt } from './text.js';
import { mkCtx } from './ctx.js';
import { runFx } from './effects.js';
import { autosave, recordEnding } from './save.js';
import { checkQuests } from '../modules/quests.js';
import { checkAchievements } from '../modules/achievements.js';
import { bus, EV } from './bus.js';
import { sceneText } from '../modules/story.js';

function resolveGoto(g, s) { return typeof g === 'function' ? g(s) : g; }

async function enterScene(s, id, opts) {
  const def = game(s.gameId);
  const scene = def.scenes[id];
  if (!scene) { console.error('场景不存在:', id); bus.emit(EV.TOAST, '剧情场景缺失：' + id); return; }
  opts = opts || {};
  if (opts.via === 'user') s.history.push(s.scene);
  s.prevScene = s.scene;
  s.scene = id;
  if (scene.map) s.map = scene.map;
  s.visited[id] = (s.visited[id] || 0) + 1;
  const ctx = mkCtx(s);
  const entries = [];
  if (!opts.quietTitle) {
    entries.push({ cls: 'divider' });
    entries.push({ cls: 'scene-title', text: scene.title || '' });
  }
  if (!opts.noText) {
    entries.push({ cls: 'scene-text', html: fmt(sceneText(scene, s), s).replace(/\n/g, '<br>') });
  }
  await runFx(scene.enter, ctx);
  await checkQuests(s, ctx);
  await checkAchievements(s, ctx);
  if (!ctx.end && scene.ending) {
    const ed = scene.ending;
    ctx.end = { title: fmt(ed.title, s), text: fmt(ed.text, s), kind: ed.kind || 'normal' };
  }
  if (entries.length || ctx.lines.length) bus.emit(EV.LOG, entries.concat(ctx.lines));
  bus.emit(EV.REFRESH);
  if (ctx.end) return handleEnd(s, ctx.end);
  if (ctx.goto) return enterScene(s, resolveGoto(ctx.goto, s));
  tickPlaytime(s);
  autosave(s);
}

async function handleEnd(s, end) {
  tickPlaytime(s);
  recordEnding(s.gameId, end);
  autosave(s);
  bus.emit(EV.ENDING, end);
}

/* ---------------- 游玩时长 ---------------- */
let lastTick = Date.now();
function tickPlaytime(s) {
  const now = Date.now();
  s.playtime = (s.playtime || 0) + Math.min(120, Math.floor((now - lastTick) / 1000));
  lastTick = now;
}
function playtimeText(sec) {
  if (!sec) return '—';
  if (sec < 60) return sec + ' 秒';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + ' 分钟';
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
}

export { resolveGoto, enterScene, handleEnd, tickPlaytime, playtimeText };
