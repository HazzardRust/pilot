/**
 * `pilot worktrees prune` without `--run` (prune-worktrees S8, spec 11): the one sweep that takes the
 * trees landed runs left before the feature. A tree is landed when its head is in the run remote's
 * pilot branch or in the default branch; one that has not moved, or whose head is in neither, stays.
 * Every case runs in a scratch clone of a bare origin under the system temp directory.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The pilot branch's name is read, never a literal (A5/A6): a user-shaped one, pinned for this file's process.
const PILOT_BRANCH = 'sweeper-pilot';
process.env.PILOT_BRANCH = PILOT_BRANCH;

const { main } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

/**
 * A clone of a bare origin holding `main` and the pilot branch one commit ahead of it, landed by
 * the tree `landed`; `live` holds an unlanded commit; `fresh` was just added at the pilot tip.
 */
function sweepRepo(t) {
  return gitFixture(t, 'worktrees-sweep:repo', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', `main:${PILOT_BRANCH}`, 'main');
    const cut = (name, from) => {
      const dir = path.join(root, name);
      git(work, 'worktree', 'add', '-q', '-b', name, dir, from);
      return dir;
    };
    const commit = (dir, name) => {
      fs.writeFileSync(path.join(dir, `${name}.txt`), name);
      git(dir, 'add', `${name}.txt`);
      git(dir, 'commit', '-q', '-m', name);
    };
    const landed = cut('landed', 'origin/main');
    commit(landed, 'landed');
    git(landed, 'push', '-q', 'origin', `landed:${PILOT_BRANCH}`);
    const live = cut('live', 'origin/main');
    commit(live, 'live');
    git(work, 'fetch', '-q', 'origin');
    const fresh = cut('fresh', `origin/${PILOT_BRANCH}`);
    return { root, work, landed, live, fresh };
  });
}

/** The CLI in process over an empty process table, so no machine process holds a scratch tree. */
function cli(...argv) {
  const [out, err] = [[], []];
  const status = main(argv, { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, read: () => [] });
  return { status, stdout: out.join(''), stderr: err.join('') };
}

/** Each output line as `[verb, dir]`, the dir resolved so git's and node's spellings compare. */
const lines = (stdout) => stdout.split('\n').filter(Boolean).map((line) => {
  const [, verb, dir] = /^(removed|would remove|kept \S+)\s+(.+)$/.exec(line) ?? [null, line, ''];
  return [verb, dir && path.resolve(dir).toLowerCase()];
});
const said = (stdout, verb, dir) => lines(stdout).some(([v, d]) => v === verb && d === path.resolve(dir).toLowerCase());

test('a tree landed on pilot goes', (t) => {
  const { work, landed } = sweepRepo(t);
  const run = cli('prune', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'removed', landed), run.stdout);
  assert.equal(fs.existsSync(landed), false);
  assert.equal(git(work, 'branch', '--list', 'landed'), '');
});

test('a landed feat tree whose own run record the deck rewrote in place goes', (t) => {
  const { work, root } = sweepRepo(t);
  const dir = path.join(root, 'feat-done');
  git(work, 'worktree', 'add', '-q', '-b', 'feat/done', dir, `origin/${PILOT_BRANCH}`);
  const record = path.join(dir, 'docs', 'design', 'done', 'run.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, '{}\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'done');
  git(dir, 'push', '-q', 'origin', `feat/done:${PILOT_BRANCH}`);
  fs.writeFileSync(record, '{"stage":"landed"}\n');
  // A tracked edit beside the record is work, and keeps the tree.
  fs.writeFileSync(path.join(dir, 'landed.txt'), 'real work');
  const dirty = cli('prune', '--repo', work);
  assert.ok(said(dirty.stdout, 'kept merged-dirty', dir), dirty.stdout);
  git(dir, 'checkout', '--', 'landed.txt');
  const run = cli('prune', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'removed', dir), run.stdout);
  assert.equal(git(work, 'branch', '--list', 'feat/done'), '');
});

test('the plain listing reads a run record as removeTree does, never dirt (L3)', (t) => {
  const { work, root } = sweepRepo(t);
  const dir = path.join(root, 'feat-listed');
  git(work, 'worktree', 'add', '-q', '-b', 'feat/listed', dir, `origin/${PILOT_BRANCH}`);
  const record = path.join(dir, 'docs', 'design', 'listed', 'run.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, '{}\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'listed');
  git(dir, 'push', '-q', 'origin', `feat/listed:${PILOT_BRANCH}`);
  fs.writeFileSync(record, '{"stage":"landed"}\n');
  // Another run's record, untracked: removeTree takes it too, so the listing must not call it dirt.
  fs.mkdirSync(path.join(dir, 'docs', 'design', 'other'));
  fs.writeFileSync(path.join(dir, 'docs', 'design', 'other', 'run.json'), '{}\n');
  const run = cli('--repo', work, '--base', `origin/${PILOT_BRANCH}`);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^merged-clean\s+feat\/listed\s/m);
});

test('a tree landed on the default branch but not on pilot goes', (t) => {
  const { work, root } = sweepRepo(t);
  const dir = path.join(root, 'onmain');
  git(work, 'worktree', 'add', '-q', '-b', 'onmain', dir, 'origin/main');
  fs.writeFileSync(path.join(dir, 'onmain.txt'), 'onmain');
  git(dir, 'add', 'onmain.txt');
  git(dir, 'commit', '-q', '-m', 'onmain');
  git(dir, 'push', '-q', 'origin', 'onmain:main');
  const run = cli('prune', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'removed', dir), run.stdout);
  assert.equal(git(work, 'branch', '--list', 'onmain'), '');
});

test('in local mode the sweep judges by the local pilot branch', (t) => {
  const { work, landed } = sweepRepo(t);
  git(work, 'branch', PILOT_BRANCH, `origin/${PILOT_BRANCH}`);
  git(work, 'push', '-q', 'origin', '--delete', PILOT_BRANCH);
  git(work, 'fetch', '-q', '--prune', 'origin');
  git(work, 'config', 'pilot.remote', 'none');
  const run = cli('prune', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'removed', landed), run.stdout);
  assert.equal(git(work, 'branch', '--list', 'landed'), '');
});

test('a live run\'s tree stays:an unlanded head, and a tree just added at the pilot tip', (t) => {
  const { work, live, fresh } = sweepRepo(t);
  const run = cli('prune', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'kept open', live), run.stdout);
  assert.ok(said(run.stdout, 'kept open', fresh), run.stdout);
  assert.ok(fs.existsSync(live) && fs.existsSync(fresh));
});

test('a dry run names the landed tree and removes nothing', (t) => {
  const { work, landed } = sweepRepo(t);
  const run = cli('prune', '--dry-run', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'would remove', landed), run.stdout);
  assert.ok(fs.existsSync(landed));
});

test('with no pilot branch on the remote, the sweep judges by the default branch alone', (t) => {
  const { work, landed } = sweepRepo(t);
  git(work, 'push', '-q', 'origin', '--delete', PILOT_BRANCH);
  git(work, 'fetch', '-q', '--prune', 'origin');
  const run = cli('prune', '--repo', work);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(said(run.stdout, 'kept open', landed), run.stdout);
});
