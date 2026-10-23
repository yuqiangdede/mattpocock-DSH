---
description: "Host 权威的分阶段编码工作流服务及其面向模型的工具，供运行受门禁约束的实现—走读—验证—提交任务的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-coding-workflow

[English](README.md) | 中文

## 概述

`dsh-coding-workflow` 运行一项从需求到单次本地提交的分阶段编码任务。Work Item 由 Host 权威持有：每个阶段记录证据，实现必须落在显式规划的文件清单内，走读与验证绑定到它们实际观察到的源码指纹，提交只暂存该指纹覆盖的文件。模型通过 `coding_workflow` 工具推进任务；Web Client 通过其 Remote 命名空间读取同一条记录。本包不做 push、合并或远程写入。当任务需要留下“已走读、确实构建过”的可审计证据时选用本包；探索性改动不要使用。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延迟工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在需要让某个 Session 领取编码任务时挂载本包。它会注册 `ctx.codingWorkflow` 服务、打开 `coding_workflow` 存储域，并在同一 Context 上注册面向模型的 `coding_workflow` 工具。

```yaml
- name: '@deepseek-ai/dsh-coding-workflow'
  config:
    verificationTimeoutMs: 1800000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `verificationTimeoutMs` | 1800000 | 单条已登记验证命令的时限。 |

该服务依赖 `storageDomain`、`agents` 与 `workingDirectory`；存储行（`dsh-storage`、某个后端、`dsh-storage-domain`）必须先于它挂载。

### 任务生命周期

`start` 拒绝脏工作区、占用当前分支，并在 `main` 或 `master` 上自动创建 `coding/<id>` 分支。创建时 S0 已完成。S1–S4 与 S9 接受证据文件；`checks` 在 S3 与 S4 之间接受计划命令与精确允许路径。S5 记录结构化问题，S6 记录一轮修复，S7 逐条运行计划命令并要求变更指纹保持不变，S8 是唯一一次本地提交，S9 记录交付报告。同一 Session 或同一分支上的第二个未完成任务会被拒绝；每次变更都递增 `revision`，过期调用方会失败而不是覆盖。

### 失败与恢复

与仓库不再匹配的阶段（`Branch changed`、`HEAD changed outside workflow`）会拒绝继续而不是猜测。连续两次走读报告相同阻断问题会停止任务，第 4 轮修复同样停止。验证失败或观察到源码变化会在 S7 阻塞任务。切换模式会暂停任务；恢复时会重新校验分支与 HEAD。

-----

<a id="understand-the-implementation"></a>
## 理解实现

- [`src/domain.ts`](src/domain.ts) 是纯状态机：`applyStage`、`applyReview`、`applyRepair`、`applyVerification`、`recordCommit` 以及人工决策动词。它接收 `RepositorySnapshot` 并返回新记录，因此每条规则都能脱离 Git 测试。
- [`src/repository.ts`](src/repository.ts) 负责仓库副作用：快照与指纹、证据哈希、验证运行，以及唯一一次精确文件提交。
- [`src/spec.ts`](src/spec.ts) 声明持久化 `coding-workflow` 域（`workItems`，每个任务一条记录）以及校验存储格式的 zod schema。
- [`src/index.ts`](src/index.ts) 是服务：打开域、解析 Session 目录、每次调用应用一次变更，并在每次被接受的变更后发出 `coding-workflow/changed`。
- [`src/tool.ts`](src/tool.ts) 是面向模型的 `coding_workflow` 工具；每个动词都委托给服务。
- [`src/guard.ts`](src/guard.ts) 是单调工具守卫：任务进行中拦截直接 Git 变更；任务等待人工决定时拒绝仓库写入；把 `write`/`edit` 路径限制在计划实现范围内。

持久记录属于产品状态而非会话历史：它存放在共享存储后端而不是会话日志中，因此重启后仍可读取且不改变会话格式。

-----

<a id="model-experience"></a>
## 模型体验

### `coding_workflow` 工具

#### 模型看到什么

一个工具 `coding_workflow`，使用扁平动词 schema（`start`、`status`、`stage`、`checks`、`review`、`repair`、`verify`、`commit`、`mode`、`pause`、`resume`、`approval`、`approve`、`block`、`cancel`）。每次结果携带任务标识、`revision`、状态、当前阶段、模式、分支、提交引用、阻塞原因、十个阶段状态以及下一步预期动词。

#### Token 影响

工具描述约 90 token；单次调用结果不足 150 token。证据与验证输出留在文件中而不进入转录；记录本身从不进入请求。

#### KV Cache 影响

自身无影响：工具 schema 属于稳定的工具目录，记录按调用返回而不是注入提示词。模式或阶段变化不会重写更早的请求前缀。

## 已知限制与延迟工作

<a id="known-limitations-and-deferred-work"></a>

- **守卫覆盖工具调用而非 shell 内容** — 已注册守卫会通过 `write`、`edit`、`bash`、`pwsh` 拒绝直接 Git 变更与计划范围外的写入；但由 shell 启动的程序写文件，只会在走读与验证阶段由其变更集被发现。
- **仅进程内写入** — 存储域只在一个 Host 进程内串行化写入；两个 Host 进程写同一 Work Item 不会协同，`revision` 比较交换是唯一的冲突检测。
- **设计上没有 push 路径** — 本包没有任何执行 fetch、push、合并或创建 PR 的动词。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

`src/domain.ts` 中的纯状态机对应 `docs/fork/coding-workflow-requirements-v1.zh.md` 的验收契约；两者一起修改。

</details>
