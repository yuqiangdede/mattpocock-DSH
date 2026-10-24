import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const installer = resolve(import.meta.dirname, '../../../../scripts/install-coding-skills.mjs')
const temporary: string[] = []

afterAll(() => {
  for (const path of temporary) {
    const deadline = Date.now() + 5000
    for (;;) {
      try { rmSync(path, { recursive: true, force: true }); break } catch (error) {
        if (Date.now() >= deadline) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
      }
    }
  }
})

/** Run the installer into one fresh Harness home. */
function install(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [installer, ...args], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('fork coding skills installer', () => {
  it('ships the automatic workflow with its checkpoint script', () => {
    const home = mkdtempSync(join(tmpdir(), 'coding-skills-home-'))
    temporary.push(home)
    const result = install(['--home', home])
    expect(result.status, result.stderr).toBe(0)
    const skill = readFileSync(join(home, 'skills', 'coding-workflow', 'SKILL.md'), 'utf8')
    expect(skill).toContain('name: coding-workflow')
    expect(skill).toContain('coding_workflow')
    expect(existsSync(join(home, 'skills', 'coding-workflow', 'scripts', 'workflow-state.mjs'))).toBe(true)
  })

  it('keeps an existing installation unless overwrite is explicit', () => {
    const home = mkdtempSync(join(tmpdir(), 'coding-skills-home-'))
    temporary.push(home)
    expect(install(['--home', home]).status).toBe(0)
    const installed = join(home, 'skills', 'coding-workflow', 'SKILL.md')
    writeFileSync(installed, 'user edits\n')
    const skipped = install(['--home', home])
    expect(skipped.status, skipped.stderr).toBe(0)
    expect(skipped.stdout).toContain('SKIP existing: coding-workflow')
    expect(readFileSync(installed, 'utf8')).toBe('user edits\n')
    const overwritten = install(['--home', home, '--overwrite'])
    expect(overwritten.status, overwritten.stderr).toBe(0)
    expect(readFileSync(installed, 'utf8')).toContain('name: coding-workflow')
    // The overwrite keeps a backup of the replaced directory instead of destroying it.
    expect(existsSync(join(home, 'skills', '.skill-install-'))).toBe(false)
  })
})
