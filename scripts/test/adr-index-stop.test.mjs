/**
 * A stop on the ADR index names its generator (implementer-gate-steps spec 4, S4): a landing,
 * sync or integrate that stops with `docs/adr/README.md` among its paths tells the reader to run
 * `node scripts/adr-index.mjs`, and the merge-conflict skill regenerates the index rather than
 * merging its rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { conflictPaths } = await import('../merge-generated.mjs');

const HINT = '; regenerate docs/adr/README.md with `node scripts/adr-index.mjs`, never by hand';

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

test('the skill names the generator', () => {
  const skill = fs.readFileSync(new URL('../../skills/resolving-merge-conflicts/SKILL.md', import.meta.url), 'utf8');
  const step = skill.split(/\r?\n/).find((line) => line.startsWith('3. **Resolve each hunk.**'));
  assert.ok(step, 'step 3 is present');
  assert.match(step, /`node scripts\/adr-index\.mjs`/);
  assert.match(step, /never merged by hand/);
});
