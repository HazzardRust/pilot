/**
 * S2 of overview-one-ticket (spec 9-11; L2, L5, L12; ADR 0065): the Tickets panel's highlight follows
 * the ticket in hand (`inHandOf`: the live ticket, else `nextTicketOf`), live or parked. With only yellow
 * tickets and none live, the main deck holds nothing: the sub-deck takes yellow (pilot-branch L8), so
 * there is no highlight. The tab draws no colour at all (ticket-state-accents L7; ADR 0105).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_TICKET, inHandOf } from '../items.mjs';
import { listItems, registerRun } from '../store.mjs';
import { tabsOf } from '../tabs.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
const tabOf = () => tabsOf(runs(), listItems())[0];
const tabPage = () => renderHomePage(listItems(), runs(), REPO, false, {}, {}, Date.now());
/** The id of the ticket the chain would take in `state`'s lane: the live one, else the next. */
const inHand = (state) => inHandOf(listItems(), REPO, state)?.id ?? null;

/** The ids of the Tickets rows the page highlights, in page order. */
const highlighted = (html) =>
  [...html.matchAll(/<li data-state="[a-z]+" class="in-hand">(?:<span class="next">next<\/span>)?<a href="\/thread\/(itm_[0-9a-f]+)">/g)].map((match) => match[1]);
/** The strip's link for this deck: its name and count, and no state (ticket-state-accents L7). */
const tabLink = (html) => html.match(/<nav class="runs-strip".*?<\/nav>/s)[0].match(/<a [^>]*>.*?<\/a>/gs)[1];

test('in-hand still names the ticket the chain would take', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'green');
  aTicket('Second', 'green');

  assert.equal(inHand('green'), first.id, 'the green head, parked');
  assert.deepEqual(highlighted(tabPage()), [first.id], 'the panel highlights it');
  assert.equal(Object.hasOwn(tabOf(), 'phase'), false, 'the tab carries no colour');
  assert.doesNotMatch(tabLink(tabPage()), /phase/, 'the strip draws none');
});

test("none live: each stage's next row is highlighted; one live: that row only", (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  const green = aTicket('Green', 'green');
  aTicket('Yellow', 'yellow'); // session-row L7: an open yellow keeps green before red

  assert.deepEqual(highlighted(tabPage()), [red.id, green.id], "each stage's head is in hand (three-lanes spec 6)");
  takeLive(red.id);
  assert.deepEqual(highlighted(tabPage()), [red.id], 'the live ticket, and not the next one too');
  assert.equal(inHand('red'), red.id, 'what the chain takes is the live ticket');
});

test('two yellow and none live: the main tab draws no colour and no highlight', (t) => {
  tempDeck(t);
  aTicket('First', 'yellow');
  aTicket('Second', 'yellow');

  assert.deepEqual([inHand('red'), inHand('green')], [null, null], 'the main deck holds nothing');
  const html = tabPage();
  assert.doesNotMatch(tabLink(html), /phase/);
  assert.deepEqual(highlighted(html), []);
});
