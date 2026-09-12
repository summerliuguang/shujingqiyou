/* ---------------- 检定能力包（d100 / CoC 分级） ----------------
 * fx: ['check', { label?, stat?, dc?, mod?, bpd?, pass/fail/hard/extreme/fumble, gotoPass/gotoFail }]
 * novel 用 dc 固定目标值；coc 用 stat 查 cocSkills/cocAttrs 且分困难/极难等级。
 */
import { d100 } from '../../engine/dice.js';
import { esc } from '../../engine/text.js';
import { clamp } from '../../engine/state.js';
import { pushLine } from '../../engine/ctx.js';
import { runFx, registerFx } from '../../engine/effects.js';

function checkBase(spec, s) {
  if (typeof spec.stat === 'number') return spec.stat;
  if (s.cocSkills && spec.stat in s.cocSkills) return s.cocSkills[spec.stat];
  if (s.cocAttrs && spec.stat in s.cocAttrs) return s.cocAttrs[spec.stat];
  return spec.dc != null ? spec.dc : 50;
}
async function runCheck(spec, ctx) {
  const s = ctx.state, def = ctx.def;
  const coc = def.type === 'coc';
  const base = clamp(checkBase(spec, s) + (spec.mod || 0), 1, 99);
  const r = d100(spec.bpd || 0);
  const isFumble = r >= 96 && r > base;
  const isExtreme = coc && !isFumble && base >= 25 && r <= Math.floor(base / 5);
  const isHard = coc && !isFumble && !isExtreme && base >= 25 && r <= Math.floor(base / 2);
  const isPass = !isFumble && r <= base;
  let levelText, levelCls;
  if (isFumble) { levelText = '大失败'; levelCls = 'crit-fail'; }
  else if (isExtreme) { levelText = '极难成功'; levelCls = 'crit'; }
  else if (isHard) { levelText = '困难成功'; levelCls = 'good'; }
  else if (isPass) { levelText = '成功'; levelCls = 'good'; }
  else { levelText = '失败'; levelCls = 'fail'; }
  pushLine(ctx, 'roll',
    `🎲 <b>${esc(spec.label || spec.stat || '检定')}</b>（目标 ${base}${spec.bpd ? (spec.bpd > 0 ? '，奖励骰' : '，惩罚骰') : ''}）掷出 <b>${r}</b> —— <span class="roll-${levelCls}">${levelText}</span>${spec.desc ? '<span class="dim">（' + esc(spec.desc) + '）</span>' : ''}`);
  if (isFumble) await runFx(spec.fumble || spec.fail, ctx);
  else if (isExtreme) await runFx(spec.extreme || spec.hard || spec.pass, ctx);
  else if (isHard) await runFx(spec.hard || spec.pass, ctx);
  else if (isPass) await runFx(spec.pass, ctx);
  else await runFx(spec.fail, ctx);
  if (isPass) {
    if (spec.gotoPass) ctx.goto = spec.gotoPass;
    if (coc && s.cocSkills && spec.stat in s.cocSkills && Math.random() < 0.35) {
      s.cocSkills[spec.stat] = Math.min(99, s.cocSkills[spec.stat] + 2);
      pushLine(ctx, 'skill', `📈 经验积累：【${spec.stat}】提升至 ${s.cocSkills[spec.stat]}`);
    }
  } else if (spec.gotoFail) {
    ctx.goto = spec.gotoFail;
  }
}

function install() {
  registerFx('check', (e, ctx) => runCheck(e[1], ctx));
}

export { checkBase, runCheck, install };
