---
kind: upgrade-guide
description: "Windows Desktop profiles now bundle Computer Use as an optional preset while the standard preset stays the default."
---

# Windows Desktop optional Computer Use preset

English | [中文](guide.zh.md)

## Change

On Windows, Desktop installations now bundle the offline `dsh-desktop-operator` runtime and the `@mattpocock/dsh-desktop-operator-preset` adapter. On first launch after upgrading, Desktop atomically updates the user's desktop profile manifest (`%USERPROFILE%\.dsh\profiles\desktop\package.json`) and adds the `desktop-computer-use` Agent Preset. The standard Agent Preset stays the deployment default; select `desktop-computer-use` in the Preset picker when a session needs Windows control.

The new preset exposes Windows Computer Use tools (`mcp__computer_use__*`) to the model with high-risk action confirmation policy. Existing user installations that already configured or disabled Computer Use are respected and will not be overwritten. Non-Windows platforms and the standalone Web profile remain unaffected.

## Migration

1. Launch the upgraded Desktop application on Windows. The migration automatically adds `@mattpocock/dsh-desktop-operator-preset` to `dsh.profile.bundles` and writes the migration marker `.desktop-operator-default-v0.12.1`.
2. If `desktop-computer-use` is your new-task default, first set Standard as the default in Agent Presets settings. Then disable Computer Use in Plugins or remove `@mattpocock/dsh-desktop-operator-preset` from `dsh.profile.bundles` in `%USERPROFILE%\.dsh\profiles\desktop\package.json`. Desktop respects the manual configuration and will not re-enable the bundle on subsequent launches.
3. Start a new session and inspect the tool catalog to confirm that the desired preset and tools are active.
