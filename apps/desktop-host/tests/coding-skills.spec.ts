import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { expect, it, vi } from 'vitest'
import * as desktopCodingSkills from '../src/coding-skills.ts'

it('publishes the packed coding skills and removes them on disposal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-coding-skills-'))
  vi.stubEnv('DSH_HOME', root)
  const ctx = new Context()

  try {
    const packed = join(root, 'runtime', 'coding-skills', 'packaged-skill')
    await mkdir(packed, { recursive: true })
    await writeFile(join(packed, 'SKILL.md'), [
      '---', 'name: packaged-skill', 'description: Ships with the desktop application', '---', '',
      '# Packaged skill', '',
    ].join('\n'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    expect('default' in desktopCodingSkills).toBe(false)
    expect(ctx.loader.unwrapExports(desktopCodingSkills)).toBe(desktopCodingSkills)
    const modules = new Map<string, unknown>([
      ['skills', SkillRegistry], ['coding-skills', desktopCodingSkills],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected plugin ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    const config = join(root, 'cordis.yml')
    await writeFile(config, [
      '- name: skills', '- name: coding-skills',
      '  config:',
      `    source: ${JSON.stringify(join(root, 'runtime', 'primary-runtime'))}`,
      '',
    ].join('\n'))
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    for (const entry of ctx.loader.entries()) await entry.fiber?.await()

    const listed = await ctx.skills.list()
    expect(listed.map(skill => skill.name)).toEqual(['packaged-skill'])
    expect(listed[0]?.source).toBe('bundled')
    expect((await ctx.skills.get('packaged-skill'))?.content).toContain('# Packaged skill')

    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'coding-skills')
    expect(entry).toBeDefined()
    await entry?.fiber?.dispose()
    expect(await ctx.skills.list()).toEqual([])
  } finally {
    try { await ctx.fiber.dispose() }
    finally {
      vi.unstubAllEnvs()
      await rm(root, { recursive: true, force: true })
    }
  }
})
