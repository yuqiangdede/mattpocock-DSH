---
description: "Fork-maintained Skill and prompt buttons with versioned Host settings."
kind: "package-reference"
---

# mattpocock-DSH / Skill Launcher

English | [中文](README.zh.md)

## Summary

This fork-only first-stage extension is independent of the DSH Agent Loop and Session store.

## Table of Contents

- [Behavior](#behavior)
- [Build and run](#build-and-run)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Behavior

- Two rows of buttons above the native Composer, with a More menu.
- Skill buttons look up the *effective current Session* catalog before inserting /skill-name. DSH deterministically loads the full SKILL.md when the user explicitly sends.
- Plain-prompt buttons insert text without a Skill binding.
- Native DSH Host Settings persist the versioned CodingAction JSON (with editable labels, prompts, enabled state, sort order and help copy). Settings supports export/import.
- No auto-send and no migration of historical Pi Sessions. The revision-guarded text insertion does not replace image/file chips.

Skills are deliberately not guessed or silently synthesized. Install their bundles in <DSH_HOME>/skills/<name>/SKILL.md or the current project's .dsh/skills/<name>/SKILL.md. See docs in this fork for specific installation instructions. Missing skills are shown as a non-destructive error.

### Build and run
From repository root, use the upstream build commands (pnpm install, pnpm run build, pnpm run dev:desktop). The fork-owned package is mounted in the default Web/Desktop client roster. Test real Electron interaction before merging.

The launcher uses the workspace package name `@deepseek-ai/dsh-client-ui-matt-skill-launcher` and shared DSH version so release verification supplies its tarball alongside the Web bundle. Only built JavaScript and declarations enter that tarball. This naming follows the existing release tooling; the plugin remains maintained by this fork.

## Model Experience

### User-submitted action text

#### What the model sees

Only after the user sends the draft, the selected prompt enters the ordinary user message. DSH owns expansion of an explicit `/skill-name` command; the launcher registers no Agent tools or system prompt.

#### Token effect

The submitted prompt and any Skill instructions contribute their ordinary message tokens. Clicking a button alone adds no model input.

#### KV Cache effect

The launcher changes no existing model prefix. The normal Session submission and Skill-loading path owns request assembly.

## Known Limitations and Deferred Work

- Windows Electron interaction, browser discussion writeback, and external document-generation dependencies require end-to-end acceptance.

### Dev Note

The fork maintains this plugin independently of the upstream Agent Loop and Session store.
