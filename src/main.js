/* ============================================================
 * 入口：模块执行顺序 = import 依赖序
 *   core/api.js 先求值（接管 window.TA），ui.js 订阅事件总线并
 *   依据 games/registry.js 渲染首页；游戏包按需动态 import。
 * ============================================================ */
import { TAAudio } from './audio/bgm.js';
import { TAVoice } from './audio/voice.js';
import { REGISTRY } from './shell/game_loader.js';
import { sync } from './api/sync.js';
import './ui/ui.js';

sync.init().catch(() => {});
console.log(`书境奇游 v2 · 引擎就绪 · ${REGISTRY.length} 部作品（按需加载）`);
