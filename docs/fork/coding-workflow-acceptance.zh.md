# 双模式编码工作流：验收证据台账（Host 权威版）

本文件逐条记录 [需求与验收规格](coding-workflow-requirements-v1.zh.md) 中 AC-P1～P3、E2E-01～12 的**实际证据**。状态只有三种：

- **已验证**：存在可复跑的自动化证据（给出命令或用例名）。
- **部分**：关键路径有自动化证据，但存在明确缺口（写明缺口）。
- **未验证**：尚无真实环境证据；不得在交付报告中写成通过。

本地命令：

```sh
pnpm exec vitest run packages/workflow/coding-workflow/tests
pnpm exec vitest run packages/client/ui-matt-skill-launcher/tests
```

## P1 双模式基础

| 条目 | 状态 | 证据 |
|---|---|---|
| P1-01 默认 manual，原按钮自定义/排序/更多不回归 | 已验证 | `ui-matt-skill-launcher/tests/actions.client.spec.ts`、`contextual-actions.client.spec.ts`（18+19 用例）；面板默认不显示任务卡 |
| P1-02 手动流程逐步发起，确认/退回/重跑/跳过有状态与理由 | 部分 | 按钮与提示词由既有用例覆盖；阶段级「跳过」仅 S6 有 `skipped` 语义（`domain.spec.ts` 路由用例），其余阶段无独立跳过入口 |
| P1-03 工作项持久保存在 Host，重启展示原状态且不自启 | 已验证 | `tests/service.spec.ts`「shows the persisted task after a restart without resuming work」：第二个 Host 进程读到同一记录且阶段不变 |
| P1-04 源产物变化使依赖阶段 stale | 已验证 | `domain.spec.ts`「invalidates verification when the source changes after review」「routes blocking findings…」：S7 stale、verification 清空 |
| P1-05 工作区/Session 隔离、并发冲突、缺 Skill 显式失败 | 部分 | 分支占用、Session 占用、过期 revision 均有域/服务用例；「缺 Skill」提示仅在组件逻辑中，无专门用例 |
| P1-06 Desktop 与 Web 呈现一致 | 部分 | 两者共用同一 Web 客户端与 Remote；无 Desktop 打包后的人工验收证据 |

## P2 自动编排

| 条目 | 状态 | 证据 |
|---|---|---|
| P2-01 低风险目标授权后自动执行 S0～S7 | 部分 | 服务用例跑通 S1–S9；「自动」仍由模型按 SKILL.md 推进，Host 不主动调度 |
| P2-02 权限/数据/范围异常进入 waiting_approval 或 blocked | 已验证 | `domain.spec.ts` 审批与阻塞用例；`workflow-panel.client.spec.tsx` 渲染待审批与批准命令 |
| P2-03 审查失败→修复→复审，≤3 轮，2 轮无进展停止 | 已验证 | `domain.spec.ts`「stops when two consecutive reviews report the same blocking findings」「caps repair rounds」 |
| P2-04 缺工具/依赖/构建失败不得宣称完成 | 已验证（构建失败） | 失败验证在 `domain.spec.ts` 置 `blocked`；缺工具仍靠模型遵循 SKILL.md |
| P2-05 暂停/恢复/切手动/重启不重复阶段或并发写 | 部分 | revision CAS + 暂停/恢复用例；跨进程并发未验证（单进程存储域） |
| P2-06 进度、输入、产物、阻塞理由可在 UI 查看 | 已验证 | `workflow-panel.client.spec.tsx`（阶段、阻塞、命令）；`workflow-source.client.spec.ts`（事件后权威重读、过期读丢弃） |

## P3 本地提交与桌面稳定性

| 条目 | 状态 | 证据 |
|---|---|---|
| P3-01 证据有效时自动执行一次本地 commit | 已验证 | `tests/service.spec.ts`「runs a clean task from start to one local commit」：真实 Git，提交后工作树干净 |
| P3-02 未归属/混杂暂存/冲突/敏感文件阻塞 | 已验证 | `domain.spec.ts`「commits only after fresh review…」「refuses a commit on a protected branch」；`guard.spec.ts` 直接 Git 变更拦截 |
| P3-03 干净 main/master 创建专用任务分支 | 已验证 | `tests/service.spec.ts` 首个用例断言 `coding/` 分支与基线提交 |
| P3-04 源码变化使审查/构建指纹失效 | 已验证 | `domain.spec.ts` 同上；验证要求 review 指纹与当前 diff 相同 |
| P3-05 钩子失败不可跳过，恢复不重复提交 | 部分 | `repository.ts` 校验提交后 tree 与 `git status`；无「钩子改树」的自动化用例 |
| P3-06 交付报告含真实 SHA、问题、证据、增删行数 | 部分 | SKILL.md 要求；Host 不校验报告内容 |
| P3-07 Windows 安装包携带 Skills/脚本，内网无需下载 | 未验证 | CI 构建并冒烟未签名安装包；断网使用与「包内 Skill 完整」无人工证据 |
| P3-08 上游同步不侵入核心 | 已验证 | 本分支改动仅位于 `packages/workflow/coding-workflow`、`packages/client/ui-matt-skill-launcher`、bundle 补丁、`api/remotes`、`.dsh/skills` 与文档；未改 Agent Loop/Session/权限核心 |

## E2E 用例

| 用例 | 状态 | 证据或缺口 |
|---|---|---|
| E2E-01 干净工作区 + 明确目标 → 自动完成并本地提交一次 | 部分 | 服务集成测试覆盖 S1–S9 全流程；「自动」部分（模型驱动）无真实模型回放证据 |
| E2E-02 需求权限有歧义 → 确认前不实施 | 部分 | 审批状态与面板有证据；模型是否真的停下由 SKILL.md 约束 |
| E2E-03 走读发现 P1 → 修复、复审、重新验证 | 已验证 | `domain.spec.ts` 修复往返 + 「repair evidence survives…」历史用例（CLI 侧） |
| E2E-04 两轮相同问题 → 阻塞停止 | 已验证 | `domain.spec.ts` 同问题两轮阻塞用例 |
| E2E-05 新建手动任务 → 不自动调用下一阶段 | 已验证 | 默认 manual + 无自动调度；服务用例断言 start 后停在 S1 |
| E2E-06 S4 后切换模式 → 复用任务与证据、不双跑 | 部分 | 模式切换走同一记录（`setMode` 暂停）；无跨模式接续的端到端脚本 |
| E2E-07 S5 时终止进程 → 恢复检查点不自动续跑 | 部分 | 重启读取用例证明状态恢复；「不自动续跑」由启动不会自动调工具保证，未做进程终止演练 |
| E2E-08 S7 成功后改源码 → 不允许提交 | 已验证 | `domain.spec.ts`「Verification is stale」用例 |
| E2E-09 启动前脏文件 → 不 reset、不覆盖 | 已验证 | `tests/service.spec.ts`「refuses a dirty tree…」 |
| E2E-10 全部通过 → 无 push/PR/remote commit | 已验证（结构性） | 服务无任何 push/PR 动词；`repository.ts` 不执行网络命令；验证命令禁用 `git/svn/ssh/curl/wget` |
| E2E-11 Windows 断公网 → 离线可执行 | 未验证 | 需真实断网环境；本次未执行 |
| E2E-12 SVN 仓库 → 提交前停止 | 部分 | 验证命令禁用 `svn`，且任务启动要求 Git 仓库（非 Git 时 Git 调用失败并阻塞）；无 SVN 工作副本演练 |

## 结论

自动化证据已覆盖 P1-03/04、P2-02/03/06、P3-01/02/03/04、E2E-03/04/05/08/09/10。仍缺：Windows 断网验收（P3-07、E2E-11）、真实模型自动开发回放（E2E-01/02）、跨进程并发（P2-05）、提交钩子改树（P3-05）与 SVN 演练（E2E-12）。在这些缺口补齐前，交付报告必须逐项标注「未验证」或「部分」。
