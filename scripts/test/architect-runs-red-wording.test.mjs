// architect-runs-red S4 (spec 1, 2, 3, 4, 6, 7; L2-L5, A1, A2; ADR 0169): the pilot runs no git after the hand-back,
// and the architect, who sends `deck_status` itself, is granted the tool. Only a command's absence and a field are tested.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fieldOf, flat, read } from './lib/area-file.mjs';

/** The text under one `###` heading of a file, up to the next heading of level 3 or higher. */
function subsection(source, heading) {
  const start = source.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `lost its heading ${heading}`);
  const rest = source.slice(start + heading.length + 2);
  const next = rest.search(/\n#{1,3} /);
  return next < 0 ? rest : rest.slice(0, next);
}

test("the pilot's red after hand-back runs no git", () => {
  // lint: after the hand-back, step 3 of the pilot names no git or gh command
  const text = flat(subsection(read('agents/pilot.md'), '### 3. Grilling, with the user'));
  const at = text.indexOf('hand-back');
  assert.ok(at >= 0, 'step 3 does not name the hand-back');
  assert.doesNotMatch(text.slice(at), /\b(git|gh)\b/, 'the pilot runs no git or gh command after the hand-back');
});

test('the architect is granted deck_status', () => {
  // lint: the architect's tools field lists deck_status
  const architect = read('agents/pilot-architect.md');
  assert.ok(fieldOf(architect, 'tools').split(',').map((tool) => tool.trim()).includes('mcp__plugin_pilot_deck__deck_status'), 'tools: grants deck_status');
});
