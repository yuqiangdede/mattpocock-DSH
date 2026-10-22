# Stage 1: launcher buttons and More

English | [中文](skill-launcher-buttons.zh.md)

The fork-owned Skill Launcher shows one row of shortcut buttons above the Composer; every other enabled button stays under a single More button that expands and collapses its list. Existing Skills and prompts keep their original insertion behavior; no agent lifecycle or DSH core code was modified.

In **Settings → Coding buttons / Skill Launcher**:
- Check **Show in launcher** on a button to place it directly in the row. Unchecked enabled buttons appear only under More.
- Change **Order** to sort both the row and the More list.
- Use the existing **Enabled** toggle to turn a button off everywhere.
- Save to host-persisted settings (revision-checked) or cancel to restore the last saved state.

The action document is schema version 3: it adds an optional boolean `pinned` that marks a shown button, and a version-2 client rejects it because that client rebuilds actions without unknown fields and would lose every placement. Versions 1 and 2 still load as before. A version-3 document omits the retired `group` field, which readers ignore; category visibility (`hiddenGroups`) is no longer stored. No network is required, including for Windows offline deployments.
