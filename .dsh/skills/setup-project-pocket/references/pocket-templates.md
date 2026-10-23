# Pocket initialization templates

Copy and adapt only the relevant sections; paths below are **inside the target project repository**, not the mattpocock-DSH installation. Use `writing-for-agents` to keep the always-loaded pointer small.

## Root Agent instruction: add/update exactly one section

```md
## Project knowledge (Pocket)

Before changing requirements, design, or code, read `docs/pocket/README.md` to locate the currently authoritative knowledge. Always read applicable global constraints and the current task's acceptance criteria. Follow the README's task pointers to open only relevant documents; open referenced history/evidence when necessary. New or changed project decisions and requirements belong under `docs/pocket/`, not solely in chat. If source, existing docs, or task instructions conflict, report the discrepancy rather than silently rewriting requirements. See `docs/pocket/meta/knowledge-policy.md` for updates and maintenance.
```

Preserve `AGENTS.md` or `CLAUDE.md` according to the imported Matt setup's selection rules. Do not create two root instruction files. In an existing repo, integrate with its instructions rather than replacing them.

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

- Canonical knowledge: `docs/pocket/**/*.md`; generated indexes and external issues are pointers, not second authoritative copies.
- Code, executable tests, tool configuration, and dependency lockfiles remain authoritative for actual implementation and installed versions. If they contradict a requirement or ADR, flag and resolve; do not change accepted requirements to match code without approval.
- New docs should state status (pending/accepted/superseded/deprecated), scope/owner where useful, and links to related requirements, tasks, and ADRs. Keep one authoritative location per fact.
- Use progressive disclosure: load this policy and relevant active documents, then referenced detail as needed. Do not load the whole knowledge directory by default.
- Keep secrets, credentials, user data, and raw session transcripts out of committed knowledge.
- Prefer links over copying content. Do not duplicate large configuration/code inventories easily discovered from the repository.
- After requirements, architectural changes, or substantial PRs, inspect affected knowledge and correct its index. Monthly, run `/pocket-maintenance` to propose duplicates, conflicts, stale docs, and archival candidates.
- Maintain history through Git and explicit successor links. Never automatically delete an ADR, erase an unresolved decision, or silently rewrite an approved requirement.
```

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
