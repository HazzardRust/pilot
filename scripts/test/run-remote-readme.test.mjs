/**
 * Wording pins for the run remote (pilot-fork S10): docs/OPERATING.md says where
 * run branches live and how to change it, and the ADR that records the model is
 * in the generated index.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** The body of the section whose heading line is exactly `heading`, up to the next heading of the same or a higher level. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.notEqual(start, -1, `${heading} is missing`);
  const level = heading.match(/^#+/)[0].length;
  const out = [];
  for (const l of lines.slice(start + 1)) {
    const m = l.match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(l);
  }
  return out.join('\n');
}

test('OPERATING.md names the setting and both opt-outs', () => {
  const body = section(read('docs', 'OPERATING.md'), '## Where run branches live');
  assert.match(body, /`pilot\.remote`/);
  assert.match(body, /git config pilot\.remote none/);
  assert.match(body, /git config pilot\.remote <name>/);
  assert.match(body, /`pilot branches prune`/);
});

test('the ADR is indexed', () => {
  const file = fs.readdirSync(path.join(ROOT, 'docs', 'adr'))
    .find((f) => /^\d{4}-run-branches-live-on-the-run-remote\.md$/.test(f));
  assert.ok(file, 'the run-remote ADR is missing');
  const adr = read('docs', 'adr', file);
  for (const h of ['## Context', '## Decision', '## Consequences']) assert.ok(adr.includes(h), h);
  assert.ok(read('docs', 'adr', 'README.md').includes(`(${file})`), `${file} is not in the index`);
});
