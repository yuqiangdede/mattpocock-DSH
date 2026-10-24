/** Hash-pinned build archives with bounded reads and no partial cache publication. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Download identity and maximum retained bytes for one bundled release. */
export interface BundledArchive {
  name: string
  url: string
  sha256: string
  maxBytes: number
}

/**
 * Stage a verified archive, reusing only a size- and hash-matching build cache.
 * @param projectDir - Disposable runtime project receiving vendor files.
 * @param stateDir - Persistent build cache directory.
 * @param archive - Pinned release identity and byte limit.
 * @returns Resolves after publishing the complete verified archive; failures publish no download.
 */
export async function stageBundledArchive(projectDir: string, stateDir: string, archive: BundledArchive): Promise<void> {
  const cacheDir = join(stateDir, 'vendor')
  const targetDir = join(projectDir, 'vendor')
  const cached = join(cacheDir, archive.name)
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(targetDir, { recursive: true })
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  let bytes = existsSync(cached) && statSync(cached).size <= archive.maxBytes ? readFileSync(cached) : undefined
  if (bytes === undefined || digest(bytes) !== archive.sha256) {
    const response = await fetch(archive.url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`desktop archive ${archive.name}: download failed (HTTP ${response.status})`)
    }
    if (Number(response.headers.get('content-length')) > archive.maxBytes) {
      await response.body?.cancel()
      throw new Error(`desktop archive ${archive.name}: download exceeds size limit`)
    }
    if (response.body === null) throw new Error(`desktop archive ${archive.name}: empty response`)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > archive.maxBytes) {
          await reader.cancel()
          throw new Error(`desktop archive ${archive.name}: download exceeds size limit`)
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    bytes = Buffer.concat(chunks, size)
    if (size === 0 || digest(bytes) !== archive.sha256) {
      throw new Error(`desktop archive ${archive.name}: upstream archive SHA-256 mismatch; refusing release`)
    }
    writeFileSync(cached, bytes)
  }
  copyFileSync(cached, join(targetDir, archive.name))
}
