/* ============================================================
 * 战斗浮层：novel 回合制 / CoC d100 两体系
 * ============================================================ */
import { TA } from '../core/api.js';
import { TAAudio } from '../audio/bgm.js';
import { $, el, btn, U } from './core.js';

/* ---------------- 战斗 ---------------- */
export function combatOverlay(cctx) {
  return new Promise(resolve => {
    const e = { ...cctx.enemy };
    e.hpNow = e.hp;
    const s = U.S, def = cctx.def;
    const root = $('#modal-root');
    const overlay = el('div', 'combat-overlay');
    const logBox = el('div', 'combat-log');
    const actBox = el('div', 'combat-acts');
    const isCoc = def.type === 'coc';

    function clog(html, cls) {
      logBox.appendChild(el('div', 'combat-line ' + (cls || ''), html));
      logBox.scrollTop = logBox.scrollHeight;
    }
    function renderBars() {
      overlay.querySelector('.enemy-hp i').style.width = Math.max(0, e.hpNow / e.hp * 100) + '%';
      overlay.querySelector('.enemy-hp b').textContent = `${Math.max(0, e.hpNow)}/${e.hp}`;
      overlay.querySelector('.pc-hp i').style.width = Math.max(0, s.hp / s.hpMax * 100) + '%';
      overlay.querySelector('.pc-hp b').textContent = `${s.hp}/${s.hpMax}`;
      const mpEl = overlay.querySelector('.pc-mp span');
      if (mpEl) mpEl.textContent = ` 🔮 ${s.mp}/${s.mpMax}`;
    }
    function renderActs(mode, extra) {
      actBox.innerHTML = '';
      if (mode === 'main') {
        if (isCoc) {
          const weapons = usableWeapons(s, def);
          weapons.forEach(w => {
            actBox.appendChild(btn('combat-btn', `${w.icon || '🗡️'} ${w.name} <small>(${w.skillLabel} ${w.val}%，伤害 ${w.dmgText})</small>`, () => cocPlayerAttack(w)));
          });
        } else {
          actBox.appendChild(btn('combat-btn', '⚔️ 攻击', () => novelPlayerTurn({ type: 'attack' })));
          const skills = s.skills.map(id => def.skills[id]).filter(sk => sk && sk.combat);
          for (const sk of skills) {
            const b = btn('combat-btn' + (s.mp >= (sk.mp || 0) ? '' : ' disabled'),
              `${sk.icon || '✦'} ${sk.name} <small>${sk.heal ? '治疗 ' + sk.heal : '威力 ×' + (sk.mult || 1.5)}${sk.mp ? ' · 耗 ' + sk.mp : ''}</small>`,
              () => { if (s.mp >= (sk.mp || 0)) novelPlayerTurn({ type: 'skill', sk }); });
            actBox.appendChild(b);
          }
        }
        const items = Object.keys(s.items).filter(id => combatUsable(def.items[id]));
        for (const id of items) {
          const it = def.items[id];
          actBox.appendChild(btn('combat-btn item', `${it.icon || '🧪'} 使用 ${it.name} ×${s.items[id]}`, () => useItemInCombat(id)));
        }
        actBox.appendChild(btn('combat-btn flee', '🏃 逃跑', () => tryFlee()));
      }
    }
    function finish(result) {
      if (result === 'lose') TAAudio.sfx('death');
      else if (result === 'win') TAAudio.sfx('levelup');
      else TAAudio.sfx('flee');
      overlay.remove();
      resolve(result);
    }
    function enemyTurn() {
      if (isCoc) {
        if (e.san && !e.sanDone) {
          e.sanDone = true;
          const r = TA.dice.d100(0);
          const pass = r <= s.san;
          if (!pass) TAAudio.sfx('ghost');
          const loss = TA.dice.roll(pass ? e.san[0] : e.san[1]);
          s.san = Math.max(0, s.san - loss);
          clog(`🧠 初见【${e.name}】<b>理智检定</b>：掷出 ${r}（SAN ${s.san}）→ ${pass ? '通过' : '失败'}，损失 ${loss} 点`, 'm-line');
          if (loss >= 5) clog('⚠️ 你浑身发抖，几乎握不住武器……（临时疯狂）', 'm-bad');
        }
        if (Math.random() * 100 < (e.atk || 40)) {
          const dmg = Math.max(1, TA.dice.roll(e.dmg || '1d3'));
          TAAudio.sfx('hit');
          s.hp -= dmg;
          clog(`💢 ${e.name} 击中你，造成 <b class="m-bad">${dmg}</b> 点伤害`, 'm-line');
        } else {
          clog(`💨 ${e.name} 的攻势被你堪堪避开`, 'm-line');
        }
      } else {
        const act = TA.combatMath.enemyAct(s, e, def);
        s.hp = Math.max(0, s.hp - act.dmg);
        TAAudio.sfx('hit');
        const panel = overlay.querySelector('.combat-panel');
        if (panel) { panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake'); }
        clog(`🐉 ${TA.esc(act.text || act.name)}，你受到 <b class="m-bad">${act.dmg}</b> 点伤害`, 'm-line');
      }
      renderBars();
      if (s.hp <= 0) {
        clog('☠️ 你眼前一黑，倒了下去……', 'm-bad');
        setTimeout(() => finish('lose'), 900);
        return false;
      }
      return true;
    }
    function novelPlayerTurn(a) {
      actBox.innerHTML = '';
      if (a.type === 'attack') {
        const r = TA.combatMath.pcAttack(s, e, def);
        TAAudio.sfx(r.crit ? 'crit' : 'hit');
        e.hpNow -= r.dmg;
        clog(`🗡️ 你挥出一击${r.crit ? '，<b class="m-good">会心一击！</b>' : ''}对【${e.name}】造成 <b class="m-good">${r.dmg}</b> 点伤害`, 'm-line');
      } else if (a.type === 'skill') {
        s.mp -= a.sk.mp || 0;
        const r = TA.combatMath.pcSkillDmg(s, e, def, a.sk);
        if (r.heal) {
          s.hp = TA.clamp(s.hp + r.heal, 0, s.hpMax);
          clog(`${a.sk.icon || '✦'} ${a.sk.name}，恢复 <b class="m-good">${r.heal}</b> 点生命`, 'm-line');
        } else {
          e.hpNow -= r.dmg;
          clog(`${a.sk.icon || '✦'} 你施展出【${a.sk.name}】${r.crit ? '，<b class="m-good">效果拔群！</b>' : ''}造成 <b class="m-good">${r.dmg}</b> 点伤害`, 'm-line');
        }
      }
      renderBars();
      if (e.hpNow <= 0) {
        clog(`🏆 【${e.name}】轰然倒下！`, 'm-good');
        setTimeout(() => finish('win'), 800);
        return;
      }
      setTimeout(() => { if (enemyTurn()) renderActs('main'); }, 550);
    }
    function cocPlayerAttack(w) {
      actBox.innerHTML = '';
      TAAudio.sfx('dice');
      const r = TA.dice.d100(0);
      const succ = r <= w.val;
      const extreme = succ && w.val >= 25 && r <= Math.floor(w.val / 5);
      if (succ) {
        let dmg = TA.dice.roll(w.dmg) + (w.melee ? TA.dice.roll(s.cocDB || '0') : 0);
        if (extreme) dmg *= 2;
        dmg = Math.max(1, dmg);
        e.hpNow -= dmg;
        clog(`🎯 ${w.name} 掷出 ${r}（目标 ${w.val}）—— ${extreme ? '<b class="m-good">极难成功（双倍伤害）</b>' : '命中'}，对【${e.name}】造成 <b class="m-good">${dmg}</b> 点伤害`, 'm-line');
      } else {
        clog(`💨 ${w.name} 掷出 ${r}（目标 ${w.val}）—— 落空`, 'm-line');
      }
      renderBars();
      if (e.hpNow <= 0) {
        clog(`🏆 【${e.name}】倒了下去！`, 'm-good');
        setTimeout(() => finish('win'), 800);
        return;
      }
      setTimeout(() => { if (enemyTurn()) renderActs('main'); }, 550);
    }
    function combatUsable(it) {
      if (!it) return false;
      if (it.combatUse) return true;
      const fx = it.fx;
      if (!Array.isArray(fx)) return false;
      return fx.every(x => ['hp', 'mp', 'san', 'heal'].includes(x[0]));
    }
    function useItemInCombat(id) {
      const it = def.items[id];
      actBox.innerHTML = '';
      TA.itemAdd(s, id, -1);
      let msg = `${it.icon || '🧪'} 使用了【${it.name}】`;
      for (const x of (it.fx || [])) {
        const v = x[1];
        if (x[0] === 'hp' || x[0] === 'heal') { s.hp = TA.clamp(s.hp + v, 0, s.hpMax); msg += `，生命${v >= 0 ? '+' : ''}${v}`; }
        else if (x[0] === 'mp') { s.mp = TA.clamp(s.mp + v, 0, s.mpMax); msg += `，法力${v >= 0 ? '+' : ''}${v}`; }
        else if (x[0] === 'san') { s.san = TA.clamp(s.san + v, 0, s.sanMax); msg += `，理智${v >= 0 ? '+' : ''}${v}`; }
      }
      clog(msg, 'm-line');
      renderBars();
      setTimeout(() => { if (enemyTurn()) renderActs('main'); }, 550);
    }
    function tryFlee() {
      actBox.innerHTML = '';
      if (isCoc) {
        const r = TA.dice.d100(0);
        const val = (s.cocAttrs.DEX || 0);
        if (r <= val) {
          clog(`🏃 掷出 ${r}（敏捷 ${val}）—— 你转身逃了出去！`, 'm-line');
          setTimeout(() => finish('flee'), 700);
          return;
        }
        clog(`💔 掷出 ${r}（敏捷 ${val}）—— 没能逃脱！`, 'm-bad');
      } else {
        const ch = TA.combatMath.fleeChance(s, e);
        if (Math.random() * 100 < ch) {
          clog(`🏃 你瞅准空档，脱身而去！（成功率 ${ch}%）`, 'm-line');
          setTimeout(() => finish('flee'), 700);
          return;
        }
        clog(`💔 逃跑失败！（成功率 ${ch}%）`, 'm-bad');
      }
      setTimeout(() => { if (enemyTurn()) renderActs('main'); }, 550);
    }
    function usableWeapons(s2, def2) {
      const list = [];
      for (const id of Object.keys(s2.items)) {
        const it = def2.items[id];
        if (it && it.kind === 'weapon' && it.coc) {
          list.push({
            id, name: it.name, icon: it.icon, skill: it.coc.skill, dmg: it.coc.dmg,
            melee: it.coc.melee !== false,
            val: s2.cocSkills[it.coc.skill] || 0,
            skillLabel: it.coc.skill,
            dmgText: it.coc.dmg + (it.coc.melee !== false ? '+' + (s2.cocDB || '0') : ''),
          });
        }
      }
      list.push({
        id: '__fist', name: '徒手', icon: '👊', skill: '斗殴', dmg: '1d3', melee: true,
        val: s2.cocSkills['斗殴'] || 0, skillLabel: '斗殴', dmgText: '1d3+' + (s2.cocDB || '0'),
      });
      return list;
    }

    overlay.innerHTML = `
      <div class="combat-panel">
        <div class="combat-head">⚔️ 遭遇战 · ${TA.esc(e.name)}</div>
        <div class="combat-grid">
          <div class="fighter enemy">
            <span class="f-icon">${e.icon || '👹'}</span>
            <div class="f-info"><b>${TA.esc(e.name)}</b><p class="dim">${TA.esc(e.desc || '')}</p></div>
            <div class="hp-line enemy-hp"><i></i><b></b></div>
          </div>
          <div class="fighter pc">
            <span class="f-icon">🧑</span>
            <div class="f-info"><b>${TA.esc(s.name)}</b><p class="dim">${isCoc ? '调查员' : (def.realms ? (def.realms[s.realmIdx] || {}).name : '')}</p></div>
            <div class="hp-line pc-hp"><i></i><b></b></div>
            ${!isCoc ? `<div class="pc-mp dim"><span></span></div>` : ''}
          </div>
        </div>
        <div class="combat-log-box"></div>
        <div class="combat-acts-box"></div>
      </div>`;
    overlay.querySelector('.combat-log-box').appendChild(logBox);
    overlay.querySelector('.combat-acts-box').appendChild(actBox);
    clog(`💥 遭遇【${e.name}】！${TA.esc(e.intro || '')}`, 'm-head');
    renderBars();
    renderActs('main');
    root.appendChild(overlay);
  });
}

