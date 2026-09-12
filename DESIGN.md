# 书境奇游 · 文字冒险 RPG —— 设计文档（v1 现行实现）

纯前端（零依赖、免构建）的文字冒险 RPG 合集：6 部知名网络小说改编 + 3 个 CoC（克苏鲁的呼唤）跑团模组。
所有内容本地运行，存档写入 localStorage。

> v2 目标架构（数据包 manifest 化、引擎 ESM 模块化、后端云存档/成就/排行榜）见
> [docs/DESIGN-SPEC.md](docs/DESIGN-SPEC.md)，迁移步骤见 [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md)。
> 本文档描述的 DSL 与公式在 v2 中全部保留，是现行实现的事实记录。

## 一、调研结论（GitHub 参考项目）

| 项目 | 借鉴点 |
|---|---|
| inkle/ink（叙事脚本语言，19k★） | 故事数据与引擎分离；节点(knot)→选项(choice)→转跳(divert)模型；变量/条件驱动分支 |
| ChoiceScript | 属性系统与数值检定决定分支；多结局收集 |
| Twine | 双向场景图；localStorage 快照式存档 |
| textadventures/quest、evennia（MUD 框架） | 房间(room)+出口(exit)模型 → 我们的地图(地点)系统，支持自由探索 |
| VickScarlet/lifeRestart（人生重开模拟器） | 中文文字游戏的事件+属性检定循环，轻量爽快 |
| CoC 7 版规则（TRPG） | d100≤技能值成功；困难/极难成功（1/2、1/5）；SAN 检定（通过掉少、失败掉多）；9 大属性 3d6×5 |

## 二、技术选型

- 原生 HTML/CSS/JS，无框架、无构建、无外链资源（局域网可用）。
- 数据驱动：每个游戏是一个 `registerGame({...})` 声明式数据文件，引擎通用。
- 存档：localStorage，每游戏 1 自动档 + 3 手动档；结局收集独立存储。
- 测试：Node 校验脚本（死链/死路/引用完整性）+ Playwright 自动化游玩。

## 三、核心模型

```
GameDef
├── id/type(novel|coc)/title/source/desc/tags/theme
├── createChar(state, name, opts)   # 建卡
├── realms[] 境界表（novel）
├── scenes{}  场景图（start 起点）
│     Scene { title, map, text|fn(state), enter[fx], choices[
│       { t, goto, req[cond], show[cond], fx[fx], once } ] }
├── maps{}    地图 { name, desc, locations[{t, icon, scene, req}] }
├── enemies{} 敌人（两种战斗体系）
├── items{}   物品 { name, icon, desc, kind, fx?, equip? }
└── skills{}  技能/法术 { name, desc, mp, mult, heal, ... }
```

- **条件 cond**：`['flag',k]` `['!flag',k]` `['item',id,n]` `['stat',key,v,'>=']` `['realm',i]` `['skill',id]` `['visited',id]` `['money',v]` 或函数。
- **效果 fx**：`['text',s]` `['flag',k,v]` `['item',id,±n]` `['hp',±n]` `['mp',±n]` `['san',±n]` `['money',±n]` `['exp',n]` `['attr',k,±n]` `['up','atk/def/agi/hpMax/mpMax',±n]` `['skill',id]` `['forget',id]` `['map',id]` `['combat',敌,胜点,败点,逃点]`（败点缺省时使用 `def.deathEnding`）`['check',{stat,dc,mod,bpd,pass,fail,hard,extreme,fumble,gotoPass,gotoFail,label,desc}]` `['sancheck',过损,败损,注]` `['rand',[[权重,fx]]]` `['goto',场景|fn]` `['end',名,文,类型]` 或 `['end',fn(state)→{title,text,kind}]` `['realmup']` `['heal',n]` `['set',k,v]`。
- **结局**：效果 `['end',…]`、场景属性 `ending:{title,text,kind}`（进入场景即触发）、SAN 归零自动进入"理智崩溃"（mad）。`def.endings` 清单驱动首页结局收集展示。
- **战斗**：novel=回合制（攻击/技能/物品/逃跑；暴击 6%；敌人伤害 = 技能骰 + atk/2 − 玩家防御/2）；coc=武器技能 d100 检定（极难成功双倍伤害），敌人按 atk 命中率行动，初见可选 SAN 检定。
- **检定**：统一 d100 ≤ 目标值；coc 支持困难（1/2）/极难（1/5）成功与大失败（≥96 且 > 目标）、奖励/惩罚骰（bpd）；技能检定成功有 35% 概率 +2 成长。
- **SAN 检定**：d100≤当前SAN 通过→掉少，失败→掉多；单次损失 ≥5 触发临时疯狂标记。
- **修炼/探索**：场景 `cultivate:true` 出现修炼按钮（`def.cultivateGain(s)` 计算收益），修为满后出现"冲击瓶颈"（`def.breakChance(s)` 决定成功率）；`explorePool:[{w,text,fx,goto,once,show}]` 加权随机事件；`rest:true` 休息恢复。
- **地图**：场景 `map` 字段或 `['map',id]` 切换；地图 `locations:[{t,icon,scene,req}]` 注入为出行选项。
- **键盘**：`1-9` 选择选项，`Esc` 关闭弹窗。

## 四、游戏列表（按开发顺序）

| # | 游戏 | 类型 | 特色系统 |
|---|---|---|---|
| 1 | 凡人修仙传（七玄门→黄枫谷→筑基） | 修仙 | 境界突破、灵药炼制、法术斗法 |
| 2 | 盗墓笔记（七星鲁王宫） | 探险 | 机关解谜、探索搜证、尸蹩战斗 |
| 3 | 盘龙（芬莱王国→恩斯特学院→魔兽山脉） | 西幻 | 魔法+斗气双修、石雕寻宝 |
| 4 | 遮天（泰山铜棺→北斗灵墟洞天→妖帝坟） | 仙侠 | 苦海境界、源天师寻宝 |
| 5 | 龙族（录取通知→卡塞尔学院→屠龙任务） | 都市奇幻 | 言灵觉醒、血统评级 |
| 6 | 无限恐怖（主神空间→咒怨→生化危机） | 无限流 | 奖励点兑换、基因锁、团队抉择 |
| 7 | CoC：闹鬼公馆（The Haunting） | 跑团 | 调查取证、SAN 检定、尸鬼战 |
| 8 | CoC：死光（Dead Light） | 跑团 | 生存协作、限时修车逃脱 |
| 9 | CoC：独抗烈焰（Alone Against the Flames） | 跑团单人 | 多结局、邪教潜入 |

## 五、目录结构

```
text-adventure-rpg/
├── index.html            # SPA 入口（module 脚本 src/main.js）
├── css/style.css         # 主题样式（每游戏可覆盖主题色）
├── src/core/             # 引擎核心 ESM（state/actions/effects/router/save/cond/bus/api）
├── src/modules/          # 通用模块（combat/skill_check/cultivation/story/quests/npc/clues/achievements/dungeon）
├── src/shell/            # game_loader（registry + 懒加载数据包）
├── src/ui/               # 渲染组件（core/home/create/view/panels/combat/ending/hub）
├── src/api/              # 云同步客户端（client/sync）
├── src/audio/            # BGM/音效与 TTS 语音
├── games/<id>/           # 游戏数据包（manifest.json + data/*，不入公开仓库）
├── server/               # 云存档/成就/排行 API（Node 零依赖 + SQLite）
├── tools/                # validate / smoke / balance / playall / 各单测 / publish-public
└── docs/                 # DESIGN-SPEC（v2 规范）与 REFACTOR_PLAN
```

## 六、氛围与语音

- `js/audio.js`：BGM（每游戏 `bgm` 字段，CC BY 4.0 音乐）+ WebAudio 程序化音效（打击/骰子/翻页/升级/死亡/鬼语），设置存 `tarpg:audio`。
- `js/voice.js`：mimo-voice-hub TTS（`/mimo` 代理同源访问，`tools/serve.py` 提供），模式 off/manual/auto，设置存 `tarpg:voice`；失败回退 speechSynthesis。
- 氛围细节：d100 检定浮骰动画、战斗受击屏震、低血量（≤30%）红色晕影、打字机模式、场景 📢 朗读按钮。
- 校验器含「全旗标放开 BFS」：无视一切条件后仍无法到达的场景会报错，专抓支线断链。

## 七、验收流程

1. `node tools/validate.js`：场景死链/死路、物品/敌人/技能引用、可达性全绿。
2. Playwright 自动通玩 9 个游戏（含战斗/检定/存档读档），零控制台报错。
3. 截图视觉验收（桌面+手机宽度）。
4. 三轮 project-optimize 迭代（代码 review → 优化实施 → 回归验证）。
