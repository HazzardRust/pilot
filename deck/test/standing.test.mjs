/**
 * S3 of run-chaining: tickets and closing reports are standing kinds (spec 2, 6;
 * L6, L13). Each is open but never waiting on the user and never in Yours;
 * the repository tab lists them read-only in two
 * sections of the left strip. The Stop-gate half is `hooks/test/standing.test.js`,
 * and `hooks/test/join.test.js` pins that both sides spell the list alike.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { shapedTicketBody, tempDeck } from '../testUtils.mjs';
import {
  KINDS,
  KIND_REPORT,
  KIND_TICKET,
  KIND_WALKTHROUGH,
  STANDING_KINDS,
  appearsInYours,
  extraFieldsFor,
  isQueued,
  isStanding,
} from '../items.mjs';
import { tabsOf } from '../tabs.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const { listItems, postItem, registerRun, removeDeck, storeFile } = await import('../store.mjs');

const ALPHA = path.resolve('D:/work/alpha');
const BETA = path.resolve('D:/work/beta');
const aRun = (repo) => ({ id: 'run_1', repo, name: 'alpha', pid: process.pid, startedAt: new Date().toISOString() });
const anItem = (id, kind, title, extra = {}) => ({ id, kind, title, body: `${title} body`, repo: ALPHA, replies: [], ...extra });

/**
 * One of the rail's own bookmarks, up to the next one (or the end of the
 * strip). Not "up to the first `</details>`", the way the old `<details
 * class="run-section">` sections could be sliced: a ticket's own nested spec
 * `<details class="body">` closes before the bookmark itself does, and would
 * truncate the slice there instead.
 */
const section = (page, id) => {
  const start = page.indexOf(`<details class="tab" id="${id}">`);
  if (start === -1) return '';
  const next = page.indexOf('<details class="tab" id="', start + 1);
  return page.slice(start, next === -1 ? page.indexOf('</aside>', start) : next);
};

test('a ticket is open but not waiting', () => {
  const ticket = anItem('t1', KIND_TICKET, 'Run 2');
  assert.deepEqual(STANDING_KINDS, [KIND_TICKET, KIND_REPORT]);
  assert.ok(KINDS.includes(KIND_TICKET) && KINDS.includes(KIND_REPORT), 'both are kinds deck_post takes');
  assert.equal(isStanding(ticket), true);
  assert.equal(isQueued(ticket), false);
  assert.equal(appearsInYours(ticket), false);
  assert.equal(isStanding({ kind: 'question' }), false);
  assert.equal(isStanding(null), false);
});

test('a report renders as a walkthrough and is not waiting', () => {
  const report = anItem('r1', KIND_REPORT, 'Closing report', { url: 'http://127.0.0.1:3000', screens: ['Open the page'] });
  assert.deepEqual(
    extraFieldsFor(KIND_REPORT),
    extraFieldsFor(KIND_WALKTHROUGH).filter((name) => !['gate', 'longer', 'blocking'].includes(name)),
    'every walkthrough field, its ticket the one it closes (ticket-states L6, A1), but its gate (L5), the body cap backdoor, longer (short-by-default L3), and blocking (yellow-lane L3)',
  );
  assert.equal(isQueued(report), false);
  assert.equal(appearsInYours(report), false);
  const page = renderThreadPage(report, [report], [aRun(ALPHA)]);
  assert.match(page, /<dl class="detail">.*URL.*Steps/s, 'the walkthrough detail block');
});

test('the tab lists tickets oldest first with the head marked next, and reports newest first', () => {
  const items = [
    anItem('t1', KIND_TICKET, 'Older ticket'),
    anItem('r1', KIND_REPORT, 'Run 1 report', { postedAt: '2026-09-20T00:00:00.000Z', resolvedAt: '2026-09-25T00:00:00.000Z' }),
    anItem('t2', KIND_TICKET, 'Newer ticket'),
    anItem('t0', KIND_TICKET, 'Taken ticket', { resolvedAt: '2026-09-25T00:00:00.000Z' }),
    anItem('r2', KIND_REPORT, 'Run 2 report', { postedAt: '2026-09-26T00:00:00.000Z' }),
    anItem('t9', KIND_TICKET, 'Another deck', { repo: BETA }),
  ];
  const page = renderHomePage(items, [aRun(ALPHA)], ALPHA);

  const tickets = section(page, 'tickets');
  assert.ok(tickets.indexOf('Older ticket') < tickets.indexOf('Newer ticket'), 'oldest first');
  // Tied to the head's own markup, not merely to "next" appearing somewhere after
  // it in the string: a mutant that marks the second ticket instead of the first
  // still leaves "Older ticket" ahead of "class=next" in the concatenated HTML.
  assert.match(tickets, /<span class="next">next<\/span><a [^>]*>Older ticket<\/a>/, 'the head, and only the head, is marked next, above its title');
  assert.doesNotMatch(tickets, /<span class="next">next<\/span><a [^>]*>Newer ticket</, 'not the second ticket');
  assert.equal((tickets.match(/class="next"/g) ?? []).length, 1, 'only the head is next');
  assert.doesNotMatch(tickets, /Taken ticket|Another deck/);
  assert.doesNotMatch(tickets, /Run 2 report|Run 1 report/, 'a report never lands in the tickets list');
  assert.match(tickets, /<details class="body">/, 'a ticket body is collapsed');
  assert.match(tickets, /<summary data-count="2">Tickets<\/summary>/, "the tab's own name and a count of its open tickets (QA F1)");

  const reports = section(page, 'reports');
  assert.ok(reports.indexOf('Run 2 report') < reports.indexOf('Run 1 report'), 'newest first');
  assert.match(reports, /href="\/thread\/r2"[^>]*>Run 2 report<\/a><span class="open">/);
  assert.doesNotMatch(reports, /Run 1 report<\/a><span class="open">/, 'a closed report is not marked open');
  assert.doesNotMatch(reports, /Older ticket|Newer ticket/, 'a ticket never lands in the reports list');
  // Two reports are listed but only one is still open (r1 carries resolvedAt):
  // the badge is the open count, the same rule Tickets uses, not the total.
  assert.match(reports, /<summary data-count="1">Closing reports<\/summary>/, "the tab's own name and a count of its open reports");

  // The left strip, never the right, and neither is waiting in the queue.
  const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
  assert.doesNotMatch(main, /Older ticket|Run 2 report/);
  assert.ok(page.indexOf('id="tickets"') < page.indexOf('<aside class="strip right">'));
});

test('an empty Tickets tab carries no count', () => {
  const items = [anItem('r1', KIND_REPORT, 'A report')];
  const page = renderHomePage(items, [aRun(ALPHA)], ALPHA);

  const tickets = section(page, 'tickets');
  assert.match(tickets, /<summary>Tickets<\/summary>/, 'no data-count attribute at zero');
  assert.doesNotMatch(tickets, /data-count/);
  assert.match(tickets, /no tickets/);
});

test('the overview names Tickets and Closing reports by word, the way Chat always is, with nothing in either panel', () => {
  const items = [anItem('t1', KIND_TICKET, 'A ticket')];
  const page = renderHomePage(items, [aRun(ALPHA)], '');

  const tickets = section(page, 'tickets');
  assert.match(tickets, /<summary>Tickets<\/summary>/, 'the bookmark is still named on a page with no repository selected');
  assert.doesNotMatch(tickets, /<li>/, 'and lists nothing, since a ticket belongs to a repository tab');

  const reports = section(page, 'reports');
  assert.match(reports, /<summary>Closing reports<\/summary>/);
});

test('the reports section carries no form, and the tickets section carries only Add (ticket-making spec 1, A6)', () => {
  const items = [anItem('t1', KIND_TICKET, 'A ticket'), anItem('r1', KIND_REPORT, 'A report')];
  const page = renderHomePage(items, [aRun(ALPHA)], ALPHA);

  const reports = section(page, 'reports');
  assert.notEqual(reports, '', 'reports is drawn');
  assert.doesNotMatch(reports, /<form/, 'reports has no form');
  // Its one button is each row's ×, this browser's alone, which posts nothing (deck-polish A4).
  assert.deepEqual(reports.match(/<button[^>]*>/g), ['<button type="button" class="drop" title="Take this off the panel">']);

  // Counted rather than allow-listed by regex, so a move form on a queue of one
  // ticket — or any other control this section gains later — still fails this:
  // Add is the only form and button the tickets section may carry.
  const tickets = section(page, 'tickets');
  assert.notEqual(tickets, '', 'tickets is drawn');
  assert.equal((tickets.match(/<form/g) ?? []).length, 1, 'Add');
  assert.equal((tickets.match(/<button/g) ?? []).length, 1, 'its one button');
  assert.match(tickets, /<form method="post" action="\/create" class="make-tickets" data-in-place="move">/, "it is Add's own form");
});

test('tickets survive a daemon restart', (t) => {
  tempDeck(t);
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: ALPHA });
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Run 3', body: shapedTicketBody(), repo: ALPHA });

  // What a restarted daemon reads is the file, and nothing it held in memory.
  const onDisk = JSON.parse(fs.readFileSync(storeFile(), 'utf8')).items;
  const titles = (items) => items.filter(isStanding).map((item) => item.title);
  assert.deepEqual(titles(onDisk), ['Run 2', 'Run 3']);
  assert.deepEqual(titles(listItems()), ['Run 2', 'Run 3']);
});

test('an ended run keeps its tab while a ticket is open, and not for a report alone', () => {
  const ended = { ...aRun(ALPHA), pid: 999999 }; // not a live pid
  assert.equal(tabsOf([ended], [anItem('t1', KIND_TICKET, 'Run 2')]).length, 1, 'a ticket keeps it');
  assert.deepEqual(tabsOf([ended], [anItem('t1', KIND_TICKET, 'Run 2')])[0].open, [], 'and is not waiting on it');
  assert.equal(tabsOf([ended], [anItem('r1', KIND_REPORT, 'Report')]).length, 0, 'a report alone does not');
});

test('removing a deck archives its open tickets and reports, so none chains later', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: 999999 });
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: ALPHA });
  postItem({ kind: KIND_REPORT, title: 'Report', body: 'x', repo: ALPHA });

  removeDeck(ALPHA);

  assert.deepEqual(listItems().filter((item) => isStanding(item) && !item.resolvedAt), []);
});
