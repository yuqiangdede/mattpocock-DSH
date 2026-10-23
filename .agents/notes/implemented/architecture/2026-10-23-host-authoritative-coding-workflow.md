# Agent Note: Host-authoritative coding workflow

Status: implemented

English | [中文](2026-10-23-host-authoritative-coding-workflow.zh.md)

## Problem

The dual-mode coding workflow first kept its staged task record in a JSON file written by a skill-local CLI. Two consequences made the record unusable as product state. The Client could not read it: a Web user saw only the native Goal phase, never the stage, the pending approval, or the evidence a task had accumulated. And the record had no owner inside the Harness: any process that found the file could rewrite it, the workflow had no durable store beyond one machine path, and a reviewer could not distinguish an authoritative transition from a file edit.

The repository forbids the obvious fix. Appending a new `SessionEventMap` member from a plugin is unsafe: live `Session.append()` cannot set the `ignorable` marker that lets an older reader reopen the log, and `appendPluginRecord()` is reserved for `packages/experimental/`. The sanctioned alternatives for plugin-owned durable data are deriving state from existing events or keeping it in a storage service, and deriving this state from conversation events would mean interpreting model prose.

## Decision

**The Work Item is Host product state in the shared storage domain, and one service owns every transition.** `packages/workflow/coding-workflow` opens a `coding_workflow` domain with one `work_items` record per task. `CodingWorkflowService` (`ctx.codingWorkflow`) is the only writer: it resolves the Session's working directory, reads a repository snapshot, applies one pure transition, and stores the new revision. The model drives it through the `coding_workflow` tool, which delegates every verb to the service rather than editing files; the Web Client reads the same record through the service's Remote namespace and receives `coding-workflow/changed` after each accepted mutation.

**Every gate validates the repository, not the caller's claim.** `src/domain.ts` holds the transitions as pure functions over a `RepositorySnapshot`: branch and HEAD must still be the ones the task claimed, implementation files must be inside the planned allowed paths, review and verification freeze the change-set fingerprint they observed, and the single local commit must stage exactly the files that fingerprint covers after re-verifying each recorded evidence digest. Verification runs the planned command and compares the snapshot before and after, so a build that changes the tree cannot pass.

**The tool guard is the enforcement seam, not the prompt.** `src/guard.ts` registers `ctx.tools.guard()`: while a task owns the workspace, `bash`/`pwsh` may not run `commit`, `push`, `reset`, `checkout`, `rebase`, or `merge`, `write`/`edit` may not address files outside the planned scope, and no repository mutation starts while the task waits for a human. Guards are monotonic and synchronous, so no later listener or prompt can turn a denial back into permission. A shell program that writes files remains outside this check; its change set is what review and verification observe.

## Verification

Thirty tests cover the pure transitions, the guard decisions, and the service over real storage and real Git: the full S1-S9 run including the exact-file commit, dirty-tree and branch-ownership refusal, an out-of-scope change and a stale revision, the mode pause, and a restart that reads the persisted record without advancing it. `pnpm run typecheck` and `pnpm run build` (nine gates) pass, and Windows CI covers the build, the offline replay, and the desktop packaging path.

## Consequences

The record now survives a Host restart, a Client reload, and a Session without a live Agent, because it lives beside the tasks rather than inside one conversation. A client that only reads the Remote sees the same stage, blocker, and approval the model sees; a mutation from either side carries the revision it read, so the second writer fails instead of overwriting.

The record is no longer tied to the Session log, so it has no Session format version and no migration burden. In exchange, the record is not replayed with the Session: a forked Session starts without the source task's Work Item, and storage is the only place the task can be inspected. The command set is deliberately local: there is no verb that fetches, pushes, merges, or opens a pull request, and the commit is the single remote-free effect.

The guard is the enforcement layer for tool calls, not for arbitrary programs a shell may launch. A change set is still what review and verification observe, so a provider that writes through a compiled helper is caught at S5/S7 rather than at the call boundary.

## Alternatives considered

**Append a new session event type.** Rejected because an older reader would meet an event it cannot interpret: the envelope marker that makes an unknown event skippable is not settable from live appends, and a format version bump for a fork-only record would burden every upstream consumer.

**Keep the CLI file as the authority and mirror it into storage for the Client.** Rejected because two writers would race on the same task and the UI would show a projection that the authority never confirmed; the revision compare-and-set only means something if one owner computes every transition.

**Write the record from the Client.** Rejected because the Client cannot read Git or run verification, and a browser decision about whether a build really ran is not evidence.

**Mount the tool inside an agent preset instead of globally.** Follows the goal tool's precedent for host-plane state, but this service registers the tool on the Context that owns it, so every profile that mounts the service gets the same verbs; a preset-scoped copy would let a session's tool and the service's state disagree about which task is current.
