# 领域文档

[English](domain.md) | 中文

工程技能如何读取本仓库的领域术语与决策记录。布局为单上下文：一份术语表与一棵决策记录树服务整个仓库，因此不存在 `GLOSSARY-MAP.md`，也不存在 `docs/adr/` 目录。

## 探索前先读这些

- **[docs/glossary.md](../glossary.zh.md)**：每个概念的规范术语，与 `docs/glossary.md` 构成双语对。
- **[Agent Notes](../../.agents/notes/README.zh.md)**：决策记录，按 `proposed/`、`implemented/`、`rejected/` 分目录，类别目录遵循[格式检查](../../scripts/verify-agent-note-format.ts)接受的清单。

两者均已存在。文件缺失时静默继续，不要主动建议创建：`domain-modeling` 只在真正解决某个术语或决策时才补齐。

## 使用术语表的词汇

输出中出现领域概念时（issue 标题、测试名称、包 README 标题），使用其术语条目定义的词。条目预留了含义时，以条目为准：`seam` 指带三个角色的可替换能力，绝不是普通 interface 或扩展点。

术语表中缺少某个概念，意味着两种情况之一：该词是本项目不使用的语言，应改回项目用词；或确实存在缺口，应交给 `domain-modeling`：它修改 [docs/glossary.md](../glossary.zh.md)，并遵循其[双语对契约](../i18n/README.zh.md)。

## 阅读决策记录

一条 Agent Note 就是其所指主题的决策记录。改动某个包时，先读主题覆盖该区域的 `implemented/` 记录：每条都写明已交付的决策、它淘汰的备选方案及其代价，这正是防止被否定的设计换个名字回归的依据。

只在代码、测试与现有文档无法承载持久理由时新写一条（[何时新写](../../.agents/notes/README.zh.md)）。`pnpm run verify-agent-note-format` 与 `pnpm run verify-agent-note-classification` 负责校正头部与目录。

## 标出冲突

输出与已交付决策冲突时，指出对应记录与冲突点，而不是静默覆盖，例如："与来源标签禁用规则冲突，但值得重开，因为保留下来的词现在含义不同"。

重开决策意味着取代拥有该决策的记录，而不是把它改写为另一个决策。
