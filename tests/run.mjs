import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((file) => file.endsWith('.test.mjs')).sort();

let failed = 0;
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const result = spawnSync(process.execPath, [join(here, file)], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} test file(s) failed`);
  process.exit(1);
}
console.log(`\nall ${files.length} test files passed`);
