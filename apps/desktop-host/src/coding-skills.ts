/** Desktop coding skills packed beside the prepared runtime, outside ASAR. */

import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'

/** Loader identity for the application-owned coding-skill provider. */
export const name = 'desktop-coding-skills'
/** Application-selected prepared-runtime location. */
export interface Config {
  /** Prepared runtime directory whose sibling `coding-skills` holds the packed skill folders. */
  readonly source: string
}

/**
 * Make the packed coding skills readable from every Desktop session catalog.
 * @param ctx - Profile scope; the provider registers into the hosts-wide skill layer.
 * @param config - Prepared runtime location whose sibling directory carries the skills.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // Only this payload root: project, user, and preset roots stay with the presets so a
  // workspace copy keeps winning by rank and the payload needs no watchers.
  await ctx.plugin(skillFilesystem, {
    providerName: 'desktop-bundled',
    includeDefaultRoots: false,
    bundledSkillDir: join(dirname(config.source), 'coding-skills'),
    watch: false,
  })
}
