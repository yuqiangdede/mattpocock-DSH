/** Explicit, non-destructive installer for the fork's tracked coding skills.
 * Usage: node scripts/install-coding-skills.mjs [--home path] [--overwrite]
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, readdir, rename, stat } from 'node:fs/promises'

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
  if (exists) {
    const backup = to + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-')
    await rename(to, backup)
    console.log('BACKUP:', backup)
  }
  await cp(from, to, { recursive: true, force: false, errorOnExist: true })
  console.log('INSTALLED:', entry.name)
  copied++
}
console.log('DSH Skills:', destination)
console.log('Installed:', copied, 'Skipped:', skipped)
