import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import CodingWorkflowService from '../src/index.ts'
import type { WorkItem } from '../src/types.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const temporary: string[] = []

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
): Promise<{ ctx: Context; agent: Agent; service: CodingWorkflowService; pool: MemoryMediaPool }> {
  const ctx = new Context()
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
  return { ctx, agent, service: ctx.codingWorkflow, pool }
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
})
