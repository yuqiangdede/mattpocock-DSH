import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  MAX_REPAIR_ROUNDS,
  WorkflowError,
  applyChecks,
  applyRepair,
  applyReview,
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
  resume,
  setMode,
} from '../src/domain.ts'
import type { CheckPlan, EvidenceRef, RepositorySnapshot, ReviewFinding, TaskId, VerificationRun, WorkItem } from '../src/types.ts'

const now = '2026-01-01T00:00:00.000Z'
const sha = (letter: string): string => letter.repeat(64)

/** One workspace snapshot; tests override only the facts they exercise. */
const snapshot = (over: Partial<RepositorySnapshot> = {}): RepositorySnapshot => ({
  branch: 'coding/abc',
  head: 'a'.repeat(40),
  clean: true,
  files: [],
  fingerprint: 'fingerprint-1',
  ...over,
})

/** One evidence reference. */
const evidence = (letter = 'e'): EvidenceRef => ({ path: '/tmp/evidence.json', sha256: sha(letter) })

/** Two planned checks that satisfy the plan rules. */
const CHECKS: CheckPlan[] = [
  { kind: 'test', command: ['npm', 'test'] },
  { kind: 'build', command: ['npm', 'run', 'build'] },
]

/** A fresh record at S1. */
function created(): WorkItem {
  return createWorkItem({
    taskId: brandString<TaskId>('11111111-1111-4111-8111-111111111111'),
    sessionId: brandString<SessionId>('session-1'),
    workspaceRoot: '/repo',
    title: 'Add proof',
    mode: 'manual',
    branch: 'coding/abc',
    baseCommit: 'a'.repeat(40),
    now,
  })
}

/** Record S1-S3 with evidence. */
function throughPlan(item = created()): WorkItem {
  let next = applyStage(item, 'S1', evidence('1'), snapshot(), now)
  next = applyStage(next, 'S2', evidence('2'), snapshot(), now)
  return applyStage(next, 'S3', evidence('3'), snapshot(), now)
}

/** Record S1-S4 plus a configured plan. */
function throughImplementation(): WorkItem {
  const planned = applyChecks(throughPlan(), { checks: CHECKS, allowedPaths: ['a.ts'] }, evidence('4'), now)
  return applyStage(planned, 'S4', evidence('5'), snapshot({ files: ['a.ts'] }), now)
}

/** Record a clean review, leaving the task at S7. */
function throughReview(): WorkItem {
  return applyReview(throughImplementation(), [], evidence('6'), snapshot({ files: ['a.ts'] }), now)
}

/** One passing verification run for a check kind. */
const run = (kind: 'test' | 'build'): VerificationRun => ({
  kind,
  command: CHECKS.find(check => check.kind === kind)!.command,
  exitCode: 0,
  passed: true,
  fingerprint: 'fingerprint-1',
  logSha256: sha('L'),
  error: '',
  ranAt: now,
})

/** Record verified evidence for every planned check. */
function throughVerification(): WorkItem {
  const reviewed = throughReview()
  const item = applyVerification(reviewed, run('test'), snapshot({ files: ['a.ts'] }), now)
  return applyVerification(item, run('build'), snapshot({ files: ['a.ts'] }), now)
}

describe('coding workflow record lifecycle', () => {
  it('refuses verification and commit while stopped or terminal', () => {
    for (const status of ['paused', 'blocked', 'waiting_approval', 'cancelled', 'completed'] as const) {
      expect(() => applyVerification({ ...throughReview(), status }, run('test'), snapshot({ files: ['a.ts'] }), now))
        .toThrow(/Task is stopped|Task is terminal/)
      expect(() => requireCommitReady({ ...throughVerification(), status }, snapshot({ files: ['a.ts'] }), ['a.ts']))
        .toThrow(/Task is stopped|Task is terminal/)
    }
  })

  it('starts at S1 with a completed S0 and manual mode', () => {
    const item = created()
    expect(item.revision).toBe(1)
    expect(item.mode).toBe('manual')
    expect(item.status).toBe('ready')
    expect(item.currentStage).toBe('S1')
    expect(item.stages.S0).toEqual({ status: 'completed', attempts: 1 })
    expect(item.stages.S1).toEqual({ status: 'pending', attempts: 0 })
  })

  it('rejects a missing title and a detached HEAD', () => {
    expect(() => createWorkItem({
      taskId: brandString<TaskId>('t'), sessionId: brandString<SessionId>('s'), workspaceRoot: '/repo',
      title: '  ', mode: 'manual', branch: 'coding/x', baseCommit: 'a', now,
    })).toThrow(WorkflowError)
    expect(() => createWorkItem({
      taskId: brandString<TaskId>('t'), sessionId: brandString<SessionId>('s'), workspaceRoot: '/repo',
      title: 'ok', mode: 'manual', branch: '', baseCommit: 'a', now,
    })).toThrow(/Detached HEAD/)
  })

  it('advances stages in order and refuses a skipped prerequisite', () => {
    expect(() => applyStage(created(), 'S2', evidence(), snapshot(), now)).toThrow(/Prerequisite S1/)
    const item = throughPlan()
    expect(item.currentStage).toBe('S4')
    expect(item.stages.S3.status).toBe('completed')
    expect(item.revision).toBe(4)
  })

  it('requires the branch and HEAD the task claimed', () => {
    expect(() => applyStage(created(), 'S1', evidence(), snapshot({ branch: 'other' }), now))
      .toThrow(/Branch changed/)
    expect(() => applyStage(created(), 'S1', evidence(), snapshot({ head: 'b'.repeat(40) }), now))
      .toThrow(/HEAD changed/)
  })
})

describe('implementation planning', () => {
  it('requires a test and a build check with unique kinds', () => {
    const planned = throughPlan()
    expect(() => applyChecks(planned, { checks: [CHECKS[0]!], allowedPaths: ['a.ts'] }, evidence(), now))
      .toThrow(/2-12/)
    expect(() => applyChecks(planned, {
      checks: [CHECKS[0]!, CHECKS[0]!, CHECKS[1]!], allowedPaths: ['a.ts'],
    }, evidence(), now)).toThrow(/unique/)
    expect(() => applyChecks(planned, {
      checks: [{ kind: 'test', command: ['npm', 'test'] }, { kind: 'lint', command: ['npm', 'run', 'lint'] }],
      allowedPaths: ['a.ts'],
    }, evidence(), now)).toThrow(/Test and build/)
  })

  it('refuses unsafe or duplicate allowed paths', () => {
    const planned = throughPlan()
    for (const path of ['../escape.ts', '/absolute.ts', '.git/config', 'node_modules/x', 'a\\b.ts']) {
      expect(() => applyChecks(planned, { checks: CHECKS, allowedPaths: [path] }, evidence(), now))
        .toThrow(WorkflowError)
    }
    expect(() => applyChecks(planned, { checks: CHECKS, allowedPaths: ['a.ts', 'a.ts'] }, evidence(), now))
      .toThrow(/Duplicate/)
  })

  it('refuses implementation without a plan or without changes', () => {
    const planned = throughPlan()
    expect(() => applyStage(planned, 'S4', evidence(), snapshot({ files: ['a.ts'] }), now))
      .toThrow(/planned before implementation/)
    const configured = applyChecks(planned, { checks: CHECKS, allowedPaths: ['a.ts'] }, evidence(), now)
    expect(() => applyStage(configured, 'S4', evidence(), snapshot(), now)).toThrow(/no code changes/)
    expect(() => applyStage(configured, 'S4', evidence(), snapshot({ files: ['b.ts'] }), now))
      .toThrow(/allowed task paths/)
  })
})

describe('review, repair, and progress limits', () => {
  const blocking: ReviewFinding[] = [{ id: 'P1-1', severity: 'P1', status: 'open', file: 'a.ts', evidence: 'missing case' }]

  it('routes blocking findings to S6 and a clean review to S7', () => {
    const failed = applyReview(throughImplementation(), blocking, evidence(), snapshot({ files: ['a.ts'] }), now)
    expect(failed.currentStage).toBe('S6')
    expect(failed.stages.S5.status).toBe('failed')
    expect(failed.stages.S6.status).toBe('pending')
    expect(failed.review?.blockers).toBe(1)

    const clean = throughReview()
    expect(clean.currentStage).toBe('S7')
    expect(clean.stages.S5.status).toBe('completed')
    expect(clean.stages.S6.status).toBe('skipped')
    expect(clean.stages.S7.status).toBe('stale')
  })

  it('stops when two consecutive reviews report the same blocking findings', () => {
    const failed = applyReview(throughImplementation(), blocking, evidence(), snapshot({ files: ['a.ts'] }), now)
    const repaired = applyRepair(failed, evidence('r'),
      snapshot({ files: ['a.ts'], fingerprint: 'fingerprint-2' }), now)
    const repeated = applyReview(repaired, blocking, evidence(), snapshot({ files: ['a.ts'], fingerprint: 'fingerprint-2' }), now)
    expect(repeated.status).toBe('ready')
    expect(repeated.noProgressRounds).toBe(1)
    const second = applyRepair(repeated, evidence('q'),
      snapshot({ files: ['a.ts'], fingerprint: 'fingerprint-3' }), now)
    const again = applyReview(second, blocking, evidence(), snapshot({ files: ['a.ts'], fingerprint: 'fingerprint-3' }), now)
    expect(again.status).toBe('blocked')
    expect(again.noProgressRounds).toBe(2)
    expect(again.blocker?.reason).toMatch(/same unresolved blocking issues/)
  })

  it('requires a repair to change the reviewed source and caps repair rounds', () => {
    const failed = applyReview(throughImplementation(), blocking, evidence(), snapshot({ files: ['a.ts'] }), now)
    expect(() => applyRepair(failed, evidence(), snapshot({ files: ['a.ts'] }), now)).toThrow(/no progress/)
    let item = failed
    for (let round = 1; round <= MAX_REPAIR_ROUNDS; round += 1) {
      item = applyRepair(item, evidence('r'),
        snapshot({ files: ['a.ts'], fingerprint: `fingerprint-${String(round + 1)}` }), now)
      expect(item.repairRounds).toBe(round)
      expect(item.currentStage).toBe('S5')
      // Distinct finding ids each round: the repair limit, not the no-progress rule, must stop the task.
      const distinct: ReviewFinding[] = [{ id: `P1-${String(round)}`, severity: 'P1', status: 'open', file: 'a.ts', evidence: 'still broken' }]
      item = applyReview(item, distinct, evidence(),
        snapshot({ files: ['a.ts'], fingerprint: `fingerprint-${String(round + 1)}` }), now)
    }
    expect(() => applyRepair(item, evidence('r'),
      snapshot({ files: ['a.ts'], fingerprint: 'fingerprint-9' }), now)).toThrow(/repair limit/)
  })

  it('invalidates verification when the source changes after review', () => {
    const reviewed = throughReview()
    expect(() => applyVerification(reviewed, run('test'), snapshot({ files: ['a.ts'], fingerprint: 'changed' }), now))
      .toThrow(/Source changed after review/)
  })
})

describe('verification and local commit', () => {
  it('completes S7 only when every planned check passed on the same change set', () => {
    const reviewed = throughReview()
    const partial = applyVerification(reviewed, run('test'), snapshot({ files: ['a.ts'] }), now)
    expect(partial.stages.S7.status).toBe('pending')
    expect(partial.currentStage).toBe('S7')
    const complete = applyVerification(partial, run('build'), snapshot({ files: ['a.ts'] }), now)
    expect(complete.stages.S7.status).toBe('completed')
    expect(complete.currentStage).toBe('S8')
    expect(complete.verification?.passed).toBe(true)
  })

  it('blocks on a failing run and refuses an unplanned command', () => {
    const reviewed = throughReview()
    expect(() => applyVerification(reviewed, { ...run('test'), command: ['rm', '-rf'] }, snapshot({ files: ['a.ts'] }), now))
      .toThrow(/approved implementation plan/)
    const failed = applyVerification(reviewed, { ...run('test'), exitCode: 1, passed: false },
      snapshot({ files: ['a.ts'] }), now)
    expect(failed.status).toBe('blocked')
    expect(failed.blocker?.stage).toBe('S7')
  })

  it('commits only after fresh review, verification, and an exact file list', () => {
    const verified = throughVerification()
    const files = ['a.ts']
    expect(() => requireCommitReady(verified, snapshot({ files: ['a.ts'], fingerprint: 'changed' }), files))
      .toThrow(/Review is stale/)
    expect(() => requireCommitReady(verified, snapshot({ files: ['a.ts'] }), ['a.ts', 'b.ts']))
      .toThrow(/Unowned files/)
    expect(() => requireCommitReady(verified, snapshot({ files: ['a.ts'] }), ['.env']))
      .toThrow(WorkflowError)
    requireCommitReady(verified, snapshot({ files: ['a.ts'] }), files)
    const committed = recordCommit(verified, { commitRef: 'b'.repeat(40), files }, now)
    expect(committed.currentStage).toBe('S9')
    expect(committed.commitRef).toBe('b'.repeat(40))
    expect(committed.stages.S8.status).toBe('completed')
    const reported = applyStage(committed, 'S9', evidence('9'), snapshot({ files: ['a.ts'], head: 'b'.repeat(40) }), now)
    expect(reported.status).toBe('completed')
  })

  it('refuses a commit on a protected branch', () => {
    const verified = throughVerification()
    const onMain = { ...verified, branch: 'main' }
    expect(() => recordCommit(onMain, { commitRef: 'b'.repeat(40), files: ['a.ts'] }, now))
      .toThrow(/main\/master/)
  })
})

describe('mode, stop, and human decisions', () => {
  it('switching mode pauses and never resumes work', () => {
    const paused = setMode(created(), 'auto', now)
    expect(paused.mode).toBe('auto')
    expect(paused.status).toBe('paused')
    expect(() => applyStage(paused, 'S1', evidence(), snapshot(), now)).toThrow(/stopped/)
    const resumed = resume(paused, snapshot(), now)
    expect(resumed.status).toBe('ready')
    expect(resumed.blocker).toBeNull()
  })

  it('requires a scoped approval before continuing', () => {
    const waiting = requestApproval(created(), 'Access control changes need a scoped human decision', now)
    expect(waiting.status).toBe('waiting_approval')
    expect(() => resume(waiting, snapshot(), now)).toThrow(/Approval required/)
    expect(() => approve(waiting, 'ok', now)).toThrow(/scoped decision/)
    const approved = approve(waiting, 'Approved: adjust the auth table only', now)
    expect(approved.status).toBe('ready')
    expect(approved.approval?.stage).toBe('S1')
    expect(approved.blocker).toBeNull()
  })

  it('blocks and cancels with a concrete reason and keeps the stage', () => {
    expect(() => block(created(), 'short', now)).toThrow(/concrete reason/)
    const blocked = block(created(), 'Reviewer unavailable for the required sign-off', now)
    expect(blocked.status).toBe('blocked')
    expect(blocked.blocker?.stage).toBe('S1')
    expect(() => cancel(created(), 'short', now)).toThrow(/reason for cancelling/)
    const cancelled = cancel(created(), 'Superseded by the follow-up task', now)
    expect(cancelled.status).toBe('cancelled')
    expect(() => pause(cancelled, now)).toThrow(/terminal/)
  })

  it('increments the revision on every accepted mutation', () => {
    let item = created()
    item = applyStage(item, 'S1', evidence(), snapshot(), now)
    item = pause(item, now)
    item = setMode(item, 'auto', now)
    expect(item.revision).toBe(4)
  })
})
