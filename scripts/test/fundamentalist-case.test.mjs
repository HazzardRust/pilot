/**
 * Spec 1 of `docs/design/crew-voice-rules/architecture.md`, L2: lint that the fundamentalist's
 * report opens with the case against. The sentences that say what it contains are not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf } from './lib/area-file.mjs';

const source = read('agents/pilot-fundamentalist.md');

test('the report opens with The case against', () => {
  const section = sectionOf(source, 'Report');
  assert.ok(section, 'agents/pilot-fundamentalist.md has no "## Report" section');
  const first = /^\s*\d+\.\s+(.*)$/m.exec(section);
  assert.ok(first, 'the Report section has no numbered items');
  // lint: the Report's first numbered item is "The case against"
  assert.match(first[1], /^\*\*The case against\*\*/, 'the first numbered item is not "The case against"');
});
