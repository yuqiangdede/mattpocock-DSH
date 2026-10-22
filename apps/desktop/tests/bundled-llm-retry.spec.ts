import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { stageBundledLlmRetryTarball, verifyBundledLlmRetry } from '../scripts/bundled-llm-retry.ts'
import { BUNDLED_LLM_RETRY } from '../src/bundled-plugins.ts'

const directories: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-llm-retry-test-'))
  directories.push(root)
  return root
}

it('fails closed on a forged or corrupted upstream release', async () => {
  const root = temporaryRoot()
  const fetchMock = vi.fn().mockResolvedValue(new Response('invalid archive', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(stageBundledLlmRetryTarball(join(root, 'build'), join(root, 'cache')))
    .rejects.toThrow('SHA-256 mismatch')
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(existsSync(join(root, 'cache', 'vendor',
    `${BUNDLED_LLM_RETRY.name}-${BUNDLED_LLM_RETRY.version}.tgz`))).toBe(false)
})

it('checks Host and client entrypoints and pinned plugin identity in the offline runtime', () => {
  const root = temporaryRoot()
  const dir = join(root, 'node_modules', BUNDLED_LLM_RETRY.name)
  mkdirSync(join(dir, 'lib'), { recursive: true })
  const manifest = {
    name: BUNDLED_LLM_RETRY.name, version: BUNDLED_LLM_RETRY.version,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'cordis.patch.yml'),
    "- insert:\n    - id: llm-retry-settings\n      name: 'dsh-llm-retry-settings'\n")
  writeFileSync(join(dir, 'lib/index.js'), 'export function apply() {}\n')
  writeFileSync(join(dir, 'lib/client.js'), 'export default {}\n')
  expect(() => verifyBundledLlmRetry(root)).not.toThrow()
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...manifest, version: '0.0.0' }))
  expect(() => verifyBundledLlmRetry(root)).toThrow('identity or version mismatch')
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
  expect(() => verifyBundledLlmRetry(root)).toThrow('unexpected Host patch')
})
