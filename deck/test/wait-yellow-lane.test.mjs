/**
 * yellow-lane S1, spec 1; never-stuck spec 7, L8 (amends ADR 0143 L2).
 *
 * The pilot's `pilot wait` prints `lanes.refusal` from `GET /api/record`; with a yellow ticket and no live co-pilot
 * that line is the yellow lane's. It is said once, and the wait goes on listening: only a reply, the session's exit or
 * the timeout ends it, so a waiting pilot keeps hearing the user while a lane is idle. The Stop hook stays the enforcer.
 *
 * The real daemon on its own store and an ephemeral port, never 4321.
 */

import './no-open.mjs';

import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aTicket, deckOnAPort } from '../testUtils.mjs';

const { postItem } = await import('../store.mjs');
const { waiterCount } = await import('../server.mjs');
const { wait } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/pilot');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('the idle lane refusal is said once and the wait listens', async (t) => {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const yellow = aTicket('Building', 'yellow', REPO);
  const asked = postItem({ kind: 'question', title: 'Which way', body: 'A or B', repo: REPO, author: '' });

  const said = [];
  const waiting = wait({ env: {}, repo: REPO, kind: 'pilot', timeoutMinutes: 0.2, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line) });
  // Several empty polls go by, each reading the lanes again, before the user answers.
  for (let i = 0; i < 400 && waiterCount() < 1; i += 1) await pause(5);
  assert.equal(waiterCount(), 1, 'the wait parks beside the refusal');
  await pause(700);
  const answer = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: new URLSearchParams({ id: asked.id, text: 'go with A' }),
  });
  assert.equal(answer.status, 303);

  assert.equal(await waiting, 0);
  const printed = said.join('');
  const refusal = `yellow lane empty; ${yellow.id} is planned — deck_ticket co-pilot it first`;
  assert.equal(printed.split('\n').filter((line) => line === refusal).length, 1, 'the refusal is said once');
  assert.match(printed, new RegExp(`^REPLY ${asked.id} "Which way"\ngo with A$`, 'm'));
  assert.doesNotMatch(printed, /NO REPLY/);
});
