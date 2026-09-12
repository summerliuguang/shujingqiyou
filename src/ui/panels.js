/* ============================================================
 * 面板：弹窗框架 / 菜单 / 氛围设置 / 角色 / 背包 / 存档 / 任务 / 线索
 * ============================================================ */
import { TA } from '../core/api.js';
import { TAAudio } from '../audio/bgm.js';
import { TAVoice } from '../audio/voice.js';
import { $, el, btn, U, savePrefs } from './core.js';
import { showHome } from './home.js';
import { resumeGame } from './view.js';
import { sync } from '../api/sync.js';

/* ---------------- 通用弹窗 / 面板 ---------------- */
export function modal(title, buildBody, cls) {
  const root = $('#modal-root');
  const overlay = el('div', 'modal-overlay');
  const panel = el('div', 'modal-panel ' + (cls || ''));
  panel.appendChild(el('div', 'modal-head', `<b>${title}</b>`));
  const close = btn('icon-btn', '✕', () => overlay.remove());
  panel.querySelector('.modal-head').appendChild(close);
  const body = el('div', 'modal-body');
  buildBody(body, overlay);
  panel.appendChild(body);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  root.appendChild(overlay);
  return overlay;
}

/* ---- 菜单 ---- */
export function openMenu() {
  modal('☰ 菜单', (body, overlay) => {
    const grid = el('div', 'menu-grid');
    const items = [
      ['👤 角色面板', () => { overlay.remove(); openChar(); }], ['🎒 背包物品', () => { overlay.remove(); openInv(); }],
      ['📋 任务', () => { overlay.remove(); openQuests(); }],
      ['💾 保存游戏', () => { overlay.remove(); openSave(false); }],
      ['📂 读取存档', () => { overlay.remove(); openSave(true); }],
      ['⚙️ 氛围设置', () => { overlay.remove(); openSettings(); }],
      ...(TA.game(U.S.gameId).clues ? [['🧩 线索手册', () => { overlay.remove(); openClues(); }]] : []),
      ['🏠 回到书阁', () => {
        if (confirm('回到主页？（进度已自动保存）')) { TA.saves.autosave(U.S); overlay.remove(); showHome(); }
      }],
    ];
    for (const [t, fn] of items) grid.appendChild(btn('menu-btn', t, fn));
    body.appendChild(grid);
    body.appendChild(el('p', 'dim center', `${TA.game(U.S.gameId).title} · ${U.S.name} · 已游玩 ${TA.playtimeText(U.S.playtime)}`));
  });
}

function snapshotOf(s) {
  const def = TA.game(s.gameId);
  return { v: 1, gameId: s.gameId, name: s.name, ts: Date.now(), playtime: s.playtime || 0, scene: s.scene, sceneTitle: (def.scenes[s.scene] || {}).title || s.scene, state: s };
}

/* ---- 氛围设置 ---- */
export function openSettings() {
  modal('⚙️ 氛围设置', (body) => {
    const mk = (label, inner) => {
      const row = el('div', 'set-row');
      row.appendChild(el('label', null, label));
      row.appendChild(inner);
      body.appendChild(row);
      return inner;
    };
    const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 100;
    vol.value = Math.round(TAAudio.settings.volume * 100);
    mk('🎧 音量', vol);
    vol.addEventListener('input', () => TAAudio.setVolume(vol.value / 100));
    const bgmSel = el('select'); bgmSel.innerHTML = '<option value="1">开</option><option value="0">关</option>';
    bgmSel.value = TAAudio.isBgmOn() ? '1' : '0';
    mk('🎵 背景音乐', bgmSel);
    bgmSel.addEventListener('change', () => { TAAudio.setBgmEnabled(bgmSel.value === '1'); renderQuickStats(); });
    const sfxSel = el('select'); sfxSel.innerHTML = '<option value="1">开</option><option value="0">关</option>';
    sfxSel.value = TAAudio.settings.sfx ? '1' : '0';
    mk('🔪 音效（打击/骰子/环境）', sfxSel);
    sfxSel.addEventListener('change', () => { TAAudio.settings.sfx = sfxSel.value === '1'; TAAudio.save(); });
    const twSel = el('select'); twSel.innerHTML = '<option value="0">关</option><option value="1">开</option>';
    twSel.value = U.prefs.typewriter ? '1' : '0';
    mk('⌨️ 打字机效果', twSel);
    twSel.addEventListener('change', () => { U.prefs.typewriter = twSel.value === '1'; savePrefs(); });
    const syncRow = el('div', 'set-row');
    syncRow.appendChild(el('label', null, '☁️ 云同步'));
    if (sync.username) {
      syncRow.appendChild(el('span', 'dim', `已登录 ${sync.username} · 存档自动同步`));
    } else {
      const a = el('a', null, '未登录（不影响游玩）— 登录后多设备同步');
      // SSO 登录页固定在 29010 端口；hostname 取当前访问地址，仓库无需硬编码局域网 IP
      a.href = 'https://' + location.hostname + ':29010/login?back=' + encodeURIComponent(location.origin);
      a.target = '_blank';
      a.rel = 'noopener';
      syncRow.appendChild(a);
    }
    body.appendChild(syncRow);
    const vmSel = el('select');
    vmSel.innerHTML = '<option value="off">关闭</option><option value="manual">手动（段落 📢 按钮）</option><option value="auto">自动朗读旁白</option>';
    vmSel.value = TAVoice.mode;
    mk('🗣️ 语音朗读（mimo）', vmSel);
    vmSel.addEventListener('change', () => { TAVoice.setMode(vmSel.value); renderQuickStats(); });
    const vsSel = el('select');
    vsSel.innerHTML = `<option value="${TA.esc(TAVoice.voice)}">${TA.esc(TAVoice.voice)}</option>`;
    mk('🗣️ 音色', vsSel);
    TAVoice.voices().then(list => {
      if (!list.length) return;
      vsSel.innerHTML = list.map(v2 => `<option value="${TA.esc(v2.id)}">${TA.esc(v2.name)}</option>`).join('');
      vsSel.value = TAVoice.voice;
    });
    vsSel.addEventListener('change', () => { TAVoice.setVoice(vsSel.value); TAVoice.speak('你好，我是你的冒险旁白。'); });
    body.appendChild(el('p', 'dim', '语音由本机 mimo-voice-hub（MiMo TTS）合成，不可达时自动回退浏览器朗读。BGM：Kevin MacLeod / incompetech.com（CC BY 4.0）。'));
  });
}

/* ---- 角色面板 ---- */
export function openChar() {
  const def = TA.game(U.S.gameId);
  modal(`👤 ${U.S.name}`, body => {
    if (def.type === 'coc') {
      const rows = TA.COC_ATTRS.map(k => {
        const v = U.S.cocAttrs[k];
        return `<tr><td>${k}</td><td><b>${v}</b></td><td class="dim">${Math.floor(v / 2)}/${Math.floor(v / 5)}</td></tr>`;
      }).join('');
      const sk = Object.keys(U.S.cocSkills).filter(k => U.S.cocSkills[k] > 0)
        .sort((a, b) => U.S.cocSkills[b] - U.S.cocSkills[a])
        .map(k => `<span class="sk-chip">${k} <b>${U.S.cocSkills[k]}%</b></span>`).join('');
      body.innerHTML = `
        <div class="stat-row"><span>❤️ 生命 ${U.S.hp}/${U.S.hpMax}</span><span>🧠 理智 ${U.S.san}/${U.S.sanMax}</span><span>💪 伤害加值 ${U.S.cocDB}</span></div>
        <table class="mini-table"><tr><th>属性</th><th>值</th><th>困难/极难</th></tr>${rows}</table>
        <h4>技能</h4><div class="sk-cloud">${sk}</div>
        ${U.S.flags.insaneTemp ? '<p class="loss">⚠️ 处于临时疯狂状态</p>' : ''}
        ${U.S.quests.length ? `<h4>调查记录</h4>${U.S.quests.map(q => `<div class="sk-row"><b>▪ ${TA.esc(q)}</b></div>`).join('')}` : ''}`;
    } else {
      const expNeed = TA.realmNeed(U.S);
      const expBar = isFinite(expNeed)
        ? `<div class="exp-bar"><i style="width:${Math.min(100, U.S.exp / expNeed * 100)}%"></i><span>修为 ${U.S.exp}/${expNeed}</span></div>`
        : `<div class="dim">已臻大圆满</div>`;
      const stats = [
        ['❤️ 生命', `${U.S.hp}/${U.S.hpMax}`], ['🔮 ' + ((def.statLabels || {}).mp || '法力'), `${U.S.mp}/${U.S.mpMax}`],
        ['⚔️ 攻击', U.S.atk + (U.S.equip.weapon && def.items[U.S.equip.weapon]?.equip ? ` (+${def.items[U.S.equip.weapon].equip.atk})` : '')],
        ['🛡️ 防御', U.S.def + (U.S.equip.armor && def.items[U.S.equip.armor]?.equip ? ` (+${def.items[U.S.equip.armor].equip.def})` : '')],
        ['👟 敏捷', U.S.agi], ['💰 ' + (def.moneyName || '金钱'), U.S.money],
      ].map(([k, v]) => `<span class="stat-box"><i>${k}</i><b>${v}</b></span>`).join('');
      const extras = Object.entries(U.S.attrs).map(([k, v]) => `<span class="stat-box"><i>${k}</i><b>${v}</b></span>`).join('');
      const sks = U.S.skills.map(id => {
        const sk = def.skills[id] || {};
        return `<div class="sk-row"><b>${sk.icon || '✦'} ${sk.name || id}</b><span>${sk.desc || ''}${sk.mp ? `（消耗 ${sk.mp}）` : ''}</span></div>`;
      }).join('') || '<p class="dim">尚未习得任何技能</p>';
      body.innerHTML = `
        <p class="realm-line">境界：<b>${(def.realms[U.S.realmIdx] || {}).name || '—'}</b> · 击败敌人 ${U.S.kills} · 已游玩 ${TA.playtimeText(U.S.playtime)}</p>
        ${expBar}
        <div class="stat-grid">${stats}${extras}</div>
        <h4>技能 / 法术</h4>${sks}
        ${U.S.quests.length ? `<h4>历练 / 支线</h4>${U.S.quests.map(q => `<div class="sk-row"><b>▪ ${TA.esc(q)}</b></div>`).join('')}` : ''}`;
    }
  }, 'wide');
}

/* ---- 背包 ---- */
export function openInv() {
  const def = TA.game(U.S.gameId);
  modal(`🎒 背包`, body => {
    const ids = Object.keys(U.S.items);
    if (!ids.length) { body.appendChild(el('p', 'dim center', '背包空空如也。')); return; }
    const grid = el('div', 'inv-grid');
    const detail = el('div', 'inv-detail');
    function show(id) {
      const it = def.items[id] || { name: id };
      const count = U.S.items[id];
      detail.innerHTML = `
        <div class="inv-big">${it.icon || '📦'} <b>${TA.esc(it.name)}</b> ×${count}</div>
        <p class="dim">${it.desc || ''}</p>
        ${it.kind === 'weapon' ? `<p>武器 · 攻击 +${(it.equip || {}).atk || 0} ${U.S.equip.weapon === id ? '（已装备）' : ''}</p>` : ''}
        ${it.kind === 'armor' ? `<p>护甲 · 防御 +${(it.equip || {}).def || 0} ${U.S.equip.armor === id ? '（已装备）' : ''}</p>` : ''}`;
      const acts = el('div', 'inv-acts');
      if (it.kind === 'consumable' || it.fx || it.kind === 'weapon' || it.kind === 'armor') {
        acts.appendChild(btn('btn solid sm', it.kind === 'weapon' || it.kind === 'armor' ? (U.S.equip[it.kind] === id ? '卸下' : '装备') : '使用', () => {
          closeAllModals();
          guard(TA.useItem(U.S, id));
        }));
      }
      acts.appendChild(btn('btn ghost sm', '丢弃', () => {
        TA.dropItem(U.S, id);
        overlay.remove();
        openInv();
      }));
      detail.appendChild(acts);
    }
    ids.sort().forEach(id => {
      const it = def.items[id] || {};
      const cell = el('div', 'inv-cell' + ((U.S.equip.weapon === id || U.S.equip.armor === id) ? ' equipped' : ''));
      cell.innerHTML = `<span class="inv-icon">${it.icon || '📦'}</span><span class="inv-name">${TA.esc(it.name || id)}</span><span class="inv-count">×${U.S.items[id]}</span>`;
      cell.addEventListener('click', () => {
        grid.querySelectorAll('.inv-cell').forEach(x => x.classList.remove('sel'));
        cell.classList.add('sel');
        show(id);
      });
      grid.appendChild(cell);
    });
    body.appendChild(grid);
    body.appendChild(detail);
    const overlay = body.closest('.modal-overlay');
    if (ids.length) show(ids[0]);
  }, 'wide');
}

export function closeAllModals() { $('#modal-root').innerHTML = ''; }

/* ---- 存档 ---- */
export function openSave(loadOnly) {
  const def = TA.game(U.S ? U.S.gameId : null);
  if (!U.S) return;
  const store = TA.saves.saveStore(U.S.gameId);
  modal(loadOnly ? '📂 读取存档' : '💾 存档管理', (body, overlay) => {
    const slotRow = (label, data, key) => {
      const row = el('div', 'save-row');
      const info = data
        ? `<b>${TA.esc(data.name)}</b> · ${TA.esc(data.sceneTitle)}<br><span class="dim">${TA.playtimeText(data.playtime)} · ${new Date(data.ts).toLocaleString('zh-CN')}</span>`
        : '<span class="dim">—— 空栏 ——</span>';
      row.innerHTML = `<div class="save-info"><i>${label}</i>${info}</div>`;
      const acts = el('div', 'save-acts');
      if (!loadOnly) {
        if (key !== 'auto') acts.appendChild(btn('btn solid sm', '保存', () => {
          TA.saves.saveToSlot(U.S, key);
          TA.hooks.toast('已保存到 ' + label);
          overlay.remove(); openSave(false);
        }));
      }
      if (data) {
        acts.appendChild(btn('btn solid sm', '读取', async () => {
          try {
            const pulled = await sync.reconcile(S.gameId);
            if (pulled.some(a => a.action === 'pulled')) toast('☁️ 云端进度较新，已同步到本地');
          } catch (e) { /* 离线/未登录静默 */ }
          overlay.remove();
          const fresh = TA.saves.readSlot(S.gameId, key);
          resumeGame(JSON.parse(JSON.stringify((fresh || data).state)));
        }));
        acts.appendChild(btn('btn ghost sm', '删除', () => {
          if (!confirm('删除该存档？')) return;
          TA.saves.delSlot(U.S.gameId, key);
          overlay.remove(); openSave(!!loadOnly);
        }));
      }
      row.appendChild(acts);
      return row;
    };
    body.appendChild(slotRow('🌀 自动存档', store.auto, 'auto'));
    store.slots.forEach((d, i) => body.appendChild(slotRow('💾 手动 ' + (i + 1), d, i)));

    // 导出 / 导入（跨设备迁移备份）
    body.appendChild(el('h4', null, '导出 / 导入'));
    const ta = el('textarea', 'save-io');
    ta.placeholder = '点"导出"生成存档代码，粘贴到另一台设备后点"导入"';
    body.appendChild(ta);
    const ioActs = el('div', 'inv-acts');
    ioActs.appendChild(btn('btn ghost sm', '📤 导出当前进度', () => {
      const data = TA.saves.readSlot(U.S.gameId, 'auto') || TA.saves.saveStore(U.S.gameId);
      ta.value = JSON.stringify(data.auto || snapshotOf(U.S));
      ta.select();
      try { document.execCommand('copy'); TA.hooks.toast('已生成并复制存档代码'); } catch (e) { TA.hooks.toast('已生成存档代码，请手动复制'); }
    }));
    ioActs.appendChild(btn('btn solid sm', '📥 导入存档', () => {
      try {
        const obj = JSON.parse(ta.value.trim());
        if (!obj || obj.gameId !== U.S.gameId || !obj.state) throw new Error('不是本游戏的存档代码');
        TA.saves.importSnapshot(U.S.gameId, obj);
        TA.hooks.toast('已导入到 手动3 存档位');
        overlay.remove(); openSave(!!loadOnly);
      } catch (e) { TA.hooks.toast('导入失败：' + e.message); }
    }));
    body.appendChild(ioActs);
  });
}


/* ---------------- 任务面板 ---------------- */
export function openQuests() {
  const def = TA.game(U.S.gameId);
  const reg = def.quests || {};
  const st = U.S.questState || {};
  modal('📋 任务', body => {
    const sec = (title, rows) => {
      if (!rows.length) return;
      body.appendChild(el('h4', null, title));
      rows.forEach(([id, q]) => {
        const qd = reg[id] || {};
        const box = el('div', 'sk-row');
        const objHtml = (qd.objectives || []).map((o, i) => {
          const done = q.obj && q.obj[i];
          let prog = '';
          if (!done && o.kind === 'item') {
            const have = Math.min(U.S.items[o.target] || 0, o.count || 1);
            prog = `（${have}/${o.count || 1}）`;
          }
          return `<span class="${done ? 'dim' : ''}">${done ? '☑' : '☐'} ${TA.esc(o.desc || o.target)}${prog}</span>`;
        }).join('　');
        box.innerHTML = `<b>${qd.type === 'main' ? '📜' : '▪'} ${TA.esc(qd.title || id)}</b>${qd.desc ? `<span>${TA.esc(qd.desc)}</span>` : ''}${objHtml ? `<div>${objHtml}</div>` : ''}`;
        body.appendChild(box);
      });
    };
    const stEntries = Object.entries(st);
    sec('进行中', stEntries.filter(([, q]) => q.state === 'active'));
    sec('已完成', stEntries.filter(([, q]) => q.state === 'done'));
    const legacy = U.S.quests || [];
    if (legacy.length) {
      body.appendChild(el('h4', null, '历练记录'));
      legacy.forEach(q => body.appendChild(el('div', 'sk-row', `<b>▪ ${TA.esc(q)}</b>`)));
    }
    if (!stEntries.length && !legacy.length) body.appendChild(el('p', 'dim center', '暂无任务在身。'));
  });
}

/* ---------------- 线索手册（CoC） ---------------- */
export function openClues() {
  const def = TA.game(U.S.gameId);
  const reg = def.clues || {};
  modal('🧩 线索手册', body => {
    const ids = Object.keys(reg);
    const found = ids.filter(id => U.S.clues && U.S.clues[id]);
    body.appendChild(el('p', 'dim', `已登记 ${found.length}/${ids.length} 条关键线索`));
    for (const id of ids) {
      const c = reg[id];
      const got = U.S.clues && U.S.clues[id];
      body.appendChild(el('div', 'sk-row', got
        ? `<b>🧩 ${TA.esc(c.name || id)}</b><span>${TA.esc(c.desc || '')}</span>`
        : `<b class="dim">？？？</b><span class="dim">尚未发现的线索</span>`));
    }
    if (!ids.length) body.appendChild(el('p', 'dim center', '这个模组没有登记线索。'));
  });
}
