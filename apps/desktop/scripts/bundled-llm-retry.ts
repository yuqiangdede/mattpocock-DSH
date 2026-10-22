/** Version-pinned build-time download and offline verification of the LLM retry settings plugin. */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stageBundledArchive } from './bundled-archive.ts'
import { BUNDLED_LLM_RETRY } from '../src/bundled-plugins.ts'

const RELEASE = BUNDLED_LLM_RETRY
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024


export function bundledLlmRetryTarballName(): string {
  return `${RELEASE.name}-${RELEASE.version}.tgz`
}

/** The cache is build-only; no installed desktop downloads a plugin at startup. */
export async function stageBundledLlmRetryTarball(projectDir: string, stateDir: string): Promise<void> {
  const name = bundledLlmRetryTarballName()
  await stageBundledArchive(projectDir, stateDir, {
    name, url: `https://github.com/zeng6125-rgb/dsh-llm-retry-settings/releases/download/v${RELEASE.version}/${name}`, sha256: RELEASE.sha256, maxBytes: MAX_ARCHIVE_BYTES,
  })
}

/** Reject incorrect archives and incomplete published client/host bundles. */
export function verifyBundledLlmRetry(root: string): void {
  const directory = join(root, 'node_modules', RELEASE.name)
  const manifestPath = join(directory, 'package.json')
  if (!existsSync(manifestPath)) throw new Error('desktop LLM retry: bundled package missing')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string
    version?: string
    dsh?: { bundle?: { patch?: string } }
  }
  if (manifest.name !== RELEASE.name || manifest.version !== RELEASE.version
    || manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('desktop LLM retry: bundled package identity or version mismatch')
  }
  for (const file of ['cordis.patch.yml', 'lib/index.js', 'lib/client.js']) {
    if (!existsSync(join(directory, file))) throw new Error(`desktop LLM retry: missing ${file}`)
  }
  const patch = readFileSync(join(directory, 'cordis.patch.yml'), 'utf8')
  if (!patch.includes('id: llm-retry-settings') || !patch.includes("name: 'dsh-llm-retry-settings'")) {
    throw new Error('desktop LLM retry: unexpected Host patch in upstream release')
  }
}
