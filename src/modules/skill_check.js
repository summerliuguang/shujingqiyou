/* ---------------- 检定（d100 / CoC 分级 / SAN） ---------------- */
import { d100, roll } from '../core/dice.js';
import { esc } from '../core/text.js';
import { clamp } from '../core/state.js';
import { pushLine } from '../core/ctx.js';
import { runFx } from '../core/effects.js';

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
function runSanCheck(e, ctx) {
  const s = ctx.state;
  const r = d100(0);
  const pass = r <= s.san;
  const loss = roll(pass ? e[1] : e[2]);
  s.san = Math.max(0, s.san - loss);
  pushLine(ctx, 'roll',
    `🎲 <b>理智检定</b>（当前 SAN ${s.san}）掷出 <b>${r}</b> —— ${pass ? '<span class="roll-good">通过</span>' : '<span class="roll-fail">失败</span>'}，损失 ${loss} 点理智${e[3] ? '<span class="dim">（' + esc(e[3]) + '）</span>' : ''}`);
  if (loss >= 5) {
    s.flags.insaneTemp = true;
    pushLine(ctx, 'loss', '⚠️ 单次损失达 5 点，你陷入<b>临时疯狂</b>，指尖止不住地颤抖……');
  }
  if (s.san <= 0) {
    ctx.end = { title: '理智崩溃', text: '你的理智已被彻底榨干，永远地迷失在了无边的恐惧之中……', kind: 'mad' };
  }
}

export { checkBase, runCheck, runSanCheck };
