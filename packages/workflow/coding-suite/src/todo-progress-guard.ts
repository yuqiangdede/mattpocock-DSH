/**
 * Fork-owned, per-Session reminder when a live todo plan stops being updated.
 * This plugin never calls `todo_write`, changes a status, or touches files; it
 * only reads the `todos` Session projection and appends model-facing context.
 * Mounted inside the standard and PTC Agent presets, not the global Host plane.
 *
 * Progress is read from the authoritative projection, which the todo tool
 * replaces only when it commits a `todo/write` event and which the next
 * `turn/start` clears. A rejected write and a fresh turn therefore cancel the
 * watch without this plugin inspecting tool decisions or message sources.
 *
 * @module @deepseek-ai/dsh-client-ui-matt-skill-launcher/todo-progress-guard
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision } from '@deepseek-ai/dsh-tools'
import type { Session } from '@deepseek-ai/dsh-session'
// Type-only: resolves the required ctx.sessionProjections service declaration.
import type {} from '@deepseek-ai/dsh-session-projection'
// Type-only: declares the `todos` projection key this guard reads.

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** The fork-owned todo-progress reminder context. */
    'matt-todo-progress-guard': { kind: 'matt-todo-progress-guard' } & ContextFormed
  }
}

/** Loader identity of this fork-owned guard. */
export const name = 'matt-todo-progress-guard'

/** A todo plan lives in the Session projection the todo tool owns. */
export const inject = ['sessionProjections']

/** The model-facing tool whose committed writes define one progress sync. */
const TODO_TOOL = 'todo_write'

/** Reminder policy; every field is a validated deployment choice. */
export interface Config {
  /** Tool calls that must follow the last sync before a reminder is possible. */
  minToolCalls?: number
  /** Milliseconds the plan must stay unchanged before a reminder is possible. */
  staleAfterMs?: number
  /** Milliseconds between two reminders for one live plan. */
  reminderCooldownMs?: number
}

export const Config: z<Config> = z.object({
  minToolCalls: z.number().default(5),
  staleAfterMs: z.number().default(90000),
  reminderCooldownMs: z.number().default(90000),
})

/** One Session's progress counters; derived state, never persisted. */
export interface ProgressState {
  /** Wall clock of the last committed todo sync. */
  lastSyncAt: number
  /** Tool calls observed since that sync. */
  callsSinceSync: number
  /** Wall clock of the last reminder, or null before the first one. */
  lastReminderAt: number | null
}

/** One observation: either no live plan, or the advanced counters and whether they are due. */
export type Observation =
  | { readonly state: undefined; readonly remind: false }
  | { readonly state: ProgressState; readonly remind: boolean }

/**
 * Pure transition for one observed tool call, with an explicit clock so tests
 * are deterministic. `undefined` means no live plan is being watched.
 * @param state - the Session's counters, or undefined without a live plan.
 * @param now - current wall clock in milliseconds.
 * @param config - resolved reminder policy.
 * @returns the next counters and whether a reminder is due now.
 */
export function observeTool(
  state: ProgressState | undefined,
  now: number,
  config: Required<Config>,
): Observation {
  if (state === undefined) return { state: undefined, remind: false }
  const next: ProgressState = { ...state, callsSinceSync: state.callsSinceSync + 1 }
  const due = next.callsSinceSync >= config.minToolCalls
    && now - next.lastSyncAt >= config.staleAfterMs
    && (next.lastReminderAt === null || now - next.lastReminderAt >= config.reminderCooldownMs)
  if (!due) return { state: next, remind: false }
  return { state: { ...next, lastReminderAt: now }, remind: true }
}

/**
 * The reminder text. It asks for a check against evidence and forbids
 * inferring completion from edits, so the model cannot read the nudge as a
 * completion signal.
 * @returns the model-facing reminder body.
 */
function reminderText(): string {
  return 'Progress sync reminder: tool activity has continued while the todo list remained unchanged. '
    + 'Compare actual outputs with each todo, call todo_write now if a step has genuinely changed, '
    + 'and mark completed only with evidence. Do not infer completion from edits alone. '
    + 'If the current step is still in progress, keep it in_progress and continue working.'
}

/**
 * Whether the projected plan still has work this guard can watch. A null
 * projection means no plan in this turn; a plan whose items are all completed
 * is finished work, not stale work.
 * @param todos - the projected plan, or undefined when the unit is unmounted.
 * @returns true only for a live plan with an unfinished item.
 */
function hasOpenTodos(todos: unknown): boolean {
  return Array.isArray(todos) && todos.some((todo: unknown) => typeof todo === 'object'
    && todo !== null && 'status' in todo && (todo.status === 'pending' || todo.status === 'in_progress'))
}

/**
 * Validate one positive integer policy field.
 * @param field - field name reported in the failure.
 * @param value - configured value.
 * @returns the validated value.
 * @throws when the value is not a positive integer.
 */
function positiveInteger(field: keyof Config, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`matt-todo-progress-guard: \`${field}\` must be a positive integer, got ${String(value)}`)
  }
  return value
}

/**
 * Install the guard's listener.
 * @param ctx - plugin context; the listener is scoped to it and disposed with it.
 * @param config - validated {@link Config}; fields are re-checked fail-loud here.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const policy: Required<Config> = {
    minToolCalls: positiveInteger('minToolCalls', config.minToolCalls ?? 5),
    staleAfterMs: positiveInteger('staleAfterMs', config.staleAfterMs ?? 90000),
    reminderCooldownMs: positiveInteger('reminderCooldownMs', config.reminderCooldownMs ?? 90000),
  }
  const states = new WeakMap<Session, ProgressState>()
  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    const downstream = await next()
    const agent = exec.agent
    if (agent === undefined) return downstream
    const session = agent.session
    const todos = ctx.sessionProjections.stateOf(session, 'todos')
    // No plan in this turn, or only finished work: there is nothing to compare progress against.
    if (!hasOpenTodos(todos)) {
      states.delete(session)
      return downstream
    }
    if (exec.name === TODO_TOOL) {
      // A committed write is the sync itself. A rejected write is neither a sync nor progress.
      if (!result.isError) states.set(session, { lastSyncAt: Date.now(), callsSinceSync: 0, lastReminderAt: null })
      return downstream
    }
    const observed = observeTool(states.get(session), Date.now(), policy)
    if (observed.state !== undefined) states.set(session, observed.state)
    if (!observed.remind) return downstream
    const reminder = createUserMessage({
      content: [{ type: 'text', text: reminderText() }],
      source: {
        kind: 'matt-todo-progress-guard',
        form: 'notice',
        summary: boundContextSummary(`${observed.state.callsSinceSync} calls since ${TODO_TOOL}`),
      },
    })
    // Enrich, never veto: the reminder rides whichever decision downstream produced.
    if (downstream.kind === 'block') {
      return { kind: 'block', feedback: downstream.feedback, additionalContexts: [reminder, ...downstream.additionalContexts ?? []] }
    }
    return { ...downstream, additionalContexts: [reminder, ...downstream.additionalContexts ?? []] }
  })
}
