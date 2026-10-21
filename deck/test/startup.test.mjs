/**
 * Slice S3: `initialize` answers first.
 *
 * The defect these tests pin is an ordering one, and it only exists between processes:
 * `deck/client.mjs` used to reach the network — poll for a daemon for ten seconds, then
 * register this session with a fetch that had no deadline at all — before it connected
 * the stdio transport, so the harness's very first frame went unanswered and the session
 * reported "Connection closed" while the deck was alive the whole time. Nothing about
 * that is visible from inside the module: you have to spawn the client as Claude Code
 * spawns it and speak MCP down its pipe, which is what the first test does.
 *
 * The rest are the ordering's consequences. Once the daemon work is beside the protocol
 * rather than in front of it, a tool call is what waits on it, so it has to be one piece
 * of work however many calls arrive at once, and neither of its two fetches may park for
 * ever — a tool call that never answers is a worse failure than a session that starts
 * late, because the agent has been handed a tool that looks like it works.
 *
 * Every test takes its own store directory and its own port. Nothing here may touch the
 * real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = path.join(ROOT, 'deck', 'client.mjs');

const { listItems, listRuns } = await import('../store.mjs');
const { START_TIMEOUT_MS } = await import('../client.mjs');
const { TOOLS } = await import('../server.mjs');

const EVERY_TOOL = TOOLS.map((tool) => tool.name);

// --- harness ---------------------------------------------------------------

/** Where this test's client looks for its deck. Never 4321. */
const pointAt = (t, port) => {
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(port);
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
};

/**
 * A port held by something that accepts a connection and then says nothing at all: a
 * daemon whose event loop is wedged, or any other process that got there first. It is
 * the case a deadline exists for.
 *
 * It is held for the whole file rather than per test, and that is not tidiness. A client
 * that finds nobody answering spawns a deck of its own, detached and unref'd so that it
 * outlives the session — which is the behaviour A2 wants and the last thing a test wants.
 * While this socket has the port, every such spawn loses the bind and exits; a port freed
 * between one test and the next is a port one of them would still be reaching for, and
 * the daemon that won it would outlive the whole run.
 */
const deafSockets = new Set();
const deafServer = net.createServer((socket) => {
  deafSockets.add(socket);
  // A peer killed mid-request — the child client below, while its health check was still
  // in flight — resets this socket, and an unhandled 'error' on it is an uncaught
  // exception in the test process. Nothing here ever reads or writes, so there is nothing
  // for an error to mean.
  socket.on('error', () => {});
  socket.on('close', () => deafSockets.delete(socket));
});
await new Promise((resolve) => deafServer.listen(0, '127.0.0.1', resolve));
const DEAF_PORT = deafServer.address().port;

after(() => {
  for (const socket of deafSockets) socket.destroy();
  return new Promise((resolve) => deafServer.close(resolve));
});

/** A deck that answers its health check but refuses every registration with a 500. */
async function deckThatRefusesToRegister(t) {
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ ok: true }));
    }
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'registration refused' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

/**
 * The client's cursor, its run and the promise that puts it on the deck are all module
 * state belonging to one session, and a session is one process — so a test that wants a
 * session of its own has to have a module of its own. The query string is what makes
 * Node load a second copy rather than hand back the first.
 */
let sessions = 0;
const freshClient = () => import(`../client.mjs?startup=${(sessions += 1)}`);

// --- the ordering ----------------------------------------------------------

test('a cold session answers initialize and lists the deck tools with no deck at all', async (t) => {
  const dir = tempDeck(t);

  // Spawned the way Claude Code spawns it, and spoken to the way Claude Code speaks to
  // it. The handshake is the assertion: before this slice the client polled a dead port
  // for ten seconds first, so `initialize` went unanswered until long after the harness
  // had given up on it.
  const agent = new Client({ name: 'cold-session', version: '0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLIENT],
    env: { ...process.env, PILOT_DECK_PORT: String(DEAF_PORT), PILOT_DECK_DIR: dir },
    stderr: 'ignore',
  });

  // Generous, because a request deadline here is only a way of not hanging for ever if
  // this regresses; what the test is about is the elapsed time below.
  const started = Date.now();
  let listed;
  try {
    await agent.connect(transport, { timeout: 20_000 });
    listed = await agent.listTools({}, { timeout: 20_000 });
  } finally {
    // Closed here rather than in an `after` hook, and before anything is asserted: the
    // child's own health check is still counting down, and a client killed while it waits
    // never gets as far as spawning the deck it would otherwise leave running.
    await agent.close();
  }
  const took = Date.now() - started;

  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    EVERY_TOOL,
    'the whole tool table is answered out of this process, with no daemon involved',
  );
  // The poll is what the handshake used to sit behind, so the poll is the threshold that
  // means anything. A bound tighter than this would be measuring how long Node takes to
  // boot on a machine running the rest of the suite beside it, which is not the claim.
  assert.ok(
    took < START_TIMEOUT_MS,
    `the handshake took ${took}ms, which is the daemon poll it was supposed to be ahead of`,
  );
});

test('a tool call waits for one ensure-then-register, however many arrive at once', async (t) => {
  const port = new URL(await deckOnAPort(t)).port;
  pointAt(t, port);
  const client = await freshClient();

  // Nothing registered this session up front any more, so the first tool call is what
  // does it — once, for all of them. Two calls that both registered would put this one
  // session on the deck as two runs, and the second would reset the cursor the first
  // had already taken.
  await Promise.all([
    client.callDeckTool('deck_post', { kind: 'question', title: 'Which port?', body: 'first' }),
    client.callDeckTool('deck_post', { kind: 'question', title: 'Which store?', body: 'second' }),
  ]);

  assert.equal(listRuns().length, 1, 'two tool calls, one run: the promise is made once');
  assert.deepEqual(
    listItems().filter((item) => item.kind !== 'chat').map((item) => item.repo),
    [process.cwd(), process.cwd()],
    'and both items carry the session repository, so the register really did finish first',
  );
});

// --- the two fetches that used to have no deadline -------------------------

test(
  'a health check against a socket that never answers gives up rather than parking the session',
  { timeout: 15_000 },
  async (t) => {
    pointAt(t, DEAF_PORT);
    const { isDeckUp } = await freshClient();

    const started = Date.now();
    const up = await isDeckUp();
    const took = Date.now() - started;

    assert.equal(up, false, 'a socket that says nothing is not a deck');
    assert.ok(took < 5000, `it gave up after ${took}ms rather than waiting for ever`);
  },
);

test(
  'a register against a socket that never answers gives up rather than parking the session',
  { timeout: 15_000 },
  async (t) => {
    pointAt(t, DEAF_PORT);
    const { registerSession } = await freshClient();

    // The deadline is an argument only so this test need not sit out the real one.
    const started = Date.now();
    await assert.rejects(
      () => registerSession(300),
      'the session is told it is not on the deck, rather than left waiting for ever',
    );
    const took = Date.now() - started;

    assert.ok(took < 3000, `it gave up after ${took}ms rather than waiting for ever`);
  },
);

test('ensureOnTheDeck resolves rather than rejects when registration fails, and logs it', async (t) => {
  const port = await deckThatRefusesToRegister(t);
  pointAt(t, port);
  const client = await freshClient();

  const loggedErrors = t.mock.method(console, 'error');

  await assert.doesNotReject(
    () => client.ensureOnTheDeck(),
    'a session that could not be put on the deck is still a working session',
  );
  assert.equal(
    loggedErrors.mock.calls.length,
    1,
    'the registration failure is not swallowed silently — it is logged once',
  );
});

// --- a failed join is not final (L8, ADR 0120) -----------------------------

test('a join that failed is tried again by the next call', async (t) => {
  pointAt(t, new URL(await deckOnAPort(t)).port);
  const client = await freshClient();
  const realFetch = globalThis.fetch;
  let refused = 0;
  t.mock.method(globalThis, 'fetch', (url, init) =>
    init?.method === 'POST' && String(url).endsWith('/api/runs') && refused++ === 0
      ? Promise.resolve(new Response('{}', { status: 500 }))
      : realFetch(url, init));
  t.mock.method(console, 'error', () => {});

  assert.equal(await client.ensureOnTheDeck(), false, 'the first register was refused');
  assert.equal(await client.ensureOnTheDeck(), true, 'and the next call tries again');
  assert.equal(listRuns().length, 1, 'one session, one run');
});

test('a joined session is not joined twice', async (t) => {
  pointAt(t, new URL(await deckOnAPort(t)).port);
  const client = await freshClient();

  assert.equal(await client.ensureOnTheDeck(), true);
  assert.equal(await client.ensureOnTheDeck(), true);
  assert.equal(listRuns().length, 1, 'a success is remembered: the second call registers nothing');
});

test('startup gives up after JOIN_ATTEMPTS', async (t) => {
  const { JOIN_ATTEMPTS } = await freshClient();
  // A deck that is healthy, so nothing is spawned, and refuses and counts every register.
  let registers = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/api/health') return response.end(JSON.stringify({ ok: true, pid: process.pid, version: PLUGIN_VERSION }));
    if (request.method === 'POST' && request.url === '/api/runs') registers += 1;
    response.writeHead(500).end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // Startup is `main`, so the client is spawned as Claude Code spawns it.
  const session = spawn(process.execPath, [CLIENT], {
    env: { ...process.env, PILOT_DECK_PORT: String(server.address().port), PILOT_DECK_DIR: tempDeck(t) },
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  session.stderr.on('data', (chunk) => (stderr += chunk));
  t.after(() => session.kill());
  const logged = () => stderr.split('\n').filter((line) => line.includes('not on the deck')).length;

  const deadline = Date.now() + START_TIMEOUT_MS; // a regression fails here, with stderr, not at the runner's timeout
  while (logged() < JOIN_ATTEMPTS && session.exitCode === null && Date.now() < deadline) await sleep(50);
  await sleep(500); // and then nothing more
  assert.equal(registers, JOIN_ATTEMPTS, 'startup made exactly JOIN_ATTEMPTS register attempts');
  assert.equal(logged(), JOIN_ATTEMPTS, `each refused try is logged; stderr was:\n${stderr}`);
  assert.equal(session.exitCode, null, 'giving up is not a crash: the session is still serving');
});
