#!/usr/bin/env node
/* ============================================================
 * 游戏数据指纹：对 TA.GAMES 做稳定序列化（含函数源码）后取 md5。
 * 用于重构前后对拍——数据零改动的重构，指纹必须一致。
 * 用法：node tools/fingerprint.mjs
 * ============================================================ */
import { createHash } from 'node:crypto';
import { boot } from './_loader.mjs';

const TA = await boot();

function stable(v) {
  if (typeof v === 'function') return 'fn:' + v.toString();
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}

const hash = createHash('md5').update(stable(TA.GAMES)).digest('hex');
console.log(hash);
