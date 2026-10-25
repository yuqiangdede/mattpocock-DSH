/**
 * @deepseek-ai/dsh-coding-suite
 *
 * Integrated Coding Suite: Host authoritative workflow with staged checkpoints
 * and explicit stage skipping, bundled engineering skills and Pocket specifications,
 * and interactive Web/Desktop UI Launcher.
 *
 * @module @deepseek-ai/dsh-coding-suite
 */

import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  CodingWorkflowService,
  type Config as WorkflowConfig,
} from '@deepseek-ai/dsh-coding-workflow'
import { LAUNCHER_CONFIG_GLOBAL, LauncherDeploymentFields, type LauncherDeployment } from './config.ts'
import { registerCodingSuiteSkills, type CodingSuiteSkillConfig } from './skill-provider.ts'

export type * from '@deepseek-ai/dsh-coding-workflow'
export * from './skill-provider.ts'

/** Unified configuration for the Coding Suite. */
export interface CodingSuiteConfig extends LauncherDeployment, WorkflowConfig, CodingSuiteSkillConfig {
  /** Versioned CodingAction document kept by DSH Settings. */
  actionsJson?: Volatile<string | undefined>
  /** Optional custom assets root directory for skills. */
  assetRoot?: string
}

export type Config = CodingSuiteConfig

export const Config = z.object({
  actionsJson: z.string().volatile(),
  todoStaleMs: LauncherDeploymentFields.todoStaleMs,
  verificationTimeoutMs: z.natural(),
  assetRoot: z.string(),
})

export const name = 'coding-suite'

/**
 * Mount the complete Coding Suite on the Host:
 * 1. Authoritative staged coding workflow service
 * 2. Bundled engineering skills and Pocket specifications
 * 3. Settings persistence and webserver launcher deployment
 *
 * @param ctx - Host context.
 * @param config - Validated configuration.
 */
export function apply(ctx: Context, config: CodingSuiteConfig): void {
  // 1. Mount Host Authoritative Coding Workflow Service
  ctx.plugin(CodingWorkflowService, {
    ...(config.verificationTimeoutMs !== undefined ? { verificationTimeoutMs: config.verificationTimeoutMs } : {}),
  })

  // 2. Mount Bundled 28 Skills & Pocket Specifications into Skill Registry
  ctx.inject(['skills'], (child) => {
    child.effect(() => registerCodingSuiteSkills(child, {
      ...(config.assetRoot !== undefined ? { assetRoot: config.assetRoot } : {}),
    }))
  })

  // 3. Mount Launcher Settings & Index Injections
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: LAUNCHER_CONFIG_GLOBAL,
      value: { todoStaleMs: config.todoStaleMs },
    })
  })

  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}

export default {
  name,
  Config,
  apply,
}
