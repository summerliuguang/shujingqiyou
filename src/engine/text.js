/* ---------------- 文本 ---------------- */
function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(text, s) {
  if (typeof text === 'function') text = text(s);
  if (text == null) return '';
  return String(text).replace(/\{name\}/g, esc(s.name || '无名者'));
}

export { esc, fmt };
