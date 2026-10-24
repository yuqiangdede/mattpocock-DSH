/** Explicit, non-destructive installer for the fork's tracked coding skills.
 * Usage: node scripts/install-coding-skills.mjs [--home path] [--overwrite]
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, '.dsh', 'skills')
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: node scripts/install-coding-skills.mjs [--home <DSH_HOME>] [--overwrite]')
  process.exit(0)
}
const idx = args.indexOf('--home')
if (idx >= 0 && (!args[idx + 1] || args[idx + 1].startsWith('--'))) {
  throw new Error('--home requires a directory path')
}
const home = idx >= 0 ? path.resolve(args[idx+1]) : path.resolve(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'))
const destination = path.join(home, 'skills')
const overwrite = args.includes('--overwrite')
if (path.resolve(source) === path.resolve(destination)) throw new Error('Source and destination coincide')
await mkdir(destination, { recursive: true })
let copied = 0, skipped = 0
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const from = path.join(source, entry.name)
  const to = path.join(destination, entry.name)
  let exists = false
  try { await stat(to); exists = true } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (exists && !overwrite) {
    console.log('SKIP existing:', entry.name)
    skipped++
    continue
  }
  // Fully stage the replacement before touching a working installation.
  const stagingRoot = await mkdtemp(path.join(destination, '.skill-install-'))
  const staged = path.join(stagingRoot, entry.name)
  let backup
  try {
    await cp(from, staged, { recursive: true, force: false, errorOnExist: true })
    if (exists) {
      backup = to + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2)
      await rename(to, backup)
    }
    try {
      await rename(staged, to)
    } catch (error) {
      if (backup) {
        await rename(backup, to)
        backup = undefined
      }
      throw error
    }
    if (backup) console.log('BACKUP:', backup)
    console.log('INSTALLED:', entry.name)
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
  copied++
}
console.log('DSH Skills:', destination)
console.log('Installed:', copied, 'Skipped:', skipped)
