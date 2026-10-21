/**
 * S6 of pilot-develop-line: `pilot integrate` takes the chained base until N lands (spec 4a, 5; L6).
 * A run whose record says `base: feat/<N>` merges N's tip at every slice while N waits, and pilot
 * from the first integration after N's landing merge `Merge feat/<N> into pilot` is on pilot. The
 * base is read from the record, never from ancestry. Every git case runs against a scratch bare
 * "origin" and a clone of it; the deck case runs on this test's own store.
 */

import '../../deck/test/no-open.mjs';

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { tempDeck } from '../../deck/testUtils.mjs';

const { baseOf, integrate } = await import('../integrate.mjs');
const { recordFor, registerRun } = await import('../../deck/store.mjs');
const { recordFields } = await import('../../deck/runs.mjs');
const { callTool, TOOLS } = await import('../../deck/server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function commitFile(work, file, text, message) {
  fs.writeFileSync(path.join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '-q', '-m', message);
}

/**
 * main, `pilot` from main, N's `feat/n` from pilot, and the chained run `feat/m` cut from
 * `feat/n`; the clone is on `feat/m` with a run record saying `base: feat/n`, and `seed`
 * moves the other branches.
 */
function chainRepos(t) {
  return gitFixture(t, 'integrate-chain:chainRepos', (dir) => {
    const origin = path.join(dir, 'origin.git');
    const seed = path.join(dir, 'seed');
    const work = path.join(dir, 'work');
    git(dir, 'init', '--bare', '-b', 'main', origin);
    git(dir, 'clone', '-q', origin, seed);
    git(seed, 'checkout', '-q', '-b', 'main');
    commitFile(seed, 'main.txt', 'main\n', 'main');
    git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
    git(seed, 'checkout', '-q', '-b', 'feat/n');
    commitFile(seed, 'n.txt', 'n\n', 'feat/n: n.txt');
    git(seed, 'push', '-q', 'origin', 'feat/n');
    git(seed, 'checkout', '-q', '-b', 'feat/m');
    commitFile(seed, 'm.txt', 'm\n', 'feat/m: m.txt');
    git(seed, 'push', '-q', 'origin', 'feat/m');
    git(dir, 'clone', '-q', '-b', 'feat/m', origin, work);
    writeRecord(work, { slug: 'm', branch: 'feat/m', base: 'feat/n' });
    return { origin, seed, work };
  });
}

function writeRecord(work, record) {
  const file = path.join(work, 'docs', 'design', 'm', 'run.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

/** In `seed`, commit one file on `branch` and push it. */
function pushTo(seed, branch, file, text) {
  git(seed, 'checkout', '-q', branch);
  commitFile(seed, file, text, `${branch}: ${file}`);
  git(seed, 'push', '-q', 'origin', branch);
}

/** N's landing, as `pilot land` writes it: `Merge feat/n into pilot`, two parents, on pilot's first-parent line. */
function landN(seed) {
  git(seed, 'fetch', '-q', 'origin');
  git(seed, 'checkout', '-q', 'pilot');
  git(seed, 'reset', '-q', '--hard', 'origin/pilot');
  git(seed, 'merge', '-q', '--no-ff', '-m', 'Merge feat/n into pilot', 'origin/feat/n');
  git(seed, 'push', '-q', 'origin', 'pilot');
}

const quiet = { install: () => {}, test: `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`, gh: () => { throw new Error('no gh'); } };

test('a chained run merges N\'s tip', (t) => {
  const { work } = chainRepos(t);

  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/feat/n', chained: 'feat/n' });
});

test('once N lands the base is pilot', (t) => {
  const { seed, work } = chainRepos(t);
  landN(seed);
  git(work, 'fetch', '-q', 'origin');

  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/pilot' });
});

test('a record without base is pilot', (t) => {
  const { work } = chainRepos(t);
  writeRecord(work, { slug: 'm', branch: 'feat/m' });

  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/pilot' });
});

test('a record base that is neither pilot nor feat/<slug> is refused, never merged', (t) => {
  const { work } = chainRepos(t);
  writeRecord(work, { slug: 'm', branch: 'feat/m', base: '--upload-pack=x' });

  assert.throws(() => baseOf(work, 'origin'), /base/);
});

test('the base switches exactly at N\'s landing merge, and stays pilot after it is taken', (t) => {
  const { origin, seed, work } = chainRepos(t);
  pushTo(seed, 'pilot', 'p2.txt', 'p2\n');
  pushTo(seed, 'feat/n', 'n-fix.txt', 'fix\n'); // N's fix round while it waits in concluding

  const first = integrate(undefined, { cwd: work, ...quiet });
  assert.equal(first.ok, true, first.line);
  assert.match(first.line, /^took base feat\/n@[0-9a-f]+ at /);
  const merge = git(work, 'log', '-1', '--merges', '--format=%H');
  assert.equal(git(work, 'log', '-1', '--format=%s', merge), 'Merge base feat/n');
  assert.equal(git(work, 'rev-parse', `${merge}^2`), git(work, 'rev-parse', 'origin/feat/n'), 'N\'s tip, not pilot');
  assert.ok(fs.existsSync(path.join(work, 'n-fix.txt')), 'N\'s fix round is taken');
  assert.ok(!fs.existsSync(path.join(work, 'p2.txt')), 'pilot is not taken while N waits');

  landN(seed);
  const second = integrate(undefined, { cwd: work, ...quiet });
  assert.equal(second.ok, true, second.line);
  assert.match(second.line, /^took base pilot@[0-9a-f]+ at /);
  const taken = git(work, 'log', '-1', '--merges', '--format=%H');
  assert.equal(git(work, 'log', '-1', '--format=%s', taken), 'Merge base pilot');
  assert.equal(git(work, 'rev-parse', `${taken}^2`), git(work, 'rev-parse', 'origin/pilot'));
  assert.ok(fs.existsSync(path.join(work, 'p2.txt')), 'pilot is taken once N lands');

  pushTo(seed, 'pilot', 'p3.txt', 'p3\n');
  const third = integrate(undefined, { cwd: work, ...quiet });
  assert.equal(third.ok, true, third.line);
  assert.match(third.line, /^took base pilot@/, 'N\'s landing inside feat/m does not bring the chain back');
  assert.ok(fs.existsSync(path.join(work, 'p3.txt')));
  assert.equal(git(origin, 'rev-parse', 'feat/m'), git(work, 'rev-parse', 'HEAD'), 'pushed');
});

/** A scratch repository and a worktree of it, as git lays one out, for `deck_status`'s worktree check. */
const aWorktree = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-wt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const worktree = path.join(root, 'repo-feat');
  fs.mkdirSync(path.join(repo, '.git', 'worktrees', 'repo-feat'), { recursive: true });
  fs.mkdirSync(worktree);
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'repo-feat')}\n`);
  return { repo, worktree };
};

test('deck_status keeps base', (t) => {
  tempDeck(t);
  const { repo, worktree } = aWorktree(t);
  const run = registerRun({ repo, pid: process.pid });
  assert.equal(TOOLS.find((tool) => tool.name === 'deck_status').inputSchema.properties.base.type, 'string');

  callTool('deck_status', { run: run.id, slug: 'm', branch: 'feat/m', base: 'feat/n', worktree, slices: [] });

  assert.equal(recordFor(repo).base, 'feat/n');
  assert.deepEqual(Object.keys(recordFor(repo)).slice(0, 3), ['slug', 'branch', 'base'], 'stored after branch, in RECORD_ORDER');
  assert.equal(JSON.parse(fs.readFileSync(path.join(worktree, 'docs', 'design', 'm', 'run.json'), 'utf8')).base, 'feat/n');
  assert.equal(recordFields({ slug: 'm', base: 'pilot' }).base, 'pilot');
  for (const base of ['main', 'feat/', '-x', 'feat/N', 'origin/feat/n']) {
    assert.throws(() => recordFields({ slug: 'm', base }), { name: 'RunRefusal', message: /base/ }, base);
  }
});
