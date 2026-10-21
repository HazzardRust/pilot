/**
 * daemon-lifecycle S4 (spec 4, 5; L3, L4, L11): a session replaces an older deck.
 *
 * A session that finds a deck older than its own plugin asks it to exit through the deck's
 * own `POST /api/exit`, and the deck decides: it goes only for a newer caller and never
 * under a running landing. A deck from before the route (0.9.1 reports no version) is
 * stopped by pid, and only once the process table shows that pid running `deck/daemon.mjs`.
 *
 * Every test takes its own store directory and its own port. Nothing here may touch the
 * real store or port 4321: this machine runs a real deck. Every process a test starts, and
 * every deck a client starts on its port, is killed by pid when the test ends.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, freePort, tempDeck } from '../testUtils.mjs';
import { exitRoute } from '../exit-route.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

const DAEMON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon.mjs');
const { START_TIMEOUT_MS } = await import('../client.mjs');

// --- harness ---------------------------------------------------------------

const setEnv = (t, name, value) => {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};

let sessions = 0;
const freshClient = () => import(`../client.mjs?replace=${(sessions += 1)}`);

const healthAt = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== 'ESRCH';
  }
};

const killed = async (pid) => {
  try {
    process.kill(pid);
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
  for (let tries = 0; tries < 50 && alive(pid); tries += 1) await sleep(100);
};

/** A store and a port of this test's own, with whatever deck answers there at the end killed. */
async function aPort(t) {
  tempDeck(t);
  const port = await freePort();
  setEnv(t, 'PILOT_DECK_PORT', String(port));
  t.after(async () => {
    const pid = (await healthAt(port))?.pid;
    if (pid !== undefined && pid !== process.pid) await killed(pid);
  });
  return port;
}

/**
 * A deck stand-in in this process: health reports `version` (none when undefined) and this
 * process's pid; `/api/exit` is answered by `onExit`, and every request to it is counted.
 */
async function aStandIn(t, port, { version, onExit = (request, response) => response.writeHead(404).end() }) {
  const seen = { exits: 0 };
  const server = http.createServer((request, response) => {
    if (request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ ok: true, pid: process.pid, ...(version && { version }) }));
    }
    if (request.method === 'POST' && request.url === '/api/exit') {
      seen.exits += 1;
      return onExit(request, response, server);
    }
    return response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  }));
  return seen;
}

/** Waits until a deck other than `not` answers on `port`, and returns its pid. */
async function newPidOn(port, not) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pid = (await healthAt(port))?.pid;
    if (pid !== undefined && pid !== not) return pid;
    await sleep(100);
  }
  return undefined;
}

/** console.error's lines while `run` runs. */
async function stderrOf(t, run) {
  const lines = [];
  const mock = t.mock.method(console, 'error', (...args) => lines.push(args.join(' ')));
  try {
    return { result: await run(), lines };
  } finally {
    mock.mock.restore();
  }
}

const postExit = (base, version, headers = {}) =>
  fetch(`${base}/api/exit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer(), ...headers },
    body: JSON.stringify({ version }),
  });

// --- the client ------------------------------------------------------------

test('an older deck is asked once and replaced', { timeout: 30_000 }, async (t) => {
  const port = await aPort(t);
  let asked;
  const seen = await aStandIn(t, port, {
    version: '0.9.0',
    onExit: (request, response, server) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        asked = JSON.parse(body);
        response.writeHead(202, { 'content-type': 'application/json' }).end('{"ok":true}', () => {
          server.closeAllConnections();
          server.close();
        });
      });
    },
  });
  const client = await freshClient();

  const result = await client.replaceOlder({ pid: process.pid, version: '0.9.0' });

  assert.equal(result, 'replaced');
  assert.equal(seen.exits, 1, 'the old deck was asked to exit once');
  assert.deepEqual(asked, { version: PLUGIN_VERSION }, 'the request names the caller\'s version');
  assert.equal(await client.ensureDaemon(), true, 'a session starts its own deck after');
  assert.ok(await newPidOn(port, process.pid), 'health answers a new pid');
});

test('what a peer sends never reaches stderr raw', async (t) => {
  await aPort(t);
  const client = await freshClient();
  const hostile = { pid: 1, version: '0.9.0\n[deck] forged \x1b[2J' };

  const { result, lines } = await stderrOf(t, () =>
    client.replaceOlder(hostile, { post: async () => ({ status: 409, error: `no\r\n\x1b[31m${'x'.repeat(500)}` }) }));

  assert.equal(result, 'kept');
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /[\x00-\x1f\x7f-\x9f]/);
  assert.ok(lines[0].length < 300, 'the peer text is capped');
});

/**
 * Starts a node process shaped like a 0.9.1 daemon: a `<root>/deck/daemon.mjs` whose health names a
 * pid and no version, with `<root>/bin/pilot.mjs` beside it only when `pilot` is true.
 */
function plant(t, { pilot }) {
  const root = fs.mkdtempSync(path.join(process.env.PILOT_DECK_DIR, 'old-'));
  const old = path.join(root, 'deck', 'daemon.mjs');
  fs.mkdirSync(path.dirname(old), { recursive: true });
  fs.writeFileSync(old, [
    "import http from 'node:http';",
    'http.createServer((q, s) => s.writeHead(200, { "content-type": "application/json" })',
    '  .end(JSON.stringify({ ok: true, pid: process.pid }))).listen(Number(process.env.PILOT_DECK_PORT), "127.0.0.1");',
    '',
  ].join('\n'));
  if (pilot) {
    fs.mkdirSync(path.join(root, 'bin'));
    fs.writeFileSync(path.join(root, 'bin', 'pilot.mjs'), '');
  }
  return aChild(t, [old]);
}

const aChild = (t, args) => {
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'ignore', windowsHide: true });
  t.after(() => killed(child.pid));
  return child;
};

test('an unversioned deck is stopped by pid', { timeout: 30_000 }, async (t) => {
  const port = await aPort(t);
  const child = plant(t, { pilot: true });
  assert.equal(await newPidOn(port, undefined), child.pid, 'the planted deck answers');
  const client = await freshClient();

  const result = await client.replaceOlder({ pid: child.pid });

  assert.equal(result, 'replaced');
  // Its exit event, not `kill(pid, 0)`: on Linux a killed child stays a zombie that signal 0 still
  // finds until this process reaps it, which can be a turn after the port is free.
  const gone = child.exitCode !== null || child.signalCode !== null
    || (await Promise.race([once(child, 'exit').then(() => true), sleep(5000).then(() => false)]));
  assert.equal(gone, true, 'the planted deck is gone');
  assert.equal(await client.ensureDaemon(), true);
  const pid = await newPidOn(port, child.pid);
  assert.ok(pid && pid !== child.pid, 'a new pid serves');
});

test('a pid that is not a deck is never killed', async (t) => {
  await aPort(t);
  const client = await freshClient();
  const kills = [];
  const kill = (pid) => kills.push(pid);

  const elsewhere = await stderrOf(t, () =>
    client.replaceOlder({ pid: 4242 }, { table: () => [{ pid: 4242, name: 'node.exe', command: 'node C:/tools/server.mjs' }, { pid: 7, name: 'node.exe', command: 'node C:/x/deck/daemon.mjs' }], kill }),
  );
  // A command line that only names the daemon is not one: an editor, a grep.
  const mentions = await client.replaceOlder({ pid: 4242 }, { table: () => [{ pid: 4242, name: 'Code.exe', command: 'Code.exe C:/x/deck/daemon.mjs' }], kill });
  const absent = await client.replaceOlder({ pid: 4242 }, { table: () => [], kill });
  const unreadable = await client.replaceOlder({ pid: 4242 }, { table: () => { throw new Error('no ps'); }, kill });

  assert.equal(elsewhere.result, 'kept');
  assert.equal(mentions, 'kept', 'a process that is not node running the daemon is no deck');
  assert.equal(absent, 'kept');
  assert.equal(unreadable, 'kept');
  assert.deepEqual(kills, [], 'kill is never called');
  assert.equal(elsewhere.lines.length, 1, 'one line says why the deck was kept');
});

test('a node process that only names a daemon, or runs another project\'s, is never killed', { timeout: 30_000 }, async (t) => {
  const port = await aPort(t);
  const named = aChild(t, ['-e', 'setInterval(() => {}, 1e3)', '--', '--log=deck/daemon.mjs']);
  const foreign = plant(t, { pilot: false });
  assert.equal(await newPidOn(port, undefined), foreign.pid, 'the other project\'s daemon answers');
  const client = await freshClient();
  const kills = [];
  const kill = (pid) => kills.push(pid);

  const results = [await client.replaceOlder({ pid: named.pid }, { kill }), await client.replaceOlder({ pid: foreign.pid }, { kill })];

  assert.deepEqual(results, ['kept', 'kept']);
  assert.deepEqual(kills, [], 'kill is never called');
  assert.equal(alive(named.pid) && alive(foreign.pid), true, 'both still run');
});

test('a same or newer deck keeps serving', async (t) => {
  for (const version of [PLUGIN_VERSION, '99.0.0']) {
    await t.test(version, async (t) => {
      const port = await aPort(t);
      const seen = await aStandIn(t, port, { version });
      const client = await freshClient();

      assert.equal(await client.ensureDaemon(), true);

      assert.equal(seen.exits, 0, 'no exit request');
      assert.equal((await healthAt(port))?.pid, process.pid, 'the pid is unchanged');
    });
  }
});

test('a landing keeps the old deck', async (t) => {
  const port = await aPort(t);
  const exits = [];
  // The real route with a landing running: a stand-in whose /api/exit is `exitRoute` itself.
  const seen = await aStandIn(t, port, {
    version: '0.9.0',
    onExit: (request, response) => exitRoute(request, response, { exit: () => exits.push(1), landings: () => 1, own: '0.9.0' }),
  });
  const client = await freshClient();

  const { result, lines } = await stderrOf(t, () => client.ensureDaemon());

  assert.equal(result, true, 'the session uses the old deck');
  assert.equal(seen.exits, 1);
  assert.deepEqual(exits, [], 'the deck did not exit');
  assert.equal(lines.length, 1, `one stderr line: ${lines.join(' | ')}`);
  assert.match(lines[0], /landing/);
  assert.equal((await healthAt(port))?.pid, process.pid, 'the pid is unchanged');
});

// --- the route -------------------------------------------------------------

test('the exit route refuses an older caller', async (t) => {
  const exits = [];
  const base = await deckOnAPort(t, { exit: () => exits.push(1) });
  const [major, minor, patch] = PLUGIN_VERSION.split('.').map(Number);

  for (const version of [PLUGIN_VERSION, `${major}.${minor}.${Math.max(0, patch - 1)}`, '0.0.1']) {
    const response = await postExit(base, version);
    assert.equal(response.status, 409, `${version} is refused`);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const foreign = await postExit(base, '99.0.0', { origin: 'http://evil.example' });
  assert.equal(foreign.status, 403, 'a cross-site exit is refused');
  const unreadable = await postExit(base, 'latest');
  assert.equal(unreadable.status, 400, 'a version that is not x.y.z is refused');
  assert.deepEqual(exits, [], 'none of them ran exit');

  const newer = await postExit(base, '99.0.0');
  assert.equal(newer.status, 202);
  assert.deepEqual(await newer.json(), { ok: true });
  await sleep(50);
  assert.deepEqual(exits, [1], 'a newer caller runs exit once');
});

test('a newer caller stops the daemon through its shutdown', { timeout: 30_000 }, async (t) => {
  const port = await aPort(t);
  const child = spawn(process.execPath, [DAEMON], { env: process.env, stdio: 'ignore', windowsHide: true });
  t.after(() => killed(child.pid));
  const closed = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  assert.equal(await newPidOn(port, undefined), child.pid);

  const response = await postExit(`http://127.0.0.1:${port}`, '99.0.0');

  assert.equal(response.status, 202);
  assert.equal(await closed, 0, 'the daemon closed the way a signal closes it');
  assert.equal(await healthAt(port), null, 'nothing answers the port');
});
