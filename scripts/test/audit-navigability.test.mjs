/** S3 of housekeeping-audit: the navigability area file, an explorer's whole brief besides the repository path. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf } from './lib/area-file.mjs';

const navigability = () => read('skills/audit/areas/navigability.md');

test('every measurement in it is a read-only command', () => {
  const measure = sectionOf(navigability(), 'Measure');
  assert.ok(measure.trim() !== '', 'the area file has a Measure section');
  // lint: no install, build, test or server verb under Measure
  assert.doesNotMatch(
    measure,
    /\b(install|npm ci|npm run build|build|npm test|node --test|pytest|serve|npm start|npm run dev)\b/i,
    'no install, build, test or server verb appears under Measure',
  );
});

test('the area runs the measure', () => {
  const measure = sectionOf(navigability(), 'Measure');
  assert.match(measure, /node scripts\/glossary\.mjs check GLOSSARY\.md/, 'it runs the glossary check');
  assert.match(measure, /node scripts\/glossary-stale\.mjs \./, 'it runs the stale-term search');
});

