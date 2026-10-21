/**
 * A landing conflict keeps its worktree, and the next land pushes the resolution
 * (red-lands-on-pilot spec 3, 5; L5). Every case runs against a scratch bare "origin" under
 * os.tmpdir() and clones of it, with `gh` faked; nothing here reaches a real remote.
 */

// A red run's log goes under a home of this process's own, never the real one.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { main } = await import('../land.mjs');
const { landingMessage } = await import('../integrate.mjs');
const { autoResolves } = await import('../merge-generated.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const passing = `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`;
const red = 'node -e "process.exit(1)"';

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/** Origin with main and pilot; feat/b edits shared.txt one way, pilot another. */
function conflicting(t) {
  return gitFixture(t, 'land-conflict:conflicting', buildConflicting);
}

function buildConflicting(dir) {
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  const clone = (name) => {
    const repo = path.join(dir, name);
    git(dir, 'clone', '-q', origin, repo);
    return repo;
  };
  const seed = clone('seed');
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'shared.txt', 'one\n', 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  const b = clone('b');
  git(b, 'checkout', '-q', '-b', 'feat/b', 'origin/pilot');
  commitFile(b, 'shared.txt', 'b\n', 'b edits shared');
  git(b, 'push', '-q', 'origin', 'feat/b');
  git(seed, 'checkout', '-q', '-B', 'pilot', 'origin/pilot');
  commitFile(seed, 'shared.txt', 'pilot\n', 'pilot edits shared');
  git(seed, 'push', '-q', 'origin', 'pilot');
  const land = (testCommand = passing) => mainSays({ cwd: b, git: (args) => git(b, ...args), gh: () => '[]', test: testCommand });
  return { dir, origin, seed, b, land };
}

/** `main`'s stdout and exit code. */
function mainSays(inject) {
  const said = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => said.push(String(text));
  try {
    return { code: main([], inject), out: said.join('') };
  } finally {
    process.stdout.write = write;
  }
}

const keptDir = (out) => out.match(/; the lander resolves in (.+)\n$/)?.[1];
const midMerge = (dir) => fs.existsSync(dir) && execFileSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: dir }).length > 0;

/** Lands into a conflict, then resolves it in the kept worktree and commits. */
function resolved(t) {
  return gitFixture(t, 'land-conflict:resolved', buildResolved);
}

function buildResolved(root) {
  const repos = buildConflicting(root);
  const dir = keptDir(repos.land().out);
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'resolved\n');
  git(dir, 'add', 'shared.txt');
  git(dir, 'commit', '-q', '--no-edit');
  return { ...repos, dir, resolution: git(dir, 'rev-parse', 'HEAD') };
}

test('a conflict keeps the land worktree and names it', (t) => {
  const { dir, origin, land } = conflicting(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land();

  assert.equal(code, 3);
  assert.match(out, /^NOT landed: feat\/b conflicts with pilot in shared\.txt; the lander resolves in .+\n$/);
  const kept = keptDir(out);
  // Resolved both sides: git names the long, linked-through path of a runner's TEMP (`RUNNER~1`, `/var` -> `/private/var`).
  assert.equal(fs.realpathSync.native(kept), fs.realpathSync.native(path.join(dir, 'b-land-b')), 'beside the checkout, inside its parent directory');
  assert.ok(midMerge(kept), 'the kept worktree is mid-merge');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unchanged');
});

test('a conflict names the lander and the kept dir', (t) => {
  const { dir, land } = conflicting(t);

  const { code, out } = land();

  assert.equal(code, 3);
  assert.match(out, /; the lander resolves in .+-land-b\n$/);
  assert.equal(path.resolve(keptDir(out)), path.resolve(dir, 'b-land-b'));
});

test('the generated files are named once', () => {
  assert.equal(autoResolves('docs/adr/README.md'), true);
  assert.equal(autoResolves('docs/design/x/run.json'), true);
  assert.equal(autoResolves('README.md'), false);
});

test('a resolved land worktree is tested and pushed', (t) => {
  const { origin, dir, resolution, land } = resolved(t);

  const { code, out } = land();

  assert.equal(code, 0, out);
  assert.match(out, /^landed feat\/b on pilot at /);
  assert.equal(git(origin, 'rev-parse', 'pilot'), resolution, 'the resolution is what was pushed');
  assert.ok(!fs.existsSync(dir), 'the land worktree is removed');
});

test('a resolution behind a moved pilot is merged into its new tip and pushed', (t) => {
  const { origin, seed, dir, resolution, land } = resolved(t);
  commitFile(seed, 'other.txt', 'other\n', 'pilot moves elsewhere');
  git(seed, 'push', '-q', 'origin', 'pilot');
  const moved = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land();

  assert.equal(code, 0, out);
  assert.equal(git(origin, 'rev-parse', 'pilot^1'), moved, "pilot's first parent is its tip before the land");
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), resolution, 'the second parent is the resolution');
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'pilot'), landingMessage('feat/b'));
  assert.ok(!fs.existsSync(dir), 'the land worktree is removed');
});

test('a resolution that conflicts with a moved pilot keeps its worktree', (t) => {
  const { origin, seed, dir, resolution, land } = resolved(t);
  commitFile(seed, 'shared.txt', 'b\n', 'pilot takes b');
  git(seed, 'push', '-q', 'origin', 'pilot');
  const moved = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land();

  assert.equal(code, 3, out);
  assert.equal(path.resolve(keptDir(out)), path.resolve(dir), out);
  assert.equal(git(dir, 'rev-parse', 'MERGE_HEAD'), resolution, 'mid-merge with the resolution');
  assert.equal(git(origin, 'rev-parse', 'pilot'), moved, 'pilot unchanged');

  fs.writeFileSync(path.join(dir, 'shared.txt'), 'resolved again\n');
  git(dir, 'add', 'shared.txt');
  git(dir, 'commit', '-q', '--no-edit');
  const again = land();
  assert.equal(again.code, 0, again.out);
  assert.equal(git(origin, 'rev-parse', 'pilot^1'), moved, 'the second resolution lands on the moved tip');
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), resolution);
});

test('a land worktree mid-merge is refused and kept', (t) => {
  const { origin, land } = conflicting(t);
  const dir = keptDir(land().out);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land();

  assert.equal(code, 3, out);
  assert.equal(out, `NOT landed: finish and commit the resolution in ${dir}\n`);
  assert.ok(midMerge(dir), 'still mid-merge');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unchanged');
});

test('a committed resolution with changes on top is refused and kept', (t) => {
  const { origin, dir, resolution, land } = resolved(t);
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'more\n');
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land();

  assert.equal(code, 3, out);
  assert.equal(out, `NOT landed: finish and commit the resolution in ${dir}\n`);
  assert.equal(fs.readFileSync(path.join(dir, 'shared.txt'), 'utf8'), 'more\n', 'the change is kept');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), resolution);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unchanged');
});

test('a red resolution pushes nothing', (t) => {
  const { origin, dir, resolution, land } = resolved(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land(red);

  assert.equal(code, 1, out);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unchanged');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), resolution, 'the land worktree is kept with its resolution');
});

test('a directory at the land path that is not a worktree of the repository is left alone', (t) => {
  const { dir, origin, land } = conflicting(t);
  const stranger = path.join(dir, 'b-land-b');
  fs.mkdirSync(stranger);
  fs.writeFileSync(path.join(stranger, 'mine.txt'), 'keep me\n');
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const { code, out } = land();

  assert.equal(code, 1, out);
  assert.match(out, /is not a worktree of this repository/);
  assert.equal(fs.readFileSync(path.join(stranger, 'mine.txt'), 'utf8'), 'keep me\n', 'nothing there was removed');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unchanged');
});

test('a link at the land path to another worktree of the repository is refused, and that worktree kept', (t) => {
  const { dir, b, land } = conflicting(t);
  const other = path.join(dir, 'other');
  git(b, 'worktree', 'add', '-q', '--detach', other);
  fs.symlinkSync(other, path.join(dir, 'b-land-b'), 'junction');

  const { code, out } = land();

  assert.equal(code, 1, out);
  assert.match(out, /is not a worktree of this repository/);
  assert.ok(fs.existsSync(path.join(other, 'shared.txt')), 'the linked worktree is untouched');
});
