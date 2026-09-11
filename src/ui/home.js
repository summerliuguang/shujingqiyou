/* ============================================================
 * 首页：书阁 / 游戏卡片
 * ============================================================ */
import { TA } from '../core/api.js';
import { TAAudio } from '../audio/bgm.js';
import { TAVoice } from '../audio/voice.js';
import { REGISTRY } from '../shell/game_loader.js';
import { $, view, el, btn, U } from './core.js';
import { showCreate } from './create.js';
import { resumeGame } from './view.js';
import { sync } from '../api/sync.js';
import { toast } from './core.js';

/* ================= 首页 ================= */
export function showHome() {
  U.S = null;
  TAAudio.stopBgm();
  TAVoice.stop();
  document.body.classList.remove('low-hp');
  $('#topbar').classList.add('hidden');
  const v = view();
  v.innerHTML = '';
  const wrap = el('div', 'home');

  const hero = el('section', 'hero');
  hero.appendChild(el('h1', null, '📖 书境奇游'));
  hero.appendChild(el('p', 'hero-sub', '踏入书页深处——修仙问鼎、古墓探幽、魔法纵横、屠龙猎奇，或在一个雨夜掷出命运的 d100。'));
  const totalEnds = REGISTRY.reduce((t, g) => t + Object.keys(TA.saves.endings(g.id)).length, 0);
  hero.appendChild(el('p', 'hero-stats', `${REGISTRY.length} 部作品 · 你已达成 <b>${totalEnds}</b> 个结局`));
  wrap.appendChild(hero);

  const types = el('section', 'type-select');
  const titles = t => REGISTRY.filter(g => g.type === t).map(g => g.title.replace(/^CoC · /, '')).join(' · ');
  const tdef = [
    { id: 'all', icon: '🕹️', name: '全部旅程', desc: '浏览书阁所有收藏' },
    { id: 'novel', icon: '📚', name: '小说改编', desc: titles('novel') },
    { id: 'coc', icon: '🎲', name: 'CoC 跑团', desc: titles('coc') },
  ];
  for (const t of tdef) {
    const card = el('div', 'type-card' + (U.typeFilter === t.id ? ' active' : ''));
    card.innerHTML = `<span class="type-icon">${t.icon}</span><span class="type-name">${t.name}</span><span class="type-desc">${t.desc}</span>`;
    card.addEventListener('click', () => { U.typeFilter = t.id; showHome(); });
    types.appendChild(card);
  }
  wrap.appendChild(types);

  const grid = el('section', 'game-grid');
  const list = REGISTRY.filter(g => U.typeFilter === 'all' || g.type === U.typeFilter);
  for (const g of list) grid.appendChild(gameCard(g));
  wrap.appendChild(grid);

  wrap.appendChild(el('footer', 'home-foot', '书境奇游 · 本地运行 · 存档保存在浏览器 localStorage 中'));
  v.appendChild(wrap);
  window.scrollTo(0, 0);
}

function gameCard(g) {
  const store = TA.saves.saveStore(g.id);
  const saves = [store.auto, ...store.slots].filter(Boolean).sort((a, b) => b.ts - a.ts);
  const lastSave = saves[0];
  const hasSave = !!lastSave;
  const ends = TA.saves.endings(g.id);
  const endTotal = (g.endings || []).length;
  const card = el('div', 'game-card');
  card.style.setProperty('--accent', g.theme.accent);
  card.style.setProperty('--accent2', g.theme.accent2);
  card.innerHTML = `
    <div class="card-cover"><span class="cover-icon">${g.icon}</span>
      <div class="cover-title"><b>${g.title}</b><i>${g.source}</i></div>
    </div>
    <div class="card-body">
      <p class="card-desc">${g.desc}</p>
      <div class="card-tags">${g.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <div class="card-meta">
        <span>难度 ${g.difficulty}</span><span>约 ${g.length}</span>
        ${endTotal ? `<span>结局 ${Object.keys(ends).length}/${endTotal}</span>` : ''}
      </div>
      ${lastSave ? `<div class="card-last">📂 上次玩到：${TA.esc(lastSave.sceneTitle)} · ${TA.playtimeText(lastSave.playtime)}</div>` : ''}
      ${endTotal ? `<div class="card-endings">${(g.endings || []).map(e2 => {
        const got = ends[e2.title];
        return got ? `<span class="ed got ed-${e2.kind}">${e2.title}</span>` : `<span class="ed">？？?</span>`;
      }).join('')}</div>` : ''}
    </div>
    <div class="card-actions"></div>`;
  const acts = card.querySelector('.card-actions');
  if (hasSave) {
    acts.appendChild(btn('btn ghost', '📖 继续旅程', ev => { ev.stopPropagation(); loadLatest(g.id); }));
  }
  acts.appendChild(btn('btn solid', '✨ 新的冒险', ev => { ev.stopPropagation(); showCreate(g.id); }));
  return card;
}

async function loadLatest(gid) {
  try {
    const acts = await sync.reconcile(gid);
    if (acts.some(a => a.action === 'pulled')) toast('☁️ 云端进度较新，已同步到本地');
  } catch (e) { /* 离线/未登录静默 */ }
  const store = TA.saves.saveStore(gid);
  const latest = store.auto && (!store.slots.some(Boolean) || store.auto.ts >= Math.max(...store.slots.map(x => x ? x.ts : 0)))
    ? store.auto : store.slots.filter(Boolean).sort((a, b) => b.ts - a.ts)[0] || store.auto;
  if (!latest) return;
  resumeGame(latest.state);
}

