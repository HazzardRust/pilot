/**
 * The pilot's definition keeps the hand-off section free of friction. Forbidden-pattern lint
 * only; what the prose says is not pinned here (ADR 0180).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const PILOT = read('agents/pilot.md');

/** A section of the pilot's definition as one line; a missing one fails here, not as a vacuous pass. */
function section(heading) {
  const text = flat(sectionOf(PILOT, heading));
  assert.notEqual(text, '', `agents/pilot.md has no "## ${heading}"`);
  return text;
}

test('the hand-off section asks for no friction', () => {
  // lint: the hand-off writes no friction of its own
  assert.doesNotMatch(section('When your own context fills'), /friction/i, 'the hand-off asks for a friction summary');
});
