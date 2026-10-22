/** Build-time staging of a version-pinned, fully offline Windows Computer Use package. */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUNDLED_DESKTOP_OPERATOR, DESKTOP_OPERATOR_PRESET_BUNDLE, DESKTOP_OPERATOR_PRESET_ID,
} from '../src/bundled-plugins.ts'

const RELEASE = BUNDLED_DESKTOP_OPERATOR
const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function desktopOperatorTarballName(): string {
  return `${RELEASE.name}-${RELEASE.version}.tgz`
}

export function desktopOperatorPackageSpec(): string {
  return `file:./vendor/${desktopOperatorTarballName()}`
}

/** Cache is outside the ephemeral project; corrupt/stale downloads never pass SHA verification. */
export async function stageDesktopOperatorTarball(projectDir: string, stateDir: string): Promise<void> {
  const name = desktopOperatorTarballName()
  const cacheDir = join(stateDir, 'vendor')
  const targetDir = join(projectDir, 'vendor')
  const cached = join(cacheDir, name)
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(targetDir, { recursive: true })

  let bytes = existsSync(cached) ? readFileSync(cached) : undefined
  if (bytes === undefined || sha256(bytes) !== RELEASE.sha256) {
    const url = `https://github.com/zjh02249/dsh-desktop-operator/releases/download/v${RELEASE.version}/${name}`
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`desktop Computer Use: download failed (${response.status})`)
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES) {
      throw new Error('desktop Computer Use: download exceeds size limit')
    }
    bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_ARCHIVE_BYTES || sha256(bytes) !== RELEASE.sha256) {
      throw new Error('desktop Computer Use: upstream archive SHA-256 mismatch; refusing release')
    }
    // Hash-qualified staging avoids trusting a damaged cached asset on future builds.
    writeFileSync(cached, bytes)
  }
  copyFileSync(cached, join(targetDir, name))
}

/** Verify the packaged native executable, plugin entry, identity, and pin. */
export function verifyBundledDesktopOperator(runtimeRoot: string): void {
  const directory = join(runtimeRoot, 'node_modules', RELEASE.name)
  const manifestPath = join(directory, 'package.json')
  if (!existsSync(manifestPath)) throw new Error('desktop Computer Use: plugin package missing')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string; version?: string; dsh?: { bundle?: { patch?: string } }
  }
  if (manifest.name !== RELEASE.name || manifest.version !== RELEASE.version
    || manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('desktop Computer Use: incompatible package identity or version')
  }
  for (const file of ['lib/index.js', 'cordis.patch.yml', 'LICENSE',
    'runtime/bin/win32-x64/open-computer-use.exe']) {
    if (!existsSync(join(directory, file))) throw new Error(`desktop Computer Use: missing ${file}`)
  }
  const native = readFileSync(join(directory, 'runtime', 'bin', 'win32-x64', 'open-computer-use.exe'))
  if (sha256(native) !== RELEASE.windowsX64Sha256) {
    throw new Error('desktop Computer Use: packaged native executable SHA-256 mismatch')
  }
}

/**
 * The upstream plugin exposes an empty Host patch: its tools must instead be
 * mounted in an Agent Preset. Add a separate disable-able bundle, generated
 * from the DSH standard preset at package time (no copied upstream preset).
 */
export function writeDesktopOperatorPresetBundle(runtimeRoot: string): void {
  const modules = join(runtimeRoot, 'node_modules')
  const standardPath = join(modules, '@deepseek-ai', 'dsh-web-app', 'presets', 'standard.patch.yml')
  const standard = readFileSync(standardPath, 'utf8')
  for (const token of ['- insert:', 'id: preset-standard', 'id: standard', 'order: 1', 'plugins:']) {
    if (!standard.includes(token)) {
      throw new Error(`desktop Computer Use: standard preset changed (${token}); review adapter`)
    }
  }
  const updated = standard
    .replace('id: preset-standard', 'id: preset-desktop-computer-use')
    .replace('id: standard', `id: ${DESKTOP_OPERATOR_PRESET_ID}`)
    .replace('order: 1', 'order: 0')
  const patch = `${updated.trimEnd()}
          - id: computer-use
            name: '${RELEASE.name}'
            config:
              accessPolicy: allow
              highRiskActionPolicy: confirm
              interactionMode: foreground-verified
              allowAppLaunch: false
              visualIndicator: true
              toolCallTimeoutMs: 120000
- id: agent-preset-registry
  config:
    default: ${DESKTOP_OPERATOR_PRESET_ID}
`
  const directory = join(modules, ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/'))
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: DESKTOP_OPERATOR_PRESET_BUNDLE,
    version: RELEASE.version,
    private: true,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, undefined, 2) + '\n')
  writeFileSync(join(directory, 'cordis.patch.yml'), patch)
}
