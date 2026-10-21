/** process-gc spec 7: a daemon reports its memory, and an idle one stays small. */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, freePort, tempDeck } from './../testUtils.mjs';

const DAEMON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon.mjs');
const CEILING = 96 * 1024 * 1024;

const healthAt = async (base) => (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).json();

test('health reports rss', async (t) => {
  const base = await deckOnAPort(t);
  const { rss } = await healthAt(base);
  assert.ok(Number.isInteger(rss) && rss > 0, `rss was ${rss}`);
});

test('a fresh idle daemon stays under 96 MB', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const child = spawn(process.execPath, [DAEMON, '--leash', String(process.pid)], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => {
    child.kill();
  });
  const base = `http://127.0.0.1:${port}`;
  // Listening first: sampling before the daemon serves would measure nothing.
  let health;
  for (let i = 0; i < 100 && !health; i += 1) {
    health = await healthAt(base).catch(() => null);
    if (!health) await sleep(100);
  }
  assert.ok(health, 'the daemon never answered');
  await sleep(5000);
  const { rss } = await healthAt(base);
  t.diagnostic(`idle rss ${rss} bytes (${(rss / 1024 / 1024).toFixed(1)} MB)`);
  assert.ok(rss < CEILING, `idle rss ${rss} is past ${CEILING}`);
});
