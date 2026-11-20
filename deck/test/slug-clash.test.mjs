/**
 * `slugClashes` (two-devices S1, spec 2a, 2c; L3, L4): whether origin, the run remote or an open review already
 * holds a slug, read live. Every case runs against a scratch bare origin and a stub Host; nothing reaches a real
 * forge.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { slugClashes } from '../slug-clash.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare origin holding `feat/x` and `design/x`, and a clone of it with a stale `origin/feat/y` tracking ref. */
function buildOrigin(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  run(root, 'init', '--bare', '-q', '-b', 'main', origin);
  run(root, 'clone', '-q', origin, work);
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  run(work, 'add', 'base.txt');
  run(work, 'commit', '-q', '-m', 'base');
  run(work, 'push', '-q', 'origin', 'HEAD:refs/heads/main', 'HEAD:refs/heads/feat/x', 'HEAD:refs/heads/design/x');
  run(work, 'update-ref', 'refs/remotes/origin/feat/y', 'HEAD');
  return { origin, work };
}

/** The scratch clone, with a recorder of every git argv `slugClashes` runs. */
function repo(t) {
  const { work } = gitFixture(t, 'slug-clash:origin', buildOrigin);
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return run(work, ...args);
  };
  return { work, git, calls };
}

/** A Host whose one open review is `#7` from `design/x`; `reviews` filters by head as the adapters do. */
function stubHost(open = [{ number: 7, state: 'open', base: 'pilot', head: 'design/x', headSha: 'abc', body: '', crossRepo: false }]) {
  const asked = [];
  return {
    asked,
    cli: 'gh',
    reviews(query) {
      asked.push(query);
      return open.filter((review) => query.head === undefined || review.head === query.head);
    },
  };
}

test('a branch on origin is a clash', (t) => {
  const { git } = repo(t);

  const answer = slugClashes('x', { git, host: null });

  assert.deepEqual(answer, { clashes: [{ ref: 'origin/feat/x' }, { ref: 'origin/design/x' }] });
});

test('an open PR is a clash', (t) => {
  const { git } = repo(t);
  const host = stubHost();

  const answer = slugClashes('x', { git, host });

  assert.deepEqual(answer, { clashes: [{ ref: 'origin/feat/x' }, { ref: 'origin/design/x' }, { pr: 7, head: 'design/x' }] });
  assert.ok(host.asked.every((query) => query.state === 'open'), 'a merged or closed review is no clash');
});

test('design/ is read on the run remote, not origin', (t) => {
  const { work, git } = repo(t);
  const runs = path.join(path.dirname(work), 'runs.git');
  run(work, 'init', '--bare', '-q', runs);
  run(work, 'remote', 'add', 'runs', runs);
  run(work, 'config', 'pilot.remote', 'runs');

  assert.deepEqual(slugClashes('x', { git, host: null }), { clashes: [{ ref: 'origin/feat/x' }] }, "origin's design/x is not the run remote's");
  run(work, 'push', '-q', 'runs', 'HEAD:refs/heads/design/x');
  assert.deepEqual(slugClashes('x', { git, host: null }), { clashes: [{ ref: 'origin/feat/x' }, { ref: 'runs/design/x' }] });
});

test('local mode cannot tell for design/', (t) => {
  const { work, git } = repo(t);
  run(work, 'config', 'pilot.remote', 'none');

  const answer = slugClashes('free-name', { git, host: null });

  assert.deepEqual(answer.clashes, []);
  assert.equal(typeof answer.unread, 'string', 'never a free answer (A5)');
  assert.match(answer.unread, /design\/free-name/);
});

test('stale tracking refs are not read', (t) => {
  const { git } = repo(t);

  const answer = slugClashes('y', { git, host: null });

  assert.deepEqual(answer, { clashes: [] });
});

test('unreachable reads cannot tell', (t) => {
  const { work, git } = repo(t);
  run(work, 'remote', 'set-url', 'origin', path.join(work, 'no-such-origin.git'));

  const answer = slugClashes('x', { git, host: null });

  assert.deepEqual(answer.clashes, []);
  assert.equal(typeof answer.unread, 'string', 'never a free answer');
  assert.match(answer.unread, /ls-remote origin failed/, 'names the remote that could not answer');
});

test('an unreadable host cannot tell', (t) => {
  const { git } = repo(t);
  const host = { cli: 'gh', reviews: () => { throw new Error('gh: not signed in'); } };

  const answer = slugClashes('free-name', { git, host });

  assert.deepEqual(answer.clashes, []);
  assert.match(answer.unread ?? '', /gh/);
});

test('a bad slug never reaches git', (t) => {
  const { git, calls } = repo(t);
  const host = stubHost();

  for (const bad of ['--upload-pack=x', 'Feat', 'a b', '', 'x/../y']) {
    assert.throws(() => slugClashes(bad, { git, host }), /slug/, JSON.stringify(bad));
  }
  assert.throws(() => slugClashes(undefined, { git, host }), /slug/);
  assert.equal(calls.length, 0, 'no git call');
  assert.equal(host.asked.length, 0, 'no host call');
});
