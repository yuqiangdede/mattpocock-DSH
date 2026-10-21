/** Resolve file-owned Windows packaging worker limits before packaging starts. */

const SIGNATURE_CACHE_CONCURRENCY = 'DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_CONCURRENCY'
const PACK_CONCURRENCY = 'DSH_DESKTOP_WINDOWS_PACK_CONCURRENCY'

/**
 * Validate the workspace pack limit without accessing signing hardware.
 * Windows publishes hundreds of workspace members, and packing them one process at a
 * time costs about one second per member; one keeps the former serial behavior.
 * @param {string | undefined} value Raw pack concurrency setting.
 * @returns {number} Pack concurrency, defaulting to four when omitted.
 */
function resolvePackConcurrency(value) {
  const raw = value ?? '4'
  if (!/^[1-9]\d*$/u.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`desktop package: ${PACK_CONCURRENCY} must be a positive integer`)
  }
  return Number(raw)
}

/**
 * Validate the cache worker limit and pack concurrency without accessing signing hardware.
 * @param {NodeJS.ProcessEnv} environment File-owned Windows packaging settings.
 * @returns {{signatureCacheConcurrency: number, packConcurrency: number}} Worker limits, both defaulting to four when omitted.
 */
export function resolveWindowsPackageSettings(environment) {
  const value = environment[SIGNATURE_CACHE_CONCURRENCY] ?? '4'
  if (!/^[1-8]$/u.test(value)) {
    throw new Error(`desktop package: ${SIGNATURE_CACHE_CONCURRENCY} must be an integer from 1 to 8`)
  }
  return { signatureCacheConcurrency: Number(value), packConcurrency: resolvePackConcurrency(environment[PACK_CONCURRENCY]) }
}
