#!/usr/bin/env node
/* ============================================================
 * 无头随机游玩测试：随机选择/随机战斗结果，抓运行时异常与断头路
 * 用法：node tools/smoke.js [游戏id] [步数]
 * ============================================================ */
import { boot } from './_loader.mjs';
import { bus, EV } from '../src/core/bus.js';

const TA = await boot();

/* 无头钩子：战斗随机结算，结局记录 */
let lastEnd = null;
let steps = 0;
bus.on(EV.LOG, () => {});
bus.on(EV.REFRESH, () => {});
bus.on(EV.TOAST, () => {});
bus.on(EV.ENDING, e => { lastEnd = e; });
bus.on(EV.COMBAT, async () => {
  const r = Math.random();
  return r < 0.7 ? 'win' : (r < 0.85 ? 'flee' : 'lose');
});

const target = process.argv[2];
const MAX_STEPS = parseInt(process.argv[3] || '300', 10);
const list = target ? [TA.GAMES[target]].filter(Boolean) : Object.values(TA.GAMES);
if (!list.length) { console.log('未找到游戏: ' + target); process.exit(1); }

let totalDeaths = 0, totalEnds = 0;
for (const g of list) {
  for (let run = 0; run < 3; run++) {
    const s = TA.newGame(g.id, '测试者' + run, { birth: 'four', occ: '大学生' });
    lastEnd = null;
    steps = 0;
    try {
      await TA.enterScene(s, g.start);
      while (steps++ < MAX_STEPS) {
        if (lastEnd) break;
        const choices = TA.visibleChoices(s);
        const actionable = choices.filter(c => c.kind !== 'maphead');
        if (!actionable.length) { throw new Error(`死头路: 场景 ${s.scene} 无可选项`); }
        const pick = actionable[Math.floor(Math.random() * actionable.length)];
        if (pick.kind === 'choice') await TA.choose(s, pick.c, pick.idx);
        else if (pick.kind === 'travel') await TA.enterScene(s, pick.loc.scene, { via: 'user' });
        else await TA.freeAction(s, pick.act);
      }
    } catch (e) {
      console.log(`❌ ${g.id} run${run}: ${e.message}\n   场景=${s.scene} 选项执行中崩溃`);
      console.log(e.stack.split('\n').slice(0, 3).join('\n'));
      process.exit(1);
    }
    if (lastEnd) totalEnds++; else if (steps >= MAX_STEPS) { console.log(`  ⚠️  ${g.id} run${run}: ${MAX_STEPS} 步未达结局（自由探索型可接受）`); }
    if (lastEnd && ['bad', 'mad'].includes(lastEnd.kind)) totalDeaths++;
  }
  console.log(`✅ ${g.id} 随机通玩 3 轮通过（到达结局 ${totalEnds} 次）`);
  totalEnds = 0;
}
console.log('\n无头游玩测试全部通过');
