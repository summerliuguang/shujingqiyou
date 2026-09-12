/* ---------------- 效果执行：fx 注册表 + 引擎通用效果 ----------------
 * 数据语言原语（属性/物品/旗标/跳转/结局/随机）由引擎直接解释；
 * 玩法专属效果（战斗/检定/理智/境界/副本/NPC/线索……）由能力包
 * 经 registerFx 注册——引擎内核零玩法语义。
 */
import { fmt } from './text.js';
import { itemAdd, setStat, clamp } from './state.js';
import { pushLine } from './ctx.js';

const FX = new Map();
/* 能力包装配时注册（packs/<name>/install）；同名后注册者胜（可覆盖）。 */
function registerFx(name, fn) { FX.set(name, fn); }

async function runFx(fx, ctx) {
  if (!fx) return;
  const arr = typeof fx === 'function' ? fx(ctx.state) : fx;
  if (!Array.isArray(arr)) return;
  for (const e of arr) await runOneFx(e, ctx);
}
async function runOneFx(e, ctx) {
  const s = ctx.state, def = ctx.def;
  const custom = FX.get(e[0]);
  if (custom) return custom(e, ctx);
  const items = def.items || {}, skills = def.skills || {}, maps = def.maps || {};
  switch (e[0]) {
    case 'text':
      pushLine(ctx, 'fx', fmt(e[1], s));
      break;
    case 'flag':
      s.flags[e[1]] = e[2] === undefined ? true : e[2];
      break;
    case 'delflag':
      delete s.flags[e[1]];
      break;
    case 'item': {
      const id = e[1], n = e[2] == null ? 1 : e[2];
      itemAdd(s, id, n);
      const it = items[id] || {};
      if (n > 0) pushLine(ctx, 'gain', `${it.icon || '📦'} 获得【${it.name || id}】${n > 1 ? '×' + n : ''}`);
      else pushLine(ctx, 'loss', `失去【${it.name || id}】${n < -1 ? '×' + (-n) : ''}`);
      break;
    }
    case 'hp': case 'mp': case 'san': {
      const maxK = e[0] + 'Max';
      s[e[0]] = clamp(s[e[0]] + e[1], 0, s[maxK] || 99);
      const label = { hp: (def.statLabels || {}).hp || '生命', mp: (def.statLabels || {}).mp || '法力', san: '理智' }[e[0]];
      pushLine(ctx, e[1] >= 0 ? 'gain' : 'loss',
        `${e[1] >= 0 ? '恢复' : '损失'}${label} ${Math.abs(e[1])} 点（当前 ${s[e[0]]}/${s[maxK]}）`);
      break;
    }
    case 'money':
      s.money = (s.money || 0) + e[1];
      pushLine(ctx, e[1] >= 0 ? 'gain' : 'loss',
        `${e[1] >= 0 ? '获得' : '失去'} ${Math.abs(e[1])} ${def.moneyName || '金钱'}（现有 ${s.money}）`);
      break;
    case 'exp':
      s.exp += e[1];
      pushLine(ctx, 'gain', `经验 +${e[1]}（当前 ${s.exp}）`);
      break;
    case 'attr':
      s.attrs[e[1]] = (s.attrs[e[1]] || 0) + e[2];
      pushLine(ctx, e[2] >= 0 ? 'gain' : 'loss', `${e[1]} ${e[2] >= 0 ? '+' : ''}${e[2]}（当前 ${s.attrs[e[1]]}）`);
      break;
    case 'set':
      setStat(s, e[1], e[2]);
      break;
    case 'quest': {
      const qn = e[1];
      if (def.quests && def.quests[qn]) {
        /* 注册表任务：['quest', id, 'active'|'done'|'fail'] */
        const mode = e[2] || 'active';
        const st = ((s.questState = s.questState || {})[qn] = s.questState[qn] || { state: 'active', obj: {} });
        if (mode === 'active') st.state = 'active';
        else if (mode === 'done') {
          if (st.state !== 'done') {
            st.state = 'done';
            pushLine(ctx, 'skill', `✅ 任务完成：【${def.quests[qn].title || qn}】`);
            if (def.quests[qn].rewards) await runFx(def.quests[qn].rewards, ctx);
          }
        } else if (mode === 'fail') st.state = 'fail';
        break;
      }
      if (!s.quests.includes(qn)) {
        s.quests.push(qn);
        pushLine(ctx, 'skill', `📋 支线开启：${qn}`);
      } else if (e[2] === 'done') {
        const i = s.quests.indexOf(qn);
        if (i >= 0) { s.quests[i] = qn + '（已完成）'; pushLine(ctx, 'skill', `✅ 支线完成：${qn}`); }
      }
      break;
    }
    case 'up': {
      const [k, n] = [e[1], e[2]];
      if (k === 'hpMax') { s.hpMax += n; s.hp += n; }
      else if (k === 'mpMax') { s.mpMax += n; s.mp += n; }
      else if (['atk', 'def', 'agi'].includes(k)) s[k] += n;
      pushLine(ctx, 'gain', `${({ atk: '⚔️ 攻击', def: '🛡️ 防御', agi: '👟 敏捷', hpMax: '❤️ 生命上限', mpMax: '🔮 法力上限' })[k] || k} ${n >= 0 ? '+' : ''}${n}（当前 ${k === 'hpMax' ? s.hpMax : k === 'mpMax' ? s.mpMax : s[k]}）`);
      break;
    }
    case 'skill': {
      if (!s.skills.includes(e[1])) {
        s.skills.push(e[1]);
        pushLine(ctx, 'skill', `✨ 习得技能/法术【${(skills[e[1]] || {}).name || e[1]}】`);
      }
      break;
    }
    case 'forget': {
      const i = s.skills.indexOf(e[1]);
      if (i >= 0) {
        s.skills.splice(i, 1);
        pushLine(ctx, 'loss', `失去技能【${(skills[e[1]] || {}).name || e[1]}】`);
      }
      break;
    }
    case 'map':
      s.map = e[1];
      pushLine(ctx, 'map', `🗺️ 进入【${(maps[e[1]] || {}).name || e[1]}】`);
      break;
    case 'rand': {
      const table = e[1];
      const total = table.reduce((t, r) => t + r[0], 0);
      let r = Math.random() * total;
      for (const row of table) {
        r -= row[0];
        if (r <= 0) { await runFx(row[1], ctx); break; }
      }
      break;
    }
    case 'goto':
      ctx.goto = typeof e[1] === 'function' ? e[1](s) : e[1];
      break;
    case 'end': {
      const r = typeof e[1] === 'function' ? e[1](s) : { title: e[1], text: e[2], kind: e[3] };
      ctx.end = { title: fmt(r.title, s), text: fmt(r.text, s), kind: r.kind || 'normal' };
      break;
    }
    case 'heal':
      s.hp = clamp(s.hp + e[1], 0, s.hpMax);
      pushLine(ctx, 'gain', `恢复生命 ${e[1]} 点（当前 ${s.hp}/${s.hpMax}）`);
      break;
    default:
      console.warn('未知效果', e);
  }
}

export { runFx, registerFx };
