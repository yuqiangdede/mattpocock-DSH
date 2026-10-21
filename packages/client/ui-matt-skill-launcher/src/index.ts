import type {} from '@deepseek-ai/dsh-settings'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
/** User settings only: never store Agent/Session state here. */
export interface Config { actionsJson: Volatile<string | undefined> }
export const Config = z.object({ actionsJson: z.string().volatile() })
export function apply(ctx: Context): void {
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
