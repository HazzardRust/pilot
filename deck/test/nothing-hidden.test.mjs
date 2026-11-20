/**
 * S1 of nothing-hidden (spec 1-4; L1, A6): in-hand, unticketed and every owed press (gate1, gate2, signoff) are cards
 * (`shownOf`); the rest behind another ticket sits in one counted fold (`foldedOf`); the strip and the arrows count both.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_CHAT, KIND_GATE1, KIND_GATE2, KIND_QUESTION, KIND_SIGNOFF, KIND_USER, POSTABLE_KINDS, SIGN_OFF, isStanding, threadState } from '../items.mjs';
import { addReply, listItems, postItem, registerRun } from '../store.mjs';
import { noteDeck } from '../store-items.mjs';
import { foldedOf, queueOf, shownOf } from '../status.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { aTicket, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const OWED = [KIND_GATE1, KIND_GATE2, KIND_SIGNOFF];

const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
const overview = () => renderHomePage(listItems(), runs(), null, false, {}, {}, Date.now());
const tabPage = () => renderHomePage(listItems(), runs(), REPO, false, {}, {}, Date.now());
const threadPage = (item) => renderThreadPage(item, listItems(), runs(), {}, {}, false, []);

const ticketWith = (title, fields) => postStored({ kind: 'ticket', title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'green', ...fields });
const thread = (kind, ticket, title = `${kind} on ${ticket?.title ?? 'nothing'}`) =>
  postStored({ kind, title, body: 'Waiting.', repo: REPO, ...(ticket && { ticket: ticket.id }) });

/** The page's queue split at the fold: the ids drawn as cards above it, the ids inside it, and its line's N. */
function homeOf(html) {
  const main = html.match(/<main data-live="queue">(.*?)<\/main>/s)[1];
  const at = main.indexOf('<details class="fold">');
  const ids = (part) => [...part.matchAll(/<h2><a href="\/thread\/(itm_[0-9a-f]+)">/g)].map((match) => match[1]);
  const line = main.match(/<details class="fold"><summary>(\d+) waiting on other tickets<\/summary>/)?.[1] ?? null;
  return { cards: ids(at === -1 ? main : main.slice(0, at)), folded: at === -1 ? [] : ids(main.slice(at)), line };
}
const counts = (html) => [...html.match(/<nav class="runs-strip".*?<\/nav>/s)[0].matchAll(/<span class="count">(\d+)<\/span>/g)].map((match) => Number(match[1]));
const positionOf = (html) => html.match(/<span class="position" data-live="position">(\d+)\/(\d+)<\/span>/)?.slice(1).map(Number) ?? null;

/** Green A in hand, green B parked behind it holding a gate2, a signoff and a question (spec 1). */
function parkedWithPresses() {
  const [a, b] = [aTicket('In hand', 'green'), aTicket('Parked', 'green')];
  return { asked: thread(KIND_QUESTION, a), gate: thread(KIND_GATE2, b), signoff: thread(KIND_SIGNOFF, b), question: thread(KIND_QUESTION, b) };
}

test('a parked ticket\'s gate2 is a card, its question folded', (t) => {
  tempDeck(t);
  const { asked, gate, signoff, question } = parkedWithPresses();
  const items = listItems();
  const queue = queueOf(items);
  assert.deepEqual(foldedOf(queue, items).map((item) => item.id), [question.id], 'only the parked ticket\'s question folds');
  const cards = shownOf(queue, items).map((item) => item.id);
  assert.ok(cards.includes(gate.id) && cards.includes(signoff.id), 'its owed presses are cards');
  assert.ok(cards.indexOf(asked.id) < cards.indexOf(gate.id) && cards.indexOf(asked.id) < cards.indexOf(signoff.id), 'after the ticket in hand\'s');
  for (const html of [overview(), tabPage()]) {
    const home = homeOf(html);
    assert.equal(home.line, '1', 'the fold line counts one');
    assert.deepEqual(home.folded, [question.id], 'the question sits inside the fold');
    assert.ok([asked.id, gate.id, signoff.id].every((id) => home.cards.includes(id)), 'the presses are cards above it');
  }
});

test('nothing behind draws no fold', (t) => {
  tempDeck(t);
  thread(KIND_QUESTION, aTicket('Only', 'green'));
  assert.equal(homeOf(overview()).line, null);
  assert.doesNotMatch(overview(), /class="fold"/);
});

test('counts and arrows count cards and fold', (t) => {
  tempDeck(t);
  const { question, asked } = parkedWithPresses();
  thread(KIND_QUESTION, undefined, 'Unticketed');
  const total = queueOf(listItems()).length;
  assert.equal(total, 5);
  assert.deepEqual(counts(overview()), [total, total], 'the Overview and the tab each count the whole queue');
  const home = homeOf(overview());
  assert.equal(home.cards.length + home.folded.length, total, 'the page draws every one of them');
  assert.deepEqual(positionOf(threadPage(asked))?.[1], total, 'a card\'s X/N counts cards and fold');
  assert.deepEqual(positionOf(threadPage(question)), [total, total], 'the folded question is the walk\'s last');
});

test('a landing ticket\'s gate2 stays a card after landing ended short', (t) => {
  tempDeck(t);
  const landing = takeLive(aTicket('Landing one', 'green').id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: landing.id });
  addReply(gate.id, SIGN_OFF);
  noteDeck(gate.id, 'landing ended short: the merge was refused');
  thread(KIND_QUESTION, takeLive(aTicket('Holder', 'green').id));
  const items = listItems();
  assert.equal(threadState(items.find((item) => item.id === gate.id)), 'landing ended short');
  assert.ok(shownOf(queueOf(items), items).some((item) => item.id === gate.id), 'a card, not folded');
  for (const html of [overview(), tabPage()]) assert.ok(homeOf(html).cards.includes(gate.id), 'drawn above any fold');
});

/** Every kind the queue holds: the postable kinds and a user thread, less the standing kinds and a chat. */
const QUEUED_KINDS = [...POSTABLE_KINDS, KIND_USER].filter((kind) => kind !== KIND_CHAT && !isStanding({ kind }));

test('the sweep finds nothing missing and no press folded', (t) => {
  tempDeck(t);
  // Landing first, its signed gate2 posted before anything else names it: `isLanding` reads the newest gate2.
  const landing = takeLive(aTicket('Landing', 'green').id);
  const signed = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: landing.id });
  addReply(signed.id, SIGN_OFF);
  const inHand = takeLive(aTicket('In hand', 'green').id);
  const standings = {
    'in hand': inHand,
    landing,
    parked: aTicket('Parked', 'green'),
    paused: ticketWith('Paused', { paused: { question: 'itm_000000000000' } }),
    'co-pilot': aTicket('Co-pilot', 'yellow'),
    unticketed: undefined,
    'merged-away ticket': ticketWith('Merged', { mergedInto: inHand.id, resolvedAt: new Date().toISOString() }),
  };
  const seeded = [signed];
  for (const [standing, ticket] of Object.entries(standings)) {
    for (const kind of QUEUED_KINDS) {
      if (standing === 'landing' && kind === KIND_GATE2) continue; // the signed gate2 is this cell
      seeded.push(thread(kind, ticket, `${kind} · ${standing}`));
    }
  }
  const items = listItems();
  const queue = queueOf(items);
  assert.deepEqual(seeded.filter((item) => !queue.some((each) => each.id === item.id)).map((item) => item.title), [], 'every seeded thread is queued');
  const cards = shownOf(queue, items);
  const folded = foldedOf(queue, items);
  assert.equal(cards.length + folded.length, queue.length, 'cards and fold are the whole queue');
  assert.deepEqual(cards.filter((item) => folded.includes(item)).map((item) => item.title), [], 'and disjoint');
  for (const [name, html] of [['overview', overview()], ['tab', tabPage()]]) {
    const home = homeOf(html);
    const missing = seeded.filter((item) => !home.cards.includes(item.id) && !home.folded.includes(item.id));
    const pressFolded = seeded.filter((item) => OWED.includes(item.kind) && home.folded.includes(item.id));
    assert.deepEqual(missing.map((item) => `${item.id} ${item.title}`), [], `${name}: no thread missing`);
    assert.deepEqual(pressFolded.map((item) => `${item.id} ${item.title}`), [], `${name}: no owed press folded`);
    assert.equal(Number(home.line), home.folded.length, `${name}: the fold line counts what it holds`);
    console.log(`${name}: ${seeded.length} seeded over ${Object.keys(standings).length} standings × ${QUEUED_KINDS.length} kinds; ${home.cards.length} cards, ${home.folded.length} folded, 0 missing, 0 presses folded`);
  }
});
