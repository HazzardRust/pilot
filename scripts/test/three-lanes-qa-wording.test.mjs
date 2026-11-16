/**
 * S8 of three-lanes (spec 8, 19; L6, L7, L12): QA carries concluding to the Gate 2 press, and the
 * pilot keeps the landing and the closing report. Only the structure and the forbidden claims are tested.
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

test("the pilot does not post QA's gate2", () => {
  // lint: QA keeps a Concluding heading, and no prompt hands the gate2 back to the pilot
  section(read('agents/pilot-qa.md'), '## Concluding', 'agents/pilot-qa.md');
  assert.doesNotMatch(read('agents/pilot-qa.md'), /the pilot then posts `gate2`/, 'the pilot no longer posts QA\'s gate2');
});

test('step 9 has no second signature and no second QA', () => {
  const pilot = read('agents/pilot.md');
  // lint: step 9 exists, a refused landing does not have the user sign again, and no prompt says two QA agents are never live
  assert.doesNotMatch(section(pilot, '### 9. Gate 2 and ready', 'agents/pilot.md'), /signs again/, 'a refused landing no longer has the user sign again');
  assert.doesNotMatch(pilot, /Two QA agents are\s+never live at once/);
});
