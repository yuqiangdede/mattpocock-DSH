---
kind: upgrade-guide
description: "编码按钮设置改用版本 3，新增固定快捷栏；默认开发操作使用 Matt Pocock skills。"
---

# 编码按钮预设与设置版本 3

[English](guide.md) | 中文

## 变更

Skill Launcher 读取版本 1 设置时更新未修改的默认字段并补入六个操作，保留自定义字段及禁用状态，空列表保持为空。未定制的重复任务拆分预设会被删除。保存和导出改用版本 3，其中的操作可以带 `pinned` 标记。版本 2 客户端重建操作时会丢弃未知字段，因此会拒绝版本 3，而不是静默丢失固定设置。

Launcher 现在在固定快捷栏下方每次只显示一个分类。新建或恢复默认设置时，六个预设默认固定；已保存的操作保持其存储时的固定状态。

开发流程以 `to-tickets` 和 `implement` 替换 `writing-plans` 和 `executing-plans`。默认包不再携带 Superpowers skills；用户已安装的 skills 保持不变。

## 迁移

1. 如需再次使用旧客户端，提前备份版本 1 或版本 2 按钮设置导出文件；旧客户端无法导入版本 3。
2. 打开 Skill Launcher 设置，检查更新后的名称与 Skill ID，固定常用按钮后保存以持久化版本 3。自定义字段仍可编辑。达到 100 个按钮上限时，先移除不需要的操作，再补入遗漏的新预设。
3. 源码安装运行 `node scripts/install-coding-skills.mjs` 安装缺失 skills。已有目录默认跳过；仅在明确要更新时使用 `--overwrite`，安装脚本会保留备份。桌面发行包包含更新后的默认 skills。
4. 确认咨询插入 `/ask-matt`、拆分工单插入 `/to-tickets`、开发插入 `/implement`。点击仅修改草稿。上下文交接要求见 [Launcher 行为](../../../../packages/client/ui-matt-skill-launcher/README.zh.md)。
