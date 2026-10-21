/**
 * A landed gate2 stays signed (three-lanes spec 18, A8): a Dismiss on a gate2 whose landing has
 * settled stores `landed <sha7>` or `landing refused`, read off its `landing`, never the user's
 * dismissal, so the pilot's closing report still posts. A gate2 with no landing is dismissed as before.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { DISMISSED_BY_USER } from '../items-bounds.mjs';
import { beginLanding, dismissItem, listItems, postItem, settleLanding } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const SHA = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
const reread = (id) => listItems().find((item) => item.id === id);

const LANDED = { ok: true, sha: SHA, line: `landed feat/x on pilot at ${SHA.slice(0, 7)}` };

/** A yellow ticket and its gate2: never landed, landing ('running'), or settled as `outcome` says. */
function aGate2(outcome) {
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: REPO, state: 'yellow' });
  takeLive(id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: id });
  if (outcome) beginLanding(gate.id, { worktree: path.join('D:', 'work', 'land') });
  if (outcome && outcome !== 'running') settleLanding(gate.id, outcome);
  return { ticket: id, gate: gate.id };
}

test('a Dismiss after a landed landing keeps the gate2 signed', (t) => {
  tempDeck(t);
  const { ticket, gate } = aGate2(LANDED);
  const { replies } = reread(gate);
  const { state } = reread(ticket);
  assert.equal(dismissItem(gate).resolution, `landed ${SHA.slice(0, 7)}`);
  assert.deepEqual(reread(gate).replies, replies, 'the replies are untouched');
  assert.equal(reread(gate).landing.state, 'landed', 'the landing is untouched');
  assert.equal(reread(ticket).state, state, 'the Dismiss moves no ticket');

  const refused = aGate2({ ok: false, line: 'pr ready failed: no such PR' });
  assert.equal(dismissItem(refused.gate).resolution, 'landing refused');
});

test('the closing report posts against it', (t) => {
  tempDeck(t);
  const { ticket, gate } = aGate2(LANDED);
  dismissItem(gate);
  assert.equal(postItem({ kind: 'report', title: 'Report', body: 'Done.', repo: REPO, ticket }).ticket, ticket);
  assert.equal(reread(ticket).state, 'closed', 'the ticket closed');
});

test('a Dismiss on an unlanded gate2 is still a dismissal', (t) => {
  tempDeck(t);
  const { ticket, gate } = aGate2();
  const { state } = reread(ticket);
  assert.equal(dismissItem(gate).resolution, DISMISSED_BY_USER);
  assert.equal(reread(ticket).state, state, 'the Dismiss moves no ticket');

  const running = aGate2('running');
  assert.equal(dismissItem(running.gate).resolution, DISMISSED_BY_USER, 'a landing still running has not settled');
});
