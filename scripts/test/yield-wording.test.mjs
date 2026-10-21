/**
 * S7 of blocked-yellow-yields (spec 8, 9; §2, L2, L3, A4, A5): the pilot's and the co-pilot's prose name the yield
 * the deck makes, its resume and the `Moot:` close, and the co-pilot's and the implementer's prose forbid the three
 * call shapes auto mode refuses, with a refused file edit going up as one question with its default.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ');

/** The three shapes, each a pattern a forbidding sentence names. */
const SHAPES = [
  [/kill bundled with a read/, 'a kill bundled with a read'],
  [/`cat` of a transcript or `TaskOutput` file/, 'a cat of a transcript or TaskOutput file'],
  [/`pilot land`/, 'pilot land'],
];

test('the pilot names the yield and Moot', () => {
  const pilot = read('agents/pilot.md');
  assert.match(pilot, /`Paused <id>`/, "the deck line's words");
  assert.match(pilot, /send (its|the) co-pilot the pause/, 'L3: the pilot sends the pause, the deck stops no agent');
  assert.match(pilot, /`deck_ticket co-pilot` the next runnable/, 'spec 2: the lane takes the next runnable ticket');
  assert.match(pilot, /answer[^.]*resumes it/, 'spec 3: the answer resumes the ticket');
  assert.match(pilot, /`Moot:` close of a pausing `Blocked:` item/, 'spec 11: a moot close resumes it too');
  assert.match(pilot, /`deck_resolve` [^.]*`Moot: <why>`/, 'spec 6: the pilot closes a Blocked item as moot');
  assert.match(pilot, /`Blocked:` item[^.]*done another way[^.]*another role's[^.]*no longer/, 'A4: which Blocked items are moot');
  const coPilot = read('agents/pilot-co-pilot.md');
  assert.match(coPilot, /`Paused <id>`/, 'the co-pilot knows the yield');
  assert.match(coPilot, /yield[^.]*hand back with outcome `paused`|hand back with outcome `paused`[^.]*yield/, 'L3: it hands back paused');
  assert.match(coPilot, /`Moot:` close of a pausing `Blocked:` item/, 'spec 11 in the co-pilot too');
});

test('the crew forbids the three shapes', () => {
  for (const file of ['agents/pilot-co-pilot.md', 'agents/pilot-implementer.md']) {
    const text = read(file);
    const sentence = text.match(/[^.]*never made[^.]*\./)?.[0] ?? '';
    assert.ok(sentence, `${file} has a sentence forbidding the shapes`);
    for (const [pattern, name] of SHAPES) assert.match(sentence, pattern, `${file} forbids ${name}`);
  }
  assert.match(read('agents/pilot-co-pilot.md'), /child's file edit the classifier refuses goes to `main` as one question with its default/, 'A5: the co-pilot relays it, so it reaches the user once');
  const implementer = read('agents/pilot-implementer.md');
  assert.match(implementer, /file edit the classifier refuses goes to your addressee as one question with its default/, 'A5: a refused edit is a question with its default');
});

test('the pilot names the three shapes and routes a refused edit to the user', () => {
  const pilot = read('agents/pilot.md');
  const sentence = pilot.match(/[^.]*never made[^.]*\./)?.[0] ?? '';
  assert.ok(sentence, 'agents/pilot.md has a sentence naming the shapes (spec 8)');
  for (const [pattern, name] of SHAPES) assert.match(sentence, pattern, `the pilot names ${name}`);
  assert.match(sentence, /`pilot land` from a co-pilot/, 'the pilot runs it; a co-pilot never does');
  assert.match(sentence, /file edit the classifier refuses goes to the user as one question with its default/, 'A5 at the top of the chain');
});
