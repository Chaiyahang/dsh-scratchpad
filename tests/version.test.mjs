import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const match = /const VERSION = '([^']+)'/.exec(client);
if (match === null) throw new Error('client.js has no VERSION constant');
if (match[1] !== pkg.version) {
  throw new Error(`client.js VERSION ${match[1]} does not match package.json ${pkg.version}`);
}
console.log(`ok: panel version ${match[1]} matches package.json`);
console.log('version test passed');
