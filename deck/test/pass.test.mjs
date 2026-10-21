/**
 * Thread-ownership S4, spec 3 and 4; A3 to A6.
 *
 * A thread is passed with `deck_reply { id, text, to }`: one message and the new
 * owner, in one write. The owner may pass its thread and the pilot may take any
 * thread back; anybody else writing on a thread it does not own is refused, and
 * the refusal names the owner. The pilot's helpers (teacher, explorer) may reply
 * on a thread the pilot owns, and on no other.
 *
 * Every test takes its own store directory and its own ephemeral port. Nothing
 * here may touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addReply, createThread, currentSeq, listItems, postItem, registerRun } = await import('../store.mjs');
const { messagesOf, ownerOf, threadState } = await import('../items.mjs');
const { callTool } = await import('../server.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const ALPHA = 'D:/work/alpha';
const PILOT = '';
const QA = 'pilot:pilot-qa';
const TEACHER = 'pilot:pilot-teacher';
const EXPLORER = 'pilot:pilot-explorer';

const stored = (id) => listItems().find((item) => item.id === id);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);
const ownedBy = (owner) => ({ name: 'DeckRefusal', message: new RegExp(`owned by ${owner}; send your point to ${owner}`) });

const walkthrough = (repo = ALPHA) =>
  postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo, author: QA });
const question = (repo = ALPHA) => postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo, author: PILOT });

const reply = (id, author, extra = {}) => callTool('deck_reply', { id, text: 'a point', author, ...extra });

const callApi = (base, name, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const send = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id, text, choice: '' }),
    redirect: 'manual',
  });

const waitAs = async (base, author, since, timeout) =>
  JSON.parse((await (await callApi(base, 'deck_wait', { since, timeout, repo: ALPHA, author })).json()).content[0].text);

test('the owner passes a thread and the next reply wakes the new owner only', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const walk = walkthrough();

  const passed = await callApi(base, 'deck_reply', { id: walk.id, text: 'passing this to the pilot', to: 'pilot', author: QA });
  assert.equal(passed.status, 200, await passed.clone().text());
  assert.equal(ownerOf(stored(walk.id)), 'pilot');
  assert.equal(messagesOf(stored(walk.id)).at(-1).text, 'passing this to the pilot');

  const since = currentSeq();
  const pilot = waitAs(base, undefined, since, 30_000);
  const qa = waitAs(base, QA, since, 1_500);
  assert.equal((await send(base, walk.id, 'over to you')).status, 303);

  assert.deepEqual(saidIn(await pilot), ['over to you']);
  assert.deepEqual(saidIn(await qa), [], 'the old owner is not woken');
});

test('the pilot may take a qa thread with to pilot', (t) => {
  tempDeck(t);
  const walk = walkthrough();

  reply(walk.id, PILOT, { to: 'pilot' });

  assert.equal(ownerOf(stored(walk.id)), 'pilot');
  assert.throws(() => reply(walk.id, QA), ownedBy('pilot'), 'and QA no longer writes there');
});

test('qa may not pass a pilot-owned thread', (t) => {
  tempDeck(t);
  const asked = question();

  assert.throws(() => reply(asked.id, QA, { to: 'qa' }), ownedBy('pilot'));
  assert.equal(ownerOf(stored(asked.id)), 'pilot');
  assert.deepEqual(messagesOf(stored(asked.id)), []);
});

test("the pilot's reply on a qa thread is refused naming qa", (t) => {
  tempDeck(t);
  const walk = walkthrough();

  assert.throws(() => reply(walk.id, PILOT), ownedBy('qa'));
  assert.throws(() => reply(walk.id, undefined), ownedBy('qa'), 'an unstamped call is the pilot');
  assert.throws(() => reply(walk.id, PILOT, { to: 'qa' }), ownedBy('qa'), 'a pass to the owner is no way in');
  assert.deepEqual(messagesOf(stored(walk.id)), []);
});

test("the pilot's resolve on a qa thread is refused", (t) => {
  tempDeck(t);
  const walk = walkthrough();

  assert.throws(() => callTool('deck_resolve', { id: walk.id, resolution: 'done', author: PILOT }), ownedBy('qa'));
  assert.equal(stored(walk.id).resolvedAt, undefined);

  callTool('deck_resolve', { id: walk.id, resolution: 'done', author: QA });
  assert.equal(stored(walk.id).resolution, 'done', 'its owner closes it');
});

test('a teacher and an explorer may reply on a pilot thread and not on a qa thread', (t) => {
  tempDeck(t);
  const asked = question();
  const walk = walkthrough();

  reply(asked.id, TEACHER);
  reply(asked.id, EXPLORER);
  assert.deepEqual(messagesOf(stored(asked.id)).map((message) => message.author), ['teacher', 'explorer']);
  assert.ok(messagesOf(stored(asked.id)).every((message) => message.seq === undefined), 'a helper wakes nobody');

  assert.throws(() => reply(walk.id, TEACHER), ownedBy('qa'));
  assert.throws(() => reply(walk.id, EXPLORER), ownedBy('qa'));
  assert.throws(() => reply(asked.id, 'pilot:pilot-implementer'), ownedBy('pilot'), 'only the two helpers');
});

test('a helper may not pass a thread, and a user thread (a chat until 2026-09-28) is never passed', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const asked = question();
  const chat = createThread({ name: 'Anyone', repo: ALPHA });

  assert.throws(() => reply(asked.id, EXPLORER, { to: 'qa' }), ownedBy('pilot'));
  assert.throws(() => reply(chat.id, PILOT, { to: 'qa' }), { name: 'DeckRefusal', message: /always the pilot's/ });
  assert.equal(ownerOf(stored(asked.id)), 'pilot');
  assert.deepEqual(messagesOf(stored(chat.id)), []);
});

test('a pass to a kind outside PASS_KINDS is refused', (t) => {
  tempDeck(t);
  const walk = walkthrough();

  for (const to of ['teacher', 'architect', 'nobody', '']) {
    assert.throws(() => reply(walk.id, QA, { to }), { name: 'DeckRefusal', message: /pilot, qa/ }, `to: ${JSON.stringify(to)}`);
  }
  assert.equal(ownerOf(stored(walk.id)), 'qa');
  assert.deepEqual(messagesOf(stored(walk.id)), []);
});

test('a pass writes the message and the owner in one write', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  const realRename = fs.renameSync;

  let writes = 0;
  // The store's own rename only: the `.bak` rename before it is the backup (store-durability S1).
  t.mock.method(fs, 'renameSync', (...args) => {
    if (String(args[1]).endsWith('deck.json')) writes += 1;
    return realRename(...args);
  });
  reply(walk.id, QA, { to: 'pilot' });
  assert.equal(writes, 1);
  assert.equal(ownerOf(stored(walk.id)), 'pilot');
  assert.equal(messagesOf(stored(walk.id)).length, 1);

  const other = walkthrough();
  t.mock.restoreAll();
  t.mock.method(fs, 'renameSync', () => {
    throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  });
  assert.throws(() => reply(other.id, QA, { to: 'pilot' }), /disk full/);
  t.mock.restoreAll();
  assert.equal(ownerOf(stored(other.id)), 'qa', 'a failing write leaves the owner');
  assert.deepEqual(messagesOf(stored(other.id)), [], 'and leaves no message');
});

// S3 changed noteHanded without a pin of its own, because it only matters once a
// thread can be passed: a reply handed over by one kind's read is not handed again
// to the kind the thread passes to.
let sessions = 0;

async function aSession(t) {
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
  sessions += 1;
  const client = await import(`../client.mjs?pass=${sessions}`);
  await client.registerSession();
  return client;
}

for (const [from, to, post] of [
  [QA, 'pilot', () => walkthrough(process.cwd())],
  [PILOT, 'qa', () => question(process.cwd())],
]) {
  const [was, now] = from === QA ? ['qa', 'pilot'] : ['pilot', 'qa'];
  test(`a reply handed to the ${was}'s read is not handed again to the ${now} after a pass`, async (t) => {
    const client = await aSession(t);
    const item = post();
    addReply(item.id, 'read already');

    await client.callDeckTool('deck_read', { author: from });
    await client.callDeckTool('deck_reply', { id: item.id, text: `passing this to the ${now}`, to, author: from });
    assert.equal(ownerOf(stored(item.id)), now);

    const waited = JSON.parse((await client.waitForReply({ timeout: 1_000, author: to === 'pilot' ? PILOT : QA }, 300)).content[0].text);
    assert.deepEqual(saidIn(waited), [], `the ${now} is not handed what the ${was} already read`);
  });
}

// Spec 5, found by QA: a reply nobody had been handed when its thread was passed reached
// nobody, because the new owner's cursor was already past it. It is handed to the new
// owner's next wait, once, however far that cursor has moved.
for (const [from, to, post, mine] of [
  [QA, 'pilot', () => walkthrough(process.cwd()), () => question(process.cwd())],
  [PILOT, 'qa', () => question(process.cwd()), () => walkthrough(process.cwd())],
]) {
  const [was, now] = from === QA ? ['qa', 'pilot'] : ['pilot', 'qa'];
  test(`a reply in flight when the ${was} passes its thread reaches the ${now}'s parked wait, once`, async (t) => {
    const client = await aSession(t);
    const item = post();
    const theirs = mine();
    const asNew = { author: to === 'pilot' ? PILOT : QA };
    const waitAsNew = async (timeout) => JSON.parse((await client.waitForReply({ timeout, ...asNew }, timeout)).content[0].text);
    addReply(item.id, 'in flight');
    addReply(theirs.id, 'moves the cursor');
    assert.deepEqual(saidIn(await waitAsNew(1_000)), ['moves the cursor'], `the ${now}'s cursor is past the reply in flight`);

    const parked = waitAsNew(10_000);
    await client.callDeckTool('deck_reply', { id: item.id, text: `passing this to the ${now}`, to, author: from });
    assert.deepEqual(saidIn(await parked), ['in flight']);
    assert.deepEqual(saidIn(await waitAsNew(300)), [], 'and it is not handed twice');
  });
}

test('a passed thread whose reply is in flight reads not picked up yet, then the new owner has it', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  addReply(walk.id, 'in flight');
  reply(walk.id, QA, { to: 'pilot', text: 'yours now' });

  assert.equal(messagesOf(stored(walk.id)).at(-1).text, 'yours now', 'the pass is the thread\'s last message');
  assert.equal(threadState(stored(walk.id)), 'not picked up yet');
  callTool('deck_read', { repo: ALPHA });
  assert.equal(threadState(stored(walk.id)), 'the pilot has it');
});

test('the owner label is in a live region, so a pass changes it on an open page', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  reply(walk.id, QA, { to: 'pilot' });

  assert.match(renderThreadPage(stored(walk.id)), /<span class="kind" data-live="kind">[^<]*(?:<[^>]*>[^<]*)*<span class="owner"><span class="who by-pilot">pilot<\/span>/);
});
