import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

describe('fork-owned workflow state guard', () => {
  it('passes the isolated checkpoint, approval, scope and Git guard scenarios', () => {
    const script = resolve(import.meta.dirname, '../../../../.dsh/skills/coding-workflow/scripts/workflow-state.test.mjs')
    const run = spawnSync(process.execPath, ['--test', script], { encoding: 'utf8', timeout: 180_000 })
    expect(run.status, run.stderr + '\n' + run.stdout).toBe(0)
  }, 180_000)
})
