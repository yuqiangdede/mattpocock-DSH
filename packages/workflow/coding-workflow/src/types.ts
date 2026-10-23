/**
 * Durable and wire vocabulary of one coding-workflow Work Item: the staged
 * evidence model the Host owns, the Remote exchanges with the browser, and the
 * model reads through the `coding_workflow` tool.
 *
 * @module @deepseek-ai/dsh-coding-workflow/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable identifier of one Work Item. */
export type TaskId = Branded<'CodingWorkflowTaskId'>

/** Ordered stages of one workflow run. */
export const WORKFLOW_STAGES = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'] as const

/** One stage of a workflow run. */
export type StageId = typeof WORKFLOW_STAGES[number]

/** Lifecycle of the whole Work Item. */
export type WorkItemStatus =
  | 'created'
  | 'ready'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'cancelled'

/** Lifecycle of one stage. */
export type StageStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'stale'

/** Human-chosen execution mode. */
export type WorkflowMode = 'manual' | 'auto'

/** Kinds of pre-registered verification command. */
export type CheckKind = 'test' | 'build' | 'lint' | 'typecheck' | 'integration'

/** Severity of one structured review finding. */
export type ReviewSeverity = 'P0' | 'P1' | 'P2' | 'P3'

/** Disposition of one structured review finding. */
export type ReviewFindingStatus = 'open' | 'resolved' | 'accepted'

/** One evidence file with the digest accepted at its stage. */
export interface EvidenceRef {
  /** Absolute evidence path on the owning Host. */
  readonly path: string
  /** SHA-256 of the evidence file when the stage accepted it. */
  readonly sha256: string
}

/** One stage's status, attempts, and accepted evidence. */
export interface StageState {
  /** Current stage status. */
  readonly status: StageStatus
  /** Attempts that reached a terminal status. */
  readonly attempts: number
  /** Accepted evidence, absent for stages that need none. */
  readonly evidence?: EvidenceRef | undefined
  /** Explanation retained for a skipped or blocked stage. */
  readonly reason?: string | undefined
}

/** One planned verification command. */
export interface CheckPlan {
  /** Check kind; each kind appears at most once. */
  readonly kind: CheckKind
  /** Exact executable and arguments, without a shell. */
  readonly command: string[]
}

/** One structured review finding. */
export interface ReviewFinding {
  /** Stable finding identifier within the report. */
  readonly id: string
  /** Severity class. */
  readonly severity: ReviewSeverity
  /** Disposition after review or repair. */
  readonly status: ReviewFindingStatus
  /** Repository-relative file the finding concerns. */
  readonly file: string
  /** Concrete evidence for the finding. */
  readonly evidence: string
}

/** Accepted review evidence with the change-set fingerprint it reviewed. */
export interface ReviewEvidence extends EvidenceRef {
  /** Change-set fingerprint reviewed. */
  readonly fingerprint: string
  /** Open P0/P1 findings. */
  readonly blockers: number
  /** Sorted ids of the open P0/P1 findings. */
  readonly findingIds: string[]
}

/** One executed verification command. */
export interface VerificationRun {
  /** Check kind this run satisfies. */
  readonly kind: CheckKind
  /** Exact command that ran. */
  readonly command: string[]
  /** Process exit code, or null when the process could not start. */
  readonly exitCode: number | null
  /** Whether the command exited zero without changing the change set. */
  readonly passed: boolean
  /** Change-set fingerprint the run covered. */
  readonly fingerprint: string
  /** SHA-256 of the captured output. */
  readonly logSha256: string
  /** Spawn failure message, empty when the process ran. */
  readonly error: string
  /** ISO-8601 time of the run. */
  readonly ranAt: string
}

/** All required checks passing against one change-set fingerprint. */
export interface VerificationEvidence {
  /** Always true: a partial result is not recorded as evidence. */
  readonly passed: true
  /** Change-set fingerprint every run covered. */
  readonly fingerprint: string
  /** Passing runs, one per required check kind. */
  readonly runs: VerificationRun[]
}

/** One human approval scoped to a stage. */
export interface WorkItemApproval {
  /** Scoped decision text. */
  readonly decision: string
  /** Stage the decision unblocks. */
  readonly stage: StageId
  /** ISO-8601 approval time. */
  readonly approvedAt: string
}

/** Why the workflow stopped and where it stopped. */
export interface WorkItemBlocker {
  /** Concrete reason and proposed recovery. */
  readonly reason: string
  /** Stage the blocker belongs to. */
  readonly stage: StageId
}

/** Durable record of one workflow task. */
export interface WorkItem {
  /** Stored record format version. */
  readonly schemaVersion: 1
  /** Monotonic revision; every accepted mutation increments it. */
  readonly revision: number
  /** Task identity. */
  readonly taskId: TaskId
  /** Session that owns the task. */
  readonly sessionId: SessionId
  /** Canonical workspace root the task claims. */
  readonly workspaceRoot: string
  /** Human task title. */
  readonly title: string
  /** Human-chosen mode. */
  readonly mode: WorkflowMode
  /** Whole-task lifecycle. */
  readonly status: WorkItemStatus
  /** Stage the workflow is working on. */
  readonly currentStage: StageId
  /** Git branch the task owns. */
  readonly branch: string
  /** HEAD recorded when the task started. */
  readonly baseCommit: string
  /** Local commit the task produced, once committed. */
  readonly commitRef: string | null
  /** Per-stage state for every stage. */
  readonly stages: Record<StageId, StageState>
  /** Completed repair rounds, capped by the automatic-repair limit. */
  readonly repairRounds: number
  /** Consecutive reviews reporting the same unresolved blocking findings. */
  readonly noProgressRounds: number
  /** Planned verification commands, once the plan stage accepted them. */
  readonly checks: CheckPlan[] | null
  /** Exact files the implementation may touch. */
  readonly allowedPaths: string[] | null
  /** Accepted review evidence. */
  readonly review: ReviewEvidence | null
  /** Accepted verification evidence. */
  readonly verification: VerificationEvidence | null
  /** Executed verification runs, latest per check kind. */
  readonly verificationRuns: VerificationRun[]
  /** Latest scoped human approval. */
  readonly approval: WorkItemApproval | null
  /** Current blocker, or null while runnable. */
  readonly blocker: WorkItemBlocker | null
  /** ISO-8601 creation time. */
  readonly createdAt: string
  /** ISO-8601 time of the latest accepted mutation. */
  readonly updatedAt: string
}

/** Facts about one working tree that a transition validates against. */
export interface RepositorySnapshot {
  /** Current branch name. */
  readonly branch: string
  /** Current HEAD commit. */
  readonly head: string
  /** Whether the tree has no uncommitted or untracked change. */
  readonly clean: boolean
  /** Changed and untracked paths, repository-relative and sorted. */
  readonly files: string[]
  /** Digest of the complete change set; equal digests mean no source change. */
  readonly fingerprint: string
}

/** Payload of one accepted Work Item mutation. */
export interface CodingWorkflowChanged {
  /** Session whose task changed. */
  readonly sessionId: SessionId
  /** Changed task. */
  readonly taskId: TaskId
  /** New revision. */
  readonly revision: number
  /** New whole-task status. */
  readonly status: WorkItemStatus
  /** New current stage. */
  readonly currentStage: StageId
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One accepted Work Item mutation.
     * @mode emit
     * @param payload - session, task, and the new stage/status.
     */
    'coding-workflow/changed'(payload: CodingWorkflowChanged): void
  }
}
