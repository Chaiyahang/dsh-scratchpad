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
  assert((await readdir(join(harness.dir, 'scratchpad', 'files'))).length === 0, 'deleting notes removes attachment files');

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

  console.log('notes test passed');
} finally {
  await harness.cleanup();
}
