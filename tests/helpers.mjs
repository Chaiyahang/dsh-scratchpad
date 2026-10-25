import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { apply } from '../index.js';

/**
 * One isolated Host fixture: a temp data directory, a connection registry that
 * enforces the real "one route per path" rule, captured tools, and stubbed
 * timers so the route watchdog never keeps the process alive.
 */
export async function createHarness() {
  const dir = await mkdtemp(join(os.tmpdir(), 'dsh-scratchpad-test-'));
  const routes = new Map();
  const tools = [];
  const warnings = [];
  const watchdogs = [];

  const connection = {
    fetch: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`connection: exact Fetch route "${route.path}" is already registered`);
        routes.set(route.path, {
          methods: new Set(route.methods),
          requestBody: route.requestBody,
          fetch: route.fetch,
        });
        return () => {
          routes.delete(route.path);
        };
      },
    },
    fetchRoutes: routes,
  };

  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  global.setInterval = (callback) => {
    watchdogs.push(callback);
    return 0;
  };
  global.clearInterval = () => {};

  const makeContext = () => ({
    logger: {
      warn: (...args) => warnings.push(args.join(' ')),
      info() {},
    },
    get(name) {
      if (name === 'dshHomePath') return (...parts) => join(dir, ...parts);
      if (name === 'connection') return connection;
      return undefined;
    },
    effect(fn) {
      fn();
      return () => {};
    },
    inject(names, callback) {
      callback(this);
      return () => {};
    },
    tools: {
      register(definition) {
        tools.push(definition);
        return () => {};
      },
    },
  });

  apply(makeContext());

  const request = async (method, path, options = {}) => {
    const url = new URL(`http://127.0.0.1:1${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const init = { method };
    if (options.json !== undefined) {
      init.body = JSON.stringify(options.json);
      init.headers = { 'content-type': 'application/json' };
    } else if (options.bytes !== undefined) {
      init.body = options.bytes;
    }
    const route = routes.get(path);
    if (route === undefined) throw new Error(`missing route ${method} ${path}`);
    const response = await route.fetch(new Request(url, init));
    const buffer = Buffer.from(await response.arrayBuffer());
    let body = null;
    try {
      body = JSON.parse(buffer.toString('utf8'));
    } catch {}
    return { status: response.status, headers: response.headers, body, buffer };
  };

  const runTool = (name, args = {}) => {
    const definition = tools.find((tool) => tool.name === name);
    if (definition === undefined) throw new Error(`missing tool ${name}`);
    return definition.execute(args, { signal: new AbortController().signal });
  };

  return {
    dir,
    routes,
    tools,
    warnings,
    watchdogs,
    request,
    runTool,
    reload: () => apply(makeContext()),
    async cleanup() {
      global.setInterval = realSetInterval;
      global.clearInterval = realClearInterval;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`ok: ${message}`);
}
