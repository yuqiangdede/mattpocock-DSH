---
name: setup-matt-pocock-skills
description: "Configure this repo for engineering skills: issue tracker, triage labels, and progressive-disclosure Pocket project documentation. Run once before first use."
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker**: where issues live (GitHub by default; local markdown is also supported out of the box)
- **Triage labels**: the strings used for the five canonical triage roles
- **Project knowledge**: a `docs/pocket/` knowledge map with task-triggered references, plus domain documentation rules and safe coexistence with legacy glossaries and ADRs

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

**Fork-specific Pocket extension:** Apply [Pocket setup conventions](../_shared/POCKET_SETUP.md) while performing the existing steps below. There is no separate Pocket initializer. Pocket is a Markdown knowledge layout with progressive disclosure, **not** an RAG index.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- `docs/pocket/`: does its README, knowledge policy, active requirements, design, or ADRs already exist? Identify which location is currently authoritative before changing paths.
- `.scratch/`: a sign that a local-markdown issue tracker convention is already in use
- Is the `triage` skill installed? (a `triage` skill folder alongside this one, or `triage` in your available skills.) This decides whether Section B runs at all.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order. One section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when `triage` isn't installed, Section C when there's no monorepo).

**Section A: Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, and `to-spec` read from and write to it. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub**: issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab**: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown**: issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.): ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off**. Leave it off and don't raise it: a user who wants external PRs in the triage queue can flip the flag in the file later.

**Section B: Triage label vocabulary.** Skip this section entirely if the `triage` skill isn't installed (exploration told you), since an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the overrides so `triage` applies existing labels instead of creating duplicates.

**Section C: Domain docs and Pocket.** This Fork defaults new project knowledge to **`docs/pocket/`**, using the conventions and templates in [Pocket setup conventions](../_shared/POCKET_SETUP.md). Keep the established tracker and triage configuration above. For a new single-context project, initialize only the small index and policy files; create glossary, requirements, ADRs, and other category documents lazily as facts are confirmed. For a genuine monorepo, retain one Pocket root but add context-specific index pointers as needed (no separate knowledge root).

If a project already has `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/adr/`, or other authoritative documentation, **do not silently relocate or copy it**. Show the existing authority and proposed migration, preserve it until explicitly approved, and list legacy paths in the Pocket index. Write `docs/agents/domain.md` with the actual project-specific canonical paths and backward-compatibility exceptions. Imported `domain-modeling` and `to-spec` still contain legacy path/output assumptions: acknowledge these rather than claiming their behavior is automatically redirected.

### 3. Confirm and edit

Call the model-invocable **`writing-for-agents` Skill** before drafting. Apply its pointer-writing, progressive disclosure, single-owner, and pruning guidance to the Agent instruction block, the Pocket index, and the domain-document pointers. When that Skill cannot be loaded, state the limitation instead of claiming it ran.

Show the user a draft of:

- The `## Agent skills` block to add or update in each loaded root instruction file (`CLAUDE.md` and/or `AGENTS.md`; see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)
- The small `docs/pocket/README.md`, `docs/pocket/meta/knowledge-policy.md`, and root Agent instruction pointer. Include any known legacy-to-Pocket migration decisions.

Let them edit before writing.

### 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create; don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa); always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

When both `AGENTS.md` and `CLAUDE.md` already exist, DSH loads both (identical content is deduplicated). Update the `## Agent skills` block in each loaded file, or reconcile the other file's stale domain and Pocket pointers, so the repository does not carry two different knowledge destinations.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of active domain docs and legacy exceptions]. See `docs/agents/domain.md`.

### Project knowledge (Pocket)

Before working on project requirements, design, or code, read `docs/pocket/README.md` and its task-specific pointers; see `docs/pocket/meta/knowledge-policy.md` for canonical ownership, update, and maintenance rules. New or changed decisions belong in the location the Pocket index records as authoritative (Pocket, or a retained legacy authority pending migration), not solely in chat. If source, existing docs, or task instructions conflict, report the discrepancy rather than silently rewriting requirements.
```

Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, only when `triage` is installed and Section B ran. When it isn't, both are omitted.

When Section B ran on GitHub or GitLab, create each configured label the tracker lacks (`gh label create` / `glab label create`).

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping (only if `triage` is installed)
- [domain.md](./domain.md): upstream domain doc consumer rules + layout; **adapt it using the Pocket domain template** in [Pocket setup conventions](../_shared/POCKET_SETUP.md) rather than copying its root-glossary defaults when initializing Pocket

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

Using [Pocket setup conventions](../_shared/POCKET_SETUP.md), create `docs/pocket/README.md` and `docs/pocket/meta/knowledge-policy.md` if absent. Create no empty category documents. Merge existing content without overwriting user decisions. Avoid dangling links and duplicate Agent instruction headings; handle `CLAUDE.md` symlinks without replacing them. Validate index links and changed files (`git diff --check` when available). Do not automatically install RAG, relocate legacy docs, or commit changes.

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Summarize Pocket entry paths, any still-authoritative legacy docs, and the imported-Skill compatibility limitations. Mention they can edit `docs/agents/*.md` and Pocket Markdown directly later; rerun setup only to revise the layout or tracker. Recommend `/pocket-maintenance` for later evidence-based cleanup.
