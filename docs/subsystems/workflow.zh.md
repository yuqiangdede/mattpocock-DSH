# 工作流

[English](workflow.md) | 中文

工作流 seam 允许 agent（智能体）运行由模型编写、会启动 subagent 的编排脚本。与 [subagent](subagent.zh.md) 一样，它是**一项可选能力**，不属于 agent loop，因此其类型和操作记录在此处，而非 [core.md](core.zh.md)。与 bash 一样，每个上下文只允许一个引擎实现提供 `ctx.workflowEngine`；没有命名提供方注册表（第二个引擎通过插件配置替换第一个，而不与它同时运行）。

Service Definition：[dsh-workflow](../../packages/workflow/workflow)（`ctx.workflowEngine` 和下文词汇）。[dsh-workflow-ptc](../../packages/workflow/workflow-ptc)通过共享 Node PTC 进程运行时按调用 Session 的文件策略执行 VM 与辅助函数。消费方为 [dsh-tool-workflow](../../packages/workflow/tool-workflow) 和需显式启用的 [dsh-tool-ralph](../../packages/experimental/tool-ralph)。[工作流沙箱复用](../../.agents/notes/implemented/architecture/2026-09-13-workflow-ptc-sandbox-reuse.zh.md)负责执行选择；[动态工作流参考](../../packages/workflow/workflow/README.zh.md)负责脚本语义。

源码：浏览器安全词汇位于 [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts)，Host 请求与活跃运行句柄位于 [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts)。

本页同时记录 Fork 的分阶段编码工作流服务 [ctx.codingWorkflow](../../packages/workflow/coding-workflow/README.zh.md)。它不是编排引擎：一个 Host 服务为每个 Session 持有一个分阶段 Work Item，从需求直到一次本地提交，按真实仓库快照校验每次变更，并通过 Remote 暴露给 Launcher 的阶段面板。下面的生成小节描述其命令与 coding-workflow/changed 事件。

## 启动请求

本节定义调用方启动一次运行时提交的请求。普通工作流工具会根据模型的 `{ script, meta, args }` 调用和发起调用的 agent 构建该请求；专用消费方还可以为本次运行选择引擎级 `subagentProvider`，并将 `maxTotalAgents` 调低，但脚本无法观察或替换这两项策略。`meta` 与 `args` 是普通 JSON 数据；引擎会用 schema 校验 `meta`，并在任何工作开始前明确报错并拒绝无效数据。引擎绝不会通过对脚本文本求值来获取它们。`parent` 是必填字段——脚本启动的每个子 agent 都归属于它，cwd、谱系与深度通过 [subagent seam](subagent.zh.md) 传递。

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## 工作流的身份标识：`WorkflowMeta`

作为数据附在启动请求上的身份块（工具的 `meta` 参数；字段词汇与 Claude Code 动态工作流的 meta 块一致）。`phases` 仅用于进度展示：`phase()` 调用与标题匹配，供观察者使用；不暗示任何执行结构。

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## 终态结果：`WorkflowResult`

`WorkflowRun.result` 会兑现为一次运行的结果。`value` 是脚本的物化返回值——纯宿主域 JSON 数据（脚本无返回值时为 `null`）——仅在 `completed` 时有意义。`stopReason` 是封闭联合类型（由引擎定义；消费方可穷举）：`completed` | `cancelled` | `error`。非 `completed` 的原因在 `error` 中携带失败信息，消费方将其映射为 `isError` 工具结果，而非把部分输出当作成功上报。

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (cancellation or
   * process failure) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## 活跃运行：`WorkflowRun`

消费方等待 `result`，可以在执行期间调用 `cancel`，且必须在每条路径上调用 `dispose`（资源释放）。`result` 绝不拒绝：脚本失败以 `stopReason: 'error'` 兑现，取消以 `'cancelled'` 兑现。PTC 引擎没有整体经过时间截止；取消时立即中止受管进程。资源释放按照各提供方约定等待进程与子 agent 清理，不另设工作流清理截止。

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await script and child cleanup. */
  dispose(): Promise<void>
}
```

## 失败纪律：`WorkflowError.fatal`

脚本内部的钩子误用：错误参数、未知或延迟的 `agent()` 选项、超出[结构化输出子集](../../packages/core/tools/README.zh.md)的 schema、超出上限、seam 启动失败、取消，都会抛出 `fatal: true` 的 `WorkflowError`。`parallel()`/`pipeline()` 组合器对 fatal 错误直接重新抛出，而非将该项映射为 `null`：一个拼写错误的选项必须明确报错并终止脚本，绝不能消融为看似普通子 agent 失败的结果。逐项的 `null` 保留给子运行失败（非 `completed` 的 stop reason）和阶段内的普通脚本错误。

## 事件

`workflow/*` 事件（`workflow/start`、`workflow/phase`、`workflow/log`、`workflow/agent-start`、`workflow/agent-end`、`workflow/end`，见[事件目录](#cordis-surface)）是**仅供观察**的 emit，携带数据快照：每个 payload 以 `WorkflowRunInfo`（id + meta）开头，而非活跃的 `WorkflowRun`，因此订阅者无法获得 `cancel`/`dispose`；`workflow/end` 刻意省略 result value（观察结果的监听器不得收到调用方 result 的可变别名）。每次 emit 对每个监听器隔离：订阅者抛出的异常会被记录到日志中而不会传播，也不会阻止后续注册的监听器收到事件；每个监听器收到自己的 payload 克隆，因此修改它既不会损坏引擎也不会影响其他监听器。这种隔离方式与 `subagent/start`/`subagent/end` 一致。

## 持久 Chat 记录

顶层 `dsh-tool-workflow` 消费方把展示事实投影到调用它的父 Session，同时不改变执行所有权。运行接受后写 `tool-workflow/run-start`，以 `runId + seq` 配对成员开始与结束，并且只在结果已取得且 dispose 完全停稳后写 `tool-workflow/run-end`。嵌套 transport 调用不写记录。第一次 append 失败会禁用本运行后续写入，因此日志保持为空或合法连续前缀，工具结果不变。

该记录协议规定：每个运行只有一个 start，成员序号为正且唯一，成员 end 必须配对，仍有开放成员时不能结束运行，运行结束后不能继续更新。日志尾部缺少成员 end 或 run end 是有效的中断证据，不是损坏。

`dsh-client-ui-workflow-run` 通过 Conversation Node 引擎把四类事件折叠为一个 `workflow-run` Chat 节点，以 run-start 序号锚定在原工作流工具节点之后。阶段组只来自真正开始过的成员，并保留精确字符串，包括字段缺省与 `''` 的区别。Location 关闭时，缺失终点会显示为已中断。[界面包 README](../../packages/client/ui-workflow-run/README.zh.md)负责定义 disclosure、状态与同父本地导航行为。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcodingworkflow--codingworkflowservice"></a>

### `ctx.codingWorkflow` — `CodingWorkflowService`

Coding-workflow service (`ctx.codingWorkflow`).

```ts cordis-catalog
/**
 * Start one Work Item on a clean tree; a protected branch gets a new task branch.
 * @param agent - live owning Agent.
 * @param title - human task title.
 * @returns the created record.
 */
async start(agent: Agent, title: string): Promise<WorkItem>

/**
 * Read the Session's current Work Item.
 * @param agent - live owning Agent.
 * @returns the newest unfinished record, else the newest record, else null.
 */
@Remote('get') get(agent: Agent): WorkItem | null

/**
 * Read the Session's current unfinished Work Item without validating liveness.
 * The synchronous tool guard uses this path.
 * @param agent - calling Agent.
 * @returns the unfinished record, or null when the Session owns none.
 */
inspect(agent: Agent): WorkItem | null

/**
 * Complete one evidence-only stage.
 * @param agent - live owning Agent.
 * @param request - stage and evidence path.
 * @returns the next record.
 */
async stage(agent: Agent, request: StageRequest): Promise<WorkItem>

/**
 * Accept the implementation plan's checks and allowed paths.
 * @param agent - live owning Agent.
 * @param request - plan evidence, checks, and allowed paths.
 * @returns the next record.
 */
async checks(agent: Agent, request: ChecksRequest): Promise<WorkItem>

/**
 * Record one structured review and route the task onward.
 * @param agent - live owning Agent.
 * @param request - review evidence and findings.
 * @returns the next record.
 */
async review(agent: Agent, request: ReviewRequest): Promise<WorkItem>

/**
 * Record one repair round after a failing review.
 * @param agent - live owning Agent.
 * @param evidencePath - repair evidence path.
 * @returns the next record.
 */
async repair(agent: Agent, evidencePath: string): Promise<WorkItem>

/**
 * Run one planned verification command and fold its outcome.
 * @param agent - live owning Agent.
 * @param request - planned kind and exact command.
 * @param signal - caller cancellation.
 * @returns the next record.
 */
async verify(agent: Agent, request: VerifyRequest, signal?: AbortSignal): Promise<WorkItem>

/**
 * Stage exactly the listed files and create the task's single local commit.
 * @param agent - live owning Agent.
 * @param request - exact files to commit.
 * @returns the record at S9.
 */
async commit(agent: Agent, request: CommitRequest): Promise<WorkItem>

/**
 * Pause further progress.
 * @param agent - live owning Agent.
 * @param taskId - task identity.
 * @param revision - expected revision.
 * @returns the paused record.
 */
@Remote('pause') pause(agent: Agent, taskId: TaskId, revision: number): Promise<WorkItem>

/**
 * Resume a paused, blocked, or ready task.
 * @param agent - live owning Agent.
 * @param taskId - task identity.
 * @param revision - expected revision.
 * @returns the runnable record.
 */
@Remote('resume') async resume(agent: Agent, taskId: TaskId, revision: number): Promise<WorkItem>

/**
 * Switch mode without resuming work.
 * @param agent - live owning Agent.
 * @param taskId - task identity.
 * @param revision - expected revision.
 * @param mode - requested mode.
 * @returns the paused record with the new mode.
 */
@Remote('setMode') setMode(agent: Agent, taskId: TaskId, revision: number, mode: WorkflowMode): Promise<WorkItem>

/**
 * Record a scoped human approval.
 * @param agent - live owning Agent.
 * @param taskId - task identity.
 * @param revision - expected revision.
 * @param decision - scoped decision text.
 * @returns the approved record.
 */
@Remote('approve') approve(agent: Agent, taskId: TaskId, revision: number, decision: string): Promise<WorkItem>

/**
 * Cancel a task permanently.
 * @param agent - live owning Agent.
 * @param taskId - task identity.
 * @param revision - expected revision.
 * @param reason - why the user cancelled.
 * @returns the cancelled record.
 */
@Remote('cancel') cancel(agent: Agent, taskId: TaskId, revision: number, reason: string): Promise<WorkItem>

/**
 * Ask a human for a scoped decision from the model path.
 * @param agent - live owning Agent.
 * @param reason - concrete reason and proposed recovery.
 * @returns the waiting record.
 */
async requestApproval(agent: Agent, reason: string): Promise<WorkItem>

/**
 * Stop a task on an unrecoverable condition from the model path.
 * @param agent - live owning Agent.
 * @param reason - concrete reason and proposed recovery.
 * @returns the blocked record.
 */
async block(agent: Agent, reason: string): Promise<WorkItem>

/**
 * Switch the current task's mode from the model path.
 * @param agent - live owning Agent.
 * @param mode - requested mode.
 * @returns the paused record with the new mode.
 */
async updateMode(agent: Agent, mode: WorkflowMode): Promise<WorkItem>

/**
 * Pause the current task from the model path.
 * @param agent - live owning Agent.
 * @returns the paused record.
 */
async pauseCurrent(agent: Agent): Promise<WorkItem>

/**
 * Resume the current task from the model path.
 * @param agent - live owning Agent.
 * @returns the runnable record.
 */
async resumeCurrent(agent: Agent): Promise<WorkItem>

/**
 * Cancel the current task from the model path.
 * @param agent - live owning Agent.
 * @param reason - why the task is cancelled.
 * @returns the cancelled record.
 */
async cancelCurrent(agent: Agent, reason: string): Promise<WorkItem>

/**
 * Approve the current task's pending human decision from the model path.
 * @param agent - live owning Agent.
 * @param decision - scoped decision text.
 * @returns the approved record.
 */
async approveCurrent(agent: Agent, decision: string): Promise<WorkItem>
```

Types: [Agent](core.zh.md)

Source: [`packages/workflow/coding-workflow/src/index.ts`](../../packages/workflow/coding-workflow/src/index.ts)

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, and disposal waits for script and child cleanup. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="coding-workflow-events"></a>

### `coding-workflow/*` events

<a id="coding-workflowchanged--emit"></a>

#### `coding-workflow/changed` — emit

One accepted Work Item mutation.

```ts cordis-catalog
/**
 * One accepted Work Item mutation.
 * @mode emit
 * @param payload - session, task, and the new stage/status.
 */
'coding-workflow/changed'(payload: CodingWorkflowChanged): void
```

Source: [`packages/workflow/coding-workflow/src/types.ts`](../../packages/workflow/coding-workflow/src/types.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->
