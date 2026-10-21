# mattpocock-DSH 第一阶段实施说明

[English](mattpocock-dsh-stage1.md) | 中文

状态：首批实现，**未完成真实 Electron 端到端验收**。上游基线 DSH 0.2.1-rc.2。本文件仅记录本 Fork 的增量。

## 边界

- 保留官方 Agent Loop、Session、Tool Pipeline、权限和 Electron 壳，不迁移 PI 的历史会话。
- 插件：packages/client/ui-matt-skill-launcher，Host Config 和 Client Slot 两层；不要修改原生 Composer。
- 开发流程组：初始化、咨询、需求讨论、可视化讨论、固化需求、制定计划、执行开发、Bug 排查、代码审查、更多（任务拆分、TDD）。
- 文档生成组：需求文档、总体设计、概要设计、接口文档、数据库设计、文档融合、MD 转 Word，全部直接显示。
- 辅助操作组：交互提示词、提交代码、修复、编译、继续。
- 初始化绑定 setup-matt-pocock-skills；咨询、修复、编译和继续使用纯提示词，不冒充 PI 原生宿主命令。
- 用户明确点击 Send 后，才由 DSH 根据位于开头的 /skill-name 加载 Skill。
- 插入用 captureInsertion/insertText 并检查返回值；异步目录加载造成草稿版本失效时拒绝写入；现有附件/引用不被 setDraft 破坏。
- 配置由 Host Settings 持久化为版本化 JSON，支持分组、排序、显式保存、取消、恢复默认和导入导出。对损坏 JSON 不进行自动覆盖。
- 旧版 schemaVersion 1 的配置不自动覆盖：原内置 ID 推导默认显示分组；已保存的旧可视化讨论按钮按视觉顺序与文字讨论相邻；新增按钮需在设置中点击「补齐缺失预设」并保存。
- 默认绑定的 Skill 必须真实安装；没有对应目录时提示，不偷偷改为通用提示词执行。

## 交付路径

插件已接入 Web App 默认客户端 roster，Desktop 使用完整 Web App。项目自带的 Skills 存放在 .dsh/skills（方便开发本 Fork 时直接识别）。要让 DSH 在其他代码工作区识别，**手动执行**：

    node scripts/install-coding-skills.mjs

默认仅填补 DSH_HOME/skills 中不存在的技能目录，不覆盖已有技能。若需要更新到此版本，先确认内容，再添加 --overwrite；覆盖时旧目录重命名为时间戳备份。DSH 首页/Workspace 对应的用户目录必须与脚本目标 DSH_HOME 一致。

## 验收门禁

1. npm/pnpm 依赖冻结安装与两个 TS aggregate 编译通过。
2. Web 与 Windows Electron 均能显示三组按钮，文本与可视化需求讨论并排，启停插件后 UI 正确释放；验证顺序、窄窗口换行和 tooltip。
3. 选中原有草稿不被覆盖；有图片/文件引用时添加指令，数据仍然存在；异步查目录时切换会话，不串写。
4. 未安装 Skill 显示错误，不修改草稿；安装后 /skill-name 位于消息最前，并且在用户手动发送后才执行。
5. Host Settings 保存、重启恢复、重复导入、空列表、配置错误与并发修改冲突均能处理。
6. grill-with-ui 的 server.mjs/page.html 在测试 Workspace 的浏览器及端口环境中可实际运行，页面结果能回到对话。
7. 确认满足以上全部后才 merge 到 master，不能把源码审阅当作 Electron 实际通过。

## 未完成/待专项适配

- 旧 PI 自动会话命名、可视化讨论的 DSH 会话写回需集成测试后再宣称交付。
- 已把原 PI 的七项自定义文档 Skill 及其 references/scripts/_shared 随仓库复制，但外部 Python/Pandoc/绘图依赖和 DSH 执行兼容性尚待逐项验收。
- 单个插件目前只能按 order 进入“更多”（>=100），后续可配置显式分组字段。
- DSH 正处开发者预览，插件 API 可能破坏兼容；固定基线再评估上游同步。

## Fork CI 配置

上游 Issue policy / lifecycle 依赖 deepseek-harness 组织的 Project 和 GitHub App，仅在上游仓库执行。Fork 的 Cloudflare 预览默认跳过；需要部署时设置仓库变量 `DSH_CLOUDFLARE_PREVIEW_ENABLED=true`，并配置工作流使用的 Cloudflare 与 Access 凭据。常规构建、测试、发布包安装验证仍执行。Launcher 采用现有发布工具要求的包命名和统一版本，随 Web bundle 一同打包验证，不依赖 npm 上预先存在该插件。

### PR 检查运行器

Fork 的 PR CI 将 Linux 检查与最终汇总调度到 `ubuntu-24.04`，将 Windows 构建、原生测试及覆盖率调度到 `windows-2025`；此选择优先于上游的 Blacksmith / self-hosted 切换变量。检查命令、依赖关系和验收汇总保持不变，上游仓库继续使用原有运行器选择。主分支专用的自托管备用演练和手动性能档位测试不属于此 PR 检查适配范围。
