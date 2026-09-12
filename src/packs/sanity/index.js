/* ---------------- 理智能力包（CoC SAN） ----------------
 * fx: ['sancheck', 通过损失骰, 失败损失骰, 原因?]
 * d100 ≤ 当前 SAN 通过；单次损失 ≥5 临时疯狂；SAN=0 → 理智崩溃结局。
 */
import { d100, roll } from '../../engine/dice.js';
import { esc } from '../../engine/text.js';
import { pushLine } from '../../engine/ctx.js';
import { registerFx } from '../../engine/effects.js';

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

function install() {
  registerFx('sancheck', (e, ctx) => runSanCheck(e, ctx));
}

export { runSanCheck, install };
