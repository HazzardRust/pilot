/**
 * The take and the cut follow the base line (pilot-develop-line S8, spec 4, 4d, 4e; A2, A6, A7).
 * Only a forbidden command is tested: no feature PR hard-codes `pilot` as its base.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Normalised to one line: git checks these out with CRLF on Windows. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

test('the architect does not hard-code pilot as the base', () => {
  // lint: the architect's feature PR command never says `--base pilot --head`
  assert.doesNotMatch(read('agents/pilot-architect.md'), /--base pilot --head/, 'no feature PR hard-codes pilot');
});
