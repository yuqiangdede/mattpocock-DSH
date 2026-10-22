import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { patchDesktopOperatorAsarRuntime, writeDesktopOperatorPresetBundle } from '../scripts/bundled-desktop-operator.ts'
import { BUNDLED_DESKTOP_OPERATOR, DESKTOP_OPERATOR_PRESET_BUNDLE, DESKTOP_OPERATOR_PRESET_ID } from '../src/bundled-plugins.ts'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })

it('generates an offline preset from the installed DSH standard rather than vendoring DSH source', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-preset-'))
  directories.push(root)
  const path = join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  mkdirSync(join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets'), { recursive: true })
  writeFileSync(path, `- insert:
    - id: preset-standard
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: standard
        order: 1
        plugins:
          - id: existing-tool
            name: 'kept-tool'
`)
  writeDesktopOperatorPresetBundle(root)
  const dir = join(root, 'node_modules', ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/'))
  const patch = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')
  expect(patch).toContain("name: 'kept-tool'")
  expect(patch).toContain(`id: ${DESKTOP_OPERATOR_PRESET_ID}`)
  expect(patch).toContain("name: 'dsh-desktop-operator'")
  expect(patch).toContain('highRiskActionPolicy: confirm')
  expect(patch).toContain('default: desktop-computer-use')
  expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version)
    .toBe(BUNDLED_DESKTOP_OPERATOR.version)
})

it('rewrites only the exact standard preset fields when similar values appear earlier', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-preset-'))
  directories.push(root)
  const path = join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  mkdirSync(join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets'), { recursive: true })
  writeFileSync(path, `# id: preset-standard-helper
- insert:
    - id: preset-standard
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        # id: standard-helper
        id: standard
        # order: 10
        order: 1
        plugins:
          - id: helper
            name: 'example:standard-helper'
`)
  writeDesktopOperatorPresetBundle(root)
  const patch = readFileSync(join(root, 'node_modules', ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/'), 'cordis.patch.yml'), 'utf8')
  expect(patch).toContain('# id: preset-standard-helper')
  expect(patch).toContain('# id: standard-helper')
  expect(patch).toContain('# order: 10')
  expect(patch).toContain('    - id: preset-desktop-computer-use')
  expect(patch).toContain('        id: desktop-computer-use')
  expect(patch).toContain('        order: 0')
})

it('rejects ambiguous duplicate standard preset ids instead of silently modifying the first', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-preset-'))
  directories.push(root)
  const path = join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  mkdirSync(join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets'), { recursive: true })
  writeFileSync(path, `- insert:
    - id: preset-standard
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: standard
        order: 1
        plugins: []
    - id: preset-standard
      name: '@deepseek-ai/dsh-agent-preset'
`)
  expect(() => writeDesktopOperatorPresetBundle(root)).toThrow('standard preset changed')
  expect(existsSync(join(root, 'node_modules', ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/')))).toBe(false)
})

it('fails when DSH standard preset structure changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-preset-'))
  directories.push(root)
  const path = join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  mkdirSync(join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets'), { recursive: true })
  writeFileSync(path, '[]\n')
  expect(() => writeDesktopOperatorPresetBundle(root)).toThrow('standard preset changed')
  expect(existsSync(join(root, 'node_modules', ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/')))).toBe(false)
})

it('rewrites the native runtime lookup for Electron ASAR packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-asar-'))
  directories.push(root)
  const entry = join(root, 'node_modules', BUNDLED_DESKTOP_OPERATOR.name, 'lib', 'index.js')
  mkdirSync(join(root, 'node_modules', BUNDLED_DESKTOP_OPERATOR.name, 'lib'), { recursive: true })
  writeFileSync(entry, 'const runtimeExecutable = join(packageRoot, bundledRuntimeRelativePath(platform, arch));\\n')
  patchDesktopOperatorAsarRuntime(root)
  expect(readFileSync(entry, 'utf8')).toContain('app.asar.unpacked')
})

it('fails closed if the upstream native runtime resolver changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-asar-'))
  directories.push(root)
  const entry = join(root, 'node_modules', BUNDLED_DESKTOP_OPERATOR.name, 'lib', 'index.js')
  mkdirSync(join(root, 'node_modules', BUNDLED_DESKTOP_OPERATOR.name, 'lib'), { recursive: true })
  writeFileSync(entry, 'const runtimeExecutable = resolveSomethingElse()\\n')
  expect(() => patchDesktopOperatorAsarRuntime(root)).toThrow('upstream runtime resolver changed')
})
