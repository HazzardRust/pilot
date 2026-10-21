/**
 * session-row S1: a session that registers again keeps its run (spec 1-2, L1, L2, A1).
 *
 * A client whose register timed out after the store had already written the row
 * registers again. With the same session key, pid and repository that is the same
 * run: the id, `startedAt`, feature name and slice table stay, and only `lastSeenAt`
 * moves. A new session that the OS gave a dead session's pid is a fresh row.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { listRuns, listStoredRuns, registerRun, setSlices } = await import('../store.mjs');

const REPO = 'D:\\work\\alpha';

test('a second register with the same key keeps the row and its id', async (t) => {
  tempDeck(t);

  const first = registerRun({ repo: REPO, pid: process.pid, session: 'key-one' });
  setSlices(first.id, [{ slice: '1 the skeleton', state: 'doing' }], 'session-row');
  await delay(5);
  const again = registerRun({ repo: REPO, pid: process.pid, session: 'key-one' });

  const runs = listStoredRuns();
  assert.equal(runs.length, 1, 'one session is one row');
  const [row] = runs;
  assert.equal(again.id, first.id, 'the retry answers the run the first register made');
  assert.equal(row.id, first.id);
  assert.equal(row.startedAt, first.startedAt);
  assert.equal(row.feature, 'session-row', 'the name the pilot gave it survives the retry');
  assert.deepEqual(
    row.slices.map((slice) => slice.slice),
    ['1 the skeleton'],
    'and so does its table',
  );
  assert.ok(row.lastSeenAt > first.lastSeenAt, 'only lastSeenAt moves');
});

test('a reused pid with a new key is a fresh row', (t) => {
  tempDeck(t);

  const old = registerRun({ repo: REPO, pid: process.pid, session: 'key-one' });
  setSlices(old.id, [{ slice: '1 the skeleton', state: 'doing' }], 'session-row');
  const fresh = registerRun({ repo: REPO, pid: process.pid, session: 'key-two' });

  const runs = listStoredRuns();
  assert.notEqual(fresh.id, old.id, 'a new session is a new run');
  assert.deepEqual(runs.map((run) => run.id), [fresh.id], 'the dead session row is replaced');
  assert.deepEqual(runs[0].slices ?? [], [], 'and its table went with it');
});

test('the same key from another pid or another repository is a fresh row', (t) => {
  tempDeck(t);

  const old = registerRun({ repo: REPO, pid: process.pid, session: 'key-one' });
  const otherPid = registerRun({ repo: REPO, pid: process.pid + 1, session: 'key-one' });
  assert.notEqual(otherPid.id, old.id, 'another pid is another session');
  const otherRepo = registerRun({ repo: 'D:\\work\\beta', pid: process.pid, session: 'key-one' });
  assert.notEqual(otherRepo.id, old.id, 'another repository is another run');
  assert.notEqual(otherRepo.id, otherPid.id);
});

test('a register without a key is replaced as today', (t) => {
  tempDeck(t);

  const old = registerRun({ repo: REPO, pid: process.pid });
  const again = registerRun({ repo: REPO, pid: process.pid });

  assert.notEqual(again.id, old.id, 'an older client keeps the old behaviour (L2)');
  assert.deepEqual(listStoredRuns().map((run) => run.id), [again.id]);
});

test('a session key that is not a short string is refused', (t) => {
  tempDeck(t);

  for (const session of [42, '', '   ', 'a b', '<b>', 'x'.repeat(201)]) {
    assert.throws(
      () => registerRun({ repo: REPO, pid: process.pid, session }),
      (err) => err.name === 'DeckRefusal' && /session/.test(err.message) && !err.message.includes('xxxx'),
      `refused: ${JSON.stringify(session).slice(0, 20)}`,
    );
  }
  assert.equal(listStoredRuns().length, 0, 'nothing written for a refused register');
});

test('a register retried over HTTP answers the same run', async (t) => {
  const base = await deckOnAPort(t);
  const register = () =>
    fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: process.cwd(), pid: process.pid, session: 'key-http' }),
    });

  const first = await register();
  const second = await register();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const one = (await first.json()).run;
  const two = (await second.json()).run;
  assert.equal(two.id, one.id, 'the retry answers the run the first post made');
  const { runs } = await (await fetch(`${base}/api/runs`)).json();
  assert.deepEqual(runs.map((run) => run.id), [one.id], 'and the deck lists one row');
  assert.equal(listRuns().length, 1);
});

test("a session's key is the same at every register", async (t) => {
  // A stand-in deck that records what each register sends, so the body itself is the subject.
  const bodies = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ run: { id: 'run_stub', repo: body.repo, pid: body.pid }, seq: 0 }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });

  const client = await import('../client.mjs?register-again');
  await client.registerSession();
  await client.registerSession();

  assert.equal(bodies.length, 2);
  assert.equal(typeof bodies[0].session, 'string');
  assert.ok(bodies[0].session.length > 0, 'the first register sends a key');
  assert.equal(bodies[1].session, bodies[0].session, 'and the second sends the same one');
});
