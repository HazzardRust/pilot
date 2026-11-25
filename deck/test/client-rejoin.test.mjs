/**
 * daemon-lifecycle S3 (spec 6): a session whose deck went away rejoins on its next call.
 *
 * A session joins once, and the join is memoised. Before this slice a deck that crashed
 * or idled out under a joined session left the memo standing, so every later call went
 * to a port nobody held and failed for the rest of the session. Now a call refused at
 * the socket forgets the join, joins once more under ADR 0120's cap, and retries once.
 *
 * Every test takes its own store directory and its own port. Nothing here may touch the
 * real store or port 4321: this machine runs a real deck. A daemon a test spawns is
 * leashed to this process (any port but 4321 leashes to the parent), and each one is
 * killed by pid when its test ends as well.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { freePort, tempDeck } from '../testUtils.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

const { JOIN_ATTEMPTS } = await import('../client.mjs');

// --- harness ---------------------------------------------------------------

/** Sets `name` in this process's environment, which every daemon a client spawns inherits, until the test ends. */
const setEnv = (t, name, value) => {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};

/** A session of its own: the join, the cursor and the start counter are module state. */
let sessions = 0;
const freshClient = () => import(`../client.mjs?rejoin=${(sessions += 1)}`);

const healthAt = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

const killed = async (pid) => {
  try {
    process.kill(pid);
    for (let tries = 0; tries < 50; tries += 1) {
      await sleep(100);
      process.kill(pid, 0);
    }
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
};

/**
 * The deck a session first joined, answering health and the register as a current deck does, under a pid
 * no process holds (cheap-suite S7: one daemon per test, the rejoin's). Its `close` is the deck dying: the
 * port refuses, which is all the client sees of a crash.
 */
async function aFirstDeck(t, port) {
  const pid = 2 ** 22 + 1;
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    // No kept-alive socket outlives the close, as none outlives a daemon's exit by the time it is waited for.
    response.setHeader('connection', 'close');
    if (request.url === '/api/health') return response.end(JSON.stringify({ ok: true, pid, version: PLUGIN_VERSION }));
    if (request.method === 'POST' && request.url === '/api/runs') {
      return response.end(JSON.stringify({ run: { id: 'r1', repo: process.cwd() }, seq: 0 }));
    }
    response.writeHead(404).end(JSON.stringify({ error: 'not the first deck' }));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const close = () => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve())));
  t.after(() => server.listening && close());
  return { pid, close };
}

/** A joined session whose deck has just died: the client, the port and the dead deck's pid. */
async function aSessionWhoseDeckDied(t) {
  tempDeck(t);
  const port = await freePort();
  setEnv(t, 'PILOT_DECK_PORT', String(port));
  const first = await aFirstDeck(t, port);
  const client = await freshClient();
  assert.equal(await client.ensureOnTheDeck(), true, 'the session joined the first deck');
  await first.close();
  const dead = first.pid;
  // The deck the rejoin starts is detached from this test; end it with the test.
  t.after(async () => {
    const pid = (await healthAt(port))?.pid;
    if (pid !== undefined && pid !== process.pid) await killed(pid);
  });
  return { client, port, dead };
}

// --- the rejoin ------------------------------------------------------------

test('a call after the deck died answers from a new deck', { timeout: 30_000 }, async (t) => {
  const { client, port, dead } = await aSessionWhoseDeckDied(t);

  const result = await client.callDeckTool('deck_read', {});

  assert.notEqual(result.isError, true, 'the call is answered, not failed');
  assert.ok(Array.isArray(JSON.parse(result.content[0].text).items), 'and answered by a deck');
  const health = await healthAt(port);
  assert.ok(health, 'a deck is up on the port again');
  assert.notEqual(health.pid, dead, 'and it is a new one');
});

test('the session registers again on the new deck', { timeout: 30_000 }, async (t) => {
  const { client, port } = await aSessionWhoseDeckDied(t);
  const realFetch = globalThis.fetch;
  let registers = 0;
  t.mock.method(globalThis, 'fetch', (url, init) => {
    if (init?.method === 'POST' && String(url).endsWith('/api/runs')) registers += 1;
    return realFetch(url, init);
  });

  // Two calls refused together rejoin as one session, not one each.
  await Promise.all([client.callDeckTool('deck_read', {}), client.callDeckTool('deck_read', {})]);

  assert.equal(registers, 1, 'one register for both calls');

  const { runs } = await (await fetch(`http://127.0.0.1:${port}/api/runs?live=1`, { headers: bearer() })).json();
  assert.ok(
    runs.some((run) => run.pid === process.pid),
    `the new deck lists this session as live; it listed ${JSON.stringify(runs.map((run) => run.pid))}`,
  );
});

// --- the cap (ADR 0120) ----------------------------------------------------

// Each start here fails, so each is waited out: at a 1 s budget, not the 10 s default (cheap-suite S7).
const CAP_BUDGET = { startTimeoutMs: 1000 };

test('the rejoin never passes three starts', { timeout: 4 * CAP_BUDGET.startTimeoutMs + 15_000 }, async (t) => {
  const dir = tempDeck(t);
  setEnv(t, 'PILOT_DECK_PORT', String(await freePort()));
  // Every daemon a client spawns inherits this, so each start is counted and then fails.
  const counter = path.join(dir, 'starts.log');
  const hook = path.join(dir, 'count-start.mjs');
  fs.writeFileSync(hook, `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(counter)}, 'start\\n');\nprocess.exit(1);\n`);
  setEnv(t, 'NODE_OPTIONS', `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(hook).href}`.trim());
  const starts = () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0);
  t.mock.method(console, 'error', () => {});
  const client = await freshClient();

  // Two calls spend the three starts: each joins at its top, and the first rejoins once more.
  const call = () => client.callDeckTool('deck_read', {}, undefined, undefined, CAP_BUDGET);
  await assert.rejects(call, 'no deck: the call is a tool error');
  await assert.rejects(call, 'still no deck');
  assert.equal(starts(), JOIN_ATTEMPTS, 'three starts were made');

  await assert.rejects(call, 'past the cap the call is a tool error');
  await sleep(500);
  assert.equal(starts(), JOIN_ATTEMPTS, 'and no fourth daemon is spawned');
});

// --- the start budget (cheap-suite S7) ---------------------------------------

test('the client gives up at its injected budget', { timeout: 15_000 }, async (t) => {
  tempDeck(t);
  setEnv(t, 'PILOT_DECK_PORT', String(await freePort()));
  const lines = [];
  t.mock.method(console, 'error', (...args) => lines.push(args.join(' ')));
  // A start that never serves: the spawn is a process that never binds the port.
  const spawnProcess = () => Object.assign(new EventEmitter(), { unref() {} });
  const client = await freshClient();

  const started = Date.now();
  const up = await client.ensureDaemon({ resolve: () => ({ root: os.tmpdir(), version: PLUGIN_VERSION }), spawnProcess, startTimeoutMs: 1000 });
  const took = Date.now() - started;

  assert.equal(up, false, 'no deck answered');
  assert.ok(took < 3000, `it gave up at its budget, not the default; it took ${took}ms`);
  assert.ok(took >= 1000, `and not before it; it took ${took}ms`);
  assert.ok(lines.some((line) => line.includes('after 1000ms')), `the line names the budget; stderr was ${JSON.stringify(lines)}`);
});

// --- what is not a dead deck -----------------------------------------------

test('a refusal is not a reason to rejoin', async (t) => {
  tempDeck(t);
  let registers = 0;
  let status = 400;
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/health') return response.end(JSON.stringify({ ok: true, pid: process.pid, version: PLUGIN_VERSION }));
    if (request.method === 'POST' && request.url === '/api/runs') {
      registers += 1;
      return response.end(JSON.stringify({ run: { id: 'r1', repo: process.cwd() }, seq: 0 }));
    }
    response.writeHead(status).end(JSON.stringify({ error: `refused with ${status}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  setEnv(t, 'PILOT_DECK_PORT', String(server.address().port));
  const client = await freshClient();

  await assert.rejects(() => client.callDeckTool('deck_read', {}), /refused with 400/, 'a 400 is the error it was');
  status = 500;
  await assert.rejects(() => client.callDeckTool('deck_read', {}), /refused with 500/, 'and so is a 500');
  assert.equal(registers, 1, 'one join, and no new one for an answer the deck gave');
});
