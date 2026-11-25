/**
 * The mid-run stage prunes (prune-worktrees spec 2, 4; A3, A4). `prune --run <slug> --stage planned`
 * takes the `design/<slug>` tree once `feat/<slug>` holds its head and nothing else; `--stage abandoned`
 * takes every tree of the run whose work is on the remote and that is clean, by S1's mid-run rule.
 * Every case runs in a scratch clone of a bare origin.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { main } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const SLUG = 'x';

const commit = (dir, file, text) => {
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', file);
};

/**
 * A run mid-way: `design/x` with one design commit, `feat/x` cut from it, a pushed slice and an
 * unpushed slice cut from feat. `ahead` puts a second design commit on the design tree that feat lacks.
 */
function runFixture(root, { ahead = false } = {}) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  commit(work, 'README', 'base');
  git(work, 'push', '-q', 'origin', 'main');
  const add = (name, branch, from) => {
    const dir = path.join(root, name);
    git(work, 'worktree', 'add', '-q', '-b', branch, dir, from);
    return dir;
  };
  const design = add('design', `design/${SLUG}`, 'main');
  commit(design, 'architecture.md', 'the design');
  const feat = add('feat', `feat/${SLUG}`, `design/${SLUG}`);
  git(feat, 'push', '-q', 'origin', `feat/${SLUG}`);
  if (ahead) commit(design, 'architecture.md', 'a re-cut feat lacks');
  const pushed = add('s1', `slice/${SLUG}-s1`, `feat/${SLUG}`);
  commit(pushed, 's1.txt', 's1');
  git(pushed, 'push', '-q', 'origin', `slice/${SLUG}-s1`);
  const unpushed = add('s2', `slice/${SLUG}-s2`, `feat/${SLUG}`);
  commit(unpushed, 's2.txt', 's2');
  return { work, design, feat, pushed, unpushed };
}

/** Forward slashes, as git spells a worktree's path on every platform. */
const slashed = (p) => p.replaceAll('\\', '/');

function cli(argv) {
  const out = [];
  const err = [];
  const status = main(argv, { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, read: () => [] });
  return { status, out: slashed(out.join('')), err: err.join('') };
}

const exists = (dir) => fs.existsSync(dir);

test('the design tree goes after Gate 1', (t) => {
  const { work, design, feat, pushed, unpushed } = gitFixture(t, 'worktrees-stage:run', (root) => runFixture(root));
  const run = cli(['prune', '--repo', work, '--run', SLUG, '--stage', 'planned']);
  assert.equal(run.status, 0, run.err);
  assert.equal(exists(design), false, 'the design tree is gone');
  assert.match(run.out, /removed/);
  for (const dir of [feat, pushed, unpushed]) assert.equal(exists(dir), true, `${dir} is not a design tree`);
});

test('a design tree ahead of feat stays', (t) => {
  const { work, design } = gitFixture(t, 'worktrees-stage:ahead', (root) => runFixture(root, { ahead: true }));
  const run = cli(['prune', '--repo', work, '--run', SLUG, '--stage', 'planned']);
  assert.equal(exists(design), true, 'its design commit is nowhere else');
  assert.ok(run.out.includes(`kept unpushed ${slashed(design)}`), run.out);
});

test('abandon takes pushed clean trees', (t) => {
  const { work, design, feat, pushed, unpushed } = gitFixture(t, 'worktrees-stage:run', (root) => runFixture(root));
  const run = cli(['prune', '--repo', work, '--run', SLUG, '--stage', 'abandoned']);
  assert.equal(exists(pushed), false, 'the pushed clean slice tree is gone');
  assert.equal(exists(feat), false, 'feat is on origin and clean');
  assert.equal(exists(design), false, 'design is in feat, which is on origin');
  assert.equal(exists(unpushed), true);
  assert.ok(run.out.includes(`kept unpushed ${slashed(unpushed)}`), run.out);
  assert.equal(exists(work), true, 'never the main checkout');
});

test('a stage needs a run and a known name', (t) => {
  const { work, design } = gitFixture(t, 'worktrees-stage:run', (root) => runFixture(root));
  assert.equal(cli(['prune', '--repo', work, '--stage', 'planned']).status, 2, 'no --run');
  assert.equal(cli(['prune', '--repo', work, '--run', SLUG, '--stage', 'landed']).status, 2, 'not a stage');
  assert.equal(exists(design), true, 'a usage error removes nothing');
});
