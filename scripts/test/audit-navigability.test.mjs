/** S3 of housekeeping-audit: the navigability area file, an explorer's whole brief besides the repository path. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf } from './lib/area-file.mjs';

const navigability = () => read('skills/audit/areas/navigability.md');

test('every measurement in it is a read-only command', () => {
  const measure = sectionOf(navigability(), 'Measure');
  assert.ok(measure.trim() !== '', 'the area file has a Measure section');
  assert.doesNotMatch(
    measure,
    /\b(install|npm ci|npm run build|build|npm test|node --test|pytest|serve|npm start|npm run dev)\b/i,
    'no install, build, test or server verb appears under Measure',
  );
});

test('oversized files are counted with the command that counted them', () => {
  const measure = sectionOf(navigability(), 'Measure');
  assert.match(measure, /800.?line/i, 'the 800-line threshold is named');
  assert.match(measure, /wc -l/, 'wc -l is named');
  assert.match(measure, /git ls-files/, 'the file list command is named');
  assert.match(measure, /top ten|largest first/i);
});

test('dead code is reported as candidates with the grep that found no importer', () => {
  const measure = sectionOf(navigability(), 'Measure');
  assert.match(measure, /candidate/i, 'dead code is stated as a candidate, never a certainty');
  assert.match(measure, /git grep/, 'the grep that looked for an importer is named');
  assert.match(measure, /no importer|no second reference|no other reference/i);
});

test("the explorer returns rows in S1's Row shape", () => {
  const source = navigability();
  const rows = sectionOf(source, 'Rows');
  assert.match(rows, /S1's Row shape|Row shape/i);

  const ret = sectionOf(source, 'Return');
  assert.match(ret, /JSON/);
  for (const field of ['area', 'finding', 'command', 'output', 'exit', 'fix', 'saving', 'effort', 'spec']) {
    assert.match(ret, new RegExp(field), `the Return section names the ${field} field`);
  }
  assert.match(ret, /friction/i, 'the explorer\'s friction line is returned too');
});
