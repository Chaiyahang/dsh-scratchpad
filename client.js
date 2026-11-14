/**
 * Client half of the scratchpad panel.
 *
 * The Host owns the notes (durable JSON + attachment files under the DSH data
 * directory); this module is the panel UI over `/api/scratchpad/*` and also
 * migrates notes written by the browser-only first version.
 */
window.__ModuleLoader__.load({
  id: '@chaiyahang/dsh-scratchpad',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

    /** Locale namespace and the `main` key / sidebar id share one identifier. */
    const NS = 'scratchpad';
    /** Keep in sync with package.json; tests/version.test.mjs guards the pair. */
    const VERSION = '0.4.0';
    const PANEL_ID = 'scratchpad';
    const PANEL_ORDER = -1;
    const STYLE_ID = '@chaiyahang/dsh-scratchpad/panel.css';
    const API = '/api/scratchpad';
    const LEGACY_DB = 'dsh-scratchpad-panel';
    const MIGRATION_FLAG = 'dsh-scratchpad-panel:host-migrated';
    const SAVE_DELAY = 300;
    const POLL_DELAY = 4000;
    const UNDO_DELAY_MS = 8000;
    const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
    const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

    const DICTS = {
      en: {
        'panel.title': 'Scratchpad',
        'panel.subtitle': 'Capture an idea, keep it. Saved by the Host, readable by the Agent.',
        'panel.version': 'Version',
        'panel.new': 'New note',
        'panel.search': 'Search notes',
        'panel.listTitle': 'All notes',
        'panel.loading': 'Loading notes…',
        'panel.empty': 'No notes yet. Write your first idea above.',
        'panel.noResults': 'No note matches your search.',
        'panel.loadError': 'Could not read the note store. Check that the plugin host side is running.',
        'panel.draftRestored': 'Restored an unsaved draft.',
        'panel.deleted': 'Note deleted — kept for 7 days.',
        'panel.undo': 'Undo',
        'panel.updatedElsewhere': 'This note was just updated in another window or by the Agent.',
        'panel.localData': 'Notes stored locally in ~/.dsh/scratchpad/.',
        'trash.title': 'Trash',
        'trash.back': 'Back to notes',
        'trash.empty': 'Trash is empty.',
        'trash.restore': 'Restore',
        'trash.deleteForever': 'Delete forever',
        'trash.emptyAll': 'Empty trash',
        'trash.confirmEmpty': 'Sure? Delete all',
        'trash.expiresPrefix': 'auto-deletes in',
        'trash.expiresSuffix': 'days',
        'todos.title': 'To-dos',
        'todos.empty': 'No open to-dos. Write "- [ ] something" in any note and it shows up here.',
        'todos.openGroup': 'Open',
        'todos.doneGroup': 'Completed',
        'todos.openNote': 'Open the note',
        'history.title': 'History',
        'history.open': 'Version history',
        'history.restore': 'Restore',
        'history.empty': 'No earlier versions yet.',
        'history.close': 'Close',
        'editor.placeholder': 'Jot an idea down…',
        'editor.image': 'Image',
        'editor.file': 'File',
        'editor.chars': 'chars',
        'editor.saving': 'Saving…',
        'editor.saved': 'Saved',
        'editor.saveFailed': 'Save failed',
        'editor.rejected': 'Skipped (over 25 MB or unreadable):',
        'editor.conflict': 'This note changed elsewhere while you were editing.',
        'editor.conflictOverwrite': 'Keep my version',
        'editor.conflictAdopt': 'Use the saved version',
        'editor.foldNew': 'New note…',
        'editor.jot': 'Jot it down',
        'editor.jotHint': '⌘/Ctrl+Enter — finish this note and start the next',
        'editor.bold': 'Bold',
        'editor.italic': 'Italic',
        'editor.strike': 'Strikethrough',
        'editor.code': 'Inline code',
        'editor.heading': 'Heading',
        'editor.ul': 'Bulleted list',
        'editor.ol': 'Numbered list',
        'editor.table': 'Table',
        'editor.mdGroup': 'Markdown formatting',
        'editor.remove': 'Remove attachment',
        'note.pin': 'Pin note',
        'note.unpin': 'Unpin note',
        'note.delete': 'Delete note',
        'note.confirmDelete': 'Sure?',
        'note.untitled': 'Empty note',
        'group.pinned': 'Pinned',
        'group.today': 'Today',
        'group.yesterday': 'Yesterday',
        'note.pinnedFlag': 'Pinned',
        'group.pinned': 'Pinned',
        'group.today': 'Today',
        'group.yesterday': 'Yesterday',
        'note.open': 'Open note',
        'note.send': 'Send to conversation',
        'note.attachments': 'Attachments',
        'editor.send': 'Send to chat',
        'editor.preview': 'Preview',
        'editor.edit': 'Edit',
        'editor.emptyPreview': 'Nothing to preview yet.',
        'editor.task': 'Task',
        'shortcut.open': 'Open scratchpad',
        'shortcut.new': 'New note',
        'shortcut.search': 'Search notes',
        'shortcut.openShort': 'Open',
        'shortcut.newShort': 'New',
        'shortcut.searchShort': 'Search',
        'data.export': 'Export',
        'data.exportHint': 'Download every note, attachments included, as one JSON file.',
        'data.import': 'Import',
        'data.importHint': 'Merge notes from a JSON backup; notes with the same id are replaced.',
        'data.importing': 'Importing…',
        'data.imported': 'Import complete.',
        'data.importInvalid': 'That file is not a scratchpad backup.',
        'data.importFailed': 'Import failed',
        'tags.add': 'Add tag…',
        'tags.remove': 'Remove tag',
        'tags.all': 'All',
        'tags.filter': 'Filter by tag',
        'lightbox.close': 'Close preview',
      },
      zh: {
        'panel.title': '便签',
        'panel.subtitle': '随手记下想法；Host 持久化，Agent 也能读写。',
        'panel.version': '版本',
        'panel.new': '新建便签',
        'panel.search': '搜索便签',
        'panel.listTitle': '全部便签',
        'panel.loading': '正在加载便签…',
        'panel.empty': '还没有便签，在上面写下第一条想法吧。',
        'panel.noResults': '没有匹配的便签。',
        'panel.loadError': '无法读取便签存储，请确认插件 Host 端已加载。',
        'panel.draftRestored': '已恢复上次未保存的草稿。',
        'panel.deleted': '便签已删除，7 天内可恢复。',
        'panel.undo': '撤销',
        'panel.updatedElsewhere': '此便签刚被其他窗口或 Agent 更新。',
        'panel.localData': '数据在本机 ~/.dsh/scratchpad/。',
        'trash.title': '回收站',
        'trash.back': '返回便签',
        'trash.empty': '回收站是空的。',
        'trash.restore': '恢复',
        'trash.deleteForever': '彻底删除',
        'trash.emptyAll': '清空回收站',
        'trash.confirmEmpty': '确认全部删除？',
        'trash.expiresPrefix': '剩',
        'trash.expiresSuffix': '天自动清除',
        'todos.title': '待办',
        'todos.empty': '没有未完成的待办。在便签里写「- [ ] 事情」，就会汇总到这里。',
        'todos.openGroup': '未完成',
        'todos.doneGroup': '已完成',
        'todos.openNote': '打开便签',
        'history.title': '历史版本',
        'history.open': '查看历史版本',
        'history.restore': '恢复此版本',
        'history.empty': '还没有更早的版本。',
        'history.close': '关闭',
        'editor.placeholder': '随手记点什么…',
        'editor.image': '图片',
        'editor.file': '文件',
        'editor.chars': '字符',
        'editor.saving': '保存中…',
        'editor.saved': '已保存',
        'editor.saveFailed': '保存失败',
        'editor.rejected': '已跳过（超过 25 MB 或无法上传）：',
        'editor.conflict': '编辑期间此便签在其他地方被修改过。',
        'editor.conflictOverwrite': '保留我的版本',
        'editor.conflictAdopt': '改用已保存版本',
        'editor.foldNew': '记一条…',
        'editor.jot': '记一下',
        'editor.jotHint': '⌘/Ctrl+Enter · 结束这条并开始下一条',
        'editor.bold': '加粗',
        'editor.italic': '斜体',
        'editor.strike': '删除线',
        'editor.code': '行内代码',
        'editor.heading': '标题',
        'editor.ul': '无序列表',
        'editor.ol': '有序列表',
        'editor.table': '表格',
        'editor.mdGroup': 'Markdown 格式',
        'editor.remove': '移除附件',
        'note.pin': '置顶',
        'note.unpin': '取消置顶',
        'note.delete': '删除便签',
        'note.confirmDelete': '确认？',
        'note.untitled': '空白便签',
        'group.pinned': '置顶',
        'group.today': '今天',
        'group.yesterday': '昨天',
        'note.pinnedFlag': '置顶',
        'group.pinned': '置顶',
        'group.today': '今天',
        'group.yesterday': '昨天',
        'note.open': '打开便签',
        'note.send': '发送到对话',
        'note.attachments': '附件',
        'editor.send': '发到对话',
        'editor.preview': '预览',
        'editor.edit': '编辑',
        'editor.emptyPreview': '还没有内容可预览。',
        'editor.task': '待办',
        'shortcut.open': '打开便签',
        'shortcut.new': '新建便签',
        'shortcut.search': '搜索便签',
        'shortcut.openShort': '打开',
        'shortcut.newShort': '新建',
        'shortcut.searchShort': '搜索',
        'data.export': '导出',
        'data.exportHint': '把全部便签（含附件）导出为一个 JSON 文件。',
        'data.import': '导入',
        'data.importHint': '从 JSON 备份合并导入；同 id 的便签会被替换。',
        'data.importing': '导入中…',
        'data.imported': '导入完成。',
        'data.importInvalid': '不是有效的便签备份文件。',
        'data.importFailed': '导入失败',
        'tags.add': '添加标签…',
        'tags.remove': '移除标签',
        'tags.all': '全部',
        'tags.filter': '按标签筛选',
        'lightbox.close': '关闭预览',
      },
    };

    /** Panel styles: theme tokens only, so light and dark both follow the shell. */
    const CSS = `
    .dsh-sp{display:flex;justify-content:center;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit}
    .dsh-sp__cols{display:flex;gap:16px;flex:1;min-height:0}
    .dsh-sp__composerCol{flex:0 0 380px;display:flex;flex-direction:column;gap:10px;min-width:0;padding-bottom:20px}
    .dsh-sp__composerCol .dsh-sp__editor{flex:0 1 auto;min-height:0}
    .dsh-sp__feedCol{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;min-height:0}
    .dsh-sp__listScroll{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 0 20px}
    .dsh-sp__composerFold{display:flex;align-items:center;gap:8px;width:100%;border:1px dashed var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:12px;padding:9px 12px;font-size:12.5px;font-family:inherit;cursor:pointer}
    .dsh-sp__composerFold:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
    @media (max-width:900px){.dsh-sp__cols{flex-direction:column}.dsh-sp__composerCol{flex:none;width:auto}}
    .dsh-sp__inner{display:flex;flex-direction:column;gap:14px;width:100%;max-width:1100px;min-height:0;height:100%;padding:20px 24px 0;box-sizing:border-box}
.dsh-sp__header{flex:none;display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.dsh-sp__titles{flex:1 1 160px;min-width:0}
.dsh-sp__titleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-sp__title{margin:0;font-size:17px;font-weight:600;line-height:1.3;color:var(--dsw-alias-label-primary)}
.dsh-sp__kbd{flex:none;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 5px;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);font-family:inherit;white-space:nowrap}
.dsh-sp__version{flex:none;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);opacity:.8;font-family:inherit;white-space:nowrap}
.dsh-sp__subtitle{margin:3px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-sp__search{flex:0 1 260px;min-width:140px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font-size:13px;font-family:inherit;line-height:1.4;outline:none;transition:border-color .12s ease}
.dsh-sp__search::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}
.dsh-sp__search:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-sp__new{flex:none;display:inline-flex;align-items:center;gap:6px;border:none;border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);padding:7px 11px;font-size:12.5px;font-weight:600;font-family:inherit;line-height:1.4;cursor:pointer}
.dsh-sp__new:hover{opacity:.9}
    .dsh-sp__new:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
    .dsh-sp__jotKbd{opacity:.6;margin-left:5px;font-weight:500}
.dsh-sp__searchGroup{flex:1 1 240px;max-width:300px;min-width:170px;display:flex;align-items:center;gap:6px}
.dsh-sp__searchWrap{position:relative;flex:1 1 auto;min-width:0}
.dsh-sp__searchWrap .dsh-sp__search{width:100%}
.dsh-sp__search--kbd{padding-right:58px}
.dsh-sp__kbdIn{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none}
.dsh-sp__editor{flex:none;display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 14px;transition:border-color .12s ease}
    .dsh-sp__editor:focus-within{border-color:var(--dsw-alias-brand-primary)}
    .dsh-sp__mdGroup{display:inline-flex;align-items:center;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:2px}
    .dsh-sp__mdBtn{min-width:24px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;font-family:inherit;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}
    .dsh-sp__mdBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
    .dsh-sp__mdBtn svg{width:15px;height:15px}
.dsh-sp__editor[data-drag="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
    .dsh-sp__textarea{width:100%;box-sizing:border-box;border:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13.5px;line-height:1.65;resize:none;outline:none;flex:0 1 auto;min-height:160px;overflow-y:auto;padding:0;display:block}
    .dsh-sp__preview{width:100%;box-sizing:border-box;flex:0 1 auto;min-height:160px;overflow-y:auto;font-size:13.5px;line-height:1.65;padding:0;color:var(--dsw-alias-label-primary)}
.dsh-sp__previewEmpty{font-size:13px;color:var(--dsw-alias-label-secondary)}
.dsh-sp__mdH{margin:2px 0 6px;line-height:1.35;color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-sp__mdH1{font-size:16px}
.dsh-sp__mdH2{font-size:14.5px}
.dsh-sp__mdH3{font-size:13.5px}
.dsh-sp__mdP{margin:0 0 6px;white-space:pre-wrap;word-break:break-word}
.dsh-sp__mdList{margin:0 0 6px;padding-left:20px}
.dsh-sp__mdList li{margin:1px 0;word-break:break-word}
.dsh-sp__mdTask{display:flex;align-items:flex-start;gap:8px;margin:2px 0}
.dsh-sp__mdCheck{flex:none;margin:3px 0 0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-sp__mdTaskText{word-break:break-word}
.dsh-sp__mdTaskText[data-done="true"]{color:var(--dsw-alias-label-secondary);text-decoration:line-through}
.dsh-sp__mdPre{margin:0 0 8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.55}
.dsh-sp__mdCode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:0 4px}
.dsh-sp__mdLink{color:light-dark(#3574f0,#7da4ff);text-decoration:underline;text-underline-offset:2px;word-break:break-all}
.dsh-sp__mdLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-sp__mdQuote{margin:0 0 6px;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.dsh-sp__tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:24px}
.dsh-sp__tag{display:inline-flex;align-items:center;gap:3px;max-width:180px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 6px;font-size:11px;line-height:1.6}
.dsh-sp__tagRemove{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;line-height:1;padding:0 1px}
.dsh-sp__tagRemove:hover{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__tagInput{flex:1;min-width:110px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1.6;outline:none;padding:2px 0}
.dsh-sp__tagInput::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}
.dsh-sp__filters{flex:none;display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;padding:2px 0}
.dsh-sp__filter{flex:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 9px;font-size:11.5px;font-family:inherit;line-height:1.6;cursor:pointer;white-space:nowrap}
.dsh-sp__filter:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-sp__filter[data-active="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-sp__noteTags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
    .dsh-sp__noteTag{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:2px 8px}
.dsh-sp__textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}
.dsh-sp__tiles{display:flex;flex-wrap:wrap;gap:8px}
.dsh-sp__tile{position:relative;width:56px;height:56px;border-radius:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex:none}
.dsh-sp__tileOpen{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:none;background:transparent;padding:0;cursor:pointer;color:var(--dsw-alias-label-secondary);text-decoration:none;font-family:inherit}
.dsh-sp__tileOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-sp__tileImg{width:100%;height:100%;object-fit:cover;display:block}
.dsh-sp__tileExt{font-size:10px;font-weight:700;letter-spacing:.04em;line-height:1}
.dsh-sp__tileRemove{position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.dsh-sp__tileRemove:hover{color:var(--dsw-alias-state-error-primary)}
    .dsh-sp__bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:26px}
.dsh-sp__iconBtn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:4px 8px;font-size:12px;font-family:inherit;line-height:1.4;cursor:pointer}
.dsh-sp__iconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-sp__iconBtn:disabled{opacity:.45;cursor:default}
.dsh-sp__iconBtn:disabled:hover{background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-sp__iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-sp__barSpacer{flex:1}
.dsh-sp__textBtn{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;font-family:inherit;padding:2px 5px;border-radius:5px;cursor:pointer;text-decoration:none;white-space:nowrap}
.dsh-sp__textBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-sp__textBtn:disabled{opacity:.5;cursor:default}
.dsh-sp__textBtn:disabled:hover{background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-sp__textBtn[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__status{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-sp__status[data-error="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__notice{flex:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-sp__conflict{flex:none;display:flex;align-items:center;gap:2px;flex-wrap:wrap;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary)}
.dsh-sp__trash{flex:none;display:flex;align-items:center;gap:2px;flex-wrap:wrap;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-sp__list{display:flex;flex-direction:column;gap:10px}
    .dsh-sp__listHeader{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);padding-top:2px}
    .dsh-sp__toolbar{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:8px}
    .dsh-sp__about{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:8px 12px;display:flex;flex-direction:row;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
    .dsh-sp__aboutRow{display:flex;align-items:center;gap:8px}
    .dsh-sp__aboutNote{margin-top:2px;word-break:break-all}
.dsh-sp__note{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:9px 12px 10px;transition:border-color .12s ease}
.dsh-sp__note:hover{border-color:light-dark(#3574f0,#7da4ff)}
.dsh-sp__pinnedFlag{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:light-dark(#3574f0,#7da4ff);margin-right:auto}
.dsh-sp__noteTools{display:flex;align-items:center;gap:2px;visibility:hidden}
.dsh-sp__note:hover .dsh-sp__noteTools,.dsh-sp__note:focus-within .dsh-sp__noteTools{visibility:visible}
@media (hover:none){.dsh-sp__noteTools{visibility:visible}}
.dsh-sp__note[data-active="true"]{border-color:var(--dsw-alias-brand-primary)}
.dsh-sp__note.dsh-sp__note--pinned,.dsh-sp__note.dsh-sp__note--pinned[data-active="true"]{border-color:light-dark(#3574f0,#7da4ff);background:light-dark(#3574f00d,#7da4ff1a)}
.dsh-sp__noteTop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;min-height:24px}
.dsh-sp__noteTime{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-sp__noteTools{display:flex;align-items:center;gap:2px;visibility:hidden}
.dsh-sp__note:hover .dsh-sp__noteTools,.dsh-sp__note:focus-within .dsh-sp__noteTools{visibility:visible}
@media (hover:none){.dsh-sp__noteTools{visibility:visible}}
.dsh-sp__groupHead{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);margin:8px 0 0}
.dsh-sp__groupHead::after{content:'';flex:1;height:1px;background:var(--dsw-alias-border-l1)}
.dsh-sp__noteBtn{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;cursor:pointer;padding:0 4px;font-size:12.5px;font-family:inherit;line-height:1}
.dsh-sp__noteBtn svg{width:15px;height:15px}
.dsh-sp__noteBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-sp__noteBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-sp__noteBtn[data-pinned="true"]{color:var(--dsw-alias-brand-primary)}
.dsh-sp__noteBtn[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__noteOpen{display:block;width:100%;text-align:left;border:none;background:transparent;padding:0;color:var(--dsw-alias-label-primary);cursor:pointer;font-family:inherit}
.dsh-sp__noteOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}
.dsh-sp__noteText{margin:0;font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dsh-sp__noteText mark.dsh-sp__hit,.dsh-sp__noteTag mark.dsh-sp__hit{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label);border-radius:3px;padding:0 1px}
.dsh-sp__noteText[data-empty="true"]{color:var(--dsw-alias-label-secondary);font-style:italic}
.dsh-sp__noteAttach{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:7px}
.dsh-sp__thumb{width:30px;height:30px;border-radius:6px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;letter-spacing:.03em;color:var(--dsw-alias-label-secondary);flex:none;text-decoration:none}
.dsh-sp__thumbImg{width:100%;height:100%;object-fit:cover;display:block}
.dsh-sp__empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6;text-align:center}
.dsh-sp__emptyIcon{color:var(--dsw-alias-border-l2)}
.dsh-sp__lightbox{position:fixed;inset:0;z-index:60;background:var(--dsw-alias-bg-overlay);display:flex;align-items:center;justify-content:center;padding:44px}
.dsh-sp__lightboxImg{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;display:block}
.dsh-sp__lightboxClose{position:absolute;top:14px;right:14px;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.dsh-sp__todoNote{display:flex;flex-direction:column;gap:2px}
.dsh-sp__todoRef{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:0 0 4px;text-align:left;cursor:pointer;font-family:inherit}
.dsh-sp__todoRef:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}
.dsh-sp__todoRefText{flex:1;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-sp__todoRef:hover .dsh-sp__todoRefText{color:light-dark(#3574f0,#7da4ff)}
.dsh-sp__agentFlag{flex:none;display:inline-flex;align-items:center;font-size:10.5px;line-height:1.5;color:light-dark(#7c5cd6,#a88fff);border:1px solid currentColor;border-radius:999px;padding:0 6px}
.dsh-sp__history{flex:0 1 auto;min-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.dsh-sp__historyItem{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;background:var(--dsw-alias-bg-layer-2)}
.dsh-sp__historyMeta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dsh-sp__historyText{margin-top:2px;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.dsh-sp__mdTableWrap{margin:0 0 8px;overflow-x:auto}
.dsh-sp__mdTable{border-collapse:collapse;font-size:12.5px;line-height:1.55}
.dsh-sp__mdTable th,.dsh-sp__mdTable td{border:1px solid var(--dsw-alias-border-l1);padding:3px 8px;text-align:left;vertical-align:top;word-break:break-word}
.dsh-sp__mdTable th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
`;

    // ---------------------------------------------------------------------
    // Host API
    // ---------------------------------------------------------------------

    async function apiJson(path, init) {
      const response = await fetch(path, { cache: 'no-store', ...init });
      let body = null;
      try {
        body = await response.json();
      } catch {}
      if (!response.ok || !body || body.ok !== true) {
        const error = new Error(body?.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return body;
    }

    async function fetchSnapshot(since) {
      return apiJson(since > 0 ? API + '/notes?since=' + since : API + '/notes');
    }

    /**
     * Save one note. `baseUpdatedAt` is the updatedAt the caller last synced:
     * when provided and the stored note moved on, the Host refuses with 409 and
     * its current version. Omitting it saves unconditionally.
     */
    async function saveNoteRemote(note, baseUpdatedAt) {
      return apiJson(`${API}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(baseUpdatedAt === undefined ? { note } : { note, baseUpdatedAt }),
      });
    }

    async function deleteNoteRemote(id, permanent) {
      return apiJson(API + '/notes/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(permanent === true ? { id, permanent: true } : { id }),
      });
    }

    async function fetchTrashList(since) {
      return apiJson(since > 0 ? API + '/notes?view=trash&since=' + since : API + '/notes?view=trash');
    }

    async function emptyTrashRemote() {
      await apiJson(`${API}/notes/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emptyTrash: true }),
      });
    }

    async function uploadAttachment(file) {
      const query = new URLSearchParams({ name: file.name || 'attachment', type: file.type || '' });
      const body = await apiJson(`${API}/files?${query.toString()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: file,
      });
      return body.attachment;
    }

    const IMAGE_MAX_EDGE = 1600;
    const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
    const THUMB_EDGE = 96;

    async function decodeImage(file) {
      if (!file.type.startsWith('image/') || file.type === 'image/gif') return null;
      try {
        return await createImageBitmap(file);
      } catch {
        return null;
      }
    }

    function canvasToBlob(canvas, type, quality) {
      return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    }

    /** Downscale big pasted/dropped images to ≤1600px webp (original when no win). */
    async function compressImage(file, bitmap) {
      const decoded = bitmap || (await decodeImage(file));
      const oversized = decoded !== null && Math.max(decoded.width, decoded.height) > IMAGE_MAX_EDGE;
      if (file.size <= IMAGE_COMPRESS_THRESHOLD && !oversized) return file;
      if (!decoded) return file;
      try {
        const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(decoded.width, decoded.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
        const ctx2d = canvas.getContext('2d');
        ctx2d.fillStyle = '#ffffff';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.drawImage(decoded, 0, 0, canvas.width, canvas.height);
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
        if (!blob || blob.size >= file.size) return file;
        const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
      } catch {
        return file;
      }
    }

    /** 96px webp thumbnail for the feed tiles/thumbs. */
    async function makeThumb(file, bitmap) {
      try {
        const decoded = bitmap || (await decodeImage(file));
        if (!decoded) return null;
        const scale = Math.min(1, THUMB_EDGE / Math.max(decoded.width, decoded.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
        canvas.getContext('2d').drawImage(decoded, 0, 0, canvas.width, canvas.height);
        const blob = await canvasToBlob(canvas, 'image/webp', 0.8);
        if (!blob || blob.size === 0) return null;
        const name = (file.name || 'thumb').replace(/\.[^.]+$/, '') + '.t.webp';
        return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
      } catch {
        return null;
      }
    }

    async function deleteRemoteFile(attachment) {
      try {
        await apiJson(`${API}/files/delete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: attachment.id, storedName: attachment.storedName }),
        });
      } catch {}
    }

    function attachmentUrl(id, download, variant) {
      const query = new URLSearchParams({ id });
      if (variant === 'thumb') query.set('variant', 'thumb');
      if (download) query.set('download', '1');
      return API + '/files?' + query.toString();
    }

    // ---------------------------------------------------------------------
    // Handoff to the conversation composer
    // ---------------------------------------------------------------------

    /**
     * One-shot handoff. The panel queues the text and selects the conversation
     * panel; the session-scoped bridge in `conversation.input.left` consumes it
     * once the composer exists. An unconsumed handoff expires so a later session
     * never receives a draft the user no longer expects.
     */
    const HANDOFF_TTL = 20000;
    const composerHandoff = { text: '', attachments: [], at: 0 };

    function queueComposerText(text, attachments = []) {
      composerHandoff.text = text;
      composerHandoff.attachments = attachments;
      composerHandoff.at = Date.now();
    }

    function takeComposerText() {
      const { text, attachments, at } = composerHandoff;
      composerHandoff.text = '';
      composerHandoff.attachments = [];
      if ((text === '' && attachments.length === 0) || Date.now() - at > HANDOFF_TTL) return null;
      return { text, attachments };
    }

    /** Read one Host attachment into a browser Blob for the composer intake. */
    async function fetchScratchpadBlob(attachment) {
      try {
        const response = await fetch(`${API}/files?id=${encodeURIComponent(attachment.id)}`, { cache: 'no-store' });
        if (!response.ok) return null;
        return await response.blob();
      } catch {
        return null;
      }
    }

    /**
     * Attach Host files through the conversation's own draft-attachment path: the
     * same `createDrafts` + `addAttachments` pair the composer uses for drops and
     * pastes, so images are encoded and files staged exactly like a user upload.
     *
     * @returns draft descriptors that were added, and the attachments that were not.
     */
    async function attachConversationFiles({ attachments, sessionId, sessions, inputActions, readFile }) {
      const failed = [];
      if (!Array.isArray(attachments) || attachments.length === 0) return { attached: [], failed };
      if (sessionId === undefined || typeof inputActions?.addAttachments !== 'function') {
        return { attached: [], failed: [...attachments] };
      }
      let conversation;
      try {
        conversation = sessions?.scope?.(sessionId)?.get?.('conversation');
      } catch {}
      if (!conversation || typeof conversation.createDrafts !== 'function') {
        return { attached: [], failed: [...attachments] };
      }
      const files = [];
      for (const attachment of attachments) {
        try {
          const blob = await readFile(attachment);
          if (!blob) {
            failed.push(attachment);
            continue;
          }
          files.push(new File([blob], attachment.name || 'attachment', { type: attachment.type || blob.type || '' }));
        } catch {
          failed.push(attachment);
        }
      }
      if (files.length === 0) return { attached: [], failed };
      let drafts;
      try {
        drafts = conversation.createDrafts(sessionId, files);
      } catch {
        return { attached: [], failed: [...attachments] };
      }
      try {
        if (inputActions.addAttachments(drafts.map((draft) => draft.id)) === false) throw new Error('composer locked');
        return { attached: drafts, failed };
      } catch {
        try {
          conversation.releaseDraftAttachments?.(drafts);
        } catch {}
        return { attached: [], failed: [...attachments] };
      }
    }

    /**
     * Open an http(s) URL outside the panel. Webviews differ in how they route
     * new windows, so every link click goes through window.open explicitly
     * instead of relying on default anchor navigation.
     */
    function openExternal(url) {
      if (!/^https?:\/\//i.test(url)) return;
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {}
    }

    // ---------------------------------------------------------------------
    // Lightweight Markdown rendering (no dependencies, no raw HTML)
    // ---------------------------------------------------------------------

    /**
     * Split a plain-text chunk into text + <mark> spans around the search
     * needle (case-insensitive). No needle → the chunk passes through as-is.
     */
    function highlightNodes(chunk, needle, keyBase) {
      const source = String(chunk);
      const target = typeof needle === 'string' ? needle.trim().toLowerCase() : '';
      if (target === '') return [source];
      const lowered = source.toLowerCase();
      const parts = [];
      let cursor = 0;
      let at = lowered.indexOf(target);
      let count = 0;
      while (at >= 0) {
        if (at > cursor) parts.push(source.slice(cursor, at));
        parts.push(h('mark', { key: `${keyBase}-${count++}`, className: 'dsh-sp__hit' }, source.slice(at, at + target.length)));
        cursor = at + target.length;
        at = lowered.indexOf(target, cursor);
      }
      if (cursor < source.length) parts.push(source.slice(cursor));
      return parts;
    }

    /** Inline spans: code, bold, italic. Text stays plain React children. */
    function renderInline(text, needle) {
      const source = String(text);
      const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\)|https?:[/][/][^\s<>()\u0022\u0027\u201c\u201d\u2018\u2019\u2026\u2014\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]+)/g;
      const nodes = [];
      let cursor = 0;
      let index = 0;
      let hit = 0;
      let match;
      const pushLink = (linkUrl, label) => {
        index += 1;
        nodes.push(h('a', { key: index, className: 'dsh-sp__mdLink', href: linkUrl, target: '_blank', rel: 'noopener noreferrer', onClick: (event) => { event.preventDefault(); event.stopPropagation(); openExternal(linkUrl); } }, label));
      };
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > cursor) nodes.push(...highlightNodes(source.slice(cursor, match.index), needle, `p${hit++}`));
        const token = match[0];
        if (token.startsWith('`')) {
          nodes.push(h('code', { key: `c${index++}`, className: 'dsh-sp__mdCode' }, highlightNodes(token.slice(1, -1), needle, `c${index}${hit++}`)));
        } else if (token.startsWith('**')) {
          nodes.push(h('strong', { key: `b${index++}` }, highlightNodes(token.slice(2, -2), needle, `b${index}${hit++}`)));
        } else if (token.startsWith('~~')) {
          nodes.push(h('del', { key: `s${index++}` }, highlightNodes(token.slice(2, -2), needle, `s${index}${hit++}`)));
        } else if (token.startsWith('*')) {
          nodes.push(h('em', { key: `e${index++}` }, highlightNodes(token.slice(1, -1), needle, `e${index}${hit++}`)));
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(token);
          // Only http(s)/mailto targets become anchors; anything else stays
          // literal text so a crafted note can never script the panel.
          if (link !== null && /^(https?:[/][/]|mailto:)/i.test(link[2])) {
            pushLink(link[2], renderInline(link[1], needle));
          } else {
            nodes.push(token);
          }
        } else {
          const url = token.replace(/[.,;:!?]+$/, '');
          pushLink(url, highlightNodes(url, needle, `u${index}${hit++}`));
          if (url.length < token.length) nodes.push(token.slice(url.length));
        }
        cursor = match.index + token.length;
      }
      if (cursor < source.length) nodes.push(...highlightNodes(source.slice(cursor), needle, `p${hit++}`));
      return nodes;
    }

    /** Split a markdown table row into trimmed cells, honoring \| escapes. */
    function splitTableRow(row) {
      return row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((cellText) => cellText.replace(/\\\|/g, '|').trim());
    }

    /** GFM column alignment from a separator cell: :---, :---:, ---:. */
    function tableAlign(mark) {
      const spec = String(mark || '').trim();
      const left = spec.startsWith(':');
      const right = spec.endsWith(':');
      if (left && right) return { textAlign: 'center' };
      if (right) return { textAlign: 'right' };
      if (left) return { textAlign: 'left' };
      return null;
    }

    /**
     * Block rendering for notes. Supports headings (#..###), unordered and
     * ordered lists, task items (`- [ ]` / `- [x]`), fenced code, blockquotes,
     * GFM tables and paragraphs. Task boxes call `onToggleTask(lineIndex)`
     * with the raw source line.
     */
    function renderMarkdown(text, onToggleTask, taskLabel) {
      const lines = String(text).split('\n');
      const blocks = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (/^\s*```/.test(line)) {
          const code = [];
          const start = i;
          i += 1;
          while (i < lines.length && !/^\s*```/.test(lines[i])) {
            code.push(lines[i]);
            i += 1;
          }
          i += 1;
          blocks.push(h('pre', { key: `pre${start}`, className: 'dsh-sp__mdPre' }, h('code', null, code.join('\n'))));
          continue;
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading !== null) {
          const level = heading[1].length;
          blocks.push(h(`h${level + 1}`, {
            key: `h${i}`,
            className: `dsh-sp__mdH dsh-sp__mdH${level}`,
          }, renderInline(heading[2])));
          i += 1;
          continue;
        }
        const task = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/.exec(line);
        if (task !== null) {
          const done = task[1].toLowerCase() === 'x';
          const lineIndex = i;
          blocks.push(h('div', { key: `task${i}`, className: 'dsh-sp__mdTask' },
            h('input', {
              type: 'checkbox',
              className: 'dsh-sp__mdCheck',
              checked: done,
              'aria-label': task[2] || taskLabel,
              onChange: () => onToggleTask(lineIndex),
            }),
            h('span', {
              className: 'dsh-sp__mdTaskText',
              'data-done': done ? 'true' : 'false',
            }, renderInline(task[2]))));
          i += 1;
          continue;
        }
        const tableHeader = /^\s*\|(.+)\|\s*$/.exec(line);
        if (tableHeader !== null && i + 1 < lines.length
          && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
          const start = i;
          const headerCells = splitTableRow(tableHeader[1]);
          const alignCells = splitTableRow(lines[i + 1]);
          i += 2;
          const bodyRows = [];
          while (i < lines.length && /^\s*\|/.test(lines[i])) {
            bodyRows.push(splitTableRow(lines[i]));
            i += 1;
          }
          const alignFor = (index) => tableAlign(alignCells[index]);
          blocks.push(h('div', { key: `tbl${start}`, className: 'dsh-sp__mdTableWrap' },
            h('table', { className: 'dsh-sp__mdTable' },
              h('thead', null, h('tr', null, headerCells.map((cellText, index) => h('th', { key: index, style: alignFor(index) }, renderInline(cellText))))),
              h('tbody', null, bodyRows.map((row, rowIndex) => h('tr', { key: rowIndex },
                row.map((cellText, index) => h('td', { key: index, style: alignFor(index) }, renderInline(cellText)))))))));
          continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
          const items = [];
          const start = i;
          while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) {
            items.push(h('li', { key: `li${i}` }, renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))));
            i += 1;
          }
          blocks.push(h('ul', { key: `ul${start}`, className: 'dsh-sp__mdList' }, items));
          continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          const items = [];
          const start = i;
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
            items.push(h('li', { key: `li${i}` }, renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))));
            i += 1;
          }
          blocks.push(h('ol', { key: `ol${start}`, className: 'dsh-sp__mdList' }, items));
          continue;
        }
        if (/^\s*>\s?/.test(line)) {
          const quoted = [];
          const start = i;
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quoted.push(lines[i].replace(/^\s*>\s?/, ''));
            i += 1;
          }
          blocks.push(h('blockquote', { key: `q${start}`, className: 'dsh-sp__mdQuote' }, renderInline(quoted.join('\n'))));
          continue;
        }
        if (line.trim() === '') {
          i += 1;
          continue;
        }
        const paragraph = [];
        const start = i;
        while (i < lines.length && lines[i].trim() !== ''
          && !/^\s*(```|#{1,3}\s|[-*]\s|\d+\.\s|>\s?)/.test(lines[i])) {
          paragraph.push(lines[i]);
          i += 1;
        }
        blocks.push(h('p', { key: `p${start}`, className: 'dsh-sp__mdP' }, renderInline(paragraph.join('\n'))));
      }
      return blocks;
    }

    const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

    function decodeEntities(text) {
      return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (entity, body) => {
        if (body[0] === '#') {
          const code = (body[1] === 'x' || body[1] === 'X') ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        const named = HTML_ENTITIES[body.toLowerCase()];
        return named !== undefined ? named : entity;
      });
    }

    function attributeOf(attrs, name) {
      const match = new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attrs || '');
      if (match === null) return '';
      return match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3];
    }

    /**
     * Convert clipboard HTML to Markdown; null when the HTML carries no real
     * formatting (those pastes keep the browser's plain-text default). A small
     * self-contained tokenizer — no DOMParser — so it runs and tests in Node:
     * headings, lists, tables, fenced code, blockquotes, links, images and
     * inline marks; anything unrecognized keeps its text.
     */
    function htmlToMarkdown(html) {
      const source = String(html).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').trim();
      if (source === '' || source.length > 500000) return null;
      if (!/<(?:h[1-6]|b[\s>]|strong|i[\s>]|em[\s>]|u[\s>]|s[\s>]|strike|del[\s>]|ul[\s>]|ol[\s>]|li[\s>]|table[\s>]|pre[\s>]|blockquote|a[\s>]|img[\s>]|br[\s>])/i.test(source)) return null;

      const blocks = [];
      let inline = '';
      let quoteDepth = 0;
      let preText = null;
      let headingMark = null;
      let anchor = null;
      const lists = [];
      let table = null;
      let row = null;
      let cellTag = null;

      const squeeze = (text) => text.replace(/\s+/g, ' ');
      const emit = () => {
        const text = inline.trim();
        inline = '';
        if (text === '') return;
        const parts = text.split('\n').map((part) => part.trim()).filter((part) => part !== '');
        const top = lists[lists.length - 1];
        for (let index = 0; index < parts.length; index += 1) {
          if (top) {
            const pad = '  '.repeat(lists.length - 1);
            blocks.push(index === 0
              ? pad + (top.ordered ? top.index + '. ' : '- ') + parts[index]
              : pad + '  ' + parts[index]);
          } else {
            blocks.push('> '.repeat(quoteDepth) + parts[index]);
          }
        }
        if (top && parts.length > 0) lists[lists.length - 1].index += 1;
        if (headingMark !== null && lists.length === 0) {
          const last = blocks.length - 1;
          blocks[last] = headingMark + ' ' + blocks[last];
          headingMark = null;
        }
      };

      const renderTable = (data) => {
        const width = Math.max(1, ...data.rows.map((item) => item.cells.length));
        const line = (cells) => '| ' + cells.map((item) => item.text.replace(/\|/g, '\\|'))
          .concat(Array(Math.max(0, width - cells.length)).fill(''))
          .join(' | ') + ' |';
        const out = [line(data.rows[0].cells), '| ' + Array(width).fill('---').join(' | ') + ' |'];
        for (let index = 1; index < data.rows.length; index += 1) out.push(line(data.rows[index].cells));
        return out;
      };

      const pushText = (raw) => {
        if (raw === '') return;
        if (preText !== null) {
          preText += decodeEntities(raw);
          return;
        }
        if (table !== null && cellTag === null) return;
        inline += squeeze(decodeEntities(raw));
      };

      const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
      let cursor = 0;
      let match;
      while ((match = tagPattern.exec(source)) !== null) {
        pushText(source.slice(cursor, match.index));
        cursor = match.index + match[0].length;
        const tag = match[1].toLowerCase();
        const closing = match[0][1] === '/';
        const attrs = match[2] || '';
        if (preText !== null && !(closing && tag === 'pre')) continue;
        if (closing) {
          switch (tag) {
            case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
            case 'p': case 'div':
              emit();
              blocks.push('');
              break;
            case 'ul': case 'ol':
              emit();
              lists.pop();
              if (lists.length === 0) blocks.push('');
              break;
            case 'li':
              emit();
              break;
            case 'blockquote':
              emit();
              quoteDepth = Math.max(0, quoteDepth - 1);
              if (quoteDepth === 0) blocks.push('');
              break;
            case 'strong': case 'b': inline += '**'; break;
            case 'em': case 'i': inline += '*'; break;
            case 'del': case 's': case 'strike': inline += '~~'; break;
            case 'code': inline += '`'; break;
            case 'a': {
              const at = anchor ? anchor.at : 0;
              const href = anchor ? anchor.href : '';
              const text = inline.slice(at);
              inline = inline.slice(0, at);
              anchor = null;
              inline += /^(https?:\/\/|mailto:)/i.test(href) && text.trim() !== '' ? '[' + text + '](' + href + ')' : text;
              break;
            }
            case 'td': case 'th':
              if (table !== null && row !== null) row.cells.push({ text: squeeze(inline).trim(), header: cellTag === 'th' });
              inline = '';
              cellTag = null;
              break;
            case 'tr':
              if (table !== null && row !== null && row.cells.length > 0) table.rows.push(row);
              row = null;
              break;
            case 'table':
              if (table !== null && table.rows.length > 0) {
                blocks.push(...renderTable(table));
                blocks.push('');
              }
              table = null;
              break;
            default: break;
          }
        } else {
          switch (tag) {
            case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
              emit();
              headingMark = '#'.repeat(Math.min(Number(tag[1]), 3));
              break;
            case 'ul':
              emit();
              lists.push({ ordered: false, index: 1 });
              break;
            case 'ol':
              emit();
              lists.push({ ordered: true, index: 1 });
              break;
            case 'blockquote':
              emit();
              quoteDepth += 1;
              break;
            case 'table':
              emit();
              table = { rows: [] };
              break;
            case 'tr':
              if (table !== null) row = { cells: [] };
              break;
            case 'td': case 'th':
              cellTag = tag;
              inline = '';
              break;
            case 'pre':
              emit();
              preText = '';
              break;
            case 'a':
              anchor = { href: attributeOf(attrs, 'href'), at: inline.length };
              break;
            case 'img': {
              const src = attributeOf(attrs, 'src');
              const alt = squeeze(decodeEntities(attributeOf(attrs, 'alt')));
              if (/^https?:\/\//i.test(src)) inline += '[' + (alt || 'image') + '](' + src + ')';
              break;
            }
            case 'br':
              inline += cellTag !== null ? ' ' : '\n';
              break;
            case 'hr':
              emit();
              blocks.push('---');
              blocks.push('');
              break;
            case 'strong': case 'b': inline += '**'; break;
            case 'em': case 'i': inline += '*'; break;
            case 'del': case 's': case 'strike': inline += '~~'; break;
            case 'code': inline += '`'; break;
            default: break;
          }
        }
      }
      pushText(source.slice(cursor));
      emit();
      if (preText !== null) {
        blocks.push('```\n' + preText.replace(/\n+$/, '') + '\n```');
        preText = null;
      }
      if (table !== null && table.rows.length > 0) blocks.push(...renderTable(table));
      const markdown = blocks.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
      return markdown === '' ? null : markdown + '\n';
    }

    /** One-line-ish card excerpt: markers become glyphs instead of raw syntax. */
    /** Wrap (or unwrap) a markdown marker around text[start:end]. */
    function wrapMarkdown(text, start, end, marker) {
      const selected = text.slice(start, end);
      if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
        const inner = selected.slice(marker.length, selected.length - marker.length);
        return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
      }
      return { text: text.slice(0, start) + marker + selected + marker + text.slice(end), start: start + marker.length, end: start + marker.length + selected.length };
    }

    /**
     * Toggle a line-level marker (heading / list) across the affected lines,
     * expanded from text[start:end] to whole lines. Lines that all carry the
     * marker lose it; otherwise any existing block marker is replaced with the
     * target one. Ordered lists are numbered by position, blank lines inside a
     * multi-line selection stay blank, and the returned span covers the
     * rewritten lines so a repeated click toggles them back.
     */
    function toggleLinePrefix(text, start, end, kind) {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      let lineEnd = text.indexOf('\n', end);
      if (lineEnd < 0) lineEnd = text.length;
      const lines = text.slice(lineStart, lineEnd).split('\n');
      const blockMarker = /^\s*(?:#{1,3}\s+|[-*]\s+\[[ xX]\]\s?|[-*]\s+|\d+\.\s+)/;
      const kindMarker = {
        heading: /^\s*#{1,3}\s+/,
        ul: /^\s*[-*]\s+(?:\[[ xX]\]\s?)?/,
        task: /^\s*[-*]\s+\[[ xX]\]\s?/,
        ol: /^\s*\d+\.\s+/,
      }[kind];
      const allMarked = lines.some((line) => kindMarker.test(line))
        && lines.every((line) => line.trim() === '' || kindMarker.test(line));
      let counter = 0;
      const next = lines.map((line) => {
        if (allMarked) return line.replace(kindMarker, '');
        if (line.trim() === '' && lines.length > 1) return line;
        const bare = line.replace(blockMarker, '');
        if (kind === 'ol') return `${++counter}. ${bare}`;
        if (kind === 'task') return '- [ ] ' + bare;
        return (kind === 'heading' ? '## ' : '- ') + bare;
      });
      const body = next.join('\n');
      return { text: text.slice(0, lineStart) + body + text.slice(lineEnd), start: lineStart, end: lineStart + body.length };
    }

    function toPlainExcerpt(text) {
      return String(text).split('\n').map((line) => line
        .replace(/^\s*[-*]\s+\[([ xX])\]\s?/, (_, mark) => (mark.toLowerCase() === 'x' ? '☑ ' : '☐ '))
        .replace(/^\s*#{1,3}\s+/, '')
        .replace(/^\s*[-*]\s+/, '• ')
        .replace(/^\s*\d+\.\s+/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')).join('\n');
    }

    const TASK_LINE_PATTERN = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

    /** Every `- [ ]` / `- [x]` task line of a note, in source order. */
    function collectTasks(note) {
      const tasks = [];
      const lines = String(note.text).split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const match = TASK_LINE_PATTERN.exec(lines[index]);
        if (match !== null) tasks.push({ lineIndex: index, done: match[1].toLowerCase() === 'x', text: match[2] });
      }
      return tasks;
    }

    /** First non-task line of the note, as the group header in the to-do view. */
    function excerptOf(note) {
      const first = toPlainExcerpt(note.text).split('\n').find((line) => line.trim() !== '');
      return first ? (first.length > 60 ? first.slice(0, 60) + '…' : first) : '';
    }

    // ---------------------------------------------------------------------
    // Unsaved-draft recovery
    // ---------------------------------------------------------------------

    const DRAFT_KEY = 'dsh-scratchpad-panel:draft';

    function readDraft() {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || typeof parsed.text !== 'string') return null;
        return {
          id: typeof parsed.id === 'string' ? parsed.id : null,
          text: parsed.text,
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          pinned: parsed.pinned === true,
          createdAt: Number(parsed.createdAt) || 0,
          updatedAt: Number(parsed.updatedAt) || 0,
          baseUpdatedAt: Number(parsed.baseUpdatedAt) || 0,
          attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
        };
      } catch {
        return null;
      }
    }

    function writeDraft(note, baseUpdatedAt = 0) {
      try {
        if (!note.id && note.text.trim() === '' && note.tags.length === 0 && note.attachments.length === 0) {
          window.localStorage.removeItem(DRAFT_KEY);
          return;
        }
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
          id: note.id,
          text: note.text,
          tags: note.tags,
          pinned: note.pinned,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          baseUpdatedAt,
          attachments: note.attachments,
        }));
      } catch {}
    }

    function clearDraft() {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }

    // ---------------------------------------------------------------------
    // Focus requests and the open shortcut
    // ---------------------------------------------------------------------

    /** Set when the shortcut asks for the panel; consumed by the panel that mounts. */
    let scratchpadFocusPending = false;
    const scratchpadFocusListeners = new Set();
    /** Display text of the bindings that actually registered, per action. */
    const activeShortcutHints = { open: '', new: '', search: '' };

    function markScratchpadFocus() {
      scratchpadFocusPending = true;
      for (const listener of [...scratchpadFocusListeners]) {
        try {
          listener();
        } catch {}
      }
    }

    function takeScratchpadFocus() {
      if (!scratchpadFocusPending) return false;
      scratchpadFocusPending = false;
      return true;
    }

    function onScratchpadFocusRequest(listener) {
      scratchpadFocusListeners.add(listener);
      return () => scratchpadFocusListeners.delete(listener);
    }

    /** Set when the new-note shortcut fires; consumed by the mounted panel. */
    let scratchpadNewPending = false;
    const scratchpadNewListeners = new Set();

    function markScratchpadNew() {
      scratchpadNewPending = true;
      for (const listener of [...scratchpadNewListeners]) {
        try {
          listener();
        } catch {}
      }
    }

    function takeScratchpadNew() {
      if (!scratchpadNewPending) return false;
      scratchpadNewPending = false;
      return true;
    }

    function onScratchpadNewRequest(listener) {
      scratchpadNewListeners.add(listener);
      return () => scratchpadNewListeners.delete(listener);
    }

    /** Set when the search shortcut fires; consumed by the mounted panel. */
    let scratchpadSearchPending = false;
    const scratchpadSearchListeners = new Set();

    function markScratchpadSearch() {
      scratchpadSearchPending = true;
      for (const listener of [...scratchpadSearchListeners]) {
        try {
          listener();
        } catch {}
      }
    }

    function takeScratchpadSearch() {
      if (!scratchpadSearchPending) return false;
      scratchpadSearchPending = false;
      return true;
    }

    function onScratchpadSearchRequest(listener) {
      scratchpadSearchListeners.add(listener);
      return () => scratchpadSearchListeners.delete(listener);
    }

    function isMacPlatform() {
      try {
        return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
      } catch {
        return false;
      }
    }

    /**
     * Editable shortcut candidates, most natural first. Registration validates
     * every declared default against the reserved/conflicting tables, so a later
     * candidate is tried only when an earlier one is rejected by this host.
     */
    const OPEN_SHORTCUTS = [
      { id: 'scratchpad.open', labelKey: 'shortcut.open', slot: 'open', code: 'KeyS', modifiers: ['primary', 'shift'], mac: '⌘⇧S', other: 'Ctrl+Shift+S', web: true, titleHint: true },
      { id: 'scratchpad.open.alt-s', labelKey: 'shortcut.open', slot: 'open', code: 'KeyS', modifiers: ['primary', 'alt'], mac: '⌘⌥S', other: 'Ctrl+Alt+S', web: false },
      { id: 'scratchpad.open.alt-n', labelKey: 'shortcut.open', slot: 'open', code: 'KeyN', modifiers: ['primary', 'alt'], mac: '⌘⌥N', other: 'Ctrl+Alt+N', web: false },
    ];
    const NEW_SHORTCUTS = [
      { id: 'scratchpad.new', labelKey: 'shortcut.new', slot: 'new', code: 'KeyN', modifiers: ['primary', 'shift'], mac: '⌘⇧N', other: 'Ctrl+Shift+N', web: false, titleHint: true },
      { id: 'scratchpad.new.alt-s', labelKey: 'shortcut.new', slot: 'new', code: 'KeyS', modifiers: ['primary', 'alt', 'shift'], mac: '⌘⌥⇧S', other: 'Ctrl+Alt+Shift+S', web: false },
    ];
    const SEARCH_SHORTCUTS = [
      { id: 'scratchpad.search', labelKey: 'shortcut.search', slot: 'search', code: 'KeyF', modifiers: ['primary', 'shift'], mac: '⌘⇧F', other: 'Ctrl+Shift+F', web: false, titleHint: true },
      { id: 'scratchpad.search.alt', labelKey: 'shortcut.search', slot: 'search', code: 'KeyF', modifiers: ['primary', 'alt'], mac: '⌘⌥F', other: 'Ctrl+Alt+F', web: false },
    ];

    function shortcutCandidates(variants, t, onRun) {
      const mac = isMacPlatform();
      return variants.map((variant) => ({
        hint: mac ? variant.mac : variant.other,
        slot: variant.slot,
        titleHint: variant.titleHint === true,
        definition: {
          id: variant.id,
          label: () => t(variant.labelKey),
          aliases: ['scratchpad', 'notes', '便签', '随手记'],
          defaults: {
            'desktop:macos': { code: variant.code, modifiers: variant.modifiers },
            'desktop:windows': { code: variant.code, modifiers: variant.modifiers },
            'desktop:linux': { code: variant.code, modifiers: variant.modifiers },
            ...variant.web ? {
              'web:macos': { code: variant.code, modifiers: variant.modifiers },
              'web:windows': { code: variant.code, modifiers: variant.modifiers },
            } : {},
          },
          regions: ['page', 'editable', 'terminal'],
          modals: [],
          resolve: () => ({ status: 'handled', run: onRun }),
        },
      }));
    }

    // ---------------------------------------------------------------------
    // One-time migration of notes written by the browser-only first version
    // ---------------------------------------------------------------------

    function legacyGetAll(db, table) {
      return new Promise((resolve) => {
        try {
          const request = db.transaction(table, 'readonly').objectStore(table).getAll();
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
          request.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }

    function legacyGet(db, table, key) {
      return new Promise((resolve) => {
        try {
          const request = db.transaction(table, 'readonly').objectStore(table).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    async function legacyDatabaseExists() {
      try {
        if (typeof window.indexedDB.databases === 'function') {
          const databases = await window.indexedDB.databases();
          return Array.isArray(databases) && databases.some((database) => database && database.name === LEGACY_DB);
        }
      } catch {}
      return true;
    }

    function openLegacyDb() {
      return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(LEGACY_DB, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function migrateLegacyNotes() {
      try {
        if (window.localStorage.getItem(MIGRATION_FLAG) === '1') return;
        if (!(await legacyDatabaseExists())) {
          window.localStorage.setItem(MIGRATION_FLAG, '1');
          return;
        }
        const db = await openLegacyDb();
        try {
          const notes = await legacyGetAll(db, 'notes');
          const hasFiles = db.objectStoreNames.contains('files');
          for (const note of notes) {
            if (!note || typeof note !== 'object' || typeof note.id !== 'string') continue;
            const attachments = [];
            for (const attachment of Array.isArray(note.attachments) ? note.attachments : []) {
              const blob = hasFiles ? await legacyGet(db, 'files', attachment.id) : null;
              if (!blob) continue;
              try {
                const file = new File([blob], attachment.name || 'attachment', { type: attachment.type || blob.type || '' });
                const uploaded = await uploadAttachment(file);
                attachments.push({ ...uploaded, kind: typeof attachment.kind === 'string' ? attachment.kind : uploaded.kind });
              } catch {}
            }
            await saveNoteRemote({
              id: note.id,
              text: typeof note.text === 'string' ? note.text : '',
              pinned: note.pinned === true,
              createdAt: Number(note.createdAt) || Date.now(),
              updatedAt: Number(note.updatedAt) || Date.now(),
              attachments,
            });
          }
        } finally {
          db.close();
        }
        window.indexedDB.deleteDatabase(LEGACY_DB);
        window.localStorage.setItem(MIGRATION_FLAG, '1');
      } catch (error) {
        console.warn('[scratchpad] could not migrate the browser-local notes; they are left untouched', error);
      }
    }

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    function newId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      return `n-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function sortNotes(list) {
      return [...list].sort((left, right) => (Number(right.pinned) - Number(left.pinned)) || (right.updatedAt - left.updatedAt));
    }

    /** Trash order: most recently deleted first. */
    function sortByDeleted(list) {
      return [...list].sort((left, right) => (right.deletedAt || 0) - (left.deletedAt || 0));
    }

    function emptyEditor() {
      return { id: null, text: '', tags: [], pinned: false, createdAt: 0, updatedAt: 0, attachments: [] };
    }

    function withId(editor) {
      if (editor.id) return editor;
      const now = Date.now();
      return { ...editor, id: newId(), createdAt: now, updatedAt: now };
    }

    function copyOf(note) {
      return { ...note, attachments: Array.isArray(note.attachments) ? [...note.attachments] : [] };
    }

    function formatTime(ts) {
      if (!ts) return '';
      const date = new Date(ts);
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const clock = [pad(date.getHours()), pad(date.getMinutes())].join(':');
      const day = [pad(date.getMonth() + 1), pad(date.getDate())].join('-');
      if (date.getFullYear() !== now.getFullYear()) {
        return [date.getFullYear(), day].join('-') + ' ' + clock;
      }
      const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
      return sameDay ? clock : day + ' ' + clock;
    }

    function extensionOf(name) {
      const dot = typeof name === 'string' ? name.lastIndexOf('.') : -1;
      if (dot <= 0 || dot === name.length - 1) return 'FILE';
      return name.slice(dot + 1).toUpperCase().slice(0, 4);
    }

    function formatSize(bytes) {
      if (!bytes) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // ---------------------------------------------------------------------
    // Artwork
    // ---------------------------------------------------------------------

    function LineIcon({ size = 14, children }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: 'false',
        style: { display: 'block', flex: 'none' },
      }, children);
    }

    function PanelIcon({ size }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: 'false',
        'data-dsh-panel-entry': PANEL_ID,
        style: { display: 'block' },
      },
      h('rect', { x: 4.5, y: 3, width: 15, height: 18, rx: 2.5 }),
      h('path', { d: 'M8.5 8.5h7' }),
      h('path', { d: 'M8.5 12h7' }),
      h('path', { d: 'M8.5 15.5h4.5' }));
    }

    function PlusIcon() {
      return h(LineIcon, null, h('path', { d: 'M12 5v14' }), h('path', { d: 'M5 12h14' }));
    }

    function ImageIcon() {
      return h(LineIcon, null,
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.5 }),
        h('circle', { cx: 9, cy: 10, r: 1.6 }),
        h('path', { d: 'M4.5 17l4.7-4.4 3.4 3 3-2.6 4 4' }));
    }

    function FileIcon() {
      return h(LineIcon, null,
        h('path', { d: 'M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z' }),
        h('path', { d: 'M13.5 3.5V9H19' }),
        h('path', { d: 'M8.5 13h7' }),
        h('path', { d: 'M8.5 16.5h4.5' }));
    }

    function PinIcon() {
      return h(LineIcon, { size: 13 },
        h('path', { d: 'M9 3.5h6' }),
        h('path', { d: 'M10.5 3.5v5l-2.5 3.5h8L13.5 8.5v-5' }),
        h('path', { d: 'M12 12v8.5' }));
    }

    function TrashIcon() {
      return h(LineIcon, { size: 13 },
        h('path', { d: 'M4.5 6.5h15' }),
        h('path', { d: 'M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7' }),
        h('path', { d: 'M6.5 6.5l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12' }),
        h('path', { d: 'M10.5 10.5v6' }),
        h('path', { d: 'M13.5 10.5v6' }));
    }

    function SendIcon() {
      return h(LineIcon, { size: 13 },
        h('path', { d: 'M20.5 3.5 3.5 10.5l7 3 3 7z' }),
        h('path', { d: 'M20.5 3.5 10.5 13.5' }));
    }
    function EyeIcon() {
      return h(LineIcon, { size: 13 },
        h('path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' }),
        h('circle', { cx: 12, cy: 12, r: 3 }));
    }
    function PencilIcon() {
      return h(LineIcon, { size: 13 },
        h('path', { d: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }));
    }
    function BoldIcon() {
      return h(LineIcon, { size: 15 },
        h('path', { d: 'M6 12h9a4 4 0 0 1 0 8H7a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2h7a4 4 0 0 1 0 8' }));
    }
    function ItalicIcon() {
      return h(LineIcon, { size: 15 },
        h('path', { d: 'M19 4h-9' }),
        h('path', { d: 'M14 20H5' }),
        h('path', { d: 'm15 4-6 16' }));
    }
    function StrikethroughIcon() {
      return h(LineIcon, { size: 15 },
        h('path', { d: 'M16 4H9a3 3 0 0 0-2.83 4' }),
        h('path', { d: 'M14 12a4 4 0 0 1 0 8H6' }),
        h('path', { d: 'M4 12h16' }));
    }
    function CodeIcon() {
      return h(LineIcon, { size: 15 },
        h('path', { d: 'm16 18 6-6-6-6' }),
        h('path', { d: 'm8 6-6 6 6 6' }));
    }

    function HeadingIcon() {
      return h(LineIcon, { size: 15 },
        h('text', { x: 12, y: 16.2, fontSize: 12, fontWeight: 600, textAnchor: 'middle', fill: 'currentColor', stroke: 'none', fontFamily: 'inherit' }, 'H2'));
    }

    function ListIcon() {
      return h(LineIcon, { size: 15 },
        h('path', { d: 'M9 6h11' }),
        h('path', { d: 'M9 12h11' }),
        h('path', { d: 'M9 18h11' }),
        h('circle', { cx: 4.5, cy: 6, r: 1.1 }),
        h('circle', { cx: 4.5, cy: 12, r: 1.1 }),
        h('circle', { cx: 4.5, cy: 18, r: 1.1 }));
    }

    function ListOrderedIcon() {
      return h(LineIcon, { size: 15 },
        h('path', { d: 'M10 6h10' }),
        h('path', { d: 'M10 12h10' }),
        h('path', { d: 'M10 18h10' }),
        h('text', { x: 4.5, y: 8.8, fontSize: 8, fontWeight: 600, textAnchor: 'middle', fill: 'currentColor', stroke: 'none', fontFamily: 'inherit' }, '1'),
        h('text', { x: 4.5, y: 14.8, fontSize: 8, fontWeight: 600, textAnchor: 'middle', fill: 'currentColor', stroke: 'none', fontFamily: 'inherit' }, '2'),
        h('text', { x: 4.5, y: 20.8, fontSize: 8, fontWeight: 600, textAnchor: 'middle', fill: 'currentColor', stroke: 'none', fontFamily: 'inherit' }, '3'));
    }

    function TaskIcon() {
      return h(LineIcon, { size: 15 },
        h('rect', { x: 3.5, y: 3.5, width: 17, height: 17, rx: 3 }),
        h('path', { d: 'm8 12.2 2.6 2.6L16.4 9' }));
    }

    function TableIcon() {
      return h(LineIcon, { size: 15 },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }),
        h('path', { d: 'M3.5 9.5h17' }),
        h('path', { d: 'M3.5 14.5h17' }),
        h('path', { d: 'M12 4.5v15' }));
    }

    function EmptyIcon() {
      return h(LineIcon, { size: 34 },
        h('rect', { x: 4.5, y: 3, width: 15, height: 18, rx: 2.5 }),
        h('path', { d: 'M8.5 8.5h7' }),
        h('path', { d: 'M8.5 12h7' }),
        h('path', { d: 'M8.5 15.5h4.5' }));
    }

    function TasksIcon() {
      return h(LineIcon, { size: 34 },
        h('rect', { x: 4, y: 3.5, width: 16, height: 17, rx: 2.5 }),
        h('path', { d: 'm8 9 1.6 1.6L13 7.2' }),
        h('path', { d: 'M15.5 10H17' }),
        h('path', { d: 'm8 15.5 1.6 1.6L13 13.7' }),
        h('path', { d: 'M15.5 16.5H17' }));
    }

    // ---------------------------------------------------------------------
    // Attachments
    // ---------------------------------------------------------------------

    function AttachmentTile({ attachment, onRemove, onOpen, t }) {
      const label = attachment.kind === 'image' ? attachment.name : `${attachment.name} (${formatSize(attachment.size)})`;
      const body = attachment.kind === 'image'
        ? h('button', {
          type: 'button',
          className: 'dsh-sp__tileOpen',
          title: label,
          onClick: () => onOpen(attachment),
        }, h('img', { className: 'dsh-sp__tileImg', src: attachmentUrl(attachment.id, false, 'thumb'), alt: '', loading: 'lazy', decoding: 'async' }))
        : attachment.type === 'application/pdf'
          ? h('a', {
            className: 'dsh-sp__tileOpen',
            href: attachmentUrl(attachment.id),
            target: '_blank',
            rel: 'noopener noreferrer',
            title: label,
          }, h('span', { className: 'dsh-sp__tileExt' }, extensionOf(attachment.name)))
          : h('a', {
            className: 'dsh-sp__tileOpen',
            href: attachmentUrl(attachment.id, true),
            download: attachment.name,
            title: label,
          }, h('span', { className: 'dsh-sp__tileExt' }, extensionOf(attachment.name)));
      return h('div', { className: 'dsh-sp__tile' },
        body,
        h('button', {
          type: 'button',
          className: 'dsh-sp__tileRemove',
          'aria-label': t('editor.remove'),
          title: t('editor.remove'),
          onClick: () => onRemove(attachment),
        }, '×'));
    }

    function NoteThumb({ attachment }) {
      if (attachment.kind === 'image') {
        return h('span', { className: 'dsh-sp__thumb', title: attachment.name },
          h('img', { className: 'dsh-sp__thumbImg', src: attachmentUrl(attachment.id, false, 'thumb'), alt: '', loading: 'lazy', decoding: 'async' }));
      }
      if (attachment.type === 'application/pdf') {
        return h('a', {
          className: 'dsh-sp__thumb',
          title: `${attachment.name} (${formatSize(attachment.size)})`,
          href: attachmentUrl(attachment.id),
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: (event) => event.stopPropagation(),
        }, extensionOf(attachment.name));
      }
      return h('span', { className: 'dsh-sp__thumb', title: `${attachment.name} (${formatSize(attachment.size)})` }, extensionOf(attachment.name));
    }

    function Lightbox({ attachment, onClose, t }) {
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [onClose]);
      return h('div', {
        className: 'dsh-sp__lightbox',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': attachment.name,
        onClick: onClose,
      },
      h('img', {
        className: 'dsh-sp__lightboxImg',
        src: attachmentUrl(attachment.id),
        alt: attachment.name,
        onClick: (event) => event.stopPropagation(),
      }),
      h('button', {
        type: 'button',
        className: 'dsh-sp__lightboxClose',
        'aria-label': t('lightbox.close'),
        title: t('lightbox.close'),
        onClick: onClose,
      }, '×'));
    }

    // ---------------------------------------------------------------------
    // Composer handoff bridge
    // ---------------------------------------------------------------------

    /**
     * Session-scoped seat that owns `inputActions`. The panel cannot reach the
     * composer directly, so it queues text and switches to the conversation; this
     * invisible entry places the text once the composer for that Session exists.
     */
    function ComposerHandoffBridge(props) {
      if (typeof props.useInput !== 'function' || props.inputActions === undefined) return null;
      return h(ComposerHandoffEffect, props);
    }

    function ComposerHandoffEffect({ useInput, inputActions, sessions, getSessions, sessionId, t }) {
      const draft = useInput((state) => (state && typeof state.draft === 'string' ? state.draft : ''));
      useEffect(() => {
        const pending = takeComposerText();
        if (pending === null || inputActions === undefined) return undefined;
        let cancelled = false;
        let timer = 0;
        const insertWithRetry = (text, allowReplace, attempt = 0) => {
          if (cancelled || text === '') return;
          if (draft.trim() === '' && allowReplace) {
            inputActions.setDraft(text);
            return;
          }
          const span = inputActions.captureInsertion();
          if (inputActions.insertText(`\n\n${text}`, span)) return;
          if (attempt < 5) {
            timer = window.setTimeout(() => insertWithRetry(text, allowReplace, attempt + 1), 80);
            return;
          }
          if (allowReplace) inputActions.setDraft(`${draft.trimEnd()}\n\n${text}`);
        };
        insertWithRetry(pending.text, true);
        const attach = async () => {
          if (pending.attachments.length === 0) return;
          const resolvedSessions = typeof getSessions === 'function' ? getSessions() : sessions;
          const result = await attachConversationFiles({
            attachments: pending.attachments,
            sessionId,
            sessions: resolvedSessions,
            inputActions,
            readFile: fetchScratchpadBlob,
          });
          if (cancelled || result.failed.length === 0) return;
          // The composer could not take the files; leave their names in the draft
          // so the Agent still knows what the note carried.
          const label = typeof t === 'function' ? t('note.attachments') : 'Attachments';
          insertWithRetry(`${label}: ${result.failed.map((attachment) => attachment.name).join(', ')}`, false);
        };
        void attach();
        return () => {
          cancelled = true;
          window.clearTimeout(timer);
        };
      }, [draft, inputActions, sessionId, sessions, getSessions, t]);
      return null;
    }

    // ---------------------------------------------------------------------
    // Note card
    // ---------------------------------------------------------------------

    function NoteCard({ note, active, confirming, query, t, onOpen, onTogglePin, onRequestDelete, onSend }) {
      const needle = typeof query === 'string' ? query.trim() : '';
      const preview = toPlainExcerpt(note.text).trim();
      return h('article', { className: 'dsh-sp__note' + (note.pinned ? ' dsh-sp__note--pinned' : ''), 'data-active': active ? 'true' : 'false' },
        h('div', { className: 'dsh-sp__noteTop' },
          h('time', { className: 'dsh-sp__noteTime', dateTime: new Date(note.updatedAt).toISOString() }, formatTime(note.updatedAt)),
          note.source === 'agent' ? h('span', { className: 'dsh-sp__agentFlag' }, 'Agent') : null,
          note.pinned ? h('span', { className: 'dsh-sp__pinnedFlag' }, h(PinIcon, null), t('note.pinnedFlag')) : null,
          h('div', { className: 'dsh-sp__noteTools' },
            h('button', {
              type: 'button',
              className: 'dsh-sp__noteBtn',
              'aria-label': t('note.send'),
              title: t('note.send'),
              onClick: () => onSend(note),
            }, h(SendIcon, null)),
            h('button', {
              type: 'button',
              className: 'dsh-sp__noteBtn',
              'data-pinned': note.pinned ? 'true' : 'false',
              'aria-pressed': note.pinned ? 'true' : 'false',
              'aria-label': note.pinned ? t('note.unpin') : t('note.pin'),
              title: note.pinned ? t('note.unpin') : t('note.pin'),
              onClick: () => onTogglePin(note),
            }, h(PinIcon, null)),
            h('button', {
              type: 'button',
              className: 'dsh-sp__noteBtn',
              'data-danger': confirming ? 'true' : 'false',
              'aria-label': t('note.delete'),
              title: t('note.delete'),
              onClick: () => onRequestDelete(note),
            }, confirming ? t('note.confirmDelete') : h(TrashIcon, null)))),
        h('span', {
          className: 'dsh-sp__noteOpen',
          role: 'button',
          tabIndex: 0,
          'aria-label': t('note.open'),
          onClick: () => onOpen(note),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(note);
            }
          },
        },
        h('span', {
          className: 'dsh-sp__noteText',
          'data-empty': preview ? 'false' : 'true',
        }, preview ? renderInline(preview, needle) : t('note.untitled')),
        note.attachments.length > 0 ? h('span', { className: 'dsh-sp__noteAttach' },
          note.attachments.map((attachment) => h(NoteThumb, { key: attachment.id, attachment }))) : null,
        note.tags.length > 0 ? h('span', { className: 'dsh-sp__noteTags' },
          note.tags.map((tag) => h('span', { key: tag, className: 'dsh-sp__noteTag' }, highlightNodes(`#${tag}`, needle, `tag-${tag}`)))) : null));
    }

    function TrashCard({ note, t, onRestore, onDeleteForever }) {
      const preview = toPlainExcerpt(note.text).trim();
      const daysLeft = Math.max(1, Math.ceil(((note.deletedAt || 0) + TRASH_RETENTION_MS - Date.now()) / 86400000));
      const meta = [formatTime(note.deletedAt), t('trash.expiresPrefix') + ' ' + daysLeft + ' ' + t('trash.expiresSuffix')].join(' · ');
      return h('article', { className: 'dsh-sp__note' },
        h('div', { className: 'dsh-sp__noteTop' },
          h('time', { className: 'dsh-sp__noteTime', dateTime: new Date(note.deletedAt || 0).toISOString() }, meta),
          h('div', { className: 'dsh-sp__noteTools' },
            h('button', {
              type: 'button',
              className: 'dsh-sp__noteBtn',
              'aria-label': t('trash.restore'),
              title: t('trash.restore'),
              onClick: () => onRestore(note),
            }, t('trash.restore')),
            h('button', {
              type: 'button',
              className: 'dsh-sp__noteBtn',
              'data-danger': 'true',
              'aria-label': t('trash.deleteForever'),
              title: t('trash.deleteForever'),
              onClick: () => onDeleteForever(note),
            }, t('trash.deleteForever')))),
        h('span', {
          className: 'dsh-sp__noteText',
          'data-empty': preview ? 'false' : 'true',
        }, preview ? renderInline(preview) : t('note.untitled')));
    }

    // ---------------------------------------------------------------------
    // The page
    // ---------------------------------------------------------------------

    function PanelPage({ t, sendToConversation, shortcutHint, newHint, searchHint }) {
      const hint = typeof shortcutHint === 'function' ? shortcutHint() : '';
      const newKbd = typeof newHint === 'function' ? newHint() : '';
      const searchKbd = typeof searchHint === 'function' ? searchHint() : '';
      const [notes, setNotes] = useState([]);
      const [ready, setReady] = useState(false);
      const [loadError, setLoadError] = useState(false);
      const [loadErrorMessage, setLoadErrorMessage] = useState('');
      const [editor, setEditor] = useState(emptyEditor);
      const [saveState, setSaveState] = useState('idle');
      const [notice, setNotice] = useState('');
      /** Stored version the Host handed back on a 409, awaiting a user decision. */
      const [conflict, setConflict] = useState(null);
      /** Last soft-deleted note, kept briefly so the user can undo. */
      const [trash, setTrash] = useState(null);
      /** Which list the feed shows: live notes, the trash, or the to-do roll-up. */
      const [listView, setListView] = useState('notes');
      const trashView = listView === 'trash';
      const todoView = listView === 'todos';
      /** Soft-deleted notes, refreshed alongside the live list. */
      const [trashed, setTrashed] = useState([]);
      /** Narrow windows fold the composer into a one-line entry. */
      const [narrow, setNarrow] = useState(false);
      const [composerOpen, setComposerOpen] = useState(true);
      const [query, setQuery] = useState('');
      const [confirmId, setConfirmId] = useState(null);
      /** Two-click confirm for "empty the trash" in the list header. */
      const [confirmEmpty, setConfirmEmpty] = useState(false);
      const [dragging, setDragging] = useState(false);
      const [preview, setPreview] = useState(null);
      const [previewMode, setPreviewMode] = useState(false);
      const [importing, setImporting] = useState(false);
      const [tagDraft, setTagDraft] = useState('');
      const [selectedTag, setSelectedTag] = useState('');
      /** Whether the editor shows the note's earlier versions. */
      const [historyOpen, setHistoryOpen] = useState(false);
      /** Versions from the Host; null while loading. */
      const [historyItems, setHistoryItems] = useState(null);

      const editorRef = useRef(editor);
      /** updatedAt of the version this editor last synced with the Host; 0 = no base. */
      const baseRef = useRef(0);
      /** Store revision this panel last applied; drives conditional polls. */
      const revisionRef = useRef(0);
      const pendingRef = useRef(null);
      const dirtyRef = useRef(false);
      const timerRef = useRef(0);
      const confirmTimerRef = useRef(0);
      const trashTimerRef = useRef(0);
      const emptyTimerRef = useRef(0);
      const searchInputRef = useRef(null);
      const textareaRef = useRef(null);
      const imageInputRef = useRef(null);
      const fileInputRef = useRef(null);
      const importInputRef = useRef(null);
      const draftTimerRef = useRef(0);

      const updateEditor = useCallback((next) => {
        editorRef.current = next;
        setEditor(next);
      }, []);

      useEffect(() => {
        editorRef.current = editor;
      }, [editor]);

      const queueDraft = useCallback((note) => {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = window.setTimeout(() => writeDraft(note, baseRef.current), 250);
      }, []);

      const applyToNotes = useCallback((note) => {
        setNotes((previous) => {
          const exists = previous.some((item) => item.id === note.id);
          const merged = exists ? previous.map((item) => (item.id === note.id ? note : item)) : [...previous, note];
          return sortNotes(merged);
        });
      }, []);

      const flush = useCallback(async () => {
        const note = pendingRef.current;
        if (!note) return true;
        pendingRef.current = null;
        if (!note.id) {
          setSaveState('idle');
          return;
        }
        setSaveState('saving');
        try {
          const body = await saveNoteRemote(note, baseRef.current || undefined);
          applyToNotes(body.note);
          baseRef.current = body.note.updatedAt;
          revisionRef.current = Math.max(revisionRef.current, body.revision || 0);
          if (!pendingRef.current) {
            dirtyRef.current = false;
            window.clearTimeout(draftTimerRef.current);
            clearDraft();
          }
          setSaveState('saved');
          return true;
        } catch (error) {
          dirtyRef.current = true;
          if (error?.status === 409 && error.body?.note) {
            // Someone saved a newer version: stop retrying and surface both
            // versions instead of silently dropping either one.
            window.clearTimeout(timerRef.current);
            setConflict({ note: error.body.note });
            setSaveState('error');
            return false;
          }
          if (!pendingRef.current) pendingRef.current = note;
          setSaveState('error');
          setNotice(error instanceof Error ? error.message : String(error));
          return false;
        }
      }, [applyToNotes]);

      const scheduleSave = useCallback((note) => {
        pendingRef.current = note;
        setSaveState('saving');
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          void flush();
        }, SAVE_DELAY);
      }, [flush]);

      // Initial load: migrate the browser-only store once, then read the Host.
      useEffect(() => {
        let alive = true;
        const restoreDraft = () => {
          const draft = readDraft();
          if (draft === null) return false;
          const note = draft.id ? draft : withId(draft);
          updateEditor(note);
          baseRef.current = draft.id ? (draft.baseUpdatedAt || 0) : 0;
          dirtyRef.current = true;
          setNotice(t('panel.draftRestored'));
          if (note.id) scheduleSave(note);
          return true;
        };
        (async () => {
          await migrateLegacyNotes();
          try {
            const snapshot = await fetchSnapshot();
            if (!alive) return;
            const sorted = sortNotes(snapshot.notes);
            setNotes(sorted);
            revisionRef.current = snapshot.revision;
            setLoadError(false);
            setLoadErrorMessage('');
            void fetchTrashList().then((result) => {
              if (alive) setTrashed(sortByDeleted(result.notes));
            }).catch(() => {});
            if (!restoreDraft() && sorted.length > 0) {
              // Fresh panel entry starts an empty composer: switching to the
              // panel is a new jot, not a reopen of the newest note. Editing an
              // existing note is the card's job (openNote), never the default.
              setSaveState('idle');
            }
            setReady(true);
          } catch (error) {
            if (!alive) return;
            setLoadError(true);
            setLoadErrorMessage(error instanceof Error ? error.message : String(error));
            restoreDraft();
            setReady(true);
          }
        })();
        return () => {
          alive = false;
        };
      }, [t, updateEditor]);

      // Flush on unmount and when the page is hidden, so a switch never drops text.
      useEffect(() => {
        const onVisibility = () => {
          if (document.visibilityState === 'hidden') void flush();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          document.removeEventListener('visibilitychange', onVisibility);
          window.clearTimeout(timerRef.current);
          window.clearTimeout(confirmTimerRef.current);
          window.clearTimeout(draftTimerRef.current);
          if (dirtyRef.current) writeDraft(editorRef.current, baseRef.current);
          void flush();
        };
      }, [flush]);

      // Follow writes made elsewhere: the Agent tools, or another window.
      useEffect(() => {
        if (!ready) return undefined;
        let alive = true;
        let busy = false;
        const refresh = async () => {
          if (busy || document.visibilityState !== 'visible') return;
          busy = true;
          try {
            const since = revisionRef.current;
            const [snapshot, trashResult] = await Promise.all([fetchSnapshot(since), fetchTrashList(since)]);
            if (!alive) return;
            setLoadError(false);
            setLoadErrorMessage('');
            if (snapshot.revision === revisionRef.current) return; // nothing changed anywhere
            revisionRef.current = snapshot.revision;
            setNotes(sortNotes(snapshot.notes));
            setTrashed(sortByDeleted(trashResult.notes));
            if (pendingRef.current) {
              void flush();
              return;
            }
            const current = editorRef.current;
            if (!current.id || dirtyRef.current) return;
            const fresh = snapshot.notes.find((note) => note.id === current.id);
            if (!fresh) {
              updateEditor(emptyEditor());
              setConflict(null);
              baseRef.current = 0;
              setSaveState('idle');
              return;
            }
            if (fresh.updatedAt !== current.updatedAt || fresh.text !== current.text || fresh.pinned !== current.pinned
              || fresh.attachments.length !== current.attachments.length) {
              const contentChanged = fresh.text !== current.text || fresh.attachments.length !== current.attachments.length;
              updateEditor(copyOf(fresh));
              baseRef.current = fresh.updatedAt;
              setSaveState('saved');
              if (contentChanged) setNotice(t('panel.updatedElsewhere'));
            }
          } catch {} finally {
            busy = false;
          }
        };
        const interval = window.setInterval(refresh, POLL_DELAY);
        window.addEventListener('focus', refresh);
        return () => {
          alive = false;
          window.clearInterval(interval);
          window.removeEventListener('focus', refresh);
        };
      }, [ready, updateEditor, flush]);

      useEffect(() => {
        if (!notice) return undefined;
        const timer = window.setTimeout(() => setNotice(''), 5000);
        return () => window.clearTimeout(timer);
      }, [notice]);

      // Shortcut wake-up: focus the editor now when already mounted, or once the
      // freshly selected panel has rendered.
      const focusEditor = useCallback(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.focus();
        const end = element.value.length;
        try {
          element.setSelectionRange(end, end);
        } catch {}
      }, []);

      useEffect(() => {
        const off = onScratchpadFocusRequest(() => {
          takeScratchpadFocus();
          setPreviewMode(false);
          window.setTimeout(focusEditor, 30);
        });
        if (takeScratchpadFocus()) {
          setPreviewMode(false);
          window.setTimeout(focusEditor, 30);
        }
        return off;
      }, [focusEditor]);

      const onTextChange = useCallback((event) => {
        const text = event.target.value;
        let next = { ...editorRef.current, text, updatedAt: Date.now() };
        if (!next.id && text.trim() !== '') next = withId(next);
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        if (next.id) scheduleSave(next);
      }, [queueDraft, scheduleSave, updateEditor]);

      // A checkbox in the preview rewrites exactly that source line, so the note
      // stays plain Markdown text for the Agent and for export.
      const toggleTask = useCallback((lineIndex) => {
        const current = editorRef.current;
        const lines = current.text.split('\n');
        if (lineIndex < 0 || lineIndex >= lines.length) return;
        const match = /^(\s*[-*]\s+\[)([ xX])(\].*)$/.exec(lines[lineIndex]);
        if (match === null) return;
        lines[lineIndex] = `${match[1]}${match[2].toLowerCase() === 'x' ? ' ' : 'x'}${match[3]}`;
        let next = { ...current, text: lines.join('\n'), updatedAt: Date.now() };
        if (!next.id && next.text.trim() !== '') next = withId(next);
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        if (next.id) scheduleSave(next);
      }, [queueDraft, scheduleSave, updateEditor]);

      /**
       * Toggle a task line from the to-do view, where the note may not be open
       * in the editor. Saves against the version the list last saw; on a race
       * the toggle is reapplied onto the stored version and retried.
       */
      const toggleTaskInNote = useCallback((note, lineIndex) => {
        const rewrite = (source) => {
          const lines = source.split('\n');
          if (lineIndex < 0 || lineIndex >= lines.length) return null;
          const match = /^(\s*[-*]\s+\[)([ xX])(\].*)$/.exec(lines[lineIndex]);
          if (match === null) return null;
          lines[lineIndex] = match[1] + (match[2].toLowerCase() === 'x' ? ' ' : 'x') + match[3];
          return lines.join('\n');
        };
        const attempt = async (target, triesLeft) => {
          const text = rewrite(target.text);
          if (text === null) return;
          try {
            const body = await saveNoteRemote(Object.assign({}, target, { text, updatedAt: Date.now() }), target.updatedAt);
            applyToNotes(body.note);
            revisionRef.current = Math.max(revisionRef.current, body.revision || 0);
            if (editorRef.current.id === target.id && !dirtyRef.current) {
              updateEditor(copyOf(body.note));
              baseRef.current = body.note.updatedAt;
            }
            setSaveState('saved');
          } catch (error) {
            const stored = error?.status === 409 ? error.body?.note : null;
            if (stored && triesLeft > 0) {
              await attempt(stored, triesLeft - 1);
              return;
            }
            setSaveState('error');
            setNotice(error instanceof Error ? error.message : String(error));
          }
        };
        void attempt(note, 2);
      }, [applyToNotes, updateEditor]);

      const commitTag = useCallback(() => {
        const tag = tagDraft.replace(/\s+/g, ' ').trim().slice(0, 32);
        setTagDraft('');
        if (tag === '') return;
        const current = editorRef.current;
        if (current.tags.length >= 12) return;
        if (current.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
        let next = { ...current, tags: [...current.tags, tag], updatedAt: Date.now() };
        if (!next.id) next = withId(next);
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        if (next.id) scheduleSave(next);
      }, [queueDraft, scheduleSave, tagDraft, updateEditor]);

      const removeTag = useCallback((tag) => {
        const current = editorRef.current;
        if (!current.tags.includes(tag)) return;
        const next = { ...current, tags: current.tags.filter((item) => item !== tag), updatedAt: Date.now() };
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        if (next.id) scheduleSave(next);
      }, [queueDraft, scheduleSave, updateEditor]);

      const addFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        let current = editorRef.current;
        if (!current.id) current = withId(current);
        const rejected = [];
        const accepted = [];
        for (const file of files) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            rejected.push(file.name || 'attachment');
            continue;
          }
          let thumbName = null;
          let uploadFile = file;
          try {
            const bitmap = await decodeImage(file);
            if (bitmap) {
              uploadFile = await compressImage(file, bitmap);
              const thumbBlob = await makeThumb(file, bitmap);
              bitmap.close();
              if (thumbBlob) {
                const thumb = await uploadAttachment(thumbBlob);
                thumbName = thumb.storedName;
              }
            }
          } catch {
            // 压缩/缩略图失败不阻塞上传——回退到原图
          }
          try {
            const uploaded = await uploadAttachment(uploadFile);
            accepted.push({ ...uploaded, thumbName: thumbName || null });
          } catch {
            rejected.push(file.name || 'attachment');
          }
        }
        if (accepted.length > 0) {
          current = { ...current, attachments: [...current.attachments, ...accepted], updatedAt: Date.now() };
          dirtyRef.current = true;
          updateEditor(current);
          queueDraft(current);
          scheduleSave(current);
        }
        setNotice(rejected.length > 0 ? `${t('editor.rejected')} ${rejected.join(', ')}` : '');
      }, [scheduleSave, t, updateEditor]);

      const removeAttachment = useCallback((attachment) => {
        const current = editorRef.current;
        const next = { ...current, attachments: current.attachments.filter((item) => item.id !== attachment.id), updatedAt: Date.now() };
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        if (next.id) scheduleSave(next);
        void deleteRemoteFile(attachment);
      }, [queueDraft, scheduleSave, updateEditor]);

      const startDraft = useCallback(async () => {
        const saved = await flush();
        if (saved) clearDraft();
        dirtyRef.current = false;
        setConflict(null);
        baseRef.current = 0;
        updateEditor(emptyEditor());
        setSaveState('idle');
        setPreviewMode(false);
        setHistoryOpen(false);
        setTagDraft('');
        setComposerOpen(true);
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      }, [flush, updateEditor]);

      // New-note shortcut: consumed here when mounted, or once the panel mounts.
      useEffect(() => {
        const off = onScratchpadNewRequest(() => {
          if (takeScratchpadNew()) void startDraft();
        });
        if (takeScratchpadNew()) void startDraft();
        return off;
      }, [startDraft]);

      /** Search shortcut: focus and select the search box. */
      const focusSearchInput = useCallback(() => {
        const element = searchInputRef.current;
        if (!element) return;
        element.focus();
        try {
          element.select();
        } catch {}
      }, []);

      // Search shortcut: consumed here when mounted, or once the panel mounts.
      useEffect(() => {
        const off = onScratchpadSearchRequest(() => {
          if (takeScratchpadSearch()) focusSearchInput();
        });
        if (takeScratchpadSearch()) focusSearchInput();
        return off;
      }, [focusSearchInput]);

      // Narrow windows fold the composer; it reopens for new notes and edits.
      useEffect(() => {
        const query = window.matchMedia('(max-width: 900px)');
        const apply = () => {
          setNarrow(query.matches);
          if (query.matches) {
            const current = editorRef.current;
            if (current.text.trim() === '' && current.tags.length === 0 && current.attachments.length === 0) setComposerOpen(false);
          } else {
            setComposerOpen(true);
          }
        };
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
      }, []);

      const openNote = useCallback(async (note) => {
        if (editorRef.current.id === note.id) {
          textareaRef.current?.focus();
          return;
        }
        const saved = await flush();
        if (saved) clearDraft();
        dirtyRef.current = false;
        setConflict(null);
        setHistoryOpen(false);
        updateEditor(copyOf(note));
        baseRef.current = note.updatedAt;
        setSaveState('saved');
        setTagDraft('');
        setComposerOpen(true);
        textareaRef.current?.focus();
      }, [flush, updateEditor]);

      /** Overwrite the stored version with what is in the editor right now. */
      const resolveOverwrite = useCallback(() => {
        const current = editorRef.current;
        setConflict(null);
        if (!current.id) return;
        const next = { ...current, updatedAt: Date.now() };
        window.clearTimeout(timerRef.current);
        pendingRef.current = null;
        dirtyRef.current = true;
        updateEditor(next);
        setSaveState('saving');
        void saveNoteRemote(next)
          .then((body) => {
            applyToNotes(body.note);
            baseRef.current = body.note.updatedAt;
            revisionRef.current = Math.max(revisionRef.current, body.revision || 0);
            dirtyRef.current = false;
            window.clearTimeout(draftTimerRef.current);
            clearDraft();
            setSaveState('saved');
          })
          .catch((error) => {
            setSaveState('error');
            setNotice(error instanceof Error ? error.message : String(error));
          });
      }, [applyToNotes, updateEditor]);

      /** Drop the local edits and take over the version the Host handed back. */
      const resolveAdopt = useCallback(() => {
        const stored = conflict?.note;
        setConflict(null);
        if (!stored) return;
        pendingRef.current = null;
        window.clearTimeout(timerRef.current);
        dirtyRef.current = false;
        window.clearTimeout(draftTimerRef.current);
        clearDraft();
        updateEditor(copyOf(stored));
        baseRef.current = stored.updatedAt;
        setSaveState('saved');
      }, [conflict, updateEditor]);

      const togglePin = useCallback((note) => {
        const next = { ...note, pinned: !note.pinned };
        setNotes((previous) => sortNotes(previous.map((item) => (item.id === note.id ? next : item))));
        if (editorRef.current.id === note.id) updateEditor({ ...editorRef.current, pinned: next.pinned });
        // A pin flip rewrites the whole note, so save it against the version it
        // was read from; on a race, rebase onto the stored version and retry,
        // so pinning never clobbers text changed elsewhere.
        const attempt = async (target, triesLeft) => {
          try {
            const body = await saveNoteRemote({ ...target, pinned: !target.pinned }, target.updatedAt);
            applyToNotes(body.note);
            revisionRef.current = Math.max(revisionRef.current, body.revision || 0);
            if (editorRef.current.id === target.id) {
              updateEditor({ ...editorRef.current, pinned: body.note.pinned });
              baseRef.current = body.note.updatedAt;
            }
            setSaveState('saved');
          } catch (error) {
            const stored = error?.status === 409 ? error.body?.note : null;
            if (stored && triesLeft > 0) {
              await attempt(stored, triesLeft - 1);
              return;
            }
            setSaveState('error');
            setNotice(error instanceof Error ? error.message : String(error));
          }
        };
        void attempt(note, 2);
      }, [applyToNotes, updateEditor]);

      const requestDelete = useCallback((note) => {
        if (confirmId !== note.id) {
          setConfirmId(note.id);
          window.clearTimeout(confirmTimerRef.current);
          confirmTimerRef.current = window.setTimeout(() => setConfirmId(null), 3000);
          return;
        }
        window.clearTimeout(confirmTimerRef.current);
        setConfirmId(null);
        if (pendingRef.current && pendingRef.current.id === note.id) {
          pendingRef.current = null;
          window.clearTimeout(timerRef.current);
        }
        void (async () => {
          await flush();
          try {
            await deleteNoteRemote(note.id);
          } catch (error) {
            setSaveState('error');
            setNotice(error instanceof Error ? error.message : String(error));
            return;
          }
          setNotes((previous) => previous.filter((item) => item.id !== note.id));
          if (editorRef.current.id === note.id) {
            dirtyRef.current = false;
            setConflict(null);
            baseRef.current = 0;
            updateEditor(emptyEditor());
            setSaveState('idle');
          }
          setTrash({ note });
          window.clearTimeout(trashTimerRef.current);
          trashTimerRef.current = window.setTimeout(() => setTrash(null), UNDO_DELAY_MS);
        })();
      }, [confirmId, flush, updateEditor]);

      /** Undo: re-save the stored copy; soft-deleted notes and their files remain. */
      /**
       * Bring a soft-deleted note back: re-save it (the Host keeps it until
       * purged), then resync the list from an authoritative snapshot so an
       * in-flight poll can never wipe the restored note back out.
       */
      const restoreNote = useCallback((restore) => {
        void (async () => {
          try {
            const body = await saveNoteRemote(restore);
            applyToNotes(body.note);
            const snapshot = await fetchSnapshot();
            setNotes(sortNotes(snapshot.notes));
            revisionRef.current = snapshot.revision;
            setTrashed(sortByDeleted((await fetchTrashList()).notes));
            setSaveState('saved');
          } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
          }
        })();
      }, [applyToNotes]);

      const undoDelete = useCallback(() => {
        const restore = trash?.note;
        window.clearTimeout(trashTimerRef.current);
        setTrash(null);
        if (!restore) return;
        restoreNote(restore);
      }, [restoreNote, trash]);

      /** Hard-delete a trashed note and its files right away. */
      const deleteForever = useCallback((note) => {
        void (async () => {
          try {
            await deleteNoteRemote(note.id, true);
            setTrashed((previous) => previous.filter((item) => item.id !== note.id));
          } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
          }
        })();
      }, []);

      /** Two-click confirm, then hard-delete every trashed note and its files. */
      const emptyTrash = useCallback(() => {
        if (!confirmEmpty) {
          setConfirmEmpty(true);
          window.clearTimeout(emptyTimerRef.current);
          emptyTimerRef.current = window.setTimeout(() => setConfirmEmpty(false), 3000);
          return;
        }
        window.clearTimeout(emptyTimerRef.current);
        setConfirmEmpty(false);
        void (async () => {
          try {
            await emptyTrashRemote();
            setTrashed([]);
            // The undo banner would resurrect a note the user just emptied away.
            window.clearTimeout(trashTimerRef.current);
            setTrash(null);
          } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
          }
        })();
      }, [confirmEmpty]);

      const onDrop = useCallback((event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        setDragging(false);
        void addFiles(event.dataTransfer.files);
      }, [addFiles]);

      const onDragOver = useCallback((event) => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }, []);

      const onDragLeave = useCallback((event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragging(false);
      }, []);

      /** Apply a markdown edit result and restore focus + selection. */
      const applyMarkdownEdit = useCallback((result) => {
        const element = textareaRef.current;
        const next = withId({ ...editorRef.current, text: result.text, updatedAt: Date.now() });
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        if (next.id) scheduleSave(next);
        if (element) {
          element.focus();
          try {
            element.setSelectionRange(result.start, result.end);
          } catch {}
        }
      }, [queueDraft, scheduleSave, updateEditor]);

      /** Wrap the textarea selection in a markdown marker (toolbar / ⌘B / ⌘I). */
      const wrapSelection = useCallback((marker) => {
        const element = textareaRef.current;
        if (!element) return;
        const start = typeof element.selectionStart === 'number' ? element.selectionStart : element.value.length;
        const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : start;
        applyMarkdownEdit(wrapMarkdown(element.value, start, end, marker));
      }, [applyMarkdownEdit]);

      /** Toggle a line-level marker (H2 / lists) across the affected lines. */
      const toggleBlock = useCallback((kind) => {
        const element = textareaRef.current;
        if (!element) return;
        const start = typeof element.selectionStart === 'number' ? element.selectionStart : element.value.length;
        const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : start;
        applyMarkdownEdit(toggleLinePrefix(element.value, start, end, kind));
      }, [applyMarkdownEdit]);

      /** Insert an empty 3-column table skeleton at the caret. */
      const insertTable = useCallback(() => {
        const element = textareaRef.current;
        const value = element ? element.value : editorRef.current.text;
        const start = element && typeof element.selectionStart === 'number' ? element.selectionStart : value.length;
        const end = element && typeof element.selectionEnd === 'number' ? element.selectionEnd : start;
        const before = value.slice(0, start);
        const lead = before !== '' && !before.endsWith('\n') ? '\n' : '';
        const skeleton = '|  |  |  |\n| --- | --- | --- |\n|  |  |  |';
        const head = before + lead;
        applyMarkdownEdit({ text: head + skeleton + value.slice(end), start: head.length + skeleton.length, end: head.length + skeleton.length });
      }, [applyMarkdownEdit]);

      /** Fetch and show the earlier texts the Host kept for the open note. */
      const openHistory = useCallback(async () => {
        const id = editorRef.current.id;
        if (!id) return;
        setHistoryOpen(true);
        setHistoryItems(null);
        try {
          const body = await apiJson(API + '/notes/history?id=' + encodeURIComponent(id));
          setHistoryItems(Array.isArray(body.history) ? body.history : []);
        } catch (error) {
          setHistoryItems([]);
          setNotice(error instanceof Error ? error.message : String(error));
        }
      }, []);

      /** Put an old version back into the editor; the normal save flow takes over. */
      const restoreHistoryVersion = useCallback((entry) => {
        const current = editorRef.current;
        if (!current.id || entry === null || typeof entry !== 'object' || typeof entry.text !== 'string') return;
        const next = { ...current, text: entry.text, updatedAt: Date.now() };
        dirtyRef.current = true;
        updateEditor(next);
        queueDraft(next);
        scheduleSave(next);
        setPreviewMode(false);
        setHistoryOpen(false);
      }, [queueDraft, scheduleSave, updateEditor]);

      /**
       * Paste: images upload as attachments; rich HTML converts to Markdown
       * (htmlToMarkdown declines plain-looking HTML, which then pastes as
       * usual through the browser default).
       */
      const onPaste = useCallback((event) => {
        const files = Array.from(event.clipboardData?.files || []);
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length > 0) {
          event.preventDefault();
          void addFiles(images);
          return;
        }
        const html = event.clipboardData ? event.clipboardData.getData('text/html') : '';
        if (html === '') return;
        const markdown = htmlToMarkdown(html);
        if (markdown === null) return;
        event.preventDefault();
        const element = textareaRef.current;
        const value = element ? element.value : editorRef.current.text;
        const start = element && typeof element.selectionStart === 'number' ? element.selectionStart : value.length;
        const end = element && typeof element.selectionEnd === 'number' ? element.selectionEnd : start;
        applyMarkdownEdit({ text: value.slice(0, start) + markdown + value.slice(end), start: start + markdown.length, end: start + markdown.length });
      }, [addFiles, applyMarkdownEdit]);

      /**
       * Auto-grow the textarea with its content (short notes keep the composer
       * compact). The flex column caps the card and compresses the textarea
       * back into an internal scroller once the content outgrows the column,
       * so long-form writing still scrolls in place.
       */
      const autoGrow = useCallback(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
      }, []);

      useLayoutEffect(() => {
        autoGrow();
        window.addEventListener('resize', autoGrow);
        return () => window.removeEventListener('resize', autoGrow);
      }, [autoGrow, editor.text, previewMode, composerOpen, narrow]);

      const onEditorKeyDown = useCallback((event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          void startDraft();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && (event.key === 'b' || event.key === 'i')) {
          event.preventDefault();
          wrapSelection(event.key === 'b' ? '**' : '*');
        }
      }, [startDraft, wrapSelection]);

      /** ⌘/Ctrl-click opens the URL under the caret without leaving edit mode. */
      const onEditorClick = useCallback((event) => {
        if (!(event.metaKey || event.ctrlKey)) return;
        const area = event.currentTarget;
        const caret = typeof area.selectionStart === 'number' ? area.selectionStart : 0;
        const before = /(\S+)$/.exec(area.value.slice(0, caret));
        const after = /^(\S+)/.exec(area.value.slice(caret));
        const token = (before ? before[1] : '') + (after ? after[1] : '');
        if (/^https?:\/\//i.test(token)) openExternal(token.replace(/[.,;:!?]+$/, ''));
      }, []);

      const sendToChat = useCallback((note) => {
        if (!note || (note.text.trim() === '' && note.attachments.length === 0)) return;
        const text = note.text.trim() === '' ? '' : note.text;
        queueComposerText(text, note.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
        })));
        sendToConversation();
      }, [sendToConversation]);

      const importBackup = useCallback(async (fileList) => {
        const file = fileList && fileList[0];
        if (!file) return;
        setImporting(true);
        try {
          let document;
          try {
            document = JSON.parse(await file.text());
          } catch {
            setNotice(t('data.importInvalid'));
            return;
          }
          await apiJson(`${API}/import`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'merge', document }),
          });
          const snapshot = await fetchSnapshot();
          setNotes(sortNotes(snapshot.notes));
          const current = editorRef.current;
          const fresh = current.id ? snapshot.notes.find((note) => note.id === current.id) : undefined;
          if (fresh && !dirtyRef.current) {
            updateEditor(copyOf(fresh));
            baseRef.current = fresh.updatedAt;
            setSaveState('saved');
          }
          revisionRef.current = snapshot.revision;
          setNotice(t('data.imported'));
        } catch (error) {
          setNotice(`${t('data.importFailed')}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setImporting(false);
        }
      }, [t, updateEditor]);

      const allTags = useMemo(() => {
        const counts = new Map();
        for (const note of notes) {
          for (const tag of note.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
        }
        return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
      }, [notes]);

      useEffect(() => {
        if (selectedTag !== '' && !allTags.some(([tag]) => tag === selectedTag)) setSelectedTag('');
      }, [allTags, selectedTag]);

      const visibleNotes = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return notes
          .filter((note) => selectedTag === '' || note.tags.includes(selectedTag))
          .filter((note) => needle === ''
            || note.text.toLowerCase().includes(needle)
            || note.tags.some((tag) => tag.toLowerCase().includes(needle))
            || note.attachments.some((attachment) => attachment.name.toLowerCase().includes(needle)));
      }, [notes, query, selectedTag]);

      /** Open `- [ ]` count across live notes; the badge on the to-dos tab. */
      const openTaskCount = useMemo(() => notes.reduce(
        (total, note) => total + collectTasks(note).filter((task) => !task.done).length,
        0,
      ), [notes]);

      /** To-do roll-up groups: one per note that has tasks, newest note first. */
      const todoGroups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return notes
          .filter((note) => selectedTag === '' || note.tags.includes(selectedTag))
          .map((note) => ({ note, tasks: collectTasks(note).filter((task) => needle === '' || task.text.toLowerCase().includes(needle)) }))
          .filter((group) => group.tasks.length > 0)
          .sort((left, right) => right.note.updatedAt - left.note.updatedAt);
      }, [notes, query, selectedTag]);

      const statusLabel = (() => {
        if (saveState === 'saving') return t('editor.saving');
        if (saveState === 'saved') return t('editor.saved');
        if (saveState === 'error') return t('editor.saveFailed');
        return '';
      })();

      const toolsBar = h('div', { className: 'dsh-sp__bar' },
        h('button', {
          type: 'button',
          className: 'dsh-sp__iconBtn',
          title: previewMode ? t('editor.edit') : t('editor.preview'),
          'aria-label': previewMode ? t('editor.edit') : t('editor.preview'),
          'aria-pressed': previewMode ? 'true' : 'false',
          onClick: () => setPreviewMode((value) => !value),
        }, previewMode ? h(PencilIcon, null) : h(EyeIcon, null)),
        !previewMode ? h('span', { className: 'dsh-sp__mdGroup', role: 'group', 'aria-label': t('editor.mdGroup') },
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.bold') + ' (⌘B)',
            'aria-label': t('editor.bold'),
            onClick: () => wrapSelection('**'),
          }, h(BoldIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.italic') + ' (⌘I)',
            'aria-label': t('editor.italic'),
            onClick: () => wrapSelection('*'),
          }, h(ItalicIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.strike'),
            'aria-label': t('editor.strike'),
            onClick: () => wrapSelection('~~'),
          }, h(StrikethroughIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.code'),
            'aria-label': t('editor.code'),
            onClick: () => wrapSelection('`'),
          }, h(CodeIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.heading'),
            'aria-label': t('editor.heading'),
            onClick: () => toggleBlock('heading'),
          }, h(HeadingIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.ul'),
            'aria-label': t('editor.ul'),
            onClick: () => toggleBlock('ul'),
          }, h(ListIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.ol'),
            'aria-label': t('editor.ol'),
            onClick: () => toggleBlock('ol'),
          }, h(ListOrderedIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.task'),
            'aria-label': t('editor.task'),
            onClick: () => toggleBlock('task'),
          }, h(TaskIcon, null)),
          h('button', {
            type: 'button',
            className: 'dsh-sp__mdBtn',
            title: t('editor.table'),
            'aria-label': t('editor.table'),
            onClick: insertTable,
          }, h(TableIcon, null))) : null,
        h('button', {
          type: 'button',
          className: 'dsh-sp__iconBtn',
          title: t('editor.image'),
          'aria-label': t('editor.image'),
          onClick: () => imageInputRef.current?.click(),
        }, h(ImageIcon, null)),
        h('button', {
          type: 'button',
          className: 'dsh-sp__iconBtn',
          title: t('editor.file'),
          'aria-label': t('editor.file'),
          onClick: () => fileInputRef.current?.click(),
        }, h(FileIcon, null)),
        h('button', {
          type: 'button',
          className: 'dsh-sp__iconBtn',
          title: t('editor.send'),
          'aria-label': t('editor.send'),
          disabled: editor.text.trim() === '' && editor.attachments.length === 0,
          onClick: () => sendToChat(editor),
        }, h(SendIcon, null)));

      const statusBar = h('div', { className: 'dsh-sp__bar' },
        h('span', { className: 'dsh-sp__status', 'data-error': saveState === 'error' ? 'true' : 'false' },
          t('editor.chars') + ' ' + editor.text.length + (statusLabel ? ' · ' + statusLabel : '')),
        editor.id ? h('button', {
          type: 'button',
          className: 'dsh-sp__textBtn',
          title: t('history.open'),
          'aria-label': t('history.open'),
          onClick: () => { void openHistory(); },
        }, t('history.title')) : null,
        h('span', { className: 'dsh-sp__barSpacer' }),
        h('button', {
          type: 'button',
          className: 'dsh-sp__new',
          title: t('editor.jotHint'),
          onClick: () => { void startDraft(); },
        }, t('editor.jot'), h('span', { className: 'dsh-sp__jotKbd' }, isMacPlatform() ? '⌘↵' : 'Ctrl+↵')));

      const historyBody = h('div', { className: 'dsh-sp__history' },
        h('div', { className: 'dsh-sp__bar' },
          h('span', { className: 'dsh-sp__status' }, t('history.title')),
          h('span', { className: 'dsh-sp__barSpacer' }),
          h('button', {
            type: 'button',
            className: 'dsh-sp__textBtn',
            onClick: () => setHistoryOpen(false),
          }, t('history.close'))),
        historyItems === null
          ? h('span', { className: 'dsh-sp__previewEmpty' }, t('panel.loading'))
          : historyItems.length === 0
            ? h('span', { className: 'dsh-sp__previewEmpty' }, t('history.empty'))
            : historyItems.map((entry, index) => h('div', { key: entry.updatedAt + '-' + index, className: 'dsh-sp__historyItem' },
              h('div', { className: 'dsh-sp__historyMeta' },
                h('time', { dateTime: new Date(entry.updatedAt).toISOString() }, formatTime(entry.updatedAt)),
                h('button', {
                  type: 'button',
                  className: 'dsh-sp__textBtn',
                  onClick: () => restoreHistoryVersion(entry),
                }, t('history.restore'))),
              h('div', { className: 'dsh-sp__historyText' }, toPlainExcerpt(entry.text).trim() || t('note.untitled')))));

      const editorBody = historyOpen && editor.id ? historyBody : previewMode
        ? h('div', {
          className: 'dsh-sp__preview',
          role: 'region',
          'aria-label': t('editor.preview'),
        }, editor.text.trim() === ''
          ? h('span', { className: 'dsh-sp__previewEmpty' }, t('editor.emptyPreview'))
          : renderMarkdown(editor.text, toggleTask, t('editor.task')))
        : h('textarea', {
          ref: textareaRef,
          className: 'dsh-sp__textarea',
          value: editor.text,
          placeholder: t('editor.placeholder'),
          'aria-label': t('panel.title'),
          spellCheck: false,
          onChange: onTextChange,
          onPaste,
          onClick: onEditorClick,
          onKeyDown: onEditorKeyDown,
          onBlur: () => { void flush(); },
        });

      const composerCard = h('section', {
        className: 'dsh-sp__editor',
        'data-drag': dragging ? 'true' : 'false',
      },
        toolsBar,
        editorBody,
        editor.attachments.length > 0 ? h('div', { className: 'dsh-sp__tiles' },
          editor.attachments.map((attachment) => h(AttachmentTile, {
            key: attachment.id,
            attachment,
            t,
            onRemove: removeAttachment,
            onOpen: setPreview,
          }))) : null,
        h('div', { className: 'dsh-sp__tags' },
          editor.tags.map((tag) => h('span', { key: 'tag-' + tag, className: 'dsh-sp__tag' },
            tag,
            h('button', {
              type: 'button',
              className: 'dsh-sp__tagRemove',
              'aria-label': t('tags.remove') + ': ' + tag,
              title: t('tags.remove'),
              onClick: () => removeTag(tag),
            }, '×'))),
          h('input', {
            className: 'dsh-sp__tagInput',
            value: tagDraft,
            placeholder: t('tags.add'),
            'aria-label': t('tags.add'),
            list: 'dsh-scratchpad-tag-options',
            onChange: (event) => setTagDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                commitTag();
              } else if (event.key === 'Backspace' && tagDraft === '' && editor.tags.length > 0) {
                removeTag(editor.tags[editor.tags.length - 1]);
              }
            },
          }),
          h('datalist', { id: 'dsh-scratchpad-tag-options' },
            allTags.map(([tag]) => h('option', { key: tag, value: tag })))),
        statusBar,
        notice ? h('div', { className: 'dsh-sp__notice', role: 'status' }, notice) : null,
        conflict ? h('div', { className: 'dsh-sp__conflict', role: 'alert' },
          h('span', null, t('editor.conflict')),
          h('button', {
            type: 'button',
            className: 'dsh-sp__textBtn',
            onClick: resolveOverwrite,
          }, t('editor.conflictOverwrite')),
          h('button', {
            type: 'button',
            className: 'dsh-sp__textBtn',
            onClick: resolveAdopt,
          }, t('editor.conflictAdopt'))) : null,
        h('input', {
          ref: imageInputRef,
          type: 'file',
          accept: 'image/*',
          multiple: true,
          hidden: true,
          onChange: (event) => {
            void addFiles(event.target.files);
            event.target.value = '';
          },
        }),
        h('input', {
          ref: fileInputRef,
          type: 'file',
          multiple: true,
          hidden: true,
          onChange: (event) => {
            void addFiles(event.target.files);
            event.target.value = '';
          },
        }));

      const aboutCard = h('div', { className: 'dsh-sp__about' },
        h('div', { className: 'dsh-sp__aboutRow' },
          h('kbd', { className: 'dsh-sp__kbd' }, hint || '⌘⇧S'), h('span', null, t('shortcut.openShort'))),
        h('div', { className: 'dsh-sp__aboutRow' },
          h('kbd', { className: 'dsh-sp__kbd' }, newKbd || '⌘⇧N'), h('span', null, t('shortcut.newShort'))),
        h('div', { className: 'dsh-sp__aboutRow' },
          h('kbd', { className: 'dsh-sp__kbd' }, searchKbd || '⌘⇧F'), h('span', null, t('shortcut.searchShort'))),
        h('div', { className: 'dsh-sp__aboutRow' },
          h('kbd', { className: 'dsh-sp__kbd' }, isMacPlatform() ? '⌘↵' : 'Ctrl+↵'), h('span', null, t('editor.jot'))),
        h('div', { className: 'dsh-sp__aboutNote' }, t('panel.localData')));

      const feedChildren = [
        loadError ? h('div', { className: 'dsh-sp__notice', role: 'alert' },
          t('panel.loadError') + (loadErrorMessage ? ' (' + loadErrorMessage + ')' : '')) : null,
      ];
      if (!ready) {
        feedChildren.push(h('div', { className: 'dsh-sp__empty' }, t('panel.loading')));
      } else {
        feedChildren.push(trash ? h('div', { className: 'dsh-sp__trash', role: 'status' },
          h('span', null, t('panel.deleted')),
          h('button', { type: 'button', className: 'dsh-sp__textBtn', onClick: undoDelete }, t('panel.undo'))) : null);
        const toolbar = h('div', { className: 'dsh-sp__toolbar' },
          h('div', { className: 'dsh-sp__listHeader' },
            h('span', null, trashView ? t('trash.title') : todoView ? t('todos.title') : t('panel.listTitle')),
            h('span', null, String(trashView ? trashed.length : todoView ? openTaskCount : visibleNotes.length)),
            h('span', { className: 'dsh-sp__barSpacer' }),
            listView === 'notes' ? h('a', {
              className: 'dsh-sp__textBtn',
              href: API + '/export?attachments=1',
              title: t('data.exportHint'),
            }, t('data.export')) : null,
            listView === 'notes' ? h('button', {
              type: 'button',
              className: 'dsh-sp__textBtn',
              title: t('data.importHint'),
              disabled: importing,
              onClick: () => importInputRef.current?.click(),
            }, importing ? t('data.importing') : t('data.import')) : null,
            trashView && trashed.length > 0 ? h('button', {
              type: 'button',
              className: 'dsh-sp__textBtn',
              'data-danger': confirmEmpty ? 'true' : 'false',
              title: confirmEmpty ? t('trash.confirmEmpty') : t('trash.emptyAll'),
              'aria-label': confirmEmpty ? t('trash.confirmEmpty') : t('trash.emptyAll'),
              onClick: emptyTrash,
            }, confirmEmpty ? t('trash.confirmEmpty') : t('trash.emptyAll')) : null,
            listView === 'notes' ? h('button', {
              type: 'button',
              className: 'dsh-sp__textBtn',
              onClick: () => setListView('todos'),
            }, t('todos.title') + ' ' + openTaskCount) : null,
            listView === 'notes' ? h('button', {
              type: 'button',
              className: 'dsh-sp__textBtn',
              onClick: () => setListView('trash'),
            }, t('trash.title') + ' ' + trashed.length) : null,
            listView !== 'notes' ? h('button', {
              type: 'button',
              className: 'dsh-sp__textBtn',
              onClick: () => setListView('notes'),
            }, t('trash.back')) : null));
        feedChildren.push(toolbar);
        if (allTags.length > 0) {
          feedChildren.push(h('div', {
            className: 'dsh-sp__filters',
            role: 'group',
            'aria-label': t('tags.filter'),
          },
          h('button', {
            type: 'button',
            className: 'dsh-sp__filter',
            'data-active': selectedTag === '' ? 'true' : 'false',
            onClick: () => setSelectedTag(''),
          }, t('tags.all') + ' ' + notes.length),
          allTags.map(([tag, count]) => h('button', {
            key: tag,
            type: 'button',
            className: 'dsh-sp__filter',
            'data-active': selectedTag === tag ? 'true' : 'false',
            onClick: () => setSelectedTag(selectedTag === tag ? '' : tag),
          }, tag + ' ' + count))));
        }
        feedChildren.push(h('input', {
          ref: importInputRef,
          type: 'file',
          accept: 'application/json,.json',
          hidden: true,
          onChange: (event) => {
            void importBackup(event.target.files);
            event.target.value = '';
          },
        }));
        const listEmpty = trashView ? trashed.length === 0 : todoView ? todoGroups.length === 0 : visibleNotes.length === 0;
        const listArea = [];
        if (listEmpty) {
          listArea.push(h('div', { className: 'dsh-sp__empty' },
            h('span', { className: 'dsh-sp__emptyIcon' }, h(todoView ? TasksIcon : EmptyIcon, null)),
            h('span', null, trashView ? t('trash.empty') : todoView ? t('todos.empty') : query.trim() ? t('panel.noResults') : t('panel.empty'))));
        } else if (trashView) {
          listArea.push(h('div', { className: 'dsh-sp__list' },
            trashed.map((note) => h(TrashCard, {
              key: note.id,
              note,
              t,
              onRestore: restoreNote,
              onDeleteForever: deleteForever,
            }))));
        } else if (todoView) {
          const groups = todoGroups
            .map((group) => ({
              note: group.note,
              open: group.tasks.filter((task) => !task.done),
              done: group.tasks.filter((task) => task.done),
            }))
            .filter((group) => group.open.length > 0 || group.done.length > 0);
          const renderGroup = (group, part) => h('article', { key: group.note.id + ':' + part, className: 'dsh-sp__note dsh-sp__todoNote' },
            h('button', {
              type: 'button',
              className: 'dsh-sp__todoRef',
              title: t('todos.openNote'),
              onClick: () => { void openNote(group.note); },
            },
            h('span', { className: 'dsh-sp__todoRefText' }, excerptOf(group.note) || t('note.untitled')),
            h('time', { className: 'dsh-sp__noteTime', dateTime: new Date(group.note.updatedAt).toISOString() }, formatTime(group.note.updatedAt))),
            group[part].map((task) => h('div', { key: task.lineIndex, className: 'dsh-sp__mdTask' },
              h('input', {
                type: 'checkbox',
                className: 'dsh-sp__mdCheck',
                checked: task.done,
                'aria-label': task.text,
                onChange: () => toggleTaskInNote(group.note, task.lineIndex),
              }),
              h('span', { className: 'dsh-sp__mdTaskText', 'data-done': task.done ? 'true' : 'false' },
                renderInline(task.text, query.trim())))));
          if (groups.length > 0) {
            const withOpen = groups.filter((group) => group.open.length > 0);
            const withDone = groups.filter((group) => group.done.length > 0);
            if (withOpen.length > 0) listArea.push(h('div', { className: 'dsh-sp__groupHead' }, t('todos.openGroup')));
            for (const group of withOpen) listArea.push(renderGroup(group, 'open'));
            if (withDone.length > 0) listArea.push(h('div', { className: 'dsh-sp__groupHead' }, t('todos.doneGroup')));
            for (const group of withDone) listArea.push(renderGroup(group, 'done'));
          }
        } else {
          const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
          const groupLabel = (ts) => {
            if (ts >= dayStart) return t('group.today');
            if (ts >= dayStart - 86400000) return t('group.yesterday');
            const d = new Date(ts);
            const opts = d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' };
            return d.toLocaleDateString(undefined, opts);
          };
          const pinnedNotes = visibleNotes.filter((note) => note.pinned);
          const dayNotes = visibleNotes.filter((note) => !note.pinned);
          const sections = [];
          if (pinnedNotes.length > 0) sections.push({ label: t('group.pinned'), cards: pinnedNotes });
          let currentLabel = null;
          let bucket = null;
          for (const note of dayNotes) {
            const label = groupLabel(note.updatedAt);
            if (label !== currentLabel) {
              bucket = { label, cards: [] };
              sections.push(bucket);
              currentLabel = label;
            }
            bucket.cards.push(note);
          }
          for (const section of sections) {
            listArea.push(h('div', { className: 'dsh-sp__groupHead' }, section.label));
            listArea.push(h('div', { className: 'dsh-sp__list' },
              section.cards.map((note) => h(NoteCard, {
                key: note.id,
                note,
                active: editor.id === note.id,
                confirming: confirmId === note.id,
                query,
                t,
                onOpen: (target) => { void openNote(target); },
                onTogglePin: togglePin,
                onRequestDelete: requestDelete,
                onSend: sendToChat,
              }))));
          }
        }
        feedChildren.push(h('div', { className: 'dsh-sp__listScroll' }, listArea));
      }

      return h('div', { className: 'dsh-sp', onDrop, onDragOver, onDragLeave },
        h('div', { className: 'dsh-sp__inner' },
          h('header', { className: 'dsh-sp__header' },
            h('div', { className: 'dsh-sp__titles' },
              h('div', { className: 'dsh-sp__titleRow' },
                h('h1', { className: 'dsh-sp__title' }, t('panel.title')),
                hint ? h('kbd', { className: 'dsh-sp__kbd', title: t('shortcut.open') }, hint) : null,
                h('span', { className: 'dsh-sp__version', title: t('panel.version') + ' ' + VERSION }, 'v' + VERSION)),
              h('p', { className: 'dsh-sp__subtitle' }, t('panel.subtitle'))),
            h('div', { className: 'dsh-sp__searchGroup' },
              h('div', { className: 'dsh-sp__searchWrap' },
                h('input', {
                  ref: searchInputRef,
                  type: 'search',
                  className: 'dsh-sp__search' + (searchKbd ? ' dsh-sp__search--kbd' : ''),
                  value: query,
                  placeholder: t('panel.search'),
                  'aria-label': t('panel.search'),
                  title: searchKbd ? t('shortcut.search') : undefined,
                  onChange: (event) => setQuery(event.target.value),
                }),
                searchKbd ? h('kbd', { className: 'dsh-sp__kbd dsh-sp__kbdIn', title: t('shortcut.search') }, searchKbd) : null)),
            h('button', {
              type: 'button',
              className: 'dsh-sp__new',
              title: t('shortcut.new'),
              onClick: () => { void startDraft(); },
            }, h(PlusIcon, null), t('panel.new'), h('span', { className: 'dsh-sp__jotKbd' }, newKbd || '⌘⇧N'))),
          h('div', { className: 'dsh-sp__cols' },
            listView === 'notes' ? h('div', { className: 'dsh-sp__composerCol' },
              narrow && !composerOpen
                ? h('button', {
                    type: 'button',
                    className: 'dsh-sp__composerFold',
                    onClick: () => setComposerOpen(true),
                  }, h(PlusIcon, null), t('editor.foldNew'), hint ? h('kbd', { className: 'dsh-sp__kbd' }, hint) : null)
                : composerCard,
              aboutCard) : null,
            h('div', { className: 'dsh-sp__feedCol' }, feedChildren)),
          preview ? h(Lightbox, { attachment: preview, t, onClose: () => setPreview(null) }) : null));
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', DICTS.en), 'scratchpad: en dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICTS.zh), 'scratchpad: zh dictionary');
        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          const tag = document.createElement('style');
          tag.dataset.plugin = '@chaiyahang/dsh-scratchpad';
          tag.dataset.pluginCss = STYLE_ID;
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'scratchpad: panel styles');

        const t = ctx.locale.bind(NS);

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => t('panel.title'),
          locale: NS,
        }, PanelIcon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({
            t,
            sendToConversation: () => ctx.layout.selectPanel('conversation'),
            shortcutHint: () => activeShortcutHints.open,
            newHint: () => activeShortcutHints.new,
            searchHint: () => activeShortcutHints.search,
          }),
        }, PanelPage));

        // The panel cannot reach the composer directly; this session seat places
        // the text the panel queued before switching panels.
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'scratchpad-composer-bridge',
          order: 1000,
          inject: () => ({ sessions: ctx.get('sessions'), getSessions: () => ctx.get('sessions'), t }),
        }, ComposerHandoffBridge));

        // In-app shortcuts. Registration is optional: a host without the
        // shortcuts service simply has no bindings and the panel still works.
        ctx.inject(['shortcuts'], (scoped) => {
          try {
            const shortcuts = scoped.get('shortcuts');
            if (!shortcuts || typeof shortcuts.register !== 'function') return;
            scoped.effect(() => {
              const openPanel = () => {
                markScratchpadFocus();
                ctx.layout.selectPanel(PANEL_ID);
              };
              const startNew = () => {
                markScratchpadNew();
                ctx.layout.selectPanel(PANEL_ID);
              };
              const focusSearch = () => {
                markScratchpadSearch();
                ctx.layout.selectPanel(PANEL_ID);
              };
              const candidates = [
                ...shortcutCandidates(OPEN_SHORTCUTS, t, openPanel),
                ...shortcutCandidates(NEW_SHORTCUTS, t, startNew),
                ...shortcutCandidates(SEARCH_SHORTCUTS, t, focusSearch),
              ];
              const disposers = [];
              for (const candidate of candidates) {
                try {
                  disposers.push(shortcuts.register(candidate.definition));
                  if (candidate.titleHint) activeShortcutHints[candidate.slot] = candidate.hint;
                } catch (error) {
                  scoped.logger?.warn?.('scratchpad: shortcut ' + candidate.definition.id + ' unavailable: ' + (error instanceof Error ? error.message : String(error)));
                }
              }
              return () => {
                for (const dispose of disposers) {
                  try {
                    dispose();
                  } catch {}
                }
              };
            }, 'scratchpad: shortcuts');
          } catch (error) {
            scoped.logger?.warn?.('scratchpad: shortcut registration failed: ' + (error instanceof Error ? error.message : String(error)));
          }
        });
      },
    };
  },
});
