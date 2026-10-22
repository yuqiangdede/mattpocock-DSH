# Windows 离线安装包：LLM 自动重试设置

[English](offline-llm-retry.md) | 中文

## 目标

Windows 安装包默认包含 `dsh-llm-retry-settings`，首次启动时将其作为可停用的 Desktop profile 插件加载，内网机器无需访问 npm 或 GitHub。**不修改 DSH 核心重试实现，也不自动打开策略覆盖开关。**

## 版本固定与更新

- 来源：[zeng6125-rgb/dsh-llm-retry-settings](https://github.com/zeng6125-rgb/dsh-llm-retry-settings)
- 固定版本：`0.1.18`
- 构建源：GitHub Release `dsh-llm-retry-settings-0.1.18.tgz`
- 固定 SHA-256：`f7eee54b5ddcdc1f0b85225a818f2c23b290f5c1b355874b3fc8db35216cf563`
- 更新只需要修改 `apps/desktop/src/bundled-plugins.ts` 中对应版本号和来自同一上游 Release 的 SHA-256。构建时对 tarball 校验，复制宿主及客户端代码、锁定运行时依赖，最后将文件纳入 Desktop runtime descriptor 全量哈希。

## 使用行为

- **新安装：** 首次创建 `profiles/desktop` 时自动将 `dsh-llm-retry-settings` 加入 `dsh.profile.bundles`。插件从安装包私有 runtime 读取，不需要网络。
- **已有 Profile：** 一次性迁移，生成 `.bundled-llm-retry-v1` 标记。发现此前本地安装的插件（即使已禁用）就不强制启用。用户以后手动禁用，也不会在下一次启动时自动开启。
- **界面：** 「设置 → General → LLM 自动重试」，可以配置重试次数、指数退避、错误码、模型差异策略及可选自动续写。**上游的 `enabled: false` 保持不变**；只有用户开启“策略覆盖”，才改变原生模型请求重试策略。
- **平台：** 仅 Windows Desktop。Web profile 和其他桌面平台不受影响。

## 验收步骤

1. Windows x64 构建 `pnpm run package:desktop:win:x64:unsigned` 成功。
2. `runtime:verify-bundled-llm-retry` 通过：压缩包 SHA、入口和宿主补丁校验成功；runtime descriptor 完整覆盖插件。
3. 新建的隔离 Desktop profile 能解析 bundle，Host 插件真实激活，且构建后的桌面启动不访问 npm 或 GitHub。
4. 真正离线的 Windows 环境打开设置卡片，把重试次数改为 3、保存、重启，制造可重试错误确认策略实际生效并持久化。
5. 手动停用后重启不会自动开启；升级旧 Profile 仅自动启用一次，不修改原有其他插件配置。
6. 未开启覆盖时原生重试行为没有变化。

**注意：** 此功能只有通过 Windows CI、完整打包烟测及内网实际 UI/请求验证后，才能视为端到端可用。

在 Windows 上，`pnpm run test:snapshot snapshots/web/offline-desktop.snapshot.ts -t llm-retry` 启用内置策略覆盖，并回放确定性的暂时失败及后续恢复，无需模型 API Key，同时比较失败尝试、重试策略、成功回复和持久化 Session 输出。
