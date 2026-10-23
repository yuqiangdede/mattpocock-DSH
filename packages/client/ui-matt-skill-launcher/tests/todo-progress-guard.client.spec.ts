import { describe, expect, it } from 'vitest'
import { observeTool, type ProgressState } from '../src/todo-progress-guard.ts'

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
