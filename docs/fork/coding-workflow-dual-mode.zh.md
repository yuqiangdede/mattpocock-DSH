# 双模式编码工作流（Host 权威实现 / Draft）

本 Fork 新增 **手动（默认）/ 全自动** 入口。手动模式继续显示原 Skill Launcher 的按钮、自定义设置和「更多」；全自动模式在草稿开头插入 `/coding-workflow`，用户检查并手动 Send 后由现有 DSH Agent 执行该 Skill。**点击模式或“准备”不会自动发送，不会自动提交。**重启后入口恢复手动，避免未经授权续跑。

## 可实际使用的部分

- **Host 权威 Work Item**：`packages/workflow/coding-workflow` 提供 `ctx.codingWorkflow`。任务记录存放在存储域 `coding_workflow`（`DSH_HOME/storages`，不进会话日志、不改会话格式），`work_items` 每任务一条记录，`revision` 比较交换拒绝过期写入。
- **模型侧 `coding_workflow` 工具**：`start / status / stage / checks / review / repair / verify / commit / mode / pause / resume / approval / approve / block / cancel`。每次变更都由服务按真实仓库快照校验：分支与 HEAD 必须仍是任务声称的值、实现文件必须在计划允许路径内、走读与验证冻结同一个变更集指纹、唯一一次本地提交只暂存该指纹覆盖的文件并复核证据摘要。
- **Client Remote 与实时面板**：`ui-matt-skill-launcher` 通过 `ctx.remote.codingWorkflow` 读取任务，接收 `coding-workflow/changed` 后重新读取权威记录，渲染 S0～S9 阶段进度、模式、分支、阻塞原因，并提供批准、暂停、继续、取消命令（全部携带读取到的 revision）。
- **工具级守卫**：任务进行中 `bash/pwsh` 不得执行 `git commit/push/reset/checkout/rebase/merge`；`write/edit` 在实现/修复窗口只允许计划内文件；暂停/阻塞/待审批时拒绝仓库写入。守卫是单调同步拒绝，提示词无法撤销。
- `.dsh/skills/coding-workflow/SKILL.md`：全自动阶段规范，命令改为调用 `coding_workflow` 工具；`scripts/workflow-state.mjs` 保留为无插件 profile 的离线回退，动词与工具一致。
- 文档门禁：手动代码入口与全自动 S1–S8 不写产品资料文档；全自动 S9 在本地提交后询问一次，确认后只更新工作区。新增「补充文档」提示词按钮，只增量补充现有需求/设计/数据库/接口文档，缺失只列出。
- Node 回归测试覆盖干净建任务、脏工作区拒绝、分支任务冲突、人工审批、模式暂停、修改文件白名单、重复审查和本地提交幂等；Host 侧另有 30 个用例（纯状态机、守卫、真实存储 + 真实 Git 的端到端）。

## 已知未完成（本 PR 不能宣称 P1～P3 全验收）

1. 自动推进由 DSH Agent + Skill 策略驱动；Host 只校验和记录每次变更，并非 Host 状态机主动派发或中断。
2. 工具守卫拦的是工具调用，不解析 shell 内容：由 shell 启动的程序写文件，只会在 S5/S7 以其变更集被发现。
3. 存储域只在单个 Host 进程内串行化写入；两个 Host 进程写同一任务时，`revision` 比较交换是唯一冲突检测。
4. 尚未建立面向所有语言/工程框架的测试与构建语义鉴别器，登记的命令仍须人工审查其确实是项目入口。
5. 未执行完整 Windows Electron 打包及隔离网络环境验收；离线安装包与断网使用证据待补。
6. 产品资料文档门禁仍由 Skill/提示词执行，Host 侧未单独拦截文档目录写入。
7. 生成目录（config catalog、Cordis surface、module graph）尚未随新插件刷新。

合并之前需补足 AC-P1～P3 与 E2E-01～12 的逐项证据；目前应保持 PR 为 **Draft**，不可将此实现标记为最终全量完成。

## 本地测试

```sh
node --test .dsh/skills/coding-workflow/scripts/workflow-state.test.mjs
pnpm exec vitest run packages/workflow/coding-workflow/tests
pnpm exec vitest run packages/client/ui-matt-skill-launcher/tests
```

本次变更只触及 Fork 插件及 `.dsh/skills`，不修改上游 Agent Loop / Session 核心。验收要求与正式规格参见本项目需求评审记录与 [Host 权威决策记录](../../.agents/notes/implemented/architecture/2026-10-23-host-authoritative-coding-workflow.zh.md)。
