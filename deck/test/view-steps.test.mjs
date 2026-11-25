/**
 * steps-in-previews S2: the view hands the Rune deck what the HTML deck draws for a steps thread, its card's
 * ticket line (spec 2, A2) and its thread's numbered steps with Done while open (spec 3, L5). Every test takes its
 * own store directory; never port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_TICKET } from '../items.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { closeItem, postItem, postSteps } = await import('../store.mjs');
const { cardOf } = await import('../view/queue.mjs');
const { threadView } = await import('../view/thread.mjs');
const { readDeck } = await import('../view/reads.mjs');

const REPO = path.join('D:', 'work', 'pilot');
const STEPS = ['Merge the main PR #140 on GitHub.', 'Restart the deck.', 'Run pilot doctor.'].map((text) => ({ text }));

const aTicket = (title, state = 'green') => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, state });
const aCard = (reads, id) =>
  cardOf(reads.items.find((item) => item.id === id), { items: reads.items, lanes: reads.lanes, tab: null, back: '/', all: false });

test('a card names its ticket', (t) => {
  tempDeck(t);
  const ticket = aTicket('Mend the strip', 'red');
  const on = postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: REPO, author: '', ticket: ticket.id });
  const loose = postItem({ kind: 'question', title: 'Loose', body: 'A or B', repo: REPO, author: '' });
  const reads = readDeck();

  assert.match(aCard(reads, on.id).ticket ?? '', /^Mend the strip /, 'the ticket line opens with its title');
  assert.equal(aCard(reads, loose.id).ticket, undefined, 'a thread on no ticket has none');
});

test('the steps view carries its steps', (t) => {
  tempDeck(t);
  const steps = postSteps({ ticket: aTicket('Land it').id, repo: REPO, title: 'Human steps: land it', steps: STEPS });
  const question = postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: REPO, author: '' });

  const open = threadView(readDeck(), { id: steps.id });
  assert.deepEqual(open.steps, { texts: STEPS.map(({ text }) => text), open: true });
  assert.equal(threadView(readDeck(), { id: question.id }).steps, undefined, 'a question has no steps');

  closeItem(steps.id);
  assert.equal(threadView(readDeck(), { id: steps.id }).steps.open, false, 'closed, Done is gone');
});
