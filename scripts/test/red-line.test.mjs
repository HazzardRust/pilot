/**
 * A red run names its failing tests and its log (clean-landing spec 11, S5; L8). `runTests`
 * writes the suite's output to `~/.claude/pilot/logs/<stamp>-<label>.log` and reads it back;
 * `redLine` is the one red line `pilot sync`, `pilot land` and `pilot integrate` print.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';
import { FAKE_HOME } from './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { sync, main } = await import('../sync.mjs');
const { failingNames, integrate, redLine, runTests } = await import('../integrate.mjs');

// The planted suite is a run of its own, not a subtest reporting to this file's runner.
delete process.env.NODE_TEST_CONTEXT;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-red-line-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A spec-reporter suite with one passing and one failing test, and a nested test whose dump holds a ✖ line. */
function plantedSuite(t) {
  const file = path.join(scratch(t, 'suite'), 'planted.test.mjs');
  fs.writeFileSync(
    file,
    [
      "import { test } from 'node:test';",
      "test('a planted pass', () => {});",
      "test('the planted failure', () => { throw new Error('  ✖ not a test name, a line of output'); });",
    ].join('\n'),
  );
  return `node --test --test-reporter=spec "${file}"`;
}

/** A bare origin with main and pilot, main one commit ahead, and a clone on feat/b. */
function repos(t) {
  return gitFixture(t, 'red-line:repos', buildRepos);
}

function buildRepos(dir) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const work = path.join(dir, 'work');
  const commit = (file) => {
    fs.writeFileSync(path.join(seed, file), `${file}\n`);
    git(seed, 'add', file);
    git(seed, 'commit', '-q', '-m', file);
  };
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit('one.txt');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot', 'main:feat/b');
  commit('two.txt');
  git(seed, 'push', '-q', 'origin', 'main');
  git(dir, 'clone', '-q', '-b', 'feat/b', origin, work);
  return { origin, work };
}

test('a red sync names its failing test and its log', (t) => {
  const { origin, work } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  let message;
  assert.throws(() => sync({ cwd: work, git: (args) => git(work, ...args), test: plantedSuite(t) }), (err) => {
    message = err.message;
    return err.exitCode === 1;
  });

  assert.match(message, /^NOT synced: main@[0-9a-f]{7} merged red: 1 pass, 1 fail; failing: the planted failure; log (.+\.log); nothing pushed$/);
  const log = /; log (.+\.log); nothing pushed$/.exec(message)[1];
  assert.ok(fs.existsSync(log), `the named log exists: ${log}`);
  assert.ok(log.startsWith(path.join(FAKE_HOME, '.claude', 'pilot', 'logs')), 'under the home logs directory');
  assert.doesNotMatch(message, /not a test name/, 'a ✖ inside a failure dump is not a name');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'nothing pushed');
});

test('a log that cannot be written is a refusal that leaves nothing merged', (t) => {
  const { origin, work } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const before = git(work, 'rev-parse', 'HEAD');
  const logs = path.join(FAKE_HOME, '.claude', 'pilot', 'logs');
  fs.rmSync(logs, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(logs), { recursive: true });
  fs.writeFileSync(logs, 'a file where the directory goes');
  t.after(() => fs.rmSync(logs, { force: true }));
  const passing = 'node -e "process.exit(0)"';

  assert.throws(() => sync({ cwd: work, git: (args) => git(work, ...args), test: passing }), (err) =>
    err.exitCode === 1 && /^NOT synced: the tests could not run \(.+\); nothing pushed$/.test(err.message));
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'sync pushed nothing');

  const result = integrate(undefined, { cwd: work, test: passing, install: () => {} });
  assert.match(result.line, /^base NOT taken: the tests could not run \(.+\); not pushed$/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge was undone');
  assert.equal(git(work, 'status', '--porcelain'), '', 'and the tree is clean');
});

test('the log holds the whole run', (t) => {
  const home = scratch(t, 'home');
  const run = runTests(scratch(t, 'cwd'), plantedSuite(t), { label: 'whole', home });

  assert.equal(run.status, 1);
  assert.equal(run.counts, '1 pass, 1 fail');
  assert.deepEqual(run.failing, ['the planted failure']);
  assert.equal(path.dirname(run.log), path.join(home, '.claude', 'pilot', 'logs'));
  assert.match(path.basename(run.log), /^\d{8}T\d{9}Z-whole\.log$/);
  const log = fs.readFileSync(run.log, 'utf8');
  assert.match(log, /✔ a planted pass[\s\S]*ℹ duration_ms [\d.]+\s+✖ failing tests:[\s\S]*✖ the planted failure/, 'every pass, the counts and the failures summary, in order');
  assert.match(log, /✖ failing tests:[\s\S]*Error: {3}✖ not a test name/, 'down to the failure itself');
});

test('a green run keeps no log, and a label names nothing but itself', (t) => {
  const home = scratch(t, 'home');
  const run = runTests(scratch(t, 'cwd'), 'node -e "console.log(1)"', { label: 'main@abc/../$SECRET x', home });

  assert.equal(run.status, 0);
  assert.equal(fs.existsSync(run.log), false, 'a green run leaves nothing behind');
  assert.equal(path.dirname(run.log), path.join(home, '.claude', 'pilot', 'logs'), 'the label cannot leave the logs directory');
  assert.doesNotMatch(path.basename(run.log), /[$/\\ ]/);
});

test('the red line names three tests and counts the rest', () => {
  const run = { status: 1, counts: '5 pass, 5 fail', failing: ['a', 'b', 'c', 'd', 'e'], log: 'C:/logs/x.log' };
  assert.equal(redLine('feat/a', run), 'feat/a merged red: 5 pass, 5 fail; failing: a, b, c (+2 more); log C:/logs/x.log');
  assert.equal(redLine('feat/a', { status: 1, counts: null, failing: [], log: 'C:/logs/x.log' }), 'feat/a merged red: exit 1; log C:/logs/x.log');
  assert.equal(redLine('feat/a', { ...run, failing: ['a', 'b', 'c'] }), 'feat/a merged red: 5 pass, 5 fail; failing: a, b, c; log C:/logs/x.log', 'exactly three: no count');
});

test("a TAP not ok names a test only at the start of a line", () => {
  assert.deepEqual(failingNames(['not ok 1 - top level', '    not ok 1 - a subtest', '# not ok 2 - quoted'].join('\n')), ['top level']);
});

test('the counts are the last summary in the output, not one a test printed earlier', (t) => {
  const home = scratch(t, 'home');
  const twice = `node -e "console.log('ℹ pass 6'); console.log('ℹ fail 0'); console.log('ℹ pass 900'); console.log('ℹ fail 1')"`;
  assert.equal(runTests(scratch(t, 'cwd'), twice, { label: 'twice', home }).counts, '900 pass, 1 fail');
});

test('pilot sync --test is a usage error', (t) => {
  const marker = path.join(scratch(t, 'marker'), 'ran');
  const said = { out: '', err: '' };
  const write = { out: process.stdout.write, err: process.stderr.write };
  process.stdout.write = (text) => ((said.out += text), true);
  process.stderr.write = (text) => ((said.err += text), true);
  let code;
  try {
    code = main(['--test', `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '/')}', '')"`]);
  } finally {
    process.stdout.write = write.out;
    process.stderr.write = write.err;
  }
  assert.equal(code, 1);
  assert.equal(said.err, 'usage: pilot sync\n');
  assert.equal(said.out, '');
  assert.equal(fs.existsSync(marker), false, 'the command never ran');
});
