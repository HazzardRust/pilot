/**
 * S13 of ticket-states: the next ticket (spec 16, 18; L19, B2, B4; yellow-agent S10). One head
 * function, `nextTicketOf(items, repo, state)`, which the chain takes live and the tab marks `next`:
 * each stage takes its own ticket with a question first, then its head, and never a yellow one
 * (three-lanes spec 2).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_HANDOFF, KIND_QUESTION, KIND_TICKET, nextTicketOf } from '../items.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';

const { MAX_TEXT_BYTES, listItems, postItem, registerRun, resolveItem, setSlices } = await import('../store.mjs');
const { chainNext } = await import('../chain.mjs');
const { renderHomePage } = await import('../ui/render.mjs');

const ALPHA = path.resolve('D:/work/alpha');

const aTicket = (title, state, extra = {}) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: ALPHA, sliceCount: 60, state, ...extra });
const askOn = (ticket, blocking = false) =>
  postItem({ kind: KIND_QUESTION, title: `About ${ticket.title}`, body: 'which?', repo: ALPHA, options: ['A', 'B'], recommended: 'A', ticket: ticket.id, blocking });

// overview-one-ticket spec 23, L20: the main deck is for green and red; a yellow ticket is parked there.
test('a stage never holds a yellow ticket, asked or not', (t) => {
  tempDeck(t);
  askOn(aTicket('Yellow blocked', 'yellow'), true);
  askOn(aTicket('Yellow asked', 'yellow'));
  const red = aTicket('Red', 'red');
  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, red.id, 'the red head, never the asked yellow');
});

test('a red ticket a question names comes before the plain red head; a closed question names nothing', (t) => {
  tempDeck(t);
  const plain = aTicket('Plain', 'red');
  const asked = aTicket('Asked', 'red');
  const question = askOn(asked);
  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, asked.id);
  resolveItem(question.id, 'answered');
  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, plain.id);
});

test('a question on the live ticket does not make it next (spec 13, F5)', (t) => {
  tempDeck(t);
  const live = aTicket('Live', 'red', { live: true });
  const red = aTicket('Red', 'red');
  askOn(live);

  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, red.id);
});

test("each stage's queue on the main tab marks its own nextTicketOf (three-lanes spec 6)", (t) => {
  tempDeck(t);
  const runs = [{ ...registerRun({ repo: ALPHA, pid: process.pid }), feature: 'x' }];
  const red = aTicket('Red', 'red');
  aTicket('Green', 'green');
  aTicket('Yellow', 'yellow');
  const markedNext = (dir) =>
    [...renderHomePage(listItems(), runs, dir, false, {}, {}, Date.now())
      .matchAll(/<li data-state="[a-z]+"(?: class="in-hand")?>(.*?)<\/li>/gs)]
      .map(([, row]) => row)
      .filter((row) => row.includes('<span class="next">next</span>'));

  const marked = markedNext(ALPHA);
  assert.equal(marked.length, 2, 'one ticket per stage is marked next');
  assert.ok(marked[0].includes(nextTicketOf(listItems(), ALPHA, 'red').id) && marked[0].includes(red.id), "the red row is the red stage's nextTicketOf");
  assert.ok(marked[1].includes(nextTicketOf(listItems(), ALPHA, 'green').id), "the green row is the green stage's nextTicketOf");
});

const PLAN = { artefact: 'docs/design/one/architecture.md', branch: 'feat/one', sha: 'abc1234', slug: 'one', sliceCount: 3, gate1: 'itm_000000000001' };
const handedOver = (ticket) => {
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });
  const { handoff } = chainNext(ALPHA);
  assert.equal(handoff.next, ticket.id);
  return handoff.body;
};

test('a green hand-off carries the spec without its plan (F7)', (t) => {
  tempDeck(t);
  const green = aTicket('Green', 'green', { plan: PLAN });
  assert.equal(handedOver(green), green.body);
});

