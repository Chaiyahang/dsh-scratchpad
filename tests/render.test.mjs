import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

// Extract the whole module factory body (constants + helpers + components) so a
// render-time crash — the "blank panel" class of regressions — fails here.
const start = source.indexOf('    const DICTS = {');
const end = source.indexOf('    return {\n      inject:', start);
if (start < 0 || end < 0) throw new Error('client.js factory markers not found');
const body = source.slice(start, end);

const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });

const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];
const useRef = (value) => ({ current: value });
const useCallback = (fn) => fn;
const useMemo = (compute) => compute();
const useEffect = () => {};
const React = { Fragment: 'fragment' };

const build = new Function('h', 'React', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback',
  body + '\nreturn { PanelPage, NoteCard, TrashCard, AttachmentTile, Lightbox };');
const parts = build(createElement, React, useState, useEffect, useMemo, useRef, useCallback);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`ok: ${message}`);
}

const t = (key) => 'L:' + key;
const noop = () => {};

const page = parts.PanelPage({ t, sendToConversation: noop, shortcutHint: () => '⌘⇧S' });
assert(page && typeof page.type !== 'undefined', 'PanelPage renders without throwing');

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
const card = parts.NoteCard({ note, active: true, confirming: false, t, onOpen: noop, onTogglePin: noop, onRequestDelete: noop, onSend: noop });
assert(card && typeof card.type !== 'undefined', 'NoteCard renders (links, thumbnails, tags)');

const trashCard = parts.TrashCard({ note: { ...note, deletedAt: now - 86400000, attachments: [] }, t, onRestore: noop, onDeleteForever: noop });
assert(trashCard && typeof trashCard.type !== 'undefined', 'TrashCard renders');

const tile = parts.AttachmentTile({ attachment: note.attachments[0], onRemove: noop, onOpen: noop, t });
assert(tile && typeof tile.type !== 'undefined', 'AttachmentTile renders');

const lightbox = parts.Lightbox({ attachment: note.attachments[0], onClose: noop, t });
assert(lightbox && typeof lightbox.type !== 'undefined', 'Lightbox renders');

console.log('render smoke test passed');
