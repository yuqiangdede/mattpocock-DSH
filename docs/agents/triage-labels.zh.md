# 分诊标签

[English](triage-labels.md) | 中文

工程技能以五个角色描述分诊。本文件把每个角色映射到本仓库 issue 追踪器实际使用的标签字符串。每个字符串与其角色名相同，因此技能说"应用 `ready-for-agent`"时，应用的就是这个标签。

| 角色 | 本追踪器中的标签 | 含义 |
|---|---|---|
| `needs-triage` | `needs-triage` | 仍需维护者评估该 issue |
| `needs-info` | `needs-info` | 等待报告者补充信息 |
| `ready-for-agent` | `ready-for-agent` | 已完整描述，可交给无人值守的 agent |
| `ready-for-human` | `ready-for-human` | 需要人工判断或凭据 |
| `wontfix` | `wontfix` | 不会处理 |

## 与现有标签的关系

这五个标签是操作性的：它们说明下一步由谁处理，而不说明工作内容。它们与[标签分类](../../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.zh.md)并存，后者中 `kind/*` 与 `area/*` 用于分类 pull request，issue 自身的分类由原生 Issue Type 承担。优先级仍以 `p0`–`p3` 独立表示。

一个 issue 至多带有这五个标签中的一个：应用某个角色时，移除它替代的那个角色。分诊不会改写 issue 上的 `kind/*`，因为该标签族属于 pull request。

## 每个仓库创建一次标签

分诊应用这些标签前，上述字符串必须已存在：

```sh
for label in needs-triage needs-info ready-for-agent ready-for-human wontfix; do
  gh label create "$label" --description "Triage role: $label" --color ededed
done
```

标签已存在时 `gh label create` 会失败，因此先执行 `gh label list --limit 200` 检查，或对已存在的标签忽略该失败。
