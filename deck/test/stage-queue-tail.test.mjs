/**
 * S1 of stage-queue-tail: a ticket that turns green joins the back of its repository's green
 * queue (L2-L6). The queue is deck order, so `enterStage` moves the ticket in `deck.items`; these
 * pins read the queue through `ticketQueueOf` and `nextTicketOf`. Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_QUESTION, KIND_TICKET, KIND_WALKTHROUGH, SIGN_OFF, nextTicketOf, ticketQueueOf } from '../items.mjs';
import { addReply, listItems, needTicket, pivotTicket, postItem, reopenItem, resolveItem, setCoPilot, yieldTicket } from '../store.mjs';
import { enterStage } from '../store-stage.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const OTHER = path.join('D:', 'work', 'elsewhere');

const stored = (title, state, repo = REPO) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo, sliceCount: 3, state });
const asking = (ticket) => postStored({ kind: KIND_QUESTION, title: 'Which?', body: 'A or B.', repo: REPO, ticket });
const greens = (repo = REPO) => ticketQueueOf(listItems(), repo, 'green').map((item) => item.id);
const yellows = (repo = REPO) => ticketQueueOf(listItems(), repo, 'yellow').map((item) => item.id);
const reread = (id) => listItems().find((item) => item.id === id);
const gate2On = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket });
const EARLIER = '2026-10-01T09:00:00.000Z';
const LATER = '2026-10-02T09:00:00.000Z';
const ids = () => listItems().map((item) => item.id);

test('a ticket needed later is the green tail', (t) => {
  tempDeck(t);
  const older = stored('older yellow', 'yellow');
  const other = stored('already green', 'green');
  postStored({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: older.id });

  needTicket(older.id);

  assert.deepEqual(greens(), [other.id, older.id]);
  assert.equal(nextTicketOf(listItems(), REPO, 'green').id, other.id);
});

test('a gate2 post on a yellow is the green tail', (t) => {
  tempDeck(t);
  const older = stored('older yellow', 'yellow');
  const other = stored('already green', 'green');

  gate2On(older.id);

  assert.deepEqual(greens(), [other.id, older.id]);
  assert.equal(nextTicketOf(listItems(), REPO, 'green').id, other.id);
});

test('a gate2 on a green keeps its place', (t) => {
  tempDeck(t);
  const first = stored('first green', 'green');
  stored('second green', 'green');
  takeLive(first.id);
  const before = ids();

  const gate2 = gate2On(first.id);

  assert.deepEqual(ids().filter((id) => id !== gate2.id), before);
});

test('other items keep their order', (t) => {
  tempDeck(t);
  const older = stored('older yellow', 'yellow');
  const question = asking(older.id);
  const elsewhere = stored('green elsewhere', 'green', OTHER);
  const other = stored('already green', 'green');
  const before = ids();

  needTicket(older.id);

  assert.deepEqual(
    ids().filter((id) => id !== older.id),
    before.filter((id) => id !== older.id),
  );
  assert.deepEqual(ids().slice(-2), [other.id, older.id]);
  assert.deepEqual(greens(OTHER), [elsewhere.id]);
});

test('a lone green stays where it was', (t) => {
  tempDeck(t);
  const older = stored('older yellow', 'yellow');
  asking(older.id);
  stored('red one', 'red');
  const before = ids();

  needTicket(older.id);

  assert.deepEqual(ids(), before);
  assert.deepEqual(greens(), [older.id]);
});

// S2: a signed gate1 and a reopen join the back; a pivot lands in the order its ticket first turned green (A1, A2).

test('a gate1 signed later is the yellow tail', (t) => {
  tempDeck(t);
  const older = stored('older red', 'red');
  const other = stored('already yellow', 'yellow');
  takeLive(older.id);
  const evidence = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };
  const gate1 = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...evidence, ticket: older.id });

  addReply(gate1.id, SIGN_OFF);
  resolveItem(gate1.id, 'Signed off.');

  assert.equal(reread(older.id).state, 'yellow');
  assert.deepEqual(yellows(), [other.id, older.id]);
});

test('a reopened ticket is the green tail', (t) => {
  tempDeck(t);
  const older = postStored({
    kind: KIND_TICKET, title: 'older closed', body: shapedTicketBody('older closed'), repo: REPO, sliceCount: 3,
    state: 'closed', resolution: 'Done.', resolvedAt: LATER, greenAt: EARLIER,
  });
  const other = stored('already green', 'green');

  reopenItem(older.id);

  assert.deepEqual(greens(), [other.id, older.id]);
  assert.equal(reread(older.id).greenAt, EARLIER, 'greenAt kept');
});

test('the first green entry stamps greenAt once', (t) => {
  tempDeck(t);
  const start = Date.parse('2026-10-20T10:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const ticket = stored('building', 'yellow');
  postStored({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: ticket.id });

  needTicket(ticket.id);
  const first = new Date(start).toISOString();
  assert.equal(reread(ticket.id).greenAt, first, 'needTicket stamps the first green entry');

  t.mock.timers.tick(60_000);
  pivotTicket(ticket.id);
  assert.equal(reread(ticket.id).greenAt, first, 'a pivot keeps it');
  t.mock.timers.tick(60_000);
  gate2On(ticket.id);
  assert.equal(reread(ticket.id).state, 'green');
  assert.equal(reread(ticket.id).greenAt, first, 'a second green entry keeps it');

  const held = stored('held', 'yellow');
  setCoPilot(held.id, true);
  const question = postStored({
    kind: KIND_QUESTION, title: 'Which?', body: 'A or B', repo: REPO, ticket: held.id, blocking: true,
    postedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
  });
  yieldTicket(held.id, question.id);
  assert.equal(reread(held.id).state, 'green');
  assert.equal(reread(held.id).greenAt, undefined, 'a yield writes none');
});

test('pivots in a row keep landing order', async (t) => {
  for (const order of [['4', '3'], ['3', '4']]) {
    await t.test(`pivoting ${order.join(' then ')}`, (st) => {
      tempDeck(st);
      const five = stored('5 never green', 'yellow');
      const four = postStored({ kind: KIND_TICKET, title: '4', body: shapedTicketBody('4'), repo: REPO, sliceCount: 3, state: 'green', greenAt: LATER });
      const three = postStored({ kind: KIND_TICKET, title: '3', body: shapedTicketBody('3'), repo: REPO, sliceCount: 3, state: 'green', greenAt: EARLIER });
      const byName = { 3: three, 4: four };

      for (const name of order) pivotTicket(byName[name].id);

      assert.deepEqual(yellows(), [three.id, four.id, five.id]);
    });
  }
});

test('an unstamped pivot follows the stamped ones', () => {
  const ticket = (id, state, extra = {}) => ({ id, kind: KIND_TICKET, repo: REPO, state, replies: [], ...extra });
  const elsewhere = ticket('elsewhere', 'yellow', { repo: OTHER });
  const first = ticket('first', 'yellow', { greenAt: EARLIER });
  const second = ticket('second', 'yellow', { greenAt: LATER });
  const question = { id: 'question', kind: KIND_QUESTION, repo: REPO, ticket: 'first', replies: [] };
  const never = ticket('never', 'yellow');
  const unstamped = ticket('unstamped', 'green');
  const deck = { items: [elsewhere, first, second, question, never, unstamped] };

  enterStage(deck, unstamped, 'yellow', 'landed');

  assert.deepEqual(ticketQueueOf(deck.items, REPO, 'yellow').map((item) => item.id), ['first', 'second', 'unstamped', 'never']);
  const others = (item) => item.id !== 'unstamped';
  assert.deepEqual(deck.items.filter(others).map((item) => item.id), ['elsewhere', 'first', 'second', 'question', 'never']);
  assert.equal(unstamped.state, 'yellow');
  assert.equal(unstamped.greenAt, undefined, 'a yellow entry stamps nothing');
});

test('a resumed ticket returns to the yellow head', (t) => {
  tempDeck(t);
  const other = stored('queued yellow', 'yellow');
  const held = stored('held', 'yellow');
  setCoPilot(held.id, true);
  const question = postStored({
    kind: KIND_QUESTION, title: 'Which?', body: 'A or B', repo: REPO, ticket: held.id, blocking: true,
    postedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
  });
  yieldTicket(held.id, question.id);
  assert.equal(reread(held.id).state, 'green');
  assert.deepEqual(yellows(), [other.id]);

  addReply(question.id, 'A');

  assert.equal(reread(held.id).state, 'yellow');
  assert.deepEqual(yellows(), [held.id, other.id]);
});
