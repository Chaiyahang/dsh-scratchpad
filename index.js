/**
 * Host half of the scratchpad panel.
 *
 * Notes and their attachments live here, not in the browser: one JSON document
 * plus one file per attachment under the DSH data directory, so the panel and
 * the Agent tools read and write the same durable store. The client talks to it
 * through the authenticated shared Fetch channel at `/api/scratchpad/*`.
 */
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

const API = '/api/scratchpad';
const DATA_VERSION = 1;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 200_000;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const EXPORT_FORMAT = 'dsh-scratchpad';
const IMPORT_MAX_BYTES = 100 * 1024 * 1024;
const MAX_IMPORT_NOTES = 5000;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 32;
/** Types a browser renders without executing anything; every other served file downloads. */
const INLINE_IMAGE_TYPES = /^image\/(?:avif|bmp|gif|jpeg|jpg|png|webp|x-icon|vnd\.microsoft\.icon)$/;

/** A request-level failure with the HTTP status the channel should report. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function apply(ctx) {
  const baseDir = resolveBaseDir(ctx);
  const filesDir = join(baseDir, 'files');
  const notesFile = join(baseDir, 'notes.json');
  /** One-generation copy of the last good document, rotated in before every write. */
  const backupFile = `${notesFile}.bak`;

  /** `{ revision, notes }`, loaded once and kept in memory. */
  let cache = null;
  let loading = null;
  /** Serializes every mutation and the JSON write that follows it. */
  let queue = Promise.resolve();
  /**
   * Uploaded attachments that no note references yet. Serving them keeps a
   * just-dropped thumbnail working during the debounce before the note saves.
   */
  const recentUploads = new Map();

  // -------------------------------------------------------------------
  // Store
  // -------------------------------------------------------------------

  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function load() {
    if (cache) return cache;
    if (!loading) {
      loading = (async () => {
        let parsed = null;
        try {
          parsed = JSON.parse(await readFile(notesFile, 'utf8'));
        } catch (error) {
          // ENOENT is a first run. Anything else is a torn or corrupt document:
          // archive the bytes for manual recovery, then fall back to the rotated
          // backup — which is also the right source when the live file is gone
          // because a previous recovery already archived it.
          const corrupt = error?.code !== 'ENOENT';
          if (corrupt) await archiveCorruptStore(notesFile);
          try {
            parsed = JSON.parse(await readFile(backupFile, 'utf8'));
            if (corrupt) ctx.logger?.warn?.('scratchpad: notes.json was unreadable; recovered from notes.json.bak');
          } catch {
            parsed = null;
            if (corrupt) ctx.logger?.warn?.('scratchpad: notes.json was unreadable and notes.json.bak did not help; started an empty store (the bytes are kept as notes.json.corrupt-*)');
          }
        }
        const state = sanitizeStore(parsed);
        cache = state !== null ? state : { revision: 0, notes: [] };
        return cache;
      })().finally(() => {
        loading = null;
      });
    }
    return loading;
  }

  async function writeState() {
    await mkdir(filesDir, { recursive: true });
    const body = `${JSON.stringify({ version: DATA_VERSION, revision: cache.revision, notes: cache.notes }, null, 2)}\n`;
    const temp = `${notesFile}.${process.pid}.tmp`;
    const backupTemp = `${backupFile}.${process.pid}.tmp`;
    await writeFile(temp, body, 'utf8');
    // Rotate the current document aside before replacing it, so the previous
    // good generation survives a crash mid-write or a corrupting fault.
    try {
      await copyFile(notesFile, backupTemp);
      await rename(backupTemp, backupFile);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await rename(temp, notesFile);
  }

  /** Run one mutation against the live state, bump the revision, persist. */
  function mutate(operation) {
    return enqueue(async () => {
      const state = await load();
      const result = await operation(state);
      state.revision += 1;
      await writeState();
      return result;
    });
  }

  /** Read-only pass over the live state; loads it if this is the first call. */
  function readState() {
    return load();
  }

  // -------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------

  function json(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  function badRequest(message) {
    return new HttpError(400, message);
  }

  function wrap(handler) {
    return async (request) => {
      try {
        return await handler(request);
      } catch (error) {
        if (error instanceof HttpError) {
          return json({ ok: false, error: { code: 'scratchpad-error', message: error.message } }, error.status);
        }
        ctx.logger?.warn?.(`scratchpad: ${error instanceof Error ? error.stack || error.message : String(error)}`);
        return json({ ok: false, error: { code: 'scratchpad-error', message: 'the scratchpad failed to handle this request' } }, 500);
      }
    };
  }

  async function readBody(request) {
    try {
      return await request.json();
    } catch {
      throw badRequest('body is not JSON');
    }
  }

  // -------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------

  async function handleList() {
    const state = await readState();
    return json({ ok: true, revision: state.revision, notes: state.notes });
  }

  async function handleSave(request) {
    const body = await readBody(request);
    const input = body?.note;
    if (input === null || typeof input !== 'object') throw badRequest('missing note');
    const note = writeNote(input);
    return mutate((state) => {
      const index = state.notes.findIndex((item) => item.id === note.id);
      if (index >= 0) state.notes[index] = note;
      else state.notes.push(note);
      return json({ ok: true, revision: state.revision + 1, note });
    });
  }

  async function handleDeleteNote(request) {
    const body = await readBody(request);
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) throw badRequest('missing note id');
    const attachments = await mutate((state) => {
      const index = state.notes.findIndex((item) => item.id === id);
      if (index < 0) return [];
      const [note] = state.notes.splice(index, 1);
      return note.attachments;
    });
    await removeFiles(attachments);
    return json({ ok: true });
  }

  async function handleUpload(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get('name') || 'attachment').slice(0, 200);
    const type = (url.searchParams.get('type') || '').slice(0, 200);
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.byteLength === 0) throw badRequest('empty file');
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new HttpError(413, 'attachment exceeds 25 MB');
    const attachment = await saveAttachment(bytes, name, type);
    return json({ ok: true, attachment });
  }

  async function handleDeleteFile(request) {
    const body = await readBody(request);
    const storedName = typeof body?.storedName === 'string' ? body.storedName : '';
    if (!/^[A-Za-z0-9-]{1,80}(?:\.[A-Za-z0-9]{1,10})?$/.test(storedName)) throw badRequest('missing attachment name');
    const state = await readState();
    const referenced = state.notes.some((note) => note.attachments.some((item) => item.storedName === storedName));
    if (!referenced) await removeFiles([{ storedName }]);
    return json({ ok: true });
  }

  async function handleExport(request) {
    const url = new URL(request.url);
    const withAttachments = url.searchParams.get('attachments') !== '0';
    const state = await readState();
    const notes = [];
    for (const note of state.notes) {
      const attachments = [];
      for (const attachment of note.attachments) {
        const entry = {
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          kind: attachment.kind,
        };
        if (withAttachments) {
          try {
            const bytes = await readFile(join(filesDir, attachment.storedName));
            entry.data = bytes.toString('base64');
          } catch {
            entry.missing = true;
          }
        }
        attachments.push(entry);
      }
      notes.push({
        id: note.id,
        text: note.text,
        tags: note.tags,
        pinned: note.pinned,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        attachments,
      });
    }
    const exportedAt = new Date().toISOString();
    const stamp = `${exportedAt.slice(0, 10).replace(/-/g, '')}-${exportedAt.slice(11, 19).replace(/:/g, '')}`;
    const document = { format: EXPORT_FORMAT, version: 1, exportedAt, notes };
    return new Response(JSON.stringify(document, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="scratchpad-${stamp}.json"`,
        'cache-control': 'no-store',
      },
    });
  }

  /**
   * Merge a backup back in: same-id notes are replaced, new ids are appended.
   * Attachment ids are re-minted so a repeated import never collides with the
   * files it created last time; replaced notes' old files are removed.
   */
  async function handleImport(request) {
    const declared = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > IMPORT_MAX_BYTES) throw new HttpError(413, 'import is larger than 100 MB');
    const body = await readBody(request);
    const document = body?.document;
    if (document === null || typeof document !== 'object' || document.format !== EXPORT_FORMAT) {
      throw badRequest('not a scratchpad export');
    }
    const rawNotes = Array.isArray(document.notes) ? document.notes.slice(0, MAX_IMPORT_NOTES) : [];
    const stagedFiles = [];
    const stagedNotes = [];
    let totalBytes = 0;
    try {
      for (const raw of rawNotes) {
        if (raw === null || typeof raw !== 'object') continue;
        const attachments = [];
        const rawAttachments = Array.isArray(raw.attachments) ? raw.attachments : [];
        for (const rawAttachment of rawAttachments) {
          if (rawAttachment === null || typeof rawAttachment !== 'object') continue;
          const data = typeof rawAttachment.data === 'string' ? rawAttachment.data : '';
          if (data === '') continue;
          const payload = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
          const bytes = Buffer.from(payload, 'base64');
          if (bytes.byteLength === 0) continue;
          if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new HttpError(413, 'an attachment exceeds 25 MB');
          totalBytes += bytes.byteLength;
          if (totalBytes > IMPORT_MAX_BYTES) throw new HttpError(413, 'import is larger than 100 MB');
          const saved = await saveAttachment(bytes, rawAttachment.name, rawAttachment.type);
          stagedFiles.push(saved);
          attachments.push(saved);
        }
        const note = readNote({
          id: raw.id,
          text: raw.text,
          tags: raw.tags,
          pinned: raw.pinned,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          attachments,
        });
        if (note !== null) stagedNotes.push(note);
      }
    } catch (error) {
      await removeFiles(stagedFiles);
      throw error;
    }
    if (stagedNotes.length === 0) throw badRequest('the export contains no importable notes');

    const obsolete = await mutate((state) => {
      const removed = [];
      for (const note of stagedNotes) {
        const index = state.notes.findIndex((item) => item.id === note.id);
        if (index < 0) {
          state.notes.push(note);
          continue;
        }
        const current = state.notes[index];
        // A text-only export carries no attachment payloads; keep the live files
        // instead of silently dropping them from the merged note.
        const next = note.attachments.length === 0 && current.attachments.length > 0
          ? { ...note, attachments: current.attachments }
          : note;
        if (next.attachments !== current.attachments) removed.push(...current.attachments);
        state.notes[index] = next;
      }
      return removed;
    });
    await removeFiles(obsolete);
    return json({ ok: true, imported: stagedNotes.length, skipped: rawNotes.length - stagedNotes.length });
  }

  async function handleFile(request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) throw badRequest('missing attachment id');
    const state = await readState();
    let attachment = null;
    for (const note of state.notes) {
      const match = note.attachments.find((item) => item.id === id);
      if (match) {
        attachment = match;
        break;
      }
    }
    if (!attachment) attachment = recentUploads.get(id) || null;
    if (!attachment) return new Response('not found', { status: 404 });
    let bytes;
    try {
      bytes = await readFile(join(filesDir, attachment.storedName));
    } catch {
      return new Response('not found', { status: 404 });
    }
    // Inline only what a browser renders without running code — svg, html, pdf
    // and friends are opaque bytes that download instead of rendering, so a
    // hostile upload (or import) can never execute script in the app origin.
    // The sandbox CSP is a second belt: even a mistyped document renders with
    // no scripting and a unique origin.
    const inline = INLINE_IMAGE_TYPES.test(attachment.type) && url.searchParams.get('download') !== '1';
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': inline ? attachment.type : 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'cache-control': 'private, max-age=31536000, immutable',
        'content-security-policy': 'sandbox',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // -------------------------------------------------------------------
  // Attachments on disk
  // -------------------------------------------------------------------

  async function saveAttachment(bytes, name, type) {
    const id = newId();
    const kind = type.startsWith('image/') ? 'image' : 'file';
    const extension = extensionOf(name);
    const storedName = extension ? `${id}${extension}` : id;
    await mkdir(filesDir, { recursive: true });
    await writeFile(join(filesDir, storedName), bytes);
    const attachment = { id, name, type, size: bytes.byteLength, kind, storedName };
    recentUploads.set(id, attachment);
    if (recentUploads.size > 200) {
      const oldest = recentUploads.keys().next().value;
      if (oldest !== undefined) recentUploads.delete(oldest);
    }
    return attachment;
  }

  async function removeFiles(attachments) {
    await Promise.all(attachments.map(async (attachment) => {
      if (!attachment || typeof attachment.storedName !== 'string' || attachment.storedName === '') return;
      try {
        await unlink(join(filesDir, attachment.storedName));
      } catch {}
    }));
  }

  // -------------------------------------------------------------------
  // Agent tools
  // -------------------------------------------------------------------

  function textOutput() {
    return {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    };
  }

  function toolTimes(note) {
    const updated = new Date(note.updatedAt).toISOString();
    const created = new Date(note.createdAt).toISOString();
    return `created ${created}, updated ${updated}`;
  }

  function previewOf(note) {
    const text = note.text.replace(/\s+/g, ' ').trim();
    if (text === '') return '(empty note)';
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }

  function toolSummary(note) {
    const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : null;
    const bits = [`[${note.id}]`, note.pinned ? 'pinned' : null, tags, previewOf(note), `(${note.attachments.length} attachment${note.attachments.length === 1 ? '' : 's'}, updated ${new Date(note.updatedAt).toISOString()})`];
    return bits.filter(Boolean).join(' ');
  }

  function findNote(state, id) {
    return state.notes.find((item) => item.id === id);
  }

  const tools = [
    {
      name: 'scratchpad_list',
      description: 'List the notes in the user\'s Scratchpad panel (the sidebar "便签" page), newest first. Use it before answering questions about what the user has jotted down, or to find a note id for scratchpad_read / scratchpad_append / scratchpad_delete. Returns one line per note with its id, a preview, pin state, attachment count and update time.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: 'Optional case-insensitive text filter applied to note text, tags and attachment names.' },
          tag: { type: 'string', description: 'Only notes carrying this tag (case-insensitive, exact tag).' },
          limit: { type: 'integer', description: `Maximum notes to return (1-${MAX_LIST_LIMIT}, default ${DEFAULT_LIST_LIMIT}).` },
        },
      },
      output: textOutput(),
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        const state = await readState();
        const query = typeof args?.query === 'string' ? args.query.trim().toLowerCase() : '';
        const tag = typeof args?.tag === 'string' ? args.tag.trim().toLowerCase() : '';
        const limit = Math.min(Math.max(Number.isInteger(args?.limit) ? args.limit : DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
        const matching = state.notes
          .filter((note) => tag === '' || note.tags.some((item) => item.toLowerCase() === tag))
          .filter((note) => query === ''
            || note.text.toLowerCase().includes(query)
            || note.tags.some((item) => item.toLowerCase().includes(query))
            || note.attachments.some((item) => item.name.toLowerCase().includes(query)))
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, limit);
        if (matching.length === 0) return state.notes.length === 0 ? 'The scratchpad is empty.' : 'No scratchpad note matches that query.';
        const header = `${state.notes.length} note${state.notes.length === 1 ? '' : 's'} in the scratchpad (showing ${matching.length}):`;
        return [header, ...matching.map((note) => `- ${toolSummary(note)}`)].join('\n');
      },
    },
    {
      name: 'scratchpad_read',
      description: 'Read one Scratchpad note in full, by id. Returns the complete text plus every attachment with its absolute file path, so a file can be read, opened, or attached elsewhere. Attachments live under the DSH data directory; their paths stay valid until the note or attachment is deleted.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'The note id from scratchpad_list.' },
        },
      },
      output: textOutput(),
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        const id = typeof args?.id === 'string' ? args.id : '';
        const state = await readState();
        const note = findNote(state, id);
        if (!note) return `No scratchpad note with id "${id}". Call scratchpad_list to see the available notes.`;
        const lines = [
          `Note ${note.id}`,
          `${toolTimes(note)}${note.pinned ? ', pinned' : ''}`,
        ];
        if (note.tags.length > 0) lines.push(`Tags: ${note.tags.join(', ')}`);
        lines.push('', note.text === '' ? '(empty note)' : note.text);
        if (note.attachments.length > 0) {
          lines.push('', `Attachments (${note.attachments.length}):`);
          for (const attachment of note.attachments) {
            lines.push(`- ${attachment.name} — ${attachment.kind}, ${attachment.type || 'unknown type'}, ${attachment.size} bytes — ${join(filesDir, attachment.storedName)}`);
          }
        }
        return lines.join('\n');
      },
    },
    {
      name: 'scratchpad_create',
      description: 'Create a new note in the user\'s Scratchpad panel. Use it when the user asks to remember, note down, or capture something ("记一下", "remember this", "add a note"). The note appears in the panel; keep the text faithful to what the user wants remembered rather than paraphrasing your own answer.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'The note body to store.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags (max 12, each max 32 characters) shown in the panel filter bar.' },
          pinned: { type: 'boolean', description: 'Pin the note to the top of the panel (default false).' },
        },
      },
      output: textOutput(),
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        const text = typeof args?.text === 'string' ? args.text.slice(0, MAX_TEXT_LENGTH) : '';
        if (text.trim() === '') throw new Error('text must not be empty');
        const now = Date.now();
        const note = {
          id: newId(),
          text,
          tags: readTags(args?.tags),
          pinned: args?.pinned === true,
          createdAt: now,
          updatedAt: now,
          attachments: [],
        };
        await mutate((state) => {
          state.notes.push(note);
        });
        return `Created scratchpad note ${note.id}: ${previewOf(note)}`;
      },
    },
    {
      name: 'scratchpad_append',
      description: 'Append text as a new paragraph to an existing Scratchpad note. Use it to add a follow-up thought, a conclusion, or context the user asked to keep with the note. Use scratchpad_update instead when the existing text itself must be rewritten.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: {
          id: { type: 'string', description: 'The note id from scratchpad_list.' },
          text: { type: 'string', description: 'Text to append on a new line.' },
        },
      },
      output: textOutput(),
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        const id = typeof args?.id === 'string' ? args.id : '';
        const addition = typeof args?.text === 'string' ? args.text.slice(0, MAX_TEXT_LENGTH) : '';
        if (addition.trim() === '') throw new Error('text must not be empty');
        const state = await readState();
        if (!findNote(state, id)) return `No scratchpad note with id "${id}". Call scratchpad_list to see the available notes.`;
        await mutate((current) => {
          const note = findNote(current, id);
          if (!note) return;
          note.text = note.text.trimEnd() === '' ? addition : `${note.text.trimEnd()}\n${addition}`;
          note.updatedAt = Date.now();
        });
        const updated = findNote(await readState(), id);
        return `Appended to scratchpad note ${id} (${updated ? updated.text.length : 0} characters now).`;
      },
    },
    {
      name: 'scratchpad_update',
      description: 'Replace the text of an existing Scratchpad note. Use it to rewrite, shorten, or restructure a note the user already has; prefer scratchpad_append when keeping the existing text and adding more.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: {
          id: { type: 'string', description: 'The note id from scratchpad_list.' },
          text: { type: 'string', description: 'The complete replacement text for the note.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional replacement tag list; omit to keep the current tags.' },
        },
      },
      output: textOutput(),
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        const id = typeof args?.id === 'string' ? args.id : '';
        const text = typeof args?.text === 'string' ? args.text.slice(0, MAX_TEXT_LENGTH) : '';
        const state = await readState();
        if (!findNote(state, id)) return `No scratchpad note with id "${id}". Call scratchpad_list to see the available notes.`;
        await mutate((current) => {
          const note = findNote(current, id);
          if (!note) return;
          note.text = text;
          if (Array.isArray(args?.tags)) note.tags = readTags(args.tags);
          note.updatedAt = Date.now();
        });
        return `Updated scratchpad note ${id} (${text.length} characters).`;
      },
    },
    {
      name: 'scratchpad_delete',
      description: 'Delete a Scratchpad note and its stored attachments. Use it only when the user explicitly asks to remove or forget a note; the deletion is permanent.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'The note id from scratchpad_list.' },
        },
      },
      output: textOutput(),
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        const id = typeof args?.id === 'string' ? args.id : '';
        const state = await readState();
        const note = findNote(state, id);
        if (!note) return `No scratchpad note with id "${id}". Nothing was deleted.`;
        const attachments = await mutate((current) => {
          const index = current.notes.findIndex((item) => item.id === id);
          if (index < 0) return [];
          const [removed] = current.notes.splice(index, 1);
          return removed.attachments;
        });
        await removeFiles(attachments);
        return `Deleted scratchpad note ${id}.`;
      },
    },
  ];

  // -------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------

  ctx.effect(() => {
    void load().catch((error) => ctx.logger?.warn?.(`scratchpad: could not load notes: ${String(error)}`));
  }, 'scratchpad: warm the note store');

  ctx.inject(['connection'], (scoped) => {
    try {
      const connection = scoped.get('connection');
      if (!connection || typeof connection.fetch?.register !== 'function') return;
      const register = connection.fetch.register.bind(connection.fetch);
      // One route per PATH: the registry keys exact routes by pathname and keeps
      // the allowed methods on that one entry. Registering GET and POST for the
      // same path separately throws and would abort the whole batch.
      const definitions = [
        { path: `${API}/notes`, handlers: { GET: handleList, POST: handleSave } },
        { path: `${API}/notes/delete`, handlers: { POST: handleDeleteNote } },
        { path: `${API}/files`, handlers: { GET: handleFile, POST: handleUpload } },
        { path: `${API}/files/delete`, handlers: { POST: handleDeleteFile } },
        { path: `${API}/export`, handlers: { GET: handleExport } },
        { path: `${API}/import`, handlers: { POST: handleImport } },
      ].map(({ path, handlers }) => ({
        path,
        methods: Object.keys(handlers),
        fetch: wrap(async (request) => {
          const handler = handlers[request.method];
          return handler ? handler(request) : new Response('not found', { status: 404 });
        }),
      }));

      // A previous plugin generation may still own a path after a hot reload.
      // Patch that entry in place instead of failing, and re-check on a timer in
      // case the retired generation's disposer removes it later.
      const ensure = () => {
        for (const route of definitions) {
          const existing = connection.fetchRoutes?.get?.(route.path);
          if (existing) {
            existing.fetch = route.fetch;
            existing.methods = new Set(route.methods);
            existing.requestBody = 'buffered';
            continue;
          }
          try {
            scoped.effect(() => register({
              path: route.path,
              methods: route.methods,
              requestBody: 'buffered',
              fetch: route.fetch,
            }), `scratchpad: ${route.path}`);
          } catch (error) {
            ctx.logger?.warn?.(`scratchpad: could not register ${route.path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      };
      ensure();
      scoped.effect(() => {
        const timer = setInterval(ensure, 5000);
        return () => clearInterval(timer);
      }, 'scratchpad: route watchdog');
    } catch (error) {
      ctx.logger?.warn?.(`scratchpad: route registration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ctx.inject(['tools'], (scoped) => {
    for (const definition of tools) {
      scoped.effect(() => scoped.tools.register(definition), `scratchpad: tool ${definition.name}`);
    }
  });
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

function resolveBaseDir(ctx) {
  try {
    const dshHomePath = typeof ctx.get === 'function' ? ctx.get('dshHomePath') : undefined;
    if (typeof dshHomePath === 'function') {
      const dir = dshHomePath('scratchpad');
      if (typeof dir === 'string' && dir !== '') return dir;
    }
  } catch {}
  const home = process.env.DSH_HOME || join(os.homedir(), '.dsh');
  return join(home, 'scratchpad');
}

function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function extensionOf(name) {
  if (typeof name !== 'string') return '';
  const match = /\.[A-Za-z0-9]{1,10}$/.exec(name);
  return match ? match[0].toLowerCase() : '';
}

function toTime(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : Date.now();
}

function readAttachment(input) {
  if (input === null || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' ? input.id : '';
  const storedName = typeof input.storedName === 'string' ? input.storedName : '';
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return null;
  if (!/^[A-Za-z0-9-]{1,80}(?:\.[A-Za-z0-9]{1,10})?$/.test(storedName)) return null;
  const name = typeof input.name === 'string' ? input.name.slice(0, 200) : 'attachment';
  const type = typeof input.type === 'string' ? input.type.slice(0, 200) : '';
  const size = Number.isFinite(input.size) && input.size >= 0 ? Math.round(input.size) : 0;
  const kind = input.kind === 'image' ? 'image' : 'file';
  return { id, name, type, size, kind, storedName };
}

/** Normalize tags: trimmed, single-spaced, unique case-insensitively, bounded. */
function readTags(input) {
  if (!Array.isArray(input)) return [];
  const tags = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    if (tag === '') continue;
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/** Normalize a parsed store document; null means "not a store document". */
function sanitizeStore(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    revision: Number.isInteger(parsed.revision) ? parsed.revision : 0,
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(readNote).filter(Boolean) : [],
  };
}

/** Move an unreadable document aside, keeping the bytes for manual recovery. */
async function archiveCorruptStore(path) {
  try {
    await rename(path, `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  } catch {}
}

function readNote(input) {
  if (input === null || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' ? input.id : '';
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return null;
  const text = typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT_LENGTH) : '';
  const attachments = Array.isArray(input.attachments) ? input.attachments.map(readAttachment).filter(Boolean) : [];
  return {
    id,
    text,
    tags: readTags(input.tags),
    pinned: input.pinned === true,
    createdAt: toTime(input.createdAt),
    updatedAt: toTime(input.updatedAt),
    attachments,
  };
}

/** Validate a client-supplied note; throws a 400 on malformed input. */
function writeNote(input) {
  const note = readNote(input);
  if (note === null) throw new HttpError(400, 'note is malformed');
  return note;
}
