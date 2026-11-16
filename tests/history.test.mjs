import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  const NOTES = '/api/scratchpad/notes';
  const HISTORY = '/api/scratchpad/notes/history';
  const MIN = 60 * 1000;
  const T0 = 1_800_000_000_000;
  const note = (text, updatedAt) => ({ id: 'hist-note', text, createdAt: 1, updatedAt, attachments: [] });
  const history = async () => (await harness.request('GET', HISTORY, { query: { id: 'hist-note' } })).body.history;

  // The merge rule: a text is recorded only when its own timestamp sits at
  // least 10 minutes after the newest recorded entry — texts that lived
  // shorter are typing-burst intermediates and are collapsed away.
  await harness.request('POST', NOTES, { json: { note: note('v1', T0) } });
  await harness.request('POST', NOTES, { json: { note: note('v2', T0 + MIN) } });
  let items = await history();
  assert(items.length === 1 && items[0].text === 'v1' && items[0].updatedAt === T0,
    'the first overwrite records the starting text');

  await harness.request('POST', NOTES, { json: { note: note('v3', T0 + 2 * MIN) } });
  await harness.request('POST', NOTES, { json: { note: note('v4', T0 + 11 * MIN) } });
  items = await history();
  assert(items.length === 1 && items[0].text === 'v1', 'a typing burst collapses to its starting text');

  await harness.request('POST', NOTES, { json: { note: note('v5', T0 + 12 * MIN) } });
  items = await history();
  assert(items.length === 2 && items[0].text === 'v4' && items[0].updatedAt === T0 + 11 * MIN,
    'a text born after the window is recorded');

  await harness.request('POST', NOTES, { json: { note: note('v6', T0 + 13 * MIN) } });
  items = await history();
  assert(items.length === 2 && items[0].text === 'v4', 'a text born right after a record stays merged');

  // An explicit checkpoint (⌘S, 记一下, Agent edits, imports) records
  // regardless of the window.
  await harness.request('POST', NOTES, { json: { note: note('v5c', T0 + 14 * MIN), checkpoint: true } });
  items = await history();
  assert(items.length === 3 && items[0].text === 'v6' && items[0].updatedAt === T0 + 13 * MIN,
    'a checkpoint records the replaced text even inside the burst window');

  await harness.request('POST', NOTES, { json: { note: note('v6c', T0 + 14 * MIN + 1), checkpoint: true } });
  items = await history();
  assert(items.length === 4 && items[0].text === 'v5c', 'a second checkpoint right after still records');

  await harness.request('POST', NOTES, { json: { note: note('v7', T0 + 30 * MIN) } });
  await harness.request('POST', NOTES, { json: { note: note('v8', T0 + 31 * MIN) } });
  items = await history();
  assert(items.length === 5 && items[0].text === 'v7' && items[0].updatedAt === T0 + 30 * MIN,
    'the next session after another gap records again');

  // Fill the cap with well-spaced single saves; the oldest drops off.
  for (let round = 9; round <= 21; round += 1) {
    await harness.request('POST', NOTES, { json: { note: note('v' + round, T0 + round * 11 * MIN) } });
  }
  items = await history();
  assert(items.length === 10, 'history is capped at 10 entries');
  assert(items[0].text === 'v20' && items[9].text === 'v11', 'history is newest first');

  const listed = await harness.request('GET', NOTES);
  assert(listed.body.notes.find((item) => item.id === 'hist-note').historyCount === 10,
    'list responses carry the per-note history count');
  const counted = await harness.request('POST', NOTES, { json: { note: note('v20b', T0 + 260 * MIN), checkpoint: true } });
  assert(counted.body.note.historyCount === 10, 'save responses carry the fresh history count (capped)');
  assert((await history())[0].text === 'v21', 'the checkpoint recorded the replaced text');

  // A checkpoint on an unchanged text (autosave beat ⌘S) records the current
  // version once; pressing it again does not duplicate.
  const same = await harness.request('POST', NOTES, { json: { note: note('v20b', T0 + 261 * MIN), checkpoint: true } });
  assert(same.status === 200 && same.body.note.historyCount === 10, 'a checkpoint on an unchanged text saves fine');
  assert((await history())[0].text === 'v20b', 'a checkpoint on an unchanged text records the current version');
  await harness.request('POST', NOTES, { json: { note: note('v20b', T0 + 262 * MIN), checkpoint: true } });
  items = await history();
  assert(items.length === 10 && items[0].text === 'v20b', 'a repeated checkpoint of the same text does not duplicate');

  // A checkpointed first save records the finished version of a new note.
  const fresh = await harness.request('POST', NOTES, {
    json: { note: { id: 'fresh-note', text: 'first version', createdAt: 1, updatedAt: 5, attachments: [] }, checkpoint: true },
  });
  assert(fresh.body.note.historyCount === 1, 'a checkpointed first version of a new note is recorded');
  const freshHistory = (await harness.request('GET', HISTORY, { query: { id: 'fresh-note' } })).body.history;
  assert(freshHistory.length === 1 && freshHistory[0].text === 'first version', 'the fresh note history holds the finished text');

  const conflict = await harness.request('POST', NOTES, { json: { note: note('vX', T0 + 999 * MIN), baseUpdatedAt: 999 } });
  assert(conflict.status === 409, 'a conflicting save is refused');
  assert((await history()).length === 10, 'a refused save records no history');

  await harness.runTool('scratchpad_update', { id: 'hist-note', text: 'agent rewrite' });
  items = await history();
  assert(items.length === 10 && items[0].text === 'v20b', 'an Agent update records the previous text too');

  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'hist-note' } });
  assert((await history()).length === 10, 'a soft delete keeps the history');
  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'hist-note', permanent: true } });
  assert((await history()).length === 0, 'a permanent delete drops the history');
  console.log('history test passed');
} finally {
  await harness.cleanup();
}
