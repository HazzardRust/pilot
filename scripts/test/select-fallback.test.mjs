/**
 * suite-at-landing S3 (spec 2; L3, A6): `selectTests` answers a full run, with the reason, when a
 * diff touches a file that changes how every test runs (`FULL_TRIGGERS`), when a changed script
 * reaches no test, or when the selection is too long for one command line.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { selectTests, FULL_TRIGGERS, ARGV_LIMIT } = await import('../select-tests.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

/** One commit on main holding every trigger, a test, and a module that test imports. */
const REPO = (dir) => {
  git(dir, 'init', '-q', '-b', 'main');
  for (const rel of [...FULL_TRIGGERS, 'lib/used.mjs']) write(dir, rel, 'x\n');
  write(dir, 'test/t.test.mjs', "import '../lib/used.mjs';\n");
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'one');
  return { dir };
};

const touched = (t, rel) => {
  const { dir } = gitFixture(t, 'fallback:repo', REPO);
  fs.appendFileSync(path.join(dir, rel), 'more\n');
  return selectTests({ cwd: dir, since: 'main' });
};

test('package.json runs full', (t) => {
  const s = touched(t, 'package.json');
  assert.equal(s.files, null);
  assert.equal(s.reason, 'package.json changed');
});

test('the lockfile runs full', (t) => {
  const s = touched(t, 'package-lock.json');
  assert.equal(s.files, null);
  assert.equal(s.reason, 'package-lock.json changed');
});

test('the gate runs full', (t) => {
  const scripts = ['scripts/gate.mjs', 'scripts/gate-slots.mjs', 'scripts/count-spawns.mjs', 'scripts/select-tests.mjs'];
  for (const rel of scripts) assert.ok(FULL_TRIGGERS.includes(rel), rel);
  for (const rel of scripts) {
    const s = touched(t, rel);
    assert.equal(s.files, null, rel);
    assert.equal(s.reason, `${rel} changed`);
  }
});

test('an unreached module runs full by name', (t) => {
  const { dir } = gitFixture(t, 'fallback:repo', REPO);
  write(dir, 'lib/lonely.mjs', 'export const l = 1;\n');
  const s = selectTests({ cwd: dir, since: 'main' });
  assert.equal(s.files, null);
  assert.equal(s.reason, 'lib/lonely.mjs reaches no test');
});

test('a reached module does not run full', (t) => {
  const s = touched(t, 'lib/used.mjs');
  assert.deepEqual(s.files.map((f) => path.basename(f)), ['t.test.mjs']);
});

test('unreached prose does not run full', (t) => {
  const { dir } = gitFixture(t, 'fallback:repo', REPO);
  write(dir, 'docs/x.md', '# x\n');
  const s = selectTests({ cwd: dir, since: 'main' });
  assert.deepEqual(s.files, []);
});

test('a selection past the argv bound runs full', (t) => {
  const { dir } = gitFixture(t, 'fallback:repo', REPO);
  const long = 'a'.repeat(80);
  for (let i = 0; i < 400; i++) write(dir, `test/${long}${i}.test.mjs`, 'x\n');
  const s = selectTests({ cwd: dir, since: 'main' });
  assert.equal(s.files, null);
  const n = Number(/^selection is (\d+) characters of argv, over 24000$/.exec(s.reason)?.[1]);
  assert.ok(n > ARGV_LIMIT, s.reason);
});

test('a git failure is a full run, not an empty diff', (t) => {
  const { dir } = gitFixture(t, 'fallback:repo', REPO);
  const failing = (args) => {
    if (args[0] === 'diff') throw new Error('git diff failed');
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  };
  const s = selectTests({ cwd: dir, since: 'main', git: failing });
  assert.equal(s.files, null);
  assert.equal(s.reason, 'git diff failed');
});

test('a rename keeps the old path in the diff', (t) => {
  const { dir } = gitFixture(t, 'fallback:repo', REPO);
  write(dir, 'test/u.test.mjs', "import '../lib/moved.mjs';\n");
  write(dir, 'lib/moved.mjs', 'export const m = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'two');
  git(dir, 'mv', 'lib/moved.mjs', 'lib/moved2.mjs');
  write(dir, 'test/v.test.mjs', "import '../lib/moved2.mjs';\n");
  const s = selectTests({ cwd: dir, since: 'HEAD' });
  assert.deepEqual(s.files.map((f) => path.basename(f)), ['u.test.mjs', 'v.test.mjs']);
});
