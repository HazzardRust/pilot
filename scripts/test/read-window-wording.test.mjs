/**
 * session-row S4 (spec 6, 7): every place an agent is told to read a thread names the
 * window it wants, and the pilot's Yellow rule says the pick `nextTicketOf` makes. A read
 * with no `messages` gets the deck's default (whole under 5 messages, else the last 5),
 * so a read that never names a window silently misses an older reply it needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

/** The sentence a pinned read sits in: from `anchor` to the next full stop. */
function sentenceAt(source, anchor) {
  const text = flat(source);
  const start = text.indexOf(anchor);
  assert.notEqual(start, -1, `no "${anchor}" to pin`);
  return text.slice(start, text.indexOf('. ', start) + 1);
}

/** A named window, `messages: <n>` or a fixed one: a reword may pick its number, never drop it. */
const WINDOW = /`messages: [^`]+`/;

test("the pilot's reads name a window", () => {
  const pilot = read('agents/pilot.md');
  // A `brief` read ignores `messages`, so the first turn's window belongs on its reads by `id`.
  assert.match(sentenceAt(pilot, "On a session's first turn"), /then by `id` with `messages: [^`]+`/, 'the first-turn read names no window');
  assert.match(sentenceAt(pilot, 'posts them as `question` items'), WINDOW, "step 6's reply read names no window");
});

test('QA and grilling name a window', () => {
  assert.match(sentenceAt(read('agents/pilot-qa.md'), 'Read their replies with'), WINDOW, "QA's walkthrough read names no window");
  assert.match(sentenceAt(read('skills/grilling/SKILL.md'), 'Read the answer with'), WINDOW, "grilling's answer read names no window");
});

test("the pilot's Yellow states the pick", () => {
  const yellow = flat(sectionOf(read('agents/pilot.md'), 'Yellow'));
  // three-lanes S10 (spec 2): each stage lane fills from its own queue; the cross-stage ordering went.
  assert.match(yellow, /`nextTicketOf`'s pick for its stage: a queued question first, then its head/, 'Yellow does not fill each lane from its own stage');
  assert.doesNotMatch(yellow, /red then green|green then red/, 'Yellow still orders one stage before the other');
});
