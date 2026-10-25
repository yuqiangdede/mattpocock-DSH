/**
 * Bundled coding skills provider: discovers and provides the 28 Matt Pocock
 * engineering skills and Pocket specification from package assets.
 *
 * @module @deepseek-ai/dsh-coding-suite/skill-provider
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** Skill provider configuration. */
export interface CodingSuiteSkillConfig {
  /** Optional custom assets root directory; defaults to packaged assets. */
  readonly assetRoot?: string
}

function parseSkill(raw: string, path: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`coding-suite: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
    ? (metadata as { description?: unknown }).description
    : undefined
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`coding-suite: ${path} has no description`)
  }
  return { description, content: raw.slice(frontmatter[0].length).trim() }
}

/**
 * Register bundled engineering skills with the Cordis skill service.
 * @param ctx - Context carrying the skill registry (`ctx.skills`).
 * @param config - Optional configuration for custom asset roots.
 * @returns Disposer function.
 * @throws If the asset directory or any visible skill asset is missing or invalid.
 */
export function registerCodingSuiteSkills(ctx: Context, config: CodingSuiteSkillConfig = {}): () => void {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/skills/', import.meta.url))
  if (!isAbsolute(assetRoot)) throw new Error('coding-suite: assetRoot must be an absolute directory')
  if (!existsSync(assetRoot)) throw new Error(`coding-suite: skill asset directory does not exist: ${assetRoot}`)

  let entries: Dirent[]
  try {
    entries = readdirSync(assetRoot, { withFileTypes: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`coding-suite: failed to read skill asset directory ${assetRoot}: ${detail}`, { cause: error })
  }
  const candidates: SkillCandidate[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const skillPath = join(assetRoot, entry.name, 'SKILL.md')
    if (!existsSync(skillPath)) throw new Error(`coding-suite: required skill file is missing: ${skillPath}`)

    let raw: string
    let description: string
    try {
      raw = readFileSync(skillPath, 'utf8')
      description = parseSkill(raw, skillPath).description
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`coding-suite: failed to load skill asset ${skillPath}: ${detail}`, { cause: error })
    }
    candidates.push({
      name: entry.name,
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'coding-suite',
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: join(assetRoot, entry.name).split(sep).join('/') },
      locator: skillPath,
    })
  }
  if (candidates.length === 0) throw new Error(`coding-suite: no skill directories found in ${assetRoot}`)

  const provider: SkillProvider = {
    name: 'coding-suite',
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      const { content } = parseSkill(raw, locator as string)
      return { ...summary, content }
    },
  }

  return ctx.skills.registerProvider(() => provider)
}
