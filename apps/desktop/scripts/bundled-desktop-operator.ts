/** Build-time staging of a version-pinned, fully offline Windows Computer Use package. */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stageBundledArchive } from './bundled-archive.ts'
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
  await stageBundledArchive(projectDir, stateDir, {
    name, url: `https://github.com/zjh02249/dsh-desktop-operator/releases/download/v${RELEASE.version}/${name}`, sha256: RELEASE.sha256, maxBytes: MAX_ARCHIVE_BYTES,
  })
}

/** Verify the packaged native executable, plugin entry, identity, and pin. */
export function verifyBundledDesktopOperator(runtimeRoot: string): void {
  const directory = join(runtimeRoot, 'node_modules', RELEASE.name)
  const manifestPath = join(directory, 'package.json')
  if (!existsSync(manifestPath)) throw new Error('desktop Computer Use: plugin package missing')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string
    version?: string
    dsh?: { bundle?: { patch?: string } }
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

  patchDesktopOperatorAsarRuntime(runtimeRoot)
}


/** Keep the upstream package resolver compatible with Electron's ASAR-unpacked native files. */
export function patchDesktopOperatorAsarRuntime(runtimeRoot: string): void {
  const entry = join(runtimeRoot, 'node_modules', RELEASE.name, 'lib', 'index.js')
  const source = readFileSync(entry, 'utf8')
  const resolver = 'const runtimeExecutable = join(packageRoot, bundledRuntimeRelativePath(platform, arch));'
  if (source.split(resolver).length !== 2) {
    throw new Error('desktop Computer Use: upstream runtime resolver changed; review ASAR adapter')
  }
  const replacement = String.raw`const runtimeExecutable = join(packageRoot.replace(/([\\/])app\.asar(?=[\\/])(?![\s\S]*[\\/]app\.asar[\\/])/u, '$1app.asar.unpacked'), bundledRuntimeRelativePath(platform, arch));`
  writeFileSync(entry, source.replace(resolver, replacement))
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
  // Only mutate exact fields belonging to the standard preset. A substring
  // match could accidentally rename a helper preset or an order of 10.
  const lines = standard.split('\n')
  const replacements = [
    ['    - id: preset-standard', '    - id: preset-desktop-computer-use'],
    ['        id: standard', `        id: ${DESKTOP_OPERATOR_PRESET_ID}`],
    ['        order: 1', '        order: 0'],
  ] as const
  for (const required of ['- insert:', '        plugins:']) {
    if (lines.filter(line => line === required).length !== 1) {
      throw new Error(`desktop Computer Use: standard preset changed (${required}); review adapter`)
    }
  }
  for (const [before, after] of replacements) {
    const indexes = lines.flatMap((line, index) => line === before ? [index] : [])
    if (indexes.length !== 1) {
      throw new Error(`desktop Computer Use: standard preset changed (${before.trim()}); review adapter`)
    }
    lines[indexes[0]!] = after
  }
  const updated = lines.join('\n')
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
