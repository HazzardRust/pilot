/**
 * handoff-mod S4 (spec 10; L12, L13): a pilot session's start releases the directory's dead co-pilot through
 * `POST /api/started { repo }`, and chains nothing. `POST /api/chain`, which also took the head ticket at start,
 * is gone. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_HANDOFF, KIND_TICKET } from '../items.mjs';
import { coPilotFor, listItems, postItem, setCoPilot } from '../store.mjs';
import { deckOnAPort, postStored, shapedTicketBody } from '../testUtils.mjs';

const OURS = path.resolve('D:/work/alpha');
const THEIRS = path.resolve('D:/work/beta');

const yellow = (repo) => postStored({ kind: KIND_TICKET, title: 'Building', body: shapedTicketBody('b'), repo, sliceCount: 60, state: 'yellow' });
const aRedTicket = (repo) => postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Next', body: shapedTicketBody('n'), repo });

const post = (base, route, body, headers = {}) =>
  fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test("started releases this repository's co-pilot and posts no hand-off", async (t) => {
  const base = await deckOnAPort(t);
  setCoPilot(yellow(OURS).id, true);
  const red = aRedTicket(OURS);

  const answer = await post(base, '/api/started', { repo: OURS });

  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { released: true });
  assert.equal(coPilotFor(OURS).live, false, 'the dead session\'s co-pilot no longer holds the hand-offs');
  assert.equal(listItems().filter((item) => item.kind === KIND_HANDOFF).length, 0, 'nothing chains at start (L12)');
  assert.equal(listItems().find((item) => item.id === red.id).live, undefined, 'the red head is not taken');

  assert.deepEqual(await (await post(base, '/api/started', { repo: OURS })).json(), { released: false }, 'nothing left to release');
});

test("started leaves another repository's co-pilot live", async (t) => {
  const base = await deckOnAPort(t);
  const theirs = yellow(THEIRS);
  setCoPilot(theirs.id, true);

  const answer = await post(base, '/api/started', { repo: OURS });

  assert.deepEqual(await answer.json(), { released: false });
  assert.equal(coPilotFor(THEIRS).live, true);
  assert.equal(coPilotFor(THEIRS).ticket, theirs.id);
});

test('started refuses a body without a repo, a foreign Origin and a form body', async (t) => {
  const base = await deckOnAPort(t);
  setCoPilot(yellow(OURS).id, true);

  const bare = await post(base, '/api/started', {});
  assert.equal(bare.status, 400);
  assert.match((await bare.json()).error, /repo must be the path of the repository/);
  assert.equal((await post(base, '/api/started', { repo: '  ' })).status, 400, 'a blank repo is no repo');

  const foreign = await post(base, '/api/started', { repo: OURS }, { origin: 'http://evil.example' });
  assert.equal(foreign.status, 403, 'a cross-site page cannot release a co-pilot');
  const form = await post(base, '/api/started', { repo: OURS }, { 'content-type': 'text/plain' });
  assert.equal(form.status, 415, 'a body a cross-site form can send is refused');
  assert.equal(coPilotFor(OURS).live, true, 'none of them released it');
});

test('the chain route is gone', async (t) => {
  const base = await deckOnAPort(t);
  aRedTicket(OURS);

  const answer = await post(base, '/api/chain', { repo: OURS });

  assert.equal(answer.status, 404);
  assert.equal(listItems().filter((item) => item.kind === KIND_HANDOFF).length, 0);
});
