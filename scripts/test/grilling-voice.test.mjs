/**
 * Spec 5 to 8 of `docs/design/crew-voice-rules/architecture.md`: a grilling question asks
 * for one decision and is short by default; a question that bundles decisions is split;
 * security is the densest frontier, one question per risk in each of five areas, asked on
 * every run (L5, L15); and the pilot pushes back once on an unadvisable answer, then
 * defers and records the override as an `overridden:` line in the artefact (L17).
 *
 * The rules live in two places: the grilling skill, which any agent grilling reads, and
 * pilot.md's "### 3. Grilling", which is where the pilot's standing grilling questions
 * sit. A sentence elsewhere in pilot.md does not count, so the section is cut out first.
 * Pushback is its own paragraph in both (spec 8), led by a bold `Pushback`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read } from './lib/area-file.mjs';

const grilling = read('skills/grilling/SKILL.md');

/** pilot.md from `### 3. Grilling` up to the next heading of level 2 or 3. */
const section3 = (() => {
  const source = read('agents/pilot.md');
  const start = source.search(/^### 3\. Grilling/m);
  assert.ok(start >= 0, 'agents/pilot.md has no "### 3. Grilling" section');
  const rest = source.slice(start).split('\n').slice(1).join('\n');
  const end = rest.search(/^#{2,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
})();

const sentences = (text) => flat(text).split(/(?<=[.!?:;])\s+(?=[A-Z*`])/);
const paragraphs = (text) => text.split(/\n\s*\n/).map(flat);
const hasSentence = (text, ...words) =>
  sentences(text).some((s) => words.every((w) => s.toLowerCase().includes(w)));

test('a question asks for one decision', () => {
  for (const [name, text] of [['grilling', grilling], ['pilot.md §3', section3]]) {
    assert.ok(hasSentence(text, 'one decision'), `${name} has no sentence asking for one decision`);
    assert.ok(hasSentence(text, 'short'), `${name} does not say a question is short by default`);
  }
  // The one-click recommended answer stays (slice S4, prohibited).
  assert.match(flat(grilling), /recommended answer/);
});

test('a bundled question is split', () => {
  for (const [name, text] of [['grilling', grilling], ['pilot.md §3', section3]]) {
    assert.ok(hasSentence(text, 'split', 'decision'), `${name} has no sentence splitting a bundle`);
  }
});

test('security has one question per risk', () => {
  const security = paragraphs(section3).find((p) => p.includes('one question per risk'));
  assert.ok(security, 'pilot.md §3 has no paragraph with "one question per risk"');
  for (const area of ['auth', 'secrets', 'user input', 'data exposure', 'permissions']) {
    assert.ok(security.includes(area), `the security paragraph does not name ${area}`);
  }
  assert.match(security, /every run/, 'the security check is not standing (L5)');
});

// co-pilot-reports S3 (spec 6, L8): every override of the recommended default is answered,
// once, with its consequence; a second reply only for a fact the user had not seen; then locked.
test('pushback answers every override once, a second only for a new fact, then locks', () => {
  for (const [name, text] of [['grilling', grilling], ['pilot.md §3', section3]]) {
    const pushback = paragraphs(text).find((p) => p.startsWith('**Pushback'));
    assert.ok(pushback, `${name} has no paragraph of its own led by **Pushback**`);
    assert.match(pushback, /once more/, `${name}: pushback does not ask once more`);
    assert.match(pushback, /one line/, `${name}: pushback does not give the why in one line`);
    assert.match(pushback, /user's word decides/, `${name}: pushback does not defer to the user`);
    assert.match(pushback, /`overridden:/, `${name}: pushback does not record the override`);
    assert.match(pushback, /^\*\*Pushback\.\*\* Every answer that overrides the recommended default gets one `(mcp__plugin_pilot_deck__)?deck_reply`/, `${name}: L8, every override is answered, not only an unadvisable one`);
    assert.match(pushback, /the consequence and the path it closes, never a preference/, `${name}: spec 6, the reply names the consequence, not a preference`);
    assert.match(pushback, /A second only for a fact the user had not seen/, `${name}: spec 6, a second reply only for a new fact`);
    assert.match(pushback, /the answer is locked/, `${name}: spec 6, the answer is then locked`);
  }
});

test('grilling still stops at an empty frontier, not at a count', () => {
  assert.match(flat(grilling), /done when the frontier is empty/);
  assert.doesNotMatch(flat(grilling + section3), /at most \d+ questions|no more than \d+ questions/i);
});
