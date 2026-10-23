/**
 * Tool-level enforcement for an active coding-workflow task. The guard is
 * synchronous and monotonic: while a task owns the workspace, it refuses
 * direct commits, destructive Git operations, and writes outside the planned
 * implementation scope, so the model cannot route around the workflow verbs.
 *
 * @module @deepseek-ai/dsh-coding-workflow/guard
 */

import { relative, resolve, sep } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolGuard } from '@deepseek-ai/dsh-tools'
import type { WorkItem } from './types.ts'

/** Shell tools whose command string the guard inspects. */
const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh'])

/** Tools that write repository content. */
const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit'])

/** Git operations a task must perform through the workflow tool instead. */
const SHELL_GIT_VIOLATION = /\bgit\s+(?:commit|push|reset|revert|checkout|switch|cherry-pick|rebase|merge|clean)\b/

/** Task statuses in which no repository mutation may start. */
const STOPPED_STATUSES: ReadonlySet<string> = new Set(['paused', 'blocked', 'waiting_approval'])

/** Read the shell command from a tool's raw arguments. */
function shellCommand(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const command = (args as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}

/** Read the target path from a file-writing tool's raw arguments. */
function filePath(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const path = (args as { file_path?: unknown }).file_path
  return typeof path === 'string' && path.length > 0 ? path : undefined
}

/**
 * Decide whether one tool call violates an active task.
 * @param item - the calling Session's current Work Item.
 * @param toolName - registered tool name.
 * @param args - raw model arguments.
 * @returns a denial reason, or undefined to allow the call.
 */
export function guardDecision(item: WorkItem, toolName: string, args: unknown): string | undefined {
  const shell = SHELL_TOOLS.has(toolName)
  const writes = WRITE_TOOLS.has(toolName)
  if (!shell && !writes) return undefined
  const shortId = item.taskId.slice(0, 8)
  if (STOPPED_STATUSES.has(item.status)) {
    return `coding_workflow: task ${shortId} is ${item.status.replaceAll('_', ' ')}; `
      + 'resume it or answer the pending decision before changing the repository'
  }
  if (shell) {
    const command = shellCommand(args)
    if (command !== undefined && SHELL_GIT_VIOLATION.test(command)) {
      return `coding_workflow: task ${shortId} performs its single commit through the coding_workflow tool; `
        + 'direct git commit, push, reset, checkout, rebase, or merge is blocked while it is active'
    }
    return undefined
  }
  const path = filePath(args)
  if (path === undefined) return undefined
  const allowed = item.allowedPaths
  if (allowed === null || item.commitRef !== null) return undefined
  const absolute = resolve(item.workspaceRoot, path)
  const root = item.workspaceRoot.endsWith(sep) ? item.workspaceRoot : item.workspaceRoot + sep
  // Files outside the workspace (evidence, scratch output) never enter the task commit.
  if (!absolute.startsWith(root)) return undefined
  const file = relative(item.workspaceRoot, absolute).split(sep).join('/')
  if (allowed.includes(file)) return undefined
  return `coding_workflow: "${file}" is outside the allowed paths of task ${shortId}; `
    + 'change the plan through the coding_workflow checks verb or keep the edit inside the planned scope'
}

/**
 * Build the registered guard for one service.
 * @param resolveItem - synchronous lookup of the calling Agent's active task.
 * @returns the monotonic tool guard.
 */
export function codingWorkflowGuard(resolveItem: (agent: Agent) => WorkItem | null): ToolGuard {
  return (execution) => {
    const agent = execution.agent
    if (agent === undefined) return undefined
    const item = resolveItem(agent)
    if (item === null) return undefined
    return guardDecision(item, execution.name, execution.arguments)
  }
}
