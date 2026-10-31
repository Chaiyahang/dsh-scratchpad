import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
const FILES = '/api/scratchpad/files';
try {
  let result = await harness.request('GET', '/api/scratchpad/notes');
  assert(result.status === 200 && result.body.notes.length === 0, 'starts with an empty store');

  const note = { id: 'note-a', text: '第一个想法\n- [ ] 待办', pinned: true, createdAt: 1000, updatedAt: 2000, attachments: [] };
  result = await harness.request('POST', '/api/scratchpad/notes', { json: { note } });
  assert(result.status === 200 && result.body.note.text === note.text, 'saves a note');

  const upload = await harness.request('POST', FILES, {
    bytes: Buffer.from([9, 8, 7, 6]),
    query: { name: 'shot.png', type: 'image/png' },
  });
  assert(upload.status === 200 && upload.body.attachment.kind === 'image', 'uploads an image attachment');
  const attachment = upload.body.attachment;

  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: { ...note, updatedAt: 3000, attachments: [attachment] } },
  });
  assert(result.status === 200 && result.body.note.attachments.length === 1, 'saves the note with its attachment');

  result = await harness.request('GET', FILES, { query: { id: attachment.id } });
  assert(result.status === 200 && result.headers.get('content-type') === 'image/png', 'serves the attachment');
  assert(result.buffer.equals(Buffer.from([9, 8, 7, 6])), 'served bytes match the upload');

  // Only bitmap images render inline; anything that could execute script is
  // opaque bytes that download, and every file response is sandboxed.
  const hostile = await harness.request('POST', FILES, {
    bytes: Buffer.from('<script>alert(1)</script>'),
    query: { name: 'page.html', type: 'text/html' },
  });
  let served = await harness.request('GET', FILES, { query: { id: hostile.body.attachment.id } });
  assert(served.headers.get('content-type') === 'application/octet-stream', 'html attachments are served as opaque bytes');
  assert(served.headers.get('content-disposition')?.startsWith('attachment'), 'html attachments always download');
  assert(served.headers.get('content-security-policy') === 'sandbox', 'file responses carry a sandbox CSP');

  const svg = await harness.request('POST', FILES, {
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    query: { name: 'icon.svg', type: 'image/svg+xml' },
  });
  served = await harness.request('GET', FILES, { query: { id: svg.body.attachment.id } });
  assert(served.headers.get('content-type') === 'application/octet-stream', 'svg is served as opaque bytes');
  assert(served.headers.get('content-disposition')?.startsWith('attachment'), 'svg never renders inline on direct open');

  served = await harness.request('GET', FILES, { query: { id: attachment.id } });
  assert(served.headers.get('content-disposition')?.startsWith('inline'), 'bitmap images stay inline');
  served = await harness.request('GET', FILES, { query: { id: attachment.id, download: '1' } });
  assert(served.headers.get('content-disposition')?.startsWith('attachment'), 'download=1 forces a bitmap download');

  await harness.request('POST', '/api/scratchpad/files/delete', { json: { storedName: hostile.body.attachment.storedName } });
  await harness.request('POST', '/api/scratchpad/files/delete', { json: { storedName: svg.body.attachment.storedName } });

  let output = await harness.runTool('scratchpad_create', {
    text: '标签测试',
    tags: ['工作', '工作', '  idea  ', '', 123, 'x'.repeat(40)],
  });
  const taggedId = /scratchpad note ([A-Za-z0-9-]+)/.exec(output)?.[1];
  assert(taggedId !== undefined, 'scratchpad_create accepts tags');

  output = await harness.runTool('scratchpad_read', { id: taggedId });
  assert(output.includes('Tags: 工作, idea, ' + 'x'.repeat(32)), 'read shows deduped, trimmed, capped tags');
  output = await harness.runTool('scratchpad_list', { tag: '工作' });
  assert(output.includes(taggedId), 'list filters by tag');
  output = await harness.runTool('scratchpad_list', { tag: 'missing' });
  assert(output.includes('No scratchpad note matches'), 'list reports an empty tag filter');

  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: { id: 'tags-case', text: 'x', tags: ['a', 'A', ' b ', 'c', 'c'], createdAt: 1, updatedAt: 2, attachments: [] } },
  });
  assert(JSON.stringify(result.body.note.tags) === JSON.stringify(['a', 'b', 'c']), 'API dedupes tags case-insensitively');
  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: { id: 'tags-cap', text: 'x', tags: Array.from({ length: 20 }, (_, i) => `t${i}`), createdAt: 1, updatedAt: 2, attachments: [] } },
  });
  assert(result.body.note.tags.length === 12, 'API caps tags at 12');

  output = await harness.runTool('scratchpad_append', { id: taggedId, text: '追加一段' });
  assert(output.includes('Appended'), 'scratchpad_append appends');
  output = await harness.runTool('scratchpad_update', { id: taggedId, text: '重写', tags: ['新标签'] });
  assert(output.includes('Updated'), 'scratchpad_update rewrites');
  let state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.find((item) => item.id === taggedId).tags.join(',') === '新标签', 'update replaces tags');
  await harness.runTool('scratchpad_update', { id: taggedId, text: '再次重写' });
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.find((item) => item.id === taggedId).tags.join(',') === '新标签', 'update without tags keeps them');

  const lean = await harness.request('GET', '/api/scratchpad/export', { query: { attachments: '0' } });
  assert(lean.status === 200 && lean.body.format === 'dsh-scratchpad', 'text-only export document');
  assert(lean.body.notes.flatMap((item) => item.attachments).every((item) => item.data === undefined), 'text-only export omits bytes');

  const full = await harness.request('GET', '/api/scratchpad/export');
  assert(full.headers.get('content-disposition')?.includes('scratchpad-'), 'export is a named download');
  assert(
    full.body.notes.flatMap((item) => item.attachments).some((item) => item.data === Buffer.from([9, 8, 7, 6]).toString('base64')),
    'full export embeds attachment bytes',
  );

  for (const id of ['note-a', 'tags-case', 'tags-cap', taggedId]) {
    await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id } });
  }
  assert((await readdir(join(harness.dir, 'scratchpad', 'files'))).length === 1, 'a soft-deleted note keeps its attachment files for the grace period');

  result = await harness.request('POST', '/api/scratchpad/import', { json: { document: full.body } });
  assert(result.status === 200 && result.body.imported === full.body.notes.length, 'imports a full backup');
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.length === full.body.notes.length, 'import restores every note');
  const restoredAttachment = state.body.notes.find((item) => item.id === 'note-a').attachments[0];
  result = await harness.request('GET', FILES, { query: { id: restoredAttachment.id } });
  assert(result.buffer.equals(Buffer.from([9, 8, 7, 6])), 'import restores attachment bytes');

  await harness.request('POST', '/api/scratchpad/import', { json: { document: full.body } });
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.length === full.body.notes.length, 're-import replaces instead of duplicating');
  assert((await readdir(join(harness.dir, 'scratchpad', 'files'))).length === 1, 're-import cleans the superseded file');

  await harness.request('POST', '/api/scratchpad/import', {
    json: { document: { ...lean.body, notes: lean.body.notes.map((item) => ({ ...item, text: 'only text' })) } },
  });
  state = await harness.request('GET', '/api/scratchpad/notes');
  const leanNote = state.body.notes.find((item) => item.id === 'note-a');
  assert(leanNote.text === 'only text' && leanNote.attachments.length === 1, 'text-only import keeps the live attachment');

  result = await harness.request('POST', '/api/scratchpad/notes', { json: { note: { id: '../../etc/passwd', text: 'x' } } });
  assert(result.status === 400, 'rejects a malformed note id');
  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: { id: 'escape', text: 'x', attachments: [{ id: 'a1', storedName: '../escape.png' }] } },
  });
  assert(result.body.note.attachments.length === 0, 'drops an attachment whose stored name escapes the data directory');
  result = await harness.request('POST', '/api/scratchpad/import', { json: { document: { format: 'other', notes: [] } } });
  assert(result.status === 400, 'rejects a foreign document');
  result = await harness.request('POST', '/api/scratchpad/import', { json: { document: { format: 'dsh-scratchpad', notes: [] } } });
  assert(result.status === 400, 'rejects an empty document');

  // A save carrying the updatedAt the client last saw must be refused when the
  // stored note moved on; the stored version rides along for resolution.
  const staleNote = (updatedAt, text) => ({ id: 'stale', text, createdAt: 1, updatedAt, attachments: [] });
  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: staleNote(10, 'v1'), baseUpdatedAt: 10 },
  });
  assert(result.status === 200, 'a save with a matching base creates the note');
  await harness.request('POST', '/api/scratchpad/notes', { json: { note: staleNote(20, 'v2') } });
  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: staleNote(30, 'v3'), baseUpdatedAt: 10 },
  });
  assert(result.status === 409 && result.body.error?.code === 'scratchpad-conflict', 'a stale base is refused with 409');
  assert(result.body.note?.text === 'v2', 'the 409 body carries the stored version');
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.find((item) => item.id === 'stale').text === 'v2', 'a refused save does not modify the store');
  result = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: staleNote(40, 'v4'), baseUpdatedAt: 20 },
  });
  assert(result.status === 200 && result.body.note.text === 'v4', 'saving against the current base succeeds');
  result = await harness.request('POST', '/api/scratchpad/notes', { json: { note: staleNote(50, 'v5') } });
  assert(result.status === 200 && result.body.note.text === 'v5', 'a save without a base stays unconditional');

  // Soft delete: the note leaves the panel and tools immediately, its files
  // stay on disk for the grace period, and a matching re-save restores it.
  const trashUpload = await harness.request('POST', FILES, { bytes: Buffer.from([3, 4]), query: { name: 't.bin', type: 'application/octet-stream' } });
  const trashNote = { id: 'trash-me', text: '回收站测试', createdAt: 1, updatedAt: 10, attachments: [trashUpload.body.attachment] };
  await harness.request('POST', '/api/scratchpad/notes', { json: { note: trashNote } });
  result = await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'trash-me' } });
  assert(result.status === 200, 'deleting a note answers ok');
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(!state.body.notes.some((item) => item.id === 'trash-me'), 'a deleted note leaves the list');
  output = await harness.runTool('scratchpad_read', { id: 'trash-me' });
  assert(output.includes('No scratchpad note'), 'tools no longer see a deleted note');
  result = await harness.request('GET', FILES, { query: { id: trashUpload.body.attachment.id } });
  assert(result.status === 200, 'the attachment file survives the grace period');
  result = await harness.request('POST', '/api/scratchpad/notes', { json: { note: trashNote } });
  assert(result.status === 200 && result.body.note.deletedAt === 0, 're-saving restores the deleted note (undo)');
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.some((item) => item.id === 'trash-me'), 'the restored note is back in the list');

  // The trash view lists soft-deleted notes; a permanent delete drops the files.
  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'trash-me' } });
  result = await harness.request('GET', '/api/scratchpad/notes', { query: { view: 'trash' } });
  assert(result.body.notes.length === 1 && result.body.notes[0].id === 'trash-me', 'the trash view lists soft-deleted notes');
  state = await harness.request('GET', '/api/scratchpad/notes');
  assert(state.body.notes.some((item) => item.id === 'stale') && !state.body.notes.some((item) => item.id === 'trash-me'),
    'live and trash lists stay disjoint');
  const trashFilesBefore = (await readdir(join(harness.dir, 'scratchpad', 'files'))).length;
  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'trash-me', permanent: true } });
  result = await harness.request('GET', '/api/scratchpad/notes', { query: { view: 'trash' } });
  assert(result.body.notes.length === 0, 'a permanent delete empties the trash entry');
  assert((await readdir(join(harness.dir, 'scratchpad', 'files'))).length === trashFilesBefore - 1,
    'a permanent delete removes the attachment files');

  console.log('notes test passed');
} finally {
  await harness.cleanup();
}
