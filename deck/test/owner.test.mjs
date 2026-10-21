/**
 * Thread-ownership S1, spec 1 and 2 (the `deck_wait` path); A1, A2, A8, ADR 0041.
 *
 * Every item has one owner kind, `pilot` or `qa`. A user reply is heard only by
 * a wait of its thread's owner kind, the daemon deciding, and each kind keeps a
 * cursor of its own in the one stdio process a session's agents share, so a QA
 * wait that moves past a pilot reply never carries the pilot's wait past it.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addReply, createThread, listItems, postItem, registerRun } = await import('../store.mjs');
const { ownerOf } = await import('../items.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const ALPHA = 'D:/work/alpha';
const QA = 'pilot:pilot-qa';

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const payloadOf = async (response) => JSON.parse((await response.json()).content[0].text);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);

// Through the page, as the user replies: a write the daemon announces to its parked waits.
const send = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id, text, choice: '' }),
    redirect: 'manual',
  });

const walkthrough = (author = QA) =>
  postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: ALPHA, author });
const question = (author = '') =>
  postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA, author });

test('a QA walkthrough is stored with owner qa and a pilot question with owner pilot', (t) => {
  tempDeck(t);
  walkthrough();
  question('');
  postItem({ kind: 'question', title: 'Mine', body: 'b', repo: ALPHA, author: 'pilot:pilot-implementer' });
  postItem({ kind: 'question', title: 'Hook', body: 'b', repo: ALPHA });

  assert.deepEqual(
    listItems().map((item) => item.owner),
    ['qa', 'pilot', 'pilot', 'pilot'],
    'QA owns its own; the pilot, an implementer and an unstamped caller all post pilot-owned items',
  );
});

test('an item with no owner reads as its author kind, else pilot', () => {
  assert.equal(ownerOf({ kind: 'walkthrough', author: 'qa' }), 'qa', 'an old QA walkthrough');
  assert.equal(ownerOf({ kind: 'question' }), 'pilot', 'an old item with no author');
  assert.equal(ownerOf({ kind: 'question', author: 'implementer' }), 'pilot', 'an author that is not an owner kind');
  assert.equal(ownerOf({ kind: 'question', author: 'qa', owner: 'pilot' }), 'pilot', 'a stored owner wins');
  assert.equal(ownerOf({ kind: 'question', owner: 'nonsense' }), 'pilot', 'a stored value that is no owner kind');
});

// A created thread is a user thread since 2026-09-28, and stays the pilot's as a created chat was (ADR 0041).
test("a chat and a user thread are the pilot's whatever posted them", (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const created = createThread({ name: 'Ideas', repo: ALPHA });
  const chat = listItems().find((item) => item.kind === 'chat');

  assert.equal(created.kind, 'user');
  assert.equal(ownerOf(chat), 'pilot');
  assert.equal(ownerOf(created), 'pilot');
  assert.equal(ownerOf({ ...created, author: 'qa', owner: 'qa' }), 'pilot', 'even one claiming otherwise');
});

test('a reply on a qa thread is heard by a qa wait and not by a pilot wait', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const walk = walkthrough();

  let pilotDone = false;
  const forQa = callApi(base, 'deck_wait', { since: 0, timeout: 5_000, repo: ALPHA, author: QA });
  const forPilot = callApi(base, 'deck_wait', { since: 0, timeout: 1_500, repo: ALPHA, author: '' })
    .then(payloadOf)
    .then((payload) => {
      pilotDone = true;
      return payload;
    });
  await sleep(100);
  assert.equal((await send(base, walk.id, 'looks right')).status, 303);

  assert.deepEqual(saidIn(await payloadOf(await forQa)), ['looks right']);
  assert.equal(pilotDone, false, "the pilot's wait is still parked when QA's returns");
  const pilot = await forPilot;
  assert.deepEqual(saidIn(pilot), [], 'and it times out with nothing of QA handed to it');
});

test("a wait with no author is the pilot's", async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const asked = question();
  const walk = walkthrough();
  addReply(walk.id, 'for qa');
  addReply(asked.id, 'for the pilot');

  assert.deepEqual(saidIn(await payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA }))), [
    'for the pilot',
  ]);
  // No `any`-shaped default: a kind that owns nothing is not made the pilot.
  const refused = await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA, author: 'pilot:pilot-implementer' });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /pilot, qa, teacher, auditor and architect/);
});

let sessions = 0;

test("a pilot wait keeps its own reply after a qa wait moved past it", async (t) => {
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
  sessions += 1;
  const client = await import(`../client.mjs?owner=${sessions}`);
  await client.registerSession();

  const asked = postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: process.cwd(), author: '' });
  const walk = postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: process.cwd(), author: QA });
  addReply(asked.id, 'the pilot answer, lower seq');
  addReply(walk.id, 'the qa answer, higher seq');

  const qa = JSON.parse((await client.waitForReply({ timeout: 1_000, author: QA }, 300)).content[0].text);
  assert.deepEqual(saidIn(qa), ['the qa answer, higher seq']);

  const pilot = JSON.parse((await client.waitForReply({ timeout: 1_000, author: '' }, 300)).content[0].text);
  assert.deepEqual(saidIn(pilot), ['the pilot answer, lower seq'], "QA's wait did not carry the pilot's cursor past it");
});

test('the thread page names the owner', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  const asked = question();

  assert.match(renderThreadPage(walk, [walk, asked]), /<span class="owner"><span class="who by-qa">qa<\/span>/);
  assert.match(renderThreadPage(asked, [walk, asked]), /<span class="owner"><span class="who by-pilot">pilot<\/span>/);
});

// Gate 2, itm_8dc56c0d58cd: "start 'owner: x' on a new line entirely", then
// "drop the "owner:" and leave just "x", x should be colour coded the same way
// the owner of a message is colour coded" — so it is a message's byline.
test('the owner starts its own line in the thread header, as a byline', (t) => {
  tempDeck(t);
  const walk = walkthrough();

  const page = renderThreadPage(walk, [walk]);
  assert.match(page, /<span class="owner"><span class="who by-qa">qa<\/span><\/span>/);
  assert.doesNotMatch(page, /owner: /, 'no "owner:" label');
  assert.doesNotMatch(page, /· <span class="owner">/, 'no separator dangles before the new line');
});

test("deck_read and deck_wait take the stamped author, and a pass names only PASS_KINDS", async () => {
  const { PASS_KINDS } = await import('../items.mjs');
  const { TOOLS } = await import('../tools.mjs');
  const schema = (name) => TOOLS.find((tool) => tool.name === name).inputSchema.properties;
  for (const name of ['deck_read', 'deck_wait']) assert.ok(schema(name).author, `${name} declares author`);
  assert.deepEqual(schema('deck_reply').to.enum, PASS_KINDS);
  assert.deepEqual(PASS_KINDS, ['pilot', 'qa'], 'a lesson is posted by its teacher, never passed to one');
});

test('past MAX_AGENTS repositories, a new one counts from the daemon start', async (t) => {
  const { MAX_AGENTS, forgetAgents, lastActive, noteActive } = await import('../agents.mjs');
  forgetAgents();
  t.after(forgetAgents);
  const startedAt = lastActive('D:/never/seen', 'qa');
  for (let i = 0; i < MAX_AGENTS; i += 1) noteActive({ cwd: `D:/work/r${i}`, kind: 'qa' }, startedAt + 1);
  noteActive({ cwd: 'D:/work/one-too-many', kind: 'qa' }, startedAt + 1);
  assert.equal(lastActive('D:/work/r0', 'qa'), startedAt + 1);
  assert.equal(lastActive('D:/work/one-too-many', 'qa'), startedAt);
});
