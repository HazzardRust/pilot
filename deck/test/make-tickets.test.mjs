/**
 * S4 of ticket-making: the Tickets tab opens a ticket-making thread in one press
 * (spec 1; A6). One form, `<form method="post" action="/create" class="make-tickets">`,
 * carrying the fixed name `Add` (deck-press-feedback S6) and the tab's own repository — the
 * existing `POST /create` route, unchanged, so the thread it opens is a plain
 * user thread the pilot answers, the same as one the user types a name for.
 *
 * No name to type and no confirm step: the thread is empty until the user
 * writes in it, and a stray one is closed like any Create thread (S4.md).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { deckOnAPort, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_TICKET, KIND_USER, ownerOf } from '../items.mjs';
import { TICKET_MAKING_TITLE, renderHomePage } from '../ui/render.mjs';

const { addReply, createThread, listItems, postItem, registerRun, repliesSince } = await import('../store.mjs');

const ALPHA = path.resolve('D:/work/alpha');

/** One rail bookmark's own markup, up to the next one (or the end of the strip). */
const section = (page, id) => {
  const start = page.indexOf(`<details class="tab" id="${id}">`);
  const next = page.indexOf('<details class="tab" id="', start + 1);
  return page.slice(start, next === -1 ? page.indexOf('</aside>', start) : next);
};

test("the Tickets tab's button reads Add and opens a thread titled Add", (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });

  const withNone = section(renderHomePage(listItems(), [run], ALPHA), 'tickets');
  assert.match(withNone, /<form method="post" action="\/create" class="make-tickets" data-in-place="move">/, 'drawn with no tickets queued, and moves in place');
  assert.match(withNone, /<input type="hidden" name="name" value="Add" \/>/, 'the thread it opens is titled Add');
  assert.match(withNone, /<input type="hidden" name="repo" value="[^"]*alpha" \/>/i, "the tab's own repository");
  assert.match(withNone, /<button type="submit">Add<\/button>/);

  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: ALPHA });
  const withTickets = section(renderHomePage(listItems(), [run], ALPHA), 'tickets');
  assert.match(withTickets, /<form method="post" action="\/create" class="make-tickets" data-in-place="move">/, 'still drawn with a ticket queued');
});

test('posting the Add form opens a user thread titled Add on that repository and redirects to it', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });

  // The form's own fields, exactly as `renderMakeTickets` writes them.
  const response = await fetch(`${base}/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ name: TICKET_MAKING_TITLE, repo: ALPHA }),
    redirect: 'manual',
  });

  assert.equal(response.status, 303);
  const thread = listItems().find((item) => item.kind === KIND_USER);
  assert.equal(thread.title, 'Add');
  assert.equal(thread.repo, ALPHA);
  assert.equal(response.headers.get('location'), `/thread/${thread.id}`);
});

test("the thread is the pilot's and a message in it wakes a pilot deck_wait with that title", (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: TICKET_MAKING_TITLE, repo: ALPHA });

  assert.equal(ownerOf(thread), 'pilot');

  addReply(thread.id, 'Here is what I want built.');
  const { replies } = repliesSince(0);
  const mine = replies.find((reply) => reply.itemId === thread.id);
  assert.ok(mine, "the reply wakes a wait scoped to this thread's repository");
  assert.equal(mine.title, TICKET_MAKING_TITLE);
  assert.equal(mine.owner, 'pilot');
});

// tickets-add-button S1: Add sits on the Tickets panel's title row, by the stylesheet alone (L1, L2).
const css = () => fs.readFileSync(new URL('../ui/deck.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css().match(new RegExp(`\\n${escaped} \\{[^}]*\\}`))?.[0];
};

test("the Add button shares the panel title's row", () => {
  const panel = rule('#tickets > .panel');
  assert.ok(panel, 'scoped to the Tickets panel, so no other panel title moves');
  assert.match(panel, /display:\s*grid/);
  assert.match(panel, /grid-template-columns:\s*1fr auto/, 'the title takes the row, Add its right-hand end');
  assert.match(panel, /align-items:\s*baseline/, "Add's text on the title's baseline");
  assert.match(panel, /align-content:\s*start/, "a saved panel height leaves the rows under the title, not stretched apart");
  assert.match(rule('#tickets .tickets-state') ?? '', /display:\s*contents/, 'the wrapper steps out of the layout, so its children are the grid items');
});

test('what follows Add spans the row below', () => {
  assert.match(rule('.tickets-state > :not(form.make-tickets)') ?? '', /grid-column:\s*1 \/ -1/);
});

test('Add is the first thing in the tickets state, so it lands beside the title', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const opens = /<div class="panel" data-live="tickets" data-name="Tickets"><div class="tickets-state" [^>]*><form method="post" action="\/create" class="make-tickets"/;

  assert.match(section(renderHomePage(listItems(), [run], ALPHA), 'tickets'), opens, 'with no ticket queued');
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: ALPHA });
  assert.match(section(renderHomePage(listItems(), [run], ALPHA), 'tickets'), opens, 'with a ticket queued');
});

test('no dead make-tickets rule', () => {
  assert.doesNotMatch(css(), /\.panel > form\.make-tickets/, 'the form is a child of .tickets-state, never of .panel');
  assert.match(rule('.tickets-state > form.make-tickets') ?? '', /padding-bottom:\s*0\.6rem/, 'the gap before what follows rides on the live selector');
});
