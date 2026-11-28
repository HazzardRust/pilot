// tested-once S4 (spec 2; L6, L8, A3): QA's `pilot test` reuses CI's proof of the tip's tree. Stubbed host,
// scratch repositories and homes; a counting test script stands for the suite.

// Before anything reads the home directory: a test that forgets `home` writes into a temp dir.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { recordRun, worktreeTree } from '../test-ledger.mjs';
import { testCli } from '../test-cli.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

function tmp(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-test-cli-reuse-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const commit = (cwd, message) => {
  git(cwd, 'add', '.');
  git(cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
};

/**
 * A repository on `feat/demo` with three commits (pilot, the feat tip's parent, the tip) whose test command
 * appends its argv to a count file: `{ cwd, home, pilot, parent, runs }`, `runs()` the argv of each run so far.
 */
function feature(t) {
  const cwd = tmp(t, 'repo');
  const count = path.join(tmp(t, 'count'), 'runs.txt');
  const suite = path.join(path.dirname(count), 'suite.cjs');
  fs.writeFileSync(suite, `require('fs').appendFileSync(${JSON.stringify(count)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`);
  git(cwd, 'init', '-q', '-b', 'feat/demo');
  const scripts = { test: `node "${suite}"`, 'test:changed': `node "${suite}"` };
  fs.writeFileSync(path.join(cwd, 'package.json'), `${JSON.stringify({ scripts })}\n`);
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'a\n');
  const pilot = commit(cwd, 'pilot');
  fs.writeFileSync(path.join(cwd, 'b.txt'), 'b\n');
  const parent = commit(cwd, 'slice one');
  fs.writeFileSync(path.join(cwd, 'c.txt'), 'c\n');
  commit(cwd, 'slice two');
  const runs = () => (fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  return { cwd, home: tmp(t, 'home'), pilot, parent, runs };
}

/** `n` `gate (<os>)` jobs, each `conclusion`, on `tree`. */
const jobs = (tree, n = 3, conclusion = 'success') =>
  ['ubuntu-latest', 'macos-latest', 'windows-latest'].slice(0, n).map((runner) => ({ name: `gate (${runner})`, conclusion, tree }));

/** A host whose `testedTrees` answers `rows` for the tip of `cwd` only. */
const hostOf = (cwd, rows) => ({
  testedTrees(sha) {
    assert.equal(sha, git(cwd, 'rev-parse', 'HEAD'), 'the proof is read on the exact tip');
    return rows;
  },
});

const qa = (repo, host, out) => testCli(['--as', 'qa', '--since', repo.pilot], { cwd: repo.cwd, home: repo.home, host, print: (line) => out.push(line) });

test('a proved tip starts no test', (t) => {
  const repo = feature(t);
  const tree = worktreeTree(repo.cwd);
  const out = [];
  assert.equal(qa(repo, hostOf(repo.cwd, jobs(tree)), out), 0);
  assert.deepEqual(repo.runs(), [], 'no test process');
  assert.equal(out.at(-1), `tests reused: ci proved ${tree.slice(0, 7)} on 3 jobs`);
});

test('two jobs prove nothing', (t) => {
  const repo = feature(t);
  const tree = worktreeTree(repo.cwd);
  assert.equal(qa(repo, hostOf(repo.cwd, jobs(tree, 2)), []), 0);
  assert.equal(repo.runs().length, 1, 'two jobs: the selection runs once');
  const red = [...jobs(tree, 2), { name: 'gate (windows-latest)', conclusion: 'failure', tree }];
  const other = feature(t);
  assert.equal(qa(other, hostOf(other.cwd, red.map((row) => ({ ...row, tree: worktreeTree(other.cwd) }))), []), 0);
  assert.deepEqual(other.runs(), [[`--since=${other.pilot}`]], 'one red job: the selection since pilot runs once');
});

test('a proved tree that differs runs only the difference', (t) => {
  const repo = feature(t);
  const behind = worktreeTree(repo.cwd);
  fs.writeFileSync(path.join(repo.cwd, 'c.txt'), 'c, again\n');
  commit(repo.cwd, 'one file past the proof');
  const out = [];
  assert.equal(qa(repo, hostOf(repo.cwd, jobs(behind)), out), 0);
  assert.deepEqual(repo.runs(), [[`--since=${behind}`]]);
  assert.ok(out.includes(`ci proved ${behind.slice(0, 7)} on 3 jobs`), 'the proof it ran since is printed');
});

test('an integrate row does not stand for QA', (t) => {
  const repo = feature(t);
  const tree = worktreeTree(repo.cwd);
  recordRun({
    at: new Date().toISOString(), where: 'integrate', branch: 'feat/demo', sha: git(repo.cwd, 'rev-parse', 'HEAD'), tree,
    since: repo.parent, scope: null, exit: 0, minutes: 0.01, platform: process.platform, node: Number(process.versions.node.split('.')[0]),
  }, { home: repo.home });
  assert.equal(qa(repo, hostOf(repo.cwd, []), []), 0);
  assert.deepEqual(repo.runs(), [[`--since=${repo.pilot}`]], 'a row since the parent is not one since pilot');
});

/** A green row for `repo`'s tree since pilot, of QA's own selection, whose gate deferred cargo (S2's F1). */
const cargoSkipped = (repo) => recordRun({
  where: 'implementer', branch: 'feat/demo', sha: git(repo.cwd, 'rev-parse', 'HEAD'), tree: worktreeTree(repo.cwd),
  since: repo.pilot, scope: null, command: `npm run test:changed -- --since=${repo.pilot}`, cargo: 'skipped', exit: 0, minutes: 0.01,
}, { home: repo.home });

test('QA does not reuse a row that skipped cargo', (t) => {
  const repo = feature(t);
  cargoSkipped(repo);
  assert.equal(qa(repo, hostOf(repo.cwd, []), []), 0);
  assert.deepEqual(repo.runs(), [[`--since=${repo.pilot}`]], 'the selection runs');
});

test('inside the suite with no home, no ledger is read', (t) => {
  const repo = feature(t);
  const saved = process.env.PILOT_GATE_HOME_STORE;
  process.env.PILOT_GATE_HOME_STORE = path.join(tmp(t, 'store'), 'deck.json');
  t.after(() => (saved === undefined ? delete process.env.PILOT_GATE_HOME_STORE : (process.env.PILOT_GATE_HOME_STORE = saved)));
  // A green full row for this exact tree in the process's home ledger: the host's ledger, as far as this run knows.
  recordRun({
    at: new Date().toISOString(), where: 'implementer', branch: 'feat/demo', sha: git(repo.cwd, 'rev-parse', 'HEAD'), tree: worktreeTree(repo.cwd),
    since: null, scope: null, exit: 0, minutes: 0.01, platform: process.platform, node: Number(process.versions.node.split('.')[0]),
  }, { home: os.homedir() });
  t.after(() => fs.rmSync(path.join(os.homedir(), '.claude', 'pilot', 'tests'), { recursive: true, force: true }));
  const out = [];
  assert.equal(testCli(['--as', 'implementer'], { cwd: repo.cwd, print: (line) => out.push(line) }), 0);
  assert.equal(repo.runs().length, 1, 'the home ledger answered nothing: the suite ran');
});
