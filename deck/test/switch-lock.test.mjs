/**
 * S8 of ticket-state-accents (spec 14, L12): nothing disruptive runs mid-switch. While a main switch is pending,
 * agents' take of another ticket, park, merge, pivot and the arrows are refused naming the switch, and so are
 * Start, End and a second Continue; the completing take, replies, Sign off, Close and Add stay open. The page draws
 * every other Continue `locked` and the arrows disabled, and lifts both when the take lands. A yellow ticket's `need` is
 * the co-pilot lane's (S12, L17), so the main lock leaves it alone. Nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, SIGN_OFF, repoKey } from '../items.mjs';
import { aTicket, deckOnAPort, page, postStored, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

const {
  DeckRefusal,
  addDeck,
  addReply,
  createThread,
  listItems,
  mergeTicket,
  moveTicket,
  parkTicket,
  pivotTicket,
  postItem,
  registerRun,
  requestSwitch,
  resolveItem,
  storeFile,
  takeTicket,
} = await import('../store.mjs');

const REPO = path.resolve('D:/work/pilot');

const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
const lockedBy = (to) => (err) =>
  err instanceof DeckRefusal && err.message === `a switch to ${to} is pending in this directory; complete or cancel it first`;

/** A live red `from`, a green `to` asked for, and a ticket of every other kind the lock is pinned on. */
function aPendingSwitch() {
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'red');
  const red = aTicket('Other red', 'red');
  const green2 = aTicket('Second red', 'red');
  const green = aTicket('Other green', 'green');
  const yellow = aTicket('Yellow', 'yellow');
  postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'Pick one.', repo: REPO, ticket: yellow.id });
  requestSwitch(REPO, to.id);
  return { from, to, red, green2, green, yellow };
}

test('each locked store action is refused naming the switch', (t) => {
  tempDeck(t);
  registerRun({ repo: REPO, pid: process.pid });
  const { from, to, red, green2, green } = aPendingSwitch();
  const before = JSON.stringify(stored().items);

  assert.throws(() => takeTicket(red.id), lockedBy(to.id), 'take of another ticket');
  assert.throws(() => parkTicket(from.id), lockedBy(to.id), 'park');
  assert.throws(() => mergeTicket(red.id), lockedBy(to.id), 'merge');
  assert.throws(() => moveTicket(green2.id, 'up'), lockedBy(to.id), 'move');
  assert.throws(() => requestSwitch(REPO, red.id), lockedBy(to.id), 'a second switch');
  assert.equal(JSON.stringify(stored().items), before, 'a refused action writes nothing');
  // A planning switch locks its own lane only (three-lanes S2, spec 5, L4): a concluding pivot runs.
  assert.equal(pivotTicket(green.id).ticket.state, 'yellow', 'pivot of a concluding ticket');
});

test('the completing take is not refused', (t) => {
  tempDeck(t);
  const { from, to } = aPendingSwitch();
  takeTicket(to.id);
  const items = stored().items;
  assert.equal(items.find((item) => item.id === to.id).live, true);
  assert.equal(items.find((item) => item.id === from.id).live, undefined);
  assert.equal(stored().switches[repoKey(REPO)].planning, undefined);
});

test('Start and End are refused while switching', async (t) => {
  const started = [];
  const base = await deckOnAPort(t, { start: (repo) => started.push(repo) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = addDeck(dir).repo;
  aTicket('Head', 'red', repo); // the planning lane's own next, so `to` is not in hand (three-lanes spec 4)
  const to = aTicket('To', 'red', repo);
  requestSwitch(repo, to.id);
  const press = (route) =>
    fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ repo, to: to.id, back: '/' }),
      redirect: 'manual',
    });
  const reason = `a switch to ${to.id} is pending in this directory; complete or cancel it first`;

  for (const route of ['/start-session', '/end-session']) {
    const response = await press(route);
    assert.equal(response.status, 303, route);
    assert.equal(new URL(response.headers.get('location'), base).searchParams.get('sessionRefused'), reason, route);
  }
  assert.deepEqual(started, [], 'no window was opened');
  assert.equal((await press('/switch')).status, 400, 'a second switch is the usual refusal');
});

test('replies, Sign off, Close and Add are not refused', (t) => {
  tempDeck(t);
  registerRun({ repo: REPO, pid: process.pid });
  const { to, green } = aPendingSwitch();
  // Stored straight in: posting a gate2 asks for its ticket live, which the lock itself would refuse to arrange.
  const gate2 = postStored({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#1', sha: '0305827', ticket: green.id });
  const question = listItems().find((item) => item.kind === KIND_QUESTION);

  addReply(question.id, 'the first');
  addReply(gate2.id, SIGN_OFF);
  resolveItem(question.id, 'answered');
  createThread({ name: 'Add', repo: REPO });
  assert.equal(stored().switches[repoKey(REPO)].planning.to, to.id, 'the switch is still pending');
});

test('other Continues and the arrows are drawn disabled', (t) => {
  tempDeck(t);
  const { to, red, green2 } = aPendingSwitch();
  const locked = rowsOf(page());
  for (const id of [red.id, green2.id]) {
    assert.match(locked[id], /<button type="submit" data-switch="locked" title="Continue" aria-label="Continue" disabled>&#9654;&#xFE0E;<\/button>/, `${id}'s Continue is locked`);
    assert.doesNotMatch(locked[id], /action="\/switch"/, `${id} posts no switch`);
  }
  assert.match(locked[to.id], /data-switch="pending"/);
  const arrows = [...page().matchAll(/<button type="submit" name="direction"[^>]*>/g)].map(([button]) => button);
  assert.ok(arrows.length > 0);
  for (const arrow of arrows) assert.match(arrow, / disabled>$/, arrow);

  takeTicket(to.id);
  // The rows only: the page inlines `deck.css`, whose own selectors name the locked button.
  const rows = Object.values(rowsOf(page())).join('');
  assert.doesNotMatch(rows, /data-switch="locked"/, 'the lock lifts with the take');
  assert.doesNotMatch(rows, /name="direction"[^>]* disabled/);
  assert.match(rowsOf(page())[red.id], /data-switch="idle"/);
});

test('a clean finish mid-switch chains nothing, so no hand-off is left behind a refused take', async (t) => {
  tempDeck(t);
  const { FINISHED_CLEAN } = await import('../runs.mjs');
  const { setSlices } = await import('../store.mjs');
  const { chainNext } = await import('../chain.mjs');
  const run = registerRun({ repo: REPO, pid: process.pid });
  aTicket('Head', 'red');
  const to = aTicket('To', 'red');
  requestSwitch(REPO, to.id);
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });

  assert.deepEqual(chainNext(REPO), { handoff: null, reason: 'switch pending' });
  assert.equal(listItems().filter((item) => item.kind === 'handoff').length, 0, 'nothing is posted');
});
