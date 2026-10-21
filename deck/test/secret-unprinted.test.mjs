/**
 * The deck's secret is never printed or posted (deck-token spec 5): on a scratch deck, after a
 * post, a refused POST, `/api/health`, `pilot deck --scratch` and `pilot deck`, no deck.log line,
 * no body and no stdout holds it, and only `deck.secret` and the open file do. The value is read
 * from the file and compared; it is never written into an assertion message.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import './no-open.mjs';
import { bearer, readSecret, secretFile } from '../../hooks/lib/deck-secret.js';
import { openFile } from '../launch.mjs';

const CLI = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));

/** Runs the CLI as the session would, in a home of its own so nothing reaches the user's store. */
function cli(t, args, env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-unprinted-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PILOT_DECK_DIR: home, CLAUDE_PID: String(process.pid), ...env },
    timeout: 20_000,
    windowsHide: true,
  });
}

/** `pilot deck --scratch`, stopped by its own pid when the test ends: its stdout and its fields. */
function scratch(t) {
  const run = cli(t, ['deck', '--scratch']);
  assert.equal(run.status, 0, run.stderr);
  const deck = Object.fromEntries(run.stdout.trim().split('\n').map((line) => line.trim().split(/ (.*)/s).slice(0, 2)));
  t.after(async () => {
    try {
      process.kill(Number(deck.pid));
      // Windows holds the deck's open log until the process is really gone.
      for (let tries = 0; tries < 50; tries += 1) {
        process.kill(Number(deck.pid), 0);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch {
      /* gone */
    }
    fs.rmSync(deck.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(path.join(os.tmpdir(), `pilot-scratch-${deck.pid}.json`), { force: true });
  });
  return { ...deck, stdout: run.stdout };
}

const post = (url, headers) =>
  fetch(`${url}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ name: 'deck_post', arguments: { kind: 'question', title: 'Which port?', body: 'A or B' } }),
  });

/** Every file under `dir`, by its path relative to `dir`. */
const filesUnder = (dir) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)));

test('no output carries the secret', async (t) => {
  const deck = scratch(t);
  const secret = readSecret(deck.dir);

  const taken = await post(deck.url, bearer(deck.dir));
  assert.equal(taken.status, 200);
  const refused = await post(deck.url, {});
  assert.equal(refused.status, 401);
  const health = await fetch(`${deck.url}/api/health`);
  assert.equal(health.status, 200);
  // The one request that carries the secret in its URL, and a wrong key beside it.
  const opened = await fetch(`${deck.url}/open?key=${secret}`, { redirect: 'manual' });
  assert.equal(opened.status, 200);
  const misopened = await fetch(`${deck.url}/open?key=not-the-key`, { redirect: 'manual' });
  assert.notEqual(misopened.status, 200);
  const bare = cli(t, ['deck'], { PILOT_DECK_DIR: deck.dir, PILOT_DECK_PORT: new URL(deck.url).port });
  assert.equal(bare.status, 0, bare.stderr);

  const outputs = {
    'the post body': await taken.text(),
    'the 401 body': await refused.text(),
    'the /api/health body': await health.text(),
    'the /open body': await opened.text(),
    'the wrong-key /open body': await misopened.text(),
    'pilot deck --scratch stdout': deck.stdout,
    'pilot deck stdout': bare.stdout + bare.stderr,
    'deck.log': fs.readFileSync(path.join(deck.dir, 'deck.log'), 'utf8'),
  };
  assert.match(outputs['deck.log'], /\[deck\] serving/);
  for (const [name, text] of Object.entries(outputs)) assert.ok(!text.includes(secret), `${name} holds the secret`);
});

test('only the two files hold it', async (t) => {
  const deck = scratch(t);
  const secret = readSecret(deck.dir);
  await post(deck.url, bearer(deck.dir));
  await post(deck.url, {});

  const holders = filesUnder(deck.dir).filter((file) => fs.readFileSync(path.join(deck.dir, file), 'utf8').includes(secret));
  assert.deepEqual(holders.sort(), [path.basename(openFile(deck.dir)), path.basename(secretFile(deck.dir))].sort());
});
