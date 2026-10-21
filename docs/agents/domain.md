# Domain docs

English | [中文](domain.zh.md)

How the engineering skills read this repository's domain terminology and decision records. The layout is single-context: one glossary and one decision-record tree serve the whole repository, so no `GLOSSARY-MAP.md` and no `docs/adr/` directory exist.

## Before exploring, read these

- **[docs/glossary.md](../glossary.md)**: the canonical term for each concept, paired with `docs/glossary.zh.md`.
- **[Agent Notes](../../.agents/notes/README.md)**: the decision records, filed as `proposed/`, `implemented/`, and `rejected/` under the class folders that [the format check](../../scripts/verify-agent-note-format.ts) accepts.

Both already exist. When a file is missing, continue silently and do not propose creating it: `domain-modeling` adds a term or a decision lazily, when one is actually resolved.

## Use the glossary's terms

When output names a domain concept (an issue title, a test name, a package README heading), use the term that its glossary entry defines. An entry that reserves a meaning overrides looser usage: `seam` names a swappable capability with its three roles, never a plain interface or an extension point.

A concept the glossary lacks means one of two things: the language is one this project does not use, so reconsider the word, or there is a real gap to raise with `domain-modeling`, which edits [docs/glossary.md](../glossary.md) through [its pairing contract](../i18n/README.md).

## Read the decision records

An Agent Note is the decision record for the subject it names. For a change under a package, read the `implemented/` notes whose subject covers that area: each states the shipped decision, the alternatives it beat, and its consequences, which is what keeps a rejected design from returning under a new name.

Write one only for durable rationale that code, tests, and current documentation cannot carry ([when to write one](../../.agents/notes/README.md)). `pnpm run verify-agent-note-format` and `pnpm run verify-agent-note-classification` fix the header and the folder.

## Flag contradictions

When output contradicts a shipped decision, name the note and the conflict instead of overriding it silently, for example: "contradicts the ambiguous-origin-label ban, but worth reopening because the retained word carries a different meaning now".

Reopening a decision means superseding the note that owns it, not editing it into a different decision.
