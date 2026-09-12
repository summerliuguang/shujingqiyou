/* ============================================================
 * 游戏视图：进入/续玩 / 叙事日志 / 顶栏 / 选项
 * ============================================================ */
import { TA } from '../engine/api.js';
import { TAAudio } from '../audio/bgm.js';
import { TAVoice } from '../audio/voice.js';
import { $, view, el, btn, U } from './core.js';
import { openChar, openInv, openSave, openQuests, openClues, modal } from './panels.js';
import { resetPlaytimeTick } from '../engine/router.js';
import { loadGame } from '../shell/game_loader.js';
import { sync } from '../api/sync.js';

/* ---------------- 进入游戏 ---------------- */
export async function startGame(gid, name, opts) {
  try { await loadGame(gid); }
  catch (e) { TA.hooks.toast('加载失败：' + e.message); return; }
  const s = TA.newGame(gid, name, opts);
  U.S = s;
  TA.setGid(gid);
  resetPlaytimeTick();
  TAAudio.playBgm(TA.game(gid).bgm);
  TAVoice.stop();
  mountGameView();
  TA.enterScene(s, TA.game(gid).start);
}
export async function resumeGame(state) {
  U.S = TA.normalizeState(state);
  TA.setGid(state.gameId);
  resetPlaytimeTick();
  let def;
  try { def = await loadGame(state.gameId); }
  catch (e) { TA.hooks.toast('读取失败：' + e.message); return; }
  TAAudio.playBgm(def.bgm);
  /* 闭关结算（idle 能力包）：读档时若在闭关中，弹出关结算 */
  const settled = TA.settleSeclusion(U.S);
  if (settled) {
    TA.saves.autosave(U.S);
    modal('🧘 出关', body => {
      body.appendChild(el('div', 'scene-text', TA.esc(settled.msg)));
    });
  }
  // 兼容旧存档：场景被内容更新删除时回到起点
  if (!def.scenes[state.scene]) {
    TA.hooks.toast('存档场景已失效，回到故事起点');
    state.scene = def.start;
    mountGameView();
    TA.enterScene(state, def.start);
    return;
  }
  mountGameView();
  const scene = def.scenes[state.scene] || {};
  TA.hooks.appendLog([
    { cls: 'divider' },
    { cls: 'scene-title', text: '📂 已读取存档 · ' + (scene.title || state.scene) },
    { cls: 'scene-text', html: TA.fmt(TA.sceneText(scene, state), state).replace(/\n/g, '<br>') },
  ]);
  refresh();
  TA.hooks.toast('欢迎回来，' + state.name);
}
function mountGameView() {
  const g = TA.game(U.S.gameId);
  document.body.style.setProperty('--accent', g.theme.accent);
  document.body.style.setProperty('--accent2', g.theme.accent2);
  $('#tb-game').textContent = g.title;
  $('#topbar').classList.remove('hidden');
  const v = view();
  v.innerHTML = '';
  const wrap = el('div', 'game-view');
  const story = el('div', 'story');
  story.id = 'story';
  const choices = el('div', 'choices');
  choices.id = 'choices';
  wrap.appendChild(story);
  wrap.appendChild(choices);
  v.appendChild(wrap);
}

/* ---------------- 日志与刷新 ---------------- */
function stripHtml(h) { const d = el('div', null, h); return d.textContent || ''; }

function typeWriter(node, html) {
  const text = stripHtml(html);
  node.textContent = '';
  node.style.whiteSpace = 'pre-line';
  let i = 0, done = false;
  function finish() { node.textContent = text; done = true; }
  node.addEventListener('click', finish);
  const timer = setInterval(() => {
    if (done) { clearInterval(timer); return; }
    i += 2;
    if (i >= text.length) { finish(); clearInterval(timer); return; }
    node.textContent = text.slice(0, i);
    const st = $('#story');
    if (st) st.scrollTop = st.scrollHeight;
  }, 28);
}

function diceChip(entryText) {
  TAAudio.sfx('dice');
  if (/理智检定/.test(entryText) && /失败/.test(entryText)) TAAudio.sfx('ghost');
  const chip = el('div', 'dice-chip', '🎲');
  const m = entryText.match(/掷出 <b>(\d+)<\/b>/) || entryText.match(/掷出 (\d+)/);
  if (m) chip.innerHTML = '<span class="dice-num">' + m[1] + '</span>';
  chip.addEventListener('click', () => chip.remove());
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), 2600);
}

export function appendLog(entries) {
  const story = $('#story');
  if (!story) return;
  let playedGain = false, playedLoss = false, spoke = false;
  for (const en of entries) {
    let node;
    switch (en.cls) {
      case 'divider': node = el('div', 'divider'); break;
      case 'scene-title':
        node = el('div', 'scene-title', TA.esc(en.text));
        TAAudio.sfx('page');
        break;
      case 'choice-echo': node = el('div', 'choice-echo', TA.esc(en.text)); break;
      case 'scene-text': {
        node = el('div', 'scene-text');
        if (U.prefs.typewriter) typeWriter(node, en.html);
        else node.innerHTML = en.html;
        const raw = stripHtml(en.html);
        if (TAVoice.mode === 'auto' && !spoke && raw.length > 12) { spoke = true; TAVoice.speak(raw); }
        if (TAVoice.mode === 'manual' && raw.length > 12) {
          const vb = btn('voice-btn', '📢 朗读此段', () => TAVoice.speak(raw));
          node.appendChild(vb);
        }
        break;
      }
      default: {
        const content = en.html != null ? en.html : (typeof en.text === 'string' && en.text.includes('<') ? en.text : TA.esc(en.text));
        node = el('div', 'entry ' + en.cls, content);
        const t = typeof en.text === 'string' ? en.text : '';
        if (en.cls === 'roll') diceChip(t + ' ' + stripHtml(content));
        else if (en.cls === 'gain' && !playedGain) { playedGain = true; TAAudio.sfx('gain'); }
        else if (en.cls === 'loss' && !playedLoss) { playedLoss = true; TAAudio.sfx('loss'); }
        else if (en.cls === 'skill' && t.startsWith('🌟')) TAAudio.sfx('levelup');
      }
    }
    story.appendChild(node);
  }
  while (story.children.length > 400) story.removeChild(story.firstChild);
  const nearBottom = story.scrollHeight - story.scrollTop - story.clientHeight < 160;
  if (nearBottom) requestAnimationFrame(() => { story.scrollTop = story.scrollHeight; });
}

export function refresh() {
  if (!U.S) return;
  document.body.classList.toggle('low-hp', U.S.hpMax > 0 && U.S.hp / U.S.hpMax <= 0.3);
  const def = TA.game(U.S.gameId);
  const map = def.maps[U.S.map];
  $('#tb-map').textContent = map ? '📍 ' + map.name : '';
  renderQuickStats();
  renderChoices();
}

function renderQuickStats() {
  const def = TA.game(U.S.gameId);
  const parts = [];
  parts.push(`<span class="qs" title="生命">❤️ ${U.S.hp}/${U.S.hpMax}</span>`);
  if (def.type !== 'coc' && U.S.mpMax > 0) {
    parts.push(`<span class="qs" title="${(def.statLabels || {}).mp || '法力'}">🔮 ${U.S.mp}/${U.S.mpMax}</span>`);
  }
  if (def.moneyName) parts.push(`<span class="qs" title="${def.moneyName}">💰 ${U.S.money}</span>`);
  /* 能力包注入的资源条（境界/理智/……） */
  for (const chip of TA.packChips(U.S, def)) parts.push(chip);
  parts.push(`<button class="icon-btn" id="btn-bgm" title="背景音乐开关">${TAAudio.isBgmOn() ? '🔊' : '🔇'}</button>`);
  parts.push(`<button class="icon-btn" id="btn-voice" title="语音朗读模式">${TAVoice.mode === 'off' ? '💬' : '📢'}</button>`);
  if (Object.keys(def.quests || {}).length || (U.S.quests || []).length) parts.push(`<button class="icon-btn" data-panel="quests" title="任务">📋</button>`);
  if (Object.keys(def.clues || {}).length) parts.push(`<button class="icon-btn" data-panel="clues" title="线索手册">🧩</button>`);
  parts.push(`<button class="icon-btn" data-panel="char" title="角色">👤</button>`);
  parts.push(`<button class="icon-btn" data-panel="inv" title="背包">🎒</button>`);
  parts.push(`<button class="icon-btn" data-panel="save" title="存档">💾</button>`);
  const qs = $('#quick-stats');
  qs.innerHTML = parts.join('');
  qs.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.panel;
    if (p === 'char') openChar(); else if (p === 'inv') openInv(); else if (p === 'quests') openQuests(); else if (p === 'clues') openClues(); else openSave();
  }));
  const bgmBtn = qs.querySelector('#btn-bgm');
  if (bgmBtn) bgmBtn.addEventListener('click', () => {
    TAAudio.setBgmEnabled(!TAAudio.isBgmOn());
    renderQuickStats();
    TA.hooks.toast(TAAudio.isBgmOn() ? '🎵 背景音乐已开启' : '🔇 背景音乐已关闭');
  });
  const voiceBtn = qs.querySelector('#btn-voice');
  if (voiceBtn) voiceBtn.addEventListener('click', () => {
    const order = ['off', 'manual', 'auto'];
    const next = order[(order.indexOf(TAVoice.mode) + 1) % 3];
    TAVoice.setMode(next);
    renderQuickStats();
    TA.hooks.toast(next === 'off' ? '💬 语音朗读：关闭' : next === 'manual' ? '📢 手动朗读：每段旁白带朗读按钮' : '📢 自动朗读旁白');
  });
}

function renderChoices() {
  const box = $('#choices');
  if (!box) return;
  box.innerHTML = '';
  /* AI KP 自由行动输入框（模组/场景开启 kp 时） */
  if (TA.kpEnabled && TA.kpEnabled(U.S) && !U.busy) {
    const kpWrap = el('div', 'kp-input');
    const inp = el('input');
    inp.type = 'text';
    inp.maxLength = 200;
    inp.placeholder = '✍️ 想做什么都可以告诉 KP……（回车送出）';
    const send = () => {
      const v = inp.value.trim();
      if (!v || U.busy) return;
      kpWrap.querySelector('button').disabled = true;
      paceRun('choice', ['KP 正在回应……', 400], () => TA.kpFreeInput(U.S, v));
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    const sendBtn = btn('btn solid sm', '送出', send);
    kpWrap.appendChild(inp);
    kpWrap.appendChild(sendBtn);
    box.appendChild(kpWrap);
  }
  const list = TA.visibleChoices(U.S);
  for (const item of list) {
    if (item.kind === 'maphead') {
      box.appendChild(el('div', 'maphead', `🗺️ 出行 · ${TA.esc(item.name || '')}`));
      continue;
    }
    if (item.kind === 'choice') {
      const c = item.c;
      const b = btn('choice-btn' + (item.enabled ? '' : ' disabled') + (c.hot ? ' hot' : ''),
        `<span class="c-t">${TA.fmt(c.t, U.S)}</span>${c.sub ? `<span class="c-sub">${TA.esc(c.sub)}</span>` : ''}${!item.enabled && item.reason ? `<span class="c-reason">🔒 ${TA.esc(item.reason)}</span>` : ''}`);
      if (item.enabled) {
        b.addEventListener('click', () => { TAAudio.sfx('click'); paceRun('choice', null, () => TA.choose(U.S, c, item.idx)); });
      } else {
        b.title = item.reason || '条件未满足';
      }
      box.appendChild(b);
    } else if (item.kind === 'travel') {
      const l = item.loc;
      const b = btn('choice-btn travel', `<span class="c-t">${l.icon || '🚶'} 前往 · ${TA.esc(l.t)}</span>`);
      b.addEventListener('click', () => paceRun('travel', null, async () => {
        TA.hooks.appendLog([{ cls: 'choice-echo', text: '▶ 前往 ' + l.t }]);
        await TA.enterScene(U.S, l.scene, { via: 'user' });
      }));
      box.appendChild(b);
    } else if (item.kind === 'free') {
      const b = btn('choice-btn free' + (item.hot ? ' hot' : ''), `<span class="c-t">${item.t}</span>${item.sub ? `<span class="c-sub">${TA.esc(item.sub)}</span>` : ''}`);
      b.addEventListener('click', () => paceRun(item.act, item.pace, () => TA.freeAction(U.S, item.act)));
      box.appendChild(b);
    }
  }
  if (!list.length) box.appendChild(el('div', 'dim center', '（此处暂无可做的事）'));
}

/* ---- 节奏层：动作先出"过程"横幅再结算，杜绝零等待的出结果 ----
 * 引擎通用行动用 PACE 缺省；能力包行动自带 pace（[文案, 毫秒]）。 */
const PACE = {
  travel: ['正在赶路……', 900],
  explore: ['放慢脚步，仔细探查四周……', 900],
  rest: ['寻了处背风地歇脚……', 700],
  choice: ['……', 350],
  back: ['……', 250],
};
function paceRun(kind, pace, fn) {
  if (U.busy) return;
  const [label, ms] = pace || PACE[kind] || PACE.choice;
  const box = document.querySelector('#choices');
  if (box) {
    box.innerHTML = '';
    box.appendChild(el('div', 'pending', `<span class="p-ico">⏳</span><span class="p-txt">${TA.esc(label)}</span>`));
  }
  guard((async () => {
    await new Promise(r => setTimeout(r, ms));
    await fn();
  })());
}

function guard(promise) {
  if (U.busy) return;
  U.busy = true;
  $('#choices').classList.add('locked');
  Promise.resolve(promise).catch(err => { console.error(err); TA.hooks.toast('发生错误：' + err.message); })
    .finally(() => {
      U.busy = false;
      const c = $('#choices');
      if (c) {
        c.classList.remove('locked');
        if (c.querySelector('.pending')) renderChoices();  // 无刷新路径下清掉 pending 横幅
      }
    });
}

