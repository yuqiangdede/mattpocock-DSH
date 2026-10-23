# Agent Note: 拒绝请求外部资源的 Mermaid 源码

Status: implemented

[English](2026-10-23-mermaid-source-resource-refusal.md) | 中文

## Problem

模型编写的 `mermaid` 围栏属于不可信内容，而 Mermaid 渲染它时先把图表挂到 document 上测量，之后才返回 SVG 字符串。因此，源码中若出现外部资源（Mermaid 的 image shape 或 CSS `url()`），浏览器会在渲染过程中就发起该请求。`sanitizeMermaidSvg` 从返回的 SVG 中移除资源引用，但这一步发生在请求之后：被提示注入的图表可以把会话数据编码进攻击者控制的请求。Mermaid 明确表示没有阻止外部图片 URL 的选项（[mermaid-js/mermaid#7645](https://github.com/mermaid-js/mermaid/issues/7645)）。

## Decision

**源码会请求外部资源的围栏在导入 Mermaid 之前即被拒绝。** `mermaidSourceRequestsResources` 匹配三类写法：参数不是同文档 `#fragment` 的 CSS `url()`、Mermaid 的 image shape（`@{ img: … }`），以及带有 `img`、`image`、`iframe`、`object`、`embed`、`link` 或 `script` 标记的 label。被拒绝的围栏与其它渲染失败一样显示 owner 提供的本地化失败提示和源码，且延迟导入与 `mermaid.render` 都不会执行。

`sanitizeMermaidSvg` 仍作为渲染后的防线，处理 Mermaid 生成的一切内容，包括通过本预检未建模的写法进入 SVG 的值。两项检查覆盖不同时刻：预检阻止请求，净化器约束插入的标记。

## Verification

单元测试固定了每种可接受与拒绝的写法，包括带引号、无引号、大写以及同文档 `url()` 调用、image shape 与资源标记，并固定了组件行为：被拒绝的围栏显示失败提示且不导入、不渲染 Mermaid。针对 Mermaid 11.17 的 Chromium 探测确认 image shape 会触发请求，而 label 中的 URL、`url(#fragment)` 样式、图标形状与主题变量不会。

## Alternatives considered

**只依赖 `securityLevel: 'strict'`。** 被否决，因为 strict 模式约束链接、脚本与 HTML label，不约束外部图片 URL；维护者已记录没有任何配置能阻止它们。

**只净化返回的 SVG。** 被否决，因为请求发生在 Mermaid 测量其临时 DOM 的时候，净化器看到标记时浏览器已经取回了资源。

**拒绝任何含有 URL 的源码。** 被否决，因为 `htmlLabels` 关闭时节点 label 中的 URL 只是普通图表文本，不产生资源效果；拒绝它们会让常见的架构图无法使用。

**在 CSP 阻止外部资源的隔离 frame 中渲染。** 被否决，代价不成比例：为阻止一类可直接由源码校验识别的写法，要额外引入第二个文档、消息传递、样式同步与测量交接。

## Consequences

- 使用 image shape 或外部 `url()` 的图表会以源码形式呈现，并显示本地化失败提示。
- 该策略按文本识别写法，因此未来 Mermaid 版本若新增携带资源的字段，需要补充对应模式；在此期间净化器仍限制插入的标记。
- 该策略不带配置项：它是渲染不可信图表的固定安全不变量，而非随部署变化的可调参数。
