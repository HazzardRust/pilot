/**
 * never-stuck S14, spec 24; L9.
 *
 * A user's answer on an agent-owned thread that no wait of the owner is parked on goes to the
 * pilot at 30 s, named `unheard by <owner>`, however busy the owner is. A parked wait of the
 * owner keeps it, and a quiet owner's thread falls back as it always has.
 *
 * The clock is each test's own (`mock.timers`), and every test takes its own store and port.
 * Tool calls go over `node:http` with no agent, as `fallback.test.mjs` explains.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, forgetAgents, noteActive } = await import('../agents.mjs');
const { addReply, listItems, postItem } = await import('../store.mjs');
const { ownerOf } = await import('../items.mjs');
const { waiterCount } = await import('../server.mjs');
const { fallbackFor, parkedOn } = await import('../server-wait.mjs');

const ALPHA = path.join(os.tmpdir(), 'work', 'alpha');
const ARCHITECT = 'pilot:pilot-architect';
const PICK_UP = 30_000; // L6
const START = Date.parse('2026-11-18T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const question = (title = 'Merge into the live ticket?') =>
  postItem({ kind: 'question', title, body: 'itm_a and itm_b share its surface', repo: ALPHA, author: ARCHITECT });
const architectBusy = () => noteActive({ cwd: ALPHA, kind: 'architect' });

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

const settleLoop = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

async function park(base, args) {
  const before = waiterCount();
  let answered = false;
  const reply = callApi(base, 'deck_wait', args).then(payloadOf).finally(() => (answered = true));
  reply.catch(() => {});
  for (let i = 0; i < 200 && waiterCount() === before && !answered; i += 1) await settleLoop(1);
  return { reply, done: () => answered };
}

async function deckAtStart(t) {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  forgetAgents();
  t.after(() => forgetAgents());
  return base;
}

test('an active architect with no wait loses its reply at 30 s', async (t) => {
  await deckAtStart(t);
  architectBusy();
  const item = question();
  addReply(item.id, 'Merge these');

  t.mock.timers.tick(PICK_UP - 1);
  architectBusy();
  assert.deepEqual(fallbackFor(ALPHA).claim(), [], 'short of 30 s the reply is still the architect\'s');

  t.mock.timers.tick(1);
  architectBusy();
  const handed = fallbackFor(ALPHA).claim();
  assert.deepEqual(handed.map((reply) => [reply.text, reply.fallback]), [['Merge these', 'unheard by architect']]);
  assert.equal(ownerOf(stored(item.id)), 'pilot', "the thread is the pilot's now, however busy the architect");
});

test('a parked architect wait keeps it', async (t) => {
  const base = await deckAtStart(t);
  architectBusy();
  const item = question();
  const other = question('Another question');

  const wait = await park(base, { since: 0, timeout: 120_000, repo: ALPHA, author: 'architect', item: item.id, untaken: true });
  assert.equal(parkedOn('architect', item.id, ALPHA), true, 'the wait is parked on its item');
  assert.equal(parkedOn('architect', other.id, ALPHA), false, 'and on no other');
  assert.equal(parkedOn('qa', item.id, ALPHA), false, 'and for no other kind');

  addReply(item.id, 'Merge these');
  await settleLoop();
  assert.equal(wait.done(), true);
  assert.deepEqual((await wait.reply).replies.map((reply) => reply.text), ['Merge these'], "the architect's wait gets it");
  assert.equal(parkedOn('architect', item.id, ALPHA), false, 'a wait that has returned is parked on nothing');

  t.mock.timers.tick(PICK_UP);
  assert.deepEqual(fallbackFor(ALPHA).claim(), [], 'and the pilot is handed none of it');
  assert.equal(ownerOf(stored(item.id)), 'architect');
});

test("today's quiet-owner fallback is unchanged", async (t) => {
  await deckAtStart(t);
  noteActive({ cwd: ALPHA, kind: 'architect' }, Date.now() - 2 * LIVE_WINDOW_MS);
  const item = question();
  addReply(item.id, 'Merge these');

  t.mock.timers.tick(PICK_UP);
  const [handed, ...rest] = fallbackFor(ALPHA).claim();
  assert.equal(rest.length, 0);
  assert.equal(handed.text, 'Merge these');
  assert.match(handed.fallback, /^This was architect's thread, and architect did not pick this reply up in time, so the deck has handed the thread to you/);
});
