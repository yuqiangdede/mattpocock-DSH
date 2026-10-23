---
name: coding-workflow
description: Use for a user-authorized end-to-end coding task in mattpocock-DSH auto mode, with guarded checkpoints, review/repair, real verification, and local-only Git commit.
---

# Coding workflow — auto mode (exceptions-only approvals)

This Skill is **a bounded orchestration entry**, not a substitute for the single-stage Skills. Keep all normal DSH permissions, sandbox and tool approvals. A user sending this Skill invocation authorizes routine local engineering steps, **not** destructive or remote changes.

## Mandatory policy

- Default/manual mode remains the existing single-stage launcher; this Skill is only for an explicit auto-mode request.
- Use existing \`grill-with-docs\`, \`to-spec\`, \`to-tickets\` as needed, \`implement\`, \`code-review\`, \`diagnosing-bugs\` as methods. Follow their stage boundaries when executing each stage.
- Never push, fetch credentials, open/merge PRs, deploy, release, or modify a remote repository. Never run SVN commit. Only local Git commit is eligible.
- Pause and request **scoped user approval** for material ambiguity, destructive DB/data changes, security policy/permission changes, unrelated files, unknown pre-existing modifications, or any attempt to bypass tests/protection.
- If an essential Skill, execution tool, build dependency or evidence is unavailable, **block with the actual reason**; do not quietly substitute a generic prompt and call it successful.
- Existing DSH tool permission checks and user approvals are authoritative. This Skill cannot override a denied tool call.
- Never mark a step as passed by interpreting the model's own prose. Artifacts must exist, review must be structured, and tests/builds must actually run.
- Retry at most 3 substantive repair iterations and stop after 2 iterations without reduction of unresolved findings. On budget/time exhaustion stop with a checkpoint; do not loop indefinitely.
- The user may stop or switch to manual at any time. After restart do **not** auto-resume; ask the user to explicitly continue.

## Tools and checkpoint storage

The helper at \`scripts/workflow-state.mjs\` (relative to this SKILL.md) uses only Node >=22, Git, and local filesystem. It keeps work items under \`DSH_HOME/coding-work-items/<repository-hash>/<task-id>.json\`, outside the Git worktree. Avoid writing secrets into its title, decisions or evidence. It enforces clean-start, branch/HEAD checks, stage ordering, actual build exit codes, review/verification diff equality, exact changed-file allowlisting and a **local-only commit**.

Always invoke helper commands from the target repository root, using an absolute path derived from the installed Skill directory (do not assume the project under development itself contains the Skill). Keep the task ID emitted by \`start\` and reuse it.

\`\`\`text
node <skill-dir>/scripts/workflow-state.mjs start "Short task objective"
node <skill-dir>/scripts/workflow-state.mjs show <task-id>
node <skill-dir>/scripts/workflow-state.mjs mode <task-id> auto
node <skill-dir>/scripts/workflow-state.mjs resume <task-id>
node <skill-dir>/scripts/workflow-state.mjs stage <task-id> S1 <evidence-file>
node <skill-dir>/scripts/workflow-state.mjs stage <task-id> S2 <evidence-file>
node <skill-dir>/scripts/workflow-state.mjs stage <task-id> S3 <evidence-file>
node <skill-dir>/scripts/workflow-state.mjs checks <task-id> <checks-json>
node <skill-dir>/scripts/workflow-state.mjs stage <task-id> S4 <evidence-file>
node <skill-dir>/scripts/workflow-state.mjs review <task-id> <review-json>
node <skill-dir>/scripts/workflow-state.mjs repair <task-id> <repair-evidence>
node <skill-dir>/scripts/workflow-state.mjs verify <task-id> test -- <real-test-command> [args...]
node <skill-dir>/scripts/workflow-state.mjs verify <task-id> build -- <real-build-command> [args...]
node <skill-dir>/scripts/workflow-state.mjs commit <task-id> -- <exact-changed-path>...
node <skill-dir>/scripts/workflow-state.mjs stage <task-id> S9 <delivery-report>
\`\`\`

Checks JSON must enumerate **exact authorized relative paths** in `allowedPaths`, and contain at least one real `test` and one real `build` command, e.g. `{"allowedPaths":["src/feature.ts"],"checks":[{"kind":"test","command":["pnpm","test"]},{"kind":"build","command":["pnpm","build"]}]}`. Every planned check must run successfully against the **same** reviewed diff. Renaming a no-op command as a test/build violates this Skill even if the helper cannot infer semantics from an arbitrary executable.

Evidence files should be placed outside the target repository or in an existing user-approved documentation location, avoiding inclusion in an unrelated commit. JSON review report must include \`{"findings":[{"id":"F-1","severity":"P1","status":"open","file":"...","evidence":"..."}]}\`; use an empty array only after actually inspecting source/diff and requirements.

## Integration with native DSH Goal

Prefer the existing DSH Goal service / goal tool for authorized multi-round continuation when available. Create an objective that **begins exactly** with `[coding-workflow:<task-uuid>]` (UUID from checkpoint `start`), followed by the scoped objective. The launcher uses this marker to distinguish unrelated goals and pause this goal when switching to manual. On start, inspect any active goal and never overwrite another task's goal. If no conflicting goal exists, create a goal for this exact Work Item with a bounded Round budget (recommend 30, not the DSH default of 256); only mark native goal complete after the local task reaches S9. Pause or block the native goal whenever the local checkpoint enters paused, waiting_approval, or blocked, so Goal Round automation cannot bypass human approval. Resume requires a new explicit user action after a restart. If Goal tools are missing, do not claim unattended multi-round execution: perform only safe work in the current authorized turn, persist a checkpoint, and report what remains.

## Automatic execution

1. Check user goal, current workspace and tooling. If the goal is unclear about business contract or permission boundary, request a focused answer before changing code. Begin with \`start\`; a dirty tree blocks automatic ownership. On clean \`main/master\` the helper creates a dedicated \`coding/<id>\` branch.
2. Record task mode auto, explicitly resume it. S1: inspect requirements, evidence, constraints, acceptance criteria. S2: write reviewed specification. S3: implementation strategy, exact expected modified-file allowlist and actual verification commands. Save artifacts, mark each stage, then register the required test/build commands with `checks` **before** implementing.
3. S4: implement minimal scoped change and run focused tests. Save code diff summary and task evidence; call \`stage ... S4\` only when tracked code has actually changed.
4. S5: inspect real diff and requirement coverage with the \`code-review\` method. Write structured JSON report. Call \`review\`, which calculates the current diff fingerprint and routes to repair or verification. Do not invent clean reports.
5. S6 (conditional): fix findings one by one with specific tests, write repair report, call \`repair\`, then perform **fresh** \`review\`. Stop when repair/no-progress limits hit.
6. S7: choose actual build/test commands for the project. Execute each necessary check; for the final passing check use \`verify ... -- <command>\`. If there are multiple required checks, evidence for the other checks must also be persisted and refer to the same diff; the helper's one final command is **not** proof of unrelated checks. If any required check failed or did not run, block and do not commit.
7. S8: compare full current changes to the task, explicitly enumerate every owned path and call \`commit ... -- <path>...\`. Never broad-add the whole repository; if any path is uncertain, block. Hooks must run. Never push.
8. S9: write accurate delivery report, include actual commit SHA, changed files, review findings, executed tests, limitations, and remaining risks. Mark S9 completed only once the report file exists.

If a user requests manual takeover, run \`pause\` and \`mode ... manual\`; continue with the old single-stage buttons. Never infer stage completion just because an old conversation contains "done".

## Error handling and continuation

- \`approval <id> <concrete risk and decision>\` records a waiting-approval state; **stop before the risky operation**. After a concrete user decision, use \`approve <id> <scope>\` and \`resume\`.
- \`block <id> <reason and recovery>\` for no build, missing Skill, branch mismatch, diff drift, no progress or exhausted limits.
- \`show <id>\` after interruption. Confirm the working tree/branch against its checkpoint, then \`resume\` only after explicit human instruction.
- Report missing tests and Windows/Electron end-to-end testing as **not executed** until there is real evidence.
