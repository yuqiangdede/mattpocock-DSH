# Windows 离线安装包内置 Computer Use

[English](offline-computer-use.md) | 中文

使用独立维护版 [DSH Desktop Operator](https://github.com/zjh02249/dsh-desktop-operator)。这是第三方开发版本，不能视为 DeepSeek 官方生产级组件。

## 构建与版本升级

- **唯一版本/哈希入口**：`apps/desktop/src/bundled-plugins.ts` 的 `BUNDLED_DESKTOP_OPERATOR`。
- 当前锁定版本 `0.12.1`；`sha256` 对应上游 Release 的 `.tgz`，`windowsX64Sha256` 对应同次 Release 的 x64 exe。升级时三项一起替换，先审查发行说明和文件，再重新构建。
- 联网 Windows 构建机运行 `pnpm run package:desktop:win:x64:unsigned`。只在构建阶段下载并校验固定 tarball，使用构建缓存复用。SHA 不匹配时直接失败，不回退到最新版本或继续打包。
- 产出的安装包内包含插件、其生产依赖、Windows 原生 `open-computer-use.exe` 及默认 Agent Preset；运行期不访问 GitHub/npm 下载插件。
- 只对 Windows Desktop 启用，不修改上游默认 Web Profile、DSH 核心或根锁文件。版本更新不应触碰 `packages/bundle/web-app`。
- 本 Fork 会根据**同次构建**安装的 DSH 标准 Preset 生成专用的 `@mattpocock/dsh-desktop-operator-preset` Bundle，减少上游同步时的复制冲突。上游 Preset 关键结构变化会阻止发布，需要人工审核。

## 行为

- 全新 Windows Desktop Profile 默认附加 Computer Use Preset Bundle，提供 `desktop-computer-use` Agent Preset 并设为部署默认。用户之前选择的默认 Preset 仍按 DSH 设置处理。
- 老 Profile 首次升级只迁移一次，**不会在用户停用或“禁用所有插件”恢复后再次强制开启**。
- 普通动作可操作，但 `send`、`delete`、`upload`、`purchase` 等高风险最终操作使用 `highRiskActionPolicy: confirm`；保留视觉提示并禁止默认启动新程序。
- 插件实际生效取决于新建的 Agent Session 是否选择 `desktop-computer-use`。旧会话需要新建；用户可在插件管理中停用 `@mattpocock/dsh-desktop-operator-preset` Bundle。
- 不支持锁屏、UAC 安全桌面或非交互式远程桌面会话。

## 必须在 Windows 实机验收

1. 完成 `pnpm exec vitest run apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/bundled-desktop-operator.spec.ts`。
2. 验证 Windows x64 安装包构建和运行时烟测成功，离线 Bundle 未被标记 skipped，插件和 exe 哈希符合上游 Release。
3. 在全新 Windows 电脑**断开外网**安装，检查新 Session 中 `desktop-computer-use` 工具可用，先只读列出窗口，再做点击/输入/确认链路。
4. 将模型指向内网可访问的支持图片输入的模型 API；不能把“无外网访问插件安装”混同于“离线大模型推理”。
5. 验证升级旧 Profile、人工停用、程序重启、恢复模式及断网日志。验证数据、截图和控制请求是否只到授权内网服务。

**验收边界**：构建与 Host 烟测不能代替 Windows 实机 GUI 操作、断网启动及内网模型请求链路验证。发布前须完成上述实机验收。
