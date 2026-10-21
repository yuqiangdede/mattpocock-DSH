# mattpocock-DSH / Skill Launcher

This fork-only first-stage extension is independent of the DSH Agent Loop and Session store.

- Two rows of buttons above the native Composer, with a More menu.
- Skill buttons look up the *effective current Session* catalog before inserting /skill-name. DSH deterministically loads the full SKILL.md when the user explicitly sends.
- Plain-prompt buttons insert text without a Skill binding.
- Native DSH Host Settings persist the versioned CodingAction JSON (with editable labels, prompts, enabled state, sort order and help copy). Settings supports export/import.
- No auto-send and no migration of historical Pi Sessions. The revision-guarded text insertion does not replace image/file chips.

Skills are deliberately not guessed or silently synthesized. Install their bundles in <DSH_HOME>/skills/<name>/SKILL.md or the current project's .dsh/skills/<name>/SKILL.md. See docs in this fork for specific installation instructions. Missing skills are shown as a non-destructive error.

### Build and run
From repository root, use the upstream build commands (pnpm install, pnpm run build, pnpm run dev:desktop). The fork-owned package is mounted in the default Web/Desktop client roster. Test real Electron interaction before merging.

The launcher uses the workspace package name `@deepseek-ai/dsh-client-ui-matt-skill-launcher` and shared DSH version so release verification supplies its tarball alongside the Web bundle. Only built JavaScript and declarations enter that tarball. This naming follows the existing release tooling; the plugin remains maintained by this fork.
