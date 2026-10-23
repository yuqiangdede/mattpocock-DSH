# Agent Note: 原语的配色作用域

Status: implemented

[English](2026-10-23-primitive-color-scheme-scope.md) | 中文

## Problem

落定的 Mermaid 图表是一份把调色板写进标记的静态 SVG，因此无法通过 CSS token 重新上色：应用配色变化时，必须使用 Mermaid 的明色或暗色主题重新渲染。`MermaidDiagram` 最初用自带的 `MutationObserver` 观察 `body[data-ds-dark-theme]` 来获知该配色，于是每个已挂载的图表都成为该 document 属性的订阅者。包含大量图表的会话或文档预览因此把一次配色切换扩散到多个观察者，而这个零 Cordis 原语还承载了本属于主题所有者的 document 知识。

## Decision

**主题服务保持配色权威，由外壳把解析后的配色作用域传给展示原语。** `ui-layout` 的 root 注册注入一个 `theme` observable，其来源是 `ctx.theme.getTheme()` 与 `theme/change` 事件。`AppFrame` 通过合成的 `useTheme(snapshot => snapshot.active.colorScheme)` hook 读取它，并用 `ColorSchemeProvider` 包裹内容，因此整棵应用树（包括 portal 出来的对话框）共用同一个绑定。`MermaidDiagram` 调用 `useColorScheme()`，只渲染针对当前源码与配色保存的结果；它自身不订阅任何东西。

`ColorScheme` 是由 `dsh-client-ui-primitives` 与 Provider 及其 hook 一同导出的二值联合类型（`light` | `dark`）。不在 Provider 内时该 hook 返回 `light`，因此单独渲染原语的测试、类 story 的 fixture 与嵌入场景保持确定性。

## Verification

单元测试分别固定作用域本身（Provider 外、嵌套替换、配色变化后随重渲染更新）、图表各分支（`default` 与 `dark` 的 Mermaid 初始化、作用域配色变化后重新渲染，以及 pending、失败与取消），以及框架接线（`AppFrame` 之下挂一个探针读取解析后的配色）。录制的 Web 快照通过发布组合渲染真实 Mermaid 围栏与非法围栏，从而持续覆盖延迟导入、净化器与浏览器 chunk。

## Alternatives considered

**每个图表自行观察 document 上的配色属性。** 这是此前的实现。被否决，因为它把一次配色切换扩散到每个图表的观察者，并让原语耦合到一个全局 document 属性，而该属性的所有者是主题呈现器。

**用 `matchMedia` 读取 `prefers-color-scheme`。** 被否决，因为应用主题是独立偏好：解析后的主题可能是暗色而操作系统报告亮色，且已注册的第三方主题会自行决定 `colorScheme`。

**在每个 `MarkdownText` owner 处透传 `colorScheme` prop。** 被否决，因为它会在每个调用点（会话正文、推理、计划与文档预览、工具详情、轨迹、指南）重复同样的接线，并且任何遗漏的 owner 都会在暗色会话里悄无声息地留下亮色图表。

**用 CSS token 重新上色 SVG 而不重新渲染。** 被否决，因为 Mermaid 会把具体颜色值（包括派生色阶）写入生成的样式表与图形属性；token 替换必须按图表类型改写该样式表，而无法复用渲染器自身的主题机制。

## Consequences

- 依赖配色的原语读取同一个环境作用域；新增同类原语不需要订阅，也不需要逐 owner 传 prop。
- 配色变化时每个已挂载的图表都会重新渲染，即对落定块重跑一次 Mermaid。该开销此前就存在，并仍受可见图表数量约束。
- 在外壳 Provider 之外渲染的图表显示亮色调色板；需要暗色图表的独立嵌入方自行挂载 Provider。
- `dsh-client-ui-layout` 为取得该 Provider 而对 `dsh-client-ui-primitives` 增加开发依赖。
