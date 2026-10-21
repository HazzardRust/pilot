// `deck/README.md` maps the deck (audit-f1-f7 S10, spec 12): the Module column must equal the
// `deck/*.mjs` and `deck/ui/*.mjs` listing, so the map cannot fall out of date without a red test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// The Module column of the '## Modules' table, as paths relative to deck/.
function deckReadmeModules(text) {
  const section = text.split(/^## Modules\s*$/m)[1] ?? '';
  const body = section.split(/^## /m)[0];
  return body.split('\n')
    .map((line) => /^\|\s*`([^`]+)`\s*\|/.exec(line)?.[1])
    .filter(Boolean);
}

const ls = (dir) => fs.readdirSync(path.join(ROOT, 'deck', dir))
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => path.posix.join(dir, f));

test('every deck module is listed', () => {
  const actual = [...ls(''), ...ls('ui')].sort();
  assert.deepEqual(deckReadmeModules(read('deck', 'README.md')).sort(), actual);
});

test('the README covers every top-level directory', () => {
  const dirs = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => d.name);
  const layout = read('README.md').split(/^## Layout\s*$/m)[1].split(/^## /m)[0];
  const rows = new Set(layout.split('\n').map((l) => /^\|\s*\[?`([^`/]+)\//.exec(l)?.[1]).filter(Boolean));
  assert.deepEqual(dirs.filter((d) => !rows.has(d)), []);
});

test('README says where to start', () => {
  assert.match(read('README.md'), /start here/i);
});
