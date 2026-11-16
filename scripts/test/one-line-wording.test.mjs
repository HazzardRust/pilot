/**
 * S9 of one-integration-line (spec 6; A1, A2, A4): the crew, the rules and the ADR format name one
 * integration line. Features land on `pilot`, main gets pilot by the main PR, and a run's ADR is a
 * placeholder until its landing. Sentence pins on the real prompts; whitespace is not the wording.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const flat = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');
const pilot = flat('agents/pilot.md');
/** The text from one heading to the next heading of any level. */
const section = (heading) => {
  const start = pilot.indexOf(heading);
  assert.ok(start >= 0, `agents/pilot.md has "${heading}"`);
  const end = pilot.slice(start + heading.length).search(/ #{2,3} /);
  return pilot.slice(start, end < 0 ? undefined : start + heading.length + end);
};
const markdownUnder = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`);

test('no prompt names the main merge', () => {
  assert.ok(section('### 9. Gate 2 and ready').includes('`pilot integrate --trial`'), 'step 9 runs the trial');
  for (const rel of [...markdownUnder('agents'), ...markdownUnder('rules')]) {
    const text = flat(rel);
    for (const phrase of ['integrate --default', 'merge first', 'pr ready']) {
      assert.ok(!text.includes(phrase), `${rel} names "${phrase}"`);
    }
  }
});

test('the architect names the placeholder', () => {
  const architect = flat('agents/pilot-architect.md');
  assert.ok(architect.includes('docs/adr/NNNN-<slug>.md'), 'a run\'s ADR is the placeholder file');
  assert.ok(architect.includes('`ADR NNNN`'), 'cited by the placeholder number');
});

test('the feature PR targets pilot', () => {
  const gate1 = section('### 3. Grilling, with the user');
  assert.ok(/opens the feature PR as a \*\*draft\*\* against its base, `pilot` or `feat\/<N>`/.test(gate1), 'Gate 1 opens the feature PR against its base');
  assert.ok(!/feature PR[^.]*against the default branch/.test(pilot), 'no feature PR against the default branch');
});
