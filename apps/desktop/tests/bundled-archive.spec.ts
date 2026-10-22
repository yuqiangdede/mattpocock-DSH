/** Bounded archive reads, integrity checks, and cache publication. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { stageBundledArchive } from '../scripts/bundled-archive.ts'
import { stageBundledSideChatTarball } from '../scripts/bundled-side-chat.ts'
import { BUNDLED_SIDE_CHAT } from '../src/bundled-plugins.ts'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-archive-'))
  roots.push(root)
  const bytes = Buffer.from('verified archive')
  return { project: join(root, 'project'), cache: join(root, 'cache'), bytes,
    archive: { name: 'release.tgz', url: 'https://example.invalid/release.tgz', maxBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') } }
}

it.each([undefined, '1'])('cancels an oversized stream with Content-Length %s before reading the rest', async (length) => {
  const test = setup()
  const cancel = vi.fn()
  let pulls = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(test.archive.maxBytes + 1)) },
    cancel,
  }, { highWaterMark: 0 })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {
    headers: length === undefined ? {} : { 'content-length': length },
  })))
  await expect(stageBundledArchive(test.project, test.cache, test.archive)).rejects.toThrow('size limit')
  expect(cancel).toHaveBeenCalledOnce()
  expect(pulls).toBe(1)
  expect(existsSync(join(test.cache, 'vendor', test.archive.name))).toBe(false)
  expect(existsSync(join(test.project, 'vendor', test.archive.name))).toBe(false)
})

it('accepts the exact byte limit and reuses only hash-matching cached bytes', async () => {
  const test = setup()
  const fetchMock = vi.fn().mockImplementation(async () => new Response(test.bytes))
  vi.stubGlobal('fetch', fetchMock)
  mkdirSync(join(test.cache, 'vendor'), { recursive: true })
  writeFileSync(join(test.cache, 'vendor', test.archive.name), 'corrupt')
  await stageBundledArchive(test.project, test.cache, test.archive)
  await stageBundledArchive(test.project, test.cache, test.archive)
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(readFileSync(join(test.project, 'vendor', test.archive.name))).toEqual(test.bytes)
})

it('rejects altered Side Chat bytes despite the pinned npm version', async () => {
  const test = setup()
  const fetchMock = vi.fn().mockResolvedValue(new Response('altered package'))
  vi.stubGlobal('fetch', fetchMock)
  await expect(stageBundledSideChatTarball(test.project, test.cache)).rejects.toThrow('SHA-256 mismatch')
  expect(fetchMock).toHaveBeenCalledWith(
    `https://registry.npmjs.org/${BUNDLED_SIDE_CHAT.name}/-/${BUNDLED_SIDE_CHAT.name}-${BUNDLED_SIDE_CHAT.version}.tgz`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(existsSync(join(test.project, 'vendor', `${BUNDLED_SIDE_CHAT.name}-${BUNDLED_SIDE_CHAT.version}.tgz`))).toBe(false)
})
