/**
 * S2 of handoff-no-wait, spec 5 and 6 (L3, L7): the deck holds no hand-off. There is no route to hold one, and a
 * hand-off that still carries a `hold` field from an older deck reads as any other hand-off.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFF_FAILED, KIND_HANDOFF, askFor, noteFor, threadState } from '../items.mjs';
import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';
const TICKET = 'itm_0f0e0a0b0c0d';
const PLAIN_NOTE = noteFor({ kind: KIND_HANDOFF, options: [HANDOFF_FAILED] });

test('no hold route', async (t) => {
  const base = await deckOnAPort(t);
  const handoff = postStored({ kind: KIND_HANDOFF, title: 'Handoff', body: 'Stash at run.json.', repo: REPO, options: [HANDOFF_FAILED] });

  const response = await fetch(`${base}/api/hold`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: handoff.id, ticket: TICKET }),
  });
  await response.body?.cancel();

  assert.equal(response.status, 404);
});

test('a hand-off card is never held', (t) => {
  tempDeck(t);
  const stale = { ticket: TICKET, at: new Date().toISOString(), rearmedAt: new Date().toISOString() };
  const handoff = postStored({ kind: KIND_HANDOFF, title: 'Handoff', body: 'Stash at run.json.', repo: REPO, options: [HANDOFF_FAILED], hold: stale });

  assert.ok(PLAIN_NOTE, 'a hand-off has a plain note to compare with');
  assert.equal(noteFor(handoff), PLAIN_NOTE);
  assert.equal(askFor(KIND_HANDOFF), 'Treat the session this went to as lost, and brief a fresh one from this hand-off?');
  assert.equal(threadState(handoff), 'posted');
});
