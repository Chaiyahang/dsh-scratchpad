import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('async function attachConversationFiles');
const end = source.indexOf('// ---------------------------------------------------------------------\n    // Lightweight Markdown rendering', start);
if (start < 0 || end < 0) throw new Error('attachConversationFiles not found');
const attachConversationFiles = new Function(`${source.slice(start, end)}; return attachConversationFiles;`)();

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`ok: ${message}`);
}

const attachments = [
  { id: 'a1', name: 'photo.png', type: 'image/png' },
  { id: 'a2', name: 'notes.pdf', type: 'application/pdf' },
];

let createdFiles = [];
let released = [];
let addedIds = [];
const conversation = {
  createDrafts(sessionId, files) {
    createdFiles = files;
    return files.map((_, index) => ({ id: `draft-${index}` }));
  },
  releaseDraftAttachments(drafts) {
    released = drafts;
  },
};
const sessions = { scope: (id) => (id === 's1' ? { get: (name) => (name === 'conversation' ? conversation : undefined) } : undefined) };
const inputActions = {
  addAttachments(ids) {
    addedIds = ids;
    return true;
  },
};

let result = await attachConversationFiles({
  attachments,
  sessionId: 's1',
  sessions,
  inputActions,
  readFile: async () => new Blob(['x'], { type: 'image/png' }),
});
assert(result.attached.length === 2 && result.failed.length === 0, 'attaches every readable file');
assert(createdFiles.length === 2 && createdFiles[0] instanceof File, 'files are materialized as browser File objects');
assert(addedIds.join(',') === 'draft-0,draft-1', 'draft ids reach the composer');

addedIds = [];
released = [];
inputActions.addAttachments = () => false;
result = await attachConversationFiles({
  attachments,
  sessionId: 's1',
  sessions,
  inputActions,
  readFile: async () => new Blob(['x'], { type: 'image/png' }),
});
assert(result.attached.length === 0 && result.failed.length === 2, 'reports a locked composer as a failure');
assert(released.length === 2, 'releases drafts the composer refused');

result = await attachConversationFiles({
  attachments,
  sessionId: 's1',
  sessions,
  inputActions: { addAttachments: () => true },
  readFile: async (attachment) => (attachment.id === 'a2' ? null : new Blob(['x'], { type: 'image/png' })),
});
assert(result.attached.length === 1 && result.failed.length === 1 && result.failed[0].id === 'a2', 'keeps readable files and reports the missing one');

result = await attachConversationFiles({ attachments, sessionId: 's2', sessions, inputActions: { addAttachments: () => true }, readFile: async () => null });
assert(result.attached.length === 0 && result.failed.length === 2, 'falls back when the session has no conversation service');

console.log('attach test passed');
