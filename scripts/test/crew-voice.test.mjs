/**
 * Spec 2, 3 and 4 of `docs/design/crew-voice-rules/architecture.md`, and ADR 0056: the
 * terminal gets state, questions and results, never unasked explanation; deck text and
 * reports carry detail on request; and each definition names where longer is
 * right. The rule is written as "no unasked explanation", never as brevity,
 * because a brevity rule reads as an incentive to think less (L3), so the absence of
 * those words is pinned beside the presence of the rule.
 *
 * The rule lives in one place per definition (L10): pilot.md's "Writing to the user",
 * and a `## Voice` section in each crew definition. A sentence elsewhere in the file
 * does not count, so a passing test means a reader finds it in one paragraph.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

/** Each definition and the heading its voice rule lives under. */
const DEFINITIONS = [
  ['pilot', 'Writing to the user'],
  ['pilot-architect', 'Voice'],
  ['pilot-implementer', 'Voice'],
  ['pilot-qa', 'Voice'],
  ['pilot-explorer', 'Voice'],
  ['pilot-teacher', 'Voice'],
  ['pilot-auditor', 'Voice'],
  ['pilot-fundamentalist', 'Voice'],
];

const voiceSection = (name, heading) => {
  const section = sectionOf(read(`agents/${name}.md`), heading);
  assert.ok(section, `agents/${name}.md has no "## ${heading}" section`);
  return flat(section);
};

const sentences = (text) => text.split(/(?<=[.!?])\s+/);

const USER_FACING = ['pilot', 'pilot-architect', 'pilot-teacher', 'pilot-auditor', 'pilot-explorer', 'pilot-qa'];

const hasSentence = (text, ...patterns) =>
  sentences(text).some((sentence) => patterns.every((pattern) => pattern.test(sentence)));

test('every crew definition forbids narrating steps', () => {
  for (const [name, heading] of DEFINITIONS) {
    const section = voiceSection(name, heading);
    assert.match(section, /no unasked explanation/i, `agents/${name}.md: the rule is "no unasked explanation"`);
    assert.ok(
      hasSentence(section, /\b(never|not|do not|don't) narrat/i),
      `agents/${name}.md: no sentence in "## ${heading}" forbids narrating`,
    );
  }
});

test('every crew definition puts detail on request', () => {
  for (const [name, heading] of DEFINITIONS) {
    const section = voiceSection(name, heading);
    assert.ok(
      hasSentence(section, /on request/i) &&
        (USER_FACING.includes(name) || hasSentence(section, /\bshort\b/i, /on request/i)),
      `agents/${name}.md: no sentence in "## ${heading}" puts detail on request (and, outside the user-facing set, short by default)`,
    );
  }
});

test('every crew definition names when longer is right', () => {
  for (const [name, heading] of DEFINITIONS) {
    assert.ok(
      hasSentence(
        voiceSection(name, heading),
        /\blonger\b/i,
        /\bsecurity\b/i,
        /\birreversible\b/i,
        /\bGate 1\b/,
        /\bpushback\b/i,
      ),
      `agents/${name}.md: no sentence in "## ${heading}" says longer is right for security, irreversible data, the Gate 1 walk and a pushback`,
    );
  }
});

test('no crew definition phrases the rule as brevity or less thinking', () => {
  for (const [name] of DEFINITIONS) {
    const source = flat(read(`agents/${name}.md`));
    for (const phrase of [/less verbos/i, /\bbe brief\b/i, /think less/i, /less thinking/i]) {
      assert.doesNotMatch(source, phrase, `agents/${name}.md: the rule is never written as ${phrase}`);
    }
  }
});

/**
 * Spec 1 and 2 of `docs/design/short-by-default/architecture.md`, and ADR 0122: the
 * definitions whose text the user reads name what goes in (what the decision needs) and
 * where the rest goes, as content, never as a cap (L1); the co-pilot, implementer and
 * fundamentalist write to no user and are out (L6).
 */
const headingOf = (name) => DEFINITIONS.find(([definition]) => definition === name)[1];

test('every user-facing definition names what the decision needs and where the rest goes', () => {
  for (const name of USER_FACING) {
    assert.ok(
      hasSentence(voiceSection(name, headingOf(name)), /decision needs/i, /\b(PR|run record|Teach me)\b/),
      `agents/${name}.md: no sentence in "## ${headingOf(name)}" names what the decision needs and where the rest goes`,
    );
  }
});

/**
 * Spec 1-3 of `docs/design/prose-concision/architecture.md`, and ADR 0162: each
 * user-facing definition trades grammatical accuracy for conciseness in deck items and
 * chat replies, in one sentence naming both and never reasoning (L1, L2, L4).
 */
test('every user-facing definition trades grammatical accuracy for conciseness', () => {
  const missing = USER_FACING.filter(
    (name) =>
      !hasSentence(
        voiceSection(name, headingOf(name)),
        /sacrifice grammatical accuracy for conciseness/i,
        /\bdeck\b/i,
        /\bchat\b/i,
      ),
  ).map((name) => `agents/${name}.md: no sentence in "## ${headingOf(name)}" trades grammar for conciseness in deck and chat`);
  assert.deepEqual(missing, []);
});

test('the pilot, explorer and QA answer generally and name what to specify', () => {
  for (const name of ['pilot', 'pilot-explorer', 'pilot-qa']) {
    assert.ok(
      hasSentence(voiceSection(name, headingOf(name)), /\bgeneral\b/i, /\bspecific\b/i),
      `agents/${name}.md: no sentence in "## ${headingOf(name)}" makes an answer general and names what it can be made specific on`,
    );
  }
});

test("the pilot's question body asks for no evidence", () => {
  const source = read('agents/pilot.md');
  const start = source.indexOf('\n### 3. Grilling');
  assert.notEqual(start, -1, 'agents/pilot.md has no "### 3. Grilling" step');
  const step = flat(source.slice(start, source.indexOf('\n### ', start + 1)));
  const body = sentences(step).find((sentence) => /^Its body is\b/.test(sentence));
  assert.ok(body, 'step 3 has no "Its body is" sentence');
  assert.doesNotMatch(body, /\bthe evidence\b/i, 'the question body asks for no evidence (A2)');
});
