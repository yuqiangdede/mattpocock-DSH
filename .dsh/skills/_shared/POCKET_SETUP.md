# Pocket initialization conventions (Fork extension)

Copy and adapt only the relevant sections; paths below are **inside the target project repository**, not the mattpocock-DSH installation. This companion file is read by `/setup-matt-pocock-skills`; do not create another setup Skill. Use `writing-for-agents` to keep the always-loaded pointer small.

## Root Agent instruction: one source

The Pocket pointer is the `### Project knowledge (Pocket)` sub-block of the `## Agent skills` block that `setup-matt-pocock-skills` writes in its step 4. Keep that text authoritative there, and do not add a separate `## Project knowledge (Pocket)` section, so one run cannot produce two competing instructions.

Preserve `AGENTS.md` or `CLAUDE.md` according to the imported Matt setup's selection rules. Do not create two root instruction files or two Pocket headings. In an existing repo, integrate with its instructions rather than replacing them.

## `docs/pocket/README.md`

```md
# Pocket — project knowledge map

Pocket is the canonical Markdown home for this project's requirements, decisions, design, architecture, task knowledge, and pitfalls. The Git repository is the version history; no RAG index is required.

## Always read
- [Knowledge policy](meta/knowledge-policy.md) — document authority, updates and maintenance
- Global coding/operational constraints: [add link **only when file exists**]

## Select documents by task
| Task/trigger | Canonical location | Required next read |
| --- | --- | --- |
| Clarify or freeze requirements | requirements/ | Relevant feature requirements, then acceptance criteria |
| Implement or review a feature | requirements/, specs/, design/ | Current spec and acceptance, then related ADR |
| Change irreversible architecture | adr/, topology/ | Relevant accepted ADRs and system topology |
| Investigate a bug or migration | pitfalls/ | Relevant incident or migration record |
| Track current work | tasks/ | Relevant ticket or backlog |

Only link to files that actually exist. Record imported legacy paths separately under a “Migration pending” heading and identify their present authority explicitly.

## Knowledge status
- Current/accepted: load for applicable tasks.
- Pending/draft: read only when resolving an open question; never treat as approval.
- Superseded/deprecated: load only for historical investigation; identify the replacing document.

## Maintenance
Review affected entries after requirement/design changes and significant PRs. Run `/pocket-maintenance` monthly or when duplication, contradictory instructions, or stale pointers appear.
```

## `docs/pocket/meta/knowledge-policy.md`

```md
# Knowledge ownership and maintenance

- Canonical knowledge: `docs/pocket/**/*.md`, except legacy paths that the Pocket index lists as authoritative pending migration; those remain authoritative until an approved migration moves them. Generated indexes and external issues are pointers, not second authoritative copies.
- Code, executable tests, tool configuration, and dependency lockfiles remain authoritative for actual implementation and installed versions. If they contradict a requirement or ADR, flag and resolve; do not change accepted requirements to match code without approval.
- New docs should state status (pending/accepted/superseded/deprecated), scope/owner where useful, and links to related requirements, tasks, and ADRs. Keep one authoritative location per fact. The Pocket index (`docs/pocket/README.md`) and this policy are status-exempt meta files.
- Use progressive disclosure: load this policy and relevant active documents, then referenced detail as needed. Do not load the whole knowledge directory by default.
- Keep secrets, credentials, user data, and raw session transcripts out of committed knowledge.
- Prefer links over copying content. Do not duplicate large configuration/code inventories easily discovered from the repository.
- After requirements, architectural changes, or substantial PRs, inspect affected knowledge and correct its index. Monthly, run `/pocket-maintenance` to propose duplicates, conflicts, stale docs, and archival candidates.
- Maintain history through Git and explicit successor links. Never automatically delete an ADR, erase an unresolved decision, or silently rewrite an approved requirement.
```

## `docs/agents/domain.md` — Pocket-aware domain consumer rules

When Pocket is selected as canonical, replace the upstream root-glossary path examples in the generated domain consumer config with a pointer like this, adapted to current contents:

```md
# Domain Docs

The active project knowledge map is `docs/pocket/README.md`. Follow its task pointers and `docs/pocket/meta/knowledge-policy.md` before changing an ADR or the glossary. New canonical domain terms and major accepted decisions belong in `docs/pocket/meta/glossary.md` and `docs/pocket/adr/` (create lazily) unless a retained legacy authority below still owns them; in that case keep writing that authority. Read the relevant files before domain modeling.

If legacy `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/adr/`, or context-local ADRs remain authoritative, list their precise paths and migration status below. Continue reading/writing those existing authorities until migration is expressly approved; do not create a competing second version.

## Legacy authorities, pending migration
- None in a fresh project.
```

The imported `domain-modeling` Skill explicitly mentions root `GLOSSARY.md` and `docs/adr/`, and `to-spec` publishes specs to the configured issue tracker. Root Agent instructions and this configuration provide a project preference, but **do not guarantee those imported Skills have been fully rewired**. Flag possible output conflicts, and propose a separately reviewed adapter if the entire coding flow must automatically write Pocket.

## Category conventions (lazily created)

- `meta/`: coding rules, operational limits, deliberate dependency choices.
- `requirements/`: `pending.md` for unsettled questions; feature-specific approved requirements and acceptance, ideally one document per independently evolving feature.
- `specs/`: detailed behavior and interface specifications.
- `design/`: system/module design and diagrams (Mermaid embedded in Markdown).
- `adr/`: `0001-short-title.md` with context, options, decision, trade-offs, status, and successors.
- `topology/`: system/module/data-flow diagrams.
- `tasks/`: local task notes when the issue tracker is insufficient; issues stay in the configured tracker with links to canonical specs.
- `pitfalls/`: incidents and migration/third-party pitfalls, with applicability and evidence.
- `assets/`: supporting images referenced by relative path.

Historical records may remain at their original path with a `status: superseded` / `status: deprecated` marker and successor link, or be archived with a validated redirect. Avoid creating empty category folders, duplicating existing source docs, or bulk-moving legacy docs without an approved migration.
