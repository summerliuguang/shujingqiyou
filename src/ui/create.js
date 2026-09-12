/* ============================================================
 * 建卡：小说 / CoC 调查员
 * ============================================================ */
import { TA } from '../engine/api.js';
import { $, view, el, btn, U } from './core.js';
import { startGame } from './view.js';
import { showHome } from './home.js';
import { loadGame } from '../shell/game_loader.js';

/* ---------------- 建卡 ---------------- */
export async function showCreate(gid) {
  let g;
  try { g = await loadGame(gid); }
  catch (e) { TA.hooks.toast('加载失败：' + e.message); return; }
  U.createTemp = { gid, name: '', opts: {} };
  const v = view();
  v.innerHTML = '';
  $('#topbar').classList.add('hidden');
  const wrap = el('div', 'create');
  wrap.appendChild(btn('btn ghost back', '← 返回书阁', showHome));

  if (g.type === 'coc') buildCocCreate(wrap, g);
  else buildNovelCreate(wrap, g);
  v.appendChild(wrap);
  window.scrollTo(0, 0);
}

function buildNovelCreate(wrap, g) {
  wrap.appendChild(el('h2', null, `${g.icon} ${g.title}`));
  wrap.appendChild(el('p', 'create-sub', g.desc));
  const box = el('div', 'create-box');
  box.appendChild(el('label', 'field', `你的名字（将取代书中主角，亲历剧情）`));
  const input = el('input');
  input.id = 'char-name';
  input.maxLength = 12;
  input.placeholder = '如：陈默、艾伦、{你的名字}';
  box.appendChild(input);
  if (g.charOpts && g.charOpts.length) {
    box.appendChild(el('label', 'field', g.charOpts.label || '出身'));
    const opts = el('div', 'opt-list');
    g.charOpts.items.forEach((o, i) => {
      const d = el('div', 'opt-card' + (i === 0 ? ' sel' : ''));
      d.innerHTML = `<b>${o.name}</b><span>${o.desc}</span>`;
      d.addEventListener('click', () => {
        opts.querySelectorAll('.opt-card').forEach(x => x.classList.remove('sel'));
        d.classList.add('sel');
        U.createTemp.opts.birth = o.id;
      });
      opts.appendChild(d);
    });
    if (g.charOpts.items[0]) U.createTemp.opts.birth = g.charOpts.items[0].id;
    box.appendChild(opts);
  }
  wrap.appendChild(box);
  const start = btn('btn solid big', '📖 开始冒险', () => {
    const name = ($('#char-name').value || '').trim() || '无名者';
    startGame(g.id, name, { ...U.createTemp.opts });
  });
  wrap.appendChild(start);
  requestAnimationFrame(() => input.focus());
}

function buildCocCreate(wrap, g) {
  U.createTemp.attrs = TA.cocRollAttrs();
  U.createTemp.occ = (g.occupations || [])[0] ? (g.occupations || [])[0].name : null;
  wrap.appendChild(el('h2', null, `🎲 ${g.title}`));
  wrap.appendChild(el('p', 'create-sub', g.desc + '（跑团规则：COC 7版简化版，掷骰决定命运）'));

  const box = el('div', 'create-box coc-card');
  box.appendChild(el('h3', null, '📋 你的调查员'));
  const attrsBox = el('div', 'coc-attrs');
  box.appendChild(attrsBox);
  const occBox = el('div', 'occ-list');
  box.appendChild(el('label', 'field', '职业（决定技能擅长）'));
  box.appendChild(occBox);

  function rerender() {
    const der = TA.cocDerived(U.createTemp.attrs);
    U.createTemp.der = der;
    const rows = TA.COC_ATTRS.map(k => {
      const v = U.createTemp.attrs[k];
      const half = Math.floor(v / 2), fifth = Math.floor(v / 5);
      return `<tr><td>${k}</td><td><b>${v}</b></td><td class="dim">${half}/${fifth}</td></tr>`;
    }).join('');
    attrsBox.innerHTML = `
      <table class="mini-table"><tr><th>属性</th><th>值</th><th>困难/极难</th></tr>${rows}</table>
      <div class="coc-derived">
        <span>❤️ 生命 <b>${der.hp}</b></span>
        <span>🧠 理智 <b>${U.createTemp.attrs.POW}</b></span>
        <span>🔮 魔力 <b>${der.mp}</b></span>
        <span>💪 伤害加值 <b>${der.db}</b></span>
      </div>`;
    occBox.innerHTML = '';
    (g.occupations || []).forEach(o => {
      const d = el('div', 'opt-card sm' + (U.createTemp.occ === o.name ? ' sel' : ''));
      d.innerHTML = `<b>${o.name}</b><span>${o.desc}</span><span class="dim">擅长：${o.skills.map(x => '+' + x[1] + ' ' + x[0]).join('，')}</span>`;
      d.addEventListener('click', () => { U.createTemp.occ = o.name; rerender(); });
      occBox.appendChild(d);
    });
  }
  rerender();
  wrap.appendChild(box);
  const re = btn('btn ghost', '🎲 重掷属性', () => { U.createTemp.attrs = TA.cocRollAttrs(); rerender(); });
  wrap.appendChild(re);
  const start = btn('btn solid big', '🕯️ 开始调查', () => {
    const name = ($('#char-name').value || '').trim() || '无名调查员';
    startGame(g.id, name, { attrs: U.createTemp.attrs, occ: U.createTemp.occ });
  });
  const box2 = el('div', 'create-box');
  box2.appendChild(el('label', 'field', '调查员姓名'));
  const input = el('input');
  input.id = 'char-name';
  input.maxLength = 12;
  input.placeholder = '你的名字';
  box2.appendChild(input);
  wrap.appendChild(box2);
  wrap.appendChild(start);
}

