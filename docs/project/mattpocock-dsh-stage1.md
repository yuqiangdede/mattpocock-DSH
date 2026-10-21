# mattpocock-DSH Stage 1 implementation notes

English | [中文](mattpocock-dsh-stage1.zh.md)

Status: Initial implementation, **real Electron end-to-end acceptance remains incomplete**. Upstream baseline: DSH 0.2.1-rc.2. This document covers only this fork's additions.

## Boundaries

- Keep the official Agent Loop, Session, Tool Pipeline, permissions, and Electron shell; do not migrate historical PI Sessions.
- Plugin: packages/client/ui-matt-skill-launcher, with Host Config and Client Slot layers; do not modify the native Composer.
- Row 1: requirements discussion, specification, planning, execution, bug diagnosis, review, and More. The More menu includes visual discussion, task breakdown, TDD, HTTP/message interface docs, requirements, overall design, outline design, database design, component document merge, and Markdown to DOCX conversion.
- Row 2: UI-image prompt and code commit.
- DSH loads the Skill named by the leading /skill-name only after the user explicitly clicks Send.
- Insert using captureInsertion/insertText and inspect the result; reject stale insertion snapshots after asynchronous catalog lookup; do not damage existing attachments/references through setDraft.
- Host Settings persist configuration as revisioned JSON, with explicit Save, Cancel, Reset, Import, and Export. Do not automatically overwrite corrupt JSON.
- A default Skill binding must have a real installed Skill; when its directory is missing, report the problem rather than silently treating it as a general prompt.

## Delivery path

The plugin is included in the default Web App client roster; Desktop uses the full Web App. The bundled Skills live in .dsh/skills so DSH can recognize them during development of this fork. To make DSH recognize these Skills in other workspaces, **run the installer explicitly**:

    node scripts/install-coding-skills.mjs

By default, installation fills only missing Skill directories in DSH_HOME/skills and preserves existing Skills. To update to this version, inspect the contents before adding --overwrite; replacement saves the previous directory as a timestamped backup. The DSH Home/Workspace user directory must match the installer's target DSH_HOME.

## Acceptance gates

1. Frozen npm/pnpm dependency installation and both aggregate TypeScript builds succeed.
2. Web and Windows Electron show both button rows; disabling the plugin releases its UI correctly; verify button order and tooltips.
3. Existing selected draft text is not overwritten; instructions can be added without losing image/file references; asynchronous catalog lookup does not write into a different Session.
4. A missing Skill shows an error without changing the draft; an installed Skill puts /skill-name first and executes only after manual Send.
5. Host Settings handle saving, restart persistence, repeated import, empty lists, invalid configuration, and concurrent revision conflicts.
6. grill-with-ui server.mjs/page.html run in the test Workspace's actual browser and port environment, and results return to the conversation.
7. Merge into master only after all gates above pass; source review cannot stand in for real Electron acceptance.

## Incomplete work and targeted integrations

- Automatic Session naming from the old PI project and DSH conversation writeback for visual discussion must pass integration tests before being called delivered.
- All seven custom document Skills and their references/scripts/_shared have been copied from the old PI project, but external Python/Pandoc/diagram dependencies and DSH execution compatibility still require per-Skill verification.
- A plugin action currently enters More only through order (>=100); an explicit grouping field may be configured later.
- DSH is a developer preview; plugin APIs may make breaking changes. Pin the baseline before evaluating upstream synchronization.

## Fork CI configuration (Windows only)

Fork CI runs only on GitHub-hosted `windows-2025` with Node 24. The single Windows job installs the frozen workspace dependencies, executes the Skill Launcher / DSH UI integration tests, and builds the Windows Host/Client/Desktop/Web workspace. No Linux/macOS builds, documents/website checks, Python SDK, Issue workflows, Cloudflare preview, or release workflows are required. The upstream project's CI remains unchanged in its own repository.

The completed Windows build is a necessary check, **not** evidence of physical Windows Electron interaction acceptance. Manual verification of plugin visibility, invocation, settings persistence, and grill-with-ui browser/session writeback must be recorded separately before claiming the complete Stage 1 feature is accepted.
