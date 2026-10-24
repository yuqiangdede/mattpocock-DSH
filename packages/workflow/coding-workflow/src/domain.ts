/**
 * Pure state machine of one coding-workflow Work Item. Every transition
 * validates the caller's facts and returns a new record; Git and file effects
 * belong to the service that supplies {@link RepositorySnapshot} values.
 *
 * @module @deepseek-ai/dsh-coding-workflow/domain
 */

import {
  WORKFLOW_STAGES,
} from './types.ts'
import type {
  CheckKind,
  CheckPlan,
  EvidenceRef,
  RepositorySnapshot,
  ReviewEvidence,
  ReviewFinding,
  StageId,
  StageState,
  TaskId,
  VerificationRun,
  WorkItem,
  WorkItemApproval,
  WorkItemBlocker,
  WorkflowMode,
} from './types.ts'

/** Automatic repair rounds a task may spend on a failing review. */
export const MAX_REPAIR_ROUNDS = 3

/** Planned checks a configuration must declare. */
export const MIN_CHECKS = 2
/** Upper bound on planned checks, keeping the plan reviewable. */
export const MAX_CHECKS = 12
/** Upper bound on structured review findings per review. */
export const MAX_FINDINGS = 100
/** Upper bound on one finding's evidence text. */
export const MAX_FINDING_EVIDENCE = 2000
/** Upper bound on allowed implementation paths. */
export const MAX_ALLOWED_PATHS = 500
/** Upper bound on one command argument. */
export const MAX_ARGUMENT_LENGTH = 500
/** Upper bound on one command's argument count. */
export const MAX_COMMAND_ARGUMENTS = 32

/** Check kinds a plan may use. */
const CHECK_KINDS: readonly CheckKind[] = ['test', 'build', 'lint', 'typecheck', 'integration']

/** File names that must never enter a task commit. */
const SENSITIVE_FILE = /(^|\/)(\.env(?:\..+)?|id_rsa|.*\.(?:pem|key)|credentials(?:\..+)?)$/i

/** One rejected workflow operation with a stable code. */
export class WorkflowError extends Error {
  /**
   * @param message - concrete, actionable explanation for the model or the UI.
   * @param code - stable upper-snake classification for callers.
   */
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'WorkflowError'
  }
}

/** Reject a condition that a caller must not violate. */
function ensure(condition: unknown, message: string, code: string): asserts condition {
  if (!condition) throw new WorkflowError(message, code)
}

/** Position of one stage in the fixed order. */
function stageIndex(stage: StageId): number {
  return WORKFLOW_STAGES.indexOf(stage)
}

/** Whether a stage finished successfully or was explicitly skipped. */
function completedOrSkipped(item: WorkItem, stage: StageId): boolean {
  const status = item.stages[stage].status
  return status === 'completed' || status === 'skipped'
}

/** Whether a stage finished successfully. */
function completed(item: WorkItem, stage: StageId): boolean {
  return item.stages[stage].status === 'completed'
}

/**
 * Refuse operations on a task that already ended.
 * @param item - current record.
 */
export function requireNonterminal(item: WorkItem): void {
  ensure(!['cancelled', 'completed'].includes(item.status), 'Task is terminal', 'WORKFLOW_TERMINAL')
}

/**
 * Refuse progress while the task waits for a human or a resume.
 * @param item - current record.
 */
export function requireWritable(item: WorkItem): void {
  requireNonterminal(item)
  ensure(!['blocked', 'waiting_approval', 'paused'].includes(item.status),
    'Task is stopped; explicit resume or approval required', 'WORKFLOW_STOPPED')
}

/**
 * Require the tree to still be the one the task claimed.
 * @param item - current record.
 * @param snapshot - current repository facts.
 */
export function requireCheckpoint(item: WorkItem, snapshot: RepositorySnapshot): void {
  ensure(snapshot.branch === item.branch, 'Branch changed', 'WORKFLOW_BRANCH_CHANGED')
  ensure(snapshot.head === (item.commitRef ?? item.baseCommit),
    'HEAD changed outside workflow', 'WORKFLOW_HEAD_CHANGED')
}

/**
 * Require every earlier stage to be complete or explicitly skipped.
 * @param item - current record.
 * @param stage - stage whose prerequisites are checked.
 */
export function requirePrevious(item: WorkItem, stage: StageId): void {
  const index = stageIndex(stage)
  ensure(index > 0, 'Unknown or reserved stage', 'WORKFLOW_INVALID_STAGE')
  for (const previous of WORKFLOW_STAGES.slice(0, index)) {
    ensure(completedOrSkipped(item, previous), `Prerequisite ${previous} not completed or skipped`, 'WORKFLOW_STAGE_ORDER')
  }
}

/**
 * Require every changed file to be an allowed implementation path.
 * @param item - current record.
 * @param snapshot - current repository facts.
 */
export function requireScoped(item: WorkItem, snapshot: RepositorySnapshot): void {
  const allowed = item.allowedPaths
  ensure(allowed !== null, 'Implementation plan not configured', 'WORKFLOW_PLAN_MISSING')
  const outside = snapshot.files.filter(file => !allowed.includes(file))
  ensure(outside.length === 0,
    `Changes exceed explicitly allowed task paths: ${outside.slice(0, 5).join(', ')}`, 'WORKFLOW_OUT_OF_SCOPE')
}

/** Validate one repository-relative path from a plan or commit list. */
function requireSafePath(file: string): void {
  ensure(file.length > 0 && file.length < MAX_ARGUMENT_LENGTH, 'Empty or excessive file path', 'WORKFLOW_UNSAFE_PATH')
  ensure(!file.includes('\\') && !file.includes('\0'), 'Unsafe file path', 'WORKFLOW_UNSAFE_PATH')
  ensure(!file.startsWith('/') && !/^[a-zA-Z]:/.test(file), 'Absolute file path is not allowed', 'WORKFLOW_UNSAFE_PATH')
  ensure(!file.split('/').includes('..') && file !== '.' && file !== '..', 'Unsafe file path', 'WORKFLOW_UNSAFE_PATH')
  ensure(!file.startsWith('.git/') && !file.startsWith('node_modules/'),
    'Protected path is not allowed', 'WORKFLOW_UNSAFE_PATH')
}

/** Reject evidence paths outside the workspace and files that vanished. */
function requireEvidence(evidence: EvidenceRef): void {
  ensure(evidence.path.length > 0 && evidence.sha256.length === 64, 'Invalid evidence reference', 'WORKFLOW_EVIDENCE_INVALID')
}

/** Mutable view of the writable record fields used while building one patch. */
type WorkItemPatch = { -readonly [Key in keyof WorkItem]?: WorkItem[Key] }

/** Mark every later stage stale and drop dependent evidence. */
function invalidate(item: WorkItem, stage: StageId): WorkItemPatch {
  const index = stageIndex(stage)
  const stages = { ...item.stages }
  for (const later of WORKFLOW_STAGES.slice(index + 1)) {
    const current = stages[later]
    if (current.status !== 'pending') stages[later] = { status: 'stale', attempts: current.attempts }
  }
  const patch: WorkItemPatch = { stages }
  if (index <= 3) {
    patch.checks = null
    patch.allowedPaths = null
  }
  if (index <= 4) {
    patch.review = null
    patch.verification = null
  }
  if (index <= 6) {
    patch.verification = null
    patch.verificationRuns = []
  }
  return patch
}

/** Input that creates one task record. */
export interface CreateWorkItemInput {
  /** New task identity. */
  readonly taskId: TaskId
  /** Owning Session. */
  readonly sessionId: WorkItem['sessionId']
  /** Canonical workspace root. */
  readonly workspaceRoot: string
  /** Human task title. */
  readonly title: string
  /** Initial mode; switching never resumes work by itself. */
  readonly mode: WorkflowMode
  /** Branch the task claims. */
  readonly branch: string
  /** HEAD the task starts from. */
  readonly baseCommit: string
  /** ISO-8601 creation time. */
  readonly now: string
}

/**
 * Build the initial record: S0 is complete because the caller proved a clean
 * tree on a dedicated branch.
 * @param input - identity, workspace facts, and creation time.
 * @returns revision 1 at S1.
 */
export function createWorkItem(input: CreateWorkItemInput): WorkItem {
  const title = input.title.trim()
  ensure(title.length > 0 && title.length <= 1000, 'Missing or excessive task title', 'WORKFLOW_INVALID_TITLE')
  ensure(input.workspaceRoot.length > 0, 'Missing workspace root', 'WORKFLOW_INVALID_WORKSPACE')
  ensure(input.branch.length > 0, 'Detached HEAD not supported', 'WORKFLOW_DETACHED_HEAD')
  const stages = Object.fromEntries(WORKFLOW_STAGES.map(stage => [
    stage,
    stage === 'S0' ? { status: 'completed', attempts: 1 } : { status: 'pending', attempts: 0 },
  ])) as Record<StageId, StageState>
  return {
    schemaVersion: 1,
    revision: 1,
    taskId: input.taskId,
    sessionId: input.sessionId,
    workspaceRoot: input.workspaceRoot,
    title,
    mode: input.mode,
    status: 'ready',
    currentStage: 'S1',
    branch: input.branch,
    baseCommit: input.baseCommit,
    commitRef: null,
    stages,
    repairRounds: 0,
    noProgressRounds: 0,
    checks: null,
    allowedPaths: null,
    review: null,
    verification: null,
    verificationRuns: [],
    approval: null,
    blocker: null,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

/** Copy a mutation onto a new revision. */
function next(item: WorkItem, patch: WorkItemPatch, now: string): WorkItem {
  return { ...item, ...patch, revision: item.revision + 1, updatedAt: now }
}

/** Raise the revision of one stage while keeping its attempt count. */
function stageState(item: WorkItem, stage: StageId, state: StageState): Readonly<Record<StageId, StageState>> {
  return { ...item.stages, [stage]: state }
}

/**
 * Complete one evidence-only stage (S1, S2, S3, S4, S9).
 * @param item - current record.
 * @param stage - stage to complete.
 * @param evidence - accepted evidence file and digest.
 * @param snapshot - current repository facts.
 * @param now - ISO-8601 mutation time.
 * @returns the next record.
 */
export function applyStage(
  item: WorkItem,
  stage: Extract<StageId, 'S1' | 'S2' | 'S3' | 'S4' | 'S9'>,
  evidence: EvidenceRef,
  snapshot: RepositorySnapshot,
  now: string,
): WorkItem {
  requireCheckpoint(item, snapshot)
  requireWritable(item)
  requireEvidence(evidence)
  requirePrevious(item, stage)
  const invalidated = completed(item, stage) ? invalidate(item, stage) : {}
  const base: WorkItem = { ...item, ...invalidated }
  if (stage === 'S4') {
    ensure(base.checks !== null && base.checks.length >= MIN_CHECKS,
      'Test and build checks must be planned before implementation', 'WORKFLOW_PLAN_MISSING')
    requireScoped(base, snapshot)
    ensure(snapshot.files.length > 0, 'Implementation has no code changes', 'WORKFLOW_NO_CHANGES')
  }
  if (stage === 'S9') ensure(base.commitRef !== null, 'No commit reference', 'WORKFLOW_NO_COMMIT')
  const index = stageIndex(stage)
  const following = WORKFLOW_STAGES[index + 1] ?? stage
  return next(base, {
    stages: stageState(base, stage, { status: 'completed', attempts: base.stages[stage].attempts + 1, evidence }),
    currentStage: following,
    status: stage === 'S9' ? 'completed' : 'ready',
  }, now)
}

/**
 * Skip one eligible early stage (S1 or S2) with an explicit reason.
 * @param item - current record.
 * @param stage - stage to skip ('S1' | 'S2').
 * @param reason - reason why this stage is skipped (e.g. bugfix, minor change).
 * @param snapshot - current repository facts.
 * @param now - ISO-8601 mutation time.
 * @returns the next record.
 */
export function applySkip(
  item: WorkItem,
  stage: Extract<StageId, 'S1' | 'S2'>,
  reason: string,
  snapshot: RepositorySnapshot,
  now: string,
): WorkItem {
  requireCheckpoint(item, snapshot)
  requireWritable(item)
  requirePrevious(item, stage)
  ensure(reason.trim().length >= 4, 'Skip reason must be at least 4 characters', 'WORKFLOW_INVALID_REASON')
  const index = stageIndex(stage)
  const following = WORKFLOW_STAGES[index + 1] ?? stage
  return next(item, {
    stages: stageState(item, stage, {
      status: 'skipped',
      attempts: item.stages[stage].attempts + 1,
      reason: reason.trim(),
    }),
    currentStage: following,
    status: 'ready',
  }, now)
}

/** Plan accepted by the checks stage. */
export interface ChecksInput {
  /** Planned checks, one per kind. */
  readonly checks: readonly CheckPlan[]
  /** Exact files the implementation may touch. */
  readonly allowedPaths: readonly string[]
}

/**
 * Accept the implementation plan's checks and allowed paths.
 * @param item - current record at S4.
 * @param input - planned checks and allowed paths.
 * @param evidence - accepted plan evidence.
 * @param now - ISO-8601 mutation time.
 * @returns the next record.
 */
export function applyChecks(item: WorkItem, input: ChecksInput, evidence: EvidenceRef, now: string): WorkItem {
  requireNonterminal(item)
  requireEvidence(evidence)
  ensure(completed(item, 'S3') && !completed(item, 'S4'),
    'Checks must be configured between plan and implementation', 'WORKFLOW_STAGE_ORDER')
  const checks = input.checks
  ensure(checks.length >= MIN_CHECKS && checks.length <= MAX_CHECKS,
    `Expected ${MIN_CHECKS}-${MAX_CHECKS} test/build checks`, 'WORKFLOW_INVALID_CHECKS')
  const kinds = checks.map(check => check.kind)
  ensure(kinds.includes('test') && kinds.includes('build'), 'Test and build checks are required', 'WORKFLOW_INVALID_CHECKS')
  ensure(new Set(kinds).size === kinds.length, 'Each check kind must be unique', 'WORKFLOW_INVALID_CHECKS')
  for (const check of checks) {
    ensure(CHECK_KINDS.includes(check.kind), 'Invalid check kind', 'WORKFLOW_INVALID_CHECKS')
    ensure(check.command.length > 0 && check.command.length <= MAX_COMMAND_ARGUMENTS,
      'Invalid actual command', 'WORKFLOW_INVALID_CHECKS')
    ensure(check.command.every(argument => argument.length > 0 && argument.length <= MAX_ARGUMENT_LENGTH),
      'Invalid command argument', 'WORKFLOW_INVALID_CHECKS')
  }
  const allowed = input.allowedPaths
  ensure(allowed.length > 0 && allowed.length <= MAX_ALLOWED_PATHS,
    `Implementation plan requires 1-${MAX_ALLOWED_PATHS} exact allowedPaths`, 'WORKFLOW_INVALID_SCOPE')
  ensure(new Set(allowed).size === allowed.length, 'Duplicate allowed file path', 'WORKFLOW_INVALID_SCOPE')
  for (const file of allowed) requireSafePath(file)
  return next(item, {
    checks: checks.map(check => ({ kind: check.kind, command: [...check.command] })),
    allowedPaths: [...allowed].sort(),
    verificationRuns: [],
  }, now)
}

/**
 * Record one review outcome and route the task to repair, verification, or a
 * stop after repeated identical blocking findings.
 * @param item - current record at S5.
 * @param findings - structured findings from the review.
 * @param evidence - accepted review evidence.
 * @param snapshot - change set that was reviewed.
 * @param now - ISO-8601 mutation time.
 * @returns the next record.
 */
export function applyReview(
  item: WorkItem,
  findings: readonly ReviewFinding[],
  evidence: EvidenceRef,
  snapshot: RepositorySnapshot,
  now: string,
): WorkItem {
  requireCheckpoint(item, snapshot)
  requireWritable(item)
  requireEvidence(evidence)
  requirePrevious(item, 'S5')
  ensure(findings.length <= MAX_FINDINGS, 'Too many review findings', 'WORKFLOW_REVIEW_INVALID')
  for (const finding of findings) {
    ensure(finding.id.length > 0 && finding.id.length <= 200, 'Invalid review finding id', 'WORKFLOW_REVIEW_INVALID')
    ensure(['P0', 'P1', 'P2', 'P3'].includes(finding.severity), 'Invalid review severity', 'WORKFLOW_REVIEW_INVALID')
    ensure(['open', 'resolved', 'accepted'].includes(finding.status), 'Invalid review finding status', 'WORKFLOW_REVIEW_INVALID')
    ensure(finding.file.length > 0 && finding.evidence.length > 0
      && finding.evidence.length <= MAX_FINDING_EVIDENCE, 'Invalid review finding evidence', 'WORKFLOW_REVIEW_INVALID')
  }
  const open = findings.filter(finding => ['P0', 'P1'].includes(finding.severity) && finding.status !== 'resolved')
  const current = snapshot.files
  requireScoped(item, snapshot)
  ensure(current.length > 0 || snapshot.clean, 'Review requires a readable change set', 'WORKFLOW_NO_CHANGES')
  const findingIds = open.map(finding => finding.id).sort()
  const prior = item.review
  const sameFindings = prior !== null && prior.blockers > 0
    && JSON.stringify(prior.findingIds) === JSON.stringify(findingIds)
  const noProgressRounds = sameFindings ? item.noProgressRounds + 1 : 0
  const review: ReviewEvidence = { ...evidence, fingerprint: snapshot.fingerprint, blockers: open.length, findingIds }
  if (noProgressRounds >= 2) {
    return next(item, {
      noProgressRounds,
      review,
      stages: stageState(item, 'S5', { status: 'blocked', attempts: item.stages.S5.attempts + 1, evidence }),
      status: 'blocked',
      blocker: { reason: 'Review found the same unresolved blocking issues after two repair iterations', stage: 'S5' },
    }, now)
  }
  const stages = {
    ...stageState(item, 'S5', {
      status: open.length > 0 ? 'failed' : 'completed',
      attempts: item.stages.S5.attempts + 1,
      evidence,
    }),
    S7: { status: 'stale', attempts: item.stages.S7.attempts } satisfies StageState,
    S6: open.length === 0
      ? item.repairRounds > 0 && item.stages.S6.status === 'completed'
        ? item.stages.S6
        : { status: 'skipped', attempts: item.stages.S6.attempts, reason: 'No blocking findings or repair needed' } satisfies StageState
      : { status: 'pending', attempts: item.stages.S6.attempts } satisfies StageState,
  }
  return next(item, {
    noProgressRounds,
    review,
    stages,
    verification: null,
    verificationRuns: [],
    currentStage: open.length > 0 ? 'S6' : 'S7',
    status: 'ready',
  }, now)
}

/**
 * Record one repair round after the failing review, rejecting a repair that
 * changed no source.
 * @param item - current record whose review failed.
 * @param evidence - accepted repair evidence.
 * @param snapshot - change set after the repair.
 * @param now - ISO-8601 mutation time.
 * @returns the next record, back at S5.
 */
export function applyRepair(
  item: WorkItem,
  evidence: EvidenceRef,
  snapshot: RepositorySnapshot,
  now: string,
): WorkItem {
  requireCheckpoint(item, snapshot)
  requireWritable(item)
  requireEvidence(evidence)
  ensure(item.stages.S5.status === 'failed', 'No failed review requiring repair', 'WORKFLOW_NO_FAILED_REVIEW')
  requireScoped(item, snapshot)
  ensure(item.review === null || snapshot.fingerprint !== item.review.fingerprint,
    'No diff changes; repair made no progress', 'WORKFLOW_REPAIR_NO_PROGRESS')
  const repairRounds = item.repairRounds + 1
  ensure(repairRounds <= MAX_REPAIR_ROUNDS, 'Automatic repair limit reached', 'WORKFLOW_REPAIR_LIMIT')
  return next(item, {
    repairRounds,
    stages: {
      ...stageState(item, 'S6', { status: 'completed', attempts: repairRounds, evidence }),
      S5: { status: 'pending', attempts: item.stages.S5.attempts },
      S7: { status: 'stale', attempts: item.stages.S7.attempts },
    },
    currentStage: 'S5',
    verification: null,
    verificationRuns: [],
    status: 'ready',
  }, now)
}

/**
 * Fold one executed verification run into the record and settle S7.
 * @param item - current record at S7.
 * @param run - executed command and its observed outcome.
 * @param snapshot - change set after the run.
 * @param now - ISO-8601 mutation time.
 * @returns the next record.
 */
export function applyVerification(
  item: WorkItem,
  run: VerificationRun,
  snapshot: RepositorySnapshot,
  now: string,
): WorkItem {
  requireWritable(item)
  requireCheckpoint(item, snapshot)
  requirePrevious(item, 'S7')
  ensure(item.review !== null && item.review.blockers === 0, 'Unresolved blocking review findings', 'WORKFLOW_REVIEW_BLOCKERS')
  requireScoped(item, snapshot)
  ensure(item.review.fingerprint === snapshot.fingerprint, 'Source changed after review', 'WORKFLOW_SOURCE_CHANGED')
  const planned = item.checks?.find(check => check.kind === run.kind)
  ensure(planned !== undefined, 'Command is not part of the approved implementation plan', 'WORKFLOW_UNPLANNED_CHECK')
  ensure(JSON.stringify(planned.command) === JSON.stringify(run.command),
    'Command is not part of the approved implementation plan', 'WORKFLOW_UNPLANNED_CHECK')
  const runs = [...item.verificationRuns.filter(previous => previous.kind !== run.kind), run]
  const checks = item.checks ?? []
  const allPassed = checks.every(check => runs.some(candidate => candidate.kind === check.kind
    && candidate.passed && candidate.fingerprint === snapshot.fingerprint))
  const stage: StageState = !run.passed
    ? { status: 'failed', attempts: item.stages.S7.attempts + 1, evidence: { path: '', sha256: run.logSha256 } }
    : allPassed
      ? { status: 'completed', attempts: item.stages.S7.attempts + 1, evidence: { path: '', sha256: run.logSha256 } }
      : { status: 'pending', attempts: item.stages.S7.attempts }
  return next(item, {
    verificationRuns: runs,
    verification: allPassed ? { passed: true, fingerprint: snapshot.fingerprint, runs } : null,
    stages: stageState(item, 'S7', stage),
    currentStage: allPassed ? 'S8' : 'S7',
    status: run.passed ? 'ready' : 'blocked',
    ...run.passed ? {} : {
      blocker: { reason: 'Verification failed or changed source; inspect actual command and rerun', stage: 'S7' } satisfies WorkItemBlocker,
    },
  }, now)
}

/**
 * Record the local commit the service created.
 * @param item - current record at S8 with complete evidence.
 * @param commit - committed HEAD and the exact committed files.
 * @param now - ISO-8601 mutation time.
 * @returns the next record at S9.
 */
export function recordCommit(
  item: WorkItem,
  commit: { readonly commitRef: string; readonly files: readonly string[] },
  now: string,
): WorkItem {
  requireNonterminal(item)
  requirePrevious(item, 'S8')
  ensure(commit.commitRef.length > 0 && commit.files.length > 0, 'Invalid commit result', 'WORKFLOW_INVALID_COMMIT')
  ensure(item.branch !== 'main' && item.branch !== 'master', 'Commit on main/master disallowed', 'WORKFLOW_PROTECTED_BRANCH')
  return next(item, {
    commitRef: commit.commitRef,
    stages: stageState(item, 'S8', {
      status: 'completed',
      attempts: item.stages.S8.attempts + 1,
      evidence: { path: '', sha256: '' },
    }),
    currentStage: 'S9',
    status: 'ready',
  }, now)
}

/**
 * Preconditions for the local commit, checked before any Git staging.
 * @param item - current record.
 * @param snapshot - change set that will be committed.
 * @param files - exact files the caller wants to commit.
 */
export function requireCommitReady(item: WorkItem, snapshot: RepositorySnapshot, files: readonly string[]): void {
  requireWritable(item)
  requireCheckpoint(item, snapshot)
  requirePrevious(item, 'S8')
  requireScoped(item, snapshot)
  ensure(item.review !== null && item.review.fingerprint === snapshot.fingerprint, 'Review is stale', 'WORKFLOW_REVIEW_STALE')
  ensure(item.verification !== null && item.verification.fingerprint === snapshot.fingerprint,
    'Verification is stale', 'WORKFLOW_VERIFICATION_STALE')
  const checks = item.checks ?? []
  ensure(checks.every(check => item.verificationRuns.some(run => run.kind === check.kind
    && run.passed && run.fingerprint === snapshot.fingerprint)), 'Missing test/build evidence', 'WORKFLOW_VERIFICATION_STALE')
  const listed = [...new Set(files)].sort()
  ensure(listed.length > 0, 'Unsafe commit file list', 'WORKFLOW_INVALID_COMMIT')
  for (const file of listed) requireSafePath(file)
  ensure(JSON.stringify(listed) === JSON.stringify(snapshot.files),
    'Unowned files or incomplete file list', 'WORKFLOW_INVALID_COMMIT')
  ensure(listed.every(file => !SENSITIVE_FILE.test(file)), 'Sensitive candidate file', 'WORKFLOW_INVALID_COMMIT')
}

/**
 * Switch mode without resuming work.
 * @param item - current record.
 * @param mode - requested mode.
 * @param now - ISO-8601 mutation time.
 * @returns the paused record with the new mode.
 */
export function setMode(item: WorkItem, mode: WorkflowMode, now: string): WorkItem {
  requireNonterminal(item)
  ensure(mode === 'manual' || mode === 'auto', 'Expected manual or auto', 'WORKFLOW_INVALID_MODE')
  return next(item, { mode, status: item.status === 'waiting_approval' ? 'waiting_approval' : 'paused' }, now)
}

/**
 * Pause further progress.
 * @param item - current record.
 * @param now - ISO-8601 mutation time.
 * @returns the paused record.
 */
export function pause(item: WorkItem, now: string): WorkItem {
  requireNonterminal(item)
  return next(item, { status: item.status === 'waiting_approval' ? 'waiting_approval' : 'paused' }, now)
}

/**
 * Resume a paused, blocked, or ready task after re-checking its tree.
 * @param item - current record.
 * @param snapshot - current repository facts.
 * @param now - ISO-8601 mutation time.
 * @returns the runnable record.
 */
export function resume(item: WorkItem, snapshot: RepositorySnapshot, now: string): WorkItem {
  requireNonterminal(item)
  requireCheckpoint(item, snapshot)
  ensure(item.status !== 'waiting_approval', 'Approval required', 'WORKFLOW_APPROVAL_REQUIRED')
  return next(item, { status: 'ready', blocker: null }, now)
}

/**
 * Ask a human for a scoped decision.
 * @param item - current record.
 * @param reason - concrete reason and proposed recovery.
 * @param now - ISO-8601 mutation time.
 * @returns the waiting record.
 */
export function requestApproval(item: WorkItem, reason: string, now: string): WorkItem {
  requireNonterminal(item)
  const text = reason.trim()
  ensure(text.length >= 10, 'Give a concrete reason and proposed recovery', 'WORKFLOW_REASON_TOO_SHORT')
  return next(item, {
    status: 'waiting_approval',
    blocker: { reason: text, stage: item.currentStage },
  }, now)
}

/**
 * Record a scoped human approval and make the task runnable again.
 * @param item - current record.
 * @param decision - scoped decision text.
 * @param now - ISO-8601 mutation time.
 * @returns the approved record.
 */
export function approve(item: WorkItem, decision: string, now: string): WorkItem {
  requireNonterminal(item)
  ensure(item.status === 'waiting_approval', 'No pending approval', 'WORKFLOW_NO_PENDING_APPROVAL')
  const text = decision.trim()
  ensure(text.length >= 8, 'Missing scoped decision', 'WORKFLOW_REASON_TOO_SHORT')
  const approval: WorkItemApproval = { decision: text, stage: item.currentStage, approvedAt: now }
  return next(item, { approval, blocker: null, status: 'ready' }, now)
}

/**
 * Stop a task on an unrecoverable condition.
 * @param item - current record.
 * @param reason - concrete reason and proposed recovery.
 * @param now - ISO-8601 mutation time.
 * @returns the blocked record.
 */
export function block(item: WorkItem, reason: string, now: string): WorkItem {
  requireNonterminal(item)
  ensure(item.status !== 'waiting_approval', 'Pending approval cannot be replaced by a blocker', 'WORKFLOW_APPROVAL_REQUIRED')
  const text = reason.trim()
  ensure(text.length >= 10, 'Give a concrete reason and proposed recovery', 'WORKFLOW_REASON_TOO_SHORT')
  return next(item, {
    status: 'blocked',
    blocker: { reason: text, stage: item.currentStage },
  }, now)
}

/**
 * Cancel a task permanently.
 * @param item - current record.
 * @param reason - why the user cancelled.
 * @param now - ISO-8601 mutation time.
 * @returns the cancelled record.
 */
export function cancel(item: WorkItem, reason: string, now: string): WorkItem {
  requireNonterminal(item)
  const text = reason.trim()
  ensure(text.length >= 8, 'Give a reason for cancelling this Work Item', 'WORKFLOW_REASON_TOO_SHORT')
  return next(item, {
    status: 'cancelled',
    blocker: { reason: text, stage: item.currentStage },
  }, now)
}
