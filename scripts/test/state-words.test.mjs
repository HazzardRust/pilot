/**
 * yellow-lane S17 (spec 14; L9; ADR 0147): the prose says the new words. A ticket is red while it
 * is planned, yellow while it is implemented and green while it is concluded, like red/green
 * TDD. Each pin reads a file's ticket-state sentences, the ones pairing a state with its meaning,
 * so a rewording keeps the pins while the meaning holds. TDD's red/green is never paired with a
 * meaning word and is not read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const STATES = ['red', 'yellow', 'green'];
const MEANINGS = ['planning', 'implementing', 'concluding'];

/**
 * A state named with its meaning, `planning` or `planned` alike: `red (planning`, `**red**: planning`,
 * `red, *planning*`, `red is planning`, `red while it is planned`, `planning is now red`, `"planning", in red`.
 * The negative pins below are only as wide as these forms.
 */
const pairs = (state, meaning) => {
  const said = `(?:${meaning}|${meaning.replace(/ing$/, 'ed')})`;
  const between = `[\\s*:,(“"]*(?:is |while (?:it is )?)?[\\s*“"]*`;
  return new RegExp(
    `\\b${state}\\b${between}${said}\\b|\\b${said}\\b[\\s*”",]*(?:is (?:now )?|in )${state}\\b`,
    'i',
  );
};

/** The ticket-state sentences of a prose file: each sentence that names a state with its meaning, on one line. */
export function stateWords(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  return text
    .split(/\n\s*\n|\n(?=\s*[-|#])/)
    .flatMap((block) => block.replace(/\s+/g, ' ').split(/(?<=\.)\s+/))
    .filter((sentence) => STATES.some((state) => MEANINGS.some((meaning) => pairs(state, meaning).test(sentence))));
}

const DEFINING = [
  'agents/pilot.md',
  'skills/ticket-making/SKILL.md',
  'CONTEXT.md',
  'docs/adr/0147-red-is-planning-green-is-concluding.md',
];

const PROSE = [
  ...DEFINING,
  'agents/pilot-co-pilot.md',
  'agents/pilot-architect.md',
  'agents/pilot-implementer.md',
  'rules/vertical-execution.md',
  'deck/README.md',
  'CLAUDE.excerpt.md',
];

test('each prose reader says the new words', () => {
  for (const rel of DEFINING) {
    const said = stateWords(rel);
    assert.ok(said.some((s) => pairs('red', 'planning').test(s)), `${rel}: planning is red`);
    assert.ok(said.some((s) => pairs('green', 'concluding').test(s)), `${rel}: concluding is green`);
  }
  for (const rel of PROSE) {
    for (const sentence of stateWords(rel)) {
      assert.doesNotMatch(sentence, pairs('green', 'planning'), `${rel} still says planning is green`);
      assert.doesNotMatch(sentence, pairs('red', 'concluding'), `${rel} still says concluding is red`);
    }
  }
});

const AMENDED = ['0063', '0065', '0066', '0087', '0089', '0106', '0117', '0123', '0133', '0143'];

test('the amended ADRs name 0147', () => {
  const adrs = fs.readdirSync(path.join(ROOT, 'docs/adr'));
  for (const number of AMENDED) {
    const file = adrs.find((name) => name.startsWith(`${number}-`));
    assert.ok(file, `ADR ${number} exists`);
    const amendment = stateWords(`docs/adr/${file}`).filter((s) => /ADR 0147\b/.test(s));
    assert.equal(amendment.length, 1, `ADR ${number} carries one amendment line naming 0147`);
    assert.match(amendment[0], pairs('red', 'planning'), `ADR ${number}'s amendment says planning is red`);
    assert.match(amendment[0], pairs('green', 'concluding'), `ADR ${number}'s amendment says concluding is green`);
  }
});
