/**
 * Lints on the voice rule of `docs/design/crew-voice-rules/architecture.md` and ADR 0056:
 * the rule is written as "no unasked explanation", never as brevity, because a brevity
 * rule reads as an incentive to think less (L3). The rule's wording is not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const DEFINITIONS = [
  'pilot',
  'pilot-architect',
  'pilot-implementer',
  'pilot-qa',
  'pilot-explorer',
  'pilot-teacher',
  'pilot-auditor',
  'pilot-fundamentalist',
];

test('every crew definition keeps its voice section', () => {
  for (const name of DEFINITIONS) {
    const heading = name === 'pilot' ? 'Writing to the user' : 'Voice';
    // lint: voice section exists
    assert.ok(sectionOf(read(`agents/${name}.md`), heading), `agents/${name}.md has no "## ${heading}" section`);
  }
});

const sentences =(text) => text.split(/(?<=[.!?])\s+/);

test('no crew definition phrases the rule as brevity or less thinking', () => {
  // lint: the voice rule is never written as brevity or less thinking (L3)
  for (const name of DEFINITIONS) {
    const source = flat(read(`agents/${name}.md`));
    for (const phrase of [/less verbos/i, /\bbe brief\b/i, /think less/i, /less thinking/i]) {
      assert.doesNotMatch(source, phrase, `agents/${name}.md: the rule is never written as ${phrase}`);
    }
  }
});

test("the pilot's question body asks for no evidence", () => {
  const source = read('agents/pilot.md');
  const start = source.indexOf('\n### 3. Grilling');
  assert.notEqual(start, -1, 'agents/pilot.md has no "### 3. Grilling" step');
  const step = flat(source.slice(start, source.indexOf('\n### ', start + 1)));
  // lint: no sentence giving the grilling question's body asks for evidence (short-by-default A2)
  for (const body of sentences(step).filter((sentence) => /^Its body is\b/.test(sentence))) {
    assert.doesNotMatch(body, /\bthe evidence\b/i, 'the question body asks for no evidence (A2)');
  }
});
