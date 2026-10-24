/**
 * Launcher Host entry: persists the versioned CodingAction document through
 * DSH Settings and publishes the resolved launcher deployment values to the
 * browser face. No Agent or Session state is stored here.
 *
 * @module @deepseek-ai/dsh-client-ui-matt-skill-launcher
 */

import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LAUNCHER_CONFIG_GLOBAL, LauncherDeploymentFields, type LauncherDeployment } from './config.ts'

/** Host configuration: the Settings-owned action document plus the browser deployment values. */
export interface Config extends LauncherDeployment {
  actionsJson: Volatile<string | undefined>
}

export const Config = z.object({
  actionsJson: z.string().volatile(),
  ...LauncherDeploymentFields,
})

/**
 * Publish the resolved deployment values and own the Settings page policy.
 * @param ctx - Host context serving the browser page and the settings service.
 * @param config - validated configuration for this profile entry.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: LAUNCHER_CONFIG_GLOBAL, value: { todoStaleMs: config.todoStaleMs } })
  })
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
