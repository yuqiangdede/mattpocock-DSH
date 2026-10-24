// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StageId, StageState, TaskId, WorkItem } from '@deepseek-ai/dsh-coding-workflow/client'
import { WorkflowPanel } from '../src/client/WorkflowPanel.tsx'

/** One record with every stage explicitly set. */
function task(status: WorkItem['status'], over: Partial<WorkItem> = {}, stagesOver: Partial<Record<StageId, StageState>> = {}): WorkItem {
  const base = Object.fromEntries(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']
    .map(stage => [stage, { status: 'pending' as const, attempts: 0 }]))
  return {
    schemaVersion: 1,
    revision: 3,
    taskId: brandString<TaskId>('11111111-1111-4111-8111-111111111111'),
    sessionId: brandString<SessionId>('session-1'),
    workspaceRoot: '/repo',
    title: 'Add proof',
    mode: 'auto',
    status,
    currentStage: 'S4',
    branch: 'coding/abc12345',
    baseCommit: 'a'.repeat(40),
    commitRef: null,
    stages: { ...base, ...stagesOver } as Record<StageId, StageState>,
    repairRounds: 0,
    noProgressRounds: 0,
    checks: null,
    allowedPaths: null,
    review: null,
    verification: null,
    verificationRuns: [],
    approval: null,
    blocker: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

afterEach(() => { cleanup() })

/** Locale lookup that returns its key so assertions read the dictionary entry. */
const t = (key: string): string => key

/** Render the panel with inert callbacks. */
function renderPanel(item: WorkItem, overrides: Partial<Parameters<typeof WorkflowPanel>[0]> = {}) {
  return render(<WorkflowPanel item={item} decision="" pending={false} onDecision={() => {}} onAction={() => {}} t={t} {...overrides} />)
}

describe('coding workflow panel', () => {
  it('shows the task identity, mode, branch, and every stage with its localized state', () => {
    renderPanel(task('ready', {}, {
      S0: { status: 'completed', attempts: 1 },
      S1: { status: 'completed', attempts: 1 },
      S2: { status: 'stale', attempts: 1 },
      S3: { status: 'failed', attempts: 2 },
    }))
    expect(screen.getByText(/11111111/)).toBeDefined()
    expect(screen.getByText(/auto/)).toBeDefined()
    expect(screen.getByText(/coding\/abc12345/)).toBeDefined()
    const stages = screen.getByRole('group', { name: 'workflowStages' })
    expect(stages.querySelectorAll('[title]')).toHaveLength(10)
    expect(stages.querySelector('[title="workflowStageCompleted"]')).not.toBeNull()
    expect(stages.querySelector('[title="workflowStageStale"]')).not.toBeNull()
    expect(stages.querySelector('[title="workflowStageFailed"]')).not.toBeNull()
  })

  it('renders the blocker line and only the commands the status allows', () => {
    renderPanel(task('blocked', { blocker: { reason: 'Reviewer unavailable', stage: 'S5' } }))
    expect(screen.getByRole('status').textContent).toContain('S5 · Reviewer unavailable')
    expect(screen.getByRole('button', { name: 'workflowResume' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'workflowApprove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'workflowPause' })).toBeNull()
  })

  it('requires a scoped decision before approving or cancelling', () => {
    const onAction = vi.fn()
    const { rerender } = render(<WorkflowPanel item={task('waiting_approval')} decision="" pending={false}
      onDecision={() => {}} onAction={onAction} t={t} />)
    const approve = screen.getByRole('button', { name: 'workflowApprove' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    fireEvent.click(approve)
    expect(onAction).not.toHaveBeenCalled()
    rerender(<WorkflowPanel item={task('waiting_approval')} decision="Approved: auth table only" pending={false}
      onDecision={() => {}} onAction={onAction} t={t} />)
    const enabled = screen.getByRole('button', { name: 'workflowApprove' }) as HTMLButtonElement
    expect(enabled.disabled).toBe(false)
    fireEvent.click(enabled)
    expect(onAction).toHaveBeenCalledWith('approve')
  })

  it('sends pause for a ready task and resume for a paused one', () => {
    const onAction = vi.fn()
    const { rerender } = render(<WorkflowPanel item={task('ready')} decision="" pending={false}
      onDecision={() => {}} onAction={onAction} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'workflowPause' }))
    expect(onAction).toHaveBeenCalledWith('pause')
    rerender(<WorkflowPanel item={task('paused')} decision="" pending={false}
      onDecision={() => {}} onAction={onAction} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'workflowResume' }))
    expect(onAction).toHaveBeenCalledWith('resume')
  })

  it.each(['ready', 'paused', 'blocked'] as const)('requires a cancellation reason for a %s task', (status) => {
    const onAction = vi.fn()
    const { rerender } = render(<WorkflowPanel item={task(status)} decision="" pending={false}
      onDecision={() => {}} onAction={onAction} t={t} />)
    expect(screen.getByRole('textbox', { name: 'workflowCancelReason' })).toBeDefined()
    const cancel = screen.getByRole('button', { name: 'workflowCancel' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    rerender(<WorkflowPanel item={task(status)} decision="Cancelled: duplicate task" pending={false}
      onDecision={() => {}} onAction={onAction} t={t} />)
    const enabled = screen.getByRole('button', { name: 'workflowCancel' }) as HTMLButtonElement
    expect(enabled.disabled).toBe(false)
    fireEvent.click(enabled)
    expect(onAction).toHaveBeenCalledWith('cancel')
  })

  it('offers no commands for a finished task', () => {
    renderPanel(task('completed'))
    expect(screen.queryByRole('button', { name: 'workflowPause' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'workflowCancel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'workflowApprove' })).toBeNull()
  })

  it('disables every control while a command is in flight', () => {
    renderPanel(task('waiting_approval'), { decision: 'Approved decision', pending: true })
    const buttons = screen.getAllByRole('button')
    for (const button of buttons) expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})
