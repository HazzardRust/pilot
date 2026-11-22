/**
 * Slice S7 of crew-handoff-trace (spec 6, A3): a crew-handoff owed a successor for `CREW_WAIT_MS` wakes the pilot once.
 * `crewWaitOf` is the rule, `noteCrewWait` the one write, a `from: 'deck'` line with a `seq` on the item, and
 * `armCrewWaits` the timer that makes it with no pilot turn. Every test takes its own store; the clock is mocked,
 * except for the real wait on a free port.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { CREW_WAIT_MS, crewWaitOf } from '../crew-handoff.mjs';
import { KIND_CREW_HANDOFF, KIND_TICKET, messagesOf } from '../items.mjs';
import { armCrewWaits } from '../server-wait.mjs';
import { DeckRefusal, listItems, resolveItem } from '../store.mjs';
import { noteCrewWait } from '../store-tickets.mjs';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { waiterCount } = await import('../server.mjs');
const { wait } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/crew-wait');
const MIN = 60_000;
const START = Date.parse('2026-11-20T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const owedLines = (id) => messagesOf(stored(id)).filter((line) => line.from === 'deck' && line.text.startsWith('Successor owed '));
const owedText = (ticket, item) =>
  `Successor owed on ${ticket}: ${item} open 10 min with no co-pilot — deck_ticket co-pilot it and spawn its successor`;
const yellowTicket = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 7, state: 'yellow' });
const crewHandoff = (ticket, postedAt = new Date().toISOString()) =>
  postStored({ kind: KIND_CREW_HANDOFF, title: `Handoff: pilot-co-pilot on ${ticket} paused itself`, body: `Ticket: ${ticket}.`, repo: REPO, ticket, postedAt });

function mockedDeck(t) {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
}

test('a successor owed for 10 minutes wakes the wait', (t) => {
  mockedDeck(t);
  const ticket = yellowTicket('paused');
  const handoff = crewHandoff(ticket.id);

  armCrewWaits();
  t.mock.timers.tick(CREW_WAIT_MS - 1);
  assert.equal(owedLines(handoff.id).length, 0, 'not before its 10 minutes');
  t.mock.timers.tick(1);
  const [line] = owedLines(handoff.id);
  assert.equal(line?.text, owedText(ticket.id, handoff.id));
  assert.equal(line.author, 'deck');
  assert.ok(Number.isInteger(line.seq), 'a seq, so a parked pilot wait wakes on it');

  armCrewWaits();
  t.mock.timers.tick(60 * MIN);
  assert.equal(owedLines(handoff.id).length, 1, 'one line, however long it stays owed');
  assert.equal(stored(handoff.id).resolvedAt, undefined, 'the deck closes nothing');
  assert.equal(stored(ticket.id).state, 'yellow', 'nor grants or releases the ticket');
});

test('not before, and once', (t) => {
  mockedDeck(t);
  const ticket = yellowTicket('early');
  const handoff = crewHandoff(ticket.id);

  assert.deepEqual(crewWaitOf(listItems(), REPO, null, START + 9 * MIN), [], 'nothing due at 9 min');
  assert.throws(() => noteCrewWait(handoff.id), DeckRefusal, 'a note before it is due is refused');
  const [due] = crewWaitOf(listItems(), REPO, null, START + 10 * MIN);
  assert.deepEqual([due?.item.id, due?.ticket, due?.at], [handoff.id, ticket.id, START + 10 * MIN]);

  t.mock.timers.tick(10 * MIN);
  noteCrewWait(handoff.id);
  assert.throws(() => noteCrewWait(handoff.id), DeckRefusal, 'a second fire is refused');
  assert.deepEqual(crewWaitOf(listItems(), REPO, null, Infinity), [], 'a noted wait is no longer due');
  assert.equal(owedLines(handoff.id).length, 1);
});

test('a grant in time cancels it', (t) => {
  mockedDeck(t);
  const ticket = yellowTicket('granted');
  const handoff = crewHandoff(ticket.id);

  assert.deepEqual(crewWaitOf(listItems(), REPO, { ticket: ticket.id, live: true }, Infinity), [], 'a live co-pilot owes no successor');
  armCrewWaits();
  t.mock.timers.tick(5 * MIN);
  resolveItem(handoff.id, 'successor granted');
  armCrewWaits();
  t.mock.timers.tick(10 * MIN);
  assert.deepEqual(crewWaitOf(listItems(), REPO, null, Infinity), [], 'a closed crew-handoff is never due');
  assert.equal(owedLines(handoff.id).length, 0, 'no line after the grant closed it');
});

test('a parked pilot wait returns with the line', async (t) => {
  const base = await deckOnAPort(t);
  const port = process.env.PILOT_DECK_PORT;
  t.after(() => (port === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = port)));
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const ticket = yellowTicket('parked overnight');

  const said = [];
  const waiting = wait({ env: {}, repo: REPO, kind: 'pilot', timeoutMinutes: 0.2, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line) });
  for (let i = 0; i < 400 && waiterCount() < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(waiterCount(), 1, 'the wait is parked');
  // Stored overdue only now, and noted in the same synchronous turn: a crew-handoff due before the park is the deck's
  // own timer's to write on any announce, which on a slow runner landed before the wait parked.
  const handoff = crewHandoff(ticket.id, new Date(Date.now() - 11 * MIN).toISOString());
  noteCrewWait(handoff.id);

  assert.equal(await waiting, 0, 'the line ends the wait, well before its timeout');
  const printed = said.join('');
  assert.match(printed, new RegExp(`^${owedText(ticket.id, handoff.id)}$`, 'm'));
  assert.equal(printed.match(/^REPLY /gm)?.length, 1, 'one REPLY');
});
