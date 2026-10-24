/**
 * Host-authoritative service for coding-workflow Work Items. The service owns
 * the durable record, validates every transition against the actual repository,
 * runs registered verification commands, performs the single local commit, and
 * publishes one change event per accepted mutation.
 *
 * @module @deepseek-ai/dsh-coding-workflow
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { approveEscalation } from '@deepseek-ai/dsh-sandbox'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-working-directory'
import z from '@deepseek-ai/schemastery'
import {
  WorkflowError,
  applyChecks,
  applyRepair,
  applyReview,
  applySkip,
  applyStage,
  applyVerification,
  approve,
  block,
  cancel,
  createWorkItem,
  pause,
  recordCommit,
  requestApproval,
  requireCommitReady,
  requireCheckpoint,
  requirePrevious,
  requireScoped,
  requireWritable,
  resume,
  setMode,
} from './domain.ts'
import { codingWorkflowDomainSpec } from './spec.ts'
import type { WorkItemRecord } from './spec.ts'
import {
  LocalRepositoryRunner,
  commitExactly,
  createBranch,
  digest,
  isProtectedBranch,
  readEvidence,
  readSnapshot,
  runVerification,
  verifyEvidence,
} from './repository.ts'
import type { RepositoryRunner } from './repository.ts'
import { codingWorkflowGuard } from './guard.ts'
import { registerCodingWorkflowTool } from './tool.ts'
import type {
  CheckKind,
  CheckPlan,
  EvidenceRef,
  ReviewFinding,
  StageId,
  TaskId,
  VerificationRun,
  WorkItem,
  WorkflowMode,
} from './types.ts'

/** Quote one argv item for the composed POSIX shell or PowerShell executor. */
function quoteShellArgument(argument: string): string {
  return process.platform === 'win32'
    ? `'${argument.replaceAll("'", "''")}'`
    : `'${argument.replaceAll("'", "'\\''")}'`
}

/** Deployment settings of the workflow service. */
export interface Config {
  /** Deadline of one registered verification command. */
  verificationTimeoutMs?: number
}

/** Validated settings. */
export interface ResolvedConfig {
  /** Positive deadline of one registered verification command. */
  verificationTimeoutMs: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Authoritative coding-workflow service. */
    codingWorkflow: CodingWorkflowService
  }
}

/** Staged evidence a caller submits with one stage. */
export interface StageRequest {
  /** Stage to complete. */
  readonly stage: Extract<StageId, 'S1' | 'S2' | 'S3' | 'S4' | 'S9'>
  /** Workspace-relative or absolute evidence path. */
  readonly evidencePath: string
}

/** Request to skip one eligible stage with an explicit reason. */
export interface SkipRequest {
  /** Stage to skip ('S1' | 'S2'). */
  readonly stage: Extract<StageId, 'S1' | 'S2'>
  /** Concrete reason for skipping this stage. */
  readonly reason: string
}

/** Implementation plan accepted between S3 and S4. */
export interface ChecksRequest {
  /** Evidence of the accepted plan. */
  readonly evidencePath: string
  /** Planned checks, one per kind. */
  readonly checks: readonly CheckPlan[]
  /** Exact files implementation may touch. */
  readonly allowedPaths: readonly string[]
}

/** Review report submitted at S5. */
export interface ReviewRequest {
  /** Evidence of the review. */
  readonly evidencePath: string
  /** Structured findings. */
  readonly findings: readonly ReviewFinding[]
}

/** One verification command to run now. */
export interface VerifyRequest {
  /** Planned check kind. */
  readonly kind: CheckKind
  /** Exact planned command. */
  readonly command: readonly string[]
  /** Tool call that owns any sandbox escalation prompt. */
  readonly callId?: ToolCallId
}

/** Local commit request. */
export interface CommitRequest {
  /** Exact repository-relative files to commit. */
  readonly files: readonly string[]
}

/** Coding-workflow service (`ctx.codingWorkflow`). */
export class CodingWorkflowService extends TypertRemoteService {
  static inject = ['storageDomain', 'agents', 'workingDirectory', 'shell', 'sandboxPolicy']

  static Config: z<Config> = z.object({
    verificationTimeoutMs: z.number().default(30 * 60 * 1000),
  })

  private readonly resolved: ResolvedConfig
  private readonly runner: RepositoryRunner
  private table?: KvTable<TaskId, WorkItemRecord>

  /**
   * @param ctx - owning context.
   * @param config - optional deployment settings.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'codingWorkflow')
    if (ctx.shell.sandboxMode === undefined) {
      throw new Error('coding-workflow requires a sandboxing shell executor for verification commands')
    }
    const timeout = config.verificationTimeoutMs ?? 30 * 60 * 1000
    if (!Number.isSafeInteger(timeout) || timeout < 1000) {
      throw new Error('coding-workflow: verificationTimeoutMs must be an integer of at least 1000 ms')
    }
    this.resolved = { verificationTimeoutMs: timeout }
    this.runner = new LocalRepositoryRunner()
    ctx.inject(['tools'], (toolsCtx) => {
      toolsCtx.effect(() => registerCodingWorkflowTool(toolsCtx, this), 'codingWorkflow.tool')
      toolsCtx.effect(
        () => toolsCtx.tools.guard(codingWorkflowGuard(agent => this.inspect(agent))),
        'codingWorkflow.guard',
      )
    })
  }

  /** Open the durable domain and close it with the plugin. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(codingWorkflowDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'codingWorkflow.domainClose')
    this.table = domain.table('work_items')
  }

  /**
   * Start one Work Item on a clean tree; a protected branch gets a new task branch.
   * @param agent - live owning Agent.
   * @param title - human task title.
   * @returns the created record.
   */
  async start(agent: Agent, title: string): Promise<WorkItem> {
    this.assertLive(agent)
    const root = this.workspaceRoot(agent)
    const initial = await readSnapshot(this.runner, root)
    if (!initial.clean) throw new WorkflowError('Working tree is dirty; cannot claim existing changes', 'WORKFLOW_DIRTY_TREE')
    if (initial.branch.length === 0) throw new WorkflowError('Detached HEAD not supported', 'WORKFLOW_DETACHED_HEAD')
    const existing = [...this.requireTable().entries()]
      .map(([, item]) => item)
      .filter(item => !['completed', 'cancelled'].includes(item.status))
    const sameBranch = existing.find(item => item.workspaceRoot === root && item.branch === initial.branch)
    if (sameBranch !== undefined) {
      throw new WorkflowError(`An unfinished Work Item already owns this branch: ${sameBranch.taskId}`, 'WORKFLOW_BRANCH_OWNED')
    }
    const sameSession = existing.find(item => item.sessionId === agent.session.id)
    if (sameSession !== undefined) {
      throw new WorkflowError(`This Session already owns an unfinished Work Item: ${sameSession.taskId}`, 'WORKFLOW_SESSION_BUSY')
    }
    const taskId = brandString<TaskId>(randomUUID())
    let snapshot = initial
    if (isProtectedBranch(initial.branch)) {
      const branch = `coding/${taskId.slice(0, 8)}`
      await createBranch(this.runner, root, branch)
      snapshot = await readSnapshot(this.runner, root)
    }
    const item = createWorkItem({
      taskId,
      sessionId: agent.session.id,
      workspaceRoot: root,
      title,
      mode: 'manual',
      branch: snapshot.branch,
      baseCommit: snapshot.head,
      now: new Date().toISOString(),
    })
    await this.requireTable().put(taskId, item)
    this.publish(item)
    return item
  }

  /**
   * Read the Session's current Work Item.
   * @param agent - live owning Agent.
   * @returns the newest unfinished record, else the newest record, else null.
   */
  @Remote('get')
  get(agent: Agent): WorkItem | null {
    this.assertLive(agent)
    const owned = [...this.requireTable().entries()]
      .map(([, item]) => item)
      .filter(item => item.sessionId === agent.session.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return owned.find(item => !['completed', 'cancelled'].includes(item.status)) ?? owned[0] ?? null
  }

  /**
   * Read the Session's current unfinished Work Item without validating liveness.
   * The synchronous tool guard uses this path.
   * @param agent - calling Agent.
   * @returns the unfinished record, or null when the Session owns none.
   */
  inspect(agent: Agent): WorkItem | null {
    return this.getCurrent(agent)
  }

  /**
   * Complete one evidence-only stage.
   * @param agent - live owning Agent.
   * @param request - stage and evidence path.
   * @returns the next record.
   */
  async stage(agent: Agent, request: StageRequest): Promise<WorkItem> {
    return this.transition(agent, (item, root, snapshot) => applyStage(
      item,
      request.stage,
      this.evidence(root, request.evidencePath),
      snapshot,
      this.now(),
    ))
  }

  /**
   * Skip one eligible stage (S1 or S2) with an explicit reason.
   * @param agent - live owning Agent.
   * @param request - stage to skip and concrete reason.
   * @returns the next record.
   */
  async skip(agent: Agent, request: SkipRequest): Promise<WorkItem> {
    return this.transition(agent, (item, _root, snapshot) => applySkip(
      item,
      request.stage,
      request.reason,
      snapshot,
      this.now(),
    ))
  }

  /**
   * Accept the implementation plan's checks and allowed paths.
   * @param agent - live owning Agent.
   * @param request - plan evidence, checks, and allowed paths.
   * @returns the next record.
   */
  async checks(agent: Agent, request: ChecksRequest): Promise<WorkItem> {
    return this.transition(agent, (item, root) => applyChecks(
      item,
      { checks: request.checks, allowedPaths: request.allowedPaths },
      this.evidence(root, request.evidencePath),
      this.now(),
    ))
  }

  /**
   * Record one structured review and route the task onward.
   * @param agent - live owning Agent.
   * @param request - review evidence and findings.
   * @returns the next record.
   */
  async review(agent: Agent, request: ReviewRequest): Promise<WorkItem> {
    return this.transition(agent, (item, root, snapshot) => applyReview(
      item,
      request.findings,
      this.evidence(root, request.evidencePath),
      snapshot,
      this.now(),
    ))
  }

  /**
   * Record one repair round after a failing review.
   * @param agent - live owning Agent.
   * @param evidencePath - repair evidence path.
   * @returns the next record.
   */
  async repair(agent: Agent, evidencePath: string): Promise<WorkItem> {
    return this.transition(agent, (item, root, snapshot) => applyRepair(
      item,
      this.evidence(root, evidencePath),
      snapshot,
      this.now(),
    ))
  }

  /**
   * Run one planned verification command and fold its outcome.
   * @param agent - live owning Agent.
   * @param request - planned kind and exact command.
   * @param signal - caller cancellation.
   * @returns the next record.
   */
  async verify(agent: Agent, request: VerifyRequest, signal?: AbortSignal): Promise<WorkItem> {
    const item = this.requireCurrent(agent)
    requireWritable(item)
    const root = item.workspaceRoot
    const before = await readSnapshot(this.runner, root)
    requireCheckpoint(item, before)
    requirePrevious(item, 'S7')
    requireScoped(item, before)
    if (item.review === null || item.review.blockers !== 0 || item.review.fingerprint !== before.fingerprint) {
      throw new WorkflowError('A current, clean review is required before verification', 'WORKFLOW_REVIEW_STALE')
    }
    const planned = item.checks?.find(check => check.kind === request.kind)
    if (planned === undefined || JSON.stringify(planned.command) !== JSON.stringify(request.command)) {
      throw new WorkflowError('Command is not part of the approved implementation plan', 'WORKFLOW_UNPLANNED_CHECK')
    }
    const result = await runVerification(
      (workdir, command, options) => this.runSandboxed(agent, workdir, command, options, request.callId),
      root,
      request.command,
      this.resolved.verificationTimeoutMs,
      signal,
    )
    const after = await readSnapshot(this.runner, root)
    const run: VerificationRun = {
      kind: request.kind,
      command: [...request.command],
      exitCode: result.exitCode,
      passed: result.exitCode === 0 && result.error === '' && after.fingerprint === before.fingerprint,
      fingerprint: before.fingerprint,
      logSha256: digest(result.stdout + result.stderr),
      error: result.error,
      ranAt: new Date().toISOString(),
    }
    return this.save(agent, applyVerification(item, run, after, this.now()))
  }

  /**
   * Stage exactly the listed files and create the task's single local commit.
   * @param agent - live owning Agent.
   * @param request - exact files to commit.
   * @returns the record at S9.
   */
  async commit(agent: Agent, request: CommitRequest): Promise<WorkItem> {
    const item = this.requireCurrent(agent)
    const root = item.workspaceRoot
    const snapshot = await readSnapshot(this.runner, root)
    requireCommitReady(item, snapshot, request.files)
    for (const stage of ['S1', 'S2', 'S3', 'S4', 'S5'] as const) {
      const evidence = item.stages[stage].evidence
      if (evidence !== undefined) verifyEvidence(evidence)
    }
    const files = [...new Set(request.files)].sort()
    const message = `feat: ${item.title.slice(0, 65)} (${item.taskId.slice(0, 8)})`
    const commitRef = await commitExactly(this.runner, root, files, message)
    const committed = recordCommit(item, { commitRef, files }, this.now())
    return this.save(agent, committed)
  }

  /**
   * Pause further progress.
   * @param agent - live owning Agent.
   * @param taskId - task identity.
   * @param revision - expected revision.
   * @returns the paused record.
   */
  @Remote('pause')
  pause(agent: Agent, taskId: TaskId, revision: number): Promise<WorkItem> {
    return this.updateByRef(agent, taskId, revision, item => pause(item, this.now()))
  }

  /**
   * Resume a paused, blocked, or ready task.
   * @param agent - live owning Agent.
   * @param taskId - task identity.
   * @param revision - expected revision.
   * @returns the runnable record.
   */
  @Remote('resume')
  async resume(agent: Agent, taskId: TaskId, revision: number): Promise<WorkItem> {
    const item = this.expect(agent, taskId, revision)
    const snapshot = await readSnapshot(this.runner, item.workspaceRoot)
    return this.save(agent, resume(item, snapshot, this.now()))
  }

  /**
   * Switch mode without resuming work.
   * @param agent - live owning Agent.
   * @param taskId - task identity.
   * @param revision - expected revision.
   * @param mode - requested mode.
   * @returns the paused record with the new mode.
   */
  @Remote('setMode')
  setMode(agent: Agent, taskId: TaskId, revision: number, mode: WorkflowMode): Promise<WorkItem> {
    return this.updateByRef(agent, taskId, revision, item => setMode(item, mode, this.now()))
  }

  /**
   * Record a scoped human approval.
   * @param agent - live owning Agent.
   * @param taskId - task identity.
   * @param revision - expected revision.
   * @param decision - scoped decision text.
   * @returns the approved record.
   */
  @Remote('approve')
  approve(agent: Agent, taskId: TaskId, revision: number, decision: string): Promise<WorkItem> {
    return this.updateByRef(agent, taskId, revision, item => approve(item, decision, this.now()))
  }

  /**
   * Cancel a task permanently.
   * @param agent - live owning Agent.
   * @param taskId - task identity.
   * @param revision - expected revision.
   * @param reason - why the user cancelled.
   * @returns the cancelled record.
   */
  @Remote('cancel')
  cancel(agent: Agent, taskId: TaskId, revision: number, reason: string): Promise<WorkItem> {
    return this.updateByRef(agent, taskId, revision, item => cancel(item, reason, this.now()))
  }

  /**
   * Ask a human for a scoped decision from the model path.
   * @param agent - live owning Agent.
   * @param reason - concrete reason and proposed recovery.
   * @returns the waiting record.
   */
  async requestApproval(agent: Agent, reason: string): Promise<WorkItem> {
    return this.updateCurrent(agent, item => requestApproval(item, reason, this.now()))
  }

  /**
   * Stop a task on an unrecoverable condition from the model path.
   * @param agent - live owning Agent.
   * @param reason - concrete reason and proposed recovery.
   * @returns the blocked record.
   */
  async block(agent: Agent, reason: string): Promise<WorkItem> {
    return this.updateCurrent(agent, item => block(item, reason, this.now()))
  }

  /**
   * Switch the current task's mode from the model path.
   * @param agent - live owning Agent.
   * @param mode - requested mode.
   * @returns the paused record with the new mode.
   */
  async updateMode(agent: Agent, mode: WorkflowMode): Promise<WorkItem> {
    return this.updateCurrent(agent, item => setMode(item, mode, this.now()))
  }

  /**
   * Pause the current task from the model path.
   * @param agent - live owning Agent.
   * @returns the paused record.
   */
  async pauseCurrent(agent: Agent): Promise<WorkItem> {
    return this.updateCurrent(agent, item => pause(item, this.now()))
  }

  /**
   * Resume the current task from the model path.
   * @param agent - live owning Agent.
   * @returns the runnable record.
   */
  async resumeCurrent(agent: Agent): Promise<WorkItem> {
    const item = this.requireCurrent(agent)
    const snapshot = await readSnapshot(this.runner, item.workspaceRoot)
    return this.save(agent, resume(item, snapshot, this.now()))
  }

  /**
   * Cancel the current task from the model path.
   * @param agent - live owning Agent.
   * @param reason - why the task is cancelled.
   * @returns the cancelled record.
   */
  async cancelCurrent(agent: Agent, reason: string): Promise<WorkItem> {
    return this.updateCurrent(agent, item => cancel(item, reason, this.now()))
  }

  /** Run one planned command through the composed shell and its sandbox policy. */
  private async runSandboxed(
    agent: Agent,
    root: string,
    command: readonly string[],
    options: { readonly signal?: AbortSignal; readonly timeoutMs?: number },
    callId?: ToolCallId,
  ) {
    const standing = this.ctx.sandboxPolicy.resolve({ session: agent.session })
    let policy = standing
    if (standing.mode === 'read-only') {
      if (callId === undefined) {
        throw new WorkflowError('A live tool call id is required for sandbox approval', 'WORKFLOW_APPROVAL_REQUIRED')
      }
      policy = {
        ...standing,
        mode: await approveEscalation({
          requestedMode: 'workspace-write',
          effectiveMode: standing.mode,
          justification: 'Run the planned test/build command within the task workspace',
          subject: 'command',
        }, {
          approver: this.ctx.get('approval'),
          agent,
          callId,
          toolName: 'coding_workflow',
          ...options.signal === undefined ? {} : { signal: options.signal },
        }),
      }
    }
    try {
      const execution = await this.ctx.shell.execute(this.ctx.shell.resolve({
        command: command.map(argument => quoteShellArgument(argument)).join(' '),
        workdir: root,
        ...options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
        ...options.signal === undefined ? {} : { signal: options.signal },
        sandboxPolicy: policy,
      }))
      const result: ShellRunResult = await execution.result()
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.text,
        stderr: result.stderr.text,
        error: result.aborted ? 'verification command was aborted' : '',
      }
    } catch (error) {
      return { exitCode: null, stdout: '', stderr: '', error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Current Session record or a definite error. */
  private requireCurrent(agent: Agent): WorkItem {
    this.assertLive(agent)
    const item = this.getCurrent(agent)
    if (item === null) throw new WorkflowError('No current Work Item; start one first', 'WORKFLOW_NO_TASK')
    return item
  }

  /** Current Session record without the liveness error path. */
  private getCurrent(agent: Agent): WorkItem | null {
    const owned = [...this.requireTable().entries()]
      .map(([, item]) => item)
      .filter(item => item.sessionId === agent.session.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return owned.find(item => !['completed', 'cancelled'].includes(item.status)) ?? null
  }

  /** Apply one transition that needs repository facts. */
  private async transition(
    agent: Agent,
    action: (item: WorkItem, root: string, snapshot: Awaited<ReturnType<typeof readSnapshot>>) => WorkItem,
  ): Promise<WorkItem> {
    const item = this.requireCurrent(agent)
    const snapshot = await readSnapshot(this.runner, item.workspaceRoot)
    return this.save(agent, action(item, item.workspaceRoot, snapshot))
  }

  /** Apply one transition that needs no repository facts. */
  private updateCurrent(agent: Agent, action: (item: WorkItem) => WorkItem): Promise<WorkItem> {
    return this.save(agent, action(this.requireCurrent(agent)))
  }

  /** Apply one revision-checked transition addressed by task id. */
  private async updateByRef(
    agent: Agent,
    taskId: TaskId,
    revision: number,
    action: (item: WorkItem) => WorkItem,
  ): Promise<WorkItem> {
    return this.save(agent, action(this.expect(agent, taskId, revision)))
  }

  /** Load one task owned by the live Agent and check its revision. */
  private expect(agent: Agent, taskId: TaskId, revision: number): WorkItem {
    this.assertLive(agent)
    const item = this.requireTable().get(taskId)
    if (item === undefined || item.sessionId !== agent.session.id) {
      throw new WorkflowError('Work Item not found for this Session', 'WORKFLOW_NOT_FOUND')
    }
    if (item.revision !== revision) {
      throw new WorkflowError('Work Item changed concurrently; refresh and retry', 'WORKFLOW_STALE_REVISION')
    }
    return item
  }

  /** Durably store one computed revision and publish it. */
  private async save(agent: Agent, item: WorkItem): Promise<WorkItem> {
    this.assertLive(agent)
    const stored = await this.requireTable().update(item.taskId, (current) => {
      if (current.revision + 1 !== item.revision) {
        throw new WorkflowError('Work Item changed concurrently; refresh and retry', 'WORKFLOW_STALE_REVISION')
      }
      return item
    })
    this.publish(stored)
    return stored
  }

  /** Publish one accepted mutation to the Host and its Client subscribers. */
  private publish(item: WorkItem): void {
    this.ctx.emit('coding-workflow/changed', {
      sessionId: item.sessionId,
      taskId: item.taskId,
      revision: item.revision,
      status: item.status,
      currentStage: item.currentStage,
    })
  }

  /** Hash evidence inside the task workspace. */
  private evidence(root: string, path: string): EvidenceRef {
    return readEvidence(root, path)
  }

  /** Resolve the task workspace root from the Session's directory. */
  private workspaceRoot(agent: Agent): string {
    return this.ctx.workingDirectory.get(agent.session)
  }

  /** Enforce exact live-agent identity rather than trusting a matching id. */
  private assertLive(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent) {
      throw new WorkflowError(`agent "${agent.id}" is not live in this registry`, 'WORKFLOW_AGENT_NOT_LIVE')
    }
  }

  /** Current ISO-8601 time. */
  private now(): string {
    return new Date().toISOString()
  }

  /** The opened table or a definite startup error. */
  private requireTable(): KvTable<TaskId, WorkItemRecord> {
    if (this.table === undefined) throw new Error('coding-workflow is not started yet')
    return this.table
  }
}

export default CodingWorkflowService
