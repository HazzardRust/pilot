/**
 * pilot-state-line S3: a parked `pilot wait` reads `listening`, live (spec 4, 10; L5, L6).
 *
 * The held-wait registry stamps when a hold began and announces only the first hold and the last
 * release, and `GET /` reads it into the tab's state line. Never port 4321: this machine runs a
 * real deck. Tool calls go over `node:http` with no agent, as `fallback.test.mjs` explains.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, forgetAgents, heldWaits, holdWait, quietAt, watchAgents } = await import('../agents.mjs');
const { repoKey } = await import('../items.mjs');
const { registerRun } = await import('../store.mjs');
const { waiterCount } = await import('../server.mjs');

const MINE = path.join(os.tmpdir(), 'pilot-state-wait-mine');
const START = Date.parse('2026-10-15T09:00:00.000Z');

const request = (url, method = 'GET', body = undefined) =>
  new Promise((resolve, reject) => {
    const sent = http.request(url, { method, agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (text += chunk));
      response.on('end', () => resolve(text));
    });
    sent.on('error', reject);
    sent.end(body);
  });
const stateOn = async (base) => /data-pilot-state="([^"]+)"/.exec(await request(`${base}/?run=${encodeURIComponent(MINE)}`))?.[1];

test('a hold records when it began and a second hold keeps it', (t) => {
  forgetAgents();
  t.after(forgetAgents);
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const first = holdWait(MINE, 'pilot');
  t.mock.timers.tick(5_000);
  const second = holdWait(MINE, 'qa');
  assert.deepEqual(heldWaits(), { [repoKey(MINE)]: START });
  second();
  first();
});

test('the last release empties the repository', (t) => {
  forgetAgents();
  t.after(forgetAgents);
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const first = holdWait(MINE, 'pilot');
  t.mock.timers.tick(5_000);
  const second = holdWait(MINE, 'pilot');
  first();
  assert.deepEqual(heldWaits(), { [repoKey(MINE)]: START }, 'one hold left keeps the first since');
  second();
  assert.deepEqual(heldWaits(), {});
});

test('quietAt still treats a held kind as now', (t) => {
  forgetAgents();
  t.after(forgetAgents);
  const release = holdWait(MINE, 'pilot');
  assert.equal(quietAt(MINE, 'pilot', START), START + LIVE_WINDOW_MS);
  release();
  assert.notEqual(quietAt(MINE, 'pilot', START), START + LIVE_WINDOW_MS, 'released, it is its last activity again');
});

test('first hold and last release announce, the middle ones do not', (t) => {
  forgetAgents();
  t.after(forgetAgents);
  let told = 0;
  watchAgents(() => (told += 1));
  // The daemon's own listener is not exported, so this drops it for the rest of the file:
  // no test after this one may rely on the pages being told.
  t.after(() => watchAgents(() => {}));
  const first = holdWait(MINE, 'pilot');
  assert.equal(told, 1, 'the first hold');
  const second = holdWait(MINE, 'pilot');
  assert.equal(told, 1, 'a second hold is not told');
  first();
  assert.equal(told, 1, 'nor a partial release');
  second();
  assert.equal(told, 2);
});

test('a parked deck_wait turns the tab\'s line to listening', async (t) => {
  forgetAgents();
  t.after(forgetAgents);
  const base = await deckOnAPort(t);
  registerRun({ repo: MINE, pid: process.pid });
  assert.equal(await stateOn(base), 'working', 'not parked, not listening');

  const before = waiterCount();
  const waited = request(`${base}/api/tool`, 'POST', JSON.stringify({ name: 'deck_wait', arguments: { repo: MINE, timeout: 500 } }));
  for (let i = 0; i < 200 && waiterCount() === before; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await stateOn(base), 'listening', 'parked');

  await waited;
  assert.equal(await stateOn(base), 'working', 'returned');
});
