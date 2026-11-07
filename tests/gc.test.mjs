import { readdir, writeFile } from 'node:fs/promises';
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
  await writeFile(join(filesDir, 'orphan-any.png'), Buffer.from([4]));

  harness.watchdogs[0]();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const entries = (await readdir(filesDir)).sort();
  assert(!entries.includes('orphan-old.png') && !entries.includes('orphan-any.png'),
    'unreferenced files are swept regardless of age');
  assert(entries.includes(keep.body.attachment.storedName), 'trash-referenced files are kept');
  console.log('gc test passed');
} finally {
  await harness.cleanup();
}
