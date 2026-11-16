/** S5 of verdict-pass (spec 8): behaviour re-derived per run is an audit area (ADR 0141). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AREAS } from '../../deck/audit.mjs';
import { read, fieldOf } from './lib/area-file.mjs';

const AREA_FILE = 'skills/audit/areas/rederived.md';

// The frontmatter's exact spec and model are pinned in audit-agent.test.mjs's EXPECT loop (review P7).
test('the area is registered', () => {
  const source = read(AREA_FILE);
  assert.equal(fieldOf(source, 'area'), 'rederived');
  assert.equal(fieldOf(source, 'owner'), 'explorer', 'A4: an explorer reads the transcripts, never the auditor');
  assert.ok(AREAS.includes('rederived'), 'L9: a rederived row validates as an area, no new row field');
});
