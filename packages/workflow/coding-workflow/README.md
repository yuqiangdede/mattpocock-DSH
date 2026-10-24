---
description: "The Host-authoritative staged coding workflow service and its model-facing tool, for users and maintainers running guarded implement-review-verify-commit tasks."
kind: "package-reference"
---

# @deepseek-ai/dsh-coding-workflow

English | [中文](README.zh.md)

## Summary

`dsh-coding-workflow` runs one staged coding task from requirements to a single local commit. The Host owns the Work Item: stages record evidence, implementation stays inside a planned file list, review and verification bind to the change fingerprint they observed, and the commit stages only the files that fingerprint covers. The model drives it through the `coding_workflow` tool; the Web Client reads the same record through its Remote. Nothing here pushes, merges, or writes a remote. Use it when a task must prove it was reviewed and built before its commit.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package wherever a Session should be able to claim a coding task. It registers the `ctx.codingWorkflow` service, opens the `coding_workflow` storage domain, and registers the model-facing `coding_workflow` tool on the same Context.

```yaml
- name: '@deepseek-ai/dsh-coding-workflow'
  config:
    verificationTimeoutMs: 1800000
```

| Field | Default | Meaning |
|---|---|---|
| `verificationTimeoutMs` | 1800000 | Deadline of one registered verification command. |

The service requires `storageDomain`, `agents`, and `workingDirectory`; the storage rows (`dsh-storage`, a backend, `dsh-storage-domain`) must be mounted before it activates.

### Task lifecycle

`start` refuses a dirty tree, claims the current branch, and creates `coding/<id>` when the tree sits on `main` or `master`. S0 is complete at creation. S1–S4 and S9 accept an evidence file; `checks` accepts the planned commands and the exact allowed paths between S3 and S4. S5 records structured findings, S6 records a repair round, S7 runs each planned command and requires the change fingerprint to stay unchanged, S8 is the single local commit, and S9 records the delivery report. A second unfinished task on the same session or branch is refused, and every mutation increments `revision` so a stale caller fails instead of overwriting.

### Failures and recovery

A stage that no longer matches the repository (`Branch changed`, `HEAD changed outside workflow`) refuses to continue rather than guessing. Two consecutive reviews reporting the same blocking findings stop the task, as does a fourth repair round. A verification that fails, or that observes a changed source, blocks the task at S7. Mode changes pause the task; resuming re-checks the branch and HEAD.

Paused, blocked, and waiting-approval tasks reject verification before spawning a command and reject commits before staging files. Resume the task, or approve its pending decision, before retrying.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

- [`src/domain.ts`](src/domain.ts) is the pure state machine: `applyStage`, `applyReview`, `applyRepair`, `applyVerification`, `recordCommit`, and the human-decision verbs. It takes a `RepositorySnapshot` and returns a new record, so every rule is testable without Git.
- [`src/repository.ts`](src/repository.ts) owns the repository effects: snapshots and fingerprints, evidence hashing, verification runs, and the single exact-file commit.
- [`src/spec.ts`](src/spec.ts) declares the durable `coding-workflow` domain (`workItems`, one record per task) with the zod schemas that validate the stored format.
- [`src/index.ts`](src/index.ts) is the service: it opens the domain, resolves the Session directory, applies one transition per call, and emits `coding-workflow/changed` after each accepted mutation.
- [`src/tool.ts`](src/tool.ts) is the model-facing `coding_workflow` tool; every verb delegates to the service.
- [`src/guard.ts`](src/guard.ts) is the monotonic tool guard: while a task is active it blocks direct Git mutations, refuses repository writes while the task waits for a human, and confines `write`/`edit` paths to the planned implementation scope.

The durable record is product state, not session history: it lives in the shared storage backend rather than the Session log, so it survives a restart without changing the Session format.

-----

<a id="model-experience"></a>
## Model Experience

### The `coding_workflow` tool

#### What the model sees

One tool, `coding_workflow`, with a flat verb schema (`start`, `status`, `stage`, `checks`, `review`, `repair`, `verify`, `commit`, `mode`, `pause`, `resume`, `approval`, `approve`, `block`, `cancel`). Each result carries the task identity, revision, status, current stage, mode, branch, commit reference, blocker, the ten stage statuses, and the next expected verb.

#### Token effect

The tool description is about 90 tokens; one call result is under 150 tokens. Evidence and verification output stay in files, not in the transcript; the record itself never enters a request.

#### KV Cache effect

No effect on its own: the tool schema is part of the stable tool catalog, and the record is returned per call rather than injected into the prompt. A mode or stage change does not rewrite earlier request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Guard covers tool calls, not shell contents** — the registered guard refuses direct Git mutations and writes outside the planned paths through `write`, `edit`, `bash`, and `pwsh`, but a program launched from a shell that writes files is only caught by its change set at review and verification time.
- **In-process writes only** — the storage domain serializes writes inside one Host process; two Host processes writing the same Work Item are not coordinated, so the revision compare-and-set is the only conflict detector.
- **No push path by design** — the package has no verb that fetches, pushes, merges, or opens a pull request.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The pure state machine in `src/domain.ts` mirrors the acceptance contract in `docs/fork/coding-workflow-requirements-v1.zh.md`; change both together.

</details>
