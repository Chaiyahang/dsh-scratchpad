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
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    /** Locale namespace and the `main` key / sidebar id share one identifier. */
    const NS = 'scratchpad';
    /** Keep in sync with package.json; tests/version.test.mjs guards the pair. */
    const VERSION = '0.2.4';
    const PANEL_ID = 'scratchpad';
    const PANEL_ORDER = 24;
    const STYLE_ID = '@chaiyahang/dsh-scratchpad/panel.css';
    const API = '/api/scratchpad';
    const LEGACY_DB = 'dsh-scratchpad-panel';
    const MIGRATION_FLAG = 'dsh-scratchpad-panel:host-migrated';
    const SAVE_DELAY = 300;
    const POLL_DELAY = 4000;
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
        'editor.remove': 'Remove attachment',
        'note.pin': 'Pin note',
        'note.unpin': 'Unpin note',
        'note.delete': 'Delete note',
        'note.confirmDelete': 'Sure?',
        'note.untitled': 'Empty note',
        'note.open': 'Open note',
        'note.send': 'Send to conversation',
        'note.attachments': 'Attachments',
        'editor.send': 'Send to chat',
        'editor.preview': 'Preview',
        'editor.edit': 'Edit',
        'editor.emptyPreview': 'Nothing to preview yet.',
        'editor.task': 'Task',
        'shortcut.open': 'Open scratchpad',
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
        'editor.remove': '移除附件',
        'note.pin': '置顶',
        'note.unpin': '取消置顶',
        'note.delete': '删除便签',
        'note.confirmDelete': '确认？',
        'note.untitled': '空白便签',
        'note.open': '打开便签',
        'note.send': '发送到对话',
        'note.attachments': '附件',
        'editor.send': '发到对话',
        'editor.preview': '预览',
        'editor.edit': '编辑',
        'editor.emptyPreview': '还没有内容可预览。',
        'editor.task': '待办',
        'shortcut.open': '打开便签',
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
.dsh-sp__inner{display:flex;flex-direction:column;gap:14px;width:100%;max-width:1000px;min-height:0;height:100%;padding:20px 24px 0;box-sizing:border-box}
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
.dsh-sp__editor{flex:none;display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 14px;transition:border-color .12s ease}
.dsh-sp__editor:focus-within{border-color:var(--dsw-alias-brand-primary)}
.dsh-sp__editor[data-drag="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-sp__textarea{width:100%;box-sizing:border-box;border:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13.5px;line-height:1.65;resize:none;outline:none;min-height:58px;max-height:42vh;overflow-y:auto;padding:0;display:block}
.dsh-sp__preview{width:100%;box-sizing:border-box;min-height:58px;max-height:42vh;overflow-y:auto;font-size:13.5px;line-height:1.65;padding:0;color:var(--dsw-alias-label-primary)}
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
.dsh-sp__mdLink{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:2px;word-break:break-all}
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
.dsh-sp__noteTag{font-size:10.5px;line-height:1.7;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:0 6px}
.dsh-sp__textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}
.dsh-sp__tiles{display:flex;flex-wrap:wrap;gap:8px}
.dsh-sp__tile{position:relative;width:56px;height:56px;border-radius:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex:none}
.dsh-sp__tileOpen{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:none;background:transparent;padding:0;cursor:pointer;color:var(--dsw-alias-label-secondary);text-decoration:none;font-family:inherit}
.dsh-sp__tileOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-sp__tileImg{width:100%;height:100%;object-fit:cover;display:block}
.dsh-sp__tileExt{font-size:10px;font-weight:700;letter-spacing:.04em;line-height:1}
.dsh-sp__tileRemove{position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.dsh-sp__tileRemove:hover{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:26px}
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
.dsh-sp__status{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-sp__status[data-error="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__notice{flex:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-sp__conflict{flex:none;display:flex;align-items:center;gap:2px;flex-wrap:wrap;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary)}
.dsh-sp__list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 0 20px}
.dsh-sp__listHeader{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);padding-top:2px}
.dsh-sp__note{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:9px 12px 10px;transition:border-color .12s ease}
.dsh-sp__note:hover{border-color:var(--dsw-alias-border-l2)}
.dsh-sp__note[data-active="true"]{border-color:var(--dsw-alias-brand-primary)}
.dsh-sp__noteTop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;min-height:24px}
.dsh-sp__noteTime{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-sp__noteTools{display:flex;align-items:center;gap:2px}
.dsh-sp__noteBtn{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;padding:0 4px;font-size:11.5px;font-family:inherit;line-height:1}
.dsh-sp__noteBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-sp__noteBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-sp__noteBtn[data-pinned="true"]{color:var(--dsw-alias-brand-primary)}
.dsh-sp__noteBtn[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-sp__noteOpen{display:block;width:100%;text-align:left;border:none;background:transparent;padding:0;color:var(--dsw-alias-label-primary);cursor:pointer;font-family:inherit}
.dsh-sp__noteOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}
.dsh-sp__noteText{margin:0;font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dsh-sp__noteText[data-empty="true"]{color:var(--dsw-alias-label-secondary);font-style:italic}
.dsh-sp__noteAttach{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:7px}
.dsh-sp__thumb{width:30px;height:30px;border-radius:6px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;letter-spacing:.03em;color:var(--dsw-alias-label-secondary);flex:none}
.dsh-sp__thumbImg{width:100%;height:100%;object-fit:cover;display:block}
.dsh-sp__empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6;text-align:center}
.dsh-sp__emptyIcon{color:var(--dsw-alias-border-l2)}
.dsh-sp__lightbox{position:fixed;inset:0;z-index:60;background:var(--dsw-alias-bg-overlay);display:flex;align-items:center;justify-content:center;padding:44px}
.dsh-sp__lightboxImg{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;display:block}
.dsh-sp__lightboxClose{position:absolute;top:14px;right:14px;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
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

    async function fetchSnapshot() {
      return apiJson(`${API}/notes`);
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

    async function deleteNoteRemote(id) {
      return apiJson(`${API}/notes/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
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

    async function deleteRemoteFile(attachment) {
      try {
        await apiJson(`${API}/files/delete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: attachment.id, storedName: attachment.storedName }),
        });
      } catch {}
    }

    function attachmentUrl(id, download) {
      const query = new URLSearchParams({ id });
      if (download) query.set('download', '1');
      return `${API}/files?${query.toString()}`;
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

    // ---------------------------------------------------------------------
    // Lightweight Markdown rendering (no dependencies, no raw HTML)
    // ---------------------------------------------------------------------

    /** Inline spans: code, bold, italic. Text stays plain React children. */
    function renderInline(text) {
      const source = String(text);
      const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\)|https?:[/][/][^\s<>()\u0022\u0027\u201c\u201d\u2018\u2019\u2026\u2014\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]+)/g;
      const nodes = [];
      let cursor = 0;
      let index = 0;
      let match;
      const pushLink = (linkUrl, label) => {
        index += 1;
        nodes.push(h('a', { key: index, className: 'dsh-sp__mdLink', href: linkUrl, target: '_blank', rel: 'noopener noreferrer' }, label));
      };
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
        const token = match[0];
        if (token.startsWith('`')) {
          nodes.push(h('code', { key: `c${index++}`, className: 'dsh-sp__mdCode' }, token.slice(1, -1)));
        } else if (token.startsWith('**')) {
          nodes.push(h('strong', { key: `b${index++}` }, token.slice(2, -2)));
        } else if (token.startsWith('~~')) {
          nodes.push(h('del', { key: `s${index++}` }, token.slice(2, -2)));
        } else if (token.startsWith('*')) {
          nodes.push(h('em', { key: `e${index++}` }, token.slice(1, -1)));
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(token);
          // Only http(s)/mailto targets become anchors; anything else stays
          // literal text so a crafted note can never script the panel.
          if (link !== null && /^(https?:[/][/]|mailto:)/i.test(link[2])) {
            pushLink(link[2], renderInline(link[1]));
          } else {
            nodes.push(token);
          }
        } else {
          const url = token.replace(/[.,;:!?]+$/, '');
          pushLink(url, url);
          if (url.length < token.length) nodes.push(token.slice(url.length));
        }
        cursor = match.index + token.length;
      }
      if (cursor < source.length) nodes.push(source.slice(cursor));
      return nodes;
    }

    /**
     * Block rendering for notes. Supports headings (#..###), unordered and
     * ordered lists, task items (`- [ ]` / `- [x]`), fenced code, blockquotes and
     * paragraphs. Task boxes call `onToggleTask(lineIndex)` with the raw source line.
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

    /** One-line-ish card excerpt: markers become glyphs instead of raw syntax. */
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
    /** Display text of the binding that actually registered; empty when none did. */
    let activeShortcutHint = '';

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
    function shortcutCandidates(t, onRun) {
      const mac = isMacPlatform();
      const variants = [
        { id: 'scratchpad.open', code: 'KeyS', modifiers: ['primary', 'shift'], mac: '⌘⇧S', other: 'Ctrl+Shift+S', web: true },
        { id: 'scratchpad.open.alt-s', code: 'KeyS', modifiers: ['primary', 'alt'], mac: '⌘⌥S', other: 'Ctrl+Alt+S', web: false },
        { id: 'scratchpad.open.alt-n', code: 'KeyN', modifiers: ['primary', 'alt'], mac: '⌘⌥N', other: 'Ctrl+Alt+N', web: false },
      ];
      return variants.map((variant) => ({
        hint: mac ? variant.mac : variant.other,
        definition: {
          id: variant.id,
          label: () => t('shortcut.open'),
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
      const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
      if (sameDay) return clock;
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}`;
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

    function EmptyIcon() {
      return h(LineIcon, { size: 34 },
        h('rect', { x: 4.5, y: 3, width: 15, height: 18, rx: 2.5 }),
        h('path', { d: 'M8.5 8.5h7' }),
        h('path', { d: 'M8.5 12h7' }),
        h('path', { d: 'M8.5 15.5h4.5' }));
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
        }, h('img', { className: 'dsh-sp__tileImg', src: attachmentUrl(attachment.id), alt: '', loading: 'lazy', decoding: 'async' }))
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
          h('img', { className: 'dsh-sp__thumbImg', src: attachmentUrl(attachment.id), alt: '', loading: 'lazy', decoding: 'async' }));
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

    function NoteCard({ note, active, confirming, t, onOpen, onTogglePin, onRequestDelete, onSend }) {
      const preview = toPlainExcerpt(note.text).trim();
      return h('article', { className: 'dsh-sp__note', 'data-active': active ? 'true' : 'false' },
        h('div', { className: 'dsh-sp__noteTop' },
          h('time', { className: 'dsh-sp__noteTime', dateTime: new Date(note.updatedAt).toISOString() }, formatTime(note.updatedAt)),
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
        h('button', {
          type: 'button',
          className: 'dsh-sp__noteOpen',
          'aria-label': t('note.open'),
          onClick: () => onOpen(note),
        },
        h('span', {
          className: 'dsh-sp__noteText',
          'data-empty': preview ? 'false' : 'true',
        }, preview || t('note.untitled')),
        note.attachments.length > 0 ? h('span', { className: 'dsh-sp__noteAttach' },
          note.attachments.map((attachment) => h(NoteThumb, { key: attachment.id, attachment }))) : null,
        note.tags.length > 0 ? h('span', { className: 'dsh-sp__noteTags' },
          note.tags.map((tag) => h('span', { key: tag, className: 'dsh-sp__noteTag' }, `#${tag}`))) : null));
    }

    // ---------------------------------------------------------------------
    // The page
    // ---------------------------------------------------------------------

    function PanelPage({ t, sendToConversation, shortcutHint }) {
      const hint = typeof shortcutHint === 'function' ? shortcutHint() : '';
      const [notes, setNotes] = useState([]);
      const [ready, setReady] = useState(false);
      const [loadError, setLoadError] = useState(false);
      const [loadErrorMessage, setLoadErrorMessage] = useState('');
      const [editor, setEditor] = useState(emptyEditor);
      const [saveState, setSaveState] = useState('idle');
      const [notice, setNotice] = useState('');
      /** Stored version the Host handed back on a 409, awaiting a user decision. */
      const [conflict, setConflict] = useState(null);
      const [query, setQuery] = useState('');
      const [confirmId, setConfirmId] = useState(null);
      const [dragging, setDragging] = useState(false);
      const [preview, setPreview] = useState(null);
      const [previewMode, setPreviewMode] = useState(false);
      const [importing, setImporting] = useState(false);
      const [tagDraft, setTagDraft] = useState('');
      const [selectedTag, setSelectedTag] = useState('');

      const editorRef = useRef(editor);
      /** updatedAt of the version this editor last synced with the Host; 0 = no base. */
      const baseRef = useRef(0);
      const pendingRef = useRef(null);
      const dirtyRef = useRef(false);
      const timerRef = useRef(0);
      const confirmTimerRef = useRef(0);
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
            setLoadError(false);
            setLoadErrorMessage('');
            if (!restoreDraft() && sorted.length > 0) {
              updateEditor(copyOf(sorted[0]));
              baseRef.current = sorted[0].updatedAt;
              setSaveState('saved');
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
            const snapshot = await fetchSnapshot();
            if (!alive) return;
            setLoadError(false);
            setLoadErrorMessage('');
            setNotes(sortNotes(snapshot.notes));
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
              updateEditor(copyOf(fresh));
              baseRef.current = fresh.updatedAt;
              setSaveState('saved');
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

      // Auto-grow the editor: a compact card that never eats the note list.
      useEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = 'auto';
        const max = Math.round(window.innerHeight * 0.42);
        element.style.height = `${Math.min(element.scrollHeight, max)}px`;
      }, [editor.text, editor.id]);

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
          try {
            accepted.push(await uploadAttachment(file));
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
        setTagDraft('');
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      }, [flush, updateEditor]);

      const openNote = useCallback(async (note) => {
        if (editorRef.current.id === note.id) {
          textareaRef.current?.focus();
          return;
        }
        const saved = await flush();
        if (saved) clearDraft();
        dirtyRef.current = false;
        setConflict(null);
        updateEditor(copyOf(note));
        baseRef.current = note.updatedAt;
        setSaveState('saved');
        setTagDraft('');
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
        })();
      }, [confirmId, flush, updateEditor]);

      const onPaste = useCallback((event) => {
        const files = Array.from(event.clipboardData?.files || []);
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length === 0) return;
        event.preventDefault();
        void addFiles(images);
      }, [addFiles]);

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

      const onEditorKeyDown = useCallback((event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          void startDraft();
        }
      }, [startDraft]);

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

      const statusLabel = (() => {
        if (saveState === 'saving') return t('editor.saving');
        if (saveState === 'saved') return t('editor.saved');
        if (saveState === 'error') return t('editor.saveFailed');
        return '';
      })();

      return h('div', { className: 'dsh-sp', onDrop, onDragOver, onDragLeave },
        h('div', { className: 'dsh-sp__inner' },
          h('header', { className: 'dsh-sp__header' },
            h('div', { className: 'dsh-sp__titles' },
              h('div', { className: 'dsh-sp__titleRow' },
                h('h1', { className: 'dsh-sp__title' }, t('panel.title')),
                hint ? h('kbd', { className: 'dsh-sp__kbd', title: t('shortcut.open') }, hint) : null,
                h('span', { className: 'dsh-sp__version', title: `${t('panel.version')} ${VERSION}` }, `v${VERSION}`)),
              h('p', { className: 'dsh-sp__subtitle' }, t('panel.subtitle'))),
            h('input', {
              type: 'search',
              className: 'dsh-sp__search',
              value: query,
              placeholder: t('panel.search'),
              'aria-label': t('panel.search'),
              onChange: (event) => setQuery(event.target.value),
            }),
            h('button', {
              type: 'button',
              className: 'dsh-sp__new',
              onClick: () => { void startDraft(); },
            }, h(PlusIcon, null), t('panel.new'))),

          h('section', {
            className: 'dsh-sp__editor',
            'data-drag': dragging ? 'true' : 'false',
          },
          previewMode
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
              onKeyDown: onEditorKeyDown,
              onBlur: () => { void flush(); },
            }),
          editor.attachments.length > 0 ? h('div', { className: 'dsh-sp__tiles' },
            editor.attachments.map((attachment) => h(AttachmentTile, {
              key: attachment.id,
              attachment,
              t,
              onRemove: removeAttachment,
              onOpen: setPreview,
            }))) : null,
          h('div', { className: 'dsh-sp__tags' },
            editor.tags.map((tag) => h('span', { key: `tag-${tag}`, className: 'dsh-sp__tag' },
              tag,
              h('button', {
                type: 'button',
                className: 'dsh-sp__tagRemove',
                'aria-label': `${t('tags.remove')}: ${tag}`,
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
          h('div', { className: 'dsh-sp__bar' },
            h('button', {
              type: 'button',
              className: 'dsh-sp__iconBtn',
              title: previewMode ? t('editor.edit') : t('editor.preview'),
              'aria-pressed': previewMode ? 'true' : 'false',
              onClick: () => setPreviewMode((value) => !value),
            }, previewMode ? t('editor.edit') : t('editor.preview')),
            h('button', {
              type: 'button',
              className: 'dsh-sp__iconBtn',
              title: t('editor.image'),
              onClick: () => imageInputRef.current?.click(),
            }, h(ImageIcon, null), t('editor.image')),
            h('button', {
              type: 'button',
              className: 'dsh-sp__iconBtn',
              title: t('editor.file'),
              onClick: () => fileInputRef.current?.click(),
            }, h(FileIcon, null), t('editor.file')),
            h('button', {
              type: 'button',
              className: 'dsh-sp__iconBtn',
              title: t('editor.send'),
              disabled: editor.text.trim() === '' && editor.attachments.length === 0,
              onClick: () => sendToChat(editor),
            }, h(SendIcon, null), t('editor.send')),
            h('span', { className: 'dsh-sp__barSpacer' }),
            h('span', { className: 'dsh-sp__status', 'data-error': saveState === 'error' ? 'true' : 'false' },
              `${t('editor.chars')} ${editor.text.length}${statusLabel ? ` · ${statusLabel}` : ''}`)),
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
          }),
          h('input', {
            ref: importInputRef,
            type: 'file',
            accept: 'application/json,.json',
            hidden: true,
            onChange: (event) => {
              void importBackup(event.target.files);
              event.target.value = '';
            },
          })),

          loadError
            ? h('div', { className: 'dsh-sp__notice', role: 'alert' },
              `${t('panel.loadError')}${loadErrorMessage ? ` (${loadErrorMessage})` : ''}`)
            : null,

          !ready
            ? h('div', { className: 'dsh-sp__empty' }, t('panel.loading'))
            : h(React.Fragment, null,
              h('div', { className: 'dsh-sp__listHeader' },
                h('span', null, t('panel.listTitle')),
                h('span', null, String(visibleNotes.length)),
                h('span', { className: 'dsh-sp__barSpacer' }),
                h('a', {
                  className: 'dsh-sp__textBtn',
                  href: `${API}/export?attachments=1`,
                  title: t('data.exportHint'),
                }, t('data.export')),
                h('button', {
                  type: 'button',
                  className: 'dsh-sp__textBtn',
                  title: t('data.importHint'),
                  disabled: importing,
                  onClick: () => importInputRef.current?.click(),
                }, importing ? t('data.importing') : t('data.import'))),
              allTags.length > 0 ? h('div', {
                className: 'dsh-sp__filters',
                role: 'group',
                'aria-label': t('tags.filter'),
              },
              h('button', {
                type: 'button',
                className: 'dsh-sp__filter',
                'data-active': selectedTag === '' ? 'true' : 'false',
                onClick: () => setSelectedTag(''),
              }, `${t('tags.all')} ${notes.length}`),
              allTags.map(([tag, count]) => h('button', {
                key: tag,
                type: 'button',
                className: 'dsh-sp__filter',
                'data-active': selectedTag === tag ? 'true' : 'false',
                onClick: () => setSelectedTag(selectedTag === tag ? '' : tag),
              }, `${tag} ${count}`))) : null,
              visibleNotes.length === 0
                ? h('div', { className: 'dsh-sp__empty' },
                  h('span', { className: 'dsh-sp__emptyIcon' }, h(EmptyIcon, null)),
                  h('span', null, query.trim() ? t('panel.noResults') : t('panel.empty')))
                : h('div', { className: 'dsh-sp__list' },
                  visibleNotes.map((note) => h(NoteCard, {
                    key: note.id,
                    note,
                    active: editor.id === note.id,
                    confirming: confirmId === note.id,
                    t,
                    onOpen: (target) => { void openNote(target); },
                    onTogglePin: togglePin,
                    onRequestDelete: requestDelete,
                    onSend: sendToChat,
                  }))))),
        preview ? h(Lightbox, { attachment: preview, t, onClose: () => setPreview(null) }) : null);
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
            shortcutHint: () => activeShortcutHint,
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

        // In-app wake-up shortcut. Registration is optional: a host without the
        // shortcuts service simply has no binding and the panel still works.
        ctx.inject(['shortcuts'], (scoped) => {
          try {
            const shortcuts = scoped.get('shortcuts');
            if (!shortcuts || typeof shortcuts.register !== 'function') return;
            scoped.effect(() => {
              const open = () => {
                markScratchpadFocus();
                ctx.layout.selectPanel(PANEL_ID);
              };
              for (const candidate of shortcutCandidates(t, open)) {
                try {
                  const dispose = shortcuts.register(candidate.definition);
                  activeShortcutHint = candidate.hint;
                  return dispose;
                } catch (error) {
                  scoped.logger?.warn?.(`scratchpad: shortcut ${candidate.definition.id} unavailable: ${error instanceof Error ? error.message : String(error)}`);
                }
              }
              return undefined;
            }, 'scratchpad: open shortcut');
          } catch (error) {
            scoped.logger?.warn?.(`scratchpad: shortcut registration failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
      },
    };
  },
});
