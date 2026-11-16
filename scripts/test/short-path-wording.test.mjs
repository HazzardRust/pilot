// short-path S4 (spec 1, 2, 5, 6; L5, A2, A3): the pilot's definition keeps the headings the short path hangs on and
// ADR 0168 exists. Only headings and a file are tested, no phrase.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADR = 'docs/adr/0168-a-small-ticket-takes-the-short-path.md';

test('the pilot keeps the short path headings and its ADR', () => {
  // lint: the headings the short path hangs on exist, and ADR 0168 exists
  const pilot = fs.readFileSync(path.join(ROOT, 'agents/pilot.md'), 'utf8');
  for (const heading of ['## Yellow', '### 3. Grilling, with the user', '### 9. Gate 2 and ready']) {
    assert.ok(pilot.includes(`\n${heading}\n`), `agents/pilot.md lost its heading ${heading}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, ADR)), `${ADR} does not exist`);
});
