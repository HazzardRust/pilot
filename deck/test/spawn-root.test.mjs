/**
 * deck-spawn-root S1 (spec 1-5; L2-L4): a deck is spawned from the installed plugin.
 *
 * `spawnRoot` is the one place the spawn root and its version are decided; `ensureDaemon`
 * and `replaceOlder` take that root's version as "older". Every test builds its roots in
 * temp dirs and injects the lookup, so no test asks `claude`. The client tests take their
 * own store and port: nothing here may touch the real store or port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { freePort, tempDeck } from '../testUtils.mjs';
import { spawnRoot } from '../spawn-root.mjs';
import { DECK_PORT } from '../tools.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

// --- harness ---------------------------------------------------------------

/** A temp plugin root with `package.json` at `version`, and `.git` when `checkout`. */
function aRoot(t, { version = '1.2.3', checkout = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pilot', version }));
  if (checkout) fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

const never = () => {
  throw new Error('the lookup was called');
};

const setEnv = (t, name, value) => {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};

let sessions = 0;
const freshClient = () => import(`../client.mjs?spawn-root=${(sessions += 1)}`);

/** A store and a port of this test's own, with any other process's deck answering there at the end killed. */
async function aPort(t) {
  tempDeck(t);
  const port = await freePort();
  setEnv(t, 'PILOT_DECK_PORT', String(port));
  t.after(async () => {
    const pid = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) })
      .then((response) => response.json()).then((health) => health.pid, () => undefined);
    if (pid !== undefined && pid !== process.pid) process.kill(pid);
  });
  return port;
}

/** A deck stand-in in this process whose health reports `version`; exit requests are counted. */
async function aStandIn(t, port, version) {
  const seen = { exits: 0, bodies: [] };
  const server = http.createServer((request, response) => {
    if (request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ ok: true, pid: process.pid, version }));
    }
    if (request.method === 'POST' && request.url === '/api/exit') {
      seen.exits += 1;
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => (seen.bodies.push(body), response.writeHead(409).end()));
      return undefined;
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

const answers = async (port) => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) })).ok;
  } catch {
    return false;
  }
};

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

// --- spawnRoot -------------------------------------------------------------

test('a checkout on the deck port spawns the installed root', (t) => {
  const ownRoot = aRoot(t, { version: '0.9.4', checkout: true });
  const installed = aRoot(t, { version: '0.9.2' });

  assert.deepEqual(spawnRoot({ ownRoot, port: DECK_PORT, lookup: () => installed }), { root: installed, version: '0.9.2' });
});

test('an installed copy never asks claude', (t) => {
  const ownRoot = aRoot(t, { version: '0.9.2' });

  assert.deepEqual(spawnRoot({ ownRoot, port: DECK_PORT, lookup: never }), { root: ownRoot, version: '0.9.2' });
});

test('another port keeps its own checkout', (t) => {
  const ownRoot = aRoot(t, { version: '0.9.4', checkout: true });

  assert.deepEqual(spawnRoot({ ownRoot, port: 4999, lookup: never }), { root: ownRoot, version: '0.9.4' });
});

test('a checkout whose lookup fails names why and --from, never its own root', (t) => {
  const ownRoot = aRoot(t, { checkout: true });
  const missing = path.join(os.tmpdir(), 'pilot-root-absent-0');
  const unversioned = aRoot(t, { version: 'banana' });

  for (const lookup of [() => { throw new Error('the pilot plugin is not installed'); }, () => missing, () => unversioned]) {
    assert.throws(() => spawnRoot({ ownRoot, port: DECK_PORT, lookup }), (err) => {
      assert.match(err.message, /pilot deck --from/);
      return true;
    });
  }
});

// --- the client ------------------------------------------------------------

test('no installed root starts no deck', async (t) => {
  const port = await aPort(t);
  const client = await freshClient();

  const { result, lines } = await stderrOf(t, () =>
    client.ensureDaemon({ resolve: () => { throw new Error('the pilot plugin is not installed; start one with pilot deck --from <dir>'); } }));

  assert.equal(result, false);
  assert.equal(lines.length, 1, `one stderr line: ${lines.join(' | ')}`);
  assert.match(lines[0], /not installed/);
  assert.match(lines[0], /pilot deck --from/);
  await sleep(500);
  assert.equal(await answers(port), false, 'no deck was spawned');
});

test('older is the root\'s version', async (t) => {
  // The client's own version is PLUGIN_VERSION, above 0.0.1; the root and the deck are both 0.0.1.
  const port = await aPort(t);
  const seen = await aStandIn(t, port, '0.0.1');
  const client = await freshClient();
  let resolved = 0;

  const result = await client.ensureDaemon({ resolve: () => ((resolved += 1), { root: os.tmpdir(), version: '0.0.1' }) });

  assert.equal(result, true);
  assert.equal(seen.exits, 0, 'no exit request');
  assert.equal(resolved, 1, 'the root is resolved once');
});

test('the exit request carries the root version', async (t) => {
  await aPort(t);
  const client = await freshClient();
  const sent = [];

  const result = await stderrOf(t, () =>
    client.replaceOlder({ pid: process.pid, version: '0.9.0' }, { version: '0.9.5', post: async (version) => (sent.push(version), { status: 409 }) }));

  assert.equal(result.result, 'kept');
  assert.deepEqual(sent, ['0.9.5']);
});

test('a join to a current deck resolves nothing', async (t) => {
  const port = await aPort(t);
  const seen = await aStandIn(t, port, PLUGIN_VERSION);
  const client = await freshClient();

  assert.equal(await client.ensureDaemon({ resolve: never }), true);
  assert.equal(seen.exits, 0);
});

test('a deck older than the root is asked to exit with the root version', async (t) => {
  const port = await aPort(t);
  const seen = await aStandIn(t, port, '0.0.1');
  const client = await freshClient();

  const { result } = await stderrOf(t, () => client.ensureDaemon({ resolve: () => ({ root: os.tmpdir(), version: '0.0.5' }) }));

  assert.equal(result, true, 'the refused deck is kept and used');
  assert.deepEqual(seen.bodies.map((b) => JSON.parse(b).version), ['0.0.5']);
});

test('the daemon is spawned from <root>/deck/daemon.mjs', async (t) => {
  const port = await aPort(t);
  const client = await freshClient();
  const root = aRoot(t);
  const calls = [];
  const fake = { on() {}, unref() {} };
  const spawnProcess = (command, args) => {
    calls.push({ command, args });
    aStandIn(t, port, PLUGIN_VERSION);
    return fake;
  };

  const result = await client.ensureDaemon({ resolve: () => ({ root, version: '1.2.3', args: ['--leash-dir', root] }), spawnProcess });

  assert.equal(result, true);
  assert.deepEqual(calls, [{ command: process.execPath, args: [path.join(root, 'deck', 'daemon.mjs'), '--leash-dir', root] }]);
});
