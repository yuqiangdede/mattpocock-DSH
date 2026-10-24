---
description: "Unified coding suite combining Host-authoritative staged coding workflow, Matt Pocock engineering skills, and Client UI launcher."
kind: "package-reference"
---

# @deepseek-ai/dsh-coding-suite

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-coding-suite` is an integrated plugin that bundles the Host-authoritative staged coding workflow, the Matt Pocock engineering skill catalog (28 engineering skills and Pocket specification), and the interactive Client UI launcher into a single package.

Mounting `@deepseek-ai/dsh-coding-suite` automatically:
1. Registers the Host authoritative `CodingWorkflowService` (`ctx.codingWorkflow`) and the model-facing `coding_workflow` tool.
2. Registers the built-in `CodingSuiteSkillProvider` via `ctx.skills.registerProvider(...)`, providing all 28 bundled skills directly from `assets/skills/` with zero external installation steps.
3. Injects the Client UI (`@deepseek-ai/dsh-coding-suite/client`) with workflow progress cards, manual checkpoint approvals, and the quick skill launcher.

## Table of Contents

- [Use this package](#use-this-package)
- [Architecture & Components](#architecture--components)
- [Bundled Skills](#bundled-skills)
- [Client UI](#client-ui)

-----

<a id="use-this-package"></a>
## Use this package

Add `@deepseek-ai/dsh-coding-suite` to your `cordis.yml` profile or plugin list:

```yaml
- name: '@deepseek-ai/dsh-coding-suite'
  config:
    verificationTimeoutMs: 1800000
    settingsInject: true
```

### Configuration Options

| Field | Type | Default | Description |
|---|---|---|---|
| `verificationTimeoutMs` | `number` | `1800000` | Deadline in milliseconds for verification commands. |
| `assetRoot` | `string` | Bundled `assets/skills` | Override directory path for skill assets. |
| `settingsInject` | `boolean` | `true` | Inject an entry into the Settings navigation index. |

-----

<a id="architecture--components"></a>
## Architecture & Components

The package exposes three entry points:
- `@deepseek-ai/dsh-coding-suite`: Host plugin registering the workflow service, model tool, skill provider, and settings injection.
- `@deepseek-ai/dsh-coding-suite/client`: Client UI bundle with `WorkflowPanel`, `Launcher`, and localized settings.
- `@deepseek-ai/dsh-coding-suite/todo-progress-guard`: Pre-commit / tool guard validating stage completion before committing changes.

### Authoritative Workflow Stages

The Host manages workflow progression through checkpoints:
- **S0**: Work item initialization and clean git status check.
- **S1**: Specification & requirements analysis (supports explicit skipping for simple bugfixes).
- **S2**: Architecture & technical design (supports explicit skipping for simple bugfixes).
- **S3**: Test planning and check specification.
- **S4**: Implementation within planned file boundaries.
- **S5**: Code review with structured findings.
- **S6**: Repair round (if review finds issues).
- **S7**: Sandbox verification against planned test/build checks.
- **S8**: Verified local commit.

-----

<a id="bundled-skills"></a>
## Bundled Skills

The package includes 28 engineering skills and Pocket spec management:
- **Architecture & Design**: `architecture-decision-records`, `design-by-contract`, `domain-driven-design-modeling`, `system-architecture-review`, `api-design-review`.
- **Testing & Verification**: `mutation-testing`, `property-based-testing`, `fuzz-testing-strategy`, `behavior-driven-development`, `test-driven-development`.
- **Debugging & Reliability**: `root-cause-analysis`, `chaos-engineering-plan`, `distributed-tracing-audit`, `memory-leak-investigation`.
- **Refactoring & Code Quality**: `refactoring-strategy`, `cyclomatic-complexity-reduction`, `technical-debt-assessment`, `concurrency-safety-audit`.
- **Workflow & Standards**: `git-workflow-guidelines`, `release-readiness-checklist`, `security-threat-modeling`, `pocket-maintenance`.

All skills are registered as Cordis effects and safely cleaned up on plugin unload.
