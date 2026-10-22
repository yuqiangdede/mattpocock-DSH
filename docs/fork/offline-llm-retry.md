# Offline Windows installer: LLM automatic retry settings

English | [中文](offline-llm-retry.zh.md)

## Goal

Windows installers include `dsh-llm-retry-settings` by default and load it as a disableable Desktop profile plugin on first launch. Internal machines need no access to npm or GitHub. **This does not modify DSH's core retry implementation or automatically enable policy overrides.**

## Version pinning and updates

- Source: [zeng6125-rgb/dsh-llm-retry-settings](https://github.com/zeng6125-rgb/dsh-llm-retry-settings)
- Pinned version: `0.1.18`
- Build source: GitHub Release `dsh-llm-retry-settings-0.1.18.tgz`
- Pinned SHA-256: `f7eee54b5ddcdc1f0b85225a818f2c23b290f5c1b355874b3fc8db35216cf563`
- Update the version and SHA-256 from the same upstream Release in `apps/desktop/src/bundled-plugins.ts`. The build verifies the tarball, copies Host and client code, locks runtime dependencies, and includes the files in the Desktop runtime descriptor's complete hash inventory.

## Usage behavior

- **New installations:** creating `profiles/desktop` first adds `dsh-llm-retry-settings` to `dsh.profile.bundles`. The plugin loads from the installer's private runtime without network access.
- **Existing Profiles:** a one-time migration creates the `.bundled-llm-retry-v1` marker. An existing locally installed plugin, even if disabled, prevents forced activation. Later manual disabling is respected on subsequent startup.
- **Interface:** Settings → General → LLM automatic retry configures retry counts, exponential backoff, error codes, per-model policies, and optional automatic continuation. **Upstream `enabled: false` remains unchanged**; native model-request retry policies change only after the user enables policy overrides.
- **Platforms:** Windows Desktop only. The Web profile and other desktop platforms are unaffected.

## Acceptance steps

1. Build the Windows x64 installer successfully with `pnpm run package:desktop:win:x64:unsigned`.
2. Pass `runtime:verify-bundled-llm-retry`: archive SHA, entry points, and Host patch verification succeed; the runtime descriptor fully covers the plugin.
3. Verify that a fresh isolated Desktop profile resolves the bundle, activates the Host plugin, and starts the built desktop without accessing npm or GitHub.
4. In a genuinely offline Windows environment, open the settings card, set retries to 3, save, restart, and cause a retryable error to verify policy behavior and persistence.
5. Verify that manual disabling survives restart and that existing Profiles migrate only once without altering unrelated plugin configuration.
6. Verify that native retry behavior stays unchanged while overrides are disabled.

**Note:** end-to-end availability requires Windows CI, complete packaging smoke tests, and real internal-network UI/request verification.

On Windows, `pnpm run test:snapshot snapshots/web/offline-desktop.snapshot.ts -t llm-retry` enables the bundled override and replays a deterministic transient failure followed by recovery. It compares the failed attempt, retry policy, successful response, and persisted Session output without a model API key.
