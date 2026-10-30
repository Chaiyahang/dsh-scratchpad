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
  const backup = JSON.parse(await readFile(join(storeDir, 'notes.json.bak'), 'utf8'));
  assert(backup.notes.length === 1 && backup.notes[0].id === 'gen-1', 'the previous generation is rotated to notes.json.bak');

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

// Expired soft-deletes are purged (note and attachment files) when the store loads.
const sweeper = await createHarness();
try {
  const dir = join(sweeper.dir, 'scratchpad');
  await mkdir(join(dir, 'files'), { recursive: true });
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const store = {
    version: 1,
    revision: 5,
    notes: [
      { id: 'live', text: 'keep', tags: [], pinned: false, createdAt: 1, updatedAt: 2, deletedAt: 0, attachments: [] },
      { id: 'fresh', text: 'recent trash', tags: [], pinned: false, createdAt: 1, updatedAt: 2, deletedAt: now - day, attachments: [] },
      { id: 'expired', text: 'old trash', tags: [], pinned: false, createdAt: 1, updatedAt: 2, deletedAt: now - 8 * day, attachments: [{ id: 'att-old', name: 'old.png', type: 'image/png', size: 2, kind: 'image', storedName: 'att-old.png' }] },
    ],
  };
  await writeFile(join(dir, 'notes.json'), JSON.stringify(store), 'utf8');
  await writeFile(join(dir, 'files', 'att-old.png'), Buffer.from([9, 9]));
  sweeper.reload();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const list = await sweeper.request('GET', '/api/scratchpad/notes');
  assert(list.body.notes.map((note) => note.id).join(',') === 'live', 'the panel list shows only live notes');
  const onDisk = JSON.parse(await readFile(join(dir, 'notes.json'), 'utf8'));
  const diskIds = onDisk.notes.map((note) => note.id).sort().join(',');
  assert(diskIds === 'fresh,live', 'expired soft-deletes are purged from disk, recent ones kept');
  assert(!(await readdir(join(dir, 'files'))).includes('att-old.png'), 'purged attachments are removed from disk');
  console.log('recovery (purge) test passed');
} finally {
  await sweeper.cleanup();
}
