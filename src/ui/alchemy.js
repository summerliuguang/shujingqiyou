/* ============================================================
 * 炼丹台 UI：bus.call(EV.ALCHEMY) 的监听端——列出丹方让玩家选，
 * 返回丹方 id（开炉）或 null（取消）。实际结算在 alchemy 能力包。
 * ============================================================ */
import { TA } from '../engine/api.js';
import { el, btn } from './core.js';
import { modal } from './panels.js';
import { needOk, needText, recipeDc } from '../packs/alchemy/index.js';

function alchemyDialog({ state: s, def }) {
  return new Promise(resolve => {
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } };
    const overlay = modal('⚗️ 丹房 · 开炉炼丹', (body) => {
      const entries = Object.entries(def.recipes || {});
      if (!entries.length) { body.appendChild(el('p', 'dim center', '还没有可炼的丹方。')); return; }
      for (const [id, r] of entries) {
        const ok = needOk(s, r.need);
        const dc = recipeDc(s, def, r);
        const row = el('div', 'sk-row alch-row' + (ok ? '' : ' dim'));
        row.innerHTML = `
          <b>${r.icon || '⚗️'} ${TA.esc(r.name)}</b>
          <span class="dim">${TA.esc(r.desc || '')}</span>
          <span class="alch-meta">药材：${TA.esc(needText(def, r.need))} · 成丹 ${dc} / 上品 ${Math.floor(dc / 2)}</span>`;
        if (ok) {
          row.appendChild(btn('btn solid sm', '起火开炉', () => { overlay.remove(); done(id); }));
        } else {
          row.appendChild(el('span', 'dim', '药材不足'));
        }
        body.appendChild(row);
      }
      body.appendChild(el('p', 'dim center', '骰值 ≤ 一半为上品（产量翻倍），≤ 难度为成丹，超出则废丹（药材照耗）。'));
    }, 'wide', () => done(null));
  });
}

export { alchemyDialog };
