/**
 * Lint on `docs/design/crew-voice-rules/architecture.md` spec 5 to 8: grilling stops at an
 * empty frontier, never at a count. The wording of the grilling rules is not pinned.
 *
 * The rules live in two places: the grilling skill, and pilot.md's "### 3. Grilling",
 * so the section is cut out first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read } from './lib/area-file.mjs';

const grilling = read('skills/grilling/SKILL.md');

/** pilot.md from `### 3. Grilling` up to the next heading of level 2 or 3. */
const section3 = (() => {
  const source = read('agents/pilot.md');
  const start = source.search(/^### 3\. Grilling/m);
  assert.ok(start >= 0, 'agents/pilot.md has no "### 3. Grilling" section');
  const rest = source.slice(start).split('\n').slice(1).join('\n');
  const end = rest.search(/^#{2,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
})();

test('grilling never stops at a count', () => {
  // lint: no question cap in the grilling skill or pilot.md step 3
  assert.doesNotMatch(flat(grilling + section3), /at most \d+ questions|no more than \d+ questions/i);
});
