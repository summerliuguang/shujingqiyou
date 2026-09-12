/* ---------------- 对外 API（TA 门面） ----------------
 * 组装引擎各模块为单一 TA 对象，接口与 v1 完全一致；
 * v1 的 TA.hooks 改为事件总线适配器（emit/call），行为不变。
 * 浏览器中：收割 bootstrap 注册表（经典数据脚本写入的 GAMES），
 * 然后接管 window.TA——数据文件运行时的全局 TA 查找由此生效。
 */
import { GAMES, registerGame, game, games } from './registry.js';
import { d, roll, d100 } from './dice.js';
import { esc, fmt } from './text.js';
import { getStat, setStat, clamp, hasItem, itemAdd, newGame, normalizeState, COC_ATTRS, cocRollAttrs, cocDerived } from './state.js';
import { testCond, testOne, describeCond } from './cond.js';
import * as saves from './save.js';
import { runFx } from './effects.js';
import { enterScene, playtimeText } from './router.js';
import { choose, freeAction, useItem, dropItem } from './actions.js';
/* 能力包纯函数（无装配副作用）：检定/理智/修炼数学/战斗数学，供数据包与工具直接调用 */
import { runCheck } from '../packs/checks/index.js';
import { runSanCheck } from '../packs/sanity/index.js';
import { realmNeed, cultivateGain } from '../packs/cultivation/index.js';
import * as combatMath from '../packs/combat/index.js';
import { settleSeclusion } from '../packs/idle/index.js';
import { kpFreeInput, kpEnabled } from '../packs/kp/index.js';
import { visibleChoices, sceneText } from './story.js';
import { packsOf, packActions, packChips } from './packs.js';
import { bus, EV } from './bus.js';

let currentGid = null;

const TA = {
  GAMES, registerGame, game, games,
  dice: { d, roll, d100 },
  esc, fmt,
  testCond, testOne, describeCond,
  getStat, setStat, hasItem, itemAdd, clamp,
  newGame, normalizeState, cocRollAttrs, cocDerived, COC_ATTRS,
  enterScene, choose, freeAction, useItem, dropItem,
  runFx, runCheck, runSanCheck,
  visibleChoices, sceneText,
  packsOf, packActions, packChips,
  realmNeed, cultivateGain, settleSeclusion,
  kpFreeInput, kpEnabled,
  combatMath,
  saves,
  playtimeText,
  setGid(gid) { currentGid = gid; },
  hooks: {
    appendLog: entries => bus.emit(EV.LOG, entries),
    refresh: () => bus.emit(EV.REFRESH),
    toast: msg => bus.emit(EV.TOAST, msg),
    ending: end => bus.emit(EV.ENDING, end),
    combat: payload => bus.call(EV.COMBAT, payload),
  },
};

if (typeof window !== 'undefined') window.TA = TA;

export { TA };
