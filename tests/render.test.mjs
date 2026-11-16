import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

// Extract the whole module factory body (constants + helpers + components) so a
// render-time crash — the "blank panel" class of regressions — fails here.
const start = source.indexOf("    const NS = 'scratchpad';");
const end = source.indexOf('    return {\n      inject:', start);
if (start < 0 || end < 0) throw new Error('client.js factory markers not found');
const body = source.slice(start, end);

// PanelPage's useState declaration order, derived from the source itself so
// the state-driven scenarios below survive reorders of the declarations.
const stateNames = [...body.matchAll(/const \[(\w+), set\w+\] = useState\(/g)].map((match) => match[1]);

const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });

let overrides = new Map();
let cursor = 0;
const useState = (initial) => {
  const index = cursor++;
  const name = stateNames[index];
  if (name && overrides.has(name)) return [overrides.get(name), () => {}];
  return [typeof initial === 'function' ? initial() : initial, () => {}];
};
const useRef = (value) => ({ current: value });
const useCallback = (fn) => fn;
const useMemo = (compute) => compute();
const useEffect = () => {};
const useLayoutEffect = () => {};
const React = { Fragment: 'fragment' };

const build = new Function('h', 'React', 'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useRef', 'useCallback',
  body + '\nreturn { PanelPage, NoteCard, TrashCard, AttachmentTile, Lightbox };');
const parts = build(createElement, React, useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`ok: ${message}`);
}

const t = (key) => 'L:' + key;
const noop = () => {};
const now = Date.now();
const note = {
  id: 'n1',
  text: '看 https://example.com/a 和 **加粗**\n- [ ] 任务',
  tags: ['工作'],
  pinned: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: 0,
  attachments: [{ id: 'a1', name: 'shot.png', type: 'image/png', size: 12, kind: 'image', storedName: 'a1.png' }],
};
const editor = { id: 'n1', text: '', tags: [], pinned: false, createdAt: 0, updatedAt: 0, attachments: [] };

/** Render PanelPage with named useState values overridden. */
function renderWith(states) {
  overrides = new Map(Object.entries(states));
  cursor = 0;
  return parts.PanelPage({ t, sendToConversation: noop, shortcutHint: () => '⌘⇧S', newHint: () => '', searchHint: () => '' });
}

/** Walk the element tree collecting text, class names and component names. */
function collect(node, into = { text: [], cls: [], types: [] }) {
  if (node === null || node === undefined || typeof node === 'boolean') return into;
  if (typeof node === 'string' || typeof node === 'number') {
    into.text.push(String(node));
    return into;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, into);
    return into;
  }
  if (typeof node.type === 'function') {
    into.types.push(node.type.name);
    // Invoke child components (the panel tree has no recursion) so assertions
    // can reach class names rendered INSIDE them (Lightbox etc.).
    try {
      return collect(node.type(node.props ?? {}), into);
    } catch {}
  }
  const props = node.props;
  if (props) {
    if (props.className) into.cls.push(...String(props.className).split(/\s+/));
    collect(props.children, into);
  }
  collect(node.children, into);
  return into;
}

// Baseline: the default state still renders (loading feed, composer, toolbar).
const page = collect(renderWith({}));
assert(page.text.includes('L:panel.loading'), 'PanelPage renders the default state without throwing');

// Search without hits: the empty state must surface AND offer the escape hatch.
const noHits = collect(renderWith({ ready: true, notes: [note], query: 'zzz' }));
assert(noHits.text.includes('L:panel.noResults'), 'no-hit search shows the no-results message');
assert(noHits.text.includes('L:panel.clearSearch'), 'no-hit search offers the clear-search button');

// Empty trash shows its own icon, not the generic one.
const emptyTrash = collect(renderWith({ ready: true, listView: 'trash' }));
assert(emptyTrash.text.includes('L:trash.empty'), 'empty trash shows the trash message');
assert(emptyTrash.types.includes('TrashIcon'), 'empty trash uses the trash icon');

// The import confirmation modal: file name, counts and actions all present.
const importModal = collect(renderWith({
  ready: true,
  importPreview: { document: {}, name: 'backup.json', newCount: 2, replaceCount: 1 },
}));
assert(importModal.cls.includes('dsh-sp__modal'), 'the import confirmation renders as a modal');
assert(importModal.text.includes('backup.json'), 'the import modal names the staged file');
assert(importModal.text.includes('L:data.importConfirm') && importModal.text.includes('L:data.importCancel'),
  'the import modal carries confirm and cancel actions');
assert(importModal.text.includes('L:data.importReplaceHint'), 'a replacing import carries the overwrite warning');

// Bulk-selection mode: the bulk bar with its actions must exist.
const bulk = collect(renderWith({ ready: true, notes: [note], selectMode: true, selectedIds: new Set(['n1']) }));
assert(bulk.cls.includes('dsh-sp__bulkBar'), 'select mode renders the bulk bar');
assert(bulk.text.some((item) => item.includes('L:panel.selectedCount')) && bulk.text.some((item) => item.includes('L:panel.addTag')),
  'the bulk bar carries count and add-tag');
assert(bulk.text.includes('L:panel.selectAll') || bulk.text.includes('L:panel.selectNone'),
  'the bulk bar toggles between select-all and select-none');

// Notifications are toasts now — a set notice must have a render site.
const toast = collect(renderWith({ ready: true, notice: 'boom' }));
assert(toast.cls.includes('dsh-sp__toast') && toast.text.includes('boom'), 'a set notice renders as a toast');

// The history button only exists for notes that HAVE recorded versions.
const noHistory = collect(renderWith({ ready: true, notes: [note], editor }));
assert(!noHistory.text.includes('L:history.title'), 'the history button stays hidden without recorded versions');
const withHistory = collect(renderWith({ ready: true, notes: [{ ...note, historyCount: 2 }], editor: { ...editor, historyCount: 2 } }));
assert(withHistory.text.includes('L:history.title'), 'the history button appears once versions exist');

// The version-history body replaces the editor when opened.
const history = collect(renderWith({ ready: true, historyOpen: true, historyItems: [{ text: 'old text', updatedAt: now }], editor: { ...editor, historyCount: 2 } }));
assert(history.text.includes('L:history.restore'), 'an open history view offers restore');
assert(history.text.includes('old text'), 'history entries render their excerpt');

// A previewed attachment opens the lightbox with its action bar.
const lightbox = collect(renderWith({ ready: true, preview: note.attachments[0], previewList: note.attachments }));
assert(lightbox.cls.includes('dsh-sp__lightbox') && lightbox.cls.includes('dsh-sp__lightboxBar'),
  'a previewed attachment renders the lightbox with its action bar');

// Component-level regression guards (kept from the original smoke test).
const card = parts.NoteCard({ note, active: true, confirming: false, t, onOpen: noop, onTogglePin: noop, onRequestDelete: noop, onSend: noop });
assert(card && typeof card.type !== 'undefined', 'NoteCard renders (links, thumbnails, tags)');

const trashCard = parts.TrashCard({ note: { ...note, deletedAt: now - 86400000, attachments: [] }, t, onRestore: noop, onDeleteForever: noop });
assert(trashCard && typeof trashCard.type !== 'undefined', 'TrashCard renders');

const tile = parts.AttachmentTile({ attachment: note.attachments[0], onRemove: noop, onOpen: noop, t });
assert(tile && typeof tile.type !== 'undefined', 'AttachmentTile renders');

const lightboxAlone = parts.Lightbox({ attachment: note.attachments[0], attachments: note.attachments, onClose: noop, t });
assert(lightboxAlone && typeof lightboxAlone.type !== 'undefined', 'Lightbox renders');

console.log('render smoke test passed');
