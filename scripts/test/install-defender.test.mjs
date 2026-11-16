/**
 * The install walks a Windows user to a Defender exclusion, or a Dev Drive
 * (defender-dev-drive spec 4; L8, A2). Step 4a of docs/INSTALL.md is prose an installing
 * agent follows, so only lints stay (ADR 0180): the step exists between 4 and 5, runs the
 * one row, restates no command it shows, and records the marker, and both tables name
 * that marker. However 4a is reworded, those hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INSTALL = fs.readFileSync(path.join(ROOT, 'docs', 'INSTALL.md'), 'utf8').replace(/\r\n/g, '\n');

const HEADING = '## 4a. On Windows, check Defender';

/** The text of one `## ` section, its heading line through the next `## `. */
function section(heading) {
  const start = INSTALL.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `docs/INSTALL.md has no "${heading}" heading`);
  const next = INSTALL.indexOf('\n## ', start + 1);
  return INSTALL.slice(start + 1, next < 0 ? undefined : next);
}

/** The table rows, `| ... |` lines, of one section. */
const rows = (heading) => section(heading).split('\n').filter((line) => line.startsWith('|'));

test('step 4a follows step 4 and runs the row', () => {
  // lint: the headings exist in order, and the step runs the Defender row
  const step4 = INSTALL.indexOf('\n## 4. ');
  const step4a = INSTALL.indexOf(`\n${HEADING}\n`);
  const step5 = INSTALL.indexOf('\n## 5. ');

  assert.ok(step4 >= 0 && step5 >= 0, 'steps 4 and 5 are still numbered 4 and 5');
  assert.ok(step4a >= 0, `docs/INSTALL.md has no "${HEADING}" heading`);
  assert.ok(step4 < step4a && step4a < step5, 'step 4a sits between steps 4 and 5');
  assert.match(section(HEADING), /pilot doctor defender(?! advised)/, 'it runs the Defender row');
});

test('the step does not restate the commands it shows', () => {
  // lint: forbidden pattern
  assert.doesNotMatch(section(HEADING), /Add-MpPreference/, 'the step does not restate the commands it shows');
});

test('the step records the marker and both tables say so', () => {
  // lint: the marker command and both table rows naming the marker file exist
  const step = section(HEADING);
  assert.ok(step.includes('pilot doctor defender advised install'), 'step 4a records the marker');

  const changes = rows('## What this changes, and what it never touches');
  assert.ok(
    changes.some((row) => row.includes('defender-advised.json')),
    '"What this changes" names the marker file',
  );
  const again = rows('## Running this again');
  assert.ok(
    again.some((row) => row.includes('Defender') && row.includes('defender-advised.json')),
    '"Running this again" has a Defender row naming the marker',
  );
});
