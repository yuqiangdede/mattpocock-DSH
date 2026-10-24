/** Materialized dependency trees must match the serial `cpSync` copy they replace. */

import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { materializeModules } from '../scripts/materialize-modules.ts'

let root = ''

/** Read every file under a directory, keyed by its POSIX-style relative path. */
function listing(directory: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else files[relative(directory, path).split(sep).join('/')] = readFileSync(path, 'utf8')
    }
  }
  walk(directory)
  return files
}

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'materialize-modules-'))
  const modules = join(root, 'node_modules')
  write(join(modules, 'package.json'), '{"name":"runtime"}')
  write(join(modules, 'a', 'package.json'), '{"name":"a"}')
  write(join(modules, 'a', 'index.js'), 'export const a = 1\n')
  write(join(modules, 'a', 'types.d.ts'), 'export declare const a: number\n')
  write(join(modules, 'a', 'node_modules', 'b', 'index.js'), 'export const b = 2\n')
  write(join(modules, '@scope', 'pkg', 'package.json'), '{"name":"@scope/pkg"}')
  write(join(modules, '@scope', 'pkg', 'index.js'), 'export const scoped = 3\n')
  write(join(modules, '.pnpm', 'a@1.0.0', 'node_modules', 'a', 'index.js'), 'export const a = 1\n')
  write(join(modules, '.pnpm', 'a@1.0.0', 'node_modules', 'a', 'types.d.ts'), 'export declare const a: number\n')
  write(join(modules, '.bin', 'tool.cmd'), 'tool\n')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

it.each([1, 3, 8])('copies the same published tree as the serial copy with %i workers', async (workers) => {
  const modules = join(root, 'node_modules')
  const filter = (source: string): boolean => !relative(modules, source).endsWith('.d.ts')
  const expected = join(root, 'expected')
  cpSync(modules, expected, { recursive: true, dereference: true, filter })
  const actual = join(root, `actual-${String(workers)}`)
  await materializeModules(modules, actual, filter, workers)
  expect(listing(actual)).toEqual(listing(expected))
  expect(Object.keys(listing(actual)).sort()).toContain('.pnpm/a@1.0.0/node_modules/a/index.js')
  expect(Object.keys(listing(actual)).some(path => path.endsWith('.d.ts'))).toBe(false)
})

it('copies an empty installed tree without creating a destination', async () => {
  const modules = join(root, 'empty')
  mkdirSync(modules, { recursive: true })
  const destination = join(root, 'empty-destination')
  await materializeModules(modules, destination, () => true)
  expect(readdirSync(root).includes('empty-destination')).toBe(false)
})
