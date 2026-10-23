import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { en, zh, type LauncherLocaleKey } from './locales.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { GoalProjection, GoalRef } from '@deepseek-ai/dsh-goal/client'
import { Launcher } from './Launcher.tsx'
import { LauncherSettings } from './Settings.tsx'
/** Host-persisted launcher configuration. */
export interface ActionSettings { actionsJson?: string }
/** Settings form and revision-checked save operation. */
export interface LauncherSettingsInjected {
  hooks: { actionForm: ConfigForm<ActionSettings> }
  saveActions: (json:string, revision?:number)=>Promise<boolean>
}
/** Launcher form and session-scoped Skill catalog access. */
export interface LauncherInjected {
  hooks: { actionForm: ConfigForm<ActionSettings> }
  fetchSkillNames: ()=>Promise<readonly string[]>
  pauseWorkflow: (ref: GoalRef) => Promise<{ readonly ok: true } | { readonly ok: false; readonly error: { readonly message: string } }>
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { mattSkillLauncher: unknown }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Launcher settings and insertion feedback. */
    mattSkillLauncher: LauncherLocaleKey
  }
}
export const inject = ['locale', 'slots','sessions','remote','remote.skills','remote.goals','configForms']
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('mattSkillLauncher', { zh, en }), 'launcher dictionaries')
  const t = ctx.locale.bind('mattSkillLauncher')
  const form = ctx.configForms.get<ActionSettings>('ui-matt-skill-launcher')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', locale: 'mattSkillLauncher', id: 'matt-skill-launcher', order: 1,
    inject: (sessionId): LauncherInjected => ({
      hooks: { actionForm: form },
      pauseWorkflow: async (goalRef) => {
        const binding = ctx.sessions.binding(sessionId)
        if (binding === undefined || binding.session.getSnapshot().openState !== 'open')
          return { ok: false, error: { message: 'Session unavailable' } }
        // faceOf is the erased framework read; the goal key's type comes from the domain's projection map.
        const projection = binding.session.projections.faceOf('goal').getSnapshot() as GoalProjection | null | undefined
        if (projection == null || projection.goal.id !== goalRef.id ||
            projection.goal.revision !== goalRef.revision)
          return { ok: false, error: { message: 'Workflow goal changed; refresh and retry' } }
        return ctx.remote.goals.pause(sessionId, goalRef)
      },
      fetchSkillNames: async () => {
        if (ctx.sessions.binding(sessionId) === undefined) throw new Error('Session unavailable')
        return ctx.sessions.using(sessionId,{ source:'mattSkillLauncher' },async (ref)=>{
          if (ref.binding.session.getSnapshot().openState !== 'open') throw new Error('Session not open')
          const result = await ctx.remote.skills.list({ sessionId })
          if (!result.ok) throw new Error(result.error.message)
          return result.value.skills.map(skill=>skill.name)
        })
      },
    }),
  }, Launcher))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', locale: 'mattSkillLauncher', id: 'matt-skill-launcher', order: 80, label: () => t('title'),
    inject: (): LauncherSettingsInjected => ({
      hooks: { actionForm: form },
      saveActions: (json, rev)=>form.mutate([{ op:'set',path:['actionsJson'],value:json }],rev),
    }),
  }, LauncherSettings))
}
