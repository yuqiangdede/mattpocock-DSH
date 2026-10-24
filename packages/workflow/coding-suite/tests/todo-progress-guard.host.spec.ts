/**
 * Behavior and composition proof for the fork-owned todo progress guard:
 * the pure transition, the real Loader resolving the shipped subpath, the
 * real `tools/post-execute` waterfall accepting the reminder, durable logging,
 * and delivery to the next model request. No network, no wall-clock wait.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { createUserMessage, ToolCallId, type GenerateOptions, type RequestMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies, unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as ToolTodo from '@deepseek-ai/dsh-tool-todo'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { defineContentToolFixture, executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as GuardBySubpath from '@deepseek-ai/dsh-coding-suite/todo-progress-guard'
import * as Guard from '../src/todo-progress-guard.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'

const policy = { minToolCalls: 5, staleAfterMs: 90_000, reminderCooldownMs: 90_000 }
const initial = (): Guard.ProgressState => ({ lastSyncAt: 0, callsSinceSync: 0, lastReminderAt: null })

const OPEN_PLAN = [
  { content: 'read the failing spec', status: 'in_progress' },
  { content: 'fix the guard', status: 'pending' },
]
const CLOSED_PLAN = [{ content: 'read the failing spec', status: 'completed' }]

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Replace the wall clock so reminder timing is exact in every test. */
function stubClock(start: number): { advance(ms: number): void } {
  let now = start
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  return { advance: (ms) => { now += ms } }
}

function requestText(messages: readonly RequestMessage[]): string {
  return messages
    .flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text))
    .join('\n')
}

function reminders(agent: Agent): SessionEvent<'user/message'>[] {
  return agent.session.snapshotEvents().filter(
    (event): event is SessionEvent<'user/message'> =>
      event.type === 'user/message' && event.data.source.kind === 'matt-todo-progress-guard',
  )
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

describe('reminder state', () => {
  it('does not invent progress or warn without a live plan', () => {
    expect(Guard.observeTool(undefined, 200_000, policy)).toEqual({ state: undefined, remind: false })
  })

  it('requires BOTH tool activity and elapsed time', () => {
    let state = initial()
    for (let index = 0; index < 4; index++) {
      const next = Guard.observeTool(state, 91_000, policy)
      expect(next.remind).toBe(false)
      state = next.state!
    }
    expect(Guard.observeTool(state, 91_000, policy).remind).toBe(true)
    expect(Guard.observeTool({ ...state, callsSinceSync: 8 }, 10_000, policy).remind).toBe(false)
  })

  it('rate-limits repeated reminders', () => {
    const first = Guard.observeTool({ ...initial(), callsSinceSync: 4 }, 95_000, policy)
    expect(first.remind).toBe(true)
    const next = Guard.observeTool(first.state, 96_000, policy)
    expect(next.remind).toBe(false)
    expect(Guard.observeTool(next.state, 185_000, policy).remind).toBe(true)
  })

  it('rejects a policy field that is not a positive integer', () => {
    expect(() => { Guard.apply({ on: () => undefined } as never, { minToolCalls: 0 }) })
      .toThrow('matt-todo-progress-guard: `minToolCalls` must be a positive integer, got 0')
    expect(() => { Guard.apply({ on: () => undefined } as never, { reminderCooldownMs: 1.5 }) })
      .toThrow('`reminderCooldownMs` must be a positive integer')
  })
})

describe('shipped Loader composition', () => {
  /**
   * Boot the shipped row shape through the vendored Loader with the real tool
   * runtime, projection registry, todo tool and progress guard.
   * @param configLines - YAML lines nested under the guard row's `config:` key.
   * @returns the loaded context.
   */
  async function boot(configLines: readonly string[]): Promise<Context> {
    root = await mkdtemp(join(tmpdir(), 'dsh-todo-guard-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-agent'",
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-tool-executor-native'",
      "- name: '@deepseek-ai/dsh-session-projection'",
      "- name: '@deepseek-ai/dsh-tool-todo'",
      '  config:',
      '    allowParallelInProgress: false',
      "- name: '@deepseek-ai/dsh-coding-suite/todo-progress-guard'",
      ...configLines.length > 0 ? ['  config:', ...configLines] : [],
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-agent', (await import('@deepseek-ai/dsh-agent')).default],
      ['@deepseek-ai/dsh-system-prompt', (await import('@deepseek-ai/dsh-system-prompt')).default],
      ['@deepseek-ai/dsh-tools', (await import('@deepseek-ai/dsh-tools')).default],
      ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
      ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
      ['@deepseek-ai/dsh-tool-todo', ToolTodo],
      // The shipped YAML names this subpath; the source alias and the Loader
      // module table must answer it with the real plugin namespace.
      ['@deepseek-ai/dsh-coding-suite/todo-progress-guard', GuardBySubpath],
    ])
    const internal = ctx.loader.internal
    if (internal === undefined || internal.version !== 'v2') throw new Error('expected the Node 24 module loader')
    internal.import = async (specifier: string) => {
      const loaded = modules.get(specifier)
      if (loaded === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return loaded
    }
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    for (const entry of ctx.loader.entries()) await entry.fiber?.await()
    return ctx
  }

  /** One registered agent owning a real Session, enough for tool execution. */
  async function owningAgent(ctx: Context): Promise<Agent> {
    const scope = ctx.plugin(() => {})
    const id = SessionId('todo-guard-loader-agent')
    const session = Session.create(id)
    const value: Agent = {
      id, options: {}, session, inbox: unsupportedInbox(), model: { current: () => undefined, select: () => {} },
      status: 'idle', ctx: scope.ctx,
      followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
      runMaintenance: task => task(new AbortController().signal),
      whenIdle: () => Promise.resolve(),
    }
    await ctx.agents.register(value)
    return value
  }

  it('resolves the shipped subpath and delivers the reminder through the real waterfall', async () => {
    const clock = stubClock(1_700_000_000_000)
    const ctx = await boot(['    minToolCalls: 2', '    staleAfterMs: 60000', '    reminderCooldownMs: 60000'])
    expect([...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled).map(entry => entry.options.name))
      .toEqual([])
    ctx.tools.register(defineContentToolFixture({
      name: 'probe', description: 'does work', parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }] },
    }))
    const owner = await owningAgent(ctx)
    const signal = new AbortController().signal

    await executeModelToolFixture(ctx, {
      signal, callId: ToolCallId('sync'), name: 'todo_write', arguments: { todos: OPEN_PLAN }, agent: owner,
    })
    clock.advance(60_000)
    const first = await executeModelToolFixture(ctx, {
      signal, callId: ToolCallId('probe-1'), name: 'probe', arguments: {}, agent: owner,
    })
    expect(first.additionalContexts).toBeUndefined()
    const second = await executeModelToolFixture(ctx, {
      signal, callId: ToolCallId('probe-2'), name: 'probe', arguments: {}, agent: owner,
    })
    expect(second.additionalContexts).toHaveLength(1)
    expect(second.additionalContexts?.[0]?.source).toMatchObject({
      kind: 'matt-todo-progress-guard',
      form: 'notice',
      summary: '2 calls since todo_write',
    })
  }, 30_000)

  it('fails loud at load when the configured threshold is not a positive integer', async () => {
    await expect(boot(['    minToolCalls: 0'])).rejects.toThrow('`minToolCalls` must be a positive integer')
  }, 30_000)
})

describe('real agent loop', () => {
  type Script = (StreamChunk[] | ((options: GenerateOptions) => StreamChunk[]))[]

  /** Mount the prerequisite services plus the todo tool, the guard and the loop. */
  async function harness(
    config: { minToolCalls: number; staleAfterMs: number; reminderCooldownMs: number },
    stepMs: number,
    script: Script,
  ) {
    const ctx = new Context()
    context = ctx
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(ToolTodo, { allowParallelInProgress: true })
    await ctx.plugin(Guard, config)
    await ctx.plugin(AgentLoop, { agents: [] })
    const clock = stubClock(1_700_000_000_000)
    ctx.tools.register(defineContentToolFixture({
      name: 'probe',
      description: 'does work',
      parameters: {},
      async execute() {
        clock.advance(stepMs)
        return [{ type: 'text', text: 'ok' }]
      },
    }))
    const adapter = new MockAdapter(script)
    ctx.llm.registerAdapter(['mock'], adapter)
    return { ctx, adapter }
  }

  it('logs the reminder durably and sends it with the next model request', async () => {
    const { ctx, adapter } = await harness({ minToolCalls: 2, staleAfterMs: 60_000, reminderCooldownMs: 60_000 }, 30_000, [
      toolCallResponse('sync', 'todo_write', { todos: OPEN_PLAN }),
      toolCallResponse('probe-1', 'probe', {}),
      toolCallResponse('probe-2', 'probe', {}),
      toolCallResponse('probe-3', 'probe', {}),
      textResponse('done'),
    ])
    const agent = await ctx.agentLoop.create(SessionId('guard-loop'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const logged = reminders(agent)
    expect(logged).toHaveLength(1)
    expect(logged[0]?.data.source).toMatchObject({
      kind: 'matt-todo-progress-guard',
      form: 'notice',
      summary: '2 calls since todo_write',
    })
    expect(logged[0]?.data.content.map(block => block.type === 'text' ? block.text : '').join(''))
      .toContain('Do not infer completion from edits alone')
    // The cooldown suppressed a second reminder on the third probe call.
    expect(requestText(adapter.requests.at(-1)?.messages ?? [])).toContain('Do not infer completion from edits alone')
    expect(requestText(adapter.requests[1]?.messages ?? [])).not.toContain('Do not infer completion from edits alone')
  }, 30_000)

  it('starts watching again only for the current turn plan', async () => {
    const { ctx } = await harness({ minToolCalls: 1, staleAfterMs: 60_000, reminderCooldownMs: 60_000 }, 60_000, [
      toolCallResponse('sync', 'todo_write', { todos: OPEN_PLAN }),
      textResponse('first turn done'),
      toolCallResponse('probe-1', 'probe', {}),
      textResponse('second turn done'),
    ])
    const agent = await ctx.agentLoop.create(SessionId('guard-turns'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(reminders(agent)).toHaveLength(0)

    // The next turn clears the todo projection; the guard must not remind about
    // the previous turn's retired plan even past every threshold.
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'again' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(reminders(agent)).toHaveLength(0)
  }, 30_000)

  it('treats a rejected todo write as neither a sync nor progress', async () => {
    const { ctx, adapter } = await harness({ minToolCalls: 2, staleAfterMs: 60_000, reminderCooldownMs: 60_000 }, 30_000, [
      toolCallResponse('sync', 'todo_write', { todos: OPEN_PLAN }),
      toolCallResponse('probe-1', 'probe', {}),
      toolCallResponse('bad-sync', 'todo_write', { todos: [{ content: '   ', status: 'pending' }] }),
      toolCallResponse('probe-2', 'probe', {}),
      textResponse('done'),
    ])
    const agent = await ctx.agentLoop.create(SessionId('guard-rejected'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(adapter.requests).toHaveLength(5)

    const writes = agent.session.snapshotEvents().filter(event => event.type === 'todo/write')
    expect(writes).toHaveLength(1)
    // The rejected write neither reset the counter nor hid the stale plan.
    expect(reminders(agent)).toHaveLength(1)
  }, 30_000)

  it('stops watching once every todo is completed', async () => {
    const { ctx } = await harness({ minToolCalls: 1, staleAfterMs: 60_000, reminderCooldownMs: 60_000 }, 60_000, [
      toolCallResponse('sync', 'todo_write', { todos: OPEN_PLAN }),
      toolCallResponse('finish', 'todo_write', { todos: CLOSED_PLAN }),
      toolCallResponse('probe-1', 'probe', {}),
      textResponse('done'),
    ])
    const agent = await ctx.agentLoop.create(SessionId('guard-finished'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(reminders(agent)).toHaveLength(0)
  }, 30_000)
})
