import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  const FILES = '/api/scratchpad/files';
  const attach = await harness.request('POST', FILES, { bytes: Buffer.from([9]), query: { name: 'shot.png', type: 'image/png' } });
  const note = { id: 'snap-note', text: 'snapshot me', createdAt: 1, updatedAt: 2, attachments: [attach.body.attachment] };
  await harness.request('POST', '/api/scratchpad/notes', { json: { note } });

  const snapshotsDir = join(harness.dir, 'scratchpad', 'snapshots');
  // The warmup effect already took today's snapshot (an empty store), so the
  // daily-dedup path is done. Exercise the forced path instead: an import
  // always snapshots before merging. Seed 8 past-dated folders so rotation
  // has work to do.
  for (let day = 1; day <= 8; day += 1) {
    const name = '2026-01-' + String(day).padStart(2, '0') + 'T00-00-00-000Z';
    await mkdir(join(snapshotsDir, name, 'files'), { recursive: true });
  }

  const imported = await harness.request('POST', '/api/scratchpad/import', {
    json: { document: { format: 'dsh-scratchpad', version: 1, notes: [{ id: 'imported-note', text: 'from backup', createdAt: 1, updatedAt: 1 }] } },
  });
  assert(imported.body?.ok === true, 'import succeeds');
  await new Promise((resolve) => setTimeout(resolve, 150));

  const dirs = (await readdir(snapshotsDir)).sort();
  // 8 seeded + warmup + pre-import = 10, rotation keeps the newest 7.
  assert(dirs.length === 7, 'rotation keeps 7 snapshot folders');
  const seededLeft = dirs.filter((name) => name.startsWith('2026-01')).length;
  assert(seededLeft === 5, 'oldest seeded folders were pruned, kept 5 of 8');
  const preImport = dirs[dirs.length - 1];
  assert(preImport.endsWith('-pre-import'), 'the forced snapshot is labelled pre-import');
  const stored = JSON.parse(await readFile(join(snapshotsDir, preImport, 'notes.json'), 'utf8'));
  assert(stored.notes.some((item) => item.id === 'snap-note'), 'snapshot carries the note document');
  const snapshottedFiles = await readdir(join(snapshotsDir, preImport, 'files'));
  assert(snapshottedFiles.includes(attach.body.attachment.storedName), 'snapshot hard-links the attachment file');

  // Same-day dedup: the hourly sweep must not add another folder today.
  harness.watchdogs[0]();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const after = (await readdir(snapshotsDir)).sort();
  assert(after.join() === dirs.join(), 'the sweep the same day adds no snapshot');
  console.log('snapshot test passed');
} finally {
  await harness.cleanup();
}
