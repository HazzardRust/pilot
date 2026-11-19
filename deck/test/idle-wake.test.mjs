/**
 * yellow-never-idle S3, spec 7, 8; L7.
 *
 * The deck wakes a parked pilot once when the co-pilot's held yellow ticket goes idle: `noteIdle` is the one write, a
 * `from: 'deck'` line with a `seq` on the ticket stamped `idleNoted`, and `armIdle` the timer that makes it with no
 * pilot turn. A crew heartbeat moves the idle moment without writing the store. Every test takes its own store; the
 * clock is mocked, never waited on, except for the real wait on a free port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { forgetAgents, noteAgent } from '../agents.mjs';
import { KIND_TICKET, messagesOf } from '../items.mjs';
import { armIdle } from '../server-wait.mjs';
import { DeckRefusal, listItems, setCoPilot } from '../store.mjs';
import { noteIdle } from '../store-tickets.mjs';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { waiterCount } = await import('../server.mjs');
const { wait } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/idle');
const MIN = 60_000;
const START = Date.parse('2026-11-19T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const idleLines = (id) => messagesOf(stored(id)).filter((line) => line.from === 'deck' && line.text.startsWith('Idle '));
const heldTicket = (title) => {
  const ticket = postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'yellow' });
  setCoPilot(ticket.id, true);
  return ticket;
};
const heartbeat = (agentId = 'crew1') => noteAgent({ agentId, agentType: 'pilot:pilot-implementer', cwd: REPO });
const idleText = (id) => `Idle ${id}: no crew tool call for 20 min and nothing blocks it — need it, or release it and spawn its successor`;

/** A store of the test's own, the clock at START, and the daemon just started there (a restart is a heartbeat). */
function quietDeck(t) {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  forgetAgents();
  t.after(forgetAgents);
}

test('one line per idle episode', (t) => {
  quietDeck(t);
  const ticket = heldTicket('quiet');

  armIdle();
  t.mock.timers.tick(20 * MIN - 1);
  assert.equal(idleLines(ticket.id).length, 0, 'not before its 20 minutes');
  t.mock.timers.tick(1);
  const [line] = idleLines(ticket.id);
  assert.equal(line?.text, idleText(ticket.id));
  assert.equal(line.author, 'deck');
  assert.ok(Number.isInteger(line.seq), 'a seq, so a parked pilot wait wakes on it');
  assert.equal(stored(ticket.id).idleNoted, START, 'stamped with the crew moment it noted');

  t.mock.timers.tick(40 * MIN);
  assert.equal(idleLines(ticket.id).length, 1, 'still one at 60 min with no new heartbeat');

  heartbeat();
  t.mock.timers.tick(20 * MIN - 1);
  assert.equal(idleLines(ticket.id).length, 1, 'the heartbeat opened a new episode, not yet idle');
  t.mock.timers.tick(1);
  assert.equal(idleLines(ticket.id).length, 2, 'a heartbeat then 20 quiet min gives a second line');
  assert.equal(stored(ticket.id).state, 'yellow', 'nothing is released (A1)');
});

test('a heartbeat defers the fire', (t) => {
  quietDeck(t);
  const ticket = heldTicket('worked');

  armIdle();
  t.mock.timers.tick(10 * MIN);
  heartbeat();
  t.mock.timers.tick(10 * MIN);
  assert.equal(idleLines(ticket.id).length, 0, 'no line at 20 min after a heartbeat at 10');
  t.mock.timers.tick(10 * MIN - 1);
  assert.equal(idleLines(ticket.id).length, 0);
  t.mock.timers.tick(1);
  assert.equal(idleLines(ticket.id).length, 1, 'one line at 30 min');
});

test('a crew calling tools is never idle, and is 20 min after its last call', (t) => {
  quietDeck(t);
  const ticket = heldTicket('busy');

  armIdle();
  // A crew calling a tool every minute stays live: the roster announces only its arrival and, later, its departure.
  for (let minute = 0; minute < 25; minute += 1) {
    heartbeat();
    t.mock.timers.tick(MIN);
  }
  assert.equal(idleLines(ticket.id).length, 0, 'a working crew is never idle');
  t.mock.timers.tick(19 * MIN - 1);
  assert.equal(idleLines(ticket.id).length, 0, 'not before 20 min past its last tool call');
  t.mock.timers.tick(1);
  assert.equal(idleLines(ticket.id).length, 1);
});

test('a note not due, or already made, is refused', (t) => {
  quietDeck(t);
  const ticket = heldTicket('early');
  assert.throws(() => noteIdle(ticket.id, Date.now()), DeckRefusal, 'not 20 minutes yet');
  const seenAt = Date.now() - 21 * MIN;
  noteIdle(ticket.id, seenAt);
  assert.throws(() => noteIdle(ticket.id, seenAt), DeckRefusal, 'one line per episode');
  const free = postStored({ kind: KIND_TICKET, title: 'unheld', body: shapedTicketBody('unheld'), repo: REPO, sliceCount: 3, state: 'yellow' });
  assert.throws(() => noteIdle(free.id, seenAt), DeckRefusal, 'only the co-pilot holds an idle ticket');
  assert.equal(idleLines(ticket.id).length, 1);
  assert.equal(messagesOf(stored(free.id)).length, 0);
});

test('a parked wait wakes', async (t) => {
  const base = await deckOnAPort(t);
  const port = process.env.PILOT_DECK_PORT;
  t.after(() => (port === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = port)));
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const ticket = heldTicket('parked overnight');

  const said = [];
  const waiting = wait({ env: {}, repo: REPO, kind: 'pilot', timeoutMinutes: 0.2, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line) });
  for (let i = 0; i < 400 && waiterCount() < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(waiterCount(), 1, 'the wait is parked');
  const noted = Date.now();
  noteIdle(ticket.id, Date.now() - 21 * MIN);

  assert.equal(await waiting, 0, 'the line ends the wait, well before its timeout');
  assert.ok(Date.now() - noted < 3000, 'within a poll, not on its 12 s timeout');
  const printed = said.join('');
  assert.match(printed, new RegExp(`^REPLY ${ticket.id} "parked overnight"\n${idleText(ticket.id)}$`, 'm'));
  assert.doesNotMatch(printed, /NO REPLY/);
});
