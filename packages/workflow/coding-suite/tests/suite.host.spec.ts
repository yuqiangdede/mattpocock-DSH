/** Loader composition proof for the unified Host Coding Suite entrypoint. */

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as CodingSuite from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('CodingSuite Host Loader composition', () => {
  it('loads the shipped entry, skills, workflow service, and configured launcher settings', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-coding-suite-loader-'))
    const repository = join(root, 'repo')
    await mkdir(repository)
    execFileSync('git', ['init', '-b', 'main'], { cwd: repository, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Loader Test'], { cwd: repository })
    execFileSync('git', ['config', 'user.email', 'loader@example.invalid'], { cwd: repository })
    await writeFile(join(repository, 'README.md'), 'fixture\n')
    execFileSync('git', ['add', 'README.md'], { cwd: repository })
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repository, stdio: 'ignore' })

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-coding-suite'",
      '  config:',
      '    actionsJson: \'{"schemaVersion":3,"actions":[]}\'',
      '    todoStaleMs: 300000',
      '    verificationTimeoutMs: 60000',
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    ctx.provide('workingDirectory', { get: () => repository })
    // The workflow delegates command execution and sandbox policy to host-provided services.
    ctx.provide('shell', {
      sandboxMode: 'workspace-write',
      resolve: (request: unknown) => request,
      execute: async () => ({
        result: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }),
      }),
    } as never)
    ctx.provide('sandboxPolicy', {
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: repository }),
    } as never)

    const internal = ctx.loader.internal
    if (internal === undefined || internal.version !== 'v2') throw new Error('expected the Node 24 module loader')
    internal.import = async (specifier: string) => {
      if (specifier === '@deepseek-ai/dsh-coding-suite') return CodingSuite
      throw new Error(`unexpected Loader import: ${specifier}`)
    }
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    for (const entry of ctx.loader.entries()) await entry.fiber?.await()

    const suiteEntry = [...ctx.loader.entries()].find(entry => entry.options.name === 'coding-suite')
    expect(suiteEntry?.options.config).toMatchObject({
      actionsJson: '{"schemaVersion":3,"actions":[]}',
      todoStaleMs: 300000,
      verificationTimeoutMs: 60000,
    })
    expect(ctx.codingWorkflow).toBeDefined()
    expect((await ctx.skills.list()).length).toBeGreaterThan(0)

    const session = ctx.sessions.create(SessionId('coding-suite-loader-agent'))
    const agent: Agent = {
      id: session.id,
      options: {},
      session,
      inbox: createInboxStub(),
      model: { current: () => undefined, select: () => {} },
      status: 'idle',
      ctx,
      followup: () => {},
      steer: () => {},
      inject: () => {},
      send: () => {},
      cancel() {},
      runMaintenance: task => task(new AbortController().signal),
      whenIdle: () => Promise.resolve(),
    }
    await ctx.agents.register(agent)
    const item = await ctx.codingWorkflow.start(agent, 'Loader composition')
    expect(item.status).toBe('ready')
    expect(ctx.codingWorkflow.get(agent)).toEqual(item)
  }, 30_000)
})
