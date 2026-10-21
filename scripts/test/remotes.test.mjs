/**
 * S1 of pilot-fork: `pilot.remote` names the run remote (spec 1, 2; L1, L2, L3). Each case
 * reads a scratch clone's config through real git; nothing reaches GitHub or a deck.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { remoteOf, runRemote, runRef, shortRef } = await import('../remotes.mjs');

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A work clone of a bare origin, with a bare `second` added as a remote; `git` runs in the clone. */
function scratchClone(t) {
  const work = gitFixture(t, 'remotes:scratchClone', buildScratchClone);
  const seen = [];
  const git = (args) => {
    seen.push(args);
    return execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };
  return { work, git, seen };
}

function buildScratchClone(root) {
  const work = path.join(root, 'work');
  run(root, 'init', '-q', '--bare', '-b', 'main', path.join(root, 'origin.git'));
  run(root, 'init', '-q', '--bare', '-b', 'main', path.join(root, 'second.git'));
  run(root, 'clone', '-q', path.join(root, 'origin.git'), work);
  run(work, 'remote', 'add', 'second', path.join(root, 'second.git'));
  return work;
}

test('unset means origin', (t) => {
  const { git } = scratchClone(t);
  assert.equal(runRemote(git), 'origin');
  assert.equal(runRef('origin', 'pilot'), 'refs/remotes/origin/pilot');
  assert.equal(shortRef(runRef('origin', 'pilot')), 'origin/pilot');
});

test('none means local', (t) => {
  const { work, git } = scratchClone(t);
  run(work, 'config', 'pilot.remote', 'none');
  assert.equal(runRemote(git), null);
  assert.equal(runRef(null, 'pilot'), 'refs/heads/pilot');
  assert.equal(shortRef(runRef(null, 'pilot')), 'pilot');
  assert.deepEqual(['feat/x', 'Feat/x', 'design/x'].map((b) => remoteOf(null, b)), ['origin', 'origin', null], 'a feat/ branch is on origin, whatever its case');
});

test('a listed second remote is the run remote', (t) => {
  const { work, git } = scratchClone(t);
  run(work, 'config', 'pilot.remote', 'second');
  assert.equal(runRemote(git), 'second');
  assert.equal(runRef('second', 'slice/x-s1'), 'refs/remotes/second/slice/x-s1');
  assert.deepEqual(['feat/x', 'slice/x-s1'].map((b) => remoteOf('second', b)), ['origin', 'second']);
});

test('a configured name that is not a remote stops the command', (t) => {
  const { work, git, seen } = scratchClone(t);
  run(work, 'config', 'pilot.remote', '--upload-pack=x');
  assert.throws(() => runRemote(git), /^Error: pilot\.remote names "--upload-pack=x": not a remote name$/);
  assert.ok(seen.every((args) => !args.includes('--upload-pack=x')), 'the bad value never reaches argv');
  run(work, 'config', 'pilot.remote', 'nosuch');
  assert.throws(() => runRemote(git), /^Error: pilot\.remote names "nosuch": not a remote here$/);
  run(work, 'config', 'pilot.remote', '');
  assert.throws(() => runRemote(git), /pilot\.remote names "": not a remote name/);
});
