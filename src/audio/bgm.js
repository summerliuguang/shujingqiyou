/* ============================================================
 * 音频系统：BGM（每游戏主题曲）+ WebAudio 程序化音效
 * 设置持久化在 localStorage（tarpg:audio）
 * ============================================================ */
export const TAAudio = (function () {
  'use strict';
  const DEFAULTS = { bgm: true, sfx: true, volume: 0.6 };
  let settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('tarpg:audio') || '{}')); } catch (e) {}
  let bgmEl = null;
  let bgmSrc = '';
  let ctx = null;
  let started = false;

  function save() { try { localStorage.setItem('tarpg:audio', JSON.stringify(settings)); } catch (e) {} }

  function ctxGet() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* 首次用户交互后解锁（浏览器自动播放策略） */
  function unlock() {
    if (started) return;
    started = true;
    ctxGet();
    if (bgmSrc) playBgm(bgmSrc, true);
  }
  document.addEventListener('pointerdown', unlock, { once: false });
  document.addEventListener('keydown', unlock, { once: false });

  function playBgm(src, force) {
    bgmSrc = src || '';
    if (!started || !settings.bgm || !bgmSrc) return;
    if (bgmEl && bgmSrc === src && !force) return;
    if (bgmEl) { bgmEl.pause(); bgmEl = null; }
    bgmEl = new Audio(src);
    bgmEl.loop = true;
    bgmEl.volume = settings.volume * 0.5;
    bgmEl.play().catch(() => { /* 未解锁前静默失败，unlock 后重试 */ });
  }
  function stopBgm() {
    if (bgmEl) { bgmEl.pause(); bgmEl = null; }
    bgmSrc = '';
  }
  function setBgmEnabled(on) {
    settings.bgm = on; save();
    if (on) playBgm(bgmSrc, true); else if (bgmEl) bgmEl.pause();
  }
  function setVolume(v) {
    settings.volume = v; save();
    if (bgmEl) bgmEl.volume = v * 0.5;
  }

  /* ---------- WebAudio 程序化音效 ---------- */
  function tone(freq, dur, type, vol, when, slideTo) {
    const c = ctxGet(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime + (when || 0));
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + (when || 0) + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime + (when || 0));
    g.gain.exponentialRampToValueAtTime(vol || 0.15, c.currentTime + (when || 0) + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (when || 0) + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + (when || 0)); o.stop(c.currentTime + (when || 0) + dur + 0.05);
  }
  function noise(dur, vol, when, filterFreq) {
    const c = ctxGet(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 900;
    const g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime + (when || 0));
  }
  const SFX = {
    click() { tone(700, 0.05, 'triangle', 0.08); },
    gain() { tone(660, 0.09, 'sine', 0.1); tone(880, 0.12, 'sine', 0.1, 0.08); },
    loss() { tone(330, 0.12, 'sine', 0.12); tone(247, 0.16, 'sine', 0.12, 0.1); },
    hit() { noise(0.14, 0.3, 0, 700); tone(140, 0.1, 'square', 0.1, 0, 80); },
    crit() { noise(0.2, 0.35, 0, 1200); tone(200, 0.14, 'square', 0.14, 0, 90); tone(520, 0.1, 'sine', 0.12, 0.06); },
    dice() { for (let i = 0; i < 6; i++) tone(500 + Math.random() * 500, 0.035, 'square', 0.06, i * 0.07); tone(880, 0.1, 'sine', 0.1, 0.45); },
    death() { tone(220, 1.1, 'sawtooth', 0.12, 0, 55); noise(0.9, 0.18, 0.1, 400); },
    levelup() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, i * 0.1)); },
    ghost() { tone(180, 0.8, 'sine', 0.1, 0, 90); tone(184, 0.8, 'sine', 0.1, 0.05, 92); noise(0.5, 0.06, 0, 500); },
    page() { noise(0.08, 0.08, 0, 2400); },
    flee() { tone(600, 0.08, 'triangle', 0.1); tone(500, 0.08, 'triangle', 0.1, 0.08); tone(400, 0.1, 'triangle', 0.1, 0.16); },
  };
  function sfx(name) {
    if (!settings.sfx) return;
    if (!started) { started = true; ctxGet(); }
    const fn = SFX[name];
    if (fn) try { fn(); } catch (e) {}
  }

  return { playBgm, stopBgm, setBgmEnabled, setVolume, sfx, settings, save,
    isBgmOn() { return settings.bgm; } };
})();
