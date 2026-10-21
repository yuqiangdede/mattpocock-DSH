---
name: executing-plans
description: Execute an approved implementation plan task by task in the current session, preserving tests, decisions and review evidence.
---

# Executing Plans（DSH 适配）

本 Skill 对应单 Agent 的计划执行流程。它使用 **本次安装包真实提供的 Skill 名称**，不依赖上游 Superpowers 仓库中未随包安装的脚本或子技能。

## 使用前提

- 已有确认的需求规格和实施计划；通常由 `to-spec` 与 `writing-plans` 产出。
- 检查仓库、当前分支、工作区修改和计划引用的文件确实存在。
- **开始第一个任务前加载 `tdd` Skill**。按失败测试、最小实现、成功测试、必要重构的顺序执行；不要将环境故障当成预期的 RED。
- 若任务相互独立且有子代理工具，可让用户选择 `subagent-driven-development`；否则在当前会话逐项执行。
- 禁止在没有确认时清理用户目录、覆盖已有改动、推送共享分支、合并或发布。

## 计划与检查点

先读取计划和引用的规格，核对前后任务之间的接口、输入输出和验收标准。复杂或跨会话任务须在受忽略规则保护的 `.superpowers/sdd/<plan-name>/` 中建立 `progress.md`，首行写入计划路径和当前基准提交。

本资源包实际提供辅助脚本：

- `scripts/task-start` 和 `scripts/task-done`。
- `../subagent-driven-development/scripts/sdd-workspace` 与 `../subagent-driven-development/scripts/review-package`。

使用前应先确认脚本存在、参数适配本次项目和系统环境。Windows 若不能直接运行 Shell 脚本，使用 Git、PowerShell 和项目测试命令实现等效操作；不可虚报执行过的脚本。简单计划允许手动台账，不强制使用辅助脚本。

每项任务记录：任务编号、代码基准、影响文件、失败测试及根因、通过的回归命令、实际提交 SHA、未验证内容。如计划与规格冲突，写明 `Ruling: 决定 — 依据 — 错误代价`；规格优先，不能悄悄扩大范围。

## 任务循环

1. **取任务**：逐条读取当前任务的完整要求、接口、依赖和验收条件。检查之前完成的提交和真实文件状态。
2. **RED**：根据 `tdd` 先写能够复现预期问题的测试并运行。确认失败原因与目标一致，记录证据。
3. **GREEN**：实施最小修改，运行目标测试。失败时加载 `diagnosing-bugs`，先定位根因，禁止关闭测试来换取通过。
4. **回归**：按计划执行必要的格式检查、静态类型检查、构建与相关功能回归，并逐条对比 `Expected:` 结果。
5. **提交与记账**：测试真实通过后再按计划提交；在 `progress.md` 记录 `Task N: complete (commits <base>..<head>, tests: <command> passed)`。未通过或缺少证据的任务保持 pending/failed，不得标记完成。

不要仅依赖对话摘要恢复进度。重启后对照工作区、Git 历史、测试输出和台账核实已完成任务，避免重复执行或覆盖他人改动。

## 最终审查与交付

所有任务完成后，使用本包提供的 **`code-review`** Skill 对整个变更范围做审查，重点覆盖正确性、并发、数据安全、功能边界、可维护性和测试覆盖。若能派发独立审查代理，提供计划、规格、基准提交、变更文件和决策记录；无法派发时明确写出“实现者自审”，不冒充独立审查。

- P0/P1 阻塞必须解决，并重新进行必要测试。
- 修复后运行完整的相关回归；未实际运行的项目标注“未验证”。
- 保留重大决策与推迟问题的记录，不能为清理而删除其他计划的工作目录。
- 输出任务完成清单、提交记录、通过/失败的验证、遗留风险和建议下一步。
- 只在用户明确授权时执行远程推送、PR 合并或发布，不将它们视为本 Skill 的隐式收尾步骤。

## 本包内可用 Skill

- 规格：`to-spec`；计划：`writing-plans`。
- 执行验证：`tdd`；故障诊断：`diagnosing-bugs`。
- 代码审查：`code-review`；多 Agent 执行：`subagent-driven-development`。

上述名称与 `.dsh/skills/<name>/SKILL.md` 一一对应；不要使用不存在的 `superpowers:test-driven-development`、`superpowers:requesting-code-review`、`superpowers:verification-before-completion` 等依赖。
