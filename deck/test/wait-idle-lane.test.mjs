/**
 * idle-main-lane S1, spec 1, 3; L3, L4, L5, L6; ADR 0123.
 *
 * `GET /api/record` carries the directory's lanes, and the pilot's `pilot wait` reads them before
 * it parks and after each empty poll: an idle main lane (no live ticket, no main switch, a green or
 * red pick) ends the wait at once with the refusal line. Any other kind's wait never reads them.
 *
 * Every test runs the real daemon on its own store and an ephemeral port, never 4321.
 */

import './no-open.mjs';

import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aTicket, deckOnAPort } from '../testUtils.mjs';

const { waiterCount } = await import('../server.mjs');
const { wait } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/pilot');

async function deck(t) {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  return base;
}

/** The deck tools this test's waits call, by name, counted off `fetch` for the test's length. */
function toolCalls(t) {
  const names = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/api/tool') && typeof init?.body === 'string') names.push(JSON.parse(init.body).name);
    return real(url, init);
  };
  t.after(() => (globalThis.fetch = real));
  return names;
}

/** A wait as `kind` on this test's repository: its exit code and what it printed. */
async function waitAs(kind, more = {}) {
  const said = [];
  const code = await wait({ env: {}, repo: REPO, kind, timeoutMinutes: 0.01, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line), ...more });
  return { code, printed: said.join('') };
}

test('the record route carries the lanes', async (t) => {
  const base = await deck(t);
  const red = aTicket('Waiting', 'red');
  const answer = await fetch(`${base}/api/record?repo=${encodeURIComponent(REPO)}`);
  assert.equal(answer.status, 200);
  const { lanes } = await answer.json();
  assert.equal(lanes.refusal, `planning lane empty; ${red.id} is queued — deck_ticket take it first`);
  assert.equal(lanes.planning, `planning: empty → next ${red.id}`);
  assert.equal(lanes.coPilot, 'co-pilot: none');
});

for (const state of ['green', 'red']) {
  test(`the pilot's wait ends at once on an idle stage lane: ${state} queued`, async (t) => {
    await deck(t);
    const queued = aTicket('Waiting', state);
    const calls = toolCalls(t);
    const { code, printed } = await waitAs('pilot', { timeoutMinutes: 0.05 });
    assert.equal(code, 0);
    assert.match(printed, new RegExp(`^${state === 'red' ? 'planning' : 'concluding'} lane empty; ${queued.id} is queued — deck_ticket take it first$`, 'm'));
    assert.equal(calls.includes('deck_wait'), false, 'no deck_wait posted');
  });
}

test('the pilot\'s wait ends at once on an idle main lane: none queued parks', async (t) => {
  await deck(t); // an open yellow is the yellow lane's refusal (yellow-lane S1)
  const calls = toolCalls(t);
  const { code, printed } = await waitAs('pilot');
  assert.equal(code, 0);
  assert.match(printed, /NO REPLY after/);
  assert.doesNotMatch(printed, /(planning|concluding) lane empty/);
  assert.equal(calls.includes('deck_wait'), true, 'it parked');
});

test('the pilot\'s wait ends one poll after a ticket is queued mid-wait', async (t) => {
  await deck(t);
  const pending = waitAs('pilot', { timeoutMinutes: 0.2 });
  for (let i = 0; i < 400 && waiterCount() < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(waiterCount(), 1, 'the wait is parked before the ticket is queued');
  const queued = aTicket('Late', 'red');
  const { code, printed } = await pending;
  assert.equal(code, 0);
  assert.match(printed, new RegExp(`planning lane empty; ${queued.id} is queued`));
  assert.doesNotMatch(printed, /NO REPLY/);
});

/** A stand-in deck on an ephemeral port that answers the start-up check and `/api/record` with `status` and `body`. */
async function stubDeck(t, status, body) {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      if (request.url.startsWith('/api/record?')) return response.writeHead(status, { 'content-type': 'application/json' }).end(body);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(request.method === 'GET' ? '{"runs":[]}' : JSON.stringify({ content: [{ type: 'text', text: '{"items":[]}' }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  process.env.PILOT_DECK_PORT = String(server.address().port);
}

test('a refusal is printed as one line with no control characters, whatever the deck sends', async (t) => {
  await stubDeck(t, 200, JSON.stringify({ lanes: { refusal: 'main lane empty;\u001b[2J itm_x\nis queued\u0007 red' } }));
  const { code, printed } = await waitAs('pilot');
  assert.equal(code, 0);
  assert.match(printed, /^main lane empty; \[2J itm_x is queued red\n$/m);
  assert.doesNotMatch(printed, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
});

test('a record with no lanes refuses nothing: the wait parks', async (t) => {
  await stubDeck(t, 200, '{}');
  const { code, printed } = await waitAs('pilot');
  assert.equal(code, 0);
  assert.match(printed, /NO REPLY after/);
});

test('a long refusal is clipped to 200 characters', async (t) => {
  await stubDeck(t, 200, JSON.stringify({ lanes: { refusal: 'x'.repeat(500) } }));
  const { code, printed } = await waitAs('pilot');
  assert.equal(code, 0);
  assert.match(printed, /^x{200}\n$/m);
});

test('a lane read the deck will not answer refuses nothing and is the wait\'s exit 1', async (t) => {
  await stubDeck(t, 500, '{"error":"down"}');
  const { code, printed } = await waitAs('pilot');
  assert.equal(code, 1);
  assert.match(printed, /not answering \(the deck answered \/api\/record with 500\)/);
  assert.doesNotMatch(printed, /(planning|concluding) lane empty/);
});

test('an architect\'s wait parks beside a red pick', async (t) => {
  await deck(t);
  aTicket('Waiting', 'red');
  const { code, printed } = await waitAs('architect');
  assert.equal(code, 0);
  assert.match(printed, /NO REPLY after/);
  assert.doesNotMatch(printed, /(planning|concluding) lane empty/);
});
