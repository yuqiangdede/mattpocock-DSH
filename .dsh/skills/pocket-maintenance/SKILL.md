---
name: pocket-maintenance
description: "Audit and prune a repository's Pocket project knowledge: stale/duplicate/conflicting Markdown, broken pointers, and superseded decisions. Propose safe updates for human review."
disable-model-invocation: true
---

# Maintain Pocket knowledge

Run on the **target project** after significant requirement/architecture/PR changes, and as a recommended **monthly manual audit**. This Skill does not install a scheduler or background job. It performs a local, offline audit; no embeddings, vector store, or cloud RAG.

## 1. Read and inventory

1. Locate the repository root, inspect Git status and read `docs/pocket/README.md` and `docs/pocket/meta/knowledge-policy.md`. If absent, stop and recommend `/setup-matt-pocock-skills`; do not invent an index.
2. Call the `writing-for-agents` Skill for the pruning, context-pointer, deduplication, and document hierarchy rules before making suggestions.
3. Inventory every Markdown file currently under `docs/pocket/` (tracked or not), root `AGENTS.md`/`CLAUDE.md` and their loaded `AGENTS.local.md`/`CLAUDE.local.md` overlays, and *only* legacy project docs linked from the Pocket index; use `git status` to label tracked state so uncommitted Pocket work is audited rather than skipped. Read index metadata first; open full documents when a suspected issue requires evidence. Use local file search and Git history as needed.
4. Examine current requirements, related source/tests/config, ADR successors, task states, and references. A file's age alone does **not** establish it is stale; recent edits do **not** establish correctness.

## 2. Produce an evidence-based audit report

For each finding, provide source path, heading or lines, affected canonical document, evidence, impact, and proposed action:

- **Duplicates:** overlapping authoritative facts that could safely become one home plus links.
- **Conflicts:** mutually incompatible requirements, accepted ADRs, code behavior, or constraints. Distinguish a documented implementation gap from an approved change.
- **Stale material:** outdated instructions or paths supported by source/tests/replacement decisions; note uncertainty explicitly.
- **Unreachable pointers:** nonexistent relative links, missing index entries, or orphan active documents.
- **Excess context:** always-loaded pointers or overview docs that contain branch-specific detail better moved behind a reference.
- **Lifecycle:** pending decisions that were actually settled, superseded ADRs without successors, completed task notes still listed as active.

Classify each finding as: **safe editorial**, **requires domain decision**, or **insufficient evidence**. Show before/after consolidation targets and dependencies. Do not mark anything obsolete based solely on similarity, age, or a model guess.

## 3. Approval and edits

- Present the proposed diff and request explicit confirmation before **merging, renaming, archiving, deleting, or changing approved requirements, ADR outcomes, acceptance criteria, or operational limits**. Never auto-resolve a substantive conflict.
- With approval, make the smallest consistent change in the canonical document. Replace duplicates with stable relative pointers and update all affected references and the Pocket index. Preserve decision rationale and required audit evidence.
- Keep historical ADRs in Git with `superseded` or `deprecated` status and a successor reference when applicable. For non-ADR documents, only archive/remove once the user approves the disposition and the links have been checked.
- Respect dirty worktrees, uncommitted user edits, and concurrent changes; never overwrite or reset unrelated edits. Do not commit, push, or modify application source without an explicit request.
- Do not convert `pending` to `accepted`, weaken acceptance criteria, or rewrite a spec to agree with implementation without a domain decision.
- After edits, verify index and relative links, duplicate authoritative entries, statuses/successors, and `git diff --check` (if Git available). If checks were not run, state that; do not label an inspection as a proof of semantic consistency.

## 4. Finish

Report findings by severity, what changed, what still requires user decision, and checks performed. If no safe edits were approved, return the report without mutating files. Recommend the next monthly review or the next event-driven review; do **not** imply a periodic background job was created.
