/* ---------------- 闭关能力包：离线放置修炼 ----------------
 * 场景字段 seclusion: true | [cond]（洞府/静室类场景）
 * 自由行动：🕳️ 闭关修行 —— 记录 s.seclusion={at}，修为离线积累；
 * 出关（读档/点出关）时结算：
 *   有效时辰 = min(经过,8) + min(max(经过-8,0),16)×0.5   （超 24 时辰不再累积）
 *   收益 = cultivateGain(s) × 每时辰当量(4) × 有效时辰 × 聚灵阵(×1.5)
 * 防作弊：时钟回拨（经过 ≤0）不给收益；单次上限 24 时辰当量 16。
 */
import { game } from '../../engine/registry.js';
import { autosave } from '../../engine/save.js';
import { testCond } from '../../engine/cond.js';
import { bus, EV } from '../../engine/bus.js';
import { realmNeed, cultivateGain } from '../cultivation/index.js';

const HOUR_MS = 3600 * 1000;
const FULL_HOURS = 8;      // 前 8 时辰全额
const HALF_CAP = 16;       // 之后 16 时辰半额（共 24 封顶）
const PER_HOUR = 4;        // 每时辰相当于主动修炼 4 次

function seclusionGain(s, hours) {
  const eff = Math.min(hours, FULL_HOURS) + Math.max(0, Math.min(hours - FULL_HOURS, HALF_CAP)) * 0.5;
  let g = Math.round(cultivateGain(s) * PER_HOUR * eff);
  if (s.flags.聚灵阵) g = Math.round(g * 1.5);
  return g;
}

/* 出关结算：读档入口（resumeGame）与「出关」行动都会调用。
 * 返回结算信息（供 UI 弹窗）或 null（未在闭关/无收益）。 */
function settleSeclusion(s) {
  if (!s.seclusion || !s.seclusion.at) return null;
  const at = s.seclusion.at;
  delete s.seclusion;
  const hours = (Date.now() - at) / HOUR_MS;
  if (hours <= 0.05) return { hours: 0, gain: 0, msg: '你刚入定不久便被外事惊扰，这次闭关没有多少长进。' };
  const gain = seclusionGain(s, hours);
  s.exp += gain;
  const need = realmNeed(s);
  const hText = hours >= 1 ? `${Math.floor(hours)} 个时辰` : `${Math.round(hours * 60)} 分钟`;
  return {
    hours, gain,
    msg: `🧘 你闭关 ${hText}，出关时气机浑厚——修为 +${gain}（突破进度 ${s.exp}/${isFinite(need) ? need : '∞'}）${s.flags.聚灵阵 ? '，聚灵阵灵气氤氲，事半功倍。' : ''}`,
  };
}

function actions(s) {
  const def = game(s.gameId);
  const scene = def.scenes[s.scene] || {};
  const list = [];
  if (s.seclusion) {
    /* 闭关中：只提供出关 */
    list.push({
      act: 'unseclude', t: '🌅 破关而出', sub: '结算本次闭关收获', hot: true,
      echo: '▶ 破关而出', pace: ['推开关门，灵压如潮水般散开……', 800],
      run: (ctx) => {
        const r = settleSeclusion(s);
        if (r) ctx.lines.push({ cls: r.gain > 0 ? 'gain' : 'fx', text: r.msg });
      },
    });
    return list;
  }
  const ok = scene.seclusion && (scene.seclusion === true || testCond(scene.seclusion, s));
  if (ok) {
    list.push({
      act: 'seclude', t: '🕳️ 闭关修行', sub: '离线也在积累修为，随时回来出关',
      echo: '▶ 闭关修行', pace: ['布下禁制，封关静修……', 900],
      run: (ctx) => {
        s.seclusion = { at: Date.now() };
        s.flags['曾闭关'] = true;
        autosave(s);
        ctx.lines.push({ cls: 'skill', text: '🕯️ 你布下简单禁制，就此闭关。（离开页面也没关系，修为会随时间积累；点「破关而出」结算）' });
        bus.emit(EV.TOAST, '已进入闭关，随时回来出关结算');
      },
    });
  }
  return list;
}

export { settleSeclusion, seclusionGain, actions };
