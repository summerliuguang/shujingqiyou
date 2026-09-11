/* ============================================================
 * UI 基础：DOM 助手 / 共享 UI 状态 / Toast
 * ============================================================ */
import { TA } from '../core/api.js';

export const $ = sel => document.querySelector(sel);
export const view = () => $('#view');

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export function btn(cls, html, onclick) {
  const b = el('button', cls, html);
  if (onclick) b.addEventListener('click', onclick);
  return b;
}

/* 跨组件共享的 UI 状态（v1 为单 IIFE 闭包变量） */
export const U = {
  S: null,          // 当前游戏状态
  busy: false,      // 动作执行锁
  createTemp: null, // 建卡临时数据
  typeFilter: 'all',
  prefs: { typewriter: false },
};
try { Object.assign(U.prefs, JSON.parse(localStorage.getItem('tarpg:ui') || '{}')); } catch (e) {}
export function savePrefs() { try { localStorage.setItem('tarpg:ui', JSON.stringify(U.prefs)); } catch (e) {} }

/* ---------------- Toast ---------------- */
  export function toast(msg) {
    const root = $('#toast-root');
    const t = el('div', 'toast', TA.esc(msg));
    root.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  