# 任务追踪

[English](issue-tracker.md) | 中文

本仓库的 issue 与 spec 保存在克隆源仓库的 GitHub Issues 中，当前为 `yuqiangdede/mattpocock-DSH`。在克隆目录内执行 `gh` 即可，它会依据 `git remote -v` 推断仓库。

## 约定

- **新建 issue**：`gh issue create --title "..." --body "..."`；有合适的模板时，从[任务](../../.github/ISSUE_TEMPLATE/task.md)、[缺陷](../../.github/ISSUE_TEMPLATE/bug.md)或[功能](../../.github/ISSUE_TEMPLATE/feature.md)模板的正文起步。
- **读取 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels --jq '[.[] | {number, title, labels: [.labels[].name]}]'`，用 `--label` 与 `--state` 缩小范围。
- **评论 issue**：`gh issue comment <number> --body "..."`。
- **添加或移除标签**：`gh issue edit <number> --add-label "<label>"` 与 `gh issue edit <number> --remove-label "<label>"`。
- **关闭 issue**：`gh issue close <number> --comment "..."`。
- **设为子 issue**：`gh issue create --parent <parent> ...`，或事后执行 `gh issue edit <parent> --add-sub-issue <child>`。子 issue 不可用时，在子 issue 正文顶部写 `Part of #<parent>`。

## issue 元数据

issue 使用 GitHub 原生 Issue Type；`kind/*` 标签只用于分类 pull request，issue 上的 `area/*` 标签可选（[标签分类](../../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.zh.md)）。

解析 issue 的 pull request 需要恰好一个 `kind/*`、至少一个 `area/*`，至多一个 `p0`–`p3`；其他取值会被[issue 策略](../../.github/issue-management/README.zh.md)拒绝。`Refs #12` 这类信息性引用不触发 Project 要求，而 `Fixes`、`Closes`、`Resolves` 引用会与 Project 的 `Priority` 字段比对。

[config.json](../../.github/issue-management/config.json) 指定的是 `deepseek-harness/deepseek-harness` 仓库与 Project 1，因此源仓库指向其他仓库的克隆不适用由 Project 驱动的状态流转。请直接为 issue 打标签并读取，issue 状态取自其标签、评论以及开启或关闭状态，而不是 Project 的列。

## pull request 作为请求入口

**PRs as a request surface: no.** _分诊会读取该开关；将其设为 `yes` 可让外部 pull request 与 issue 一起进入队列。_

设为 `yes` 后，外部 pull request 走同一套角色，命令为 `gh pr view <number> --comments`、`gh pr diff <number>`、`gh pr comment`、`gh pr edit --add-label` 与 `gh pr close`。

GitHub 的 issue 与 pull request 共用一个编号空间，因此先用 `gh pr view 12` 解析裸写的 `#12`，再回退到 `gh issue view 12`。

## 当技能要求"publish to the issue tracker"

按 **新建 issue** 所述创建 GitHub issue。

## 当技能要求"fetch the relevant ticket"

按 **读取 issue** 所述读取它。

## Wayfinding 操作

地图是一个带 `wayfinder:map` 标签的 issue，其票据是子 issue。首次使用时用 `gh label create` 创建这些标签。

- **创建地图**：`gh issue create --label wayfinder:map ...`，正文包含 Notes、Decisions so far 与 Fog 三节。
- **创建票据**：作为地图子 issue 关联的 issue，标签为 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- **记录阻塞**：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`，其中的 database id 来自 `gh api repos/<owner>/<repo>/issues/<n> --jq .id`。依赖不可用时，在子 issue 正文顶部写 `Blocked by: #<n>`。
- **寻找前沿**：地图下处于开启状态、`issue_dependencies_summary.blocked_by` 为零且没有 assignee 的子 issue，取地图顺序中的第一个。
- **领取票据**：`gh issue edit <n> --add-assignee @me`。
- **解决票据**：`gh issue comment <n> --body "<answer>"`，再 `gh issue close <n>`，然后在地图的 Decisions-so-far 一节追加指针。
