/**
 * `pilot landing <gate2>` and `GET /api/landing` (gate2-lands S3; spec 2; L7, L8, L14). The pilot
 * no longer runs `pilot land` at step 9: the deck lands on the Sign off press, and the pilot reads
 * the landing through this route until it settles. A read and nothing more: it marks no reply
 * delivered, which is why it is a route of its own and never `deck_read`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { KIND_GATE2 } from '../items.mjs';
import { landing, main } from '../landing-wait.mjs';
import { LANDING_INTERRUPTED, beginLanding, interruptLandings, postItem, settleLanding } from '../store.mjs';
import { deckOnAPort, withTicket } from '../testUtils.mjs';

const REPO = 'D:/work/pilot-landing-wait';

const aGate2 = () =>
  postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, ...withTicket({ pr: '#250', sha: '0305827' }, REPO, 'yellow') });

/** A deck of the test's own, and `pilot landing` pointed at it. */
async function deck(t) {
  const base = await deckOnAPort(t);
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => (before === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = before)));
  return base;
}

/** What `pilot landing` printed, each stream on its own, and how it exited. */
async function run(id, options = {}) {
  const out = [];
  const err = [];
  const code = await landing(id, { pollMs: 10, say: (line) => out.push(line), warn: (line) => err.push(line), ...options });
  return { code, out: out.join(''), err: err.join('') };
}

const LANDED = 'landed feat/x on pilot at 0a1b2c3\nmain gets pilot: unknown (no GitHub origin)';

test('GET /api/landing answers the stored state and line, and 404 for a non-gate2', async (t) => {
  const base = await deck(t);
  const gate = aGate2();
  const read = async (id) => {
    const response = await fetch(`${base}/api/landing?id=${encodeURIComponent(id)}`);
    return { status: response.status, body: await response.json() };
  };

  assert.deepEqual(await read(gate.id), { status: 200, body: { state: 'none' } });
  beginLanding(gate.id, { worktree: 'D:/work/feat-x' });
  assert.deepEqual(await read(gate.id), { status: 200, body: { state: 'running' } });
  settleLanding(gate.id, { ok: true, sha: '0a1b2c3', line: LANDED });
  assert.deepEqual(await read(gate.id), { status: 200, body: { state: 'landed', line: LANDED } });

  const question = postItem({ kind: 'question', title: 'A or B', body: 'A or B', repo: REPO });
  assert.equal((await read(question.id)).status, 404, 'a question is no gate2');
  assert.equal((await read('itm_nosuchthing')).status, 404, 'an unknown id');
  assert.equal((await fetch(`${base}/api/landing`)).status, 404, 'no id at all');
});

test('pilot landing prints the landed line and exits 0 once a running landing settles', async (t) => {
  await deck(t);
  const gate = aGate2();
  beginLanding(gate.id, { worktree: 'D:/work/feat-x' });
  setTimeout(() => settleLanding(gate.id, { ok: true, sha: '0a1b2c3', line: LANDED }), 60);

  const { code, out, err } = await run(gate.id);
  assert.equal(code, 0);
  assert.equal(out, `${LANDED}\n`);
  assert.equal(err, '');
});

test('pilot landing waits through a landing not yet begun', async (t) => {
  await deck(t);
  const gate = aGate2();
  setTimeout(() => settleLanding(gate.id, { ok: true, sha: '0a1b2c3', line: LANDED }), 60);
  assert.equal((await run(gate.id)).code, 0);
});

test('pilot landing exits 1 with the NOT landed line', async (t) => {
  await deck(t);
  const gate = aGate2();
  const line = 'NOT landed: the worktree D:/work/feat-x is gone; nothing run';
  settleLanding(gate.id, { ok: false, line });

  const { code, out, err } = await run(gate.id);
  assert.equal(code, 1);
  assert.equal(out, `${line}\n`);
  assert.equal(err, '');
});

test('pilot landing exits 1 on a landing a restarted deck read as interrupted', async (t) => {
  await deck(t);
  const gate = aGate2();
  beginLanding(gate.id, { worktree: 'D:/work/feat-x' });
  interruptLandings();

  const { code, out } = await run(gate.id, { timeoutMinutes: 0.002 });
  assert.equal(code, 1);
  assert.equal(out, `${LANDING_INTERRUPTED}
`, 'not a wait until the timeout');
});

test('pilot landing exits 1 naming the state when the landing has not settled by its timeout', async (t) => {
  await deck(t);
  const gate = aGate2();
  beginLanding(gate.id, { worktree: 'D:/work/feat-x' });

  const { code, out } = await run(gate.id, { timeoutMinutes: 0.002 });
  assert.equal(code, 1);
  assert.match(out, /^NOT settled: the landing of itm_\w+ is still running after 0\.002 minutes; the deck carries on with it\n$/);
});

test('pilot landing exits 2 with one stderr line when the deck is down', async (t) => {
  // A port that was just free: nothing answers on it.
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(port);
  t.after(() => (before === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = before)));

  const { code, out, err } = await run('itm_0123456789ab');
  assert.equal(code, 2);
  assert.equal(out, '');
  assert.equal(err.split('\n').length, 2, 'one line');
  assert.match(err, /^pilot landing: the deck at http:\/\/127\.0\.0\.1:\d+ is not answering/);
});

test('pilot landing exits 2 for an id that is no gate2', async (t) => {
  await deck(t);
  const { code, out, err } = await run('itm_nosuchthing');
  assert.equal(code, 2);
  assert.equal(out, '');
  assert.equal(err, 'pilot landing: itm_nosuchthing is no gate2 on this deck\n');
});

test('pilot landing wants exactly one gate2 id and takes no --timeout', async (t) => {
  await deck(t);
  const warned = [];
  const io = { say: () => {}, warn: (line) => warned.push(line) };
  assert.equal(await main([], io), 2);
  assert.equal(await main(['itm_a', 'itm_b'], io), 2);
  warned.length = 0;
  assert.equal(await main(['itm_a', '--timeout', '5'], io), 2);
  assert.match(warned.join(''), /^pilot landing: there is no "--timeout" option\nusage: pilot landing <gate2-id>\n$/);
});

test('pilot landing <id> from the command line prints the landed line and exits 0', async (t) => {
  await deck(t);
  const gate = aGate2();
  settleLanding(gate.id, { ok: true, sha: '0a1b2c3', line: LANDED });
  const out = [];
  assert.equal(await main([gate.id], { say: (line) => out.push(line), warn: () => {} }), 0);
  assert.equal(out.join(''), `${LANDED}\n`);
});

/** A raw deck that answers `/api/landing` from `answers` in turn, the last one for good. */
async function stub(t, answers) {
  let asked = 0;
  const server = http.createServer((request, response) => {
    const [status, body] = answers[Math.min(asked, answers.length - 1)];
    asked += 1;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(() => {
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return () => asked;
}

test('pilot landing rides out two failed reads in a row and gives up on the third', async (t) => {
  const landed = JSON.stringify({ state: 'landed', line: LANDED });
  const asked = await stub(t, [[500, '{}'], [503, '{}'], [200, landed]]);
  assert.equal((await run('itm_0123456789ab')).code, 0);
  assert.equal(asked(), 3);

  const down = await stub(t, [[500, '{}']]);
  const { code, err } = await run('itm_0123456789ab');
  assert.equal(code, 2);
  assert.equal(down(), 3);
  assert.equal(err, 'pilot landing: the deck answered /api/landing with 500\n');
});

test('pilot landing exits 2 on an answer that is no landing', async (t) => {
  await stub(t, [[200, 'null']]);
  const { code, err } = await run('itm_0123456789ab');
  assert.equal(code, 2);
  assert.equal(err, 'pilot landing: the deck answered /api/landing with something that is no landing\n');
});

test('pilot landing refuses an option it does not know', async () => {
  const warned = [];
  assert.equal(await main(['itm_a', '--timout', '5'], { say: () => {}, warn: (line) => warned.push(line) }), 2);
  assert.match(warned.join(''), /^pilot landing: there is no "--timout" option\n/);
});
