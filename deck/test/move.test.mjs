/**
 * S1 of ticket-making: up and down arrows move a ticket in the queue (spec 7; L2, L3, ADR 0047).
 *
 * A repository's queue is its open tickets in deck order (`ticketQueueOf`), and a move
 * swaps a ticket with its nearest queued neighbour in `deck.items` through `moveTicket`,
 * the one write. The chain, the tab and its badge already read that order, so
 * nothing sorts. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import * as items from '../items.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';

const store = await import('../store.mjs');
const { chainNext } = await import('../chain.mjs');
const { renderHomePage } = await import('../ui/render.mjs');

const { KIND_QUESTION, KIND_TICKET } = items;
const { DeckRefusal, listItems, postItem, registerRun, resolveItem, setSlices } = store;

const ALPHA = path.resolve('D:/work/alpha');
const BETA = path.resolve('D:/work/beta');

const aTicket = (title, repo = ALPHA) => postItem({ kind: KIND_TICKET, sliceCount: 60, title, body: shapedTicketBody(title), repo });
const queue = (repo = ALPHA) => items.ticketQueueOf(listItems(), repo).map((item) => item.title);

test('moveTicket up swaps a ticket with the open ticket above it in the same repository', (t) => {
  tempDeck(t);
  aTicket('one');
  aTicket('two');
  const three = aTicket('three');

  const after = store.moveTicket(three.id, 'up');

  assert.deepEqual(after.map((item) => item.title), ['one', 'three', 'two'], 'the queue after the move is returned');
  assert.deepEqual(queue(), ['one', 'three', 'two'], 'and is what a fresh read of the store says');
  assert.deepEqual(
    store.moveTicket(three.id, 'down').map((item) => item.title),
    ['one', 'two', 'three'],
    'down undoes up',
  );
});

test('a move skips another repository\'s tickets and closed tickets', (t) => {
  tempDeck(t);
  aTicket('a1');
  aTicket('b1', BETA);
  const taken = aTicket('a-taken');
  aTicket('b2', BETA);
  const a2 = aTicket('a2');
  resolveItem(taken.id, 'taken by hnd_x');
  const before = listItems().map((item) => item.id);

  store.moveTicket(a2.id, 'up');

  assert.deepEqual(queue(), ['a2', 'a1'], 'the nearest open ALPHA ticket, past BETA and past a taken one');
  assert.deepEqual(queue(BETA), ['b1', 'b2'], "BETA's order is untouched");
  const moved = listItems().map((item) => item.id);
  assert.deepEqual(
    moved.filter((id) => id !== a2.id && id !== before[0]),
    before.filter((id) => id !== a2.id && id !== before[0]),
    'only the two swapped tickets changed place',
  );
  assert.equal(moved.indexOf(a2.id), 0, 'a2 took a1\'s slot');
  assert.equal(moved.indexOf(before[0]), before.indexOf(a2.id), 'and a1 took a2\'s');
});

test('the head refuses up and the tail refuses down', (t) => {
  tempDeck(t);
  const head = aTicket('head');
  const tail = aTicket('tail');
  const before = JSON.stringify(listItems());

  assert.throws(() => store.moveTicket(head.id, 'up'), DeckRefusal);
  assert.throws(() => store.moveTicket(tail.id, 'down'), DeckRefusal);
  assert.throws(() => store.moveTicket(head.id, 'sideways'), DeckRefusal);
  assert.equal(JSON.stringify(listItems()), before, 'the store is unchanged');
});

test('moving a non-ticket or a closed ticket is refused', (t) => {
  tempDeck(t);
  aTicket('open');
  const question = postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'a or b', repo: ALPHA });
  const closed = aTicket('closed');
  resolveItem(closed.id, 'taken by hnd_x');
  const before = JSON.stringify(listItems());

  assert.throws(() => store.moveTicket(question.id, 'up'), DeckRefusal);
  assert.throws(() => store.moveTicket(closed.id, 'up'), DeckRefusal);
  assert.throws(() => store.moveTicket('itm_nothing', 'up'), DeckRefusal);
  assert.equal(JSON.stringify(listItems()), before, 'the store is unchanged');
});

test('after a move the chain takes the new head', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  aTicket('first');
  const second = aTicket('second');
  store.moveTicket(second.id, 'up');
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });

  const { handoff } = chainNext(ALPHA);

  assert.equal(handoff.next, second.id, 'the moved ticket is the one handed off');
  assert.deepEqual(queue(), ['second', 'first'], 'taken live, not resolved: it keeps its place (ticket-states spec 13)');
});

test('POST /move from the page reorders and redirects; a foreign Origin is refused', async (t) => {
  const origin = await deckOnAPort(t);
  aTicket('one');
  const two = aTicket('two');
  const tab = `/?run=${encodeURIComponent(ALPHA)}`;
  const move = (headers, direction = 'up', back = tab) =>
    fetch(`${origin}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      redirect: 'manual',
      body: new URLSearchParams({ id: two.id, direction, back }),
    });

  const foreign = await move({ origin: 'http://evil.example' });
  assert.equal(foreign.status, 403);
  const bare = await move({});
  assert.equal(bare.status, 403, 'no Origin at all is refused too: the page always sends one');
  assert.deepEqual(queue(), ['one', 'two'], 'a refused move changes nothing');

  const moved = await move({ origin });
  assert.equal(moved.status, 303);
  assert.equal(moved.headers.get('location'), tab, 'back to the tab the arrow was pressed on');
  assert.deepEqual(queue(), ['two', 'one']);

  // A hostile `back` value — another origin's URL, same as a hostile Referer once
  // was — is exactly what `backPath` refuses (N4): the redirect falls back to '/'.
  const elsewhere = await move({ origin }, 'down', 'http://evil.example/steal');
  assert.equal(elsewhere.headers.get('location'), '/', 'a hostile back value is not followed');

  const refused = await move({ origin }, 'down');
  assert.equal(refused.status, 400, 'the tail refusing down is the usual refusal');
  assert.deepEqual(queue(), ['one', 'two'], 'and changes nothing');
});

test('the tab renders arrows, none up on the head and none down on the tail', () => {
  const ticket = (id, title) => ({ id, kind: KIND_TICKET, title, body: `${title} spec`, repo: ALPHA, replies: [] });
  const run = { id: 'run_1', repo: ALPHA, name: 'alpha', pid: process.pid, startedAt: new Date().toISOString() };
  const page = renderHomePage([ticket('t1', 'Zebra'), ticket('t2', 'Apple'), ticket('t3', 'Mango')], [run], ALPHA);
  const rowOf = (title) => {
    const start = page.indexOf(`>${title}</a>`);
    return page.slice(start, page.indexOf('</li>', start));
  };
  const arrows = (row) => [...row.matchAll(/name="direction" value="(up|down)"/g)].map((match) => match[1]);

  assert.deepEqual(arrows(rowOf('Zebra')), ['down']);
  assert.deepEqual(arrows(rowOf('Apple')), ['up', 'down']);
  assert.deepEqual(arrows(rowOf('Mango')), ['up']);
  assert.match(rowOf('Apple'), /<form class="move" method="post" action="\/move">/);
  assert.match(rowOf('Apple'), /name="id" value="t2"/);
});
