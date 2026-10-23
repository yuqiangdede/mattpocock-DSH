---
kind: upgrade-guide
description: "`MarkdownLabels` in `@deepseek-ai/dsh-client-ui-primitives` now requires a localized Mermaid failure notice."
---

# `MarkdownLabels` requires a Mermaid failure notice

English | [中文](guide.zh.md)

## Change

`MarkdownText` now renders a settled `mermaid` fence as sanitized inline SVG. When the diagram cannot be rendered, the source stays visible with the localized notice carried by the new required `MarkdownLabels.mermaidFailure` field. Every external caller that constructs `MarkdownLabels` for `@deepseek-ai/dsh-client-ui-primitives` therefore fails TypeScript compilation until it supplies the field.

## Migration

1. Add `mermaidFailure` to every `MarkdownLabels` object. An application that uses `@deepseek-ai/dsh-client-locale` reads the existing dictionary key:

   ```ts
   const labels: MarkdownLabels = {
     ...currentLabels,
     mermaidFailure: t('markdown.mermaidFailure'),
   }
   ```

2. Run your project's type check (`tsc --noEmit`) to confirm the labels compile.
