/**
 * Merge-first S1, spec 2; L3, ADR 0063 (on the pattern of ADR 0058's auditor).
 *
 * The architect posts its merge thread itself, so by the A1 rule it owns it: a reply
 * typed there is heard by the architect's wait alone, the thread cannot be passed to
 * it (`PASS_KINDS` stays pilot and qa), and an architect gone quiet hands the reply to
 * the pilot by the owner fallback (ADR 0045). Never port 4321: this machine runs a real deck.
 *
 * Tool calls go over `node:http` with no agent, as in `auditor-owner.test.mjs`: undici's
 * pooled connections keep timers that a mocked clock strands.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, forgetAgents, noteActive } = await import('../agents.mjs');
const { addReply, currentSeq, listItems, postItem, registerRun } = await import('../store.mjs');
const { messagesOf, ownerOf } = await import('../items.mjs');
const { callTool, waiterCount } = await import('../server.mjs');

const ALPHA = 'D:/work/alpha';
const ARCHITECT = 'pilot:pilot-architect';
const PICK_UP = 30_000; // L6
const START = Date.parse('2026-10-04T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const mergeThread = () =>
  postItem({ kind: 'question', title: 'Merge into the live ticket?', body: 'itm_a and itm_b share its surface', repo: ALPHA, author: ARCHITECT });

const callApi = (base, name, args = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/tool`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ name, arguments: args }));
  });
const payloadOf = (body) => JSON.parse(JSON.parse(body).content[0].text);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);

const settleLoop = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** A wait, parked: resolves to its payload, and `done()` says whether it has answered yet. */
async function park(base, args) {
  const before = waiterCount();
  let answered = false;
  const reply = callApi(base, 'deck_wait', args).then(payloadOf).finally(() => (answered = true));
  reply.catch(() => {});
  for (let i = 0; i < 200 && waiterCount() === before && !answered; i += 1) await settleLoop(1);
  return { reply, done: () => answered };
}

test("an architect's own post is owned by the architect", (t) => {
  tempDeck(t);
  const item = mergeThread();

  assert.equal(stored(item.id).owner, 'architect');
  assert.equal(ownerOf(stored(item.id)), 'architect');
});

test("a reply on the architect's thread goes to the architect's wait alone", async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const item = mergeThread();
  addReply(item.id, 'Merge these');

  const pilot = payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA, author: '' }));
  assert.deepEqual(saidIn(pilot), [], "the pilot's wait is handed nothing of the architect's");
  // As `pilot wait --as architect --item <id>` asks it.
  const architect = payloadOf(
    await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: ALPHA, author: 'architect', item: item.id, untaken: true }),
  );
  assert.deepEqual(saidIn(architect), ['Merge these']);
  assert.equal(messagesOf(stored(item.id)).at(-1).deliveredTo, 'architect');
});

test('a thread cannot be passed to the architect', (t) => {
  tempDeck(t);
  const asked = postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA, author: '' });

  assert.throws(() => callTool('deck_reply', { id: asked.id, text: 'yours', author: '', to: 'architect' }));
  assert.equal(ownerOf(stored(asked.id)), 'pilot', 'the thread stays where it was');
});

test("the architect's quiet thread falls back to the pilot", async (t) => {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  forgetAgents();
  t.after(() => forgetAgents());
  noteActive({ cwd: ALPHA, kind: 'architect' }, Date.now() - 2 * LIVE_WINDOW_MS);
  const item = mergeThread();
  addReply(item.id, 'Merge none');

  const wait = await park(base, { since: currentSeq(), timeout: 120_000, repo: ALPHA });
  t.mock.timers.tick(PICK_UP);
  await settleLoop();
  assert.equal(wait.done(), true, 'at 30 s the pilot is handed the reply');
  const [reply] = (await wait.reply).replies;
  assert.equal(reply.text, 'Merge none');
  assert.match(reply.fallback, /architect's thread/);
  assert.doesNotMatch(reply.fallback, /to: "architect"/, 'a thread cannot be passed back to the architect (PASS_KINDS)');
  assert.equal(ownerOf(stored(item.id)), 'pilot');
});
