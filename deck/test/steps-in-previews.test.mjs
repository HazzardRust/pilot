/**
 * S1 of steps-in-previews (spec 1, 2, 4; L2, L3, L4, A1): an open steps thread is queued for the user, so it is a
 * home card in both decks, never folded, counted and listed in Notifications; its card counts its steps and names its
 * ticket; its ticket's row reads `waiting on your steps`. It stays standing for agents (hooks/test/stop-gate.test.js).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_TICKET, NOT_YET, SIGN_OFF, STEPS_WAITING, isQueued, isStanding, stateOf } from '../items.mjs';
import { closeItem, listItems, postSteps, registerRun } from '../store.mjs';
import { foldedOf, queueOf, shownOf } from '../status.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { renderKind } from '../ui/render-cards.mjs';
import { ticketLabelOf } from '../ui/render-rail.mjs';
import { notificationsView } from '../view/notifications.mjs';
import { queueView } from '../view/queue.mjs';
import { stripView } from '../view/strip.mjs';

const REPO = path.resolve('D:/work/pilot');

const reads = (items) => ({ seq: 1, items, runs: [], numbers: {}, agents: {}, added: [], lanes: { coPilots: {}, switches: {}, records: [] }, held: [], alerts: {} });
const aGreen = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'green' });
const stepsOn = (ticket, count = 1) =>
  postSteps({ ticket: ticket.id, repo: REPO, title: `Human steps: ${ticket.title}`, steps: Array.from({ length: count }, (_, i) => ({ text: `Step ${i + 1} by hand.` })) });

/** A landed green ticket: its gate2 signed and landed, as the human-steps tests build one. */
function aLanded(title) {
  const ticket = postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, state: 'green', live: true, concludedBy: 'itm_0123456789ab' });
  const at = new Date().toISOString();
  postStored({
    kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.\n\n| spec | result | evidence |\n| --- | --- | --- |\n| 1 | pass | ok |', repo: REPO, ticket: ticket.id,
    options: [SIGN_OFF, NOT_YET], replies: [{ from: 'user', text: SIGN_OFF, repliedAt: at }], resolution: 'landed abc1234', resolvedAt: at,
    landing: { state: 'landed', sha: 'abc1234def' },
  });
  return ticket;
}

const counted = () => {
  const items = listItems();
  const queue = queueOf(items);
  return {
    cards: shownOf(queue, items).map((item) => item.id),
    folded: foldedOf(queue, items).map((item) => item.id),
    strip: stripView(reads(items)).items.count,
    open: notificationsView(reads(items)).open.map((row) => row.id),
  };
};

test('two open steps threads are two cards, none folded', (t) => {
  tempDeck(t);
  const [a, b] = [aGreen('In hand'), aGreen('Parked')];
  takeLive(a.id);
  const [onA, onB] = [stepsOn(a), stepsOn(b)];

  const before = counted();
  assert.deepEqual([...before.cards].sort(), [onA.id, onB.id].sort(), 'both are cards, the parked ticket\'s too');
  assert.deepEqual(before.folded, [], 'none folds behind the ticket in hand');
  assert.equal(before.strip, 2, 'the strip counts both');
  assert.deepEqual([...before.open].sort(), [onA.id, onB.id].sort(), 'Notifications lists both');

  closeItem(onA.id); // Done
  const after = counted();
  assert.deepEqual(after.cards, [onB.id]);
  assert.deepEqual(after.folded, []);
  assert.equal(after.strip, 1);
  assert.deepEqual(after.open, [onB.id]);
});

test('the card counts the steps and names the ticket', (t) => {
  tempDeck(t);
  const ticket = aGreen('Ship the widget');
  const steps = stepsOn(ticket, 3);

  assert.equal(renderKind(steps), 'human steps · 3 steps');
  assert.equal(renderKind(stepsOn(aGreen('One more'), 1)), 'human steps · 1 step', 'one step is singular');
  const cards = queueView(reads(listItems())).cards.filter((card) => card.id === steps.id);
  assert.equal(cards.length, 1, 'one view card');
  assert.equal(cards[0].kind, 'human steps · 3 steps');

  const runs = [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
  const html = renderHomePage(listItems(), runs, null, false, {}, {}, Date.now());
  const main = html.match(/<main data-live="queue">(.*?)<\/main>/s)[1];
  const articles = [...main.matchAll(/<article[^>]*>.*?<\/article>/gs)].map(([article]) => article).filter((article) => article.includes(`/thread/${steps.id}"`));
  assert.equal(articles.length, 1, 'one HTML home card');
  assert.match(articles[0], /human steps · 3 steps/);
  assert.ok(articles[0].includes('>Ship the widget</a>'), 'the card carries its ticket\'s title');
});

test('the row says waiting on your steps', (t) => {
  tempDeck(t);
  const landed = aLanded('Landed');
  const bare = aLanded('Landed, no steps');
  const parked = aGreen('Parked green');
  stepsOn(landed);
  const items = listItems();
  const row = (ticket) => ticketLabelOf(items.find((item) => item.id === ticket.id), stateOf(ticket), items);

  assert.equal(STEPS_WAITING, 'waiting on your steps');
  assert.equal(row(landed), 'waiting on your steps');
  assert.equal(row(bare), 'landing', 'without one, today\'s label');
  assert.equal(row(parked), 'needs you', 'without one, today\'s label');
});

test('an open steps thread is queued for the user and still standing for agents', (t) => {
  tempDeck(t);
  const steps = stepsOn(aGreen('Green'));
  assert.equal(isQueued(steps), true);
  assert.equal(isStanding(steps), true, 'A1: agents\' side unchanged');
  closeItem(steps.id);
  assert.equal(isQueued(listItems().find((item) => item.id === steps.id)), false, 'closed, it waits on no one');
});
