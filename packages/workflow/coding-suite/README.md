---
description: "Unified coding suite combining Host-authoritative staged coding workflow, bundled engineering skills, and Client UI launcher."
kind: "package-reference"
---

# @deepseek-ai/dsh-coding-suite

## Summary

`@deepseek-ai/dsh-coding-suite` combines the Host coding workflow, the bundled skill catalog under `assets/skills/`, and the Client launcher and settings UI.

Mounting the package:

1. Registers `CodingWorkflowService` and its model-facing `coding_workflow` tool.
2. Registers valid bundled skill directories through `ctx.skills.registerProvider(...)`.
3. Loads the Client entry point declared by the package metadata, which adds the workflow panel, skill launcher, and launcher settings.

## Install

Add the package to a DSH profile or plugin list:

```yaml
- name: '@deepseek-ai/dsh-coding-suite'
  config:
    verificationTimeoutMs: 1800000
    todoStaleMs: 90000
```

`assetRoot` can be set to an absolute path to use a different skill asset directory. It defaults to the package's bundled `assets/skills` directory.

The launcher action list is stored through its Settings form. Edit it in the launcher settings UI, or export/import its versioned JSON document there.

## Package entry points

| Entry point | Purpose |
|---|---|
| `@deepseek-ai/dsh-coding-suite` | Host workflow service and bundled skill provider |
| `@deepseek-ai/dsh-coding-suite/client` | Client workflow panel, skill launcher, and settings |
| `@deepseek-ai/dsh-coding-suite/todo-progress-guard` | Per-session reminder when an active todo plan has not been synchronized |

## Workflow stages

The Host tracks work through checkpoints:

- **S0**: Initialize the work item and check Git status.
- **S1**: Analyze requirements; simple bug fixes may explicitly skip this stage.
- **S2**: Design the approach; simple bug fixes may explicitly skip this stage.
- **S3**: Specify tests and verification checks.
- **S4**: Implement within the planned file boundaries.
- **S5**: Review the implementation and record findings.
- **S6**: Repair review findings when needed.
- **S7**: Run the planned checks in the sandbox.
- **S8**: Create a verified local Git commit.

## Bundled skills

The package ships the skill directories and supporting files under `assets/skills/`. Skills with valid frontmatter are registered by the provider; shared resources remain available beside each skill. The catalog includes the engineering skills, document skills, setup and Pocket maintenance guidance, and the fork-owned `coding-workflow` skill.
