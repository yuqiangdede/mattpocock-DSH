/** Unit and integration tests for the bundled coding suite skills provider. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { registerCodingSuiteSkills } from '../src/skill-provider.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-coding-suite-skills-'))
  roots.push(root)
  return root
}

describe('coding suite bundled skills provider', () => {
  it('registers the provider and lists all bundled engineering skills and pocket', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)

    const dispose = registerCodingSuiteSkills(ctx)
    expect(typeof dispose).toBe('function')

    const catalog = await ctx.skills.list()
    expect(catalog.length).toBeGreaterThanOrEqual(28)

    const skillNames = catalog.map(s => s.name)
    expect(skillNames).toContain('ask-matt')
    expect(skillNames).toContain('diagnosing-bugs')
    expect(skillNames).toContain('code-review')
    expect(skillNames).toContain('to-spec')
    expect(skillNames).toContain('to-tickets')
    expect(skillNames).toContain('pocket-maintenance')
    expect(skillNames).toContain('setup-matt-pocock-skills')

    const askMatt = catalog.find(s => s.name === 'ask-matt')
    expect(askMatt?.description.length).toBeGreaterThan(10)
    expect(askMatt?.invocation.modelInvocable).toBe(true)
    expect(askMatt?.invocation.userInvocable).toBe(true)

    const loaded = await ctx.skills.get('pocket-maintenance')
    expect(loaded).toBeDefined()
    expect(loaded?.content).toContain('pocket')

    dispose()
    const afterDisposal = await ctx.skills.list()
    expect(afterDisposal.some(s => s.name === 'ask-matt')).toBe(false)
    await ctx.fiber.dispose()
  })

  it('fails at registration when the configured asset directory is missing', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const missing = join(tempRoot(), 'missing')

    expect(() => registerCodingSuiteSkills(ctx, { assetRoot: missing }))
      .toThrow(`coding-suite: skill asset directory does not exist: ${missing}`)
    await ctx.fiber.dispose()
  })

  it('fails at registration when a visible skill directory has no SKILL.md', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const root = tempRoot()
    const skillPath = join(root, 'broken-skill', 'SKILL.md')
    mkdirSync(join(root, 'broken-skill'))

    expect(() => registerCodingSuiteSkills(ctx, { assetRoot: root }))
      .toThrow(`coding-suite: required skill file is missing: ${skillPath}`)
    await ctx.fiber.dispose()
  })

  it('reports the affected path when a skill frontmatter is invalid', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const root = tempRoot()
    const skillPath = join(root, 'broken-skill', 'SKILL.md')
    mkdirSync(join(root, 'broken-skill'))
    writeFileSync(skillPath, '# missing frontmatter\n')

    expect(() => registerCodingSuiteSkills(ctx, { assetRoot: root }))
      .toThrow(`coding-suite: failed to load skill asset ${skillPath}: coding-suite: ${skillPath} has no YAML frontmatter`)
    await ctx.fiber.dispose()
  })
})
