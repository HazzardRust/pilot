/**
 * Spec 1, 2, 3 and 9 of `docs/design/bigger-jobs/architecture.md`, on
 * `agents/pilot-architect.md`: a fold over 200 lines is sliced in the run rather than sent to
 * `main` as a candidate ticket, 20 slices is an aim and past it is one run unless the user asks
 * for a split, a found issue enters the design as an added spec line and slice with no
 * question (naming grilling's build-now rule, L4, never restating it), and the architect
 * holds up to six read-only children.
 *
 * Only forbidden-pattern lints stay (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const ARCHITECT = read('agents/pilot-architect.md');

/** The text under one `## ` heading, on one line. */
const section = (heading) => {
  const text = sectionOf(ARCHITECT, heading);
  assert.notEqual(text, '', `no "## ${heading}" heading`);
  return flat(text);
};

/** Item 8 of the artefact's section list, up to item 9, on one line. */
const item8 = () => {
  const text = section('The artefact');
  const from = text.indexOf('8. **Slices**');
  assert.notEqual(from, -1, 'no item 8 in The artefact');
  const to = text.indexOf('9. **Acceptance', from);
  return text.slice(from, to === -1 ? undefined : to);
};

test('a big fold is sliced in the run', () => {
  const deepening = section('Decide, and stash what is not yours');
  // lint: a bigger fold is not sent to main as a ticket
  assert.doesNotMatch(deepening, /candidate ticket/i, 'a bigger fold is no longer sent to main as a ticket');
});

test('past 20 is one run', () => {
  const slices = item8();
  // lint: no forced split past 20 and no 22-slice ceiling
  assert.doesNotMatch(slices, /runs of at most 20/i, 'past 20 is no longer a forced split');
  assert.doesNotMatch(slices, /reach 22/i, 'no 22-slice ceiling');
});

test('a big request is not cut to its first part', () => {
  const scope = section('Scope discipline');
  // lint: no "first coherent part" cut of a big request
  assert.doesNotMatch(scope, /first coherent part|bigger than one artefact/i, 'a big request is no longer cut to its first part');
});

test('the architect no longer holds four children', () => {
  const research = section('Read before you design');
  // lint: the old child count is gone
  assert.doesNotMatch(research, /up to four/i, 'the old count is gone');
});
