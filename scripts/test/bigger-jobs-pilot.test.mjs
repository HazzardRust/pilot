/**
 * Spec 1, 2 and 14 of `docs/design/bigger-jobs/architecture.md`, on `agents/pilot.md`: a
 * found issue is built in the run by naming grilling's build-now rule (L4, never restated),
 * an added slice's rails carry no count and only "moves no locked decision" still makes a
 * question (L3), and the first turn reads the brief, then each thread taken by `id`.
 *
 * Only forbidden-pattern lints stay (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read } from './lib/area-file.mjs';

const PILOT = read('agents/pilot.md');

/** The text of one `### <n>.` step, up to the next heading, on one line. */
const step = (n) => {
  const section = new RegExp(`\\n### ${n}\\. [^\\n]*\\n([\\s\\S]*?)(?=\\n##)`).exec(PILOT);
  assert.ok(section, `agents/pilot.md has no step ${n}`);
  return flat(section[1]);
};

test('no default defers found work to a later ticket', () => {
  // lint: step 3 names no "later ticket" / "candidate ticket"
  assert.doesNotMatch(step(3), /later ticket|candidate ticket/i, 'no default defers found work to a later ticket');
});

test('the added-slice rails carry no count', () => {
  const rails = step(7);
  // lint: no per-run cap, slice ceiling or agreed-spec-line trace in step 7's rails
  assert.doesNotMatch(rails, /at most 2/, 'no per-run cap on added slices');
  assert.doesNotMatch(rails, /14 slices/, 'no slice ceiling');
  assert.doesNotMatch(rails, /traces to an agreed spec line/, 'an added slice brings its own spec line');
});
