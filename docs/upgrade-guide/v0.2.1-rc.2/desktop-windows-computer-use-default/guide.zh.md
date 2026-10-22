---
kind: upgrade-guide
description: "Windows Desktop profile 默认预装 Computer Use，已有 profile 自动迁移至 desktop-computer-use Agent Preset。"
---

# Windows Desktop Computer Use 默认预设

[English](guide.md) | 中文

## 变更

在 Windows 上，Desktop 安装包现在默认内置离线 `dsh-desktop-operator` 运行时以及 `@mattpocock/dsh-desktop-operator-preset` 适配层。升级后首次启动时，Desktop 会原子化更新用户的桌面 profile 清单（`%USERPROFILE%\.dsh\profiles\desktop\package.json`），将默认 Agent Preset 切换为 `desktop-computer-use`。

新预设向模型挂载 Windows Computer Use 工具（`mcp__computer_use__*`），并默认启用高风险操作人工确认策略。已有配置过或主动禁用了 Computer Use 的用户 profile 保持权威，不会被重复覆盖。非 Windows 平台与独立 Web profile 不受影响。

## 迁移

1. 在 Windows 上启动升级后的 Desktop 应用。迁移过程会自动将 `@mattpocock/dsh-desktop-operator-preset` 追加到 `dsh.profile.bundles` 中，并写入迁移标记 `.desktop-operator-default-v0.12.1`。
2. 如需停用并切回标准 Agent Preset，可在 Plugins 界面停用 Computer Use，或在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 中移除 `@mattpocock/dsh-desktop-operator-preset`。Desktop 会遵从手工配置，后续启动不会重新激活该 bundle。
3. 新建会话并查看工具目录，确认当前激活的预设与工具符合预期。
