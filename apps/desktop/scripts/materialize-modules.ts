/** Copy an installed dependency tree into the published runtime directory. */

import { readdirSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Dependency subtrees copied at once when a caller names no limit. */
export const DEFAULT_MATERIALIZE_WORKERS = 8

/**
 * List the copy units one level below an installed tree, so the pnpm virtual store and
 * scoped package directories do not collapse into single units.
 * @param root Installed dependency directory.
 * @returns Absolute source paths, each copied to its relative destination.
 */
function copyUnits(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (!entry.isDirectory()) return [path]
    return readdirSync(path, { withFileTypes: true }).map(child => join(path, child.name))
  })
}

/**
 * Copy every dependency subtree the filter keeps, dereferencing links exactly as `cpSync` does.
 * Independent subtrees copy concurrently, so the serial per-file walk no longer dominates a
 * packaging run.
 * @param source Installed dependency directory.
 * @param destination Published `node_modules` directory.
 * @param filter Returns whether a source path and its subtree belong in the published tree.
 * @param workers Maximum subtrees copied at once.
 * @returns Resolves after every kept subtree is copied.
 */
export async function materializeModules(
  source: string,
  destination: string,
  filter: (source: string) => boolean,
  workers: number = DEFAULT_MATERIALIZE_WORKERS,
): Promise<void> {
  const units = copyUnits(source).filter(filter)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(Math.max(workers, 1), units.length) }, async () => {
    for (let index = next++; index < units.length; index = next++) {
      const unit = units[index]
      if (unit === undefined) continue
      await cp(unit, join(destination, relative(source, unit)), { recursive: true, dereference: true, filter })
    }
  }))
}
