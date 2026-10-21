/**
 * S1 of overview-one-ticket (spec 1-8; L2-L4, L6, L13, L16; ADR 0065): the overview feeds one ticket
 * at a time. Per repository, the queue shows only the threads that name the ticket
 * in hand (`inHandOf`: the live ticket, else `nextTicketOf`) and every unticketed thread; the arrows
 * walk and the strip counts that shown queue, and a hidden thread is a press away on its ticket's
 * Tickets row.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_QUESTION, KIND_REPORT, KIND_TICKET, KIND_WALKTHROUGH, inHandOf, isBehind } from '../items.mjs';
import { listItems, postItem, registerRun } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const askOn = (ticket, title = `About ${ticket?.title ?? 'nothing'}`) =>
  postItem({ kind: KIND_QUESTION, title, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ...(ticket && { ticket: ticket.id }) });
const aWalkthrough = (ticket) => postStored({ kind: KIND_WALKTHROUGH, title: `Walk ${ticket.title}`, body: 'Walk it.', repo: REPO, ticket: ticket.id });
const aReport = (ticket) => postItem({ kind: KIND_REPORT, title: 'Closing report', body: 'Done.', repo: REPO, ticket: ticket.id });

const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
const overview = () => renderHomePage(listItems(), runs(), null, false, {}, {}, Date.now());
const tabPage = () => renderHomePage(listItems(), runs(), REPO, false, {}, {}, Date.now());
const threadPage = (item) => renderThreadPage(item, listItems(), runs(), {}, {}, false, []);

/** Whether the page lists this thread as a card in its queue: the card's heading links it. */
const listed = (html, item) => html.includes(`<h2><a href="/thread/${item.id}">`);
const rowOf = (html, ticket) => html.match(new RegExp(`<li data-state="[a-z]+"(?: class="in-hand")?>(?:<span class="next">next</span>)?<a href="/thread/${ticket.id}">.*?</details></li>`, 's'))?.[0] ?? '';
const counts = (html) => [...html.match(/<nav class="runs-strip".*?<\/nav>/s)[0].matchAll(/<span class="count">(\d+)<\/span>/g)].map((match) => Number(match[1]));

test('two green tickets with questions: the overview lists only the first\'s', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'green');
  const second = aTicket('Second', 'green');
  const asked = askOn(first);
  const behind = askOn(second);

  for (const html of [overview(), tabPage()]) {
    assert.ok(listed(html, asked), 'the ticket in hand\'s question is listed');
    assert.ok(!listed(html, behind), 'the second green ticket\'s question waits behind it');
  }
  assert.ok(listItems().find((item) => item.id === behind.id).resolvedAt === undefined, 'hidden, never closed (L3)');
});

test('a red ticket ahead of a green one: both lanes\' threads are listed (three-lanes spec 4)', (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  const green = aTicket('Green', 'green');
  const walk = aWalkthrough(red);
  const asked = askOn(green);

  assert.equal(inHandOf(listItems(), REPO, 'green')?.id, green.id, 'the concluding lane\'s');
  assert.equal(inHandOf(listItems(), REPO, 'red')?.id, red.id, 'the planning lane\'s');
  const html = overview();
  assert.ok(listed(html, asked));
  assert.ok(listed(html, walk), 'the red ticket is in hand on its own lane');
});

test('a live red ticket leaves a waiting green one in hand on its own lane', (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  const green = aTicket('Green', 'green');
  const walk = aWalkthrough(red);
  const asked = askOn(green);
  takeLive(red.id);

  assert.equal(inHandOf(listItems(), REPO, 'red')?.id, red.id);
  const html = overview();
  assert.ok(listed(html, walk), 'the live ticket\'s threads are listed');
  assert.ok(listed(html, asked), 'the green ticket is in hand on the concluding lane (three-lanes spec 4)');
});

test('closing the ticket in hand lists the next one\'s threads', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'green');
  const second = aTicket('Second', 'green');
  askOn(first);
  const next = askOn(second);
  assert.ok(!listed(overview(), next));

  aReport(first);

  assert.ok(listed(overview(), next), 'the re-render a live swap fetches brings the next ticket\'s question');
});

test('an unticketed question is listed whatever is in hand', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'green');
  const second = aTicket('Second', 'green');
  const one = askOn(first);
  const two = askOn(second);
  const unticketed = askOn(undefined, 'Unticketed');

  const before = overview();
  assert.ok(listed(before, unticketed) && listed(before, one) && !listed(before, two), 'beside the first ticket in hand');
  aReport(first);
  const after = overview();
  assert.ok(listed(after, unticketed) && listed(after, two), 'and beside the second');
});

test('a hidden ticket\'s question is linked from its Tickets row', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'green');
  // Green, not yellow or red: a yellow ticket's threads are never behind (yellow-agent S5), and a red one is planning's.
  const second = aTicket('Second', 'green');
  const asked = askOn(first);
  const behind = askOn(second);
  const walk = aWalkthrough(second);

  const html = tabPage();
  assert.ok(!listed(html, behind), 'hidden from the queue');
  const row = rowOf(html, second);
  assert.match(row, /<details class="previews"><summary>threads<\/summary>/, 'a row that is not the head carries its threads');
  assert.ok(row.includes(`<a href="/thread/${behind.id}">`), 'its question opens from the row');
  assert.ok(row.includes(`<a href="/thread/${walk.id}">`), 'and its walkthrough');
  assert.ok(rowOf(html, first).includes(`<a href="/thread/${asked.id}">`), 'the head row keeps its own');
  assert.doesNotMatch(rowOf(html, aTicket('Quiet', 'red')), /previews/, 'a ticket with nothing open shows none');
});

test('the arrows and the tab count walk the shown queue', (t) => {
  tempDeck(t);
  // The clock is held and stepped a millisecond a post (S16): a fast ubuntu runner posted all five in
  // one, and a tie keeps deck order (thread-nav.test.mjs), oldest first, not the newest first asserted here.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-18T07:00:00.000Z') });
  const tick = (item) => (t.mock.timers.tick(1), item);
  const first = tick(aTicket('First', 'green'));
  const second = tick(aTicket('Second', 'green'));
  const asked = tick(askOn(first));
  tick(askOn(second));
  const unticketed = tick(askOn(undefined, 'Unticketed'));

  assert.deepEqual(counts(overview()), [2, 2], 'the overview and the tab each count the two cards listed');
  // Newest first: the unticketed question, then the first ticket's; from that last one › goes nowhere.
  const nav = threadPage(asked);
  assert.match(nav, /<span aria-disabled="true">›<\/span>/, '› from the last shown thread goes nowhere');
  assert.match(nav, /<span class="position" data-live="position">2\/2<\/span>/);
  assert.match(threadPage(unticketed), /<span class="position" data-live="position">1\/2<\/span>/);
});

test('a parked ticket\'s question is hidden until that ticket is taken', (t) => {
  tempDeck(t);
  // Two red tickets: a parked ticket is behind only its own stage's live one (three-lanes spec 4).
  const live = aTicket('Live', 'red');
  const red = aTicket('Red', 'red');
  takeLive(live.id);
  const parked = askOn(red);

  assert.ok(!listed(overview(), parked), 'behind the live red ticket (L16)');
  takeLive(red.id);
  assert.ok(listed(overview(), parked), 'taken, it is the ticket in hand');
});

// Spec 24, L19 (A5 reverted): a blocking question hides and shows with its ticket like any other thread.
test('a blocking question on a ticket that is not in hand is behind, and its Tickets row still counts and links it', (t) => {
  tempDeck(t);
  // Green, after the asked green one: a yellow ticket's threads are never behind (yellow-agent S5),
  // and a red one would be in hand on the planning lane (three-lanes spec 4).
  const green = aTicket('Green', 'green');
  const parked = aTicket('Parked', 'green');
  const blocker = postItem({ kind: KIND_QUESTION, title: 'Blocker', body: 'which?', repo: REPO, options: ['A'], recommended: 'A', ticket: parked.id, blocking: true });
  const asked = askOn(green);

  assert.ok(isBehind(blocker, listItems()), 'the parked green ticket is not in hand');
  const html = tabPage();
  assert.ok(listed(html, asked) && !listed(html, blocker), 'off the overview, beside the green ticket in hand');
  assert.deepEqual(counts(html), [1, 1], 'the strip counts only the shown card');
  assert.ok(rowOf(html, parked).includes(`<a href="/thread/${blocker.id}">`), 'its row links it');
});

test('with no ticket live, the main deck holds the green ticket in hand and never the yellow', (t) => {
  tempDeck(t);
  const green = aTicket('Green', 'green');
  const yellow = aTicket('Yellow', 'yellow');
  const onRed = askOn(green);
  const onYellow = askOn(yellow);

  assert.equal(inHandOf(listItems(), REPO, 'green')?.id, green.id, 'the green ticket is in hand');
  // A yellow ticket's threads show beside it all the same (yellow-agent S5, amending L20).
  const html = overview();
  assert.ok(listed(html, onRed) && listed(html, onYellow), 'both are listed');
});

test('an open thread naming a closed ticket is listed', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'green');
  aTicket('Second', 'green');
  const asked = askOn(first);
  aReport(first);

  assert.ok(listItems().find((item) => item.id === first.id).resolvedAt, 'the ticket is closed');
  assert.ok(listItems().find((item) => item.id === asked.id).resolvedAt === undefined, 'its question is still open');
  assert.ok(listed(overview(), asked), 'a closed ticket holds nothing behind it');
});
