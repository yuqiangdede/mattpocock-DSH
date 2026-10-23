---
kind: upgrade-guide
description: "`@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownLabels` 新增必填的 Mermaid 渲染失败提示。"
---

# `MarkdownLabels` 新增必填的 Mermaid 失败提示

[English](guide.md) | 中文

## 变更

`MarkdownText` 现在把落定的 `mermaid` 围栏渲染为净化后的内联 SVG。图表无法渲染时，源代码保持可见，并显示新增必填字段 `MarkdownLabels.mermaidFailure` 中的本地化提示。因此，所有为 `@deepseek-ai/dsh-client-ui-primitives` 构造 `MarkdownLabels` 的外部调用方在补上该字段前都无法通过 TypeScript 编译。

## 迁移

1. 在每个 `MarkdownLabels` 对象中补上 `mermaidFailure`。使用 `@deepseek-ai/dsh-client-locale` 的应用可直接读取现有字典键：

   ```ts
   const labels: MarkdownLabels = {
     ...currentLabels,
     mermaidFailure: t('markdown.mermaidFailure'),
   }
   ```

2. 运行项目的类型检查（`tsc --noEmit`），确认标签对象编译通过。
