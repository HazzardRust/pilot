/**
 * The fundamentalist judges tests for depth (deep-modules S4, spec 3; L7, L9, ADR 0082).
 * Two lints stay: the test pass follows the subtraction pass, and it is never scheduled per
 * slice. The phrase pins are gone (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const SOURCE = read('agents/pilot-fundamentalist.md');
const HEADING = 'The test pass: depth';

const depth = () => {
  const section = sectionOf(SOURCE, HEADING);
  assert.ok(section, `agents/pilot-fundamentalist.md has no "## ${HEADING}" section`);
  return flat(section);
};

test('the test pass follows the subtraction pass', () => {
  // lint: the fundamentalist's pass order (heading exists, in order)
  const subtraction = SOURCE.indexOf('\n## The subtraction pass: what could go\n');
  const testPass = SOURCE.indexOf(`\n## ${HEADING}\n`);
  assert.notEqual(subtraction, -1, 'the subtraction pass heading is gone');
  assert.notEqual(testPass, -1, `no "## ${HEADING}" heading`);
  assert.ok(testPass > subtraction, 'the test pass must come after the subtraction pass');
});

const sentences = () => depth().split(/(?<=[.:])\s/);

test('it is never scheduled per slice', () => {
  // lint: the test pass names no per-slice schedule
  const scheduled = sentences().filter((s) => /\bper[- ]slice\b|\beach slice'?s? (draft )?PR\b/i.test(s) && !/\b(not|no|never)\b/i.test(s));
  assert.deepEqual(scheduled, [], 'the test pass schedules a per-slice review');
});
