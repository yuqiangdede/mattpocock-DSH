import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as CodingSuite from '../src/index.ts'

describe('CodingSuite Host Plugin', () => {
  it('applies and registers workflow service and skills provider', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)

    // Provide mock services required by CodingWorkflowService.inject
    ctx.provide('storageDomain', {
      mount: () => {},
      open: () => ({
        get: () => undefined,
        set: () => {},
        update: () => {},
        entries: () => [],
      }),
    } as never)
    ctx.provide('agents', {
      get: () => undefined,
    } as never)
    ctx.provide('workingDirectory', {
      get: () => process.cwd(),
    } as never)
    ctx.provide('shell', {
      sandboxMode: 'workspace-write',
      resolve: (req: unknown) => req,
      execute: async () => ({
        result: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }),
      }),
    } as never)
    ctx.provide('sandboxPolicy', {
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: process.cwd() }),
    } as never)

    await ctx.plugin(CodingSuite, {
      verificationTimeoutMs: 60_000,
      todoStaleMs: 300_000,
    })

    expect(CodingSuite.name).toBe('coding-suite')
    expect(ctx.codingWorkflow).toBeDefined()

    const skills = await ctx.skills.list()
    expect(skills.length).toBeGreaterThan(0)
  })
})
