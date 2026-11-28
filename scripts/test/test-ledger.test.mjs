// tested-once S1 (spec 4; L3-L5, L8): the ledger's rows and their reuse. Scratch repositories and homes.

// Before anything reads the home directory: a test that forgets `home` writes into a temp dir.
import { gitFixture } from './lib/git-fixture.mjs';

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

/**
 * `{ cwd, sha }`: a repository on `slice/demo-s1` with one commit holding a file and a run record,
 * built once per process and restored before each test (test-body-git S13's fixture).
 */
const repo = (t) => gitFixture(t, 'ledger-repo', (cwd) => {
  git(cwd, 'init', '-q', '-b', 'slice/demo-s1');
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'a\n');
  fs.mkdirSync(path.join(cwd, 'docs', 'design', 'x'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs', 'design', 'x', 'run.json'), '{"slices":[]}\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'one');
  return { cwd, sha: git(cwd, 'rev-parse', 'HEAD') };
});

/** The command every hand-made row ran, and every reuse below asks for. */
const CMD = 'npm test';

const ledgerOf = (home) => path.join(home, '.claude', 'pilot', 'tests', 'ledger.jsonl');
const rowsOf = (home) => fs.readFileSync(ledgerOf(home), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

/** A row as `runTests` writes it at commit `sha` on worktree `tree`, `over` laid on top. */
function row({ sha, tree }, over = {}) {
  return {
    where: 'implementer', branch: 'slice/demo-s1', sha, tree, since: null, scope: null, command: CMD, cargo: null, exit: 0, minutes: 0.01, ...over,
  };
}

test('a run writes one row with its own exit', (t) => {
  const { cwd, sha: head } = repo(t);
  const home = tmp(t, 'home');
  const tree = worktreeTree(cwd);
  const red = runTests(cwd, 'node -e "process.exit(3)"', { label: 'red', where: 'integrate', home, slot: false });
  assert.equal(red.status, 3);
  assert.equal(typeof red.minutes, 'number');
  const { exit, where, branch, slug, sha } = rowsOf(home)[0];
  assert.deepEqual({ exit, where, tree: rowsOf(home)[0].tree, branch, slug, sha },
    { exit: 3, where: 'integrate', tree, branch: 'slice/demo-s1', slug: 'demo', sha: head });
  runTests(cwd, 'node -e "process.exit(0)"', { label: 'green', where: 'integrate', home, slot: false });
  assert.deepEqual(rowsOf(home).map((row) => row.exit), [3, 0]);
  if (process.platform !== 'win32') assert.equal(fs.statSync(ledgerOf(home)).mode & 0o777, 0o600);
});

test('a red row is never reused', (t) => {
  const { cwd, sha } = repo(t);
  const home = tmp(t, 'home');
  const tree = worktreeTree(cwd);
  recordRun(row({ sha, tree }, { exit: 3 }), { home });
  assert.equal(reusableRun({ tree, since: null, home, command: CMD }), null);
  recordRun(row({ sha, tree }, { scope: 'selected 2 of 9 test files since abc1234; cargo deferred to integrate' }), { home });
  assert.equal(reusableRun({ tree, since: null, home, command: CMD }), null);
  recordRun(row({ sha, tree }, { exit: '3' }), { home });
  assert.equal(reusableRun({ tree, since: null, home, command: CMD }), null);
  // A row that skipped cargo is complete only to an asker that runs cargo itself, or to a slice-scope run.
  recordRun(row({ sha, tree }, { cargo: 'skipped' }), { home });
  assert.equal(reusableRun({ tree, since: null, home, command: CMD }), null);
  assert.equal(reusableRun({ tree, since: null, home, command: CMD, runsCargo: true })?.cargo, 'skipped');
  assert.equal(reusableRun({ tree, since: null, home, command: CMD, scope: 'slice' })?.cargo, 'skipped');
  assert.equal(reusableRun({ tree, since: null, home, command: 'npm run other', runsCargo: true }), null);
  assert.equal(reusableRun({ tree, since: null, home }), null, 'no command asked, none reused');
  recordRun(row({ sha, tree }), { home });
  assert.equal(reusableRun({ tree, since: null, home, command: CMD })?.exit, 0);
});

test('reuse is the exact tree', (t) => {
  const { cwd, sha } = repo(t);
  const home = tmp(t, 'home');
  fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'one\n');
  const since = sha;
  const tree = worktreeTree(cwd);
  recordRun(row({ sha, tree }, { since }), { home });
  assert.ok(reusableRun({ tree, since, home, command: CMD }));
  // Another since is not the same run; a full row stands for any since.
  assert.equal(reusableRun({ tree, since: 'b'.repeat(40), home, command: CMD }), null);
  fs.writeFileSync(path.join(cwd, 'docs', 'design', 'x', 'run.json'), '{"slices":[1]}\n');
  assert.ok(reusableRun({ tree: worktreeTree(cwd), since, home, command: CMD }), 'run.json is taken from HEAD');
  fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'onf\n');
  const changed = worktreeTree(cwd);
  assert.equal(reusableRun({ tree: changed, since, home, command: CMD }), null);
  const other = tmp(t, 'other');
  // recordRun stamps this process's platform and node over a caller's, so another's row is written as it would land.
  recordRun(row({ sha, tree: changed }, { platform: 'elsewhere', node: 0 }), { home: other });
  const [mine] = rowsOf(other);
  assert.deepEqual([mine.platform, mine.node, mine.slug], [process.platform, Number(process.versions.node.split('.')[0]), 'demo']);
  fs.writeFileSync(ledgerOf(other), [{ platform: process.platform === 'win32' ? 'linux' : 'win32' }, { node: mine.node - 1 }]
    .map((over) => JSON.stringify({ ...mine, ...over })).join('\n') + '\n');
  assert.equal(reusableRun({ tree: changed, since, home: other, command: CMD }), null, 'another platform or node is not this run');
  recordRun(row({ sha, tree: changed }), { home: other });
  assert.ok(reusableRun({ tree: changed, since, home: other, command: CMD }), 'a full row stands for any since');
  assert.deepEqual([testRunsFor({ slug: 'demo', home: other }).length, testRunsFor({ slug: 'else', home: other }).length], [3, 0]);
});

test('pilot test reuses a green tree', (t) => {
  const { cwd, sha } = repo(t);
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
  assert.match(out.at(-1), new RegExp(`^tests reused: implementer ${sha.slice(0, 7)}$`));
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'b\n');
  assert.equal(testCli(['--as', 'implementer', '--since', 'HEAD'], { cwd, home, print }), 0);
  assert.equal(fs.readFileSync(counter, 'utf8'), 'xx', 'a changed tree runs');
  assert.equal(rowsOf(home).at(-1).where, 'implementer');
});

test('no row from inside the suite', (t) => {
  const { cwd } = repo(t);
  const saved = process.env.PILOT_GATE_HOME_STORE;
  process.env.PILOT_GATE_HOME_STORE = path.join(tmp(t, 'store'), 'deck.json');
  t.after(() => (saved === undefined ? delete process.env.PILOT_GATE_HOME_STORE : (process.env.PILOT_GATE_HOME_STORE = saved)));
  const run = runTests(cwd, 'node -e "process.exit(0)"', { label: 'nested', where: 'integrate', slot: false });
  assert.equal(run.status, 0);
  assert.equal(fs.existsSync(ledgerOf(os.homedir())), false);
});
