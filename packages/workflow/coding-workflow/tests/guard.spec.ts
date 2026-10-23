import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { guardDecision } from '../src/guard.ts'
import type { TaskId, WorkItem } from '../src/types.ts'

/** Workspace root of the fixture task, absolute on every platform. */
const ROOT = resolve('repo-root')

/** One task record with the fields the guard reads. */
function item(over: Partial<WorkItem> = {}): WorkItem {
  const stages = Object.fromEntries(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']
    .map(stage => [stage, { status: 'pending' as const, attempts: 0 }]))
  return {
    schemaVersion: 1,
    revision: 1,
    taskId: brandString<TaskId>('11111111-1111-4111-8111-111111111111'),
    sessionId: brandString<SessionId>('session-1'),
    workspaceRoot: ROOT,
    title: 'Task',
    mode: 'manual',
    status: 'ready',
    currentStage: 'S4',
    branch: 'coding/abc',
    baseCommit: 'a'.repeat(40),
    commitRef: null,
    stages,
    repairRounds: 0,
    noProgressRounds: 0,
    checks: null,
    allowedPaths: ['src/a.ts'],
    review: null,
    verification: null,
    verificationRuns: [],
    approval: null,
    blocker: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('coding workflow tool guard', () => {
  it('ignores tools that cannot change the repository', () => {
    expect(guardDecision(item(), 'read', { file_path: resolve(ROOT, 'src/a.ts') })).toBeUndefined()
    expect(guardDecision(item(), 'grep', { pattern: 'x' })).toBeUndefined()
  })

  it('refuses repository mutation while the task waits for a human', () => {
    for (const status of ['paused', 'blocked', 'waiting_approval'] as const) {
      expect(guardDecision(item({ status }), 'bash', { command: 'pnpm run build' }))
        .toMatch(/resume it or answer the pending decision/)
      expect(guardDecision(item({ status }), 'write', { file_path: resolve(ROOT, 'doc.md'), content: '' }))
        .toMatch(/resume it or answer the pending decision/)
    }
  })

  it('blocks direct Git mutations and allows read-only Git', () => {
    for (const command of ['git commit -m x', 'git push origin main', 'git reset --hard', 'git checkout main', 'git rebase main']) {
      expect(guardDecision(item(), 'bash', { command })).toMatch(/single commit through the coding_workflow tool/)
      expect(guardDecision(item(), 'pwsh', { command })).toMatch(/single commit through the coding_workflow tool/)
    }
    expect(guardDecision(item(), 'bash', { command: 'git status --short' })).toBeUndefined()
    expect(guardDecision(item(), 'bash', { command: 'pnpm run test' })).toBeUndefined()
  })

  it('confines implementation writes to the planned paths', () => {
    expect(guardDecision(item(), 'write', { file_path: 'src/a.ts', content: '' })).toBeUndefined()
    expect(guardDecision(item(), 'edit', { file_path: resolve(ROOT, 'src/a.ts'), old_string: 'a', new_string: 'b' })).toBeUndefined()
    expect(guardDecision(item(), 'write', { file_path: 'src/b.ts', content: '' }))
      .toMatch(/outside the allowed paths/)
    // Traversal is normalized: a path that lands inside the workspace is scoped, one that escapes it is scratch.
    expect(guardDecision(item(), 'write', { file_path: 'sub/../src/b.ts', content: '' }))
      .toMatch(/outside the allowed paths/)
  })

  it('leaves evidence and scratch writes outside the workspace alone', () => {
    expect(guardDecision(item(), 'write', { file_path: resolve(ROOT, '..', 'evidence.json'), content: '{}' })).toBeUndefined()
  })

  it('stops confining writes before a plan exists and after the commit', () => {
    expect(guardDecision(item({ allowedPaths: null }), 'write', { file_path: resolve(ROOT, 'docs/spec.md'), content: '' })).toBeUndefined()
    expect(guardDecision(item({ commitRef: 'c'.repeat(40) }), 'write', { file_path: resolve(ROOT, 'docs/report.md'), content: '' })).toBeUndefined()
  })
})
