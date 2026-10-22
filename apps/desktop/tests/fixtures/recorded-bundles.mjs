/** Test controller mounted by the shipped dsh Web profile; only model responses are scripted. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'

export const inject = ['webServer', 'llm', 'agents', 'agentPresets']

export function apply(ctx, config) {
  const scenario = config.scenario
  const fixture = config.fixture
  const observed = []
  ctx.on('session/event', (session, event) => { observed.push({ sessionId: session.id, type: event.type }) })
  const replay = installLlmReplay(ctx, {
    file: fixture,
    ...(scenario === 'side-chat' ? { childFiles: [config.childFixture] } : {}),
    providers: [{ id: 'desktop-snapshot', models: [{ id: 'fixture', contextWindow: 1_000_000, inputModalities: ['text', 'image'] }] }],
  })
  ctx.effect(() => replay.dispose)
  let parent
  ctx.effect(() => async () => { await parent?.dispose() })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-snapshot/create',
    async handler(request, response) {
      try {
        const buffers = []
        for await (const chunk of request) buffers.push(chunk)
        const { task } = JSON.parse(Buffer.concat(buffers).toString())
        const preset = scenario === 'computer-use' ? ctx.agentPresets.defaultId : 'minimal'
        if (scenario === 'computer-use' && preset !== 'desktop-computer-use') throw new Error('Computer Use is not the default preset')
        parent = await ctx.agents.create({
          sessionId: SessionId('desktop-recorded-parent'),
          meta: { cwd: config.cwd, agentPreset: preset },
          agentOptions: { provider: 'desktop-snapshot', model: 'fixture' },
          setup: agentCtx => ctx.agentPresets.mount(agentCtx, preset).then(() => undefined),
        })
        parent.agent.followup(createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'user' } }))
        await parent.agent.whenIdle()
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ sessionId: parent.agent.session.id }))
      } catch (error) {
        response.statusCode = 500
        response.end(String(error.stack ?? error))
      }
    } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-snapshot/settle',
    async handler(request, response) {
      try {
        const childId = new URL(request.url, 'http://localhost').searchParams.get('child')
        if (childId !== null) {
          const child = ctx.agents.get(SessionId(childId))
          if (child === undefined) throw new Error('Side Chat did not create a live child')
          await child.whenIdle()
        }
        replay?.assertConsumed()
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ observed }))
      } catch (error) {
        response.statusCode = 500
        response.end(String(error.stack ?? error))
      }
    } }))
}
