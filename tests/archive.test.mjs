import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  const NOTES = '/api/scratchpad/notes';
  const note = (text, updatedAt, extra) => ({ id: 'arch-note', text, createdAt: 1, updatedAt, attachments: [], ...extra });

  await harness.request('POST', NOTES, { json: { note: note('active draft', 10) } });
  let list = await harness.request('GET', NOTES, { query: { include: 'trash' } });
  assert(list.body.notes.length === 1 && list.body.archived.length === 0, 'a fresh note is live and unarchived');

  // Archive: the panel saves the note with an archivedAt timestamp.
  await harness.request('POST', NOTES, { json: { note: note('active draft', 11, { archivedAt: 100 }) } });
  list = await harness.request('GET', NOTES, { query: { include: 'trash' } });
  assert(list.body.notes.length === 0, 'an archived note leaves the live list');
  assert(list.body.archived.length === 1 && list.body.archived[0].text === 'active draft', 'an archived note appears in the archive list');
  assert(list.body.trashed.length === 0, 'archiving is not deleting');

  const archiveView = await harness.request('GET', NOTES, { query: { view: 'archive' } });
  assert(archiveView.body.notes.length === 1, 'view=archive lists archived notes');
  const plain = await harness.request('GET', NOTES);
  assert(plain.body.notes.length === 0, 'the default list stays live-only');

  // Metadata-only archive keeps Agent authorship.
  await harness.runTool('scratchpad_create', { text: 'agent note' });
  let tools = await harness.request('GET', NOTES);
  const agentNote = tools.body.notes.find((item) => item.text === 'agent note');
  await harness.request('POST', NOTES, { json: { note: { ...agentNote, archivedAt: 101 } } });
  list = await harness.request('GET', NOTES, { query: { include: 'trash' } });
  const archivedAgent = list.body.archived.find((item) => item.id === agentNote.id);
  assert(archivedAgent && archivedAgent.source === 'agent', 'archiving keeps the Agent flag');

  // Agent tools still see archived notes, marked.
  const output = await harness.runTool('scratchpad_list', { query: 'agent note' });
  assert(output.includes('archived'), 'scratchpad_list marks archived notes');
  const search = await harness.runTool('scratchpad_search', { query: 'agent note' });
  assert(search.includes('archived'), 'scratchpad_search marks archived hits');

  // Unarchive returns the note to the live list.
  await harness.request('POST', NOTES, { json: { note: { ...archivedAgent, archivedAt: 0 } } });
  list = await harness.request('GET', NOTES, { query: { include: 'trash' } });
  assert(list.body.notes.some((item) => item.id === agentNote.id && !item.archivedAt), 'unarchiving restores the note to the live list');

  // Deleting from archive goes to trash (soft), not the void.
  await harness.request('POST', NOTES, { json: { note: note('to delete', 20, { archivedAt: 102 }) } });
  await harness.request('POST', NOTES + '/delete', { json: { id: 'arch-note' } });
  list = await harness.request('GET', NOTES, { query: { include: 'trash' } });
  assert(list.body.trashed.length === 1 && list.body.archived.length === 0, 'deleting an archived note moves it to trash');

  // Bring the notes back to the live list so the export has content.
  await harness.request('POST', NOTES, { json: { note: note('active draft', 30, { archivedAt: 0 }) } });
  await harness.request('POST', NOTES, { json: { note: { ...agentNote, archivedAt: 0, updatedAt: 40 } } });

  // Markdown export: live notes only (trashed/archived excluded), ids filter honored.
  const md = await harness.request('POST', '/api/scratchpad/export-md', { json: {} });
  const mdText = md.buffer.toString('utf8');
  assert((md.headers.get('content-type') || '').startsWith('text/markdown'), 'md export serves markdown');
  assert((md.headers.get('content-disposition') || '').includes('.md'), 'md export is a named download');
  assert(mdText.includes('active draft') && mdText.includes('agent note'), 'md export carries live note text');
  assert(!mdText.includes('to delete'), 'md export skips trashed notes');
  assert(mdText.includes('## '), 'md export structures notes as headings');

  const mdPicked = await harness.request('POST', '/api/scratchpad/export-md', { json: { ids: [agentNote.id] } });
  const pickedText = mdPicked.buffer.toString('utf8');
  assert(pickedText.includes('agent note') && !pickedText.includes('active draft'), 'md export honors an ids filter');
  const mdNone = await harness.request('POST', '/api/scratchpad/export-md', { json: { ids: ['missing-id'] } });
  assert(!mdNone.buffer.toString('utf8').includes('## '), 'md export with no matching ids yields an empty document');

  console.log('archive test passed');
} finally {
  await harness.cleanup();
}
