/**
 * defender-dev-drive S4 (spec 5; L1, L3, L4, L8): a run's step 1 posts the Defender walkthrough
 * once per machine. `pilot doctor defender due` decides whether it is owed (S2's defenderDue);
 * the walkthrough's screens are its printed lines, so the steps are never restated in the prose (L3).
 * The pilot's share of its prompt is pinned in measure-prompt.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Step 1 of agents/pilot.md, up to the next level-3 heading, on one line. */
function stepOne() {
  const source = fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8').replace(/\r\n/g, '\n');
  const marker = '\n### 1. Problem and spec, with the user\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'agents/pilot.md has no step 1 heading');
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n#{1,3} /);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

test('the walkthrough copies the printed steps', () => {
  // lint: step 1 runs `pilot doctor defender due` and restates none of the steps it prints
  assert.ok(stepOne().includes('`pilot doctor defender due`'), 'step 1 does not run `pilot doctor defender due`');
  assert.doesNotMatch(stepOne(), /Add-MpPreference|Dev Drive/, 'L3: no step text restated in pilot.md');
});
