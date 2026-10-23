import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { en, zh, type LauncherLocaleKey } from './locales.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { GoalProjection, GoalRef } from '@deepseek-ai/dsh-goal/client'
import type { WorkItem } from '@deepseek-ai/dsh-coding-workflow/client'
import { LAUNCHER_CONFIG_GLOBAL, LauncherDeploymentSchema } from '../config.ts'
import { Launcher } from './Launcher.tsx'
import { LauncherSettings } from './Settings.tsx'
import { createCodingWorkflowSource } from './workflow-source.ts'
import type { CodingWorkflowSnapshot } from './workflow-source.ts'
/** Host-persisted launcher configuration. */
export interface ActionSettings { actionsJson?: string }
/** Settings form and revision-checked save operation. */
export interface LauncherSettingsInjected {
  hooks: { actionForm: ConfigForm<ActionSettings> }
  saveActions: (json:string, revision?:number)=>Promise<boolean>
}
/** Outcome of one launcher-initiated workflow command. */
export interface WorkflowCommandResult {
  /** Whether the Host accepted the command. */
  readonly ok: boolean
  /** Failure message for the notice line. */
  readonly message?: string
}
/** Launcher mode values the workflow record understands. */
export type WorkflowMode = 'manual' | 'auto'
/** Launcher form, Skill catalog, the Session's coding Work Item, and the Host's stale-plan threshold. */
export interface LauncherInjected {
  hooks: { actionForm: ConfigForm<ActionSettings>; workflow: HostObservable<CodingWorkflowSnapshot> }
  fetchSkillNames: ()=>Promise<readonly string[]>
  pauseWorkflow: (ref: GoalRef) => Promise<{ readonly ok: true } | { readonly ok: false; readonly error: { readonly message: string } }>
  /** Revision-checked mutations of the current coding task. */
  workflowCommands: {
    approve: (decision: string) => Promise<WorkflowCommandResult>
    pause: () => Promise<WorkflowCommandResult>
    resume: () => Promise<WorkflowCommandResult>
    cancel: (reason: string) => Promise<WorkflowCommandResult>
    setMode: (mode: WorkflowMode) => Promise<WorkflowCommandResult>
  }
  todoStaleMs: number
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
export const inject = ['locale', 'slots','sessions','remote','remote.skills','remote.goals','remote.codingWorkflow','configForms']
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('mattSkillLauncher', { zh, en }), 'launcher dictionaries')
  const t = ctx.locale.bind('mattSkillLauncher')
  const form = ctx.configForms.get<ActionSettings>('ui-matt-skill-launcher')
  // The page-global carries the Host-resolved policy; this read validates it
  // against the same field schema the Host Config uses.
  const deployment = LauncherDeploymentSchema(
    (globalThis as { [LAUNCHER_CONFIG_GLOBAL]?: unknown })[LAUNCHER_CONFIG_GLOBAL] ?? {},
  )
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', locale: 'mattSkillLauncher', id: 'matt-skill-launcher', order: 1,
    inject: (sessionId): LauncherInjected => {
      const workflow = createCodingWorkflowSource({
        read: async () => {
          const binding = ctx.sessions.binding(sessionId)
          if (binding === undefined || binding.session.getSnapshot().openState !== 'open') {
            return { ok: false, error: { code: 'session-unavailable', message: 'Session unavailable' } }
          }
          return ctx.remote.codingWorkflow.get(sessionId)
        },
        subscribeChange: listener => ctx.remote.$on('coding-workflow/changed', (change) => {
          if (change.sessionId === sessionId) listener(change)
        }),
        subscribeReset: listener => ctx.on('connection/reset', listener),
      })
      // Every command carries the revision it read, so a stale panel fails instead of overwriting a newer task.
      const command = async (action: (item: WorkItem) => Promise<RemoteResult<WorkItem>>): Promise<WorkflowCommandResult> => {
        const item = workflow.getSnapshot().item
        if (item === null) return { ok: false, message: 'No current task' }
        try {
          const result = await action(item)
          return result.ok ? { ok: true } : { ok: false, message: result.error.message }
        } catch (error) {
          return { ok: false, message: String(error) }
        }
      }
      return {
        hooks: { actionForm: form, workflow },
        todoStaleMs: deployment.todoStaleMs,
        workflowCommands: {
          approve: decision => command(item => ctx.remote.codingWorkflow.approve(sessionId, item.taskId, item.revision, decision)),
          pause: () => command(item => ctx.remote.codingWorkflow.pause(sessionId, item.taskId, item.revision)),
          resume: () => command(item => ctx.remote.codingWorkflow.resume(sessionId, item.taskId, item.revision)),
          cancel: reason => command(item => ctx.remote.codingWorkflow.cancel(sessionId, item.taskId, item.revision, reason)),
          setMode: mode => command(item => ctx.remote.codingWorkflow.setMode(sessionId, item.taskId, item.revision, mode)),
        },
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
      }
    },
  }, Launcher))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', locale: 'mattSkillLauncher', id: 'matt-skill-launcher', order: 80, label: () => t('title'),
    inject: (): LauncherSettingsInjected => ({
      hooks: { actionForm: form },
      saveActions: (json, rev)=>form.mutate([{ op:'set',path:['actionsJson'],value:json }],rev),
    }),
  }, LauncherSettings))
}
