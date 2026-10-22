/** Build-only download of the fixed Side Chat npm release. */
import { BUNDLED_SIDE_CHAT } from '../src/bundled-plugins.ts'
import { stageBundledArchive } from './bundled-archive.ts'

/**
 * Verify the pinned Side Chat archive before making it available to pnpm.
 * @param projectDir - Disposable runtime project.
 * @param stateDir - Reusable build cache.
 * @returns Resolves after the verified archive is staged.
 */
export function stageBundledSideChatTarball(projectDir: string, stateDir: string): Promise<void> {
  const name = `${BUNDLED_SIDE_CHAT.name}-${BUNDLED_SIDE_CHAT.version}.tgz`
  return stageBundledArchive(projectDir, stateDir, {
    name,
    url: `https://registry.npmjs.org/${BUNDLED_SIDE_CHAT.name}/-/${name}`,
    sha256: BUNDLED_SIDE_CHAT.sha256,
    maxBytes: 5 * 1024 * 1024,
  })
}
