/**
 * S2 of ticket-states: small tickets are retired from the deck (spec 10, L14). `deck_post` takes
 * no `size`, `deck_ticket` only moves a ticket, and a ticket stored with the old `size: 'small'`
 * and `startedAt` queues as any other ticket: the fields are ignored, never read (L12). Every
 * test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_TICKET, nextTicketOf, ticketQueueOf } from '../items.mjs';
import { TOOLS } from '../tools.mjs';

const { DeckRefusal, listItems, postItem } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const ALPHA = path.resolve('D:/work/alpha');
const toolNamed = (name) => TOOLS.find((tool) => tool.name === name);

test('deck_post refuses size as an unknown field', (t) => {
  tempDeck(t);
  assert.equal(Object.hasOwn(toolNamed('deck_post').inputSchema.properties, 'size'), false, 'the schema advertises no size');
  const before = JSON.stringify(listItems());
  assert.throws(
    () => callTool('deck_post', { kind: KIND_TICKET, sliceCount: 60, title: 'wee', body: shapedTicketBody('wee'), repo: ALPHA, size: 'small' }),
    (error) => error instanceof DeckRefusal && /a ticket item takes no size\b/.test(error.message),
  );
  assert.equal(JSON.stringify(listItems()), before, 'nothing refused was stored');
});

test('deck_ticket refuses start, small and regular by name', (t) => {
  tempDeck(t);
  assert.deepEqual(toolNamed('deck_ticket').inputSchema.properties.action.enum, ['up', 'down', 'take', 'park', 'merge', 'need', 'pivot', 'co-pilot', 'release', 'verdicts'], 'take and park are ticket-states S4, merge S9, need and pivot overview-one-ticket S4, co-pilot and release clear-waits-co-pilot S2, verdicts architect-runs-red S3');
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'flip', body: shapedTicketBody('flip'), repo: ALPHA });
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'other', body: shapedTicketBody('other'), repo: ALPHA });
  const before = JSON.stringify(listItems());
  for (const action of ['start', 'small', 'regular']) {
    assert.throws(
      () => callTool('deck_ticket', { id: ticket.id, action }),
      (error) => error instanceof DeckRefusal && error.message === `a ticket moves up, down, take, park, merge, need, pivot, co-pilot, release or verdicts, not ${action}`,
      action,
    );
  }
  assert.equal(JSON.stringify(listItems()), before, 'no refused action wrote anything');
});

test('a stored ticket with size small and startedAt queues as any other ticket', (t) => {
  tempDeck(t);
  const legacy = postStored({
    kind: KIND_TICKET,
    title: 'legacy',
    body: shapedTicketBody('legacy'),
    repo: ALPHA,
    state: 'red',
    size: 'small',
    startedAt: new Date().toISOString(),
  });
  const regular = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'regular', body: shapedTicketBody('regular'), repo: ALPHA });

  assert.deepEqual(ticketQueueOf(listItems(), ALPHA).map((item) => item.id), [legacy.id, regular.id]);
  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, legacy.id, 'a legacy small ticket can be the head');
});
