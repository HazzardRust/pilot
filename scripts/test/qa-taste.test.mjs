/**
 * walkthrough-taste S4 (spec 5-8): a QA run passed Pause on a fresh fixture
 * alone, and on the word "Pausing" the page drew, while the used environment
 * the user then met behaved differently. These pins prove the instruction text
 * a QA agent reads says to press a state control twice, read its outcome from
 * the record, press every control a step names, and where ticket output lives.
 * Words are joined by `\s+` so a re-wrapped line does not break a pin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, sectionOf, flat } from './lib/area-file.mjs';

const section = (heading) => flat(sectionOf(read('agents/pilot-qa.md'), heading));

test('QA presses a state control twice: fresh and used', () => {
  const s = section('The read-only pass');
  assert.match(s, /depends\s+on\s+session\s+state/);
  assert.match(s, /Pause,\s+Resume,\s+Start,\s+End/);
  assert.match(s, /fresh\s+fixture\s+and\s+again\s+in\s+a\s+used\s+environment/);
  assert.match(s, /both\s+rows\s+go\s+in\s+the\s+table/);
});

test('QA reads an outcome from the record, never the label', () => {
  assert.match(section('The read-only pass'), /run\s+record\s+or\s+the\s+store,\s+never\s+the\s+label/);
});

test('no step presses a control QA has not pressed at that tip', () => {
  const s = section('The procedure');
  assert.match(s, /No\s+step\s+presses\s+a\s+control\s+you\s+have\s+not\s+pressed\s+live\s+at\s+the\s+tip/);
  assert.match(s, /table\s+lists\s+each\s+one\s+with\s+that\s+tip/);
});

test('QA knows where background-ticket output lives', () => {
  const s = section('The read-only pass');
  assert.ok(s.includes('%TEMP%\\claude\\<project>\\<session>\\tickets\\'), 'no ticket-output path');
  assert.match(s, /beside\s+the\s+transcript/);
});
