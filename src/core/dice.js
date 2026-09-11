/* ---------------- 骰子 ---------------- */
function d(n) { return Math.floor(Math.random() * n) + 1; }
function roll(expr) {
  const str = String(expr).toLowerCase().replace(/\s+/g, '');
  let total = 0, m;
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
  while ((m = re.exec(str))) {
    if (m[3] !== undefined) {
      const sign = m[1] === '-' ? -1 : 1;
      const cnt = m[2] ? parseInt(m[2], 10) : 1;
      for (let i = 0; i < cnt; i++) total += sign * d(parseInt(m[3], 10));
    } else {
      const sign = m[4] === '-' ? -1 : 1;
      total += sign * parseInt(m[5], 10);
    }
  }
  return total;
}
/* d100（00 算 100），bpd>0 奖励骰取低位，bpd<0 惩罚骰取高位 */
function d100(bpd) {
  bpd = bpd || 0;
  const units = rnd10();
  let tens = rnd10();
  for (let i = 0; i < Math.abs(bpd); i++) {
    const t = rnd10();
    tens = bpd > 0 ? Math.min(tens, t) : Math.max(tens, t);
  }
  const v = tens * 10 + units;
  return v === 0 ? 100 : v;
}
function rnd10() { return Math.floor(Math.random() * 10); }

export { d, roll, d100, rnd10 };
