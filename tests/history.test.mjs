import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  const NOTES = '/api/scratchpad/notes';
  const HISTORY = '/api/scratchpad/notes/history';
  const note = (text, updatedAt) => ({ id: 'hist-note', text, createdAt: 1, updatedAt, attachments: [] });

  await harness.request('POST', NOTES, { json: { note: note('v1', 1) } });
  await harness.request('POST', NOTES, { json: { note: note('v2', 2) } });
  await harness.request('POST', NOTES, { json: { note: note('v2', 2) } }); // same text: no entry
  let body = await harness.request('GET', HISTORY, { query: { id: 'hist-note' } });
  assert(body.body.ok && body.body.history.length === 1 && body.body.history[0].text === 'v1',
    'an overwrite records the outgoing text exactly once');

  const conflict = await harness.request('POST', NOTES, { json: { note: note('v3', 3), baseUpdatedAt: 999 } });
  assert(conflict.status === 409, 'a conflicting save is refused');
  body = await harness.request('GET', HISTORY, { query: { id: 'hist-note' } });
  assert(body.body.history.length === 1, 'a refused save records no history');

  for (let round = 3; round <= 14; round += 1) {
    await harness.request('POST', NOTES, { json: { note: note('v' + round, round) } });
  }
  body = await harness.request('GET', HISTORY, { query: { id: 'hist-note' } });
  assert(body.body.history.length === 10, 'history is capped at 10 entries');
  assert(body.body.history[0].text === 'v13' && body.body.history[9].text === 'v4', 'history is newest first');

  await harness.runTool('scratchpad_update', { id: 'hist-note', text: 'agent rewrite' });
  body = await harness.request('GET', HISTORY, { query: { id: 'hist-note' } });
  assert(body.body.history[0].text === 'v14', 'an Agent update records the previous text too');

  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'hist-note' } });
  body = await harness.request('GET', HISTORY, { query: { id: 'hist-note' } });
  assert(body.body.history.length === 10, 'a soft delete keeps the history');
  await harness.request('POST', '/api/scratchpad/notes/delete', { json: { id: 'hist-note', permanent: true } });
  body = await harness.request('GET', HISTORY, { query: { id: 'hist-note' } });
  assert(body.body.ok && body.body.history.length === 0, 'a permanent delete drops the history');
  console.log('history test passed');
} finally {
  await harness.cleanup();
}
