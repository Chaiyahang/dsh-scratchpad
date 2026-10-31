import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

const start = source.indexOf('    const OPEN_SHORTCUTS = [');
const end = source.indexOf('    // ---------------------------------------------------------------------\n    // One-time migration', start);
if (start < 0 || end < 0) throw new Error('shortcut markers not found');
const body = source.slice(start, end);

const build = new Function('t', 'isMacPlatform', body + '\nreturn { OPEN_SHORTCUTS, NEW_SHORTCUTS, SEARCH_SHORTCUTS, shortcutCandidates };');
const t = (key) => 'L:' + key;
const { OPEN_SHORTCUTS, NEW_SHORTCUTS, SEARCH_SHORTCUTS, shortcutCandidates } = build(t, () => true);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`ok: ${message}`);
}

const sets = [
  ['open', OPEN_SHORTCUTS],
  ['new', NEW_SHORTCUTS],
  ['search', SEARCH_SHORTCUTS],
];

for (const [slot, variants] of sets) {
  const candidates = shortcutCandidates(variants, t, () => {});
  assert(candidates.length === variants.length, slot + ' candidates map 1:1');
  assert(candidates.every((candidate) => candidate.slot === slot),
    slot + ' candidates carry their slot (hint routing depends on it)');
  assert(candidates.filter((candidate) => candidate.titleHint).length === 1,
    slot + ' has exactly one title-hint candidate');
  const first = candidates[0];
  assert(first.definition.label() === 'L:' + variants[0].labelKey, 'labels resolve through the locale');
  assert(first.definition.regions.includes('editable'), 'bindings cover editable regions');
}
assert(sets.every(([, variants]) => variants.every((variant) => variant.code && variant.modifiers.length > 0)),
  'every variant declares a key and modifiers');

console.log('shortcut test passed');
