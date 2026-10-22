import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { writeDesktopOperatorPresetBundle } from '../scripts/bundled-desktop-operator.ts'
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

it('fails when DSH standard preset structure changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'operator-preset-'))
  directories.push(root)
  const path = join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  mkdirSync(join(root, 'node_modules/@deepseek-ai/dsh-web-app/presets'), { recursive: true })
  writeFileSync(path, '[]\n')
  expect(() => writeDesktopOperatorPresetBundle(root)).toThrow('standard preset changed')
  expect(existsSync(join(root, 'node_modules', ...DESKTOP_OPERATOR_PRESET_BUNDLE.split('/')))).toBe(false)
})
