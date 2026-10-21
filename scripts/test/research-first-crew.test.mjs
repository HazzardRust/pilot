/**
 * Spec 4 and 5 of `docs/design/research-first/architecture.md`: the architect and QA, like
 * the pilot, research a default on the research list in the grilling skill's "Finding _facts_" paragraph before they send it up,
 * and may brief `pilot-explorer` for it. Both name S1's rule and research brief by reference
 * only (L1); neither restates the lists.
 *
 * Each pin is a phrase a rewording must keep, not the sentence it sits in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

/** The sentence of a section that contains `marker`, lower-cased and on one line. */
const sentenceOf = (file, heading, marker) => {
  const section = sectionOf(read(file), heading);
  assert.ok(section, `${file} has no "## ${heading}" section`);
  const sentence = flat(section)
    .split(/(?<=[.!?])\s+/)
    .find((s) => s.toLowerCase().includes(marker.toLowerCase()));
  assert.ok(sentence, `${file} "## ${heading}" has no sentence naming "${marker}"`);
  return sentence.toLowerCase();
};

const assertAll = (text, where, phrases) => {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase.toLowerCase()), `${where} does not name "${phrase}"`);
  }
};

const ARCHITECT = 'agents/pilot-architect.md';
const QA = 'agents/pilot-qa.md';

test('the architect stashes a researched decision with its table', () => {
  const clause = sentenceOf(ARCHITECT, 'Decide, and stash what is not yours', 'research list');
  assertAll(clause, 'the architect\'s clause', [
    "research list in `skills/grilling/skill.md`'s *finding facts* paragraph",
    '`main`',
    'table',
    '`pilot:pilot-explorer` research brief',
  ]);
});

test('the architect may brief pilot-explorer', () => {
  const list = sentenceOf(ARCHITECT, 'Read before you design', 'no other type');
  assertAll(list, 'the architect\'s child list', ['`pilot:pilot-explorer` for a research brief']);
});

test('QA sends a researched question with its research', () => {
  const clause = sentenceOf(QA, 'The procedure', 'research list');
  assertAll(clause, 'QA\'s clause', [
    "research list in `skills/grilling/skill.md`'s *finding facts* paragraph",
    'addressee',
    'table',
    '`pilot:pilot-explorer` research brief',
  ]);
});

test('QA may brief pilot-explorer', () => {
  const list = sentenceOf(QA, 'Fixes', 'Children are Sonnet');
  assertAll(list, 'QA\'s child list', ['`pilot:pilot-explorer` for a research brief']);
});
