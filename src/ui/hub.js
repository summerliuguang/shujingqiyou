/* ============================================================
 * 个人中心：个人资料（名片）/ 成就殿堂 / 排行榜
 * 数据：结局收集与成就收集为本地全局库；榜单来自云 API（未登录/离线给出提示）
 * ============================================================ */
import { TA } from '../core/api.js';
import { REGISTRY, loadGame } from '../shell/game_loader.js';
import { el, btn, U } from './core.js';
import { modal } from './panels.js';
import { sync } from '../api/sync.js';
import { api } from '../api/client.js';
import { achvStore } from '../core/achv.js';

async function loadAllDefs() {
  await Promise.all(REGISTRY.map(g => loadGame(g.id).catch(() => null)));
}
function achvStats(def, gid) {
  const got = achvStore(gid);
  const list = Object.entries(def.achievements || {});
  const points = list.reduce((t, [id, a]) => t + (got[id] ? (a.points || 0) : 0), 0);
  const total = list.reduce((t, [, a]) => t + (a.points || 0), 0);
  return { got, list, points, total, count: list.filter(([id]) => got[id]).length };
}

/* ---------------- 个人资料（名片） ---------------- */
export function openProfile() {
  modal('👤 个人资料', body => {
    const box = el('div', null, '<p class="dim center">加载中……</p>');
    body.appendChild(box);
    (async () => {
      await loadAllDefs();
      const login = sync.username
        ? `<span class="dim">☁️ 已登录 <b>${TA.esc(sync.username)}</b> · 云同步开启</span>`
        : `<span class="dim">未登录（本地模式）</span>`;
      let endGot = 0, endAll = 0, pts = 0, ptsAll = 0;
      const rows = REGISTRY.map(g => {
        const def = TA.game(g.id) || {};
        const ends = Object.keys(TA.saves.endings(g.id)).length;
        const total = (g.endings || []).length;
        const a = achvStats(def, g.id);
        endGot += ends; endAll += total; pts += a.points; ptsAll += a.total;
        const store = TA.saves.saveStore(g.id);
        const hasSave = !!(store.auto || store.slots.some(Boolean));
        return `<div class="prof-row"><span>${g.icon} <b>${TA.esc(g.title)}</b></span>
          <span class="dim">🔖 ${ends}/${total}　🏆 ${a.points} 点　${hasSave ? '📂 有存档' : '—'}</span></div>`;
      }).join('');
      box.innerHTML = `
        <p class="dim" style="margin-top:0">${login}　·　游玩设备：${TA.esc(U.S ? U.S.name : '旅人')}</p>
        <div class="stat-grid">
          <span class="stat-box"><i>🔖 结局收集</i><b>${endGot}/${endAll}</b></span>
          <span class="stat-box"><i>🏆 成就点数</i><b>${pts}/${ptsAll}</b></span>
          <span class="stat-box"><i>📚 收录作品</i><b>${REGISTRY.length}</b></span>
        </div>
        ${rows}`;
    })().catch(e => { box.innerHTML = `<p class="loss">加载失败：${TA.esc(e.message)}</p>`; });
  }, 'wide');
}

/* ---------------- 成就殿堂 ---------------- */
export function openAchievements() {
  modal('🏆 成就殿堂', body => {
    const box = el('div', null, '<p class="dim center">加载中……</p>');
    body.appendChild(box);
    (async () => {
      await loadAllDefs();
      const html = REGISTRY.map(g => {
        const def = TA.game(g.id) || {};
        const list = Object.entries(def.achievements || {});
        if (!list.length) return '';
        const got = achvStore(g.id);
        const rows = list.map(([id, a]) => {
          const un = !!got[id];
          if (!un && a.hidden) return `<div class="achv-row locked"><b>🔒 ？？？</b><span class="dim">隐藏成就</span></div>`;
          return `<div class="achv-row${un ? '' : ' locked'}"><b>${un ? (a.icon || '🏅') : '🔒'} ${TA.esc(a.name || id)}</b>` +
            `<span>${TA.esc(a.desc || '')}${a.points ? `（${a.points} 点）` : ''}</span></div>`;
        }).join('');
        const pts = list.reduce((t, [id, a]) => t + (got[id] ? (a.points || 0) : 0), 0);
        const total = list.reduce((t, [, a]) => t + (a.points || 0), 0);
        return `<h4 style="margin-bottom:.3rem">${g.icon} ${TA.esc(g.title)} <span class="dim">（${pts}/${total} 点）</span></h4>${rows}`;
      }).join('');
      box.innerHTML = html || '<p class="dim center">各游戏尚未定义成就。</p>';
    })().catch(e => { box.innerHTML = `<p class="loss">加载失败：${TA.esc(e.message)}</p>`; });
  }, 'wide');
}

/* ---------------- 排行榜 ---------------- */
const BOARDS = [
  ['clear_time', '⚡ 最快通关'],
  ['realm', '🏔️ 最高境界', 'novel'],
  ['achv', '🏆 成就点数'],
  ['endings', '🔖 结局收集'],
];
function fmtScore(board, score, def) {
  if (board === 'clear_time') return TA.playtimeText(score);
  if (board === 'realm') return (def.realms || [])[score]?.name || `第 ${score} 境`;
  if (board === 'achv') return `${score} 点`;
  return `${score} 个`;
}
export function openLeaderboard() {
  modal('📊 排行榜', body => {
    const controls = el('div', 'hub-controls');
    const gameSel = el('select');
    gameSel.innerHTML = REGISTRY.map(g => `<option value="${g.id}">${TA.esc(g.title)}</option>`).join('');
    const boardSel = el('select');
    const box = el('div');
    body.appendChild(controls);
    controls.appendChild(gameSel);
    controls.appendChild(boardSel);
    body.appendChild(box);

    function fillBoards() {
      const def = TA.game(gameSel.value) || {};
      const boards = BOARDS.filter(b => !b[2] || def.type === b[2]);
      boardSel.innerHTML = boards.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
      load();
    }
    async function load() {
      const gid = gameSel.value, board = boardSel.value;
      if (!gid || !board) return;
      box.innerHTML = '<p class="dim center">加载中……</p>';
      if (!sync.username) {
        box.innerHTML = '<p class="dim">排行榜需要登录（设置 → ☁️ 云同步）。本地游玩不受影响。</p>';
        return;
      }
      const data = await api.getLeaderboard(gid, board);
      if (!data) { box.innerHTML = '<p class="dim center">无法连接云服务，稍后再试。</p>'; return; }
      const def = TA.game(gid) || {};
      const medals = ['🥇', '🥈', '🥉'];
      box.innerHTML = data.rows.length
        ? data.rows.map((r, i) =>
          `<div class="lb-row"><span class="lb-rank">${medals[i] || i + 1}</span>` +
          `<span class="lb-name">${TA.esc(r.username)}</span>` +
          `<span class="lb-score"><b>${fmtScore(board, r.score, def)}</b></span></div>`).join('')
        : '<p class="dim center">这个榜单还没有人上榜——达成一个结局就会记录。</p>';
    }
    gameSel.addEventListener('change', fillBoards);
    boardSel.addEventListener('change', load);
    fillBoards();
  });
}
