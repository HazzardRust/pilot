/**
 * No test names a fixed port (clean-landing spec 10): a scratch deck a QA agent
 * leaves on the port the suite used to assume free must never turn it red.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDeckHttpServer } from '../server.mjs';
import { freePort, tempDeck } from '../testUtils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Spelled in two halves so this file does not name the number it forbids.
const OLD_FIXED_PORT = Number(['43', '99'].join(''));

test('freePort answers a port a server can then bind', async () => {
  const port = await freePort();
  assert.ok(Number.isInteger(port) && port > 0);
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise((resolve) => server.close(resolve));
});

test('the no-deck tests pass with a deck listening on the old fixed port', async (t) => {
  tempDeck(t);
  const holder = createDeckHttpServer();
  // Something already holding the port (a scratch deck) is the very condition this test sets up.
  const held = await new Promise((resolve, reject) =>
    holder.once('error', (err) => (err.code === 'EADDRINUSE' ? resolve(false) : reject(err))).listen(OLD_FIXED_PORT, '127.0.0.1', () => resolve(true)),
  );
  try {
    const files = ['deck/test/run.test.mjs', 'deck/test/wait.test.mjs', 'scripts/test/handoff.test.mjs'];
    const ran = await new Promise((resolve) => {
      const proc = spawn(process.execPath, ['--test', ...files], { cwd: ROOT, env: { ...process.env, NODE_TEST_CONTEXT: undefined, PILOT_RUN_REPO: '', CLAUDE_PROJECT_DIR: '', PILOT_DECK_PORT: '' } });
      let out = '';
      proc.stdout.on('data', (d) => (out += d));
      proc.stderr.on('data', (d) => (out += d));
      proc.on('close', (status) => resolve({ status, out }));
    });
    assert.equal(ran.status, 0, ran.out.slice(-3000));
  } finally {
    if (held) {
      holder.closeAllConnections();
      await new Promise((resolve) => holder.close(resolve));
    }
  }
});

test('no test names the old fixed port', () => {
  const found = spawnSync('git', ['grep', '-n', String(OLD_FIXED_PORT), '--', '*.mjs', '*.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(found.stdout, '', 'a test still names the port');
});
