/**
 * docs/OPERATING.md's "The deck's secret" section (deck-token spec 6): it names the file the
 * secret lives in, says it is never printed or posted, says it does not stop a process running
 * as you (L8), and names the command that rotates it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { secretFile } from '../../hooks/lib/deck-secret.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'OPERATING.md'), 'utf8');

function section() {
  const start = doc.indexOf("\n## The deck's secret\n");
  assert.notEqual(start, -1, `docs/OPERATING.md has no "## The deck's secret" section`);
  const rest = doc.slice(start + 1);
  const next = rest.slice(2).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

test('OPERATING.md says where it lives and that it is never printed', () => {
  const text = section().replace(/\s+/g, ' ');
  assert.ok(text.includes(`\`${path.basename(secretFile())}\``), 'the section does not name the secret file in a code span');
  assert.ok(text.includes('never printed or posted'), 'the section does not say it is never printed or posted');
  assert.ok(text.includes('does not stop any process running as you'), 'the section does not say what it does not stop: a process running as you');
  assert.ok(text.includes('`pilot deck --rotate`'), 'the section does not name `pilot deck --rotate`');
});
