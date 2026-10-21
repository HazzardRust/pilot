/**
 * S9's spawn fixture (process-gc spec 6): under `PILOT_SPAWNS_FIXTURE=three` its test starts a
 * node and a git synchronously (the `spawn_sync` path) and a node asynchronously (the
 * diagnostics channel); under `grandchild`, a node that starts a git. It spawns nothing
 * otherwise, because the main suite's glob reaches this file too.
 */
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

test('spawns what the fixture mode names', async () => {
  const mode = process.env.PILOT_SPAWNS_FIXTURE;
  if (mode === 'three') {
    spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
    spawnSync('git', ['--version'], { windowsHide: true });
    await once(spawn(process.execPath, ['-e', ''], { windowsHide: true }), 'close');
  } else if (mode === 'grandchild') {
    spawnSync(process.execPath, ['-e', "require('node:child_process').spawnSync('git', ['--version'], { windowsHide: true })"], { windowsHide: true });
  }
});
