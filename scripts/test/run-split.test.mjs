/**
 * run-chaining S5 (spec 1, 3 via A4, 10): a DAG over the one-run bound comes back from
 * the architect as runs, the pilot asks the split once and only then, and a later run of
 * a split is stored as a ticket whose body the next run's first turn can start from.
 *
 * What is left are lints: the retired wording of a forced split, a ceiling and a restated
 * estimate stays out of the architect's §8 (ADR NNNN: prose is not a test target).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const between = (source, start, end, what) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${what}: "${start}" not found`);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
};

const oneLine = (text) => text.replace(/\s+/g, ' ');

// bigger-jobs S3 (spec 3): 20 slices is an aim, not a refusal; past it is one run unless the user asks.
test('past 20 slices the architect cuts one run unless the user asks for a split', () => {
  // lint: forbidden pattern, the forced split
  const slices = oneLine(between(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance', 'artefact §8'));
  assert.doesNotMatch(slices, /runs of at most 20/i, 'past 20 is still a forced split');
});

test('a run has no slice ceiling', () => {
  // lint: forbidden pattern, the 22-slice ceiling
  const slices = oneLine(between(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance', 'artefact §8'));
  assert.doesNotMatch(slices, /reach 22/i, 'a 22-slice ceiling is still stated');
});

// ticket-states S11 (A6): the skill's Size section became Estimates, so the pointer moves with it.
test("the architect points at the skill's Estimates section and does not restate a figure", () => {
  // lint: forbidden patterns, the retired section and any restated figure
  const slices = oneLine(between(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance', 'artefact §8'));
  assert.doesNotMatch(slices, /"Size"/, 'the architect still points at the retired Size section');
  assert.doesNotMatch(
    slices,
    /\d+ ?min|minutes per slice|\d+ ?h(ours?)?\b|5 to 7 hours/i,
    'the architect restates an Estimates figure instead of referring to it',
  );
});
