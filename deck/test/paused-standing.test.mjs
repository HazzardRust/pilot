/**
 * S2 of blocked-yellow-yields: a paused ticket (open, green, `paused.question`) is not concluding
 * and the rail says so (spec 1, 4; A6). Pins `isPaused` and the three readers that skip it, the
 * standing span, and the deck's yield line on `threadState`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBehind, isPaused, nextTicketOf, standingOf, threadState } from '../items.mjs';
import { renderMessages, renderTicketStanding } from '../ui/render-parts.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { deckLanes, listItems } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';
const ticket = (id, state, extra = {}) => ({ id, kind: 'ticket', title: id, body: 'b', repo: REPO, state, replies: [], ...extra });
const paused = (id) => ticket(id, 'green', { paused: { question: 'itm_q1', at: '2026-10-17T10:00:00.000Z' } });
const lanes = { coPilots: {} };

test('paused is green with a question', () => {
  assert.equal(isPaused(paused('itm_a')), true);
  assert.equal(isPaused(ticket('itm_b', 'green')), false);
  assert.equal(isPaused(ticket('itm_c', 'yellow', { paused: { question: 'itm_q1', at: 'x' } })), false);
  assert.equal(isPaused({ ...paused('itm_a'), resolvedAt: '2026-10-17T11:00:00.000Z' }), false);
});

test('the concluding lane skips a paused ticket', () => {
  const items = [paused('itm_a'), ticket('itm_b', 'green')];
  assert.equal(nextTicketOf(items, REPO, 'green')?.id, 'itm_b');
  assert.equal(nextTicketOf([paused('itm_a')], REPO, 'green'), undefined);
});

test("a paused ticket's question is never behind", () => {
  const items = [paused('itm_a'), ticket('itm_b', 'green'), { id: 'itm_q1', kind: 'question', ticket: 'itm_a', repo: REPO, replies: [] }];
  assert.equal(isBehind(items[2], items), false);
});

test('the rail says paused on its question', () => {
  const p = paused('itm_a');
  const q = { id: 'itm_q1', kind: 'question', ticket: 'itm_a', repo: REPO, replies: [] };
  const items = [p, q];
  assert.equal(standingOf(p, items, null), 'paused');
  const html = renderTicketStanding(q, items, lanes);
  assert.match(html, /paused on itm_q1/);
});

test('the yield line is not a short landing', () => {
  const line = { from: 'deck', author: 'deck', text: 'Paused', repliedAt: '2026-10-17T10:00:00.000Z', seq: 1 };
  const base = { id: 'itm_q1', ticket: 'itm_a', repo: REPO, replies: [line], postedAt: '2026-10-17T09:00:00.000Z' };
  assert.equal(threadState({ ...base, kind: 'question' }), 'paused');
  assert.equal(threadState({ ...base, id: 'itm_g', kind: 'gate2' }), 'landing ended short');
});

// QA Q2: the standing names what the ticket still waits on, not a question the user has answered.
test('the standing names the first unanswered blocker, else the pausing question', () => {
  const p = paused('itm_a');
  const answered = { id: 'itm_q1', kind: 'question', ticket: 'itm_a', repo: REPO, blocking: true, replies: [{ from: 'user', text: 'A', repliedAt: 'x' }] };
  const other = { id: 'itm_q2', kind: 'question', ticket: 'itm_a', repo: REPO, blocking: true, replies: [] };
  assert.match(renderTicketStanding(other, [p, answered, other], lanes), /paused on itm_q2</);
  assert.match(renderTicketStanding(answered, [p, answered], lanes), /paused on itm_q1</, 'none unanswered: the question it paused on');
  const hostile = ticket('itm_h', 'green', { paused: { question: '<b>x', at: 'x' } });
  const asked = { id: 'itm_q3', kind: 'question', ticket: 'itm_h', repo: REPO, replies: [] };
  assert.match(renderTicketStanding(asked, [hostile, asked], lanes), /paused on &lt;b&gt;x/, 'escaped (C1)');
});

// QA Q3: the TICKETS panel's green queue says paused, not needs you.
test('the rail labels a paused ticket paused', (t) => {
  tempDeck(t);
  const repo = 'D:/work/rail';
  postStored({ kind: 'ticket', title: 'Paused', body: shapedTicketBody('Paused'), repo, sliceCount: 3, state: 'green', paused: { question: 'itm_q1', at: 'x' } });
  const html = renderHomePage(listItems(), [], repo, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, deckLanes());
  assert.match(html, /<span class="ticket-state" data-state="green">paused<\/span>/);
  assert.doesNotMatch(html, /needs you/);
});

// QA: a paused row offers no Continue, which the server refuses; a plain green row beside it keeps its own.
test('the rail offers no Continue on a paused ticket', (t) => {
  tempDeck(t);
  const repo = 'D:/work/rail';
  postStored({ kind: 'ticket', title: 'Paused', body: shapedTicketBody('Paused'), repo, sliceCount: 3, state: 'green', paused: { question: 'itm_q1', at: 'x' } });
  postStored({ kind: 'ticket', title: 'In hand', body: shapedTicketBody('In hand'), repo, sliceCount: 3, state: 'green' });
  const plain = postStored({ kind: 'ticket', title: 'Plain', body: shapedTicketBody('Plain'), repo, sliceCount: 3, state: 'green' });
  const html = renderHomePage(listItems(), [], repo, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, deckLanes());
  const tos = [...html.matchAll(/action="\/switch"[^>]*>.*?name="to" value="(itm_\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(tos, [plain.id], 'only the green row not in hand and not paused');
});

// QA: the rail's yellow `next` is the lane's next, the first runnable ticket, never a blocked head (spec 2).
test("the rail's yellow next skips a blocked head", (t) => {
  tempDeck(t);
  const repo = 'D:/work/rail';
  const head = postStored({ kind: 'ticket', title: 'Blocked head', body: shapedTicketBody('Blocked head'), repo, sliceCount: 3, state: 'yellow' });
  const runnable = postStored({ kind: 'ticket', title: 'Runnable', body: shapedTicketBody('Runnable'), repo, sliceCount: 3, state: 'yellow' });
  postStored({ kind: 'question', title: 'Which?', body: 'A or B', repo, ticket: head.id, blocking: true });
  const html = renderHomePage(listItems(), [], repo, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, deckLanes());
  const marked = [...html.matchAll(/<span class="next" data-lane="co-pilot">next<\/span>.*?\/thread\/(itm_\w+)/g)].map((match) => match[1]);
  assert.deepEqual(marked, [runnable.id]);
});

// QA Q4: the yield's line is the deck's, bylined so.
test("the deck's own line is bylined deck", () => {
  const line = { from: 'deck', author: 'deck', text: 'Paused', repliedAt: '2026-10-17T10:00:00.000Z', seq: 1 };
  const html = renderMessages({ id: 'itm_q1', kind: 'question', replies: [line] });
  assert.match(html, /<span class="who by-deck">deck /);
});
