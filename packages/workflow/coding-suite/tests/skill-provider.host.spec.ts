/** Unit and integration tests for the bundled coding suite skills provider. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { registerCodingSuiteSkills } from '../src/skill-provider.ts'

describe('coding suite bundled skills provider', () => {
  it('registers the provider and lists all bundled engineering skills and pocket', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)

    const dispose = registerCodingSuiteSkills(ctx)
    expect(typeof dispose).toBe('function')

    const catalog = await ctx.skills.list()
    expect(catalog.length).toBeGreaterThanOrEqual(28)

    // Verify key engineering skills are discovered
    const skillNames = catalog.map(s => s.name)
    expect(skillNames).toContain('ask-matt')
    expect(skillNames).toContain('diagnosing-bugs')
    expect(skillNames).toContain('code-review')
    expect(skillNames).toContain('to-spec')
    expect(skillNames).toContain('to-tickets')
    expect(skillNames).toContain('pocket-maintenance')
    expect(skillNames).toContain('setup-matt-pocock-skills')

    // Verify each skill has non-empty description
    const askMatt = catalog.find(s => s.name === 'ask-matt')
    expect(askMatt?.description.length).toBeGreaterThan(10)
    expect(askMatt?.invocation.modelInvocable).toBe(true)
    expect(askMatt?.invocation.userInvocable).toBe(true)

    // Verify loading full skill body
    const loaded = await ctx.skills.get('pocket-maintenance')
    expect(loaded).toBeDefined()
    expect(loaded?.content).toContain('pocket')

    // Verify disposal cleanly unregisters provider
    dispose()
    const afterDisposal = await ctx.skills.list()
    expect(afterDisposal.some(s => s.name === 'ask-matt')).toBe(false)
  })
})
