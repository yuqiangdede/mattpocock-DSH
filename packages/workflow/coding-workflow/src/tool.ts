/**
 * Model-facing `coding_workflow` tool: the only way a model advances a Work
 * Item. Every verb delegates to {@link CodingWorkflowService}, which validates
 * the repository facts and owns the durable record.
 *
 * @module @deepseek-ai/dsh-coding-workflow/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { WORKFLOW_STAGES } from './types.ts'
import type { CheckKind, CheckPlan, ReviewFinding, WorkItem } from './types.ts'
import type { CodingWorkflowService } from './index.ts'

/** Verbs the model may invoke. */
const ACTIONS = [
  'start', 'status', 'stage', 'skip', 'checks', 'review', 'repair', 'verify', 'commit',
  'mode', 'pause', 'resume', 'approval', 'block', 'cancel',
] as const

/** Stage arguments the model may submit directly. */
const EVIDENCE_STAGES = ['S1', 'S2', 'S3', 'S4', 'S9'] as const

/** Check kinds a plan may declare. */
const CHECK_KINDS = ['test', 'build', 'lint', 'typecheck', 'integration'] as const

/** Model-visible result of one successful verb; absent values are empty strings. */
interface ToolValue {
  taskId: string
  revision: number
  status: string
  currentStage: string
  mode: string
  branch: string
  commitRef: string
  blocker: string
  next: string
  stages: { stage: string; status: string }[]
}

/** Next expected verb, so the model does not have to re-derive the stage order. */
function nextStep(item: WorkItem): string {
  if (item.status === 'blocked') return `resolve the blocker first: ${item.blocker?.reason ?? 'see blocker'}`
  if (item.status === 'waiting_approval') return 'wait for the scoped human decision'
  if (item.status === 'paused') return 'wait for an explicit mode change or resume'
  switch (item.currentStage) {
    case 'S1': return 'stage S1 (requirements evidence) or skip S1 with reason'
    case 'S2': return 'stage S2 (specification evidence) or skip S2 with reason'
    case 'S3': return 'stage S3 (implementation plan evidence)'
    case 'S4': return item.checks === null ? 'checks (planned commands and allowed paths)' : 'stage S4 (implementation evidence)'
    case 'S5': return 'review (evidence plus structured findings)'
    case 'S6': return 'repair (fix the blocking findings)'
    case 'S7': return 'verify each planned check'
    case 'S8': return 'commit the exact changed files'
    default: return 'stage S9 (delivery report evidence)'
  }
}

/** Compact value for the model, derived from the durable record. */
function toValue(item: WorkItem): ToolValue {
  return {
    taskId: item.taskId,
    revision: item.revision,
    status: item.status,
    currentStage: item.currentStage,
    mode: item.mode,
    branch: item.branch,
    commitRef: item.commitRef ?? '',
    blocker: item.blocker === null ? '' : `${item.blocker.stage}: ${item.blocker.reason}`,
    next: nextStep(item),
    stages: WORKFLOW_STAGES.map(stage => ({ stage, status: item.stages[stage].status })),
  }
}

/** Require one verb-specific argument. */
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`coding_workflow: "${name}" is required for this action`)
  return value
}

/**
 * Build the `coding_workflow` tool definition for one service instance.
 * @param service - authoritative workflow service.
 * @returns the registration-ready definition.
 */
export function codingWorkflowTool(service: CodingWorkflowService): ToolDefinition {
  return defineTool({
    name: 'coding_workflow',
    description: [
      'Drive one staged coding task with durable evidence gates. Call start before changing code; every later step refuses until its prerequisites are recorded.',
      'Stages: S0 workspace, S1 requirements, S2 specification, S3 plan, S4 implementation, S5 review, S6 repair, S7 verification, S8 local commit, S9 report.',
      'Evidence paths name files inside the workspace that prove the stage; checks must be planned before S4; verify runs each planned command; commit stages exactly the listed changed files. No push, merge, or remote write exists.',
    ].join(' '),
    parameters: {
      action: { type: 'string', required: true, enum: [...ACTIONS], description: 'Verb to run.' },
      title: { type: 'string', description: 'start: human task title.' },
      stage: { type: 'string', enum: [...EVIDENCE_STAGES], description: 'stage: stage whose evidence is recorded.' },
      evidencePath: { type: 'string', description: 'stage/checks/review/repair: workspace-relative evidence file.' },
      checks: {
        type: 'array',
        description: 'checks: planned verification commands (test and build required).',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true, enum: [...CHECK_KINDS], description: 'Check kind.' },
            command: {
              type: 'array',
              required: true,
              items: { type: 'string' },
              description: 'Executable and arguments, run without a shell.',
            },
          },
        },
      },
      allowedPaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'checks: exact repository-relative files implementation may touch.',
      },
      findings: {
        type: 'array',
        description: 'review: structured findings.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Stable finding id.' },
            severity: { type: 'string', required: true, enum: ['P0', 'P1', 'P2', 'P3'], description: 'Severity.' },
            status: { type: 'string', required: true, enum: ['open', 'resolved', 'accepted'], description: 'Disposition.' },
            file: { type: 'string', required: true, description: 'Repository-relative file.' },
            evidence: { type: 'string', required: true, description: 'Concrete evidence for the finding.' },
          },
        },
      },
      kind: { type: 'string', enum: [...CHECK_KINDS], description: 'verify: planned check kind to run.' },
      command: { type: 'array', items: { type: 'string' }, description: 'verify: exact planned command.' },
      files: { type: 'array', items: { type: 'string' }, description: 'commit: exact changed files to commit.' },
      mode: { type: 'string', enum: ['manual', 'auto'], description: 'mode: switch without resuming.' },
      reason: { type: 'string', description: 'approval/block/cancel: concrete reason and recovery.' },
    },
    output: {
      schema: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          taskId: { type: 'string', required: true },
          revision: { type: 'integer', required: true },
          status: { type: 'string', required: true },
          currentStage: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          commitRef: { type: 'string', required: true },
          blocker: { type: 'string', required: true },
          next: { type: 'string', required: true },
          stages: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                stage: { type: 'string', required: true },
                status: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Work Item ${value.taskId.slice(0, 8)} · ${value.status} · ${String(value.currentStage)} · ${value.mode}`
          + (value.blocker === '' ? '' : `\nBlocked — ${value.blocker}`)
          + `\nNext: ${value.next}`,
      }],
    },
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) throw new Error('coding_workflow requires an owning agent session')
      const action = args.action
      switch (action) {
        case 'start': return toValue(await service.start(agent, required(args.title, 'title')))
        case 'status': {
          const item = service.get(agent)
          if (item === null) throw new Error('coding_workflow: no Work Item in this Session; call start first')
          return toValue(item)
        }
        case 'stage': return toValue(await service.stage(agent, {
          stage: required(args.stage, 'stage'),
          evidencePath: required(args.evidencePath, 'evidencePath'),
        }))
        case 'skip': {
          const stage = required(args.stage, 'stage')
          if (stage !== 'S1' && stage !== 'S2') {
            throw new Error(`coding_workflow: stage "${String(stage)}" cannot be skipped; only S1 and S2 may be skipped`)
          }
          return toValue(await service.skip(agent, {
            stage,
            reason: required(args.reason, 'reason'),
          }))
        }
        case 'checks': return toValue(await service.checks(agent, {
          evidencePath: required(args.evidencePath, 'evidencePath'),
          checks: required(args.checks, 'checks') as CheckPlan[],
          allowedPaths: required(args.allowedPaths, 'allowedPaths'),
        }))
        case 'review': return toValue(await service.review(agent, {
          evidencePath: required(args.evidencePath, 'evidencePath'),
          findings: required(args.findings, 'findings') as ReviewFinding[],
        }))
        case 'repair': return toValue(await service.repair(agent, required(args.evidencePath, 'evidencePath')))
        case 'verify': return toValue(await service.verify(agent, {
          kind: required(args.kind, 'kind') as CheckKind,
          command: required(args.command, 'command'),
          callId: exec.callId,
        }, exec.signal))
        case 'commit': return toValue(await service.commit(agent, { files: required(args.files, 'files') }))
        case 'mode': return toValue(await service.updateMode(agent, required(args.mode, 'mode')))
        case 'pause': return toValue(await service.pauseCurrent(agent))
        case 'resume': return toValue(await service.resumeCurrent(agent))
        case 'approval': return toValue(await service.requestApproval(agent, required(args.reason, 'reason')))
        case 'block': return toValue(await service.block(agent, required(args.reason, 'reason')))
        case 'cancel': return toValue(await service.cancelCurrent(agent, required(args.reason, 'reason')))
        default: throw new Error(`coding_workflow: unknown action "${String(action)}"`)
      }
    },
  })
}

/**
 * Register the tool on one Context; the returned disposer removes it.
 * @param ctx - Context whose tools registry receives the definition.
 * @param service - authoritative workflow service.
 * @returns the registration disposer.
 */
export function registerCodingWorkflowTool(ctx: Context, service: CodingWorkflowService): () => void {
  return ctx.tools.register(codingWorkflowTool(service))
}
