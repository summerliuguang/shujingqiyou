/* ============================================================
 * 结局浮层
 * ============================================================ */
import { TA } from '../engine/api.js';
import { TAAudio } from '../audio/bgm.js';
import { TAVoice } from '../audio/voice.js';
import { $, el, btn, U } from './core.js';
import { showHome } from './home.js';
import { resumeGame } from './view.js';

/* ---------------- 结局 ---------------- */
export function endingOverlay(end) {
  TAAudio.sfx(end.kind === 'bad' || end.kind === 'mad' ? 'death' : 'levelup');
  TAVoice.stop();
  const root = $('#modal-root');
  const overlay = el('div', 'ending-overlay kind-' + (end.kind || 'normal'));
  overlay.innerHTML = `
    <div class="ending-panel">
      <div class="ending-kind">${({ good: '🌹 结局达成', bad: '💀 折戟沉沙', true: '👑 真结局', mad: '🌀 堕入疯狂', normal: '🔖 结局' })[end.kind] || '🔖 结局'}</div>
      <h2>${TA.esc(end.title)}</h2>
      <p>${end.text}</p>
      <div class="ending-acts"></div>
    </div>`;
  const acts = overlay.querySelector('.ending-acts');
  acts.appendChild(btn('btn solid', '📖 继续旅程（回到书阁）', () => { overlay.remove(); showHome(); }));
  acts.appendChild(btn('btn ghost', '⏪ 回溯至结局前（读取自动档）', () => {
    const data = TA.saves.readSlot(U.S.gameId, 'auto');
    overlay.remove();
    if (data) resumeGame(data.state); else showHome();
  }));
  root.appendChild(overlay);
}

