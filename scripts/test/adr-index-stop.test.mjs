/**
 * A stop on the ADR index names its generator (implementer-gate-steps spec 4, S4): a landing,
 * sync or integrate that stops with `docs/adr/README.md` among its paths tells the reader to run
 * `node scripts/adr-index.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { conflictPaths } = await import('../merge-generated.mjs');

const HINT = '; regenerate docs/adr/README.md with `node scripts/adr-index.mjs`, never by hand';

// lint: a stop on the ADR index names its generator, and the hint survives a failure
test('a stop holding the index names adr-index', () => {
  const out = conflictPaths(['docs/adr/README.md', 'a.mjs']);
  assert.ok(out.startsWith('docs/adr/README.md, a.mjs'), out);
  assert.ok(out.endsWith(HINT), out);
  assert.equal(conflictPaths(['a.mjs']), 'a.mjs');
});

test('the hint survives a resolver failure', () => {
  const out = conflictPaths(['docs/adr/README.md'], 'EISDIR: illegal operation');
  assert.equal(out, `docs/adr/README.md (generated files not resolved: EISDIR: illegal operation)${HINT}`);
});
