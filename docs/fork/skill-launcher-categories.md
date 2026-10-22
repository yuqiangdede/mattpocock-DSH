# Stage 1: button categories and shortcuts

The fork-owned Skill Launcher now displays an optional pinned shortcut row and one selected category at a time. Existing Skills and prompts keep their original insertion behavior; no agent lifecycle or DSH core code was modified.

In **Settings → Coding buttons / Skill Launcher**:
- Toggle a category to hide/show its tab; this does **not** disable the underlying Skill.
- Check **Pin shortcut** on any button to keep it in the shortcut row. Pinned buttons are not duplicated under a category.
- Change **Order** to sort buttons within categories and shortcuts.
- Use the existing **Enabled** toggle to disable a button everywhere.
- Save to host-persisted settings (revision-checked) or cancel to restore the last saved state.

The action document remains schema version 2 and adds an optional boolean `pinned` to each action. Existing saved actions load as before. Category visibility is stored separately as `hiddenGroups` in Host Settings. No network is required, including for Windows offline deployments.
