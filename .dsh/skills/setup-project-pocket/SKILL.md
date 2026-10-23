---
name: setup-project-pocket
description: "Initialize Matt engineering setup and a repository-local Pocket knowledge map with progressive disclosure; leave imported Matt Skills unchanged."
disable-model-invocation: true
---

# Initialize project Pocket

Run this user-invoked setup in the **target project repository**, not automatically in the mattpocock-DSH source checkout. It is an orchestration layer for the imported Matt setup, not a replacement for upstream Skills. Pocket is Markdown-only and works offline without an RAG index.

## 1. Inspect before editing

- Confirm the working repository root and inspect Git status, `AGENTS.md`, `CLAUDE.md`, `docs/agents/`, `docs/pocket/`, root `GLOSSARY.md`, `GLOSSARY-MAP.md`, and existing ADR, spec, requirements, and design locations.
- Read the installed `setup-matt-pocock-skills/SKILL.md` and its seed templates. This imported Skill is **user-invoked only** (`disable-model-invocation: true`): read it as reference and carry out its relevant setup steps here; do not attempt to invoke it via the Skill tool.
- If Matt's issue tracker and label configuration is absent, carry out the relevant discovery, user confirmation, and setup steps from that Skill. Preserve existing issue tracker/label decisions; Pocket does not replace the issue tracker.
- Call the model-invocable `writing-for-agents` Skill **before drafting or updating** `AGENTS.md`/`CLAUDE.md`, the Pocket index, or Agent-facing pointers. Use its rules for concise pointers, progressive disclosure, pruning, and single-source ownership.
- Identify all currently authoritative project docs. Existing non-Pocket material must not silently disappear, be relocated, or be duplicated as a second authoritative copy.

## 2. Set the project knowledge convention

Use [Pocket templates](references/pocket-templates.md) as the starting structure. Agree on the proposed paths and any migration of **existing** documentation before changing files. For a fresh project, prefer the defaults without unnecessary interviews.

- **Canonical Markdown knowledge root:** `docs/pocket/`. Keep requirements, decisions, design, topology, pitfalls, task records, and project constraints there. Source code, executable tests, build configuration, secrets, and issue-tracker state stay at their natural locations.
- **L0:** A brief pointer in the existing root `AGENTS.md` or `CLAUDE.md`. Follow the imported Matt setup's selection rules; never create a competing file. Respect symlinks and preserve unrelated sections.
- **L1:** `docs/pocket/README.md`, the compact navigation map; list category purpose, task-triggered links, canonical/legacy status, and material that must always be read.
- **L2:** Task-relevant Markdown (for example `meta/`, `requirements/`, `design/`, `specs/`, `adr/`, `topology/`, `tasks/`). Read only applicable documents **plus** mandatory global constraints and current task acceptance criteria.
- **L3:** Referenced detailed evidence in `pitfalls/`, historical decisions, `assets/`, and deeper technical docs. Open on demand when L2 does not answer the question.
- Create `docs/pocket/README.md` and `docs/pocket/meta/knowledge-policy.md` if absent; create other category files only when there is real content. Do not fill the repo with empty placeholder pages or copied source/config facts.
- Keep existing `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` where imported Matt Skills expect them. Update `docs/agents/domain.md` only with an explicit navigation pointer into Pocket, not duplicated domain facts. If a legacy glossary/ADR remains canonical pending migration, label it as such in the index and do not create a competing authoritative Pocket copy.
- Matt's imported `domain-modeling` and `to-spec` Skills still refer to root `GLOSSARY.md`, `docs/adr/`, and issue tracker output. Explicitly identify these compatibility exceptions when completing setup: do not claim they are automatically redirected. Use Pocket as the project-specific destination when acting through this Skill, and propose a separate adapter before promising universal integration.

## 3. Make writes safe and repeatable

1. Show the planned paths, index entries, and the exact steering block to add before changing an existing repo. Obtain user approval for any content migration, rename, deletion, or replacement of a pre-existing authority.
2. When `docs/pocket/` already exists, **merge only missing navigation or confirmed improvements**. Do not reset or overwrite user documents, annotations, statuses, links, or Git history.
3. Insert or update **one** `## Project knowledge (Pocket)` block in the selected Agent instruction file. State *when* to read the index and constraints, not an unconditional instruction to load every document.
4. Ensure `docs/pocket/README.md` links resolve or are clearly labeled “not created yet”; do not publish broken links. Any existing external project documentation remains referenced until explicitly migrated.
5. Validate Markdown links, duplicate headings/pointers, and that active documents do not contradict the recorded canonical locations. Check `git diff --check` where Git is available. Report checks actually executed, and describe any unverified integration.
6. Summarize files created/updated, legacy exceptions, pending decisions, and how to invoke `/pocket-maintenance`. Do not commit, push, or alter application source unless expressly requested.

### Completion criteria

The initialized project has one discoverable Pocket root, an L0 pointer, an L1 navigation map, documented ownership rules, no silently overwritten authoritative documents, and a clear note of remaining imported-Skill path incompatibilities. No vector database, embedding model, cloud service, or RAG initialization is needed.
