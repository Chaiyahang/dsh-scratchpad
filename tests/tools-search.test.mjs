import { createHarness, assert } from './helpers.mjs';

const harness = await createHarness();
try {
  await harness.runTool('scratchpad_create', { text: '买牛奶和鸡蛋', tags: ['采购'] });
  await harness.runTool('scratchpad_create', { text: 'review the scratchpad_search PR\n- [ ] write tests' });
  await harness.runTool('scratchpad_create', { text: 'totally unrelated note about weather' });

  const miss = await harness.runTool('scratchpad_search', { query: '不存在的词' });
  assert(miss.includes('No scratchpad note matches'), 'no hit reports clearly');

  const hit = await harness.runTool('scratchpad_search', { query: '牛奶' });
  assert(hit.includes('买牛奶和鸡蛋'), 'CJK keyword matches the note');
  assert(!hit.includes('weather'), 'non-matching notes stay out');

  const context = await harness.runTool('scratchpad_search', { query: 'scratchpad_search' });
  assert(context.includes('review the scratchpad_search PR'), 'snippet carries the text around the hit');

  const both = await harness.runTool('scratchpad_search', { query: 'review tests' });
  assert(both.includes('write tests'), 'every keyword must match (AND)');
  const onlyOne = await harness.runTool('scratchpad_search', { query: 'review weather' });
  assert(onlyOne.includes('No scratchpad note matches'), 'a note matching only some keywords is out');

  const tagHit = await harness.runTool('scratchpad_search', { query: '采购' });
  assert(tagHit.includes('#采购'), 'tag-only matches surface with a tag-hit line');

  const listed = await harness.runTool('scratchpad_list', { query: 'weather' });
  const id = /\[([^\]]+)\]/.exec(listed)?.[1];
  assert(Boolean(id), 'scratchpad_list carries the note id');
  await harness.runTool('scratchpad_delete', { id });
  const afterDelete = await harness.runTool('scratchpad_search', { query: 'weather' });
  assert(afterDelete.includes('No scratchpad note matches'), 'soft-deleted notes stay out of search');

  console.log('tools search test passed');
} finally {
  await harness.cleanup();
}
