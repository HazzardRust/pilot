/**
 * The install walks a Windows user to a Defender exclusion, or a Dev Drive
 * (defender-dev-drive spec 4; L8, A2). Step 4a of docs/INSTALL.md is prose an installing
 * agent follows, so these are wording pins: the step runs the one row, shows the
 * exclusion before the Dev Drive upgrade for the user to do as administrator, and records
 * the marker, and both tables name that marker. However 4a is reworded, those hold.
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
  const step4 = INSTALL.indexOf('\n## 4. ');
  const step4a = INSTALL.indexOf(`\n${HEADING}\n`);
  const step5 = INSTALL.indexOf('\n## 5. ');

  assert.ok(step4 >= 0 && step5 >= 0, 'steps 4 and 5 are still numbered 4 and 5');
  assert.ok(step4a >= 0, `docs/INSTALL.md has no "${HEADING}" heading`);
  assert.ok(step4 < step4a && step4a < step5, 'step 4a sits between steps 4 and 5');
  assert.match(section(HEADING), /pilot doctor defender(?! advised)/, 'it runs the Defender row');
});

test('the exclusion comes before the Dev Drive', () => {
  const step = section(HEADING);

  const exclusion = step.indexOf('exclusion');
  const devDrive = step.indexOf('Dev Drive');
  assert.ok(exclusion >= 0, 'the step names the exclusion');
  assert.ok(devDrive > exclusion, 'L8: the exclusion comes first, the Dev Drive after it');
  assert.match(step, /upgrade/, 'the Dev Drive is named the upgrade');
  assert.match(step, /administrator/, 'the user runs the steps as administrator');
  assert.match(step, /never run them yourself|do not run them yourself/i, 'never the installer');
  assert.doesNotMatch(step, /Add-MpPreference/, 'the step does not restate the commands it shows');
});

test('the step records the marker and both tables say so', () => {
  const step = section(HEADING);
  const marker = step.indexOf('pilot doctor defender advised install');
  assert.ok(marker >= 0, 'step 4a records the marker');
  assert.ok(marker > step.indexOf('Dev Drive'), 'after the steps are shown, not before');

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
