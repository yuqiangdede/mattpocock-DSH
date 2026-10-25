import { describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StageId, StageState, TaskId, WorkItem } from '@deepseek-ai/dsh-coding-workflow/client'
import type { CodingWorkflowChanged } from '@deepseek-ai/dsh-coding-workflow/client'
import { createCodingWorkflowSource } from '../src/client/workflow-source.ts'
import type { CodingWorkflowRead } from '../src/client/workflow-source.ts'

/** One accepted-mutation payload delivered by the forwarded event. */
const CHANGE: CodingWorkflowChanged = {
  sessionId: brandString<SessionId>('session-1'),
  taskId: brandString<TaskId>('11111111-1111-4111-8111-111111111111'),
  revision: 2,
  status: 'ready',
  currentStage: 'S1',
}

/** One stored record with the fields the source reads. */
function task(revision: number, over: Partial<WorkItem> = {}): WorkItem {
  const stages = Object.fromEntries(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']
    .map(stage => [stage, { status: 'pending' as const, attempts: 0 }])) as Record<StageId, StageState>
  return {
    schemaVersion: 1,
    revision,
    taskId: brandString<TaskId>('11111111-1111-4111-8111-111111111111'),
    sessionId: brandString<SessionId>('session-1'),
    workspaceRoot: '/repo',
    title: 'Task',
    mode: 'manual',
    status: 'ready',
    currentStage: 'S1',
    branch: 'coding/abc',
    baseCommit: 'a'.repeat(40),
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}


/** Fixed successful read. */
async function readOnce(item: WorkItem | null): Promise<CodingWorkflowRead> {
  return { ok: true, value: item }
}

describe('coding workflow source', () => {
  it('reads once per observer lifetime and publishes the record', async () => {
    const source = createCodingWorkflowSource({
      read: () => readOnce(task(1)),
      subscribeChange: () => () => {},
      subscribeReset: () => () => {},
    })
    expect(source.getSnapshot()).toEqual({ item: null, error: null, loading: true })
    const seen: string[] = []
    const stop = source.subscribe(() => { seen.push(source.getSnapshot().loading ? 'loading' : 'ready') })
    await vi.waitFor(() => { expect(source.getSnapshot().item?.revision).toBe(1) })
    expect(source.getSnapshot().loading).toBe(false)
    expect(seen).toContain('ready')
    stop()
  })

  it('re-reads after a change event and a transport reset', async () => {
    const read = vi.fn(async () => ({ ok: true as const, value: task(read.mock.calls.length) }))
    let change: (() => void) | undefined
    let reset: (() => void) | undefined
    const source = createCodingWorkflowSource({
      read,
      subscribeChange: (listener) => { change = () => { listener(CHANGE) }; return () => { change = undefined } },
      subscribeReset: (listener) => { reset = listener; return () => { reset = undefined } },
    })
    const stop = source.subscribe(() => {})
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(1) })
    change?.()
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
    reset?.()
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(3) })
    expect(source.getSnapshot().item?.revision).toBe(3)
    stop()
    expect(change).toBeUndefined()
    expect(reset).toBeUndefined()
  })

  it('ignores a superseded read', async () => {
    const pending: Array<(result: CodingWorkflowRead) => void> = []
    let change: (() => void) | undefined
    const source = createCodingWorkflowSource({
      read: () => new Promise<CodingWorkflowRead>((resolve) => { pending.push(resolve) }),
      subscribeChange: (listener) => { change = () => { listener(CHANGE) }; return () => {} },
      subscribeReset: () => () => {},
    })
    const stop = source.subscribe(() => {})
    expect(pending).toHaveLength(1)
    change?.()
    expect(pending).toHaveLength(2)
    // Resolve the newest read first, then the superseded one: the older value must not win.
    pending[1]?.({ ok: true, value: task(2) })
    await vi.waitFor(() => { expect(source.getSnapshot().item?.revision).toBe(2) })
    pending[0]?.({ ok: true, value: task(1) })
    await Promise.resolve()
    expect(source.getSnapshot().item?.revision).toBe(2)
    stop()
  })

  it('keeps the last record when a read fails and clears the error on success', async () => {
    let fail = false
    const source = createCodingWorkflowSource({
      read: async () => fail ? { ok: false, error: { message: 'Session unavailable' } } : { ok: true, value: task(4) },
      subscribeChange: () => () => {},
      subscribeReset: () => () => {},
    })
    const stop = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.getSnapshot().item?.revision).toBe(4) })
    stop()
    fail = true
    const stopAgain = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.getSnapshot().error).toBe('Session unavailable') })
    expect(source.getSnapshot().item?.revision).toBe(4)
    fail = false
    stopAgain()
    const stopFinal = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.getSnapshot().error).toBeNull() })
    stopFinal()
  })

  it('releases every subscription when the last observer leaves', async () => {
    const release = vi.fn()
    const source = createCodingWorkflowSource({
      read: () => readOnce(null),
      subscribeChange: () => () => { release() },
      subscribeReset: () => () => { release() },
    })
    const first = source.subscribe(() => {})
    const second = source.subscribe(() => {})
    first()
    expect(release).not.toHaveBeenCalled()
    second()
    expect(release).toHaveBeenCalledTimes(2)
  })
})
