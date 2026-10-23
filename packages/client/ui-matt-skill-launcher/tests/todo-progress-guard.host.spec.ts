import { describe, expect, it, vi } from 'vitest'
import { apply, observeTool, type ProgressState } from '../src/todo-progress-guard.ts'

const policy = { minToolCalls: 5, staleAfterMs: 90000, reminderCooldownMs: 90000 }
const initial = (): ProgressState => ({ lastWriteAt: 0, callsSinceWrite: 0, lastReminderAt: null })

describe('Todo progress guard state', () => {
  it('does not invent progress or warn without an active observed todo', () => {
    expect(observeTool(undefined, 200000, policy)).toEqual({ state: undefined, remind: false })
  })
  it('requires BOTH tool activity and elapsed time', () => {
    let state = initial()
    for (let i = 0; i < 4; i++) {
      const next = observeTool(state, 91000, policy)
      expect(next.remind).toBe(false)
      state = next.state!
    }
    expect(observeTool(state, 91000, policy).remind).toBe(true)
    const tooSoon = observeTool({ ...state, callsSinceWrite: 8 }, 10000, policy)
    expect(tooSoon.remind).toBe(false)
  })
  it('rate-limits repeated reminders', () => {
    const first = observeTool({ ...initial(), callsSinceWrite: 4 }, 95000, policy)
    expect(first.remind).toBe(true)
    const next = observeTool(first.state, 96000, policy)
    expect(next.remind).toBe(false)
    expect(observeTool(next.state, 185000, policy).remind).toBe(true)
  })
})

describe('Host hook integration (no Agent-loop modification)', () => {
  it('only advises after a real todo write, rate-limits, and stops after completion', async () => {
    const hooks = new Map<string, unknown>()
    const ctx = { on: (event: string, hook: unknown) => { hooks.set(event, hook) } }
    apply(ctx as never)
    const events: { type: string; data?: { todos: { status: string }[] } }[] = [
      { type: 'turn/start' },
      { type: 'todo/write', data: { todos: [{ status: 'in_progress' }, { status: 'pending' }] } },
    ]
    const agent = { session: { snapshotEvents: () => events } }
    type Receipt = { kind: string; additionalContexts?: { source: { kind: string }; content: { text: string }[] }[] }
    const post = hooks.get('tools/post-execute') as (
      exec: { agent: typeof agent; name: string },
      result: { isError: boolean },
      next: () => Promise<Receipt>,
    ) => Promise<Receipt>
    const next = async (): Promise<Receipt> => ({ kind: 'proceed' })
    let now = 0
    const stub = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      await post({ agent, name: 'todo_write' }, { isError: false }, next)
      now = 91000
      for (let n = 0; n < 4; n++) {
        expect((await post({ agent, name: 'edit' }, { isError: false }, next)).additionalContexts).toBeUndefined()
      }
      const alerted = await post({ agent, name: 'edit' }, { isError: false }, next)
      expect(alerted.additionalContexts).toHaveLength(1)
      expect(alerted.additionalContexts?.[0]?.source.kind).toBe('matt-todo-progress-guard')
      expect(alerted.additionalContexts?.[0]?.content[0]?.text).toContain('Do not infer completion')
      now = 100000
      expect((await post({ agent, name: 'edit' }, { isError: false }, next)).additionalContexts).toBeUndefined()
      events.push({ type: 'todo/write', data: { todos: [{ status: 'completed' }] } })
      await post({ agent, name: 'todo_write' }, { isError: false }, next)
      now = 300000
      expect((await post({ agent, name: 'edit' }, { isError: false }, next)).additionalContexts).toBeUndefined()
    } finally {
      stub.mockRestore()
    }
  })

  it('does not mistake a failed todo_write for a completed plan', async () => {
    const hooks = new Map<string, unknown>()
    apply({ on: (event: string, hook: unknown) => { hooks.set(event, hook) } } as never)
    const events = [{ type: 'turn/start' }, { type: 'todo/write', data: { todos: [{ status: 'pending' }] } }]
    const agent = { session: { snapshotEvents: () => events } }
    const post = hooks.get('tools/post-execute') as (
      exec: { agent: typeof agent; name: string },
      result: { isError: boolean },
      next: () => Promise<{kind:string}>,
    ) => Promise<{kind:string;additionalContexts?:unknown[]}>
    const next = async () => ({kind:'proceed'})
    // No prior successful write was observed by this guard instance.
    await post({agent,name:'todo_write'}, {isError:true}, next)
    expect((await post({agent,name:'edit'}, {isError:false}, next)).additionalContexts).toBeUndefined()
  })
})
