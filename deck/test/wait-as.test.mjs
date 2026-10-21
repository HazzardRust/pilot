/**
 * crew-waits S1, spec 4, 6, 7; L3, L4, L6, L14, A5; ADR 0061.
 *
 * `pilot wait --as <kind>` is a client of the daemon's `deck_wait` with `untaken`: it exits
 * only on a reply its kind owns, and the reply it prints is taken, marked delivered to that
 * kind in the call that returns it, so no second wait of the kind prints it again.
 *
 * Every test runs the real daemon on its own store and an ephemeral port, never 4321.
 * Replies arrive through `/reply` as the browser sends them, which is what wakes a parked wait.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckOnAPort } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, forgetAgents, noteActive } = await import('../agents.mjs');
const { addReply, listItems, markDelivered, postItem } = await import('../store.mjs');
const { SIGN_OFF, messagesOf } = await import('../items.mjs');
const { waiterCount } = await import('../server.mjs');
const { main, parseArgs, wait } = await import('../wait.mjs');

const ALPHA = 'D:/work/alpha';
const QA = 'pilot:pilot-qa';

const stored = (id) => listItems().find((item) => item.id === id);
const walkthrough = () => postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: ALPHA, author: QA });
const question = () => postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA, author: '' });

async function deck(t) {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  forgetAgents();
  t.after(() => forgetAgents());
  return base;
}

/** A user reply, as the page's form sends one: this is the write that wakes a parked wait. */
async function reply(base, id, fields) {
  const answer = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: new URLSearchParams({ id, ...fields }),
  });
  assert.equal(answer.status, 303);
}

/** A wait as `kind`, started: its exit code, what it printed, and whether it has exited yet. */
function start(kind, more = {}) {
  const said = [];
  let exited = false;
  const code = wait({ env: {}, cwd: ALPHA, kind, timeoutMinutes: 0.03, pollMs: 500, say: (line) => said.push(line), ...more })
    .finally(() => (exited = true));
  return { code, printed: () => said.join(''), exited: () => exited };
}

/** Until `count` waits are parked in the daemon, so a reply posted next lands on a parked wait. */
async function parked(count) {
  for (let i = 0; i < 200 && waiterCount() < count; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(waiterCount() >= count, true, `${count} waits are parked`);
}

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

test('a wait as qa exits on a reply on QA\'s walkthrough and not on a pilot question', async (t) => {
  const base = await deck(t);
  const asked = question();
  const walk = walkthrough();
  const qa = start('qa');
  await parked(1);

  await reply(base, asked.id, { text: 'B, the pilot\'s' });
  await settle();
  assert.equal(qa.exited(), false, 'a pilot question\'s reply does not wake QA');

  await reply(base, walk.id, { text: 'step two fails' });
  assert.equal(await qa.code, 0);
  assert.match(qa.printed(), /step two fails/);
  assert.doesNotMatch(qa.printed(), /the pilot's/);
  assert.equal(messagesOf(stored(walk.id)).at(-1).deliveredTo, 'qa', 'the wait took what it printed (L3)');
  assert.equal(messagesOf(stored(asked.id)).at(-1).deliveredAt, undefined, 'and left the pilot\'s reply alone');
});

test('a wait as pilot exits on a pilot question and not on QA\'s walkthrough reply', async (t) => {
  const base = await deck(t);
  const asked = question();
  const walk = walkthrough();
  noteActive({ cwd: ALPHA, kind: 'qa' }); // QA at work, so its reply is not the fallback's to hand over
  const pilot = start('pilot');
  await parked(1);

  await reply(base, walk.id, { text: 'step two fails' });
  await settle();
  assert.equal(pilot.exited(), false, 'QA\'s walkthrough reply does not wake the pilot');

  await reply(base, asked.id, { text: 'B' });
  assert.equal(await pilot.code, 0);
  assert.match(pilot.printed(), new RegExp(`REPLY ${asked.id} "Which\\?"\\nB\\n`));
  assert.doesNotMatch(pilot.printed(), /step two fails/);
  assert.equal(messagesOf(stored(asked.id)).at(-1).deliveredTo, 'pilot');
});

test('two untaken waits as one kind: one prints the reply, and the other is still waiting', async (t) => {
  const base = await deck(t);
  const walk = walkthrough();
  const first = start('qa');
  const second = start('qa');
  await parked(2);

  await reply(base, walk.id, { text: 'step two fails' });
  await settle();

  const woken = [first, second].filter((w) => w.exited());
  assert.equal(woken.length, 1, 'exactly one wait took the reply');
  assert.match(woken[0].printed(), /step two fails/);
  const other = first.exited() ? second : first;
  assert.equal(await other.code, 0);
  assert.match(other.printed(), /NO REPLY after/, 'the other ran to its timeout');
  assert.doesNotMatch(other.printed(), /step two fails/);
});

test('a Sign off is taken once by a qa wait and once by a pilot wait', async (t) => {
  const base = await deck(t);
  const walk = walkthrough();
  const qa = start('qa');
  const pilot = start('pilot');
  await parked(2);

  await reply(base, walk.id, { choice: SIGN_OFF });
  assert.equal(await qa.code, 0);
  assert.equal(await pilot.code, 0);
  assert.match(qa.printed(), /Sign off/);
  assert.match(pilot.printed(), /Sign off/);
  assert.deepEqual(messagesOf(stored(walk.id)).at(-1).deliveredTo, ['qa', 'pilot']);

  const again = [start('qa', { timeoutMinutes: 0.005 }), start('pilot', { timeoutMinutes: 0.005 })];
  for (const later of again) {
    assert.equal(await later.code, 0);
    assert.doesNotMatch(later.printed(), /Sign off/, 'a Sign off is taken once per kind');
  }
});

test('a wait with --item ends on a reply on that item and not on another of its kind', async (t) => {
  const base = await deck(t);
  const mine = question();
  const other = question();
  const pilot = start('pilot', { item: mine.id });
  await parked(1);

  await reply(base, other.id, { text: 'the other one' });
  await settle();
  assert.equal(pilot.exited(), false, 'a reply on another pilot thread does not end it (L4)');

  await reply(base, mine.id, { text: 'this one' });
  assert.equal(await pilot.code, 0);
  assert.match(pilot.printed(), /this one/);
  assert.doesNotMatch(pilot.printed(), /the other one/);
  assert.equal(messagesOf(stored(other.id)).at(-1).deliveredAt, undefined, 'and left the other reply untaken');
});

test('deck_wait refuses an untaken that is not a boolean and an item that is not an id', async (t) => {
  const base = await deck(t);
  const refusal = async (more) => {
    const response = await fetch(`${base}/api/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'deck_wait', arguments: { repo: ALPHA, author: 'qa', timeout: 50, ...more } }),
    });
    assert.equal(response.status, 400);
    return (await response.json()).error;
  };
  assert.equal(await refusal({ untaken: 'yes' }), 'untaken must be true or false');
  assert.equal(await refusal({ item: '' }), 'item must be an item id');
  assert.equal(await refusal({ item: 7 }), 'item must be an item id');
});

test('--item with no id is refused', () => {
  assert.deepEqual(parseArgs(['--item']), { error: '--item wants an item id' });
  assert.deepEqual(parseArgs(['--item', ' ']), { error: '--item wants an item id' });
});

test('untaken reaches a reply older than a full page of other replies', async (t) => {
  await deck(t);
  const asked = question();
  const walk = walkthrough();
  for (let i = 0; i < 20; i += 1) addReply(asked.id, `pilot reply ${i}`);
  addReply(walk.id, 'the old one');
  for (let i = 20; i < 40; i += 1) addReply(asked.id, `pilot reply ${i}`);
  assert.equal(markDelivered(messagesOf(stored(asked.id)), 'pilot'), true);

  const qa = start('qa');
  assert.equal(await qa.code, 0);
  assert.match(qa.printed(), /the old one/, 'neither the page nor the start of the wait hides it');
  assert.doesNotMatch(qa.printed(), /pilot reply/);
});

test('a pilot wait still prints an owner-fallback reply with its note', async (t) => {
  await deck(t);
  const START = Date.parse('2026-10-04T10:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: START });
  noteActive({ cwd: ALPHA, kind: 'qa' }, START - 2 * LIVE_WINDOW_MS);
  const walk = walkthrough();
  addReply(walk.id, 'step two fails');
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['Date'], now: START + 31_000 });

  const pilot = start('pilot');
  assert.equal(await pilot.code, 0);
  assert.match(pilot.printed(), /step two fails\nThis was qa's thread/);
  assert.equal(messagesOf(stored(walk.id)).at(-1).deliveredTo, 'pilot');
});

test('--as with an unknown kind is refused by name, exit 1', async (t) => {
  assert.deepEqual(parseArgs(['--as', 'qa', '--item', 'itm_1']), { timeoutMinutes: 110, kind: 'qa', item: 'itm_1' });
  assert.deepEqual(parseArgs([]), { timeoutMinutes: 110, kind: 'pilot' });
  assert.match(parseArgs(['--as', 'explorer']).error, /"explorer".*pilot, qa, teacher, auditor or architect/);

  const stderr = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => { stderr.push(chunk); return true; };
  t.after(() => { process.stderr.write = original; });
  const code = await main(['--as', 'explorer']);
  process.stderr.write = original;

  assert.equal(code, 1);
  assert.match(stderr.join(''), /"explorer"/);
});

test('a crew wait without its thread is refused', () => {
  for (const kind of ['qa', 'architect', 'teacher', 'auditor']) {
    assert.match(parseArgs(['--as', kind]).error, /--item/, kind);
  }
});

test("the pilot's wait is unchanged", () => {
  assert.deepEqual(parseArgs([]), { timeoutMinutes: 110, kind: 'pilot' });
  assert.deepEqual(parseArgs(['--as', 'pilot']), { timeoutMinutes: 110, kind: 'pilot' });
  assert.deepEqual(parseArgs(['--as', 'qa', '--item', 'itm_x']), { timeoutMinutes: 110, kind: 'qa', item: 'itm_x' });
});
