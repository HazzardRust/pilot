/**
 * S2 of ticket-making: the pilot moves a ticket with `deck_ticket` (spec 8; L3, A4, A5).
 *
 * The tool calls S1's `moveTicket`, the one write, so a move through it leaves the store
 * exactly as the page's arrow does, and announces itself so an open Tickets tab swaps
 * its queue in place. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, shapedTicketBody } from '../testUtils.mjs';
import * as items from '../items.mjs';

const store = await import('../store.mjs');
const { browserCount } = await import('../server.mjs');

const { KIND_TICKET } = items;
const { listItems, postItem } = store;

const ALPHA = path.resolve('D:/work/alpha');

const aTicket = (title) => postItem({ kind: KIND_TICKET, sliceCount: 60, title, body: shapedTicketBody(title), repo: ALPHA });
const queue = () => items.ticketQueueOf(listItems(), ALPHA).map((item) => item.title);

const deckTicket = (base, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: args }),
  });

const arrow = (base, id, direction) =>
  fetch(`${base}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: new URLSearchParams({ id, direction }),
  });

test('deck_ticket up through /api/tool reorders the queue exactly as the arrow does', async (t) => {
  const base = await deckOnAPort(t);
  aTicket('one');
  aTicket('two');
  const three = aTicket('three');

  const answer = await deckTicket(base, { id: three.id, action: 'up' });
  assert.equal(answer.status, 200);
  const { content } = await answer.json();
  assert.equal(content[0].text, `Moved ${three.id} up: 2 of 3 in this directory's queue.`);
  assert.deepEqual(queue(), ['one', 'three', 'two']);
  const byTool = JSON.stringify(listItems());

  // Undo with the arrow, then redo with it: the store the arrow leaves is the tool's, byte for byte.
  assert.equal((await arrow(base, three.id, 'down')).status, 303);
  assert.equal((await arrow(base, three.id, 'up')).status, 303);
  assert.equal(JSON.stringify(listItems()), byTool, 'the arrow and the tool write the same store');

  const down = await deckTicket(base, { id: three.id, action: 'down' });
  assert.equal((await down.json()).content[0].text, `Moved ${three.id} down: 3 of 3 in this directory's queue.`);
  assert.deepEqual(queue(), ['one', 'two', 'three']);
});

test('deck_ticket announces a change', async (t) => {
  const base = await deckOnAPort(t);
  aTicket('one');
  const two = aTicket('two');

  const controller = new AbortController();
  t.after(() => controller.abort());
  const reader = (await fetch(`${base}/events`, { signal: controller.signal })).body.getReader();
  const frames = [];
  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      frames.push(new TextDecoder().decode(value));
    }
  })().catch(() => {
    /* aborted when the test ends */
  });
  for (let attempt = 0; attempt < 400 && browserCount() !== 1; attempt += 1) await sleep(5);
  assert.equal(browserCount(), 1, 'the page is watching the deck');

  await deckTicket(base, { id: two.id, action: 'up' });
  await sleep(50);
  assert.equal(frames.join('').match(/event: changed/g)?.length, 1, 'one change for one move');

  await deckTicket(base, { id: two.id, action: 'up' });
  await sleep(50);
  assert.equal(frames.join('').match(/event: changed/g)?.length, 1, 'a refused move announces nothing');
});

test('deck_ticket refuses what moveTicket refuses, and an unknown action', async (t) => {
  const base = await deckOnAPort(t);
  const head = aTicket('head');
  const tail = aTicket('tail');
  const before = JSON.stringify(listItems());
  const refusal = async (args) => {
    const answer = await deckTicket(base, args);
    assert.equal(answer.status, 400, JSON.stringify(args));
    return (await answer.json()).error;
  };

  assert.match(await refusal({ id: head.id, action: 'up' }), /already the head/);
  assert.match(await refusal({ id: tail.id, action: 'down' }), /already the tail/);
  assert.match(await refusal({ id: head.id, action: 'sideways' }), /a ticket moves up, down, take, park, merge, need, pivot, co-pilot, release or verdicts, not sideways/);
  assert.match(await refusal({ id: 'itm_nothing', action: 'up' }), /no item itm_nothing/);
  assert.match(await refusal({ action: 'up' }), /id must be/);
  assert.equal(JSON.stringify(listItems()), before, 'the store is unchanged');
});

const deckPost = (base, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_post', arguments: args }),
  });

test('a ticket posted with sliceCount 15 is stored with it', async (t) => {
  const base = await deckOnAPort(t);
  const answer = await deckPost(base, { kind: KIND_TICKET, sliceCount: 15, title: 'Fifteen', body: shapedTicketBody('Fifteen'), repo: ALPHA });
  assert.equal(answer.status, 200, await answer.clone().text());
  const stored = listItems().find((item) => item.title === 'Fifteen');
  assert.equal(stored.sliceCount, 15);
  assert.equal('estimate' in stored, false);
});

test('a ticket posted with estimate is refused naming estimate and listing sliceCount', async (t) => {
  const base = await deckOnAPort(t);
  const answer = await deckPost(base, { kind: KIND_TICKET, estimate: 90, title: 'Minutes', body: shapedTicketBody('Minutes'), repo: ALPHA });
  const { error } = await answer.json();
  assert.match(error, /^a ticket item takes no estimate\. It takes .*sliceCount.*\.$/);
  assert.equal(listItems().some((item) => item.title === 'Minutes'), false, 'nothing stored');
});
