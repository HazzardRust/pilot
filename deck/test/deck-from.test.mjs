/**
 * deck-spawn-root S2 (spec 6; L5): `pilot deck --from <dir>` is the one opt-in.
 *
 * `fromRoot(dir)` refuses, up front and naming which, a dir that could not run a
 * deck: no `deck/daemon.mjs`, or no `@modelcontextprotocol/sdk` resolvable from it. Every
 * root is a temp dir; the CLI test runs on a free port of its own, never 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { freePort, tempDeck } from '../testUtils.mjs';
import { fromRoot } from '../spawn-root.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A temp checkout at 1.2.3, with `deck/daemon.mjs` when `daemon` and a stand-in sdk when `sdk`. */
function aCheckout(t, { daemon = true, sdk = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-from-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pilot', version: '1.2.3' }));
  fs.mkdirSync(path.join(dir, '.git'));
  if (daemon) {
    fs.mkdirSync(path.join(dir, 'deck'));
    fs.writeFileSync(path.join(dir, 'deck', 'daemon.mjs'), '');
  }
  if (sdk) {
    const pkg = path.join(dir, 'node_modules', '@modelcontextprotocol', 'sdk');
    fs.mkdirSync(path.join(pkg, 'server'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@modelcontextprotocol/sdk', version: '1.0.0' }));
    fs.writeFileSync(path.join(pkg, 'server', 'index.js'), '');
  }
  return dir;
}

const fromIt = (from) => fromRoot(from);

test('from a dir without the daemon refuses', (t) => {
  const from = aCheckout(t, { daemon: false });

  assert.throws(() => fromIt(from), /deck\/daemon\.mjs/);
});

test('from a dir without dependencies refuses', (t) => {
  const from = aCheckout(t, { sdk: false });

  assert.throws(() => fromIt(from), /@modelcontextprotocol\/sdk/);
});

test('from a complete checkout answers it', (t) => {
  const from = aCheckout(t);
  const relative = path.relative(process.cwd(), from);

  assert.deepEqual(fromIt(relative, aCheckout(t)), { root: from, version: '1.2.3' });
});

test('the CLI refuses and names why', async (t) => {
  const store = tempDeck(t);
  const port = await freePort();
  const env = { ...process.env, PILOT_DECK_PORT: String(port), PILOT_DECK_DIR: store, PILOT_DECK_NO_OPEN: '1' };
  const deck = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'deck', ...args], { env, encoding: 'utf8' });

  const refused = deck('--from', aCheckout(t, { sdk: false }));
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /^pilot deck --from: .*@modelcontextprotocol\/sdk/m);

  assert.equal(deck('--from').status, 2);
  assert.equal(deck('--from', '--rotate').status, 2);
});

test('a deck already up is never claimed as the dir', async (t) => {
  const store = tempDeck(t);
  const port = await freePort();
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, pid: process.pid, version: PLUGIN_VERSION }));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve()))));
  const env = { ...process.env, PILOT_DECK_PORT: String(port), PILOT_DECK_DIR: store, PILOT_DECK_NO_OPEN: '1' };

  // Async, so the stand-in in this process can answer the CLI's probe.
  const refused = await promisify(execFile)(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'deck', '--from', aCheckout(t)], { env })
    .then(() => ({ code: 0, stderr: '' }), (err) => err);
  assert.equal(refused.code, 1, refused.stderr);
  assert.match(refused.stderr, /^pilot deck --from: a deck already answers/m);
});
