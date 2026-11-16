/**
 * The ADR that records the run remote (pilot-fork S10) is in the generated index.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// lint: the run-remote ADR keeps its three headings and is in the index
test('the ADR is indexed', () => {
  const file = fs.readdirSync(path.join(ROOT, 'docs', 'adr'))
    .find((f) => /^\d{4}-run-branches-live-on-the-run-remote\.md$/.test(f));
  assert.ok(file, 'the run-remote ADR is missing');
  const adr = read('docs', 'adr', file);
  for (const h of ['## Context', '## Decision', '## Consequences']) assert.ok(adr.includes(h), h);
  assert.ok(read('docs', 'adr', 'README.md').includes(`(${file})`), `${file} is not in the index`);
});
