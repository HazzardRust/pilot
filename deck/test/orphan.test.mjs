/**
 * ADR 0045: the owner fallback (L6, L7) reaches the pilot by every path that hands it replies,
 * not only a parked MCP `deck_wait`. On 2026-09-29 the user's reply on a dead QA's walkthrough
 * sat for as long as the pilot idled on `pilot wait`, because that path never ran the fallback.
 *
 * A deck of each test's own on its own port, never 4321. The clock is mocked (`Date` only for
 * `pilot wait`, whose `fetch` keeps timers of its own), and no test sleeps out a window.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { deckOnAPort } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, forgetAgents, noteActive } = await import('../agents.mjs');
const { addReply, currentSeq, listItems, postItem } = await import('../store.mjs');
const { OWNER_PICK_UP_MS, messagesOf, ownerOf } = await import('../items.mjs');
const { wait } = await import('../wait.mjs');

const ALPHA = 'D:/work/alpha';
const QA = 'pilot:pilot-qa';
const START = Date.parse('2026-09-29T05:25:32Z');
const PAST_ANY_SEQ = Number.MAX_SAFE_INTEGER;
const NOTE = /qa's thread.*did not pick/is;

const stored = (id) => listItems().find((item) => item.id === id);
const walkthrough = () => postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: ALPHA, author: QA });

const callApi = (base, name, args = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/tool`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(JSON.parse(JSON.parse(body).content[0].text)));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ name, arguments: args }));
  });

/** A fresh daemon at START on a mocked clock, with QA last seen long enough ago to be quiet. */
async function orphanedDeck(t, apis = ['setTimeout', 'Date']) {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis, now: START });
  forgetAgents();
  t.after(() => forgetAgents());
  noteActive({ cwd: ALPHA, kind: 'qa' }, START - 2 * LIVE_WINDOW_MS);
  return base;
}

/** The pilot's `deck_read` of its repository, answered at once: a 1 ms wait needs no clock. */
const pilotRead = (base) => callApi(base, 'deck_read', { repo: ALPHA, open: true });

test("the pilot's deck_read leaves a qa reply alone inside the window", async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const walk = walkthrough();
  addReply(walk.id, '4390 is not up');
  t.mock.timers.tick(OWNER_PICK_UP_MS - 1);

  const read = await pilotRead(base);
  assert.equal(read.items.find((item) => item.id === walk.id).owner, 'qa');
  assert.equal(ownerOf(stored(walk.id)), 'qa');
  assert.equal(messagesOf(stored(walk.id)).at(-1).deliveredAt, undefined, 'nobody has been handed it');
});

test("past the window the pilot's deck_read takes the thread, once, and says qa never picked it up", async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const walk = walkthrough();
  addReply(walk.id, '4390 is not up');
  t.mock.timers.tick(OWNER_PICK_UP_MS);

  const read = await pilotRead(base);
  const shown = read.items.find((item) => item.id === walk.id);
  assert.equal(shown.owner, 'pilot');
  assert.match(shown.fallback, NOTE, 'the pilot is told whose thread it was and why it has it');
  const reply = messagesOf(stored(walk.id)).at(-1);
  assert.equal(reply.deliveredTo, 'pilot', 'the store records who received it');

  const again = (await pilotRead(base)).items.find((item) => item.id === walk.id);
  assert.equal(again.fallback, undefined, 'said once: the thread is plainly the pilot\'s from here');
});

test('a deck_read that takes a thread outside its window still returns it, with the note', async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const walk = walkthrough();
  addReply(walk.id, '4390 is not up');
  postItem({ kind: 'question', title: 'Newer', body: 'Pushes the walkthrough out of a one-item read.', repo: ALPHA });
  t.mock.timers.tick(OWNER_PICK_UP_MS);

  const read = await callApi(base, 'deck_read', { repo: ALPHA, open: true, limit: 1 });
  const shown = read.items.find((item) => item.id === walk.id);
  assert.ok(shown, 'the thread the read just took is in its answer');
  assert.match(shown.fallback, NOTE);
});

test('a reply qa already picked up is not taken by the pilot\'s deck_read', async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, 'step two fails');
  const picked = await callApi(base, 'deck_wait', { since: before, timeout: 1, repo: ALPHA, author: QA });
  assert.deepEqual(picked.replies.map((reply) => reply.text), ['step two fails']);
  noteActive({ cwd: ALPHA, kind: 'qa' }, START - 2 * LIVE_WINDOW_MS);
  t.mock.timers.tick(OWNER_PICK_UP_MS + LIVE_WINDOW_MS);

  const shown = (await pilotRead(base)).items.find((item) => item.id === walk.id);
  assert.equal(shown.owner, 'qa');
  assert.equal(messagesOf(stored(walk.id)).at(-1).deliveredTo, 'qa');
});

test("a fallback-only wait hands the reply over after the window and not before, with qa's note", async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const walk = walkthrough();
  addReply(walk.id, '4390 is not up');
  const fallbackOnly = () => callApi(base, 'deck_wait', { since: PAST_ANY_SEQ, timeout: 1, repo: ALPHA });

  t.mock.timers.tick(OWNER_PICK_UP_MS - 1);
  assert.deepEqual((await fallbackOnly()).replies, [], 'inside the window QA keeps it');
  t.mock.timers.tick(1);
  const [handed, ...rest] = (await fallbackOnly()).replies;
  assert.deepEqual(rest, []);
  assert.equal(handed.text, '4390 is not up');
  assert.match(handed.fallback, NOTE);
  assert.deepEqual((await fallbackOnly()).replies, [], 'handed over once');
});

test("a parked pilot wait wakes at the window's end with the reply and qa's note, and not before", { timeout: 10_000 }, async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const previousPort = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => (previousPort === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = previousPort)));
  const walk = walkthrough();
  addReply(walk.id, '4390 is not up');

  const said = [];
  let done = false;
  const waiting = wait({ env: {}, cwd: ALPHA, pollMs: 5, timeoutMinutes: 600, say: (line) => said.push(line) }).finally(() => (done = true));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(done, false, 'inside the window the wait stays parked');
  assert.equal(ownerOf(stored(walk.id)), 'qa');

  t.mock.timers.tick(OWNER_PICK_UP_MS);
  assert.equal(await waiting, 0);
  const printed = said.join('');
  assert.match(printed, new RegExp(walk.id));
  assert.match(printed, /4390 is not up/);
  assert.match(printed, NOTE);
  assert.equal(messagesOf(stored(walk.id)).at(-1).deliveredTo, 'pilot');
});

test("a reply on the pilot's own thread carries no fallback note", async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const own = postItem({ kind: 'question', title: 'Which port?', body: 'Pick one.', repo: ALPHA });
  const before = currentSeq();
  addReply(own.id, '4390');
  t.mock.timers.tick(OWNER_PICK_UP_MS + LIVE_WINDOW_MS);

  const waited = await callApi(base, 'deck_wait', { since: before, timeout: 1, repo: ALPHA });
  assert.deepEqual(waited.replies.map((reply) => reply.text), ['4390']);
  assert.equal(waited.replies[0].fallback, undefined);
  assert.equal((await pilotRead(base)).items.find((item) => item.id === own.id).fallback, undefined);
});

// session-row spec 10, L5: the fallback stamps every reply it claims as the pilot's, so the
// thread it took comes back whole, not windowed, or the store records replies nobody was shown.
test("a dead qa's walkthrough the pilot's default deck_read takes comes back whole, once", async (t) => {
  const base = await orphanedDeck(t, ['Date']);
  const walk = walkthrough();
  for (const text of ['one', 'two', 'three', 'four']) addReply(walk.id, text);
  t.mock.timers.tick(OWNER_PICK_UP_MS);

  const read = await pilotRead(base);
  const shown = read.items.filter((item) => item.id === walk.id);
  assert.equal(shown.length, 1, 'the taken thread is in the answer exactly once');
  assert.deepEqual(messagesOf(shown[0]).map((reply) => reply.text), ['one', 'two', 'three', 'four']);
  assert.equal(shown[0].window, undefined, 'a taken thread carries no window');
  const claimed = messagesOf(stored(walk.id)).filter((reply) => reply.deliveredTo === 'pilot');
  assert.equal(claimed.length, 4, 'the store records all four as the pilot\'s');
  const texts = new Set(messagesOf(shown[0]).map((reply) => reply.text));
  assert.ok(claimed.every((reply) => texts.has(reply.text)), 'every claimed reply is shown');
});
