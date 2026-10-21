/**
 * S2 of gate2-frees-lane (spec 8, L3): a deck-written finish never ends the pilot's
 * `deck_wait` while a lane of its directory still holds a live ticket or a live co-pilot.
 * With every lane empty, the finish stops the wait as before.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { deckOnAPort, postStored, shapedTicketBody, takeLive } from '../testUtils.mjs';
import { KIND_HANDOFF, repoKey } from '../items.mjs';

const { registerRun, storeFile } = await import('../store.mjs');

const REPO = path.resolve('D:/work/alpha');

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const textOf = async (response) => (await response.json()).content[0].text;

/** The wait timed out with nothing handed over: it kept listening, rather than stopping or erring. */
const assertListening = async (response) => {
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await textOf(response)).replies, []);
};

const editStore = (change) => {
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  change(deck);
  fs.writeFileSync(storeFile(), `${JSON.stringify(deck, null, 2)}\n`);
};

const aTicket = (title, state) => postStored({ kind: 'ticket', title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state });

/** A run in REPO whose newest record carries a clean finish; returns the wait for that run. */
async function finishedRun(t) {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  const status = await callApi(base, 'deck_status', { run: run.id, slug: 'landed', slices: [], finished: 'closing report posted' });
  assert.equal(status.status, 200, await status.clone().text());
  return () => callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: REPO, run: run.id });
}

test('a finish beside a live green ticket does not stop', async (t) => {
  const wait = await finishedRun(t);
  takeLive(aTicket('another feature', 'green').id);

  await assertListening(await wait());
});

test('a finish beside a live co-pilot does not stop', async (t) => {
  const wait = await finishedRun(t);
  const yellow = aTicket('a yellow ticket', 'yellow');
  editStore((deck) => {
    deck.coPilots = { [repoKey(REPO)]: { ticket: yellow.id, live: true, at: new Date().toISOString() } };
  });

  await assertListening(await wait());
});

test('a finish with every lane empty stops as today', async (t) => {
  const wait = await finishedRun(t);

  assert.equal(await textOf(await wait()), 'stop listening: the run is finished (closing report posted)');
});

test('a finish beside a queued ticket no lane holds stops', async (t) => {
  const wait = await finishedRun(t);
  aTicket('queued, not taken', 'green');

  assert.equal(await textOf(await wait()), 'stop listening: the run is finished (closing report posted)');
});

test('a chain hand-off from before the run hands nothing on: its ticket, held, keeps the run listening', async (t) => {
  const wait = await finishedRun(t);
  const held = aTicket('held by this pilot', 'green');
  postStored({ kind: KIND_HANDOFF, title: 'an older chain', body: 'x', repo: REPO, next: held.id, postedAt: '2000-01-01T00:00:00.000Z', resolvedAt: '2000-01-01T00:00:01.000Z' });
  takeLive(held.id);

  await assertListening(await wait());
});
