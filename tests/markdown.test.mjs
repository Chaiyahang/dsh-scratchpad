import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

const slice = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`missing markers ${startMarker}`);
  return source.slice(start, end);
};

const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });
const build = new Function('h', `${slice('function highlightNodes', 'function toPlainExcerpt')}; return { renderInline, renderMarkdown, wrapMarkdown, toggleLinePrefix };`);
const { renderInline, renderMarkdown, wrapMarkdown, toggleLinePrefix } = build(createElement);
const excerpt = new Function(`${slice('function toPlainExcerpt', '// ---------------------------------------------------------------------\n    // Focus requests')}; return toPlainExcerpt;`)();

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
  console.log(`ok: ${message}`);
}

function flatten(nodes, out = []) {
  for (const node of nodes) {
    if (Array.isArray(node)) {
      flatten(node, out);
      continue;
    }
    if (typeof node === 'string') {
      out.push(node);
      continue;
    }
    out.push(`${node.type}${node.props.checked === true ? '[x]' : node.props.checked === false ? '[ ]' : ''}`);
    flatten(node.children, out);
  }
  return out;
}

let toggled = [];
let blocks = renderMarkdown('- [ ] first\n- [x] second\n- plain\n\n# Title\n\n**bold** and `code`', (line) => toggled.push(line), 'Task');
let marks = flatten(blocks);
assert(marks.includes('input[ ]') && marks.includes('input[x]'), 'task checkboxes carry checked state');
assert(blocks.filter((block) => block.type === 'div').length === 2, 'two task rows');
blocks[0].children[0].props.onChange();
assert(toggled.length === 1 && toggled[0] === 0, 'toggle reports the raw source line index');
assert(marks.includes('h2') && marks.includes('strong') && marks.includes('code'), 'heading, bold and inline code render');

blocks = renderMarkdown('```js\nconst a = 1;\n```\n\nafter', () => {}, 'Task');
assert(blocks[0].type === 'pre' && blocks[0].children[0].children[0] === 'const a = 1;', 'fenced code block keeps its body');
assert(blocks[1].type === 'p' && flatten([blocks[1]]).includes('after'), 'paragraph after the fence');

blocks = renderMarkdown('1. one\n2. two\n\n> quote\n\nplain line one\nplain line two', () => {}, 'Task');
assert(blocks.some((block) => block.type === 'ol' && block.children[0].length === 2), 'ordered list');
assert(blocks.some((block) => block.type === 'blockquote'), 'blockquote');
const paragraph = blocks.find((block) => block.type === 'p');
assert(paragraph && flatten([paragraph]).join('').includes('plain line one\nplain line two'), 'consecutive lines stay one paragraph');

for (const sample of ['', '\n\n', '- [ ]', '#', '> ', '```', '---', '* * *', 'text\n```\ncode', '- a\n- b\n\n1. c\n\n# d']) {
  renderMarkdown(sample, () => {}, 'Task');
}
const random = Array.from({ length: 200 }, () => '- [x]'.slice(0, Math.floor(Math.random() * 8))).join('\n');
renderMarkdown(random, () => {}, 'Task');
assert(true, 'parser terminates on edge-case and random input');

assert(excerpt('- [x] done\n- [ ] open\n## Head') === '☑ done\n☐ open\nHead', 'card excerpt swaps markers for glyphs');
const inline = flatten(renderInline('a **b** `c` *d* e'));
assert(inline.join('|') === 'a |strong|b| |code|c| |em|d| e', 'inline tokens map to elements');

const bare = renderInline('看 https://example.com/a。 next').find((node) => node.type === 'a');
assert(bare && bare.props.href === 'https://example.com/a', 'a bare URL becomes a link without trailing punctuation');
assert(bare.props.rel === 'noopener noreferrer', 'links carry rel=noopener');
assert(typeof bare.props.onClick === 'function', 'links open through the panel opener');
assert(renderInline('https://example.com/a。 next').at(-1) === '。 next', 'trailing punctuation stays text');
const cjk = renderInline('看 https://example.com/a，然后').find((node) => node.type === 'a');
assert(cjk && cjk.props.href === 'https://example.com/a', 'full-width punctuation ends a bare URL');

const labelled = renderInline('[label](https://example.com/x?y=1)').find((node) => node.type === 'a');
assert(labelled && labelled.props.href === 'https://example.com/x?y=1' && flatten([labelled]).includes('label'),
  'markdown links render with their label');
const hostile = renderInline('[x](javascript:alert(1)) [y](/relative) z');
assert(!hostile.some((node) => node.type === 'a'), 'non-http(s)/mailto targets stay literal text');
assert(renderInline('~~gone~~ kept').some((node) => node.type === 'del'), 'strikethrough renders');

const emptyWrap = wrapMarkdown('abc', 1, 1, '**');
assert(emptyWrap.text === 'a****bc' && emptyWrap.start === 3 && emptyWrap.end === 3,
  'an empty selection inserts the marker pair with the caret inside');
const wrappedSel = wrapMarkdown('abc', 1, 2, '**');
assert(wrappedSel.text === 'a**b**c' && wrappedSel.start === 3 && wrappedSel.end === 4,
  'a selection gets wrapped and stays selected');
const unwrapped = wrapMarkdown('a**b**c', 1, 6, '**');
assert(unwrapped.text === 'abc' && unwrapped.start === 1 && unwrapped.end === 2,
  'unwrapping removes the marker pair and keeps the inner selection');

const hits = flatten(renderInline('Hello WORLD, **wor** `wor`', 'wor'));
assert(hits.filter((token) => token === 'mark').length === 3, 'search hits become <mark> spans inside plain, bold and code text');
assert(hits.join('').includes('WORLD'), 'marks keep the original casing of the hit');
assert(flatten(renderInline('abc def', '')).every((token) => token !== 'mark'), 'no needle renders no marks');
assert(flatten(renderInline('abc abc', 'abc')).filter((token) => token === 'mark').length === 2, 'every occurrence is marked');

let prefix = toggleLinePrefix('one\ntwo', 0, 7, 'ul');
assert(prefix.text === '- one\n- two', 'ul applies to every selected line');
prefix = toggleLinePrefix(prefix.text, 0, prefix.text.length, 'ul');
assert(prefix.text === 'one\ntwo', 'a second ul click removes the markers again');
prefix = toggleLinePrefix('one\ntwo', 0, 7, 'ol');
assert(prefix.text === '1. one\n2. two', 'ol numbers the lines by position');
prefix = toggleLinePrefix('1. one\n2. two', 0, prefix.text.length, 'ol');
assert(prefix.text === 'one\ntwo', 'an ol click on a numbered list strips the numbers');
prefix = toggleLinePrefix('## Head\nplain', 0, 13, 'ul');
assert(prefix.text === '- Head\n- plain', 'an existing block marker is replaced by the target one');
prefix = toggleLinePrefix('# One\n### Two', 0, prefix.text.length, 'heading');
assert(prefix.text === 'One\nTwo', 'a heading click replaces any heading level and a second click clears it');
prefix = toggleLinePrefix('- a\n\n- b', 0, 8, 'ul');
assert(prefix.text === 'a\n\nb', 'blank lines stay blank when toggling a list');
prefix = toggleLinePrefix('', 0, 0, 'ul');
assert(prefix.text === '- ' && prefix.start === 0 && prefix.end === 2, 'an empty editor gets the marker inserted');
prefix = toggleLinePrefix('task line', 0, 9, 'heading');
assert(prefix.text === '## task line', 'heading applies the H2 marker');

console.log('markdown test passed');
