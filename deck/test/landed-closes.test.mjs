/**
 * never-stuck S11 (spec 5): a landing that lands closes the questions about landing it. `closeLanded` first
 * resolves each open blocking question on the gate2's ticket that the deck or the lander posted, `Moot: landed
 * <sha7>`, then the gate2; any other blocking item still keeps the gate2 open. Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { closeLanded } from '../closing-report.mjs';
import { KIND_GATE2, KIND_QUESTION, SIGN_OFF } from '../items.mjs';
import { addReply, listItems, postItem, settleLanding } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const SHA = '1a2b3c4d5e6f';
const REPO = 'C:/w/never-stuck-s11';
const itemOf = (id) => listItems().find((item) => item.id === id);

/** A landed, signed gate2 on a yellow ticket; the landing is settled, so nothing has closed yet. */
function aLandedGate2() {
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, REPO, 'yellow');
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, ...evidence });
  addReply(gate.id, SIGN_OFF);
  settleLanding(gate.id, { ok: true, line: `landed feat/x on pilot at ${SHA}`, sha: SHA, code: 0 });
  return { ticket: evidence.ticket, gate };
}

/** An open blocking question on `ticket`; `author` as a hook stamps it, none as the deck posts its own. */
const blockingOn = (ticket, title, author) => postItem({
  kind: KIND_QUESTION, blocking: true, ticket, repo: REPO, title, body: 'Answer it.\n\nResearch: none, scope call, the fixture of this test.', options: ['Done', 'Leave it'], recommended: 'Done',
  ...(author === undefined ? {} : { author }),
});

test('the conflict question closes on landed', (t) => {
  tempDeck(t);
  const { ticket, gate } = aLandedGate2();
  const deckAsked = blockingOn(ticket, 'Resolve the landing conflict in C:/w/land-x');
  const landerAsked = blockingOn(ticket, 'Land again?', 'pilot:pilot-lander');
  assert.equal(itemOf(gate.id).landing.state, 'landed', 'the fixture landed');

  assert.equal(closeLanded(gate.id)?.id, gate.id);

  for (const asked of [deckAsked, landerAsked]) assert.equal(itemOf(asked.id).resolution, `Moot: landed ${SHA.slice(0, 7)}`);
  assert.ok(itemOf(gate.id).resolution, 'the gate2 is resolved');
});

test('a user-owed blocking item still holds the gate2', (t) => {
  tempDeck(t);
  const { ticket, gate } = aLandedGate2();
  const owed = blockingOn(ticket, 'Blocked: which region?', 'pilot:pilot-qa');
  const landing = blockingOn(ticket, 'Resolve the landing conflict in C:/w/land-x');

  assert.equal(closeLanded(gate.id), null);

  assert.equal(itemOf(landing.id).resolution, `Moot: landed ${SHA.slice(0, 7)}`, 'its own question still closes');
  assert.equal(itemOf(owed.id).resolution, undefined, 'the other author\'s question is open');
  assert.equal(itemOf(gate.id).resolution, undefined, 'the gate2 stays open');
});

test('a landing question the user reopened holds the gate2', (t) => {
  tempDeck(t);
  const { ticket, gate } = aLandedGate2();
  const vetoed = blockingOn(ticket, 'Land again?', 'pilot:pilot-lander');
  addReply(vetoed.id, 'Closed with: Moot: landed earlier');

  assert.equal(closeLanded(gate.id), null);

  assert.equal(itemOf(vetoed.id).resolution, undefined, 'only the user answers it now');
  assert.equal(itemOf(gate.id).resolution, undefined, 'the gate2 stays open');
});

test("another ticket's question is untouched", (t) => {
  tempDeck(t);
  const { gate } = aLandedGate2();
  const other = withTicket({ pr: '#591', sha: '0305828' }, REPO, 'yellow');
  const elsewhere = blockingOn(other.ticket, 'Resolve the landing conflict in C:/w/land-y');

  assert.ok(closeLanded(gate.id));

  assert.equal(itemOf(elsewhere.id).resolution, undefined, 'it stays open');
});
