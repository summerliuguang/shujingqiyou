# games/ —— 游戏数据包（本仓库不包含，需自行放置）

本目录在公开仓库中**留空**：各游戏的具体剧情数据（场景/选项/效果/
敌人/物品/结局文案）与 CoC 共享规则数据属于个人向改编内容，不随代码分发。
本目录内容（除本 README）已被 `.gitignore` 排除——把数据包放进这里
本地游玩不会误提交。

每个数据包的目录约定（引擎启动时按此加载）：

```
games/
├── registry.js          # 首页摘要注册表：mkregistry.mjs 本地生成（已 gitignore，勿提交）
├── _shared/coc/         # 可选：CoC 共享数据（技能表/职业/公共物品）
└── <game-id>/           # 一个游戏一个目录
    ├── manifest.json    # 元数据（id/type/title/theme/bgm/入口…）
    └── data/            # 声明式剧情数据
        ├── config.js    # 顶层标量与函数（createChar/realms/…）
        ├── scenes.js    # 场景图（title/text/choices/enter/explorePool）
        ├── maps.js  items.js  enemies.js  skills.js  endings.js
        └── index.js     # 组装 export default { ...def, scenes, ... }
```

放入自己的数据包后运行 `node tools/mkregistry.mjs` 生成 registry.js
（没有它引擎会以空库启动），刷新首页即可看到游戏卡片。
DSL 语法见 `docs/DESIGN-SPEC.md` 与 `DESIGN.md`。

> 自行编写的剧情内容请确保你拥有相应权利；本平台代码本身不包含任何
> 受版权保护的改编数据。
