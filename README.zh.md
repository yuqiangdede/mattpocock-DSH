# mattpocock-DSH

中文 | [English](README.md)

基于 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的个人定制 Fork，重点是**把工程 Skills 变成桌面端可配置的操作入口，并为 Windows 内网使用预集成常用插件**。

本 README 只介绍 **mattpocock-DSH 自行实现或适配的部分**。DSH 框架本身的功能、第三方插件和 Matt Pocock 的 Skills 均为外部项目，下面统一提供原项目链接，避免混淆成果归属。本仓库不是 DeepSeek 官方发行版。

## 本项目做了什么

### 1. Skill Launcher：桌面编码工作流快捷入口

在对话输入区上方增加可配置的快捷按钮，把工程活动拆成明确、相互独立的操作：

- 默认直接显示**需求讨论、固化需求、开发、Bug 排查、代码审查、修复审核问题、编译、提交代码**；其余启用的按钮统一放进「更多」。
- 支持按钮启用/停用、排序、快捷栏显示、修改提示词，以及配置导入、导出；设置保存在 DSH Host Settings 中。
- Skill 按钮插入对应的 `/skill-name`，普通按钮插入提示词；**由用户确认并发送**，不会因点击按钮就自动执行 Agent 工作。
- 提示词严格分阶段：需求讨论不写代码，审查只列问题，修复只处理已有问题，编译只验证，提交不自动编译或推送。
- 基于**当前会话最新已完成的对话**推荐并高亮可能的下一步；选择「修复审核问题」时，将有限长度的上一轮审查摘录加入可编辑草稿，供 Agent 核对后处理。这不是权威任务状态，也不等于自动完成修复。
- 兼容项目级 `.dsh/skills`，提供部分可视化需求讨论和自定义文档 Skills 的入口。

实现与操作说明：[Skill Launcher 插件](packages/client/ui-matt-skill-launcher/README.zh.md) · [快捷栏设置](docs/fork/skill-launcher-buttons.zh.md)。

### 2. Windows 桌面版的离线插件打包

项目扩展了 Windows x64 构建流程：**在联网构建机下载、固定版本并校验第三方插件，随后把插件及运行依赖放入安装包**。已安装的客户端不需要再次访问 npm/GitHub 下载这几款插件。

| 预装组件（外部项目） | 锁定版本 | 本 Fork 的集成工作 |
|---|---|---|
| [dsh-side-chat-plus](https://github.com/heartmove/dsh-side-chat) | `0.5.0` | 随安装包预装侧边聊天，初始化 Desktop Profile 时接入；[集成说明](docs/fork/offline-side-chat.zh.md) |
| [DSH Desktop Operator](https://github.com/zjh02249/dsh-desktop-operator) | `0.12.1` | 预装 Computer Use 运行时和 `desktop-computer-use` 预设；**标准 Agent 预设仍是默认**，需主动选择 Computer Use；[集成说明](docs/fork/offline-computer-use.zh.md) |
| [dsh-llm-retry-settings](https://github.com/zeng6125-rgb/dsh-llm-retry-settings) | `0.1.18` | 预装模型重试设置；默认不启用重试策略覆盖，需用户打开；[集成说明](docs/fork/offline-llm-retry.zh.md) |

上述插件的功能由各自的外部作者实现；**本 Fork 实现的是打包、版本锁定、哈希校验、Profile 集成和离线部署适配**。版本及校验值集中维护在 [`apps/desktop/src/bundled-plugins.ts`](apps/desktop/src/bundled-plugins.ts)。手动停用与用户现有的配置应得到保留。

**离线安装 ≠ 离线模型推理**：在内网使用时仍须提供可访问的模型 API；Computer Use 还需兼容图像输入的模型，并在 Windows 实机验证安全确认及 GUI 操作链路。自动化构建/冒烟测试不能代替实际内网验收。

### 3. 其他 Fork 改动

- **Mermaid 图表展示**：在 DSH 对话渲染中增加 Mermaid 代码块的 SVG 图表展示与失败回退；图表语法与渲染能力来自 [Mermaid](https://github.com/mermaid-js/mermaid)，交互接线由本 Fork 适配。
- **Windows 优先的 CI**：精简不需要的跨平台及文档类 GitHub Actions 检查，侧重本项目使用的 Windows 构建流程。
- **工程文档 Skills**：维护一组面向需求、设计、接口和 Word 交付的自定义 Skills；详见下方目录。

## Skills 来源与链接

### 从 Matt Pocock 引入的 19 个 Skills

来源：[mattpocock/skills](https://github.com/mattpocock/skills)。下列链接指向**上游原始 `SKILL.md`**，并固定到本仓库记录的引入版本；本 Fork 将所选 Skills 及配套文件放入 `.dsh/skills` 并适配快捷按钮，不将这些 Skills 宣称为本项目原创。

| 上游 Skill | 用途 |
|---|---|
| [`ask-matt`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/ask-matt/SKILL.md) | 咨询 |
| [`code-review`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/code-review/SKILL.md) | 代码审查 |
| [`codebase-design`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/codebase-design/SKILL.md) | 代码库设计 |
| [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/diagnosing-bugs/SKILL.md) | Bug 排查 |
| [`domain-modeling`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/domain-modeling/SKILL.md) | 领域建模 |
| [`grill-with-docs`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/grill-with-docs/SKILL.md) | 基于文档的讨论 |
| [`implement`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/implement/SKILL.md) | 开发实现 |
| [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/improve-codebase-architecture/SKILL.md) | 架构优化 |
| [`pr`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/pr/SKILL.md) | PR 工作流 |
| [`prototype`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/prototype/SKILL.md) | 原型验证 |
| [`research`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/research/SKILL.md) | 技术研究 |
| [`retro`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/retro/SKILL.md) | 复盘 |
| [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/setup-matt-pocock-skills/SKILL.md) | Skills 初始化 |
| [`tdd`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/tdd/SKILL.md) | 测试驱动开发 |
| [`to-spec`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-spec/SKILL.md) | 需求规格整理 |
| [`to-tickets`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-tickets/SKILL.md) | 工单拆分 |
| [`grilling`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grilling/SKILL.md) | 需求追问 |
| [`handoff`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/handoff/SKILL.md) | 上下文交接 |
| [`writing-for-agents`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/writing-for-agents/SKILL.md) | 面向 Agent 的写作 |

来源版本：[`matt-source.json`](.dsh/skills/matt-source.json) · [上游 Skills 主页](https://github.com/mattpocock/skills) · [本地使用的 Skill 目录](.dsh/skills/)。

### 本 Fork 维护的 9 个 Skills

以下链接是**本仓库自己的 `SKILL.md`**，用于工程文档和交互扩展：

| 本项目 Skill | 用途 |
|---|---|
| [`api-integration-docs`](.dsh/skills/api-integration-docs/SKILL.md) | 源码反推可对接接口文档 |
| [`component-doc-merge`](.dsh/skills/component-doc-merge/SKILL.md) | 组件接口文档融合 |
| [`database-design-doc`](.dsh/skills/database-design-doc/SKILL.md) | 数据库设计说明 |
| [`grill-with-ui`](.dsh/skills/grill-with-ui/SKILL.md) | 可视化需求讨论 |
| [`markdown-to-docx`](.dsh/skills/markdown-to-docx/SKILL.md) | Markdown 转 Word 与内容校验 |
| [`outline-design`](.dsh/skills/outline-design/SKILL.md) | 概要设计文档 |
| [`overall-design`](.dsh/skills/overall-design/SKILL.md) | 总体设计文档 |
| [`requirements-spec`](.dsh/skills/requirements-spec/SKILL.md) | 需求规格与源码反推 |
| [`pocket-maintenance`](.dsh/skills/pocket-maintenance/SKILL.md) | 审计、合并与精简过时、重复和冲突的 Pocket 文档 |

## 项目 Pocket 知识库（可选）

在**目标项目仓库**中运行现有 `/setup-matt-pocock-skills`。本 Fork 为其增加少量初始化规则，显式采用上游 `writing-for-agents` 方法，并生成纳入 Git 管理的 `docs/pocket/` 知识索引。Agent 仅保留简短入口指针，根据任务逐级读取相关文档，不要求 RAG。重要需求或架构变化后以及建议的每月人工巡检中，可运行 `/pocket-maintenance` 检查重复、失效、冲突资料并提出合并与归档方案。两项 Skill 均需用户主动发送，不会悄悄修改现有权威文档，也不创建定时后台任务。本 Fork 仅对导入的 `setup-matt-pocock-skills` 增加简短规则，具体模板放在 `.dsh/skills/_shared/POCKET_SETUP.md`，后续同步上游需要保留或重新应用这部分差异；其他上游 Skills 保持原样，仍会沿用旧输出路径，可能需要另行迁移。

如果此前用 `scripts/install-coding-skills.mjs` 安装过这些 Skill，使用 Pocket 前请加 `--overwrite` 重新安装：已存在的 Skill 目录默认会被跳过，而用户目录副本的优先级高于桌面内置副本，否则运行的仍是旧版初始化提示词。

## 源码构建与使用

本仓库沿用 DSH 的构建工具链，需要符合 [`package.json`](package.json) 约束的 Node.js 与 pnpm。基础开发命令：

```powershell
pnpm install
pnpm run build
pnpm run dev:desktop
```

Windows x64 安装包（未签名构建）：

```powershell
pnpm run package:desktop:win:x64:unsigned
```

打包阶段需要网络访问依赖和固定的第三方发行包；**生成安装包后**，上述第三方插件运行不依赖在线下载。正式交付前应通过 Windows 构建和断网实机验证。此处命令是本 Fork 的源码构建方式，不等于安装官方 DSH。

## 上游、文档与授权

- **核心框架**：[DeepSeek Harness 源码](https://github.com/deepseek-ai/deepseek-harness) · [官方文档](https://deepseek-harness.github.io/deepseek-harness/) · [上游开发说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- **外部 Skills**：[Matt Pocock Skills](https://github.com/mattpocock/skills)；引入版本与选定名单见 [`matt-source.json`](.dsh/skills/matt-source.json)
- **预装第三方插件**：上表的各原作者仓库及各自许可证；这里仅提供链接与 Fork 的集成说明
- **许可证与声明**：[本仓库 LICENSE](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md) · [Matt Skills 许可证](.dsh/skills/MATT-LICENSE)
- **使用前须知**：[安全说明](SAFETY.zh.md)；DSH 仍可能发生破坏兼容性的上游更新，Fork 同步上游后应验证本地扩展

有关原生 DSH 的功能介绍、API 和完整开发文档，请以**上游官方仓库**为准；本 README 不重复复制上游说明。
