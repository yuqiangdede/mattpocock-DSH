import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { DEFAULT_ACTIONS } from '../src/client/actions.ts'

const root = resolve(import.meta.dirname, '../../../../.dsh/skills')

describe('bundled coding skills', () => {
  it('provides every default launcher skill with matching invocation metadata', () => {
    for (const action of DEFAULT_ACTIONS) {
      if (action.kind !== 'skill') continue
      const source = readFileSync(join(root, action.skillId!, 'SKILL.md'), 'utf8')
      expect(source.split(/\r?\n/)).toContain(`name: ${action.skillId}`)
    }
  })
  it('bundles the fork-owned automatic workflow and its safety instructions', () => {
    const source = readFileSync(join(root, 'coding-workflow', 'SKILL.md'), 'utf8')
    expect(source).toContain('name: coding-workflow')
    expect(source).toContain('local-only Git commit')
    expect(existsSync(join(root, 'coding-workflow', 'scripts', 'workflow-state.mjs'))).toBe(true)
  })
  it('ships Matt support files and licenses without Superpowers skills', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'matt-source.json'), 'utf8')) as { repository: string; revision: string; skills: string[] }
    expect(manifest.repository).toBe('https://github.com/mattpocock/skills')
    expect(manifest.revision).toMatch(/^[a-f0-9]{40}$/)
    for (const name of manifest.skills) {
      expect(existsSync(join(root, name, 'LICENSE'))).toBe(true)
      expect(readFileSync(join(root, name, 'SKILL.md'), 'utf8')).not.toMatch(/superpowers/i)
    }
    for (const name of ['writing-plans', 'executing-plans', 'subagent-driven-development']) expect(existsSync(join(root, name))).toBe(false)
    for (const file of ['ask-matt/PHASE-BOUNDARIES.md', 'prototype/UI.md', 'prototype/LOGIC.md', 'improve-codebase-architecture/HTML-REPORT.md', 'domain-modeling/GLOSSARY-FORMAT.md', 'writing-for-agents/SKILL-MECHANICS.md']) expect(existsSync(join(root, file))).toBe(true)
    expect(readdirSync(root)).toContain('requirements-spec')
  })
})
