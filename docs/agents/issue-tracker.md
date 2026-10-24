# Issue tracker

English | [中文](issue-tracker.zh.md)

Issues and specs for this repository live as GitHub issues in the clone's origin repository, currently `yuqiangdede/mattpocock-DSH`. Run `gh` from inside the clone; it infers the repository from `git remote -v`.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`, starting from [task](../../.github/ISSUE_TEMPLATE/task.md), [bug](../../.github/ISSUE_TEMPLATE/bug.md), or [feature](../../.github/ISSUE_TEMPLATE/feature.md) when one fits.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels --jq '[.[] | {number, title, labels: [.labels[].name]}]'`, narrowed with `--label` and `--state`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove a label**: `gh issue edit <number> --add-label "<label>"` and `gh issue edit <number> --remove-label "<label>"`.
- **Close an issue**: `gh issue close <number> --comment "..."`.
- **Make an issue a sub-issue**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>`. Where sub-issues are unavailable, put `Part of #<parent>` at the top of the child body.

## Issue metadata

An issue carries a native GitHub Issue Type; `kind/*` labels classify pull requests only, and `area/*` labels are optional on an issue ([taxonomy](../../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)).

A pull request that resolves an issue needs exactly one `kind/*`, at least one `area/*`, and at most one `p0`–`p3`; [issue policy](../../.github/issue-management/README.md) rejects any other value. Informational references such as `Refs #12` carry no Project requirement, while `Fixes`, `Closes`, and `Resolves` references are matched against the Project `Priority` field.

[config.json](../../.github/issue-management/config.json) names the `deepseek-harness/deepseek-harness` repository and Project 1, so Project-driven status transitions do not apply to a clone whose origin names another repository. Label and read issues directly, and take an issue's state from its labels, comments, and open or closed status rather than from a Project column.

## Pull requests as a request surface

**PRs as a request surface: no.** _Triage reads this flag; set it to `yes` to queue external pull requests alongside issues._

Set to `yes`, external pull requests run through the same roles with `gh pr view <number> --comments`, `gh pr diff <number>`, `gh pr comment`, `gh pr edit --add-label`, and `gh pr close`.

GitHub shares one number space across issues and pull requests, so resolve a bare `#12` with `gh pr view 12` before falling back to `gh issue view 12`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue as described under **Create an issue**.

## When a skill says "fetch the relevant ticket"

Read it as described under **Read an issue**.

## Wayfinding operations

The map is one issue labelled `wayfinder:map`, and its tickets are child issues. Create those labels on first use with `gh label create`.

- **Create the map**: `gh issue create --label wayfinder:map ...`, with Notes, Decisions so far, and Fog sections in the body.
- **Create a ticket**: an issue linked as a sub-issue of the map, labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Record blocking**: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`, where the database id comes from `gh api repos/<owner>/<repo>/issues/<n> --jq .id`. Where dependencies are unavailable, put `Blocked by: #<n>` at the top of the child body.
- **Find the frontier**: the map's open children whose `issue_dependencies_summary.blocked_by` is zero and which carry no assignee; the first in map order wins.
- **Claim a ticket**: `gh issue edit <n> --add-assignee @me`.
- **Resolve a ticket**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a pointer to the map's Decisions-so-far section.
