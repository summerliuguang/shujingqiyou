/* ---------------- AI KP 能力包（CoC 模组框架内跑团） ----------------
 * 场景字段 kp: true 的模组启用「自由行动输入框」：
 *   玩家输入 → 后端 /api/kp/chat（带模组背景+场景+历史）→ LLM 返回 JSON：
 *     { narrative, checks?: [{stat, reason}], stateOps?: [白名单fx], goto? }
 *   引擎侧执行：骰子本地掷（checks 转 runCheck）、stateOps 白名单过滤、
 *   goto 只认场景图已有节点——LLM 无权发明数值或场景。
 * LLM 不可达/超时 → 静默回退预设选项（单人模式照常可玩）。
 */
import { game } from '../../engine/registry.js';
import { mkCtx } from '../../engine/ctx.js';
import { runFx } from '../../engine/effects.js';
import { pushLine } from '../../engine/ctx.js';
import { bus, EV } from '../../engine/bus.js';
import { api } from '../../api/client.js';
import { esc } from '../../engine/text.js';

const OPS_WHITELIST = new Set(['flag', 'delflag', 'clue', 'san', 'hp', 'item', 'cocskill']);
const MAX_HISTORY = 12;      // 发给 LLM 的行动历史条数
const MAX_INPUT = 200;       // 玩家单次输入上限

/* 解析 LLM 输出：容忍 markdown 代码块包裹 */
function parseKpJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/* stateOps → 白名单 fx 数组（数量/深度钳制） */
function sanitizeOps(ops) {
  if (!Array.isArray(ops)) return [];
  const out = [];
  for (const op of ops.slice(0, 4)) {
    if (!Array.isArray(op) || !OPS_WHITELIST.has(op[0])) continue;
    if (op[0] === 'san' || op[0] === 'hp') {
      const n = parseInt(op[1], 10);
      if (!Number.isFinite(n) || n === 0) continue;
      out.push([op[0], Math.max(-6, Math.min(6, n))]);
    } else if (op[0] === 'item') {
      const n = parseInt(op[2] == null ? 1 : op[2], 10);
      if (!Number.isFinite(n)) continue;
      out.push(['item', String(op[1]).slice(0, 24), Math.max(-3, Math.min(3, n))]);
    } else if (op[0] === 'cocskill') {
      const n = parseInt(op[2], 10);
      out.push(['cocskill', String(op[1]).slice(0, 16), Math.max(-3, Math.min(3, Number.isFinite(n) ? n : 1))]);
    } else {
      out.push([op[0], String(op[1]).slice(0, 32)]);
    }
  }
  return out;
}

function historyOf(s) {
  s.kpHistory = s.kpHistory || [];
  return s.kpHistory;
}

async function kpFreeInput(s, input) {
  const def = game(s.gameId);
  const scene = def.scenes[s.scene] || {};
  const ctx = mkCtx(s);
  ctx.via = 'user';
  ctx.entries.push({ cls: 'choice-echo', text: '🗣️ ' + input.slice(0, 60) + (input.length > 60 ? '…' : '') });

  const hist = historyOf(s);
  hist.push({ role: 'user', content: input });
  if (hist.length > MAX_HISTORY * 2) hist.splice(0, hist.length - MAX_HISTORY * 2);

  /* 模组背景（config.kpBrief 或缺省）+ 当前场景快照 */
  const sceneBrief = `${scene.title || s.scene}：${typeof scene.text === 'function' ? '' : (scene.text || '')}`.slice(0, 400);
  const stateBrief = `HP ${s.hp}/${s.hpMax} · SAN ${s.san}/${s.sanMax} · 线索 ${Object.keys(s.clues || {}).length} 条 · 旗标：${Object.keys(s.flags || {}).slice(0, 12).join('、') || '无'}`;
  const sysExtra = `【模组】${def.title}\n【当前场景】${sceneBrief}\n【调查员状态】${stateBrief}\n（若玩家的行动明显应推进到模组的下一个场景，用 goto 指向其节点 id；可用节点示例：${Object.keys(def.scenes).slice(0, 20).join('、')}）`;

  let data = null;
  try {
    const r = await api.kpChat([
      { role: 'system', content: sysExtra },
      ...hist.map(h => ({ role: h.role, content: String(h.content).slice(0, 600) })),
    ]);
    if (r.status === 200 && r.data && !r.data.error) data = r.data;
    else if (r.data && r.data.error) pushLine(ctx, 'fx', `（KP 走神了：${r.data.error}。你可以继续用下方预设选项。）`);
  } catch { /* 静默降级 */ }

  const parsed = data && parseKpJson(data.text);
  if (!parsed || !parsed.narrative) {
    if (!data) pushLine(ctx, 'fx', '（KP 一时没有回应。你可以继续用下方预设选项推进。）');
    ctx.lines.push({ cls: 'dim', text: '——KP 未给出有效回应，试试别的行动或用预设选项。' });
    await flush(ctx, s);
    return;
  }

  hist.push({ role: 'assistant', content: parsed.narrative.slice(0, 500) });
  pushLine(ctx, 'fx', parsed.narrative);

  /* stateOps 白名单执行 */
  const ops = sanitizeOps(parsed.stateOps);
  if (ops.length) await runFx(ops, ctx);

  /* checks：骰子本地掷（走 check fx 的 coc 路径） */
  if (Array.isArray(parsed.checks)) {
    for (const c of parsed.checks.slice(0, 2)) {
      if (!c || !c.stat) continue;
      await runFx([['check', { stat: String(c.stat).slice(0, 16), label: String(c.stat), desc: c.reason ? String(c.reason).slice(0, 60) : undefined, pass: [['text', '（检定通过，行动顺利）']], fail: [['text', '（检定失败——事与愿违。）']] }]], ctx);
    }
  }

  /* goto：只认场景图已有节点 */
  let gotoId = typeof parsed.goto === 'string' && def.scenes[parsed.goto] ? parsed.goto : null;
  if (gotoId) ctx.goto = gotoId;
  await flush(ctx, s);
}

async function flush(ctx, s) {
  /* 与 actions.flushAndContinue 相同的收尾：日志/勾稽/存档/流转 */
  const { packAfterFx } = await import('../../engine/packs.js');
  await packAfterFx(ctx);
  if (ctx.entries.length || ctx.lines.length) bus.emit(EV.LOG, ctx.entries.concat(ctx.lines));
  bus.emit(EV.REFRESH);
  const { handleEnd, enterScene, resolveGoto } = await import('../../engine/router.js');
  const { autosave } = await import('../../engine/save.js');
  if (ctx.end) return handleEnd(s, ctx.end);
  if (ctx.goto) return enterScene(s, resolveGoto(ctx.goto, s));
  const { tickPlaytime } = await import('../../engine/router.js');
  tickPlaytime(s);
  autosave(s);
}

/* 引擎识别：kp 场景在选项区顶部渲染自由输入框（UI 订阅 REFRESH 后查询） */
function kpEnabled(s) {
  const def = game(s.gameId);
  if (!def) return false;
  if (def.kp === false) return false;          // 模组级关闭
  const scene = def.scenes[s.scene];
  return !!(scene && (scene.kp || def.kp));    // 场景级或模组级开启
}

export { kpFreeInput, kpEnabled, parseKpJson, sanitizeOps };
