/**
 * daemon-lifecycle S2: a crash and every refusal reach deck.log, and a held port names its
 * holder (spec 1, 2, 7). Every pin spawns the real daemon on a free port with a store of
 * its own, because a crash handler, the stderr tee and the bind are process-level and an
 * in-process server proves none of them. Never port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { freePort, tempDeck } from '../testUtils.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAEMON = path.join(HERE, '..', 'daemon.mjs');
const THROW_IN_TIMER = pathToFileURL(path.join(HERE, 'fixtures', 'throw-in-timer.mjs')).href;

/** A daemon on `port` over `dir`, its stderr kept, killed when the test ends however it ends. */
function daemon(t, dir, port, { preload = [], env = {} } = {}) {
  const child = spawn(process.execPath, [...preload, DAEMON], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port), ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.said = '';
  child.stderr.on('data', (chunk) => {
    child.said += chunk;
  });
  child.exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await child.exited;
    }
  });
  return child;
}

const healthAt = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

async function until(probe, what, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${what} never happened within ${timeoutMs} ms`);
}

const logOf = (dir) => fs.readFileSync(path.join(dir, 'deck.log'), 'utf8');

test('a throw in a timer leaves the stack and exit 1', async (t) => {
  const dir = tempDeck(t);
  const deck = daemon(t, dir, await freePort(), { preload: ['--import', THROW_IN_TIMER], env: { THROW_IN_TIMER: 'throw' } });

  assert.equal(await deck.exited, 1, 'a crashed deck exits 1, not 0');
  const log = logOf(dir);
  assert.match(log, /\[deck\] crashed:/);
  assert.match(log, /planted by throw-in-timer \(throw\)/);
  assert.match(log, /throw-in-timer\.mjs:\d+/, 'the stack, not only the message');
});

test('a rejection nobody handles does the same', async (t) => {
  const dir = tempDeck(t);
  const deck = daemon(t, dir, await freePort(), { preload: ['--import', THROW_IN_TIMER], env: { THROW_IN_TIMER: 'reject' } });

  assert.equal(await deck.exited, 1);
  const log = logOf(dir);
  assert.match(log, /\[deck\] crashed:/);
  assert.match(log, /planted by throw-in-timer \(rejection\)/);
});

test('a refusal writes one line and the deck serves on', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  daemon(t, dir, port);
  await until(() => healthAt(port), 'the daemon coming up');

  const response = await fetch(`http://127.0.0.1:${port}/api/tool?token=secret-in-query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer(dir) },
    body: JSON.stringify({ name: 'deck_delete', arguments: { id: 'itm_000000000000', note: 'body-only-text' } }),
  });
  assert.equal(response.status, 400);

  const lines = await until(() => {
    const found = logOf(dir).split('\n').filter((line) => line.startsWith('[deck] 400 '));
    return found.length ? found : null;
  }, 'the refusal reaching deck.log');
  assert.equal(lines.length, 1, 'one line per refusal');
  assert.match(lines[0], /^\[deck\] 400 POST \/api\/tool: .*no tool named deck_delete/);
  assert.doesNotMatch(logOf(dir), /secret-in-query|body-only-text/, 'neither the query string nor the body is logged');
  assert.ok(await healthAt(port), 'the deck still answers after a refusal');
});

test('a 500 writes the same one line, then its stack, and the deck serves on', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  daemon(t, dir, port);
  await until(() => healthAt(port), 'the daemon coming up');

  fs.writeFileSync(path.join(dir, 'deck.json'), '{ not json', 'utf8');
  // A second reader in the corrupt window, as any test file polling a port the OS has since
  // handed this daemon is under load: its 500 is its own request's line, not this one's twin.
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 500, 'health reads the store too');
  assert.equal((await fetch(`http://127.0.0.1:${port}/?token=secret-in-query`, { headers: bearer(dir) })).status, 500);

  // This request's own line. The port came from `freePort()`, and on Linux a test file running
  // beside this one can be handed the same port and probe `/api/health` on it after the store is
  // corrupt, which logs a 500 of its own (seen in WSL: `[deck] 500 GET /api/health`).
  const own = (line) => line.startsWith('[deck] 500 GET /: ');
  const log = await until(() => (logOf(dir).split(/\r?\n/).some(own) ? logOf(dir) : null), 'the 500 reaching deck.log');
  const lines = log.split(/\r?\n/);
  const at = lines.findIndex(own);
  assert.equal(lines.filter(own).length, 1, 'one line per 500');
  assert.match(lines[at], /^\[deck\] 500 GET \/: .*is not readable JSON/);
  assert.match(lines[at + 1] ?? '', /^\s+at /, 'the stack frames follow on the next lines');
  assert.doesNotMatch(log, /secret-in-query/, 'the query string is not logged');
  fs.rmSync(path.join(dir, 'deck.json'));
  assert.ok(await until(() => healthAt(port), 'health after the store is moved aside'), 'the deck still answers after a 500');
});

test('a second deck names the first', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const first = daemon(t, dir, port);
  const health = await until(() => healthAt(port), 'the first daemon coming up');
  assert.equal(health.pid, first.pid);

  const second = daemon(t, dir, port);
  assert.equal(await second.exited, 1, 'the second start exits 1');
  const url = `http://127.0.0.1:${port}`;
  assert.ok(
    second.said.includes(`[deck] a deck is already serving ${url} (pid ${first.pid}, version ${PLUGIN_VERSION}); nothing to start`),
    `the second start names the first by pid and version; it said: ${second.said}`,
  );
});

test('a stranger on the port is named as one', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const stranger = http.createServer((request, response) => {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not here\n');
  });
  await new Promise((resolve) => stranger.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => stranger.close(resolve)));

  const deck = daemon(t, dir, port);
  assert.equal(await deck.exited, 1);
  assert.match(deck.said, /\[deck\] \S+ is held by another program, not a deck \(answered 404 with no deck health\); free the port and start again/);
});

test("a holder's version cannot forge a second log line", async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const liar = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, pid: 4242, version: '1.0\n[deck] forged line' }));
  });
  await new Promise((resolve) => liar.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => liar.close(resolve)));

  const deck = daemon(t, dir, port);
  assert.equal(await deck.exited, 1);
  assert.doesNotMatch(deck.said, /^\[deck\] forged line/m, 'the holder named on one line, whatever it answers');
  assert.match(deck.said, /\(pid 4242, version 1\.0 \[deck\] forged line\)/);
});
