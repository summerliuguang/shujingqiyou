/* ---------------- 副本能力包：可重复挑战的连战 ----------------
 * GameDef.dungeons: { <id>: { name, desc, enemies:[敌人id...],
 *   floors?, exp:[min,max], money:[min,max] } }
 * fx: ['dungeon', id] —— 逐层随机抽敌、复用战斗浮层连战；
 * 全胜拿 exp/ money 区间随机奖励，中途败走按死亡/逃跑语义收场。
 */
import { mkCombat } from '../combat/index.js';
import { pushLine } from '../../engine/ctx.js';
import { bus, EV } from '../../engine/bus.js';
import { registerFx } from '../../engine/effects.js';

function randInt(range) {
  if (!Array.isArray(range)) return 0;
  const [a, b] = range;
  return Math.floor(a + Math.random() * (b - a + 1));
}

async function runDungeon(id, ctx) {
  const s = ctx.state, def = ctx.def;
  const d = (def.dungeons || {})[id];
  if (!d || !Array.isArray(d.enemies) || !d.enemies.length) { pushLine(ctx, 'fx', '此副本并未开放。'); return; }
  const floors = d.floors || d.enemies.length;
  pushLine(ctx, 'map', `⚔️ 深入【${d.name}】${d.desc ? '——' + d.desc : ''}`);
  for (let f = 1; f <= floors; f++) {
    const eid = d.enemies[Math.floor(Math.random() * d.enemies.length)];
    const en = def.enemies[eid];
    if (!en) continue;
    pushLine(ctx, 'fx', `第 ${f}/${floors} 层：${en.icon || '👹'} 【${en.name}】扑了出来！`);
    const res = await bus.call(EV.COMBAT, mkCombat(s, eid, ctx));
    if (res === 'win') continue;
    if (res === 'lose') {
      ctx.end = def.deathEnding || { title: '命丧黄泉', text: '你倒在副本深处，无人收殓。', kind: 'bad' };
      return;
    }
    pushLine(ctx, 'loss', `你且战且退，撤出了【${d.name}】。`);
    return;
  }
  const exp = randInt(d.exp), money = randInt(d.money);
  if (exp) { s.exp += exp; pushLine(ctx, 'gain', `副本通清！经验 +${exp}（当前 ${s.exp}）`); }
  if (money) {
    s.money = (s.money || 0) + money;
    pushLine(ctx, 'gain', `拾获战利品，折现 ${money} ${def.moneyName || '金钱'}（现有 ${s.money}）`);
  }
  if (!exp && !money) pushLine(ctx, 'gain', `副本通清！`);
}

function install() {
  registerFx('dungeon', (e, ctx) => runDungeon(e[1], ctx));
}

export { runDungeon, install };
