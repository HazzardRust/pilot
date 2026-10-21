/**
 * S8's leak fixture (process-gc spec 3): its one test starts a detached sleeper whose command line
 * names `deck/daemon.mjs` under this directory, and forgets it. It leaks only under
 * `PILOT_LEAK_FIXTURE`, because the main suite's glob reaches this file too.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('starts a sleeper and forgets it', () => {
  if (!process.env.PILOT_LEAK_FIXTURE) return;
  const sleeper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deck', 'daemon.mjs');
  spawn(process.execPath, [sleeper], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
});
