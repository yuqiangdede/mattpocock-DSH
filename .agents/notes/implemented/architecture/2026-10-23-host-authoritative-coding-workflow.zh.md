# Agent Note：Host 权威的编码工作流

Status: implemented

[English](2026-10-23-host-authoritative-coding-workflow.md) | 中文

## Problem

双模式编码工作流最初把分阶段任务记录写入由 Skill 本地 CLI 维护的 JSON 文件。这带来两个后果，使记录无法作为产品状态使用。Client 读不到它：Web 用户只能看到原生 Goal 阶段，看不到任务累积的阶段、待处理审批与证据。并且记录在 Harness 内没有所有者：任何找到该文件的进程都能改写它，工作流除了这台机器上的一个路径外没有持久存储，评审者也无法区分权威变更与直接改文件。

仓库禁止最直接的修法。由插件追加新的 `SessionEventMap` 成员并不安全：实时 `Session.append()` 无法写入让旧读取器重开会话日志所需的 `ignorable` 标记，而 `appendPluginRecord()` 保留给 `packages/experimental/`。插件自有持久数据的受认可替代方案是从既有事件推导状态，或存放在存储服务中；而本状态若从对话事件推导，就意味着要解释模型散文。

## Decision

**Work Item 是存储域中的 Host 产品状态，由一个服务拥有全部变更。** `packages/workflow/coding-workflow` 打开 `coding_workflow` 域，每个任务一条 `work_items` 记录。`CodingWorkflowService`（`ctx.codingWorkflow`）是唯一写入者：它解析 Session 的工作目录、读取仓库快照、应用一个纯变更函数并保存新版本。模型通过 `coding_workflow` 工具驱动它，工具的每个动词都委托给服务而不是编辑文件；Web Client 通过服务的 Remote 命名空间读取同一条记录，并在每次被接受的变更后收到 `coding-workflow/changed`。

**每个门禁校验仓库事实，而不是调用方的声明。** `src/domain.ts` 把变更实现为接收 `RepositorySnapshot` 的纯函数：分支与 HEAD 必须仍是任务声称的值；实现文件必须在计划允许路径内；走读与验证冻结它们观察到的变更集指纹；唯一一次本地提交必须重新校验每份已记录证据的摘要后，只暂存该指纹覆盖的文件。验证会运行计划命令并比较运行前后的快照，因此改变工作树的构建无法通过。

**工具守卫才是强制点，而不是提示词。** `src/guard.ts` 注册 `ctx.tools.guard()`：任务拥有工作区时，`bash`/`pwsh` 不得执行 `commit`、`push`、`reset`、`checkout`、`rebase`、`merge`；`write`/`edit` 不得指向计划范围外的文件；任务在等待人工决定时不得开始任何仓库变更。守卫是单调且同步的，任何后续监听器或提示词都无法把拒绝改回允许。由 shell 启动的程序写文件不在此检查内；其变更集才是走读与验证观察的对象。

## Verification

三十个测试覆盖纯变更函数、守卫判定以及基于真实存储与真实 Git 的服务：完整的 S1–S9 运行（含精确文件提交）、脏工作树与分支占用拒绝、越界变更与过期版本、模式暂停，以及重启后读取已持久记录且不推进它。`pnpm run typecheck` 与 `pnpm run build`（九个 gate）通过，Windows CI 覆盖构建、离线回放与桌面打包路径。

## Consequences

记录现在能在 Host 重启、Client 重载以及没有活动 Agent 的 Session 中存活，因为它存放在任务旁边而不是某段对话内部。只读取 Remote 的客户端看到与模型相同的阶段、阻塞与审批；任一侧的变更都携带它读到的版本，第二个写入者会失败而不是覆盖。

记录不再依附会话日志，因此没有会话格式版本与迁移负担。代价是记录不随会话重放：fork 出的 Session 不会带上源任务的 Work Item，存储是检查该任务的唯一入口。命令集合刻意只在本地：没有任何执行 fetch、push、合并或创建 PR 的动词，提交是唯一一次不触达远端的副作用。

守卫是工具调用层面的强制，而不是对 shell 启动的任意程序的强制。变更集仍然是走读与验证观察的对象，因此通过编译产物写文件的提供方会在 S5/S7 被发现，而不是在调用边界被拦截。

## Alternatives considered

**追加新的会话事件类型。** 否决：旧读取器会遇到无法解释的事件；让未知事件可跳过的信封标记无法在实时追加中写入，而为 Fork 私有记录提升格式版本会加重每个上游消费者的负担。

**保留 CLI 文件为权威，并镜像到存储供 Client 读取。** 否决：两个写入者会在同一任务上竞争，UI 展示的是权威从未确认的投影；只有当单一所有者计算每次变更时，版本比较交换才有意义。

**由 Client 写入记录。** 否决：Client 无法读取 Git 或执行验证，浏览器作出的“构建确实运行过”的判断不是证据。

**把工具挂在 Agent preset 中而不是全局注册。** 这符合 goal 工具对 Host 平面状态的先例，但本服务在拥有它的 Context 上注册工具，因此挂载服务的每个 profile 都获得同一组动词；preset 级副本会让会话的工具与服务状态对“哪个任务是当前任务”各执一词。
