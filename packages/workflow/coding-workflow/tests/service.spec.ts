import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellExecution, ShellProcessRead } from '@deepseek-ai/dsh-shell'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import CodingWorkflowService from '../src/index.ts'
import type { WorkItem } from '../src/types.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const temporary: string[] = []

/** Canned sandboxing shell used to prove verification reaches the configured execution seam. */
class WorkflowTestShell extends ShellExecutor {
  readonly specs: ShellExecSpec[] = []

  override get sandboxMode(): SandboxMode {
    return 'workspace-write'
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs: request.timeoutMs ?? 30_000,
      onExpiry: request.onExpiry ?? 'kill',
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      sandboxPolicy: request.sandboxPolicy,
      ...request.signal === undefined ? {} : { signal: request.signal },
    }
  }

  override async execute(spec: ShellExecSpec): Promise<ShellExecution> {
    this.specs.push(spec)
    const silent = { readFrom: (fromByte: number) => ({ text: '', nextOffset: fromByte, lossy: false }) }
    const output: ShellProcessRead = { delta: '', lossy: false }
    return {
      status: 'completed',
      exitCode: 0,
      signal: null,
      done: Promise.resolve(),
      readOutput: () => output,
      observed: { stdout: silent, stderr: silent },
      kill: () => false,
      result: async () => ({
        exitCode: 0, signal: null, timedOut: false, aborted: false, timeoutMs: spec.timeoutMs,
        stdout: { text: 'ok', truncated: false }, stderr: { text: '', truncated: false },
      }),
    }
  }
}

/** Remove one temporary tree; Windows releases child-process handles late. */
function removeTree(path: string): void {
  const deadline = Date.now() + 5000
  for (;;) {
    try { rmSync(path, { recursive: true, force: true }); return } catch (error) {
      if (Date.now() >= deadline) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
}

afterAll(() => { for (const path of temporary) removeTree(path) })

/** Run one Git command in a fixture repository. */
function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

/** Create a clean repository plus a separate evidence directory. */
function repository(): { root: string; evidence: string } {
  const base = mkdtempSync(join(tmpdir(), 'coding-workflow-service-'))
  temporary.push(base)
  const root = join(base, 'repo')
  const evidence = join(base, 'evidence')
  mkdirSync(root)
  mkdirSync(evidence)
  git(root, 'init', '-b', 'master')
  git(root, 'config', 'user.name', 'Test User')
  git(root, 'config', 'user.email', 'test@example.invalid')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/a.ts'), 'base\n')
  git(root, 'add', 'src/a.ts')
  git(root, 'commit', '-m', 'baseline')
  return { root, evidence }
}

/** Boot the storage stack, Session store, and workflow service over one workspace. */
async function boot(
  root: string,
  sessionId: string,
  pool: MemoryMediaPool = new MemoryMediaPool(),
  sandboxMode: SandboxMode = 'workspace-write',
): Promise<{ ctx: Context; agent: Agent; service: CodingWorkflowService; pool: MemoryMediaPool; shell: WorkflowTestShell; approvalRequests: unknown[] }> {
  const ctx = new Context()
  await ctx.plugin(WorkflowTestShell)
  const sandboxPolicy: SandboxExecutionPolicy = { mode: sandboxMode, workspaceRoot: root }
  const approvalRequests: unknown[] = []
  ctx.provide('sandboxPolicy', { resolve: () => sandboxPolicy })
  ctx.provide('approval', { request: async (request: unknown) => { approvalRequests.push(request); return 'allowed-once' } })
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('workingDirectory', { get: () => root })
  const session = ctx.sessions.create(SessionId(sessionId))
  const agent: Agent = {
    id: session.id,
    options: {},
    model: { current: () => undefined, select: () => {} },
    session,
    inbox: createInboxStub(),
    ctx,
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject(input) { this.inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  ctx.provide('agents', { get: (id: SessionId) => id === agent.id ? agent : undefined })
  await ctx.plugin(CodingWorkflowService)
  return { ctx, agent, service: ctx.codingWorkflow, pool, shell: ctx.shell as WorkflowTestShell, approvalRequests }
}

/** Write one evidence file and return its path. */
function evidenceFile(directory: string, name: string, text: string): string {
  const path = join(directory, name)
  writeFileSync(path, text)
  return path
}

/** One passing check command that satisfies the plan rules. */
const TEST_COMMAND = [process.execPath, '--version']

/** One passing build command that satisfies the plan rules. */
const BUILD_COMMAND = [process.execPath, '-p', '1+1']

/** Two planned checks that run a real process. */
const CHECKS = [
  { kind: 'test' as const, command: TEST_COMMAND },
  { kind: 'build' as const, command: BUILD_COMMAND },
]

/** Complete S1-S3 with evidence files. */
async function plan(service: CodingWorkflowService, agent: Agent, evidence: string): Promise<void> {
  for (const stage of ['S1', 'S2', 'S3'] as const) {
    await service.stage(agent, { stage, evidencePath: evidenceFile(evidence, `${stage}.md`, `${stage} evidence`) })
  }
}

describe('coding workflow service over real storage and Git', { timeout: 180_000 }, () => {
  it('does not spawn verification commands while stopped', async () => {
    const { root, evidence } = repository()
    const { ctx, agent, service, shell } = await boot(root, 'service-stopped-verification')
    try {
      await service.start(agent, 'Stopped verification')
      await plan(service, agent, evidence)
      const command = TEST_COMMAND
      await service.checks(agent, {
        evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
        checks: [{ kind: 'test', command }, { kind: 'build', command: BUILD_COMMAND }],
        allowedPaths: ['src/a.ts'],
      })
      writeFileSync(join(root, 'src/a.ts'), 'changed\n')
      await service.stage(agent, { stage: 'S4', evidencePath: evidenceFile(evidence, 'S4.md', 'implementation') })
      await service.review(agent, { evidencePath: evidenceFile(evidence, 'review.md', '{}'), findings: [] })
      for (const stop of [
        () => service.pauseCurrent(agent),
        () => service.block(agent, 'Inspect the failed operation'),
        () => service.requestApproval(agent, 'Confirm the verification scope'),
      ]) {
        const stopped = await stop()
        await expect(service.verify(agent, { kind: 'test', command })).rejects.toThrow(/Task is stopped/)
        expect(shell.specs).toHaveLength(0)
        expect(service.get(agent)).toEqual(stopped)
        if (stopped.status === 'waiting_approval') {
          await service.approve(agent, stopped.taskId, stopped.revision, 'Approved: run the registered verification')
        } else {
          await service.resume(agent, stopped.taskId, stopped.revision)
        }
      }
      await service.verify(agent, { kind: 'test', command })
      expect(shell.specs).toHaveLength(1)
      expect(shell.specs[0]?.sandboxPolicy).toEqual({ mode: 'workspace-write', workspaceRoot: root })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('runs a clean task from start to one local commit', async () => {
    const { root, evidence } = repository()
    const { agent, service } = await boot(root, 'service-e2e-a')
    const item = await service.start(agent, 'Add the feature')
    expect(item.status).toBe('ready')
    expect(item.mode).toBe('manual')
    expect(item.currentStage).toBe('S1')
    expect(item.branch).toMatch(/^coding\//)
    expect(git(root, 'branch', '--show-current')).toBe(item.branch)

    await plan(service, agent, evidence)
    await service.checks(agent, {
      evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
      checks: CHECKS,
      allowedPaths: ['src/a.ts'],
    })
    writeFileSync(join(root, 'src/a.ts'), 'changed\n')
    const implemented = await service.stage(agent, {
      stage: 'S4',
      evidencePath: evidenceFile(evidence, 'S4.md', 'implementation'),
    })
    expect(implemented.currentStage).toBe('S5')

    const reviewed = await service.review(agent, {
      evidencePath: evidenceFile(evidence, 'review.md', '{"findings":[]}'),
      findings: [],
    })
    expect(reviewed.currentStage).toBe('S7')
    expect(reviewed.stages.S6.status).toBe('skipped')

    await service.verify(agent, { kind: 'test', command: TEST_COMMAND })
    const verified = await service.verify(agent, { kind: 'build', command: BUILD_COMMAND })
    expect(verified.currentStage).toBe('S8')
    expect(verified.verification?.passed).toBe(true)

    const paused = await service.pause(agent, verified.taskId, verified.revision)
    const beforeCommit = git(root, 'rev-parse', 'HEAD')
    await expect(service.commit(agent, { files: ['src/a.ts'] })).rejects.toThrow(/Task is stopped/)
    expect(git(root, 'rev-parse', 'HEAD')).toBe(beforeCommit)
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('')
    expect(service.get(agent)).toEqual(paused)
    await service.resume(agent, paused.taskId, paused.revision)

    const committed = await service.commit(agent, { files: ['src/a.ts'] })
    expect(committed.currentStage).toBe('S9')
    expect(committed.commitRef).toBe(git(root, 'rev-parse', 'HEAD'))
    expect(git(root, 'status', '--porcelain')).toBe('')
    expect(git(root, 'show', '--pretty=%s', 'HEAD')).toContain('Add the feature')
  })

  it('refuses a dirty tree and a second task on the owned branch', async () => {
    const { root, evidence } = repository()
    const { agent, service } = await boot(root, 'service-e2e-b')
    writeFileSync(join(root, 'src/a.ts'), 'user work\n')
    await expect(service.start(agent, 'Never claim user work')).rejects.toThrow(/dirty/)
    writeFileSync(join(root, 'src/a.ts'), 'base\n')
    const item = await service.start(agent, 'First task')
    await expect(service.start(agent, 'Conflicting task')).rejects.toThrow(/already owns this branch/)
    // The first task still owns its branch, and progress stays possible.
    const staged = await service.stage(agent, { stage: 'S1', evidencePath: evidenceFile(evidence, 's1.md', 'requirements') })
    expect(staged.currentStage).toBe('S2')
    expect(item.currentStage).toBe('S1')
  })

  it('shows the persisted task after a restart without resuming work', async () => {
    const { root } = repository()
    const first = await boot(root, 'service-e2e-c')
    const item = await first.service.start(first.agent, 'Persisted task')
    // A second Host process over the same medium sees the same record; it never advances on its own.
    const second = await boot(root, 'service-e2e-c', first.pool)
    const restored: WorkItem | null = second.service.get(second.agent)
    expect(restored?.taskId).toBe(item.taskId)
    expect(restored?.revision).toBe(item.revision)
    expect(restored?.currentStage).toBe('S1')
  })

  it('stops an out-of-scope commit and a stale revision', async () => {
    const { root, evidence } = repository()
    const { agent, service } = await boot(root, 'service-e2e-d')
    const item = await service.start(agent, 'Scope guard')
    await plan(service, agent, evidence)
    await service.checks(agent, {
      evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
      checks: CHECKS,
      allowedPaths: ['src/a.ts'],
    })
    writeFileSync(join(root, 'src/a.ts'), 'changed\n')
    writeFileSync(join(root, 'notes.md'), 'outside scope\n')
    await expect(service.stage(agent, {
      stage: 'S4',
      evidencePath: evidenceFile(evidence, 'S4.md', 'implementation'),
    })).rejects.toThrow(/allowed task paths/)
    await expect(service.resume(agent, item.taskId, item.revision + 5)).rejects.toThrow(/concurrently/)
  })

  it('pauses on a mode change and waits for a scoped approval', async () => {
    const { root } = repository()
    const { agent, service } = await boot(root, 'service-e2e-e')
    const item = await service.start(agent, 'Approval flow')
    const paused = await service.setMode(agent, item.taskId, item.revision, 'auto')
    expect(paused.status).toBe('paused')
    expect(paused.mode).toBe('auto')
    await expect(service.resume(agent, item.taskId, paused.revision)).resolves.toMatchObject({ status: 'ready' })
  })

  it('asks for workspace-write approval before verifying under a read-only policy', async () => {
    const { root, evidence } = repository()
    const { ctx, agent, service, shell, approvalRequests } = await boot(root, 'service-readonly-verification', undefined, 'read-only')
    try {
      await service.start(agent, 'Sandboxed verification')
      await plan(service, agent, evidence)
      await service.checks(agent, {
        evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
        checks: CHECKS,
        allowedPaths: ['src/a.ts'],
      })
      writeFileSync(join(root, 'src/a.ts'), 'changed\n')
      await service.stage(agent, { stage: 'S4', evidencePath: evidenceFile(evidence, 'S4.md', 'implementation') })
      await service.review(agent, { evidencePath: evidenceFile(evidence, 'review.md', '{}'), findings: [] })
      await service.verify(agent, { kind: 'test', command: TEST_COMMAND, callId: ToolCallId('verification-call') })
      expect(approvalRequests).toHaveLength(1)
      expect(shell.specs[0]?.sandboxPolicy?.mode).toBe('workspace-write')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses to launch verification before S7 or against a changed review fingerprint', async () => {
    const { root, evidence } = repository()
    const { ctx, agent, service, shell } = await boot(root, 'service-verification-preconditions')
    try {
      await service.start(agent, 'Verification ordering')
      await plan(service, agent, evidence)
      await service.checks(agent, {
        evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
        checks: CHECKS,
        allowedPaths: ['src/a.ts'],
      })
      await expect(service.verify(agent, { kind: 'test', command: TEST_COMMAND })).rejects.toThrow(/Prerequisite S4/)
      expect(shell.specs).toHaveLength(0)

      writeFileSync(join(root, 'src/a.ts'), 'changed\n')
      await service.stage(agent, { stage: 'S4', evidencePath: evidenceFile(evidence, 'S4.md', 'implementation') })
      await service.review(agent, { evidencePath: evidenceFile(evidence, 'review.md', '{}'), findings: [] })
      writeFileSync(join(root, 'src/a.ts'), 'changed after review\n')
      await expect(service.verify(agent, { kind: 'test', command: TEST_COMMAND })).rejects.toThrow(/current, clean review/)
      expect(shell.specs).toHaveLength(0)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('runs a bugfix flow with skipped S1 and S2 stages', async () => {
    const { root, evidence } = repository()
    const { agent, service } = await boot(root, 'service-e2e-bugfix')
    await service.start(agent, 'Bugfix login leak')
    const skippedS1 = await service.skip(agent, { stage: 'S1', reason: 'Bugfix: no requirements analysis needed' })
    expect(skippedS1.currentStage).toBe('S2')
    expect(skippedS1.stages.S1.status).toBe('skipped')

    const skippedS2 = await service.skip(agent, { stage: 'S2', reason: 'Bugfix: no spec document needed' })
    expect(skippedS2.currentStage).toBe('S3')
    expect(skippedS2.stages.S2.status).toBe('skipped')

    await service.stage(agent, { stage: 'S3', evidencePath: evidenceFile(evidence, 'S3.md', 'plan') })
    await service.checks(agent, {
      evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
      checks: CHECKS,
      allowedPaths: ['src/a.ts'],
    })
    writeFileSync(join(root, 'src/a.ts'), 'fixed bug\n')
    await service.stage(agent, { stage: 'S4', evidencePath: evidenceFile(evidence, 'S4.md', 'fixed') })
    await service.review(agent, { evidencePath: evidenceFile(evidence, 'review.md', '{}'), findings: [] })
    await service.verify(agent, { kind: 'test', command: TEST_COMMAND })
    await service.verify(agent, { kind: 'build', command: BUILD_COMMAND })
    const committed = await service.commit(agent, { files: ['src/a.ts'] })
    expect(committed.currentStage).toBe('S9')
    expect(committed.stages.S1.status).toBe('skipped')
    expect(committed.stages.S2.status).toBe('skipped')
  })

  it('refuses a workspace that is not a Git repository', async () => {
    const base = mkdtempSync(join(tmpdir(), 'coding-workflow-svn-'))
    temporary.push(base)
    mkdirSync(join(base, '.svn'))
    writeFileSync(join(base, 'file.txt'), 'svn working copy\n')
    const { agent, service } = await boot(base, 'service-e2e-svn')
    // A Subversion working copy has no Git history to claim: start fails before any branch or commit exists.
    await expect(service.start(agent, 'SVN workspace')).rejects.toThrow(/git command failed|not a git repository/)
    expect(service.get(agent)).toBeNull()
  })

  it('detects a commit hook that changes the staged tree', async () => {
    const { root, evidence } = repository()
    const { agent, service } = await boot(root, 'service-e2e-hooks')
    await service.start(agent, 'Hook guard')
    await plan(service, agent, evidence)
    await service.checks(agent, {
      evidencePath: evidenceFile(evidence, 'plan.md', 'plan'),
      checks: CHECKS,
      allowedPaths: ['src/a.ts'],
    })
    writeFileSync(join(root, 'src/a.ts'), 'changed\n')
    await service.stage(agent, { stage: 'S4', evidencePath: evidenceFile(evidence, 'S4.md', 'implementation') })
    await service.review(agent, { evidencePath: evidenceFile(evidence, 'review.md', '{}'), findings: [] })
    await service.verify(agent, { kind: 'test', command: TEST_COMMAND })
    await service.verify(agent, { kind: 'build', command: BUILD_COMMAND })
    // The hook stages an extra edit, so the committed tree cannot match the planned one.
    const hook = join(root, '.git', 'hooks', 'pre-commit')
    writeFileSync(hook, '#!/bin/sh\necho "hook edit" >> src/a.ts\ngit add src/a.ts\n')
    chmodSync(hook, 0o755)
    await expect(service.commit(agent, { files: ['src/a.ts'] }))
      .rejects.toThrow(/hooks changed the staged tree|Post-commit changes/)
  })
})
