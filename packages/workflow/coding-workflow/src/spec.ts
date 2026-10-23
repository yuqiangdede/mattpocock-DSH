/**
 * Durable domain declaration of coding-workflow Work Items: the zod schemas
 * that validate the stored format and the `defineDomain` spec the service
 * opens over the routed storage backend.
 *
 * @module @deepseek-ai/dsh-coding-workflow/spec
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { WORKFLOW_STAGES } from './types.ts'
import type { TaskId, WorkItem } from './types.ts'

/** Work Item id at the durable boundary; branding has no runtime representation. */
const taskId = z.string().transform(value => value as TaskId)

/** Session id at the durable boundary. */
const sessionId = z.string().transform(value => brandString<SessionId>(value))

/** Evidence reference stored with an accepted stage. */
const evidenceRef = z.object({
  path: z.string(),
  sha256: z.string(),
})

/** One stage's stored state. */
const stageState = z.object({
  status: z.enum(['pending', 'running', 'waiting_approval', 'completed', 'failed', 'blocked', 'skipped', 'stale']),
  attempts: z.number().int().nonnegative(),
  evidence: evidenceRef.optional(),
  reason: z.string().optional(),
})

/** One planned verification command. */
const checkPlan = z.object({
  kind: z.enum(['test', 'build', 'lint', 'typecheck', 'integration']),
  command: z.array(z.string()),
})

/** Accepted review evidence. */
const reviewEvidence = evidenceRef.extend({
  fingerprint: z.string(),
  blockers: z.number().int().nonnegative(),
  findingIds: z.array(z.string()),
})

/** One executed verification command. */
const verificationRun = z.object({
  kind: z.enum(['test', 'build', 'lint', 'typecheck', 'integration']),
  command: z.array(z.string()),
  exitCode: z.number().int().nullable(),
  passed: z.boolean(),
  fingerprint: z.string(),
  logSha256: z.string(),
  error: z.string(),
  ranAt: z.string(),
})

/** Accepted verification evidence. */
const verificationEvidence = z.object({
  passed: z.literal(true),
  fingerprint: z.string(),
  runs: z.array(verificationRun),
})

/** One scoped human approval. */
const workItemApproval = z.object({
  decision: z.string(),
  stage: z.enum(WORKFLOW_STAGES),
  approvedAt: z.string(),
})

/** One blocker. */
const workItemBlocker = z.object({
  reason: z.string(),
  stage: z.enum(WORKFLOW_STAGES),
})

/**
 * The complete stored Work Item. Every stage id is required, so a record that
 * omits one fails validation instead of silently producing an unusable task.
 */
export const workItemRecord = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  taskId,
  sessionId,
  workspaceRoot: z.string(),
  title: z.string(),
  mode: z.enum(['manual', 'auto']),
  status: z.enum(['created', 'ready', 'running', 'waiting_approval', 'paused', 'blocked', 'completed', 'cancelled']),
  currentStage: z.enum(WORKFLOW_STAGES),
  branch: z.string(),
  baseCommit: z.string(),
  commitRef: z.string().nullable(),
  stages: z.record(z.enum(WORKFLOW_STAGES), stageState),
  repairRounds: z.number().int().nonnegative(),
  noProgressRounds: z.number().int().nonnegative(),
  checks: z.array(checkPlan).nullable(),
  allowedPaths: z.array(z.string()).nullable(),
  review: reviewEvidence.nullable(),
  verification: verificationEvidence.nullable(),
  verificationRuns: z.array(verificationRun),
  approval: workItemApproval.nullable(),
  blocker: workItemBlocker.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Stored Work Item shape inferred from {@link workItemRecord}. */
export type WorkItemRecord = z.infer<typeof workItemRecord>

/**
 * Compile-time proof that the stored schema and the wire record agree in both
 * directions; a drifted field on either side fails this assignment.
 */
export const RECORD_MATCHES_WIRE: WorkItemRecord extends WorkItem
  ? WorkItem extends WorkItemRecord ? true : never
  : never = true

/**
 * Durable registry state: revision-independent facts a Service restart keeps.
 * The global stays reserved for this record so later fields can be added
 * without changing the table layout.
 */
const codingWorkflowDomainState = z.object({
  initialized: z.boolean(),
})

/** Stored registry state inferred from {@link codingWorkflowDomainState}. */
export type CodingWorkflowDomainState = z.infer<typeof codingWorkflowDomainState>

/**
 * The coding-workflow domain spec: one `workItems` table keyed by
 * {@link TaskId}. Records are individual documents so one task's evidence
 * rewrite never rewrites every stored task.
 */
export const codingWorkflowDomainSpec = defineDomain({
  name: 'coding_workflow',
  version: 1,
  layout: 'per-record',
  global: {
    schema: codingWorkflowDomainState,
    initial: { initialized: false },
  },
  tables: { work_items: domainTable<TaskId, WorkItemRecord>(workItemRecord) },
})
