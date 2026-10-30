import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
const storeDir = join(harness.dir, 'scratchpad');
const notesFile = join(storeDir, 'notes.json');
try {
  const note = { text: '内容', createdAt: 1, updatedAt: 1, attachments: [] };
  await harness.request('POST', '/api/scratchpad/notes', { json: { note: { ...note, id: 'gen-1' } } });
  await harness.request('POST', '/api/scratchpad/notes', { json: { note: { ...note, id: 'gen-2' } } });
  // gen-1 now exists only in the rotated backup; gen-2 only in notes.json.

  await writeFile(notesFile, '{"revision":9,"notes":[{"id":"to', 'utf8');
  harness.reload(); // cold cache: the next read must actually touch the disk

  const list = await harness.request('GET', '/api/scratchpad/notes');
  assert(list.status === 200 && list.body.notes.length === 1 && list.body.notes[0].id === 'gen-1',
    'a torn notes.json falls back to the rotated backup generation');
  assert(harness.warnings.some((line) => line.includes('unreadable') && line.includes('notes.json.bak')),
    'backup recovery is logged');
  assert((await readdir(storeDir)).some((name) => /^notes\.json\.corrupt-/.test(name)),
    'the corrupt document is archived for manual recovery');

  const save = await harness.request('POST', '/api/scratchpad/notes', { json: { note: { ...note, id: 'gen-3' } } });
  assert(save.status === 200, 'saving after recovery works');
  const healed = JSON.parse(await readFile(notesFile, 'utf8'));
  assert(healed.notes.some((item) => item.id === 'gen-3'), 'the store is healthy again after recovery');

  // A restart with no live file (crash between archive and rewrite) resumes
  // from the backup instead of starting empty.
  await unlink(notesFile);
  harness.reload();
  const resumed = await harness.request('GET', '/api/scratchpad/notes');
  assert(resumed.status === 200 && resumed.body.notes.some((item) => item.id === 'gen-1'),
    'a missing live file falls back to the backup too');

  console.log('recovery test passed');
} finally {
  await harness.cleanup();
}

// No backup at all: an unreadable store must start empty, keep the bytes, and
// accept new writes.
const fresh = await createHarness();
try {
  await mkdir(join(fresh.dir, 'scratchpad'), { recursive: true });
  await writeFile(join(fresh.dir, 'scratchpad', 'notes.json'), 'not json at all', 'utf8');
  fresh.reload(); // the store was warmed empty at apply time; reload over the corrupt bytes

  const list = await fresh.request('GET', '/api/scratchpad/notes');
  assert(list.status === 200 && list.body.notes.length === 0, 'an unreadable store with no backup starts empty');
  assert(fresh.warnings.some((line) => line.includes('empty store')), 'the degraded fallback is logged');
  assert((await readdir(join(fresh.dir, 'scratchpad'))).some((name) => /^notes\.json\.corrupt-/.test(name)),
    'the unreadable bytes are kept for manual recovery');

  const save = await fresh.request('POST', '/api/scratchpad/notes', {
    json: { note: { id: 'reborn', text: 'x', createdAt: 1, updatedAt: 1, attachments: [] } },
  });
  assert(save.status === 200, 'saving works after the degraded start');

  console.log('recovery (no backup) test passed');
} finally {
  await fresh.cleanup();
}
