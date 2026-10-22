/** Version-pinned optional DSH extension shipped with the offline Desktop runtime. */
export const BUNDLED_SIDE_CHAT = {
  name: 'dsh-side-chat-plus',
  version: '0.5.0',
} as const

/** Windows-only offline LLM retry settings plugin, pinned to a verified Release. */
export const BUNDLED_LLM_RETRY = {
  name: 'dsh-llm-retry-settings',
  version: '0.1.18',
  sha256: 'f7eee54b5ddcdc1f0b85225a818f2c23b290f5c1b355874b3fc8db35216cf563',
} as const

/**
 * Offline Windows Computer Use release. Updating requires its upstream release
 * tarball SHA-256 and Windows x64 binary SHA-256 from the same signed-off release.
 * Only the build machine downloads this asset; installed desktops never do.
 */
export const BUNDLED_DESKTOP_OPERATOR = {
  name: 'dsh-desktop-operator',
  version: '0.12.1',
  sha256: '4164409240e319781b1a24ecdba69e5c81ec94bafa95739a24eded22c8ca7a11',
  windowsX64Sha256: '420eb7c9ed4b65a43752ab8ce75d4e6012932ce75c99ed1c4ac4b16d6ddd3f30',
} as const

/** Desktop-only adapter bundle: the user can disable its preset independently. */
export const DESKTOP_OPERATOR_PRESET_BUNDLE = '@mattpocock/dsh-desktop-operator-preset'
export const DESKTOP_OPERATOR_PRESET_ID = 'desktop-computer-use'
export const WINDOWS_OPERATOR_BUNDLES = [DESKTOP_OPERATOR_PRESET_BUNDLE] as const
