/**
 * A landing runs the tests the way `pilot land` in a shell does (clean-landing spec 6, S5).
 * The daemon is a detached process with no console and its stdio ignored; it spawns `land`
 * through `landingSpawnOptions`. The test below pins that the landing spawns with those options.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2 } from '../items.mjs';
import { landingSpawnOptions, startLanding } from '../landing.mjs';
import { postItem, registerRun, setSlices } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

/** A directory of the test's own, removed when it ends. */
function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-parity-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}

/** A child process as `spawn` answers one; every call is kept. */
function aSpawn() {
  const calls = [];
  const spawnFake = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };
  return { spawn: spawnFake, calls };
}

test('the landing spawns with the shape the parity test uses', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = scratch(t, 'wt');
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  const evidence = withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow');
  const record = registerRun({ repo, pid: 4242 });
  setSlices(record.id, [], undefined, { slug: 'x', ticket: evidence.ticket, worktree });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  const env = { PATH: process.env.PATH, CLAUDECODE: '1' };
  const fake = aSpawn();

  startLanding(gate.id, { spawn: fake.spawn, env });

  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].options, landingSpawnOptions(worktree, env));
});
