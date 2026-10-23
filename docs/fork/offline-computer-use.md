# Bundled Computer Use in offline Windows installers

English | [中文](offline-computer-use.zh.md)

This fork uses the independently maintained [DSH Desktop Operator](https://github.com/zjh02249/dsh-desktop-operator). This third-party development version is not an official production-grade DeepSeek component.

## Build and version upgrades

- **Single version/hash source**: `BUNDLED_DESKTOP_OPERATOR` in `apps/desktop/src/bundled-plugins.ts`.
- The pinned version is `0.12.1`. `sha256` identifies the upstream release's `.tgz`; `windowsX64Sha256` identifies the x64 executable from that release. Replace all three together during upgrades, review release notes and files, then rebuild.
- On a connected Windows build machine, run `pnpm run package:desktop:win:x64:unsigned`. Only the build downloads and verifies the pinned tarball, reusing the build cache. A SHA mismatch fails the build without falling back to the latest version or continuing packaging.
- The installer includes the plugin, its production dependencies, the native Windows `open-computer-use.exe`, and the default Agent Preset. Runtime startup does not download plugins from GitHub/npm.
- Enable this only for Windows Desktop. Preserve the upstream default Web Profile, DSH core, and root lockfile. Version upgrades should not modify `packages/bundle/web-app`.
- This fork generates a dedicated `@mattpocock/dsh-desktop-operator-preset` Bundle from the DSH standard Preset installed in **the same build**, reducing copied-content conflicts when synchronizing upstream. Changes to required upstream Preset fields block release and require manual review.

## Behavior

- A new Windows Desktop Profile includes the Computer Use Preset Bundle by default. It provides the `desktop-computer-use` Agent Preset while the standard Preset stays the deployment default; select `desktop-computer-use` in the Preset picker for sessions that need Windows control. DSH settings still govern any default Preset previously selected by the user.
- Existing Profiles migrate once on their first upgrade. **Restarting after manual disabling or “disable all plugins” recovery does not force the bundle on again.**
- Ordinary actions are available, while high-risk final operations such as `send`, `delete`, `upload`, and `purchase` use `highRiskActionPolicy: confirm`. Visual indicators remain enabled, and launching new programs is disabled by default.
- The plugin takes effect when a new Agent Session selects `desktop-computer-use`. Start a new session for existing conversations. Users can disable the `@mattpocock/dsh-desktop-operator-preset` Bundle in plugin management.
- Locked screens, the UAC secure desktop, and non-interactive remote desktop sessions are unsupported.

## Required acceptance on a physical Windows machine

1. Run `pnpm exec vitest run apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/bundled-desktop-operator.spec.ts`.
2. Verify that Windows x64 installer packaging and runtime smoke tests succeed, the offline Bundle is not skipped, and the plugin and executable hashes match the upstream release.
3. Install on a clean Windows machine **disconnected from the external network**. Verify that a new Session exposes `desktop-computer-use` tools. Start with read-only window listing, then test clicking, typing, and confirmation.
4. Point the model at an internally accessible model API that supports image input. Installing plugins without external network access does not provide offline model inference.
5. Verify existing-Profile upgrades, manual disabling, restart, recovery mode, and offline logs. Verify that data, screenshots, and control requests reach only authorized internal services.

**Acceptance limits**: build and Host smoke tests do not replace physical Windows GUI operations, offline startup, or internal model-request verification. Complete the physical-machine acceptance above before release.

On Windows, `pnpm run test:snapshot snapshots/web/offline-desktop.snapshot.ts -t computer-use` replays the generated default Preset through the shipped Web profile. It calls the real native read-only window-listing tool with an absent-app filter and compares model schemas, stream events, and persisted Session output without a model API key. Profile migrations atomically replace the manifest before publishing their completion markers; a failed replacement preserves the previous manifest for retry.
