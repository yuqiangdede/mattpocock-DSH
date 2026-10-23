# mattpocock-DSH

English | [中文](README.zh.md)

A customized fork of [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness), focused on **configurable engineering-skill shortcuts and pre-bundled plugins for Windows environments with restricted internet access**.

This README covers what **mattpocock-DSH implements or adapts**. The DSH framework, external plugins, and Matt Pocock Skills belong to their respective upstream projects, linked below. This is not an official DeepSeek distribution.

## What this fork adds

### 1. Skill Launcher: focused engineering actions in the composer

- Eight shortcuts are visible by default: Discuss Requirements, Finalize Spec, Develop, Diagnose Bug, Code Review, Fix Review Findings, Build, and Commit Code. Other enabled actions are under a single **More** control.
- Configure enabled actions, shortcut visibility, ordering, prompts, and import/export through versioned DSH Host Settings.
- Skill buttons insert `/skill-name` and prompt buttons insert editable instructions. **Users must review and send the draft**; a click does not trigger execution.
- Keep stages separate: discussion does not code, review reports findings without changes, fixes act on known findings, build reports results, and commit does not build, fix, or push automatically.
- Recommend and highlight a next action based on the most recent *completed* conversation exchange. Fix Review Findings can include a bounded review excerpt in the editable draft. These are text-based hints, not authoritative workflow state.
- Expose selected visual-discussion and document-generation Skills from the repository's `.dsh/skills` directory.

Details: [Skill Launcher package](packages/client/ui-matt-skill-launcher/README.md) · [Shortcut configuration](docs/fork/skill-launcher-buttons.md).

### 2. Offline-oriented Windows Desktop plugin packaging

The Windows x64 build downloads and verifies **pinned third-party plugin releases on the connected build machine**, then bundles the plugins and production runtime dependencies into the installer. Installed desktops do not need npm/GitHub access to fetch these plugins.

| Third-party component (upstream) | Pinned version | Integration provided by this fork |
|---|---|---|
| [dsh-side-chat-plus](https://github.com/heartmove/dsh-side-chat) | `0.5.0` | Pre-bundled side chat and Desktop Profile integration; [details](docs/fork/offline-side-chat.md) |
| [DSH Desktop Operator](https://github.com/zjh02249/dsh-desktop-operator) | `0.12.1` | Bundled Computer Use runtime and the optional `desktop-computer-use` preset; **the standard agent preset remains the default**; [details](docs/fork/offline-computer-use.md) |
| [dsh-llm-retry-settings](https://github.com/zeng6125-rgb/dsh-llm-retry-settings) | `0.1.18` | Bundled retry settings; retry-policy override remains disabled unless enabled by the user; [details](docs/fork/offline-llm-retry.md) |

The third-party authors implement these plugins. **This fork supplies packaging, version pinning, hash checks, Desktop Profile integration, and offline-deployment adaptation.** Versions and hashes live in [`apps/desktop/src/bundled-plugins.ts`](apps/desktop/src/bundled-plugins.ts). User settings and manual disablement are respected.

**Offline plugin installation is not offline model inference.** An accessible model API is still required. Computer Use also requires an image-capable model and real Windows GUI/security validation. Build and smoke tests alone do not establish end-to-end readiness on isolated machines.

### 3. Additional fork changes

- **Mermaid rendering:** support for rendered SVG diagrams in chat code fences with a source fallback. [Mermaid](https://github.com/mermaid-js/mermaid) provides the diagram language and renderer; this fork adds the DSH UI integration.
- **Windows-focused CI:** simplify workflows to concentrate on relevant Windows build checks rather than unnecessary platform and documentation gates.
- **Project-maintained documentation Skills:** custom workflows for requirements, design, interface documentation, and Word delivery, listed below.

## Skills: source and attribution

### 19 imported Matt Pocock Skills

Source: [mattpocock/skills](https://github.com/mattpocock/skills). Each link goes to the **original upstream `SKILL.md` at the recorded imported revision**. This fork packages selected Skills with companion files under `.dsh/skills` and maps them to shortcuts; their original authorship is not claimed here.

| Original Skill | Upstream category |
|---|---|
| [`ask-matt`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/ask-matt/SKILL.md) | Engineering |
| [`code-review`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/code-review/SKILL.md) | Engineering |
| [`codebase-design`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/codebase-design/SKILL.md) | Engineering |
| [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/diagnosing-bugs/SKILL.md) | Engineering |
| [`domain-modeling`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/domain-modeling/SKILL.md) | Engineering |
| [`grill-with-docs`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/grill-with-docs/SKILL.md) | Engineering |
| [`implement`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/implement/SKILL.md) | Engineering |
| [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/improve-codebase-architecture/SKILL.md) | Engineering |
| [`pr`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/pr/SKILL.md) | Engineering |
| [`prototype`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/prototype/SKILL.md) | Engineering |
| [`research`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/research/SKILL.md) | Engineering |
| [`retro`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/retro/SKILL.md) | Engineering |
| [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/setup-matt-pocock-skills/SKILL.md) | Engineering |
| [`tdd`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/tdd/SKILL.md) | Engineering |
| [`to-spec`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-spec/SKILL.md) | Engineering |
| [`to-tickets`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-tickets/SKILL.md) | Engineering |
| [`grilling`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/grilling/SKILL.md) | Productivity |
| [`handoff`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/handoff/SKILL.md) | Productivity |
| [`writing-for-agents`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/writing-for-agents/SKILL.md) | Productivity |

See [`matt-source.json`](.dsh/skills/matt-source.json) for the pinned revision and imported list, or browse the [bundled Skills directory](.dsh/skills/).

### 9 fork-maintained Skills

These links point to **this fork's own `SKILL.md` files**:

| Skill | Purpose |
|---|---|
| [`api-integration-docs`](.dsh/skills/api-integration-docs/SKILL.md) | Integration-ready API documentation from code |
| [`component-doc-merge`](.dsh/skills/component-doc-merge/SKILL.md) | Merge component documentation |
| [`database-design-doc`](.dsh/skills/database-design-doc/SKILL.md) | Database design documentation |
| [`grill-with-ui`](.dsh/skills/grill-with-ui/SKILL.md) | Interactive visual requirements discussion |
| [`markdown-to-docx`](.dsh/skills/markdown-to-docx/SKILL.md) | Markdown to DOCX with consistency checks |
| [`outline-design`](.dsh/skills/outline-design/SKILL.md) | High-level design documentation |
| [`overall-design`](.dsh/skills/overall-design/SKILL.md) | System design documentation |
| [`requirements-spec`](.dsh/skills/requirements-spec/SKILL.md) | Requirements specifications and reverse analysis |
| [`pocket-maintenance`](.dsh/skills/pocket-maintenance/SKILL.md) | Audit and prune stale, duplicate, and conflicting Pocket documents |

## Project Pocket knowledge (optional)

Run the existing imported `/setup-matt-pocock-skills` in a **target project repository**. This fork extends its prompt with `writing-for-agents` guidance and a Git-tracked `docs/pocket/` knowledge map. Agent instructions carry a short pointer; the Agent follows task-specific links instead of loading all docs or requiring RAG. Run `/pocket-maintenance` after material changes or during a monthly manual review to propose safe consolidation and archiving. Both commands require user submission; neither silently changes an existing project's authoritative docs or schedules background work. The imported `setup-matt-pocock-skills` has a small Fork-specific addition referencing `.dsh/skills/_shared/POCKET_SETUP.md`; future upstream Skill syncs should reconcile this delta. Other imported Skills remain unchanged, so legacy output paths may require a separate migration.

## Build from source

Use Node.js and pnpm versions compatible with [`package.json`](package.json). For local Desktop development:

```powershell
pnpm install
pnpm run build
pnpm run dev:desktop
```

For an unsigned Windows x64 installer:

```powershell
pnpm run package:desktop:win:x64:unsigned
```

Building needs network access for dependencies and pinned third-party releases. The resulting installer includes the bundled plugins without requiring online plugin installation at runtime. Validate the Windows package on a genuinely disconnected test machine before deployment. These commands build **this fork**, not the official DSH release.

## Upstream references and licenses

- **Framework:** [DeepSeek Harness source](https://github.com/deepseek-ai/deepseek-harness) · [official documentation](https://deepseek-harness.github.io/deepseek-harness/) · [upstream developer guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- **Imported Skills:** [Matt Pocock Skills](https://github.com/mattpocock/skills), with recorded revision in [`matt-source.json`](.dsh/skills/matt-source.json)
- **Third-party plugins:** their upstream repositories and license terms are linked in the table above
- **Licensing:** [repository license](LICENSE) · [third-party notices](THIRD_PARTY_NOTICES.md) · [Matt Skills license](.dsh/skills/MATT-LICENSE)
- **Security and compatibility:** [safety notice](SAFETY.md); DSH upstream may introduce breaking changes, so revalidate fork extensions after syncing upstream

For original DSH features, architecture, APIs, and complete development guidance, consult the **official upstream project** rather than treating this README as its replacement.
