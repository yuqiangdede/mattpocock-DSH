/**
 * Presentation of one coding Work Item: stage chips, blocker, and the
 * revision-checked commands a human may send. Pure props; the launcher owns
 * the Remote calls and the draft state.
 *
 * @module @deepseek-ai/dsh-client-ui-matt-skill-launcher/client/WorkflowPanel
 */

import type { StageStatus, WorkItem } from '@deepseek-ai/dsh-coding-workflow/client'
import type { LauncherLocaleKey } from './locales.ts'
import css from './Launcher.module.css'

/** Localized name of one stage status. */
const STAGE_LABEL: Record<StageStatus, LauncherLocaleKey> = {
  pending: 'workflowStagePending',
  running: 'workflowStageRunning',
  waiting_approval: 'workflowStageWaitingApproval',
  completed: 'workflowStageCompleted',
  failed: 'workflowStageFailed',
  blocked: 'workflowStageBlocked',
  skipped: 'workflowStageSkipped',
  stale: 'workflowStageStale',
}

/** Tasks whose panel still accepts a decision or a pause/resume/cancel command. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(['ready', 'paused', 'blocked', 'waiting_approval'])

/** Minimum decision text the Host accepts for an approval or a cancellation. */
export const MIN_DECISION_LENGTH = 8

/** Props of the coding-task panel. */
export interface WorkflowPanelProps {
  /** Current durable record. */
  readonly item: WorkItem
  /** Draft decision text. */
  readonly decision: string
  /** Whether a command is in flight. */
  readonly pending: boolean
  /** Update the decision draft. */
  readonly onDecision: (value: string) => void
  /** Send one command to the Host. */
  readonly onAction: (action: 'approve' | 'pause' | 'resume' | 'cancel') => void
  /** Locale lookup owned by the launcher seat. */
  readonly t: (key: LauncherLocaleKey) => string
}

/**
 * Render one task's progress and commands.
 * @param props - record, draft, pending flag, callbacks, and locale lookup.
 * @returns the panel element.
 */
export function WorkflowPanel({ item, decision, pending, onDecision, onAction, t }: WorkflowPanelProps) {
  const stages = (Object.keys(item.stages) as (Extract<keyof WorkItem['stages'], string>)[])
    .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
  const decisionReady = decision.trim().length >= MIN_DECISION_LENGTH
  return <div className={css.workflowPanel} data-coding-workflow>
    <div className={css.workflowHead}>
      <span className={css.workflowTitle}>{t('workflowTask')} {item.taskId.slice(0, 8)}</span>
      <span className={css.workflowMeta}>
        {t('workflowModeLabel')} {item.mode} · {t('workflowBranchLabel')} {item.branch}
      </span>
    </div>
    <div className={css.stageRow} role="group" aria-label={t('workflowStages')}>
      {stages.map((stage) => {
        const status = item.stages[stage].status
        const state = status === 'completed' ? css.stageDone
          : status === 'failed' || status === 'blocked' ? css.stageBlocked
            : status === 'stale' ? css.stageStale
              : status === 'skipped' ? css.stageSkipped : css.stagePending
        return <span key={stage} className={`${css.stageChip} ${state}`} title={t(STAGE_LABEL[status] ?? 'workflowStagePending')}>{stage}</span>
      })}
    </div>
    {item.blocker !== null && <div className={css.workflowBlocker} role="status">
      {item.blocker.stage} · {item.blocker.reason}
    </div>}
    <div className={css.workflowActions}>
      {item.status === 'waiting_approval' && <>
        <input className={css.workflowInput} value={decision} onChange={(event) => { onDecision(event.target.value) }}
          placeholder={t('workflowDecision')} aria-label={t('workflowDecision')} disabled={pending} />
        <button type="button" className={css.action} disabled={pending || !decisionReady}
          onClick={() => { onAction('approve') }}>{t('workflowApprove')}</button>
      </>}
      {OPEN_STATUSES.has(item.status) && item.status !== 'waiting_approval' &&
        <input className={css.workflowInput} value={decision} onChange={(event) => { onDecision(event.target.value) }}
          placeholder={t('workflowCancelReason')} aria-label={t('workflowCancelReason')} disabled={pending} />}
      {item.status === 'ready' && <button type="button" className={css.action} disabled={pending}
        onClick={() => { onAction('pause') }}>{t('workflowPause')}</button>}
      {(item.status === 'paused' || item.status === 'blocked') &&
        <button type="button" className={css.action} disabled={pending}
          onClick={() => { onAction('resume') }}>{t('workflowResume')}</button>}
      {OPEN_STATUSES.has(item.status) && <button type="button" className={css.action}
        disabled={pending || !decisionReady} onClick={() => { onAction('cancel') }}>{t('workflowCancel')}</button>}
    </div>
  </div>
}
