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

- Above the Composer, one shortcut row shows the buttons selected in settings; every other enabled button stays under a single More button that expands and collapses its list.
- Eight presets start shown — discussing requirements, finalizing the spec, developing, diagnosing a bug, reviewing code, fixing review findings, building and committing. A shown button is not repeated under More. Placement only chooses where a button appears; Enable turns it off everywhere.
- Each built-in prompt is limited to one stage: requirements discussion writes no code, development does not review code or run a full build, review does not edit code, review repair does not re-review, and build or commit do not change business code. Tooltips drop fixed labels and state the applicable scope, boundaries and an example directly.
- Consultation, ticket breakdown and development use `ask-matt`, `to-tickets` and `implement`. Additional Skills include domain modeling, research, retrospective and context handoff; the UI image prompt is last.
- Reading version 1 settings upgrades unchanged preset fields and adds six new actions, preserving custom fields, disabled states and an intentionally empty list. The unchanged duplicate task-splitting preset is removed; customized copies remain. Saving or exporting writes version 3, whose actions may carry a `pinned` flag that marks a shown button; version-2 clients drop unknown action fields on save, so they reject version 3 instead of losing the placement. This client omits the retired `group` field and ignores it when reading older documents. Later deletions stay deleted.
- Skill buttons look up the *effective current Session* catalog before inserting /skill-name. DSH deterministically loads the full SKILL.md when the user explicitly sends.
- Plain-prompt buttons insert text without a Skill binding.
- Native DSH Host Settings persist the versioned CodingAction JSON (with editable labels, prompts, enabled state, shown flag, sort order and help copy). Settings supports export/import.
- When the latest completed exchange clearly indicates a next workflow step, the matching enabled button is highlighted and a localized hint explains the recommendation.
- Each built-in action except initialization adds receiving instructions to its draft. Only Fix Review Findings also summarizes the latest completed exchange: its request (up to 1,000 characters) and result (up to 5,000 characters). Truncation is marked; excerpts require verification against original artifacts. Other actions copy no conversation text, and custom actions receive no added instructions. The user reviews and sends the draft; the launcher never sends or executes automatically.
- Recommendations use only the latest completed user/assistant exchange and skip unavailable or disabled actions. Interrupted turns and explicit errors can recommend Bug diagnosis or Continue.

Skills are deliberately not guessed or silently synthesized. Install their bundles in <DSH_HOME>/skills/<name>/SKILL.md or the current project's .dsh/skills/<name>/SKILL.md. See docs in this fork for specific installation instructions. Missing skills are shown as a non-destructive error.

The desktop package and `scripts/install-coding-skills.mjs` share `.dsh/skills` as their source. Selected skills and supporting files come from [Matt Pocock's skills](https://github.com/mattpocock/skills); `.dsh/skills/matt-source.json` records their revision. The bundle preserves the fork's document skills and contains no Superpowers skills. Existing user-installed skills are not removed; the installer skips existing directories unless explicitly given `--overwrite`, which preserves backups.

Receivers verify the current workspace before acting. Recommendations are text-based suggestions and establish neither passing checks nor commit/push authorization.

| Receiver | Required context |
|---|---|
| Discuss / finalize spec | Confirmed requirements, sources, scope, exclusions, acceptance criteria and open questions |
| Split into tickets / develop | Spec or ticket reference, dependencies, blockers, acceptance checks and remaining work |
| Review / fix review findings | Review base and diff, finding IDs, priorities, file locations, impact, required checks and per-finding status |
| Build / commit | Build: actual checks separated into passed, failed, not run and environment-blocked. Commit: commit identifier plus added and deleted lines grouped by directory or module; no repeated build or tests |
| Prototype / improve architecture | Design question or target module, constraints, evaluation criteria, artifacts and candidates to discuss |
| Domain modeling / research | Ambiguous concepts or research question, glossary or sources, conclusions and evidence gaps |
| Retrospective / context handoff / continue | Original goal, decisions, artifact references, checks, failures, remaining work, blockers and next steps; handoff redacts secrets |
| Documents / UI image prompt | Audience or screen requirements, sources, agreed scope, output constraints and validation |

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

- Recommendations are conservative text-based hints, not authoritative workflow-completion events; old or unloaded history is not searched.
- Windows Electron interaction, browser discussion writeback, and external document-generation dependencies require end-to-end acceptance.

### Dev Note

The fork maintains this plugin independently of the upstream Agent Loop and Session store.
