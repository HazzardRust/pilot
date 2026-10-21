/** S7 of housekeeping-audit: the open area file, read last, pinned in its prose (A6: no test spawns an agent). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_OPEN_ROWS } from '../../deck/audit.mjs';
import { read, sectionOf, flat } from './lib/area-file.mjs';

const AREA_FILE = 'skills/audit/areas/open.md';

const open = () => read(AREA_FILE);
const auditor = () => read('agents/pilot-auditor.md');

test('the open area is read after every named area', () => {
  const prose = flat(open());
  assert.match(prose, /read (last|after every other area file)/i, 'the file itself says it is read last');
  assert.match(prose, /named area/i);

  const auditorSource = flat(auditor());
  assert.match(auditorSource, /`open\.md` last/, 'the auditor orders open.md last (agents/pilot-auditor.md)');
});

test("it caps itself at S1's ten open rows and names the L6 score as the cut", () => {
  const rows = flat(sectionOf(open(), 'Rows'));
  assert.equal(MAX_OPEN_ROWS, 10, "the pin below assumes S1's constant is still 10");
  assert.match(rows, /\bten\b|\b10\b/, 'the ten-row cap is named');
  assert.match(rows, /validateReport/, "S1's refusal is named, not re-implemented");
  assert.match(rows, /L6|score/i, 'the L6 score is named as the cut');
  assert.match(rows, /highest/i, 'the auditor keeps the highest-scoring ten');
  assert.doesNotMatch(rows, /\btruncat/i, 'truncation in code is not how the ten are chosen');
});

test('every open finding is reproduced by a command, or goes to unmeasured', () => {
  const measure = flat(sectionOf(open(), 'Measure'));
  assert.match(measure, /reproduced by a command/i);
  assert.match(measure, /scratch worktree/i);
  assert.match(measure, /timeout/i);
  assert.match(measure, /unmeasured/i, 'a candidate that cannot be reproduced goes to unmeasured, never a row');
});

test("it excludes the system in general and the pilot's own prompts", () => {
  const measure = flat(sectionOf(open(), 'Measure'));
  assert.match(measure, /never the system in general/i);
  assert.match(measure, /product/i);
  assert.match(measure, /architecture/i);
  assert.match(measure, /security/i);
  assert.match(measure, /pilot's own prompts/i);
});

test('it does not duplicate a named area: a finding that belongs elsewhere goes there', () => {
  const prose = flat(open());
  for (const area of ['setup', 'loops', 'preview', 'navigability', 'context', 'tooling']) {
    assert.match(prose, new RegExp(area, 'i'), `the open area names ${area} as somewhere else a finding may belong`);
  }
});
