import { readdir, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  const FILES = '/api/scratchpad/files';
  const keep = await harness.request('POST', FILES, { bytes: Buffer.from([1]), query: { name: 'keep.png', type: 'image/png' } });
  const note = { id: 'keep-note', text: 'x', createdAt: 1, updatedAt: 2, attachments: [keep.body.attachment] };
  await harness.request('POST', '/api/scratchpad/notes', { json: { note } });
  // Soft-delete: the note (and its files) stays in the store for the trash window.
  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'keep-note' } });

  const filesDir = join(harness.dir, 'scratchpad', 'files');
  await writeFile(join(filesDir, 'orphan-old.png'), Buffer.from([3]));
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(join(filesDir, 'orphan-old.png'), twoHoursAgo, twoHoursAgo);
  await writeFile(join(filesDir, 'orphan-fresh.png'), Buffer.from([4]));

  harness.watchdogs[0]();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const entries = (await readdir(filesDir)).sort();
  assert(!entries.includes('orphan-old.png'), 'an old unreferenced orphan is swept');
  assert(entries.includes('orphan-fresh.png'), 'a fresh orphan survives the grace window');
  assert(entries.includes(keep.body.attachment.storedName), 'trash-referenced files are kept');
  console.log('gc test passed');
} finally {
  await harness.cleanup();
}
