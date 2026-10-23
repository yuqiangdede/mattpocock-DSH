---
description: "Fork-maintained Skill and prompt buttons with versioned Host settings."
kind: "package-reference"
---

# mattpocock-DSH / Skill Launcher

[English](README.md) | 中文

## 概述

这是 Fork 专有的第一阶段扩展，与 DSH Agent Loop 和 Session 存储独立。

## 目录

- [行为](#behavior)
- [构建和运行](#build-and-run)
- [模型体验](#model-experience)
- [已知限制和延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="behavior"></a>
## 行为

- Composer 上方只有一行快捷按钮：设置中勾选显示的按钮直接排列，其余启用的按钮收在单个「更多」按钮内，点击「更多」展开或收起列表。
- 八个预设默认显示：需求讨论、固化需求、开发、Bug 排查、代码审查、修复审核问题、编译和提交代码。显示的按钮不会在「更多」中重复。显示与否只决定按钮出现的位置；要在所有位置关闭按钮，使用「启用」开关。
- 每个内置按钮的提示词限定单一阶段：需求讨论不写代码，开发不做代码审查或完整编译，代码审查不改代码，修复审核问题不重新审查，编译与提交不修改业务代码。悬浮提示省略固定标签，直接说明适用范围、边界和示例。
- 咨询、拆分工单和开发分别使用 `ask-matt`、`to-tickets`、`implement`。其他 Skills 包括领域建模、资料研究、复盘和上下文交接；交互提示词排在最后。
- 读取版本 1 配置时更新未修改的默认字段并补入六个新操作，保留自定义字段、禁用状态和刻意留空的列表；删除未定制的重复任务拆分预设，保留定制过的副本。保存或导出使用版本 3，其中的操作可以带 `pinned` 标记，表示直接显示；版本 2 客户端保存时会丢弃未知操作字段，因此会拒绝版本 3 而不是丢失显示设置。本客户端保存的文档省略已停用的 `group` 字段，读取旧文档时也会忽略它。之后主动删除的按钮不再自动补回。
- Skill 按钮在插入 /skill-name 之前，查询*当前有效 Session* 的 Skill 目录。用户明确发送后，DSH 才确定性地加载完整的 SKILL.md。
- 纯提示词按钮直接插入文本，不绑定 Skill。
- 原生 DSH Host Settings 持久化带版本的 CodingAction JSON，包括可编辑的名称、提示词、启停状态、显示标记、排序和帮助文本。设置页面支持导入和导出。
- 最新已完成对话明确显示下一步时，对应的启用按钮会高亮，并显示本地化的推荐说明。
- 除初始化外，每个内置操作都会向草稿加入接手要求。只有「修复审核问题」会附带上一段已完成对话的请求（最多 1,000 字符）和结果（最多 5,000 字符）作为汇总依据；截断会明确标记，摘录需与原始产物核对。其他按钮不复制对话内容，自定义操作不附加要求。由用户检查并发送草稿，Launcher 不会自动发送或执行。
- 推荐只分析最新一组已完成的用户请求与助手回复；不可用或已禁用的按钮不会被推荐。对话中断和明确错误可以推荐 Bug 排查或继续。

Skills 不会通过猜测或静默生成。应安装在 <DSH_HOME>/skills/<name>/SKILL.md 或当前项目的 .dsh/skills/<name>/SKILL.md。具体安装说明参见本 Fork 的文档。缺失 Skill 时显示非破坏性错误。

桌面包与 `scripts/install-coding-skills.mjs` 共用 `.dsh/skills` 源目录。选定的 skills 及配套文件来自 [Matt Pocock 的 skills](https://github.com/mattpocock/skills)，`.dsh/skills/matt-source.json` 记录来源版本。默认包保留 Fork 的文档类 skills，不包含 Superpowers skills。用户已安装的 skills 不会被删除；安装脚本默认跳过已有目录，显式使用 `--overwrite` 时保留备份。

接手方执行前核对实际工作区。推荐仅为基于文本的建议，不代表检查通过，也不授予提交或推送权限。

| 接手操作 | 所需上下文 |
|---|---|
| 需求讨论／固化需求 | 已确认需求、资料来源、范围、不做事项、验收标准和未决问题 |
| 拆分工单／开发 | 规格或工单引用、依赖、阻塞、验收检查和未完成项 |
| 代码审查／修复审核问题 | 审查基准与 diff、问题编号、优先级、文件位置、影响、验证要求及逐项状态 |
| 编译／提交代码 | 编译：实际检查记录，区分通过、失败、未执行和环境限制；提交：提交标识与按目录或模块分类的新增、删除行数，不重复执行编译或测试 |
| 制作原型／架构优化 | 设计问题或目标模块、约束、评价标准、产物和待讨论候选方案 |
| 领域建模／资料研究 | 模糊概念或研究问题、术语表或资料、结论和证据缺口 |
| 复盘／上下文交接／继续 | 原目标、决策、产物引用、检查、失败、未完成项、阻塞和下一步；交接移除敏感信息 |
| 文档生成／交互提示词 | 读者或页面要求、资料来源、确认范围、输出约束和校验结果 |

<a id="build-and-run"></a>
### 构建和运行
在仓库根目录使用上游构建命令（pnpm install、pnpm run build、pnpm run dev:desktop）。Fork 自有包已挂载在默认 Web/Desktop 客户端插件列表中。合并前必须测试真实 Electron 交互。

Launcher 使用 Workspace 包名 `@deepseek-ai/dsh-client-ui-matt-skill-launcher` 和统一的 DSH 版本，以便发布验证将其 tarball 与 Web bundle 一并提供。该 tarball 只包含构建后的 JavaScript 和声明文件。这一命名遵循现有发布工具要求，插件仍由本 Fork 维护。

<a id="model-experience"></a>
## 模型体验

### 用户提交的操作文本

#### 模型能看到什么

只有用户发送草稿后，选中的提示词才进入普通用户消息。DSH 负责展开明确的 `/skill-name` 命令；Launcher 不注册任何 Agent 工具或系统提示词。

#### Token 影响

提交的提示词以及任何 Skill 指令都会正常计入消息 Token。单纯点击按钮不会增加模型输入。

#### KV Cache 影响

Launcher 不改变已有的模型前缀。普通 Session 提交和 Skill 加载路径负责组装请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制和延期工作

- 推荐提示是基于文本的保守判断，不代表工作流阶段已被权威确认；不会搜索未加载或更早的历史消息。
- Windows Electron 交互、浏览器讨论结果写回、外部文档生成依赖均需要端到端验收。

<a id="dev-note"></a>
### 开发备注

本 Fork 独立于上游 Agent Loop 和 Session 存储维护此插件。

## Todo 进度滞后保护（Fork 插件）

本 Fork 在标准 / PTC Agent 预设中挂载 \`@deepseek-ai/dsh-client-ui-matt-skill-launcher/todo-progress-guard\`，它仅在同一 Agent 成功调用 \`todo_write\` 且仍有未完成项目时开始计数。后续超过 5 次工具调用且距离上次成功更新至少 90 秒时，向 Agent 注入一次核对提醒；冷却期为 90 秒。每个 Agent 独立计数，遇到新的用户轮次即清空。中断、错误、只做了文件编辑都不会被自动标为完成。

快捷栏的保守提示仅按当前界面观察到的 **Todo 状态变化** 计算，不能反推出 Host 实际 \`todo_write\` 时间；同内容重复写入不会重置显示计时。界面只在 Agent 正运行、Todo 尚有未完成项且状态至少 90 秒不变时显示提示，完成、空任务和闲置状态不显示。此设计避免将编辑记录伪装成完成率，不改变上游 \`TodoPanel\`、\`todo/write\` 或 Agent Loop。

守卫不会自己调用 \`todo_write\`，也不保证模型遵循提醒；若需要严格阶段完成保证，应由后续编码工作流的验收事件来驱动。新增插件通过既有 Fork 包构建并随 Windows/Desktop 离线安装包交付，改动集中在 Fork 包及预设挂载行；上游同步时留意标准 / PTC 预设对应的新增行。

验证重点：\`todo_write\` 成功→连续操作→超时提示；未达到双阈值不提示；反复提醒受冷却期约束；完成或新轮次清空；不同 Agent 隔离；断开或会话切换不串 UI 提示。
