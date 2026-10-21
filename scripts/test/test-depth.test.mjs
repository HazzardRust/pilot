/**
 * The fundamentalist judges tests for depth (deep-modules S4, spec 3; L7, L9, ADR 0082).
 * Its one pass over the feature gains a test pass after the subtraction pass: three kinds
 * of shallow test are findings, a wording pin is not, and it runs once, never per slice.
 * The prose is the interface, so each pin holds a rule, not a sentence: a rewording that
 * keeps the heading, the three kinds and the wording-pin exception keeps these green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fieldOf, flat, read, sectionOf } from './lib/area-file.mjs';

const SOURCE = read('agents/pilot-fundamentalist.md');
const HEADING = 'The test pass: depth';

const depth = () => {
  const section = sectionOf(SOURCE, HEADING);
  assert.ok(section, `agents/pilot-fundamentalist.md has no "## ${HEADING}" section`);
  return flat(section);
};

test('the test pass follows the subtraction pass', () => {
  const subtraction = SOURCE.indexOf('\n## The subtraction pass: what could go\n');
  const testPass = SOURCE.indexOf(`\n## ${HEADING}\n`);
  assert.notEqual(subtraction, -1, 'the subtraction pass heading is gone');
  assert.notEqual(testPass, -1, `no "## ${HEADING}" heading`);
  assert.ok(testPass > subtraction, 'the test pass must come after the subtraction pass');
});

const sentences = () => depth().split(/(?<=[.:])\s/);

test('three kinds of shallow test are findings', () => {
  const text = depth();
  assert.match(text, /reach\w* past (the|its) interface/i, 'the test pass never names a test reaching past the interface');
  assert.match(text, /rewrite check\b[^.]*\bfail/i, 'the test pass never names a test whose rewrite check would fail');
  assert.match(text, /prose pin[^.]*\bbehavio/i, 'the test pass never names a prose pin standing in for a behaviour');
  assert.ok(
    sentences().some((s) => /\b(three|these) kinds\b/i.test(s) && /\bfindings\b/i.test(s) && !/wording pin/i.test(s)),
    'the test pass never says the three kinds are findings',
  );
});

test('a wording pin is not a finding', () => {
  assert.ok(
    sentences().some((s) => /wording pin/i.test(s) && /\b(not|no|never|isn't)\b[^.]*\bfinding/i.test(s)),
    'no sentence in the test pass excludes a wording pin from the findings',
  );
});

test('it runs once, never per slice', () => {
  const scheduled = sentences().filter((s) => /\bper[- ]slice\b|\beach slice'?s? (draft )?PR\b/i.test(s) && !/\b(not|no|never)\b/i.test(s));
  assert.deepEqual(scheduled, [], 'the test pass schedules a per-slice review');
  assert.match(fieldOf(SOURCE, 'description'), /\brun once\b/, 'the description no longer says the review is run once');
});
