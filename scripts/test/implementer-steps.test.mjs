/**
 * implementer-gate-steps S2: lint on the implementer's own steps. The wording of the
 * lessons the steps carry is not pinned; a forbidden offer is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const SOURCE = read('agents/pilot-implementer.md');
const WHERE = flat(sectionOf(SOURCE, 'Where you work'));

test('Where you work does not offer a junction to the checkout', () => {
  assert.notEqual(WHERE.indexOf('git worktree add'), -1, 'Where you work no longer creates the worktree');
  // lint: the worktree installs its own dependencies, never a junction to the checkout's
  assert.doesNotMatch(WHERE, /junction/i, "Where you work offers a junction to the checkout's dependencies");
});
