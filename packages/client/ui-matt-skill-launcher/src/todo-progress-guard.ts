/**
 * Fork-owned, per-Agent reminder when a live todo plan stops being updated.
 * This plugin does not change todo/write, complete steps, or mutate files.
 * Mounted inside the standard and PTC Agent presets, not the global Host plane.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'matt-todo-progress-guard'

export interface Config {
  minToolCalls?: number
  staleAfterMs?: number
  reminderCooldownMs?: number
}
export const Config: z<Config> = z.object({
  minToolCalls: z.number().default(5),
  staleAfterMs: z.number().default(90000),
  reminderCooldownMs: z.number().default(90000),
})

export interface ProgressState {
  lastWriteAt: number
  callsSinceWrite: number
  lastReminderAt: number | null
}

/** Pure state transition, with an explicit clock for deterministic tests. */
export function observeTool(
  state: ProgressState | undefined,
  now: number,
  config: Required<Config>,
): { state: ProgressState | undefined; remind: boolean } {
  if (!state) return { state: undefined, remind: false }
  const next = { ...state, callsSinceWrite: state.callsSinceWrite + 1 }
  const due = next.callsSinceWrite >= config.minToolCalls
    && now - next.lastWriteAt >= config.staleAfterMs
    && (next.lastReminderAt === null || now - next.lastReminderAt >= config.reminderCooldownMs)
  if (due) next.lastReminderAt = now
  return { state: next, remind: due }
}

type TodoEvent = { type: string; data?: { todos?: readonly { status: string }[] } }
interface AgentView {
  session: { snapshotEvents(): readonly TodoEvent[] }
}
interface ToolCallView {
  agent?: AgentView
  name: string
}
interface ToolResultView { isError?: boolean }
interface Notice {
  id: string
  role: 'user'
  content: { type: 'text'; text: string }[]
  source: { kind: 'matt-todo-progress-guard'; form: 'notice'; summary: string }
}
interface Decision {
  kind: string
  additionalContexts?: readonly Notice[] | readonly unknown[]
}
interface HookBus {
  on(
    event: 'tools/post-execute',
    listener: (exec: ToolCallView, result: ToolResultView, next: () => Promise<Decision>) => Promise<Decision>,
  ): unknown
  on(
    event: 'agent/pre-step',
    listener: (input: { agent: AgentView; messages: readonly { source: { kind: string } }[] }, next: () => Promise<unknown>) => Promise<unknown>,
  ): unknown
}

/** Read only the current turn's authoritative todo snapshot; never infer completion from tool names. */
function hasOpenTodos(agent: AgentView): boolean {
  const events = agent.session.snapshotEvents()
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!
    if (event.type === 'turn/start') return false
    if (event.type === 'todo/write') {
      return event.data?.todos?.some(todo => todo.status === 'pending' || todo.status === 'in_progress') ?? false
    }
  }
  return false
}

function validatePositiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('matt-todo-progress-guard: invalid ' + name)
  return value
}

export function apply(ctx: Context, config: Config = {}): void {
  const policy: Required<Config> = {
    minToolCalls: validatePositiveInteger('minToolCalls', config.minToolCalls ?? 5),
    staleAfterMs: validatePositiveInteger('staleAfterMs', config.staleAfterMs ?? 90000),
    reminderCooldownMs: validatePositiveInteger('reminderCooldownMs', config.reminderCooldownMs ?? 90000),
  }
  const states = new WeakMap<AgentView, ProgressState>()
  // Narrow structural adapter at the Cordis event boundary: this package is deliberately
  // independent from the upstream Agent, Session and Tools implementation imports.
  const hooks = ctx as unknown as HookBus
  hooks.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    const agent = exec.agent
    if (!agent) return downstream
    if (exec.name === 'todo_write') {
      // A rejected write is not a sync. A finished plan is not watched.
      if (!result?.isError && downstream.kind !== 'block' && hasOpenTodos(agent)) {
        states.set(agent, { lastWriteAt: Date.now(), callsSinceWrite: 0, lastReminderAt: null })
      } else if (!result?.isError && downstream.kind !== 'block' && !hasOpenTodos(agent)) {
        states.delete(agent)
      }
      return downstream
    }
    const observed = observeTool(states.get(agent), Date.now(), policy)
    if (observed.state) states.set(agent, observed.state)
    if (!observed.remind) return downstream
    const notice: Notice = {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text:
        'Progress sync reminder: tool activity has continued while the todo list remained unchanged. '
        + 'Compare actual outputs with each todo, call todo_write now if a step has genuinely changed, '
        + 'and mark completed only with evidence. Do not infer completion from edits alone. '
        + 'If the current step is still in progress, keep it in_progress and continue working.' }],
      source: { kind: 'matt-todo-progress-guard', form: 'notice', summary: 'Todo progress may need review' },
    }
    return { ...downstream, additionalContexts: [notice, ...downstream.additionalContexts ?? []] }
  })
  hooks.on('agent/pre-step', async ({ agent, messages }, next) => {
    // A fresh user turn clears the previous turn's projection; never leak an old plan forward.
    if (messages.some(message => message.source.kind === 'user')) states.delete(agent)
    return next()
  })
}
