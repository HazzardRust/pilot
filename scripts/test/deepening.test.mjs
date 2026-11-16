/**
 * The architect deepens, then writes seam-first slices (deep-modules S2; L13, A2).
 * One forbidden-pattern lint stays; the phrase pins that once held the deepening rules are
 * gone (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flat, read, sectionOf } from './lib/area-file.mjs';

const ARCHITECT = read('agents/pilot-architect.md');

/** The text under one `## ` heading, up to the next, on one line. */
function section(heading) {
  const text = sectionOf(ARCHITECT, heading);
  assert.notEqual(text, '', `no "## ${heading}" heading`);
  return flat(text);
}

test('the architect does not port the upstream skill', () => {
  const text = section('Decide, and stash what is not yours');
  // lint: no upstream improve-codebase-architecture reference (L13)
  assert.doesNotMatch(text, /improve-codebase-architecture/, 'the upstream skill is not ported (L13)');
});
