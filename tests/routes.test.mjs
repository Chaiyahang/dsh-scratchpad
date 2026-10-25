import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  assert(harness.routes.size === 6, `one route per path (got ${harness.routes.size})`);
  assert(
    [...harness.routes.get('/api/scratchpad/notes').methods].sort().join(',') === 'GET,POST',
    'notes route carries GET and POST',
  );
  assert(
    [...harness.routes.get('/api/scratchpad/files').methods].sort().join(',') === 'GET,POST',
    'files route carries GET and POST',
  );
  assert(harness.warnings.length === 0, `no registration warnings (got ${harness.warnings.join(' | ')})`);

  const get = await harness.request('GET', '/api/scratchpad/notes');
  assert(get.status === 200 && Array.isArray(get.body.notes), 'GET notes dispatches');
  const save = await harness.request('POST', '/api/scratchpad/notes', {
    json: { note: { id: 'route-note', text: 'route check', createdAt: 1, updatedAt: 2, attachments: [] } },
  });
  assert(save.status === 200 && save.body.note.text === 'route check', 'POST notes dispatches');

  const unknown = await harness.request('PUT', '/api/scratchpad/notes');
  assert(unknown.status === 404, 'an undeclared method on a registered path answers 404');

  // A hot reload must patch existing entries instead of failing the batch.
  const warningsBefore = harness.warnings.length;
  harness.reload();
  assert(harness.routes.size === 6, 'reload keeps exactly six routes');
  assert(harness.warnings.length === warningsBefore, 'reload registers without warnings');
  const afterReload = await harness.request('GET', '/api/scratchpad/notes');
  assert(afterReload.status === 200, 'patched route still dispatches after reload');

  // A retired generation may remove a path; the watchdog must restore it.
  harness.routes.delete('/api/scratchpad/export');
  harness.watchdogs[harness.watchdogs.length - 1]();
  assert(harness.routes.has('/api/scratchpad/export'), 'watchdog restores a removed route');

  console.log('routes test passed');
} finally {
  await harness.cleanup();
}
