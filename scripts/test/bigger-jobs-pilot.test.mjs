/**
 * Spec 1, 2 and 14 of `docs/design/bigger-jobs/architecture.md`, on `agents/pilot.md`: a
 * found issue is built in the run by naming grilling's build-now rule (L4, never restated),
 * an added slice's rails carry no count and only "moves no locked decision" still makes a
 * question (L3), and the first turn reads the brief, then each thread taken by `id`.
 *
 * Each pin is a phrase a rewording must keep, not the sentence it sits in.
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

test('the pilot builds a found issue now', () => {
  const grilling = step(3);
  assert.match(grilling, /found issue is built in the run/, 'the build-now clause');
  assert.match(grilling, /grilling skill's build-now rule/, "the clause names grilling's rule rather than restating it");
  assert.doesNotMatch(grilling, /later ticket|candidate ticket/i, 'no default defers found work to a later ticket');
  const queue = step(6);
  assert.match(queue, /found issue, whoever finds it, is an added slice within step 7's rails, built without a question/, 'step 6 builds a found issue whoever finds it');
  assert.match(queue, /only one that moves a locked decision is asked: the grilling skill's build-now rule/, 'step 6 names the rule');
  // QA re-run of itm_113930f2ed32 on Fable at d0cd1edb: flakes blocking a spec line's evidence were asked as "narrow the line, queue the rest".
  assert.match(queue, /never queued as a ticket, even when it stands between a spec line and its evidence/, 'a blocked evidence line is no reason to queue the issue');
  assert.match(queue, /build it rather than narrow the line/, 'the line is kept and the issue built');
});

test('the added-slice rails carry no count', () => {
  const rails = step(7);
  assert.doesNotMatch(rails, /at most 2/, 'no per-run cap on added slices');
  assert.doesNotMatch(rails, /14 slices/, 'no slice ceiling');
  assert.doesNotMatch(rails, /traces to an agreed spec line/, 'an added slice brings its own spec line');
  assert.match(rails, /its own spec line, marked added/, 'rail: its own spec line, marked added');
  assert.match(rails, /its own PR and reviewer/, 'rail: its own PR and reviewer');
  assert.match(rails, /within the per-slice diff limit/, 'rail: within the per-slice diff limit');
  assert.match(rails, /moves no locked decision/, 'rail: moves no locked decision');
  assert.match(rails, /would move a locked decision stays a question/, 'the locked-decision rail is the one that asks');
});

test('the first turn reads the brief then by id', () => {
  const first = flat(/\*\*On a session's first turn[\s\S]*?\n\n/.exec(PILOT)?.[0] ?? '');
  assert.ok(first, 'agents/pilot.md has a first-turn paragraph');
  assert.match(first, /`deck_read` with `open: true, brief: true`/, 'the first read asks for the brief');
  assert.match(first, /by `id` with `messages: <n>`, each thread you take/, 'each thread taken is read by id, with a window (session-row S4)');
});
