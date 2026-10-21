/**
 * deep-modules S3 (spec 5, L8, ADR 0038): the implementer's red list is the slice
 * file's Tests section in order, each test written through the Interface symbol its
 * line names, and a test that needs a symbol the Interface block lacks goes back as a
 * seam change rather than reaching past the interface. Pinned on what the sentence
 * must name, not on its wording, so a rewrite that still names all three stays green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flat, read, sectionOf } from './lib/area-file.mjs';

const FILE = 'agents/pilot-implementer.md';

const loop = () => {
  const text = sectionOf(read(FILE), 'The loop');
  assert.notEqual(text, '', `${FILE} has no "## The loop" section`);
  return flat(text);
};

// A sentence ends at . ! or ? followed by space, so a dot inside `.env` does not split one.
const sentences = () => loop().split(/(?<=[.!?]) /);

// Some one sentence of The loop carries every pattern, in any order.
const someSentence = (patterns, message) =>
  assert.ok(sentences().some((s) => patterns.every((p) => p.test(s))), message);

test('the red list is the Tests section in order', () => {
  someSentence([/\bTests\b/, /\bred steps?\b/i, /\b(order|sequence)\b/i],
    'The loop must name the Tests lines as the red steps, in order');
});

test('each red step goes through its Interface symbol', () => {
  someSentence([/\b(each|every)\b/i, /\b(through|via|against|using)\b/i, /\bInterface\b/, /\bsymbol/i],
    'The loop must say each test is written through the Interface symbol it names');
});

test('a missing symbol is a seam change, not a reach past', () => {
  someSentence([/\bsymbol/i, /\bInterface block\b/, /\bseam change\b/i, /`main`|\baddressee\b/],
    'The loop must send a test needing a symbol the Interface block lacks to `main` (the addressee) as a seam change');
});
