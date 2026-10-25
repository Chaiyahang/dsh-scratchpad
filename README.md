# 便签 · DSH Scratchpad

[![test](https://github.com/Chaiyahang/dsh-scratchpad/actions/workflows/test.yml/badge.svg)](https://github.com/Chaiyahang/dsh-scratchpad/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/@chaiyahang/dsh-scratchpad)](https://www.npmjs.com/package/@chaiyahang/dsh-scratchpad)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

给 DeepSeek Harness 的左栏便签插件：随手记、边写边存，Agent 也能读写。

Beta。要求 DSH `>=0.2.1-rc.2`；版本变化见 [CHANGELOG](CHANGELOG.md)。

## 功能

- **左侧栏入口**：点击打开便签面板，`⌘⇧S` 唤起并聚焦输入框
- **多条便签**：边写边存、置顶、搜索、删除二次确认
- **附件**：图片/文件，支持选择、拖拽、粘贴；图片预览，文件下载
- **Markdown 预览**：标题、强调、代码、列表、引用；`- [ ]` 待办可勾选并写回原文
- **发送到对话**：一键送入当前输入框，图片/文件作为真实附件一并带上
- **标签**：最多 12 个/条，列表按标签筛选
- **导入导出**：单个 JSON（附件以 base64 内嵌），导入为合并语义
- **Agent 工具**：`scratchpad_list / read / create / append / update / delete`

## 安装

把 `PROFILE` 换成你的 profile 名（例如 `desktop`）。从 npm：

```bash
dsh plugin --profile PROFILE add @chaiyahang/dsh-scratchpad
```

从 GitHub（跟随默认分支）：

```bash
dsh plugin --profile PROFILE add github:Chaiyahang/dsh-scratchpad
```

或让插件管理器安装本地目录：`plugin_manager install_bundle /路径/到/dsh-scratchpad`。装完刷新页面。

## 使用

| 操作 | 方式 |
|---|---|
| 唤起 | `⌘⇧S` / 点击左栏「便签」 |
| 新建 | 「新建便签」或 `⌘/Ctrl + Enter` |
| 标签 | 编辑器下方输入，回车/逗号确认，Backspace 删最后一个 |
| 预览 | 工具栏「预览」，勾选待办会写回 `- [x]` |
| 发到对话 | 卡片纸飞机，或编辑器「发到对话」 |
| 备份 | 列表右上「导出 / 导入」 |

## Agent 工具

| 工具 | 用途 |
|---|---|
| `scratchpad_list` | 列出便签，按文本/标签过滤 |
| `scratchpad_read` | 读全文、标签与附件绝对路径 |
| `scratchpad_create` | 新建（可带标签、置顶） |
| `scratchpad_append` | 追加一段 |
| `scratchpad_update` | 重写正文，可选替换标签 |
| `scratchpad_delete` | 删除便签及附件文件 |

## 数据与限制

- 数据在 `~/.dsh/scratchpad/`（`notes.json` + `files/`），不经过外部网络；卸载不清除
- 附件是真实文件，Agent 读取时拿到绝对路径；Markdown 渲染不执行 HTML
- UI 与 Agent 同时修改同一条便签为最后写入优先
- 导入只有合并模式；数据仅本机，不跨设备同步
- composer 不接受附件时（子会话、类型不支持等），附件名会以文本形式保留

## 开发与发布

```bash
node --check index.js && node --check client.js
npm test
```

打 `v*` tag 推送后，`.github/workflows/publish.yml` 通过 npm Trusted Publishing（OIDC）自动发布；首次启用需在 npm 包设置登记仓库与工作流，并设置仓库变量 `NPM_TRUSTED_PUBLISHING=true`。

## 链接

- 仓库：https://github.com/Chaiyahang/dsh-scratchpad
- 发布：https://github.com/Chaiyahang/dsh-scratchpad/releases
- 问题：https://github.com/Chaiyahang/dsh-scratchpad/issues
- 市场：等待 [dshopen 收录](https://github.com/polang233/dsh-plugin-index/issues/73)

MIT
