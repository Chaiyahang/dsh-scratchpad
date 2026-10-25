# 便签 · DSH Scratchpad

[![test](https://github.com/Chaiyahang/dsh-scratchpad/actions/workflows/test.yml/badge.svg)](https://github.com/Chaiyahang/dsh-scratchpad/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/@chaiyahang/dsh-scratchpad)](https://www.npmjs.com/package/@chaiyahang/dsh-scratchpad)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

给 DeepSeek Harness 的左栏便签插件：随手记、边写边存，Agent 也能读写。

> 状态：`0.2.0`（beta）。功能完整，建议先在个人 profile 中使用并反馈问题。
> 要求：DSH `>=0.2.1-rc.2`（`dsh.engines.dsh`）。

## 功能

- **左侧栏入口**：与「插件」「技能中心」并列；点击打开便签面板
- **多条便签**：边写边存（300ms 防抖，失焦/切换/隐藏时立即落盘），支持置顶、搜索、删除（二次确认）
- **附件**：图片与文件，支持按钮选择、拖拽、粘贴截图；图片可预览，文件可下载；单文件 25MB
- **Markdown 预览**：标题、粗体/斜体、行内代码、列表、引用、围栏代码；`- [ ]` 待办可直接勾选并写回原文
- **发送到对话**：卡片或编辑器一键把便签送进当前会话输入框（已有草稿时追加，不覆盖）；图片/文件作为真实附件一并带上
- **唤起快捷键**：默认 `⌘⇧S`（Windows/Linux `Ctrl+Shift+S`），可在「设置 → 快捷键」重绑
- **标签**：每条最多 12 个，列表顶部按标签筛选，Agent 工具支持按标签过滤/写入
- **导入导出**：单个 JSON（附件以 base64 内嵌），导入为合并语义
- **Agent 工具**（6 个）：`scratchpad_list / read / create / append / update / delete`

## 安装

从 npm 安装：

```bash
dsh plugin --profile <profile> add @chaiyahang/dsh-scratchpad
```

或直接从 GitHub 安装（跟随默认分支）：

```bash
dsh plugin --profile <profile> add github:Chaiyahang/dsh-scratchpad
```

也可以让 DSH 的插件管理器安装本地目录：

```
plugin_manager install_bundle /绝对路径/到/dsh-scratchpad
```

安装后刷新页面即可。升级同理，重装后刷新。

## 使用

| 操作 | 方式 |
|---|---|
| 唤起面板 | `⌘⇧S` / 点击左栏「便签」 |
| 新建便签 | 顶部「新建便签」或 `⌘/Ctrl + Enter` |
| 加标签 | 编辑器下方输入标签，回车或逗号确认，`Backspace` 删除最后一个 |
| 预览/勾选待办 | 工具栏「预览」，勾选后自动写回 `- [x]` |
| 发到对话 | 卡片纸飞机图标，或编辑器「发到对话」 |
| 备份 | 列表右上「导出」；导入选择 JSON 文件（合并，同 id 替换） |

## Agent 工具

| 工具 | 用途 |
|---|---|
| `scratchpad_list` | 列出便签，可按文本/标签过滤 |
| `scratchpad_read` | 读全文、标签与附件绝对路径 |
| `scratchpad_create` | 新建（可带标签、置顶） |
| `scratchpad_append` | 追加一段 |
| `scratchpad_update` | 重写正文，可选替换标签 |
| `scratchpad_delete` | 删除便签及其附件文件 |

## 数据与隐私

- 便签与附件存放在 `~/.dsh/scratchpad/`（`notes.json` + `files/`），不经过任何外部网络
- 附件是真实文件，Agent 读取时拿到绝对路径
- 卸载插件不会删除数据；需要清理时手动删除上述目录
- Markdown 渲染不使用 `dangerouslySetInnerHTML`，不执行笔记中的 HTML

## 已知限制

- UI 与 Agent 同时修改同一条便签时为**最后写入优先**，没有版本合并
- 导入只有合并模式，没有"整体替换"
- 便签只在当前机器的 DSH 数据目录中，不做跨设备同步
- 若 composer 当前不接受附件（子会话、类型不支持等），附件名会以文本形式留在正文里
- 正文上限 20 万字符；导入整体上限 100MB、最多 5000 条

## 开发

```bash
node --check index.js
node --check client.js
npm test
```

测试覆盖 5 个文件：Handler 行为（CRUD/附件/导入导出/标签）、路由注册与热重载容错、附件转移（成功/锁定回滚/缺失/无服务）、Markdown 渲染、面板版本与 `package.json` 一致性。

## 链接

- 仓库：https://github.com/Chaiyahang/dsh-scratchpad
- 发布：https://github.com/Chaiyahang/dsh-scratchpad/releases
- 问题：https://github.com/Chaiyahang/dsh-scratchpad/issues

```
index.js          Host：存储、HTTP 路由、Agent 工具
client.js         客户端：面板 UI、槽位注册、composer 桥接、快捷键
cordis.patch.yml  插件行
locale/           插件管理器中的标题与描述（zh/en）
icon.svg          图标
tests/            离线测试
```

## License

MIT
