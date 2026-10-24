# Agent Note: Refuse Mermaid sources that request resources

Status: implemented

English | [中文](2026-10-23-mermaid-source-resource-refusal.zh.md)

## Problem

A model-authored `mermaid` fence is untrusted content, and Mermaid renders it by attaching the diagram to the document for measurement before returning the SVG string. A source that names an external resource — Mermaid's image shape or a CSS `url()` — therefore makes the browser request that URL during the render itself. Stripping resource references from the returned SVG, which `sanitizeMermaidSvg` already does, arrives after that request: a prompt-injected diagram could encode conversation data in an attacker-controlled fetch. Mermaid documents no option to block external image URLs ([mermaid-js/mermaid#7645](https://github.com/mermaid-js/mermaid/issues/7645)).

## Decision

**A fence whose source would request an external resource is refused before Mermaid is imported.** `mermaidSourceRequestsResources` matches four constructs: a CSS `url()` whose argument is not a same-document `#fragment` (after CSS escape decoding and comment removal), Mermaid's image shape (`@{ img: … }`), labels carrying `img`, `image`, `iframe`, `object`, `embed`, `link`, or `script` markup, and a per-diagram directive that turns HTML labels back on. A refused fence renders the same localized failure notice and visible source as any other rendering failure, and the lazy import and `mermaid.render` never run.

`sanitizeMermaidSvg` stays as the post-render defense for everything Mermaid generates, including values that reach the SVG through constructs this preflight does not model. The two checks cover different moments: the preflight prevents the request, the sanitizer constrains the inserted markup.

## Verification

Unit specs pin each accepted and refused form, including quoted, unquoted, uppercase, and same-document `url()` calls, escaped and comment-obfuscated `url()` spellings, the image shape, resource markup, and nested or quoted `htmlLabels` directives, plus the component behavior that a refused fence shows the failure notice without importing or rendering Mermaid. A Chromium probe of Mermaid 11.17 confirmed that the image shape triggers the request while a URL in a label, a `url(#fragment)` style, icon shapes, and theme variables do not.

## Alternatives considered

**Rely on `securityLevel: 'strict'` alone.** Rejected because strict mode governs links, script, and HTML labels, not external image URLs; the maintainers record that no configuration blocks them.

**Sanitize the returned SVG only.** Rejected because the request happens while Mermaid measures its temporary DOM, so the sanitizer sees the markup after the browser has already fetched the resource.

**Refuse any source that contains a URL.** Rejected because URLs in node labels are ordinary diagram text with no resource effect once `htmlLabels` is off; refusing them would make the fence unusable for common architecture diagrams.

**Render inside an isolated frame whose CSP blocks external resources.** Rejected as disproportionate: it adds a second document, message plumbing, style synchronization, and measurement handoff to block one construct that source validation identifies directly.

## Consequences

- A diagram that uses the image shape, an external `url()`, or an `htmlLabels: true` directive renders as source with the localized failure notice.
- The policy recognizes constructs by text, so a future Mermaid release that adds another resource-bearing field needs a matching pattern; the sanitizer still limits the inserted markup in the meantime.
- The policy owns no configuration: it is a fixed security invariant of rendering untrusted diagrams, not a deployment-varying tunable.
