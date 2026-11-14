import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  const FILES = '/api/scratchpad/files';
  const upload = await harness.request('POST', FILES, { bytes: Buffer.from('%PDF-1.4 fake'), query: { name: 'doc.pdf', type: 'application/pdf' } });
  assert(upload.body.ok, 'pdf uploads');
  const served = await harness.request('GET', FILES, { query: { id: upload.body.attachment.id } });
  assert(served.headers.get('content-type') === 'application/pdf', 'pdf serves as application/pdf');
  assert((served.headers.get('content-disposition') || '').startsWith('inline'), 'pdf is not forced to download');
  assert(served.headers.get('content-security-policy') === null, 'pdf skips the sandbox CSP so the viewer can spawn');
  const png = await harness.request('POST', FILES, { bytes: Buffer.from([1]), query: { name: 'a.png', type: 'image/png' } });
  const servedPng = await harness.request('GET', FILES, { query: { id: png.body.attachment.id } });
  assert(servedPng.headers.get('content-security-policy') === 'sandbox', 'images keep the sandbox CSP');

  await harness.runTool('scratchpad_create', { text: 'from the agent' });
  let list = await harness.request('GET', '/api/scratchpad/notes');
  assert(list.body.notes[0].source === 'agent', 'agent-created notes carry the source flag');
  const agentNote = list.body.notes[0];
  await harness.request('POST', '/api/scratchpad/notes', { json: { note: { ...agentNote, text: 'user edited' } } });
  list = await harness.request('GET', '/api/scratchpad/notes');
  assert(!list.body.notes[0].source, 'a panel save clears the flag');
  await harness.runTool('scratchpad_update', { id: agentNote.id, text: 'agent again' });
  list = await harness.request('GET', '/api/scratchpad/notes');
  assert(list.body.notes[0].source === 'agent', 'an agent update re-flags the note');
  console.log('pdf/source test passed');
} finally {
  await harness.cleanup();
}
