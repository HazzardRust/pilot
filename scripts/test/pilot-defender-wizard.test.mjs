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

/** Step 1 of agents/pilot.md, up to the next level-3 heading, line breaks kept. */
function stepOneLines() {
  const source = fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8').replace(/\r\n/g, '\n');
  const marker = '\n### 1. Problem and spec, with the user\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'agents/pilot.md has no step 1 heading');
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n#{1,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Step 1 on one line. */
const stepOne = () => stepOneLines().replace(/\s+/g, ' ');

/** Step 1's text from `pilot doctor defender due` to the end of its paragraph, on one line. */
function clause() {
  const text = stepOneLines();
  const start = text.indexOf('`pilot doctor defender due`');
  assert.notEqual(start, -1, 'step 1 does not run `pilot doctor defender due`');
  const end = text.indexOf('\n\n', start);
  return (end === -1 ? text.slice(start) : text.slice(start, end)).replace(/\s+/g, ' ');
}

test('step 1 runs due and posts on exit 0 only', () => {
  assert.match(clause(), /^`pilot doctor defender due` exits 0, post one `walkthrough` titled `Stage 1\/1 - /, 'spec 5; L1');
  assert.match(clause(), /exit 1 posts nothing/, 'spec 5; L1');
});

test('the walkthrough copies the printed steps', () => {
  assert.match(clause(), /its screens the printed lines in order, the exclusion first/, 'L3, L8');
  assert.match(clause(), /with no `ticket` and not `blocking`/, 'L4');
  assert.doesNotMatch(stepOne(), /Add-MpPreference|Dev Drive/, 'L3: no step text restated in pilot.md');
});

test('the walkthrough body says why and whose the steps are', () => {
  assert.match(clause(), /its body one line: the Defender row reads `fail`, or `cannot tell` without an administrator, and both steps are the user's to run as administrator, if they choose;/, 'QA J1');
});

test('the post is recorded', () => {
  assert.match(clause(), /then `pilot doctor defender advised <item id>`/, 'spec 5; L1');
  const text = clause();
  assert.ok(text.indexOf('`walkthrough`') < text.indexOf('`pilot doctor defender advised <item id>`'), 'the record comes after the post');
});
