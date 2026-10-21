/**
 * Run-chaining S2, spec 11; L10, ADR 0039 (superseding 0035 and the binding half of 0033).
 *
 * The daemon starts no session, so no run is bound to a thread: every run on a
 * repository hears every thread of it, a created thread included, and nothing
 * the agent or its environment sends narrows that. `deck_launch` is gone, and
 * the deck says so by name rather than taking it.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import { deckOnAPort } from '../testUtils.mjs';
import { KIND_USER } from '../items.mjs';
import { TOOLS } from '../tools.mjs';

const { createThread, listItems, registerRun } = await import('../store.mjs');

const ALPHA = 'D:/work/alpha';

const sleeper = (t) => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  t.after(() => child.kill());
  return child;
};

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const payloadOf = async (response) => JSON.parse((await response.json()).content[0].text);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);

const send = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id, text, choice: '' }),
    redirect: 'manual',
  });

const drain = async (base) => (await payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 200 }))).seq;

test('every run on a repository hears a created thread, and a thread argument narrows nothing', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Anyone', repo: ALPHA });
  const other = registerRun({ repo: ALPHA, pid: sleeper(t).pid, thread: thread.id });
  assert.equal(other.thread, undefined, 'registration binds no run to a thread');
  const since = await drain(base);

  const first = callApi(base, 'deck_wait', { since, timeout: 30_000, repo: ALPHA });
  const second = callApi(base, 'deck_wait', { since, timeout: 30_000, repo: ALPHA, thread: 'elsewhere' });
  assert.equal((await send(base, thread.id, 'for whoever is live')).status, 303);

  assert.deepEqual(saidIn(await payloadOf(await first)), ['for whoever is live']);
  assert.deepEqual(saidIn(await payloadOf(await second)), ['for whoever is live']);
});

test('an item cannot be bound to a thread: deck_post takes no thread', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const thread = createThread({ name: 'Poster', repo: ALPHA });
  const response = await callApi(base, 'deck_post', { kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA, thread: thread.id });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /takes no thread/);
});

test('deck_launch is an unknown tool: /api/tool refuses it by name and writes nothing', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });

  const response = await callApi(base, 'deck_launch', { name: 'Spec one', body: 'Build the cache.', repo: ALPHA });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /no tool named deck_launch/);
  assert.equal(listItems().filter((item) => item.kind === KIND_USER).length, 0);
});

test('the pilot is offered the seven deck tools and none that starts a session', () => {
  assert.deepEqual(
    TOOLS.map((tool) => tool.name).sort(),
    ['deck_post', 'deck_read', 'deck_reply', 'deck_resolve', 'deck_status', 'deck_ticket', 'deck_wait'],
  );
});
