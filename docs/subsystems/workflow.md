# Workflow

English | [中文](workflow.zh.md)

The workflow seam lets an agent run a model-written orchestration SCRIPT that starts subagents. Like [subagent](subagent.md) it is **one optional capability**, not part of the agent loop, so its types and operations live here rather than in [core.md](core.md). Like bash, it permits ONE engine implementation per context to provide `ctx.workflowEngine`; there is no named-provider registry (a second engine replaces the first through plugin configuration rather than running beside it).

Service Definition: [dsh-workflow](../../packages/workflow/workflow) (`ctx.workflowEngine` and the vocabulary below). [dsh-workflow-ptc](../../packages/workflow/workflow-ptc) executes the VM and helpers through the shared Node PTC process runtime under the calling Session's file policy. The consumers are [dsh-tool-workflow](../../packages/workflow/tool-workflow) and the opt-in [dsh-tool-ralph](../../packages/experimental/tool-ralph). [Workflow sandbox reuse](../../.agents/notes/implemented/architecture/2026-09-13-workflow-ptc-sandbox-reuse.md) owns execution choices; the [dynamic-workflows reference](../../packages/workflow/workflow/README.md) owns script semantics.

Sources: browser-safe vocabulary in [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts), Host request and live-run handles in [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts).

The same page documents the Fork's staged coding workflow service, [`ctx.codingWorkflow`](../../packages/workflow/coding-workflow/README.md). It is not an orchestration engine: one Host service owns one staged Work Item per Session, from requirements through a single local commit, validates every transition against a real repository snapshot, and exposes a Remote for the launcher's stage panel. The generated sections below describe its commands and the `coding-workflow/changed` event.

## The start request

What a caller asks for when starting a run. The ordinary workflow tool builds this from the model's `{ script, meta, args }` call plus the calling agent; specialized consumers may also select one engine-wide `subagentProvider` and lower `maxTotalAgents` for the run, but the script cannot observe or replace either policy. `meta` and `args` are plain JSON DATA (the engine validates `meta` against its schema and rejects loud BEFORE anything runs — no script text is ever evaluated to obtain it). `parent` is REQUIRED — every child the script starts is attributed to it, and cwd, lineage, and depth pass through the [subagent seam](subagent.md).

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

## The workflow's identity: `WorkflowMeta`

The identity block carried as data on the start request (the tool's `meta` parameter; the field vocabulary matches the Claude Code dynamic-workflows meta block). `phases` is progress vocabulary only: `phase()` calls match titles for observers; no execution structure is implied.

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

## The terminal result: `WorkflowResult`

The outcome of one run, resolved by `WorkflowRun.result`. `value` is the script's materialized return value — plain host-realm JSON data (`null` when the script returned nothing) — meaningful only for `completed`. `stopReason` is a CLOSED union (engine-owned; consumers may exhaust it): `completed` | `cancelled` | `error`. A non-`completed` reason carries the failure in `error`, and the consumer maps it to an `isError` tool result rather than reporting partial output as success.

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

## A live run: `WorkflowRun`

The consumer awaits `result`, may `cancel` during execution, and must `dispose` on every path. `result` never rejects: script failure resolves with `stopReason: 'error'`, and cancellation with `'cancelled'`. The PTC engine has no overall elapsed deadline; it immediately aborts the managed process when cancelled. Disposal awaits process and child cleanup under their provider contracts, without an independent workflow cleanup deadline.

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

## Failure discipline: `WorkflowError.fatal`

Hook misuse inside a script — bad arguments, unknown/deferred `agent()` options, a schema outside the [structured-output subset](../../packages/core/tools/README.md), a tripped cap, a seam start failure, cancellation — throws a `WorkflowError` with `fatal: true`. The `parallel()`/`pipeline()` combinators RE-THROW fatal errors instead of mapping the item to `null`: a typo'd option must kill the script loudly, never dissolve into something that reads as an ordinary child failure. The per-item `null` is reserved for child-run failures (a non-`completed` stop reason) and ordinary in-stage script errors.

## Events

The `workflow/*` events (`workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` — see the [events catalog](#cordis-surface)) are **observe-only** emits carrying DATA SNAPSHOTS: every payload starts with `WorkflowRunInfo` (id + meta), never the live `WorkflowRun`, so a subscriber cannot gain `cancel`/`dispose`, and `workflow/end` deliberately omits the result value (a listener observing outcomes must not receive a mutable alias of the caller's result). Every emit is per-listener contained — a throwing subscriber is logged, never propagated, and cannot starve the listeners registered after it — and every listener receives its own payload clone, so mutating it corrupts neither the engine nor other listeners; the containment mirrors `subagent/start`/`subagent/end`.

## Durable Chat records

The top-level `dsh-tool-workflow` consumer projects display facts into its calling parent Session without changing execution ownership. It writes `tool-workflow/run-start` after a run is accepted, pairs member start and end by `runId + seq`, and writes `tool-workflow/run-end` only after the result is known and disposal reaches quiescence. Nested transport calls write no record. The first append failure disables later writes for that run, so the log remains empty or a legal continuous prefix and the tool result is unchanged.

The record protocol allows one start per run, positive unique member sequences, paired member endings, no run ending with open members, and no updates after the run ending. A missing member ending or run ending at the log tail is valid interruption evidence rather than corruption.

`dsh-client-ui-workflow-run` folds the four events through the Conversation Node engine into one `workflow-run` Chat node anchored at the run-start sequence, after the original workflow tool node. Phase groups come only from actual member starts and preserve exact strings, including the distinction between an omitted phase and `''`. Closed Locations turn missing terminal facts into interrupted presentation. The [UI package README](../../packages/client/ui-workflow-run/README.md) owns disclosure, status, and same-parent local navigation behavior.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Agent](core.md)

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
