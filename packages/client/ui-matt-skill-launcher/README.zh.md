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
- [开发说明](#dev-note)

<a id="behavior"></a>
## 行为

- 原生 Composer 上方显示开发流程、文档生成、辅助操作三组按钮及“更多”菜单；“需求讨论”“可视化讨论”独立并列，窗口较窄时自动换行。
- 旧配置按内置按钮 ID 兼容分组，已有用户自定义操作不被重置；在设置中手动补齐新增预设按钮并保存。
- Skill 按钮在插入 /skill-name 之前，查询*当前有效 Session* 的 Skill 目录。用户明确发送后，DSH 才确定性地加载完整的 SKILL.md。
- 纯提示词按钮直接插入文本，不绑定 Skill。
- 原生 DSH Host Settings 持久化带版本的 CodingAction JSON，包括可编辑的名称、提示词、启停状态、显示分组、排序和帮助文本。设置页面支持导入和导出。
- 最新已完成对话明确显示下一步时，对应的启用按钮会高亮，并显示本地化的推荐说明。
- 选择被推荐的操作时，会把上一条助手结果的限长摘录加入可编辑草稿；由用户检查并发送，Launcher 不会自动发送或执行。
- 推荐只分析最新一组已完成的用户请求与助手回复；不可用或已禁用的按钮不会被推荐。对话中断和明确错误可以推荐 Bug 排查或继续。

Skills 不会通过猜测或静默生成。应安装在 <DSH_HOME>/skills/<name>/SKILL.md 或当前项目的 .dsh/skills/<name>/SKILL.md。具体安装说明参见本 Fork 的文档。缺失 Skill 时显示非破坏性错误。

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
### 开发说明

本 Fork 独立于上游 Agent Loop 和 Session 存储维护此插件。
