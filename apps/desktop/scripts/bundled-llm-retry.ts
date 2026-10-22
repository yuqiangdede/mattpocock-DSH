/** Version-pinned build-time download and offline verification of the LLM retry settings plugin. */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLED_LLM_RETRY } from '../src/bundled-plugins.ts'

const RELEASE = BUNDLED_LLM_RETRY
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function bundledLlmRetryTarballName(): string {
  return `${RELEASE.name}-${RELEASE.version}.tgz`
}

/** The cache is build-only; no installed desktop downloads a plugin at startup. */
export async function stageBundledLlmRetryTarball(projectDir: string, stateDir: string): Promise<void> {
  const name = bundledLlmRetryTarballName()
  const cacheDir = join(stateDir, 'vendor')
  const targetDir = join(projectDir, 'vendor')
  const cached = join(cacheDir, name)
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(targetDir, { recursive: true })

  let bytes = existsSync(cached) ? readFileSync(cached) : undefined
  if (bytes === undefined || digest(bytes) !== RELEASE.sha256) {
    const url = `https://github.com/zeng6125-rgb/dsh-llm-retry-settings/releases/download/v${RELEASE.version}/${name}`
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`desktop LLM retry: download failed (HTTP ${response.status})`)
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES) {
      throw new Error('desktop LLM retry: release exceeds size limit')
    }
    bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_ARCHIVE_BYTES || digest(bytes) !== RELEASE.sha256) {
      throw new Error('desktop LLM retry: upstream release SHA-256 mismatch; refusing package')
    }
    writeFileSync(cached, bytes)
  }
  copyFileSync(cached, join(targetDir, name))
}

/** Reject incorrect archives and incomplete published client/host bundles. */
export function verifyBundledLlmRetry(root: string): void {
  const directory = join(root, 'node_modules', RELEASE.name)
  const manifestPath = join(directory, 'package.json')
  if (!existsSync(manifestPath)) throw new Error('desktop LLM retry: bundled package missing')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string; version?: string; dsh?: { bundle?: { patch?: string } }
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
