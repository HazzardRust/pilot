/**
 * S9 of three-lanes (spec 9, L5, A9): the architect carries the planning relay and the pilot keeps
 * the verdict pass and `deck_status finished`. Only the structure and the forbidden claims are tested.
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

test('the architect never claims finished', () => {
  // lint: the planning relay heading exists and does not hand the architect `finished: "planned"`
  const relay = section(read('agents/pilot-architect.md'), '## The planning relay', 'agents/pilot-architect.md').replace(/\s+/g, ' ');
  assert.doesNotMatch(relay, /finished: "planned"/, 'finished stays the pilot\'s');
});

test('the pilot does not write brief.md', () => {
  const pilot = read('agents/pilot.md');
  // lint: the two planning steps exist as headings, and the pilot does not claim the architect's brief
  section(pilot, '### 3. Grilling, with the user', 'agents/pilot.md');
  section(pilot, '### 2. Research and the architecture artefact, AFK', 'agents/pilot.md');
  assert.doesNotMatch(pilot, /the pilot writes `docs\/design\/<slug>\/brief\.md`/, 'the architect writes brief.md now');
});
