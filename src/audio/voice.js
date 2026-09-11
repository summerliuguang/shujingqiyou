/* ============================================================
 * 语音朗读：mimo-voice-hub TTS（经 /mimo 代理同源访问）
 * 失败时自动回退到浏览器 speechSynthesis。
 * 模式：off 关闭 / manual 手动（每段叙述带 📢 按钮）/ auto 自动朗读
 * ============================================================ */
export const TAVoice = (function () {
  'use strict';
  const DEFAULTS = { mode: 'off', voice: '茉莉', fallbackTold: false };
  let settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('tarpg:voice') || '{}')); } catch (e) {}
  let current = null;
  const cache = new Map();
  let mimoOk = null; // null 未知 / true / false

  function save() { try { localStorage.setItem('tarpg:voice', JSON.stringify(settings)); } catch (e) {} }

  /* 清洗文本：去标记、去表情、去括注 */
  function clean(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, ' ')
      .replace(/（([^）]{1,8}):(.*?)）/g, '，$2，')
      .replace(/："/g, '，')
      .replace(/["“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  async function fetchMimo(text, voice) {
    const resp = await fetch('/mimo/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (!resp.ok) throw new Error('mimo http ' + resp.status);
    const data = await resp.json();
    if (!data || !data.data || !data.data.audio_url) throw new Error('mimo 响应异常');
    return '/mimo' + data.data.audio_url;
  }

  function browserSpeak(text) {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  async function speak(text, opts) {
    text = clean(text);
    if (!text) return;
    if (current) { try { current.pause(); } catch (e) {} current = null; }
    const key = settings.voice + '|' + text;
    try {
      let url = cache.get(key);
      if (!url) {
        url = await fetchMimo(text, settings.voice);
        cache.set(key, url);
        mimoOk = true;
      }
      const el = new Audio(url);
      current = el;
      el.play().catch(() => {});
      return el;
    } catch (e) {
      // mimo 不可达 → 浏览器兜底
      if (mimoOk !== false) mimoOk = false;
      if (!settings.fallbackTold) {
        settings.fallbackTold = true; save();
        if (window.TA) TA.hooks.toast('mimo 语音不可达，已切换浏览器朗读');
      }
      if ((opts || {}).allowFallback !== false) browserSpeak(text);
    }
  }

  function stop() {
    if (current) { try { current.pause(); } catch (e) {} current = null; }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }

  async function voices() {
    try {
      const r = await fetch('/mimo/api/voices');
      const d = await r.json();
      return (d.data && d.data.voices) || [];
    } catch (e) { return []; }
  }

  function setMode(m) { settings.mode = m; save(); if (m === 'off') stop(); }
  function setVoice(v) { settings.voice = v; save(); }

  return { speak, stop, voices, setMode, setVoice,
    get mode() { return settings.mode; },
    get voice() { return settings.voice; },
    get mimoOk() { return mimoOk; } };
})();
