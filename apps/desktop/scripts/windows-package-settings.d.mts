/**
 * Validate the file-owned Windows worker limits before packaging starts.
 * @param environment Windows packaging settings loaded from .env.windows.
 * @returns The signature-cache worker limit from one to eight and the workspace pack
 * concurrency, both defaulting to four when omitted; invalid values throw.
 */
export function resolveWindowsPackageSettings(environment: NodeJS.ProcessEnv): {
  signatureCacheConcurrency: number
  packConcurrency: number
}
