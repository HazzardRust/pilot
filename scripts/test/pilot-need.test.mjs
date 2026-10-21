/**
 * overview-one-ticket S5 (spec 19, 20; L7, L8, L15, L17): the pilot calls `deck_ticket need`
 * and `pivot`; since yellow-agent S1 (L7, L9) the co-pilot's hand-back at green is what `need` follows.
 * The deck's refusals live in deck/server.mjs and are not restated here or in the prose.
 * S6 (spec 21, 22; L18, L19): only `need` ends yellow, and a blocker ends in `need` too.
 * The pilot's share of its prompt is pinned in measure-prompt.test.mjs, never raised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The Yellow section of agents/pilot.md, up to the next level-2 heading, on one line. */
function sub() {
  const source = fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8').replace(/\r\n/g, '\n');
  const marker = '\n## Yellow\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'agents/pilot.md has no "## Yellow" heading');
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n#{1,2} /);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

/** agents/pilot-co-pilot.md on one line. */
const coPilot = () => fs.readFileSync(path.join(ROOT, 'agents', 'pilot-co-pilot.md'), 'utf8').replace(/\s+/g, ' ');

// yellow-agent S1 (L7), S2 (L9): the main session calls need, or posts the gate2, on the co-pilot's hand-back.
test('pilot.md names deck_ticket need with its condition, the co-pilot\'s hand-back', () => {
  assert.match(sub(), /On its hand-back, `deck_ticket need` the ticket, or post its `gate2` when no walkthrough or question names it/, 'spec 19, 22; L7, L9, L19');
  assert.doesNotMatch(sub(), /\*\*Needed\*\*/, 'F12: no separate Needed rule');
});

test('pilot.md names deck_ticket pivot with its condition and where the ticket goes', () => {
  assert.match(
    sub(),
    /\*\*Pivot\*\*: when the user's feedback needs a substantial change from the plan, say so on the thread and `deck_ticket pivot`: the ticket goes back to implementing, to the co-pilot; QA continues on the same walkthrough\./,
    'spec 19, L8, L15; F12',
  );
});

// yellow-agent S1 (L2, L7): the co-pilot never finishes the run; a fresh one takes the next yellow ticket.
test('the co-pilot never finishes the run, and the main session takes no yellow ticket itself', () => {
  assert.match(coPilot(), /never send `finished`/, 'L7');
  assert.doesNotMatch(sub(), /take the next yellow ticket, same session/, 'L2: a fresh co-pilot per ticket');
});

test('the co-pilot stops at green, never by posting the gate2; no Blocked rule; gate2 is posted in green', () => {
  const text = sub();
  assert.match(coPilot(), /never post a gate/, 'spec 21, L18');
  assert.doesNotMatch(coPilot(), /posting the `gate2`|"gate 2 posted"/, 'spec 21: no gate2 post ends a run');
  assert.match(coPilot(), /You stop when the ticket is ready for concluding, as ADR 0066 defines it/, 'yellow-agent L9');
  assert.doesNotMatch(text, /\*\*Blocked\*\*|finished: "blocked"|park it yellow/, 'spec 22, L19: no blocker parks its ticket');
  assert.match(text, /\*\*Concluding\*\*, from the record: `deck_ticket need` hands the ticket to QA, which carries it to the Gate 2 press/, 'spec 21, three-lanes S8: the gate2 is posted in green, by QA');
});
