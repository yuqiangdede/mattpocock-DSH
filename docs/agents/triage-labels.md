# Triage labels

English | [中文](triage-labels.zh.md)

The engineering skills name five triage roles. This file maps each role to the label string used in this repository's issue tracker. Each string equals its role name, so a skill that says "apply `ready-for-agent`" applies that exact label.

| Role | Label in this tracker | Meaning |
|---|---|---|
| `needs-triage` | `needs-triage` | A maintainer still has to evaluate the issue |
| `needs-info` | `needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified and safe for an unattended agent |
| `ready-for-human` | `ready-for-human` | Requires human judgement or credentials |
| `wontfix` | `wontfix` | Will not be actioned |

## Relationship to the existing labels

These five labels are operational: they say who acts next, not what the work is. They sit beside the [label taxonomy](../../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md), where `kind/*` and `area/*` classify pull requests and an issue's own classification is its native Issue Type. Priority stays independent as `p0`–`p3`.

An issue carries at most one of the five labels: applying a role removes the role it replaces. Triage never rewrites `kind/*` on an issue, because that family belongs to pull requests.

## Create the labels once per repository

The strings above must exist before triage can apply them:

```sh
for label in needs-triage needs-info ready-for-agent ready-for-human wontfix; do
  gh label create "$label" --description "Triage role: $label" --color ededed
done
```

`gh label create` fails when a label already exists, so check `gh label list --limit 200` first or ignore the failure for a label that is present.
