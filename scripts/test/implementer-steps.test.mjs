/**
 * implementer-gate-steps S2 (spec 1, 3, 5, 6, 7, 8): the implementer's own steps carry the
 * six lessons the audit found it re-learning every run: edit with Edit or Write, install the
 * worktree before the first test, loop on the slice's own files, run the full suite past the
 * 120 s default, read its pin figure off `measure-prompt`, and hand a reviewer a ready
 * worktree. Each pin is a phrase, never a paragraph, so a reword keeps it green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const SOURCE = read('agents/pilot-implementer.md');
const WHERE = flat(sectionOf(SOURCE, 'Where you work'));
const LOOP = flat(sectionOf(SOURCE, 'The loop'));

/** L1's sentence, verbatim, as the architecture artefact locks it. */
const L1 =
  "Change a file with the Edit or Write tool, never a heredoc, `sed -i` or Python's text mode: on Windows those mangle escapes and write CRLF.";

/** The prose from `anchor` to `end`, or to the section's end; fails when the anchor is gone. */
function between(text, anchor, end) {
  const start = text.indexOf(anchor);
  assert.notEqual(start, -1, `no "${anchor}" to pin`);
  const stop = end ? text.indexOf(end, start + anchor.length) : -1;
  return text.slice(start, stop === -1 ? undefined : stop);
}

test('the edit rule is in Where you work', () => {
  assert.ok(WHERE.includes(L1), "Where you work does not carry L1's edit rule verbatim");
});

test('the worktree is installed before the first test', () => {
  const add = WHERE.indexOf('git worktree add');
  assert.notEqual(add, -1, 'Where you work no longer creates the worktree');
  assert.ok(WHERE.indexOf('`npm ci`', add) > add, 'Where you work does not name `npm ci` after `git worktree add`');
  assert.doesNotMatch(WHERE, /junction/i, "Where you work offers a junction to the checkout's dependencies");
});

test("red and green run the slice's own files", () => {
  assert.ok(LOOP.includes('`node --test <files>`'), 'The loop does not name `node --test <files>` for red and green');
  assert.ok(LOOP.includes('once, at the phase gate'), 'The loop does not keep the full suite to once, at the phase gate');
});

test('the gate runs the suite past the 120 s default', () => {
  const step3 = between(LOOP, '3. The tests', '4. Build');
  assert.ok(step3.includes('`run_in_background`'), 'step 3 does not name `run_in_background`');
  assert.ok(step3.includes('600000'), 'step 3 does not name a 600000 ms timeout');
  assert.match(step3, /read\w* (?:its|the) log/, 'step 3 does not read the log to its counts');
});

test('the pin figure has its command', () => {
  assert.ok(LOOP.includes('`node scripts/measure-prompt.mjs`'), 'The loop does not name `node scripts/measure-prompt.mjs`');
  assert.match(LOOP, /headroom/, 'The loop does not name the headroom');
});

test("a reviewer runs in the implementer's worktree", () => {
  const review = between(LOOP, 'Then a fresh-context review', 'Children are');
  assert.match(review, /worktree/, "the review paragraph does not give the reviewer the worktree's path");
  assert.match(review, /installs nothing/, 'the review paragraph does not say the reviewer installs nothing');
});
