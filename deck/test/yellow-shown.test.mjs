/**
 * S5 of yellow-agent (spec 4, L16): a yellow ticket's questions show on the main page. The main
 * deck never holds a yellow ticket in hand (S4, ADR 0087), so overview-one-ticket L20 hid its
 * threads; a question the co-pilot passes up is the user's to answer while the ticket builds, and
 * shows as a card while it is open. Any other ticket's threads still wait behind the one in hand.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_QUESTION, KIND_TICKET, inHandOf, isBehind } from '../items.mjs';
import { listItems, postItem, registerRun } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const askOn = (ticket, extra = {}) =>
  postItem({ kind: KIND_QUESTION, title: `About ${ticket.title}`, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket: ticket.id, ...extra });

const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
const home = () => renderHomePage(listItems(), runs(), null, false, {}, {}, Date.now());
const listed = (html, item) => html.includes(`<h2><a href="/thread/${item.id}">`);

test('a blocking question under a yellow ticket is drawn on the home page', (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  const yellow = aTicket('Yellow', 'yellow');
  const onRed = askOn(red);
  const blocker = askOn(yellow, { blocking: true });

  assert.equal(inHandOf(listItems(), REPO, 'red')?.id, red.id, 'the planning lane still never holds the yellow ticket');
  assert.equal(isBehind(blocker, listItems()), false, 'a yellow ticket\'s question is not behind');
  const html = home();
  assert.ok(listed(html, blocker), 'the co-pilot\'s question is a card on the home page');
  assert.ok(listed(html, onRed), 'beside the ticket in hand\'s');
});

test('a question under a green ticket behind the one in hand stays hidden', (t) => {
  tempDeck(t);
  const ahead = aTicket('Ahead', 'green');
  const green = aTicket('Green', 'green');
  aTicket('Yellow', 'yellow');
  const onAhead = askOn(ahead);
  const behind = askOn(green, { blocking: true });

  assert.equal(isBehind(behind, listItems()), true, 'L20 holds for every ticket that is not yellow');
  const html = home();
  assert.ok(listed(html, onAhead) && !listed(html, behind), 'the green ticket\'s question waits behind the green one in hand (three-lanes spec 4)');
});

// L16: the co-pilot decides what it can and sends `main` only what the user must answer; the
// pilot posts that one blocking, under its ticket, and never runs it through its own blocking test.
test('the pilot posts only a co-pilot\'s user-only questions', () => {
  const pilot = fs.readFileSync(fileURLToPath(new URL('../../agents/pilot.md', import.meta.url)), 'utf8');
  const yellow = pilot.slice(pilot.indexOf('\n## Yellow\n'), pilot.indexOf('\n**Green**')).replace(/\s+/g, ' ');
  assert.match(yellow, /Never post a question without its `ticket`; a co-pilot's is `blocking`\. Mark yours `blocking: true` only if/, 'a co-pilot\'s question goes up blocking, with its ticket; the blocking test is the pilot\'s own');
  const coPilot = fs.readFileSync(fileURLToPath(new URL('../../agents/pilot-co-pilot.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(coPilot, /A question you can decide, decide with its recommended default, record it as \*assumed\*, and carry on; nothing is posted\./, 'a decidable one never reaches the pilot');
});
