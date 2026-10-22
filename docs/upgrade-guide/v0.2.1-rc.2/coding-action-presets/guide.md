---
kind: upgrade-guide
description: "Coding Action settings now write version 2 and bundled development actions use Matt Pocock skills."
---

# Coding Action presets and settings version 2

English | [中文](guide.zh.md)

## Change

Skill Launcher reads version 1 settings by updating unchanged preset fields and adding six actions. Custom fields and disabled states remain; an empty list stays empty. The unchanged duplicate task-splitting preset is removed. Saves and exports use version 2, which older clients cannot import.

Development replaces `writing-plans` and `executing-plans` with `to-tickets` and `implement`. The default bundle omits Superpowers skills; existing user-installed skills remain installed.

## Migration

1. Back up exported version 1 button settings before using an older client again.
2. Open Skill Launcher settings, inspect the upgraded labels and Skill IDs, then save to persist version 2. Customized fields remain editable. At the 100-action limit, add any omitted new presets after removing unwanted actions.
3. For source installations, run `node scripts/install-coding-skills.mjs` to install missing skills. Existing directories are skipped. Use `--overwrite` only to update them deliberately; the installer retains backups. Desktop distributions include the updated defaults.
4. Confirm that consultation inserts `/ask-matt`, ticket breakdown inserts `/to-tickets`, and development inserts `/implement`. Clicking only edits the draft. See the [launcher behavior](../../../../packages/client/ui-matt-skill-launcher/README.md) for context handoff requirements.
