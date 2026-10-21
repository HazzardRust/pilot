/**
 * S12 of ticket-state-accents (spec 19, L12, L17): nothing disruptive runs mid co-pilot switch. While the co-pilot lane's
 * switch is pending, `co-pilot`, `release`, `need` and `pivot` on its `from` or `to` are refused naming it, except
 * `release from` and `co-pilot to`, and every other yellow Continue is drawn `locked`. The lanes lock independently:
 * a co-pilot switch locks no main action and a main switch locks no co-pilot action. Nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_QUESTION, repoKey } from '../items.mjs';
import { aTicket, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

const { DeckRefusal, mergeTicket, moveTicket, needTicket, parkTicket, pivotTicket, postItem, registerRun, requestSwitch, setCoPilot, storeFile, takeTicket } =
  await import('../store.mjs');

const REPO = path.resolve('D:/work/pilot');

const asked = (ticket) => postItem({ kind: KIND_QUESTION, title: `About ${ticket.title}?`, body: 'Pick one.', repo: REPO, ticket: ticket.id });
const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
const lanes = () => stored().switches?.[repoKey(REPO)] ?? {};
const coPilotLockedBy = (to) => (err) =>
  err instanceof DeckRefusal && err.message === `a co-pilot switch to ${to} is pending in this directory; complete or cancel it first`;

/** A held yellow `from`, a yellow `to` asked for, another yellow ticket, and each named by an open question. */
function pendingCoPilotSwitch() {
  const from = aTicket('From', 'yellow');
  setCoPilot(from.id, true);
  const to = aTicket('To', 'yellow');
  const other = aTicket('Other yellow', 'yellow');
  for (const ticket of [from, to, other]) asked(ticket);
  requestSwitch(REPO, to.id);
  return { from, to, other };
}

test('co-pilot, release, need and pivot on from or to are refused naming the switch', (t) => {
  tempDeck(t);
  const { from, to, other } = pendingCoPilotSwitch();
  const before = JSON.stringify(stored());

  assert.throws(() => setCoPilot(from.id, true), coPilotLockedBy(to.id), 'co-pilot from');
  assert.throws(() => setCoPilot(to.id, false), coPilotLockedBy(to.id), 'release to');
  for (const ticket of [from, to]) {
    assert.throws(() => needTicket(ticket.id), coPilotLockedBy(to.id), `need ${ticket.title}`);
    assert.throws(() => pivotTicket(ticket.id), DeckRefusal, `pivot ${ticket.title}`);
  }
  assert.throws(() => requestSwitch(REPO, other.id), coPilotLockedBy(to.id), 'a second co-pilot switch');
  assert.equal(JSON.stringify(stored()), before, 'a refused action writes nothing');
});

test('co-pilot on a ticket outside the switch is refused naming it: switching keeps from held (spec 16)', (t) => {
  tempDeck(t);
  const { to, other } = pendingCoPilotSwitch();
  const before = JSON.stringify(stored());

  assert.throws(() => setCoPilot(other.id, true), coPilotLockedBy(to.id), 'co-pilot Y4 while Y1 -> Y3 is pending');
  assert.equal(JSON.stringify(stored()), before, 'a refused co-pilot writes nothing');
});

test('co-pilot to and release from are not refused', (t) => {
  tempDeck(t);
  const { from, to, other } = pendingCoPilotSwitch();

  moveTicket(other.id, 'up');
  assert.equal(needTicket(other.id).state, 'green', 'a ticket outside the switch is still moved and needed');
  setCoPilot(from.id, false);
  assert.equal(lanes().coPilot.to, to.id, 'release from leaves the switch pending');
  setCoPilot(to.id, true);
  assert.equal(stored().coPilots[repoKey(REPO)].ticket, to.id);
  assert.equal(lanes().coPilot, undefined, 'co-pilot to completes it');
});

test('a co-pilot switch locks no main action, and a main switch locks no co-pilot action', (t) => {
  tempDeck(t);
  registerRun({ repo: REPO, pid: process.pid });
  const { from: yellowFrom, to: yellowTo } = pendingCoPilotSwitch();
  const live = aTicket('Live', 'red');
  takeLive(live.id);
  const red = aTicket('Red', 'red');
  const green2 = aTicket('Red two', 'red');
  const green = aTicket('Green', 'green');

  moveTicket(green2.id, 'up');
  mergeTicket(green2.id);
  parkTicket(live.id);
  takeTicket(green.id);
  assert.equal(pivotTicket(green.id).ticket.state, 'yellow', 'pivot of a main ticket');
  const main = requestSwitch(REPO, red.id);
  assert.equal(main.to, red.id, 'a main switch beside the co-pilot one');
  assert.equal(lanes().coPilot.to, yellowTo.id);

  // Now the main lane is switching: the co-pilot lane's own actions still run.
  moveTicket(green.id, 'down');
  setCoPilot(yellowFrom.id, false);
  setCoPilot(yellowTo.id, true);
  assert.equal(needTicket(yellowFrom.id).state, 'green', 'need on a yellow ticket');
  const next = requestSwitch(REPO, green.id);
  assert.equal(next.to, green.id, 'a co-pilot switch beside the main one');
  assert.equal(lanes().planning.to, red.id, 'the main switch is still pending');
});

test('other yellow Continues are drawn locked; main Continues are not', (t) => {
  tempDeck(t);
  const { from, to, other } = pendingCoPilotSwitch();
  const red = aTicket('Red', 'red');
  const green2 = aTicket('Red two', 'red');
  const green3 = aTicket('Red three', 'red');

  const rows = rowsOf(page());
  assert.match(rows[other.id], /<button type="submit" data-switch="locked" title="Continue" aria-label="Continue" disabled>&#9654;&#xFE0E;<\/button>/, 'the other yellow Continue');
  assert.doesNotMatch(rows[other.id], /action="\/switch"/, 'it posts no switch');
  assert.doesNotMatch(rows[other.id], /name="direction"[^>]* disabled/, 'a yellow arrow is no part of the co-pilot lock');
  assert.match(rows[to.id], /data-switch="pending"/);
  assert.doesNotMatch(rows[from.id], /data-switch=/, "the co-pilot's own row has no Continue");
  assert.match(rows[green2.id], /data-switch="idle"/, 'a main Continue stays live');
  assert.doesNotMatch(rows[green2.id], /name="direction"[^>]* disabled/, 'a main arrow stays live');

  // And the other way round (L17): a main switch draws no yellow arrow disabled.
  setCoPilot(to.id, true);
  requestSwitch(REPO, green2.id);
  const mainSwitching = rowsOf(page());
  assert.match(mainSwitching[green3.id], /data-switch="locked"/, 'the main lane locks its own rows');
  assert.match(mainSwitching[other.id], /data-switch="idle"/, 'a yellow Continue stays live');
  assert.match(mainSwitching[other.id], /name="direction"/);
  assert.doesNotMatch(mainSwitching[other.id], /name="direction"[^>]* disabled/, 'a yellow arrow stays live');
});
