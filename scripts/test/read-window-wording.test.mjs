/**
 * session-row S4 (spec 6, 7): the pilot's Yellow rule fills each lane from its own queue,
 * and does not order one stage before the other. The windows an agent's reads name are
 * not pinned here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

test("the pilot's Yellow no longer orders one stage before the other", () => {
  const yellow = flat(sectionOf(read('agents/pilot.md'), 'Yellow'));
  // lint: Yellow carries no cross-stage ordering (three-lanes S10)
  assert.doesNotMatch(yellow, /red then green|green then red/, 'Yellow still orders one stage before the other');
});
