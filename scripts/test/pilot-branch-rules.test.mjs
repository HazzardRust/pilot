/**
 * S5 of pilot-branch: the pilot's prompt cuts and lands by the pilot branch and names the
 * merge order (spec 2, 3, 4, 5; L5, L14, L15, L20, L23). Only lints stay (ADR NNNN): the
 * retired merge, ready and landing steps stay out of the real `agents/pilot.md`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const flat = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');
const pilot = flat('agents/pilot.md');
/** The text from one heading to the next heading of any level. */
const section = (heading) => {
  const start = pilot.indexOf(heading);
  assert.ok(start >= 0, `agents/pilot.md has "${heading}"`);
  const end = pilot.slice(start + heading.length).search(/ #{2,3} /);
  return pilot.slice(start, end < 0 ? undefined : start + heading.length + end);
};

test('step 9 runs neither pilot landing nor pilot land, and nothing lets the pilot merge', () => {
  // lint: forbidden patterns
  const step9 = section('### 9. Gate 2 and ready');
  assert.doesNotMatch(step9, /`pilot land`/, 'the pilot never runs pilot land (gate2-lands L7)');
  assert.doesNotMatch(pilot, /standing rule/, 'no standing rule lets the pilot merge (L23)');
  assert.doesNotMatch(pilot, /gh pr merge/);
});

test('pilot.md writes no Stands on line', () => {
  // lint: forbidden patterns, the stacked-PR line and exit code
  assert.doesNotMatch(pilot, /Stands on/);
  assert.doesNotMatch(pilot, /exit 3/, 'base and integrate no longer exit 3 for a stack');
});

// lander S10 (spec 4; seam from S7): the page offers no second Sign off.
test('step 9 offers no second Sign off', () => {
  // lint: forbidden patterns
  const step9 = section('### 9. Gate 2 and ready');
  assert.doesNotMatch(step9, /offers Sign off again/, 'after S7 the page offers no second Sign off');
  assert.doesNotMatch(step9, /`pilot land`/);
});

// Test 5 of the slice, "the pilot prompt stays inside its measured budget", is the existing
// pin in measure-prompt.test.mjs, which S5 lowers to its measured figure; one pin, not two.
