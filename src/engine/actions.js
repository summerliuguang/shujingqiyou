/* ---------------- 玩家操作入口：选择 / 自由行动 / 道具 ---------------- */
import { game } from './registry.js';
import { fmt } from './text.js';
import { mkCtx } from './ctx.js';
import { runFx } from './effects.js';
import { hasItem, itemAdd, clamp } from './state.js';
import { autosave } from './save.js';
import { enterScene, resolveGoto, handleEnd, tickPlaytime } from './router.js';
import { exploreAction } from './story.js';
import { packAfterFx, packActions } from './packs.js';
import { bus, EV } from './bus.js';

async function progress(s, ctx) {
  await packAfterFx(ctx);
}

async function choose(s, choice, idx) {
  const ctx = mkCtx(s);
  s.used[`${s.scene}:${idx}`] = 1;
  ctx.via = 'user';
  ctx.entries = [{ cls: 'choice-echo', text: '▶ ' + fmt(choice.t, s) }];
  await runFx(choice.fx, ctx);
  if (!ctx.goto && choice.goto != null) ctx.goto = resolveGoto(choice.goto, s);
  await flushAndContinue(s, ctx);
}

async function flushAndContinue(s, ctx) {
  await progress(s, ctx);
  if (ctx.entries.length || ctx.lines.length) bus.emit(EV.LOG, ctx.entries.concat(ctx.lines));
  bus.emit(EV.REFRESH);
  if (ctx.end) return handleEnd(s, ctx.end);
  if (ctx.goto) return enterScene(s, resolveGoto(ctx.goto, s));
  tickPlaytime(s);
  autosave(s);
}

/* 自由行动：探索 / 休息 / 后退为引擎通用；其余（修炼/突破/炼丹……）
 * 由已装配能力包的 actions 注入——此处按 act 名分派到对应包。 */
async function freeAction(s, kind) {
  const ctx = mkCtx(s);
  ctx.via = 'user';
  if (kind === 'explore') {
    ctx.entries.push({ cls: 'choice-echo', text: '▶ 探索周遭' });
    await exploreAction(ctx);
  } else if (kind === 'rest') {
    const h = Math.ceil(s.hpMax * 0.3), m = Math.ceil(s.mpMax * 0.3);
    s.hp = clamp(s.hp + h, 0, s.hpMax);
    s.mp = clamp(s.mp + m, 0, s.mpMax);
    ctx.entries.push({ cls: 'choice-echo', text: '▶ 休息片刻' });
    ctx.lines.push({ cls: 'gain', text: `🏕️ 你休整片刻，恢复生命 ${h} 点、法力 ${m} 点。` });
  } else if (kind === 'back') {
    const prev = s.history.pop();
    if (prev) return enterScene(s, prev);
  } else {
    const act = packActions(s).find(a => a.act === kind);
    if (act) {
      ctx.entries.push({ cls: 'choice-echo', text: act.echo || '▶ ' + act.t });
      await act.run(ctx);
    } else {
      bus.emit(EV.TOAST, '该行动当前不可用');
      return;
    }
  }
  await flushAndContinue(s, ctx);
}

/* ---------------- 道具 ---------------- */
async function useItem(s, itemId) {
  const def = game(s.gameId);
  const it = def.items[itemId];
  if (!it || !hasItem(s, itemId)) return;
  if (it.kind === 'weapon' || it.kind === 'armor') {
    const slot = it.kind === 'weapon' ? 'weapon' : 'armor';
    s.equip[slot] = s.equip[slot] === itemId ? null : itemId;
    bus.emit(EV.TOAST, s.equip[slot] ? `${it.icon || '🗡️'} 已装备【${it.name}】` : `已卸下【${it.name}】`);
    bus.emit(EV.REFRESH);
    return;
  }
  if (it.kind !== 'consumable' && !it.fx) { bus.emit(EV.TOAST, it.usetext || '这件物品现在似乎用不上'); return; }
  const ctx = mkCtx(s);
  itemAdd(s, itemId, -1);
  ctx.entries = [{ cls: 'choice-echo', text: `▶ 使用【${it.name}】` }];
  await runFx(it.fx, ctx);
  await flushAndContinue(s, ctx);
}
function dropItem(s, itemId) {
  itemAdd(s, itemId, -(s.items[itemId] || 0));
  bus.emit(EV.TOAST, '已丢弃');
  bus.emit(EV.REFRESH);
}

export { choose, freeAction, flushAndContinue, useItem, dropItem };
