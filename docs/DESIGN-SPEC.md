# 书境奇游 · 设计规范 v2

**状态**：规范定稿（2026-09-11）。本文是 v2 目标架构的唯一规范；现行 v1 实现文档见根目录 `DESIGN.md`，v1→v2 迁移的执行步骤见 `REFACTOR_PLAN.md`。

定位：单机优先、多游戏共存的文字冒险平台——一套引擎 + 多个数据包，换游戏只换数据。支持网络小说改编（回合制战斗/修炼/境界）与跑团模组改编（CoC d100 检定/SAN/线索）。

## 1. 原则

1. **内容为王**：引擎再好，剧情无聊也没人玩。一切结构设计为内容创作让路。
2. **引擎与游戏严格分离**：引擎代码不得出现任何具体游戏的名字/剧情；游戏数据只用 DSL，不调引擎私有函数。
3. **本地优先**：断网、无账号也能完整游玩；云同步/成就/排行是登录后的增值层。
4. **数据格式统一**：所有游戏同一套 schema；加载即校验，数据错误在入口暴露。
5. **存档带游戏 ID 与版本号**：防串档、防更新毁旧档。
6. **移动优先**：大部分时间在手机上玩（局域网 29012 站点）。
7. **不过度设计**：家庭单机规模。不引入 Redis/消息队列/微服务；用户可见的复杂度一律砍掉。

明确不做：在线多人/实时对战、可视化游戏编辑器（数据包用代码写）、通用 RPG 引擎、付费内购。

## 2. 总体架构

```
┌──────────────────────────────────────────────┐
│ 浏览器前端（SPA）                              │
│  平台外壳：游戏库 / 设置 / 账号态 / 个人资料    │
│  引擎核心：state / actions / effects / router  │
│           / save / validate / events          │
│  通用模块：story·attrs·inventory·quests·npc    │
│           ·combat·cultivation·check·sanity    │
│           ·clues·dungeon·achievements         │
│  通用 UI：topbar / 选项 / 面板 / 战斗 / 弹窗    │
├──────────────────────────────────────────────┤
│ 游戏数据包 games/<id>/（manifest + data+assets）│
└──────────────────────────────────────────────┘
        │ 静态资源（本地优先，无需后端即可玩）
        │ /api/*（可选增值层）
        ▼
┌──────────────────────────────────────────────┐
│ 后端 API（Node.js，127.0.0.1 内部端口）        │
│  云存档 / 成就 / 排行榜                        │
│  认证：复用本机 SSO（见 §10）                  │
├──────────────────────────────────────────────┤
│ Samba AD 域控（经 <工作目录>/sso 校验）    │
│ SQLite（或 PostgreSQL，见 REFACTOR_PLAN 决策点）│
└──────────────────────────────────────────────┘
```

数据流：玩家操作 → `dispatch(action)` → `applyEffects(state)` → 任务/NPC/成就更新 → 路由跳转 → 本地存档（立即）+ 云同步（异步）→ 渲染。

## 3. 目录结构 v2

```
text-adventure-rpg/
├── index.html                # SPA 入口（ESM）
├── src/
│   ├── main.js               # 入口
│   ├── core/                 # 引擎核心（不含任何游戏内容）
│   │   ├── state.js          # 状态创建/读写/迁移
│   │   ├── actions.js        # 操作入口 dispatch
│   │   ├── effects.js        # 效果执行
│   │   ├── router.js         # 场景路由
│   │   ├── modules.js        # 模块注册与加载
│   │   ├── save.js           # 本地存档（localStorage）
│   │   ├── validate.js       # 数据校验
│   │   └── events.js         # 事件总线
│   ├── modules/              # 通用模块（每个一个职责）
│   │   ├── story.js  attributes.js  inventory.js  quests.js
│   │   ├── npc.js  combat.js  cultivation.js  skill_check.js
│   │   └── sanity.js  clues.js  dungeon.js  achievements.js
│   ├── ui/                   # 渲染（topbar/choices/panel/combat/modal/toast）
│   ├── shell/                # 平台外壳（library / game_loader / settings / auth）
│   ├── api/                  # 后端 API 客户端（云存档/成就/排行；离线时静默降级）
│   └── audio/                # bgm.js / sfx.js / voice.js（mimo TTS 客户端）
├── games/                    # 游戏数据包（每游戏一目录，引擎不感知具体 id）
│   └── <id>/
│       ├── manifest.json     # 见 §4
│       ├── data/             # story.js / config.js / npcs.js / items.js / enemies.js
│       │                     # / skills.js / maps.js / quests.js / achievements.js
│       └── assets/           # cover.png / bgm.mp3（BGM 也可共享根级 assets/music/）
├── server/                   # 后端（阶段 4 引入，见 REFACTOR_PLAN）
├── assets/music/             # 共享曲库（CC BY 4.0，署名 ATTRIBUTION.md）
├── tools/                    # validate / smoke / balance / serve（保留）
└── docs/                     # 本规范 / REFACTOR_PLAN
```

**构建策略**（决策记录，详见 REFACTOR_PLAN 阶段 1/2）：采用**原生 ESM + 零构建**——
`games/registry.js`（ESM 数组，`tools/mkregistry.mjs` 生成，含 v1 展示顺序）提供首页卡片摘要，
`src/shell/game_loader.js` 按需动态 `import()` 数据包并做运行时校验（def 级）。理由：延续本机「免构建、零 node_modules」惯例，局域网部署与当前完全一致。设计文档中的 Vite 方案为已评估备选：包结构与模块边界与构建工具无关，若未来需要（打包压缩/热更）可平替切换，不改数据包。

## 4. 数据包规范 manifest.json

```json
{
  "id": "panlong",
  "name": "盘龙",
  "type": "webnovel",              // webnovel | trpg
  "version": "2.0.0",              // 游戏内容版本
  "author": "书境奇游",
  "description": "一句话钩子（首页卡片）",
  "cover": "assets/cover.png",
  "entry": "data/index.js",        // 数据入口（default export GameDef）
  "startNode": "start",
  "modules": ["story","attributes","inventory","combat","cultivation","quests","maps"],
  "theme": { "accent": "#6f9bd6", "accent2": "#2c3f66" },
  "audio": { "bgm": "assets/music/panlong_teller_of_tales.mp3", "narr": "茉莉" },
  "saveVersion": 2,
  "tags": ["西幻", "魔法斗气"],
  "difficulty": "★★",
  "length": "40 分钟"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| id | ✓ | 唯一标识；存档 key、目录名、成就/排行维度都用它 |
| type | ✓ | `webnovel`（回合制体系）/ `trpg`（d100 检定体系） |
| entry / startNode | ✓ | 数据入口与起始场景 |
| modules | ✓ | 启用的模块列表（加载器按需加载，校验器据此检查能力引用） |
| saveVersion | ✓ | 存档 schema 版本，用于 `migrate()` |
| theme / audio | | 主题色与 BGM/朗读音色（继承 v1 的 theme/bgm/narr 字段） |

数据入口 `data/index.js` 汇总各分文件并 default export。**GameDef 的 DSL 与 v1 完全一致**（见 `~/.agents/skills/text-adventure-game/references/dsl-reference.md`，引擎 `src/core` 是唯一事实源）；v1 的 `TA.registerGame` 全局注册改为 `game_loader` 按 manifest 动态加载。

## 5. 数据模型

### 5.1 玩家状态 State（v2）

目标形态是下述分区结构，v1 字段全部保留（迁移映射见 §14）。
**实施注记（阶段 1 定案）**：运行时 State 暂保持 v1 平铺结构——数据包函数
（createChar/cultivateGain/text fn）直接读写平铺字段，分区化将随阶段 2/3 数据包
迁移一并落地；存档档库信封的 `v` 版本字段是迁移契约，不依赖内部分区形态。

```js
{
  meta: { gameId, saveVersion, createdAt, lastSave, localUpdatedAt, syncedAt, deviceId, playtime },
  role: {                                   // v1 顶层战斗/成长字段归入 role
    name, hp, hpMax, mp, mpMax, san, sanMax, atk, def, agi,
    money, exp, realmIdx, attrs{}, skills[], equip{weapon,armor},
    cocAttrs, cocSkills, cocDB
  },
  story: { node, prevNode, map, flags{}, visited{}, endings{}, history[] },
  inventory{}, quests[], npc{}, clues{},
  achievements{}, battle: null,
  ui: { settings 引用的运行态（打字机/自动朗读等开关快照） }
}
```

### 5.2 节点 Node / 选项 Choice

对应 v1 Scene/choice，字段不变（title/text|fn/enter→onEnter/choices/map/ending/cultivate/rest/explorePool；choice: t/goto/req/show/fx/once/hot）。规范补充：

- `text` 与 `choices` 都可以是 `fn(state)`，但**函数体内的 goto/flag 字符串必须是字面量**（可被静态校验）；确实需要动态 id 时用 `['goto', fn]` 且 fn 分支可枚举。
- 每个节点必须有至少一条可达出路（结局节点除外）——校验器强制。

### 5.3 条件 / 效果

v1 数组 DSL 全量保留（作者侧语法不变）。内部实现层（`effects.js`）将其编译为对象模型执行，对象模型即设计文档 §5.4 的规范形：

```js
// ['item','hpPotion',-1] 编译为
{ items: { remove: { hpPotion: 1 } } }
// ['check',{stat:'侦查',dc:50,...}] 原生就是对象，直接透传
```

编译器双向：`fromV1(fxArray) → effectsObject`。校验器同时接受两种写法，新内容推荐数组 DSL（简洁、已有全套校验与踩坑经验）。

### 5.4 检定 / 物品 / 敌人 / 技能 / 地图 / 随机事件

与 v1 相同（DSL 参考 §5-§10）。物品增加可选 `price`（商店用）；敌人增加可选 `coc: true` 标记（同一 enemies 表两体系共存）。

### 5.5 NPC 与对话（v2 新增模块）

```js
npcs: {
  guard: { name, portrait?, initial: { met:false, alive:true, mood:'neutral' },
           affinity: { default:0, min:-10, max:10 } }
}
// fx: ['npc','guard',{affinity:+3, mood:'friendly'}]
// cond: ['npcmet','guard'] / ['npcaff','guard',5]
```

对话树暂不独立建模——场景图本身即可表达对话分支（v1 实践验证）；NPC 模块只管好感/存活/知识状态，供条件与动态文本消费。

**实施注记（阶段 3）**：以上 v2 新能力均以增量 fx/cond 落地——`['npc',id,patch]`/`['clue',id]`/`['dungeon',id]` 效果与 `['npcmet']/['npcaff']/['clue']/['clues']/['quest']` 条件；注册表任务与 v1 字符串支线双轨并存（`s.questState` 与 `s.quests`），运行态字段 `npc/clues/questState/achievements` 由 `TA.normalizeState()` 在读档时补齐，旧档零迁移。

### 5.6 任务 Quest（v2 规范化 v1 的 quests[]）

```js
quests: { main_01: { title, desc, type:'main'|'side',
        objectives: [{ desc, kind:'flag'|'item'|'kill', target, count }],
        rewards: [fx], next: 'main_02' } }
// fx: ['quest','main_01','active'|'done'|'fail']；目标由模块按 kind 自动勾稽
```

### 5.7 成就 Achievement（v2 新增）

```js
achievements: { first_realm: { name, desc, icon:'🌟', points:10, hidden:false,
                 condition: (s)=>s.role.realmIdx>=1 } }   // 每次状态变更后惰性检查
```

定义在游戏包内；解锁记录 `{unlockedAt}` 存 `state.achievements` 并异步上报云端。

## 6. 引擎模块清单

| 模块 | 职责 | v1 对应 |
|---|---|---|
| core/state | 状态创建/读写/迁移 | engine.js baseState + saves |
| core/actions | dispatch 入口、choose/freeAction | engine.js enterScene/choose |
| core/effects | fx 编译与执行 | engine.js runFx |
| core/router | 场景流转/visited/ending | engine.js goto 相关 |
| core/save | localStorage 槽位/导出导入 | engine.js saves |
| core/validate | 加载时数据校验 | tools/validate.js（运行时子集） |
| core/events | 事件总线（替代 v1 TA.hooks） | TA.hooks {appendLog,refresh,...} |
| modules/story | 场景/选项/可达性 | runFx 内联逻辑拆出 |
| modules/combat | 两体系战斗数学 | engine.js combat 段 |
| modules/cultivation | 修炼/突破/境界 | engine.js cultivate 段 |
| modules/skill_check | d100 检定/等级/bpd | runCheck |
| modules/sanity | SAN/临时疯狂 | runSanCheck |
| modules/attributes / inventory | 属性/背包/装备 | 内联逻辑拆出 |
| modules/quests | 任务勾稽 | quests[] 简版 |
| modules/npc · clues · dungeon · achievements | v2 新增（§5.5-5.7；dungeon 实施为 `['dungeon',id]` fx 快速连战，复用战斗浮层） | 无 |

## 7. 系统公式（以 v1 已平衡实现为准）

设计文档中的公式（`atk−def` 等）为草案；**以现行引擎实测调平衡的公式为准**，重构时行为等价迁移：

- **novel 战斗**：玩家普攻=atk±骰；技能=`atk × mult` ± 骰、耗 mp；暴击 6%（×2）。敌人伤害=`技能骰 + 敌atk/2 − 玩家def/2`。闪避/命中由 agi 差修正。平衡目标：Boss 推荐境界胜率 85-95%，跳级 15-25%（`tools/balance.js` 模拟）。
- **CoC 检定**：d100 ≤ 目标；极难 ≤⌈目标/5⌉、困难 ≤⌈目标/2⌉（目标≥25 才分级）；大失败 ≥96 且>目标；奖励/惩罚骰 bpd。成功且为技能检定时 35% 概率 +2 成长。CoC 战斗：武器技能检定命中，极难=双倍伤害。
- **SAN**：d100 ≤ 当前 SAN 通过。损失=骰表达式（过/败双损）；单次 ≥5 临时疯狂；SAN=0 → mad 结局。模组全流程损耗预算 30-45。
- **建卡**：CoC 八属性 3d6×5（SIZ/INT/EDU 为 2d6+6)×5，DB/HP 按表推；novel 由 createChar 定义。
- **修炼**：`cultivateGain(s)` 收益、`breakChance(s)` 突破率（随境界递减 0.9→0.25）。

## 8. UI/UX 规范

- 布局：单列叙事流（手机优先）；顶栏=游戏名+资源条（HP/MP/SAN/金钱/境界）+快捷按钮（角色/背包/地图/存档/🔊/📢/⚙）。桌面居中限宽。
- **游戏界面不套用本机 webui-design 的 Pico/Bulma 管理台规范**——那是管理/内容页风格；游戏是暗色沉浸主题（CSS 变量：`--bg/-card/-text/-accent`），每游戏经 `theme` 覆盖主色。两套规范并行，互不越界。
- 动效：打字机（可关）、d100 掷骰浮层、受击屏震、低血量（≤30%）红色晕影；全部受「氛围设置」开关与 `prefers-reduced-motion` 约束。
- 键盘：`1-9` 选选项、`Esc` 关弹窗。
- 无障碍底线：字号可调、触控目标 ≥44px、色彩对比 ≥4.5:1。

## 9. 存档与同步

- **本地**（唯一必需层）：localStorage，每游戏一个档库 key=`tarpg:v2:save:<gameId>`（`{v:2, auto, slots:[3]}`；快照结构与 v1 一致，旧导出码可导入）；结局收集 `tarpg:v2:collect:<gameId>`。v1 旧 key 首次读取时惰性迁移并保留不删（行为由 `tools/test-migrate.mjs` 固化）。
- **meta**：`{gameId, saveVersion, localUpdatedAt, syncedAt, deviceId}`；`deviceId` 首次生成存 localStorage。
- **云同步**（登录后）：本地写 → 异步上传；打开游戏时 `localUpdatedAt` 与云端 `updated_at` 比较，新者胜（差值 <1s 视为同源）；离线队列存 localStorage，`online` 事件冲刷。每槽一份，不做字段级合并（单机游戏整档语义更安全）。
- **迁移**：`migrate(save, saveVersion)` 链式升版；v1 存档在首次加载时无损搬运到 v2 分区结构。

## 10. 账号（复用本机 SSO）

**决策记录**：设计文档草案为「后端 ldapjs 直连 AD + JWT」。本机已有统一登录体系（`<工作目录>/sso`，Flask+ldap3 校验 Samba AD，nginx auth_request，Cookie 跨端口通行，铁律「需要登录的新网页一律接入 SSO，不另写认证」）。**v2 一律复用 SSO，不新建 LDAP/JWT**：

- 游玩本身保持匿名（现状不变，纯内容不接登录）。
- `/api/*` 云功能采用**应用层接入**（LiteGate 同款先例）：后端收到请求时携带 `session` Cookie 调 `http://127.0.0.1:5090/verify` 换取用户名，失败返回 401；前端提示「云同步需先登录」并链到 https://<局域网IP>:29010。
- 后端只信回环来源（nginx 反代 + 127.0.0.1 监听），不暴露局域网。

## 11. 成就与排行榜

- 成就定义在游戏包 `data/achievements.js`（§5.7）；解锁写本地 `state.achievements` + toast，登录时异步上报。
- 榜单四类：最快通关（playtime 升序，仅完成档）、最高境界（novel）、成就点数（全游戏合计）、单游戏结局收集数。家庭规模（≤10 用户）实时查询即可，不预聚合。
- 表结构（SQL 语义，SQLite/PostgreSQL 通用）：`users(id, sso_username UNIQUE, display_name, created_at, last_login_at)`、`saves(user_id, game_id, slot, state JSON, updated_at, UNIQUE(user_id,game_id,slot))`、`user_achievements(user_id, game_id, achievement_id, unlocked_at, UNIQUE(...))`、`leaderboard_entries(user_id, game_id, board_id, score NUMERIC, achieved_at, UNIQUE(...))`。

## 12. 校验与测试（发布门禁）

1. `node tools/validate.js`——语法/引用/死链/死路/重复 key/**全旗标放开 BFS 可达性**（专抓条件门控死的支线）0 error。
2. `node tools/smoke.js`——全部游戏无头随机通玩 pass。
3. `node tools/balance.js <id>`——数值改动后胜率达标（§7）。
4. Playwright 浏览器通玩——0 console error + 桌面/手机宽度截图验收。
5. （v2 新增）运行时 `core/validate.js`：manifest 必填字段、entry 可加载、startNode 存在——加载即校验。

## 13. 部署与运维

- 前端：静态文件由 `tools/serve.py`（127.0.0.1:8321）伺服（含 `/mimo/` TTS 代理）；nginx 29xxx HTTPS 反代（现 29012）+ systemd `text-rpg.service` 常驻；hub-nav「影音游戏」已注册。v2 不改变这个拓扑，仅后端 API 增加一个内部端口与 systemd 单元。
- 后端（阶段 4）：Node.js 独立 systemd 单元，监听 127.0.0.1（nginx `/api/` 反代）；数据库文件/备份随项目目录，每日 crontab 备份保留 30 天。
- 任何 nginx/systemd 改动走 `nginx-site` 技能流程（/etc 生效配置与仓库 `deploy/` 模板同步）。

## 14. v1 → v2 映射总表

| v1 | v2 | 备注 |
|---|---|---|
| `TA.registerGame(def)` 全局注册 | `games/<id>/manifest.json` + 动态 import | data/*.js 拆包迁移 |
| `TA.hooks.{appendLog,refresh,toast,ending,combat}` | `core/events.js` 总线事件 | ui 订阅 |
| state 顶层平铺 | `meta/role/story/inventory/...` 分区 | migrate() 搬运 |
| `TA.games` | `GameManager.games`（registry.json 驱动） | |
| `js/engine.js` 单文件 | `src/core` + `src/modules` 按职责拆 | 行为等价，公式不变 |
| fx 数组 DSL | 不变（内部编译为对象模型） | 作者侧零改动 |
| localStorage 裸 key | `tarpg:<gameId>:<slot>` + meta | 读旧写新兼容一版 |
| 无 | npc/clues/achievements/dungeon/quests 规范化 / 云同步 / 排行榜 | 阶段 3-5 新增 |
