/**
 * Spec 1, 2, 3 and 9 of `docs/design/bigger-jobs/architecture.md`, on
 * `agents/pilot-architect.md`: a fold over 200 lines is sliced in the run rather than sent to
 * `main` as a candidate ticket, 20 slices is an aim and past it is one run unless the user asks
 * for a split, a found issue enters the design as an added spec line and slice with no
 * question (naming grilling's build-now rule, L4, never restating it), and the architect
 * holds up to six read-only children.
 *
 * Each pin is a phrase a rewording must keep, not the sentence it sits in.
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
  assert.doesNotMatch(deepening, /candidate ticket/i, 'a bigger fold is no longer sent to main as a ticket');
  assert.match(deepening, /fold over 200[^.]*several fold slices/i, 'a bigger fold is cut into several fold slices');
  assert.match(deepening, /200 changed lines/, 'each fold slice keeps its 200-line cap');
});

test('past 20 is one run', () => {
  const slices = item8();
  assert.match(slices, /20 slices is the aim/i, '20 is an aim');
  assert.doesNotMatch(slices, /runs of at most 20/i, 'past 20 is no longer a forced split');
  assert.doesNotMatch(slices, /reach 22/i, 'no 22-slice ceiling');
  assert.match(slices, /(past|beyond|above|over) (it|20)[^.]*one run unless the user asks for a split/i, 'past the aim is one run unless the user asks');
  assert.match(slices, /only[^.]*\*\*Runs\*\* table|\*\*Runs\*\* table[^.]*only/i, 'a Runs table only when a split is asked');
});

test('found issues are added without asking', () => {
  const scope = section('Scope discipline');
  assert.match(scope, /grilling skill's build-now rule/, "names grilling's rule rather than restating it (L4)");
  assert.match(scope, /found issue[^.]*added spec line and slice/i, 'a found issue becomes an added spec line and slice');
  assert.match(scope, /no question/i, 'and is not asked');
  assert.match(scope, /moves a locked decision[^.]*question/i, 'a locked decision is still the one rail that asks (L3)');
  assert.match(scope, /tidy[^.]*neither the request nor a found issue/i, 'an unrelated tidy stays out');
  assert.doesNotMatch(scope, /first coherent part|bigger than one artefact/i, 'a big request is no longer cut to its first part');
});

test('the architect holds six children', () => {
  const research = section('Read before you design');
  assert.match(research, /up to six read-only children/i, 'six children at once (spec 9)');
  assert.doesNotMatch(research, /up to four/i, 'the old count is gone');
});
