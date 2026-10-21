/**
 * S9 of three-lanes (spec 9, L5, A9): the architect carries the planning relay. It posts and
 * records its own stashed questions; the pilot keeps the pushback by the pass, the verdict pass,
 * Gate 1 and `deck_status finished`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** The text under one heading, up to the next heading of the same or a higher level. */
function section(text, heading, file) {
  const level = heading.match(/^#+/)[0].length;
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${file} has no ${heading}`);
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

test('the architect posts and records its own questions', () => {
  const architect = read('agents/pilot-architect.md');
  const relay = section(architect, '## The planning relay', 'agents/pilot-architect.md').replace(/\s+/g, ' ');
  assert.match(relay, /`question` with `ticket`/, 'each stashed question is posted with the ticket id');
  assert.match(relay, /`pilot wait --as architect --item <id>`/, 'it waits on its own question');
  assert.match(relay, /`deck_resolve`/, 'it resolves what it recorded');
  assert.match(relay, /`docs\/design\/<slug>\/brief\.md`/, 'it writes the brief');
  assert.match(relay, /overrides the default or moves a spec line[^.]*`main`/, 'the hand to main');
  assert.match(relay, /Gate 1 is posted/, 'A9: it stops once Gate 1 is posted');
  // architect-runs-red S4 (spec 3; ADR 0169) reversed these two: the architect sends deck_status and posts the gate1.
  assert.match(architect, /mcp__plugin_pilot_deck__deck_status/, 'the architect holds deck_status');
  assert.doesNotMatch(relay, /finished: "planned"/, 'finished stays the pilot\'s');
});

test('the pilot keeps the pushback by the pass', () => {
  const pilot = read('agents/pilot.md');
  const step3 = section(pilot, '### 3. Grilling, with the user', 'agents/pilot.md').replace(/\s+/g, ' ');
  assert.match(step3, /`deck_reply` with `to: "pilot"`/, 'L5: the pushback takes the architect\'s thread by the pass');
  assert.match(step3, /`deck_status` `finished: "planned"`/, 'finished stays the pilot\'s');
  assert.match(step3, /\*\*Verdict pass\.\*\*/, 'the verdict pass stays the pilot\'s');
  assert.match(step3, /posts the gate1, which is your thread/, 'architect-runs-red S4 (L4): the architect posts it, the gate1 stays the pilot\'s');
  assert.doesNotMatch(pilot, /the pilot writes `docs\/design\/<slug>\/brief\.md`/, 'the architect writes brief.md now');
  const step2 = section(pilot, '### 2. Research and the architecture artefact, AFK', 'agents/pilot.md').replace(/\s+/g, ' ');
  assert.match(step2, /posts each stashed question itself/, 'the architect posts and records');
});
