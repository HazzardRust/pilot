/**
 * S5 of pilot-branch: the pilot's prompt cuts and lands by the pilot branch and names the
 * merge order (spec 2, 3, 4, 5; L5, L14, L15, L20, L23). Sentence pins on the real
 * `agents/pilot.md` and `agents/pilot-architect.md`; whitespace is not the wording.
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

test('step 9 frees the lane at the press and runs neither pilot landing nor pilot land', () => {
  const step9 = section('### 9. Gate 2 and ready');
  assert.match(step9, /the press frees the lane/, 'gate2-frees-lane S9');
  assert.match(step9, /you run no `pilot landing`/, 'gate2-frees-lane S9');
  assert.doesNotMatch(step9, /`pilot land`/, 'the pilot never runs pilot land (gate2-lands L7)');
  assert.doesNotMatch(pilot, /standing rule/, 'no standing rule lets the pilot merge (L23)');
  assert.doesNotMatch(pilot, /gh pr merge/);
});

test('pilot.md opens the feature PR against pilot and writes no Stands on line', () => {
  const shape = section('## The shape of a run');
  assert.match(shape, /pilot branch/, 'the shape names the pilot branch');
  assert.match(shape, /cut from[^.]*`pilot`/, 'every run is cut from it');
  assert.match(shape, /only the user merges/);
  assert.match(section('### 1. Problem and spec'), /run `pilot base`, then `pilot sync`/, 'taking a ticket bases, then syncs: sync refuses with no pilot branch (L20; FA F8)');
  assert.match(pilot, /opens the feature PR as a \*\*draft\*\* against `pilot`/, 'one-integration-line S9 (A1): the feature PR targets pilot');
  assert.doesNotMatch(pilot, /Stands on/);
  assert.doesNotMatch(pilot, /exit 3/, 'base and integrate no longer exit 3 for a stack');
  const architect = flat('agents/pilot-architect.md');
  assert.match(architect, /git worktree add -b design\/<slug> <path> <remote>\/pilot/);
});

test('the closing report names the main PR with a merge commit', () => {
  const ending = section('## Ending a run');
  // The landing SHA is the report body's, which the deck writes from the record (lander S10, S15).
  // one-integration-line S9 (spec 3, A1): the first human step is the main PR from land's line.
  assert.match(ending, /"Merge #<n> with a merge commit, never squash"/);
  assert.match(ending, /land's `main gets pilot:` line/, 'the PR is taken from land\'s line');
  assert.match(ending, /with `by hand` the PR it names to open, with `unknown` the open `pilot` → main PR to find/, 'both other readings');
  assert.match(ending, /branch protection on the default branch/, 'L23: the human steps recommend it (FA F13)');
});

// red-lands-on-pilot S1 (spec 3, 5; L4, L5, L8, L10): a refusal goes to QA, a rejection is reverted. lander S10 (spec 4;
// seam from S7): the page offers no second Sign off, so every `NOT landed` goes to the lander.
test('step 9 routes every refusal to the lander', () => {
  const step9 = section('### 9. Gate 2 and ready');
  assert.match(step9, /every `NOT landed`[^.]*`pilot-lander`/, 'every refusal goes to a lander');
  assert.doesNotMatch(step9, /offers Sign off again/, 'after S7 the page offers no second Sign off');
  assert.doesNotMatch(step9, /`pilot land`/);
});

test('a rejected feature is reverted by a human step', () => {
  const ending = section('## Ending a run');
  assert.match(ending, /revert[^.]*`pilot`|`pilot`[^.]*revert/, 'L10: a revert, never a rewind');
  assert.match(ending, /rejected[^.]*revert[^.]*same press/, 'L10: landed through the same press');
});

test('the merge-conflict skill covers a merge', () => {
  assert.match(pilot, /\| `resolving-merge-conflicts` \| A rebase or merge that stops on a conflict\. \|/, 'L8');
});

// Test 5 of the slice, "the pilot prompt stays inside its measured budget", is the existing
// pin in measure-prompt.test.mjs, which S5 lowers to its measured figure; one pin, not two.
