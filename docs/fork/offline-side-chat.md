# Bundled side chat in offline Windows installers

English | [中文](offline-side-chat.zh.md)

This fork's Windows Desktop release bundles `dsh-side-chat-plus@0.5.0` and its production dependencies. Only the connected build machine downloads the plugin; the installed Desktop does not use npm, pnpm, or online plugin installation when initializing `profiles/desktop`.

## Build

Run on a Windows build machine with access to the npm registry:

```powershell
pnpm run package:desktop:win:x64:unsigned
```

Use the project's existing signed release tasks for production releases. The build verifies the plugin version, bundle manifest, and client/Host files. The desktop runtime smoke test checks that the plugin HTTP route loads. The runtime hash manifest includes production dependencies.

## Acceptance without external network access

1. Disconnect a Windows test machine that has never used DSH from the external network, then install.
2. Confirm that the first launch requires no separate side-chat plugin installation.
3. Select text in the main conversation and confirm that the right-side chat entry appears and opens.
4. Configure the model service to use an accessible internal endpoint, then test side-chat replies and returning results.
5. Restart and confirm that settings persist. Disable the plugin manually, restart again, and confirm it stays disabled.
6. Check logs and confirm that startup does not request an online plugin registry.

**Offline installation does not provide offline model inference.** Supply a model API or another accessible model service on the internal network.

Maintain the version in `apps/desktop/src/bundled-plugins.ts`; do not copy third-party plugin source. Review third-party code and data destinations before release.
