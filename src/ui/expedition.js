/* ============================================================
 * 秘境 UI：bus.call(EV.EXPEDITION) 的监听端——逐层三选一抉择，
 * 返回 {pick: 序号} 或 {pick:'leave'}（撤离）。结算在 expedition 能力包。
 * ============================================================ */
import { TA } from '../engine/api.js';
import { TAAudio } from '../audio/bgm.js';
import { el, btn } from './core.js';
import { modal } from './panels.js';

const KIND_ICON = { combat: '⚔️', loot: '💎', event: '❓', heal: '🏕️', exit: '🚪' };

function expeditionDialog({ state: s, offers, layer, budget, name, totalLayers, loots }) {
  return new Promise(resolve => {
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } };
    const overlay = modal(`🌌 ${name} · 第 ${layer}/${totalLayers} 层`, (body) => {
      body.appendChild(el('p', 'dim', `行动预算还剩 ${budget} 步${budget <= 2 ? '——秘境的排斥感越来越强。' : ''}${loots && loots.length ? `　🎒 已获：${loots.slice(-4).join('、')}` : ''}`));
      const grid = el('div', 'exp-choices');
      offers.forEach((o, i) => {
        const b = btn('choice-btn exp-offer',
          `<span class="c-t">${o.icon || KIND_ICON[o.kind] || '·'} ${TA.esc(o.t)}</span>${o.sub ? `<span class="c-sub">${TA.esc(o.sub)}</span>` : ''}`,
          () => { TAAudio.sfx('click'); overlay.remove(); done({ pick: i }); });
        grid.appendChild(b);
      });
      body.appendChild(grid);
      body.appendChild(btn('btn ghost', '🧳 携宝撤离（保留已获收获）', () => { overlay.remove(); done({ pick: 'leave' }); }));
    }, 'wide', () => done({ pick: 'leave' }));
  });
}

export { expeditionDialog };
