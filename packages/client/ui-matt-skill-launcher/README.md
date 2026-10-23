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
- Nine presets start shown — discussing requirements, finalizing the spec, developing, diagnosing a bug, reviewing code, fixing review findings, building, committing and supplementing documents. A shown button is not repeated under More. Placement only chooses where a button appears; Enable turns it off everywhere.
- Each built-in prompt is limited to one stage: requirements discussion writes no code, development does not review code or run a full build, review does not edit code, review repair does not re-review, and build or commit do not change business code. Tooltips drop fixed labels and state the applicable scope, boundaries and an example directly.
- Coding buttons and the automatic workflow do not update product documents during coding. After finishing they list the affected existing documents and point to Supplement Docs; the automatic workflow asks once at S9 after the local commit and updates only on confirmation, leaving those changes uncommitted. The Supplement Docs button supplements only confirmed session conclusions into existing requirements, design, database and interface documents; it lists missing documents and verifies database and interface claims against actual SQL or source.
- Consultation, ticket breakdown and development use `ask-matt`, `to-tickets` and `implement`. Additional Skills include domain modeling, research, retrospective and context handoff; the UI image prompt is last.
- Reading version 1 settings upgrades unchanged preset fields and adds six new actions, preserving custom fields, disabled states and an intentionally empty list. The unchanged duplicate task-splitting preset is removed; customized copies remain. Saving or exporting writes version 3, whose actions may carry a `pinned` flag that marks a shown button; version-2 clients drop unknown action fields on save, so they reject version 3 instead of losing the placement. This client omits the retired `group` field and ignores it when reading older documents. Later deletions stay deleted.
- Skill buttons look up the *effective current Session* catalog before inserting /skill-name. DSH deterministically loads the full SKILL.md when the user explicitly sends.
- Plain-prompt buttons insert text without a Skill binding.
- Native DSH Host Settings persist the versioned CodingAction JSON (with editable labels, prompts, enabled state, shown flag, sort order and help copy). Settings supports export/import.
- When the latest completed exchange clearly indicates a next workflow step, the matching enabled button is highlighted and a localized hint explains the recommendation.
- The Mode row switches Manual and Automatic. While a Session owns a coding task, the launcher shows its stage progress, mode, branch, blocker, and the commands a human may send: approve a pending scoped decision, cancel the task, or pause and resume it. Each command carries the revision the panel read, so a stale panel reports a conflict instead of overwriting a newer record.
- Above the composer, one reserved status line qualifies a running Agent whose plan still has unfinished items and whose visible content has not changed for `todoStaleMs` (default 90 s). The line keeps its height while a running plan is watched, so the delayed hint never reflows the composer, and it disappears when the Agent idles or the plan completes. `todoStaleMs` is the launcher's own deployment value: it measures what this view observed, which is not the Host's `todo_write` timestamp, and it is separate from the guard's `staleAfterMs`.
- The package also ships `./todo-progress-guard`, a Host plugin the standard and PTC Agent presets mount beside `todo_write`. It only reads the Session's `todos` projection and appends model-facing context; it never writes todo state, changes a status, or edits a file.
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
| Supplement documents | Confirmed session conclusions, existing requirements/design/database/interface documents, and actual SQL or source for database or interface claims |

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

### Todo progress reminder

#### What the model sees

The standard and PTC Agent presets mount `@deepseek-ai/dsh-client-ui-matt-skill-launcher/todo-progress-guard` (the minimal preset mounts neither it nor `todo_write`). It reads only the Session's `todos` projection: after a committed `todo_write` leaves an unfinished item it counts succeeding tool calls, and once at least `minToolCalls` calls (default 5) and `staleAfterMs` (default 90 s) have passed since that commit it appends one user-role context message to the tool result. That message is logged as a `user/message` event with source `{kind: 'matt-todo-progress-guard', form: 'notice', summary: '<n> calls since todo_write'}`, so the transcript shows it and the next model request carries it; a later `turn/start` (which clears the projection), a rejected `todo_write`, an all-completed plan, or no projected plan stops the watch, `reminderCooldownMs` (default 90 s) bounds repetition, and the guard never calls `todo_write`, never changes a status, and never infers completion from edits.

##### Reminder text

```markdown
Progress sync reminder: tool activity has continued while the todo list remained unchanged. Compare actual outputs with each todo, call todo_write now if a step has genuinely changed, and mark completed only with evidence. Do not infer completion from edits alone. If the current step is still in progress, keep it in_progress and continue working.
```

#### Token effect

One reminder is about 360 characters, roughly 90 tokens, and arrives at most once per cooldown window for one live plan. Every other tool call adds no model input.

#### KV Cache effect

The reminder is appended after the tool result as a new user-role message. It leaves the existing prefix — system prompt, earlier messages, and the preceding tool result — unchanged, so a provider cache covering that prefix stays reusable and only the reminder and later content are fresh tokens.

## Known Limitations and Deferred Work

- Recommendations are conservative text-based hints, not authoritative workflow-completion events; old or unloaded history is not searched.
- The product-document gate is Skill and prompt policy; the Host does not yet block product-document edits.
- The progress guard only advises. It does not make the model follow the reminder, and a deployment that needs a hard stage-completion guarantee must drive it from an acceptance event in its own workflow instead.
- The status line observes what this view has rendered. A repeated write of the same plan does not reset its timer, and it cannot report the Host's write time.
- Windows Electron interaction, browser discussion writeback, and external document-generation dependencies require end-to-end acceptance.

### Dev Note

The fork maintains this plugin independently of the upstream Agent Loop and Session store.
