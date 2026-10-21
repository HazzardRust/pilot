/**
 * S8 of three-lanes (spec 8, 19; L6, L7, L12): QA carries concluding from the pilot's `need` to the
 * Gate 2 press, and the pilot keeps the landing and the closing report.
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

test("QA's definition owns the gate2 post", () => {
  const concluding = section(read('agents/pilot-qa.md'), '## Concluding', 'agents/pilot-qa.md');
  assert.match(concluding, /`need`/, 'concluding starts from the pilot\'s `need`');
  assert.match(concluding, /`pilot integrate --trial`/, 'one-integration-line S9: the gate2 posts after the trial on pilot');
  assert.match(concluding, /`gate2`/);
  assert.match(concluding, /`signed <id>`/, 'QA tells main the press landed');
  assert.match(concluding, /one QA per ticket/i);
  assert.doesNotMatch(read('agents/pilot-qa.md'), /the pilot then posts `gate2`/, 'the pilot no longer posts QA\'s gate2');
});

test("the pilot's step 9 keeps landing and the report only", () => {
  const pilot = read('agents/pilot.md');
  const step9 = section(pilot, '### 9. Gate 2 and ready', 'agents/pilot.md');
  assert.match(step9, /the press frees the lane/, 'gate2-frees-lane S9: the deck lands it, no `pilot landing`');
  assert.match(step9, /wake/i, 'step 9 names the landing line as a wake');
  assert.doesNotMatch(step9, /signs again/, 'a refused landing no longer has the user sign again');
  assert.match(pilot, /never two QA agents\s+on one ticket/i);
  assert.doesNotMatch(pilot, /Two QA agents are\s+never live at once/);
});
