/**
 * held-handoff S4 (spec 5; L7): a fresh session whose deck says a co-pilot is live adopts it. The
 * pilot's first-turn rule tells it to `SendMessage` that co-pilot and spawn none, and with no answer
 * to release the ticket and then spawn. A clause reworded keeps its pin while those three survive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, flat } from './lib/area-file.mjs';

/** The first-turn rule as one line: from its bold lead to the paragraph's end. */
function firstTurnRule() {
  const text = read('agents/pilot.md');
  const start = text.indexOf("**On a session's first turn");
  assert.notEqual(start, -1, 'agents/pilot.md has no first-turn rule');
  const end = text.indexOf('\n\n', start);
  return flat(text.slice(start, end === -1 ? undefined : end));
}

test('pilot.md tells the fresh session to adopt', () => {
  const rule = firstTurnRule();
  assert.match(rule, /live[^.]*`SendMessage`[^.]*spawn none/, 'the first-turn rule does not message a live co-pilot and spawn none');
  assert.match(rule, /no answer[^.]*`deck_ticket release`[^.]*then spawn/, 'the first-turn rule does not release, then spawn, on no answer');
});
