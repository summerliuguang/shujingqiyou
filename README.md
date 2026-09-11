# 书境奇游 · 文字冒险游戏平台

一套引擎 + 多个数据包的文字冒险游戏平台（原生 JS ESM，零依赖、免构建）：
支持网文向（回合制战斗/修炼/境界突破/副本/NPC 好感/任务/成就）与
CoC 跑团向（d100 检定/SAN 值/线索手册）两种玩法体系。

**本仓库只包含平台引擎与工具**；各游戏的具体剧情数据包与 BGM 音频
不随仓库分发（见 `games/README.md` 与 `assets/music/README.md`），
你可以按数据包规范编写自己的游戏内容。

## 特性

- 引擎与内容彻底分离：换游戏只换数据包，引擎不感知任何具体游戏
- 声明式 DSL 编写剧情：场景/选项/条件/效果/战斗/检定/地图/结局/随机事件
- 两套玩法体系：回合制战斗 + 修炼突破（novel）｜d100 检定 + SAN + 线索（coc）
- 通用系统：背包/装备/地图出行/任务面板/线索手册/成就/副本连战/多结局收集
- 氛围：BGM、WebAudio 程序化音效、TTS 旁白（可选）、打字机/掷骰动画
- 存档：本地 localStorage（自动 + 3 手动槽 + 导出导入）；可选云同步
- 云同步（可选增值层）：SSO 认证 + SQLite 的极简 API，本地优先、时间戳取胜、
  离线静默降级——**游玩本身零依赖后端**
- 工具链：数据校验（死链/死路/可达性 BFS）、无头随机通玩、战斗数值模拟、
  浏览器自动通玩门禁、存档迁移与同步单测

## 快速开始

```bash
python3 tools/serve.py 8321      # 静态服务 + TTS 代理（可选：node server/index.mjs 8322 开云同步 API）
# 浏览器打开 http://127.0.0.1:8321/
```

仓库默认没有游戏数据包——按 `games/README.md` 的目录约定放入自己的
数据包并运行 `node tools/mkregistry.mjs`，即可开始游玩。

## 测试与工具

| 命令 | 作用 |
|---|---|
| `node tools/validate.js` | 数据完整性（死链/死路/引用/重复 key/BFS 可达性） |
| `node tools/smoke.js` | 无头随机通玩 |
| `node tools/balance.js` | 战斗数值平衡模拟 |
| `node tools/test-migrate.mjs` | 存档 v1→v2 迁移单测 |
| `node tools/test-server.mjs` | 云存档 API 服务单测 |
| `node tools/test-sync.mjs` | 同步语义端到端单测 |
| `python3 tools/playall.py <url>` | 浏览器自动通玩门禁 |

设计与 DSL 详见 [DESIGN.md](DESIGN.md) 与 [docs/DESIGN-SPEC.md](docs/DESIGN-SPEC.md)。

## 部署形态（局域网自托管参考）

- 前端静态文件由 `tools/serve.py` 伺服（含 `/mimo/` TTS 反向代理，可选），
  nginx 29xxx HTTPS 反代 + systemd 常驻（模板见 `deploy/`，路径按实际环境修改）。
- 云同步 API：`server/index.mjs` 监听回环端口，认证转发 Cookie 到本机
  统一登录服务（应用层接入），数据库 SQLite（`server/data/`，已 gitignore）。

## 许可

- 代码：[MIT](LICENSE)
- 本仓库不包含任何小说/跑团模组改编数据与音频；你自行添加的内容
  （剧情数据包、BGM）的权利与合规由你自己负责，音频请遵守所选协议
  （如 CC BY 4.0 需保留署名）。
