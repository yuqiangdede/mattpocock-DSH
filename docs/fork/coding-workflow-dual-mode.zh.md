# 双模式编码工作流（首版实现 / Draft）

本 Fork 新增 **手动（默认）/ 全自动** 入口。手动模式继续显示原 Skill Launcher 的按钮、自定义设置和「更多」；全自动模式在草稿开头插入 \`/coding-workflow\`，用户检查并手动 Send 后由现有 DSH Agent 执行该 Skill。**点击模式或“准备”不会自动发送，不会自动提交。**重启后入口恢复手动，避免未经授权续跑。

## 可实际使用的部分

- \`.dsh/skills/coding-workflow/SKILL.md\`：全自动阶段规范（需求、固化、计划、实现、审查、修复、验证、本地 Git commit、交付报告），保留原单阶段 Skills。
- \`.dsh/skills/coding-workflow/scripts/workflow-state.mjs\`：独立 Node CLI 检查点，外部持久存储在 \`DSH_HOME/coding-work-items\`，包括阶段顺序、真实文件证据、分支/HEAD、review/verify diff 指纹、限 3 轮修复、实际验证命令、严格的 Git 暂存范围和本地提交；提供 pause、mode、resume、approval、block 操作。
- 一组 Node 测试覆盖干净建任务、脏工作区拒绝、指纹失效、审核阻塞、本地提交幂等。
- 安装脚本 \`node scripts/install-coding-skills.mjs\` 会同时携带新 Skill 的脚本；Windows 离线部署无新增运行时 npm 依赖（要求已安装 Node/Git）。

## 已知未完成（本 PR 不能宣称 P1～P3 全验收）

1. 当前状态保存在 CLI 文件，**尚未实现 Host 权威 Workflow Controller、Client Remote 和阶段实时 UI**；界面的自动模式文字是流程说明，并非实时状态展示。
2. 现阶段自动推进由 DSH Agent + Skill 策略驱动；并非 Host 状态机自动派发和中断。现有 DSH 权限机制仍适用，**Skill 提示词本身不能硬拦截普通 bash 工具调用**。
3. helper 现在要求事先登记测试和构建命令并逐项实际执行；但尚未建立面向所有语言/工程框架的独立语义鉴别器，必须通过人工审查确保登记的确实是项目测试和构建入口。
4. 工作项状态尚未和会话/Workspace 的 UI 双向绑定，手动按钮操作不会自动回写工作项；人工确认由对话承接，尚无专门审批面板。
5. 未执行完整 Windows Electron 打包及隔离网络环境验收。适配需要按专用测试环境验证。

合并之前需补足上述 Host/Remote 控制、强制安全门禁、UI 实时状态与 Windows E2E；目前应保持 PR 为 **Draft**，不可将此基础实现标记为最终全量完成。

## 本地测试

\`\`\`sh
node --test .dsh/skills/coding-workflow/scripts/workflow-state.test.mjs
\`\`\`

本次变更只触及 Fork 插件及 \`.dsh/skills\`，不修改上游 Agent Loop / Session 核心。验收要求与正式规格参见本项目需求评审记录。
