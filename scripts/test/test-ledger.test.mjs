/**
 * tested-once S1 (spec 4; L3-L5, L8, A1, A2, A6): every test run `runTests` makes leaves one ledger row
 * with the process's own exit, a red or deferred row is never reused, reuse is the exact tree on the
 * same platform and node, `pilot test` starts no process for a green tree it has a row for, and a
 * run inside the suite writes no row unless a home is passed. Scratch repositories and a scratch home.
 */

// Before anything reads the home directory: a test that forgets `home` writes into a temp dir.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runTests } from '../integrate.mjs';
import { recordRun, reusableRun, testRunsFor, worktreeTree } from '../test-ledger.mjs';
import { testCli } from '../test-cli.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

function tmp(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-test-ledger-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repository on `slice/demo-s1` with one commit holding a file and a run record. */
function repo(t) {
  const cwd = tmp(t, 'repo');
  git(cwd, 'init', '-q', '-b', 'slice/demo-s1');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'test');
  git(cwd, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'a\n');
  fs.mkdirSync(path.join(cwd, 'docs', 'design', 'x'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs', 'design', 'x', 'run.json'), '{"slices":[]}\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'one');
  return cwd;
}

const ledgerOf = (home) => path.join(home, '.claude', 'pilot', 'tests', 'ledger.jsonl');
const rowsOf = (home) => fs.readFileSync(ledgerOf(home), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

/** A row as `runTests` writes it for `cwd`, `over` laid on top. */
function row(cwd, over = {}) {
  return {
    at: new Date().toISOString(), where: 'implementer', branch: 'slice/demo-s1', slug: null, sha: git(cwd, 'rev-parse', 'HEAD'),
    tree: worktreeTree(cwd), since: null, scope: null, exit: 0, minutes: 0.01, platform: process.platform,
    node: Number(process.versions.node.split('.')[0]), ...over,
  };
}

test('a run writes one row with its own exit', (t) => {
  const cwd = repo(t);
  const home = tmp(t, 'home');
  const tree = worktreeTree(cwd);
  const red = runTests(cwd, 'node -e "process.exit(3)"', { label: 'red', where: 'integrate', home, slot: false });
  assert.equal(red.status, 3);
  assert.equal(typeof red.minutes, 'number');
  const [first] = rowsOf(home);
  assert.equal(first.exit, 3);
  assert.equal(first.where, 'integrate');
  assert.equal(first.tree, tree);
  assert.equal(first.branch, 'slice/demo-s1');
  assert.equal(first.slug, 'demo');
  assert.equal(first.sha, git(cwd, 'rev-parse', 'HEAD'));
  assert.equal(typeof first.minutes, 'number');
  runTests(cwd, 'node -e "process.exit(0)"', { label: 'green', where: 'integrate', home, slot: false });
  const rows = rowsOf(home);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].exit, 0);
  if (process.platform !== 'win32') assert.equal(fs.statSync(ledgerOf(home)).mode & 0o777, 0o600);
});

test('a red row is never reused', (t) => {
  const cwd = repo(t);
  const home = tmp(t, 'home');
  const tree = worktreeTree(cwd);
  recordRun(row(cwd, { exit: 3 }), { home });
  assert.equal(reusableRun({ tree, since: null, home }), null);
  recordRun(row(cwd, { scope: 'selected 2 of 9 test files since abc1234; cargo deferred to integrate' }), { home });
  assert.equal(reusableRun({ tree, since: null, home }), null);
  recordRun(row(cwd, { exit: '3' }), { home });
  assert.equal(reusableRun({ tree, since: null, home }), null);
  recordRun(row(cwd), { home });
  assert.equal(reusableRun({ tree, since: null, home })?.exit, 0);
});

test('reuse is the exact tree', (t) => {
  const cwd = repo(t);
  const home = tmp(t, 'home');
  fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'one\n');
  const since = git(cwd, 'rev-parse', 'HEAD');
  recordRun(row(cwd, { since }), { home });
  assert.ok(reusableRun({ tree: worktreeTree(cwd), since, home }));
  // Another since is not the same run; a full row stands for any since.
  assert.equal(reusableRun({ tree: worktreeTree(cwd), since: 'b'.repeat(40), home }), null);
  fs.writeFileSync(path.join(cwd, 'docs', 'design', 'x', 'run.json'), '{"slices":[1]}\n');
  assert.ok(reusableRun({ tree: worktreeTree(cwd), since, home }), 'run.json is taken from HEAD');
  fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'onf\n');
  assert.equal(reusableRun({ tree: worktreeTree(cwd), since, home }), null);
  const other = tmp(t, 'other');
  recordRun(row(cwd, { platform: process.platform === 'win32' ? 'linux' : 'win32' }), { home: other });
  assert.equal(reusableRun({ tree: worktreeTree(cwd), since, home: other }), null);
  recordRun(row(cwd, { node: Number(process.versions.node.split('.')[0]) - 1 }), { home: other });
  assert.equal(reusableRun({ tree: worktreeTree(cwd), since, home: other }), null);
  recordRun(row(cwd), { home: other });
  assert.ok(reusableRun({ tree: worktreeTree(cwd), since, home: other }), 'a full row stands for any since');
  assert.deepEqual(testRunsFor({ slug: 'demo', home: other }).length, 3);
  assert.deepEqual(testRunsFor({ slug: 'else', home: other }), []);
});

test('pilot test reuses a green tree', (t) => {
  const cwd = repo(t);
  const home = tmp(t, 'home');
  const counter = path.join(tmp(t, 'count'), 'count.txt');
  const script = path.join(path.dirname(counter), 'suite.cjs');
  fs.writeFileSync(script, `require('fs').appendFileSync(${JSON.stringify(counter)}, 'x');\n`);
  git(cwd, 'config', '--local', 'pilot.test', `node "${script}"`);
  const out = [];
  const print = (line) => out.push(line);
  assert.equal(testCli(['--as', 'implementer', '--since', 'HEAD'], { cwd, home, print }), 0);
  assert.equal(fs.readFileSync(counter, 'utf8'), 'x');
  assert.equal(testCli(['--as', 'implementer', '--since', 'HEAD'], { cwd, home, print }), 0);
  assert.equal(fs.readFileSync(counter, 'utf8'), 'x', 'no test process for a green tree');
  assert.match(out.at(-1), new RegExp(`^tests reused: implementer ${git(cwd, 'rev-parse', '--short=7', 'HEAD')}$`));
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'b\n');
  assert.equal(testCli(['--as', 'implementer', '--since', 'HEAD'], { cwd, home, print }), 0);
  assert.equal(fs.readFileSync(counter, 'utf8'), 'xx', 'a changed tree runs');
  assert.equal(rowsOf(home).at(-1).where, 'implementer');
});

test('no row from inside the suite', (t) => {
  const cwd = repo(t);
  const saved = process.env.PILOT_GATE_HOME_STORE;
  process.env.PILOT_GATE_HOME_STORE = path.join(tmp(t, 'store'), 'deck.json');
  t.after(() => (saved === undefined ? delete process.env.PILOT_GATE_HOME_STORE : (process.env.PILOT_GATE_HOME_STORE = saved)));
  const run = runTests(cwd, 'node -e "process.exit(0)"', { label: 'nested', where: 'integrate', slot: false });
  assert.equal(run.status, 0);
  assert.equal(fs.existsSync(ledgerOf(os.homedir())), false);
});
