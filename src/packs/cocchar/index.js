/* ---------------- CoC 建卡能力包：技能成长 fx ----------------
 * 建卡工厂在 games/_shared/coc（走 window.TA 门面），本包只注册
 * 运行期效果与顶栏理智条的渲染数据。
 * fx: ['cocskill', 技能名, ±n]（上限 99）
 */
import { pushLine } from '../../engine/ctx.js';
import { registerFx } from '../../engine/effects.js';

function install() {
  registerFx('cocskill', (e, ctx) => {
    const s = ctx.state;
    if (s.cocSkills && s.cocSkills[e[1]] != null) {
      s.cocSkills[e[1]] = Math.min(99, s.cocSkills[e[1]] + e[2]);
      pushLine(ctx, 'skill', `📈 【${e[1]}】提升至 ${s.cocSkills[e[1]]}%`);
    }
  });
}

/* 顶栏资源条：CoC 理智 */
function chips(s) {
  return [`<span class="qs" title="理智">🧠 ${s.san}/${s.sanMax}</span>`];
}

export { install, chips };
