/**
 * Slice S1 of handoff-self-close (spec 2, 3, 4, 6): the deck closes a crew-handoff once its ticket leaves yellow,
 * level-triggered off the store (L1), through `resolveItem` (L2), never over an unanswered Handoff failed press (A1).
 * Each test runs on a scratch deck, whose directory is where the trace goes, so no test reaches the real file.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { settledCrewHandoffsOf } from '../crew-handoff.mjs';
import { closeCrewHandoffs, settleCrew } from '../crew-settle.mjs';
import { HANDOFF_FAILED, KIND_CREW_HANDOFF, KIND_QUESTION, KIND_TICKET } from '../items.mjs';
import { addPilotMessage, addReply, listItems, needTicket, postItem } from '../store.mjs';
import { trace } from '../trace.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');

const aTicket = (state, title = state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state });
const aCrewHandoff = (ticket, extra = {}) =>
  postItem({ kind: KIND_CREW_HANDOFF, title: `Handoff: pilot-co-pilot on ${ticket} paused itself`, body: `Ticket: ${ticket}.`, repo: REPO, ticket, ...extra });
const byId = (id) => listItems().find((item) => item.id === id);

/** A count of the announcements `settleCrew` makes. */
function announcer() {
  const said = { count: 0 };
  return { said, announce: () => { said.count += 1; } };
}

async function traced(id) {
  const out = [];
  assert.equal(await trace([id], { say: (text) => out.push(text), complain: (text) => out.push(text) }), 0);
  return out.join('').trimEnd().split('\n');
}

test('need closes its crew-handoff', (t) => {
  tempDeck(t);
  const ticket = aTicket('yellow');
  const handoff = aCrewHandoff(ticket.id);
  postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'A or B.', repo: REPO, options: ['A', 'B'], ticket: ticket.id });
  needTicket(ticket.id);
  const { said, announce } = announcer();

  assert.equal(settleCrew(announce), 1);

  const closed = byId(handoff.id);
  assert.ok(closed.resolvedAt, 'closed');
  assert.equal(closed.resolution, `closed by the deck: ${ticket.id} moved to concluding`);
  assert.equal(said.count, 1, 'one announcement for the close');
  assert.equal(settleCrew(announce), 0, 'nothing left to close');
  assert.equal(said.count, 1, 'and no second announcement');
});

test('recut and close name their move', () => {
  const ticket = (id, state, extra = {}) => ({ id, kind: KIND_TICKET, state, ...extra });
  const handoff = (id, on) => ({ id, kind: KIND_CREW_HANDOFF, ticket: on });
  const items = [
    ticket('itm_red', 'red'), ticket('itm_green', 'green'), ticket('itm_closed', 'closed'), ticket('itm_done', 'yellow', { resolvedAt: '2026-11-25T00:00:00Z' }),
    handoff('itm_h1', 'itm_red'), handoff('itm_h2', 'itm_green'), handoff('itm_h3', 'itm_closed'), handoff('itm_h4', 'itm_done'), handoff('itm_h5', 'itm_gone'),
  ];

  assert.deepEqual(settledCrewHandoffsOf(items).map(({ item, why }) => [item.id, why]), [
    ['itm_h1', 'sent back to planning'],
    ['itm_h2', 'moved to concluding'],
    ['itm_h3', 'closed'],
    ['itm_h4', 'closed'],
    ['itm_h5', 'closed'],
  ]);
});

test("a yellow ticket's item stays open", () => {
  const items = [
    { id: 'itm_released', kind: KIND_TICKET, state: 'yellow' },
    { id: 'itm_h1', kind: KIND_CREW_HANDOFF, ticket: 'itm_released' },
    { id: 'itm_h2', kind: KIND_CREW_HANDOFF },
    { id: 'itm_h3', kind: KIND_CREW_HANDOFF, ticket: 'itm_gone', resolvedAt: '2026-11-25T00:00:00Z' },
  ];

  assert.deepEqual(settledCrewHandoffsOf(items), [], 'a yellow ticket, no ticket, or already closed: nothing named');
  assert.deepEqual(settledCrewHandoffsOf([]), []);
});

test('a store edit is caught on the next write', (t) => {
  tempDeck(t);
  // Written straight into the store file, as a deck that was down would find it.
  const ticket = aTicket('green', 'edited');
  const handoff = aCrewHandoff(ticket.id);

  assert.equal(settleCrew(() => {}), 1, 'one call');

  assert.equal(byId(handoff.id).resolution, `closed by the deck: ${ticket.id} moved to concluding`);
});

test('each close is traced', async (t) => {
  tempDeck(t);
  const [red, gone] = [aTicket('red', 'recut'), 'itm_000000000000'];
  const [first, second] = [aCrewHandoff(red.id), aCrewHandoff(gone)];

  assert.equal(settleCrew(() => {}), 2);

  const lines = await traced(first.id);
  assert.match(lines[0], new RegExp(` resolved crew-handoff item=${first.id} ticket=${red.id} agent=deck$`));
  assert.equal(lines.length, 2, 'one row and the tail');
  assert.equal(lines.at(-1), 'done', 'a deck close is the end of the hand-off');
  assert.equal(byId(first.id).resolution, `closed by the deck: ${red.id} sent back to planning`);
  assert.equal(byId(second.id).resolution, `closed by the deck: ${gone} closed`);
  assert.match((await traced(second.id))[0], new RegExp(` resolved crew-handoff item=${second.id} ticket=${gone} agent=deck$`));
});

test('a pressed item waits for the pilot', (t) => {
  tempDeck(t);
  const ticket = aTicket('yellow', 'pressed');
  const handoff = aCrewHandoff(ticket.id);
  addReply(handoff.id, HANDOFF_FAILED);

  assert.equal(closeCrewHandoffs(ticket.id), '', 'a grant leaves a pressed item open');
  assert.equal(byId(handoff.id).resolvedAt, undefined);

  const green = aTicket('green', 'pressed and moved');
  const moved = aCrewHandoff(green.id);
  addReply(moved.id, HANDOFF_FAILED);
  assert.equal(settleCrew(() => {}), 0, 'a move leaves a pressed item open');

  addPilotMessage(handoff.id, 'Briefing a fresh agent from the branch.');
  assert.equal(closeCrewHandoffs(ticket.id), `; closed ${handoff.id}`, 'after the pilot replies, the grant closes it');
  assert.equal(byId(handoff.id).resolution, 'successor granted');

  addPilotMessage(moved.id, 'Seen.');
  assert.equal(settleCrew(() => {}), 1, 'after the pilot replies, the next settle closes it');
});

test('a refused close never loops', (t) => {
  tempDeck(t);
  const ticket = aTicket('green', 'refused');
  // Owned by the architect, so a close as the pilot is refused.
  const theirs = postStored({ kind: KIND_CREW_HANDOFF, title: 'Handoff: theirs', body: 'Theirs.', repo: REPO, ticket: ticket.id, owner: 'architect' });
  const logged = t.mock.method(console, 'error', () => {});
  const { said, announce } = announcer();

  assert.equal(settleCrew(announce), 0);
  assert.equal(logged.mock.callCount(), 1, 'logged once');
  assert.match(String(logged.mock.calls[0].arguments.join(' ')), new RegExp(theirs.id), 'the log names the item');

  assert.equal(settleCrew(announce), 0);
  assert.equal(logged.mock.callCount(), 1, 'a second call logs nothing');
  assert.equal(said.count, 0, 'nothing closed, nothing announced');
  assert.equal(byId(theirs.id).resolvedAt, undefined);
});
