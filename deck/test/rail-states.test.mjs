/**
 * S16 of yellow-lane (spec 13): the Tickets tab reads red, yellow, green. A planning ticket is red and says
 * `planning`, a yellow one reads `planned` (never the main slot's live one, ADR 0087), a live green one `concluding`, and the queues stand in that order under
 * those headings. Colour follows the state name, so a rewrite of the markup keeps the label and the
 * `data-state` per state. Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_TICKET } from '../items.mjs';
import { deckLanes, listItems, registerRun } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state, ...(state === 'yellow' ? {} : { live: true }) });
const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
// renderHomePage's arguments that matter: items, runs, repo, lanes (last).
const tabPage = () => renderHomePage(listItems(), runs(), REPO, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, deckLanes());

test('each state carries its label and class', (t) => {
  tempDeck(t);
  aTicket('Plan it', 'red');
  aTicket('Build it', 'yellow');
  aTicket('Close it', 'green');
  const html = tabPage();
  const badge = (state) => html.match(new RegExp(`<span class="ticket-state" data-state="${state}">([^<]*)</span>`))?.[1];
  assert.equal(badge('red'), 'planning');
  // A yellow ticket is never the main slot's live one (ADR 0087), so its badge is the parked word; STATE_LABEL's `implementing` is not reached.
  assert.equal(badge('yellow'), 'planned');
  assert.equal(badge('green'), 'concluding');
});

test('the queues read in order', (t) => {
  tempDeck(t);
  aTicket('Close it', 'green');
  aTicket('Build it', 'yellow');
  aTicket('Plan it', 'red');
  const folds = [...tabPage().matchAll(/<details class="ticket-queue" data-queue="([a-z]+)"[^>]*><summary>(\w+) /g)].map(([, state, heading]) => [state, heading]);
  assert.deepEqual(folds, [['red', 'Red'], ['yellow', 'Yellow'], ['green', 'Green']]);
});
