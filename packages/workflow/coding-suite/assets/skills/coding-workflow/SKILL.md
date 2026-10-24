---
name: coding-workflow
description: Use for a user-authorized end-to-end coding task in mattpocock-DSH auto mode, with guarded checkpoints, review/repair, real verification, and local-only Git commit.
---

# Coding workflow — auto mode (exceptions-only approvals)

This Skill is **a bounded orchestration entry**, not a substitute for the single-stage Skills. Keep all normal DSH permissions, sandbox and tool approvals. A user sending this Skill invocation authorizes routine local engineering steps, **not** destructive or remote changes.

## Mandatory policy

- Default/manual mode remains the existing single-stage launcher; this Skill is only for an explicit auto-mode request.
- Use existing `grill-with-docs`, `to-spec`, `to-tickets` as needed, `implement`, `code-review`, `diagnosing-bugs` as methods. Follow their stage boundaries when executing each stage.
- Never push, fetch credentials, open/merge PRs, deploy, release, or modify a remote repository. Never run SVN commit. Only local Git commit is eligible.
- Pause and request **scoped user approval** for material ambiguity, destructive DB/data changes, security policy/permission changes, unrelated files, unknown pre-existing modifications, or any attempt to bypass tests/protection.
- Do not create or modify the project's product documents (requirements, system design, high-level design, database design, interface documents) during S1–S8. Keep the S2 specification and S9 delivery report outside the product-document tree, for example under `DSH_HOME/coding-work-items` or an OS temporary directory. README and JSDoc updates still accompany code changes.
- At S9, after the local commit, list the affected existing product documents and ask once whether to supplement them (all / selected / none). Call `coding_workflow` with `action=approval` for this choice and pause the native Goal until the user answers; then call `action=approve` and `action=resume`. Update only on confirmation. Keep those document changes in the working tree and never create a second local commit. Record the choice and changed documents in the delivery report.
- If an essential Skill, execution tool, build dependency or evidence is unavailable, **block with the actual reason**; do not quietly substitute a generic prompt and call it successful.
- Existing DSH tool permission checks and user approvals are authoritative. This Skill cannot override a denied tool call.
- Never mark a step as passed by interpreting the model's own prose. Artifacts must exist, review must be structured, and tests/builds must actually run.
- Retry at most 3 substantive repair iterations and stop after 2 iterations without reduction of unresolved findings. On budget/time exhaustion stop with a checkpoint; do not loop indefinitely.
- The user may stop or switch to manual at any time. After restart do **not** auto-resume; ask the user to explicitly continue.

## The Host work item

The authoritative record lives in the Host: `coding_workflow` is the only way to advance it. The Host stores the task in its storage domain (not in the Git worktree), validates every transition against the actual repository, and reports the current stage back to the launcher, which renders the stage progress and the pending decision. There is no task id to track in prose: `action=status` always returns the Session's current task.

Pass evidence as **file paths inside the workspace or in a temporary directory**; only their digests enter the record, and files outside the repository can never enter the commit.

```text
coding_workflow action=start title="Short task objective"
coding_workflow action=status
coding_workflow action=mode mode=auto
coding_workflow action=resume
coding_workflow action=stage stage=S1 evidencePath=<requirements-file>
coding_workflow action=stage stage=S2 evidencePath=<spec-file>
coding_workflow action=stage stage=S3 evidencePath=<plan-file>
coding_workflow action=checks evidencePath=<checks-file> checks=[{"kind":"test","command":["pnpm","test"]},{"kind":"build","command":["pnpm","build"]}] allowedPaths=["src/feature.ts"]
coding_workflow action=stage stage=S4 evidencePath=<implementation-evidence>
coding_workflow action=review evidencePath=<review-file> findings=[{"id":"F-1","severity":"P1","status":"open","file":"src/feature.ts","evidence":"unhandled case"}]
coding_workflow action=repair evidencePath=<repair-evidence>
coding_workflow action=verify kind=test command=["pnpm","test"]
coding_workflow action=verify kind=build command=["pnpm","build"]
coding_workflow action=commit files=["src/feature.ts"]
coding_workflow action=stage stage=S9 evidencePath=<delivery-report>
```

`allowedPaths` must enumerate **exact authorized relative paths**, and the plan must contain at least one real `test` and one real `build` command. Every planned check must run successfully against the **same** reviewed diff. Renaming a no-op command as a test/build violates this Skill even if the Host cannot infer semantics from an arbitrary executable.

Findings are structured arguments now: `{"id":"F-1","severity":"P1","status":"open","file":"…","evidence":"…"}`. Use an empty array only after actually inspecting source/diff and requirements. The review file itself stays as the stage's evidence artifact.

If `coding_workflow` is not registered (a profile without the plugin), fall back to the bundled helper `scripts/workflow-state.mjs` with the same verbs; it uses only Node >=22, Git, and local files under `DSH_HOME/coding-work-items`. Never mix the two authorities for one task.

## Integration with native DSH Goal

Prefer the existing DSH Goal service / goal tool for authorized multi-round continuation when available. Create an objective that **begins exactly** with `[coding-workflow:<task-uuid>]` (UUID from the `start` result), followed by the scoped objective. The launcher uses this marker to distinguish unrelated goals and pauses both the Host task and this goal when switching to manual. On start, inspect any active goal and never overwrite another task's goal. If no conflicting goal exists, create a goal for this exact Work Item with a bounded Round budget (recommend 30, not the DSH default of 256); only mark native goal complete after the local task reaches S9. Pause or block the native goal whenever the Host task enters paused, waiting_approval, or blocked, so Goal Round automation cannot bypass human approval. Resume requires a new explicit user action after a restart. If Goal tools are missing, do not claim unattended multi-round execution: perform only safe work in the current authorized turn, persist a checkpoint, and report what remains.

## Automatic execution

1. Check user goal, current workspace and tooling. If the goal is unclear about business contract or permission boundary, request a focused answer before changing code. Begin with `action=start`; a dirty tree blocks automatic ownership. On clean `main/master` the Host creates a dedicated `coding/<id>` branch.
2. Record task mode auto, explicitly resume it. S1: inspect requirements, evidence, constraints, acceptance criteria. S2: write reviewed specification. S3: implementation strategy, exact expected modified-file allowlist and actual verification commands. Save artifacts, mark each stage, then register the required test/build commands with `action=checks` **before** implementing.
3. S4: implement minimal scoped change and run focused tests. Save code diff summary and task evidence; call `action=stage stage=S4` only when tracked code has actually changed.
4. S5: inspect real diff and requirement coverage with the `code-review` method. Pass structured findings to `action=review`; the Host calculates the current diff fingerprint and routes to repair or verification. Do not invent clean reports.
5. S6 (conditional): fix findings one by one with specific tests, write repair report, call `action=repair`, then perform **fresh** `action=review`. Stop when repair/no-progress limits hit.
6. S7: run **every** test/build/lint command registered with `action=checks`, using `action=verify kind=<kind> command=<exact registered executable and arguments>`. All required commands must pass against the same reviewed diff; never treat one passing command as proof for another. If any required check failed or did not run, block and do not commit.
7. S8: compare full current changes to the task, explicitly enumerate every owned path and call `action=commit files=[…]`. Never broad-add the whole repository; if any path is uncertain, block. Hooks must run. Never push.
8. S9: when the change affects existing product documents, ask the document-supplement question after the local commit and before writing the report: list the affected documents and offer all / selected / none, recording `action=approval` and pausing the native Goal; update only on confirmation and keep the changes uncommitted. List missing document types separately and point to the existing document-generation buttons instead of creating them. Then write an accurate delivery report with the actual commit SHA, changed files, review findings, executed tests, document choice and changes, limitations, and remaining risks. Mark S9 completed only once the report file exists.

If a user requests manual takeover, run `action=pause` and `action=mode mode=manual`; continue with the old single-stage buttons. Never infer stage completion just because an old conversation contains "done".

## Error handling and continuation

- `action=approval reason=<concrete risk and decision>` records a waiting-approval state; **stop before the risky operation**. After a concrete user decision, use `action=approve decision=<scope>` and `action=resume`.
- `action=block reason=<reason and recovery>` for no build, missing Skill, branch mismatch, diff drift, no progress or exhausted limits.
- `action=status` after interruption. Confirm the working tree/branch against its stage rows and blocker, then `action=resume` only after explicit human instruction.
- Report missing tests and Windows/Electron end-to-end testing as **not executed** until there is real evidence.
