/**
 * The merge commands take no shell text on their command line (install-allow-land spec 6;
 * L9, L11): the test they run is the repository's, `npm test` where there is a
 * package.json, else `git config pilot.test`, else a named refusal. A repository with a
 * `test:changed` script gets its selection since a full sha, and nothing but that sha is
 * composed into the command (suite-at-landing spec 5, S5; L9, L10, A5). Scratch
 * repositories on a local bare origin; nothing is pushed.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests, testCommand } from '../integrate.mjs';

const SHA = 'a'.repeat(40);
const BOTH = JSON.stringify({ scripts: { test: 'node scripts/gate.mjs', 'test:changed': 'node scripts/gate.mjs' } });

function tmp(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-test-command-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A clone on `feat/x` with `main`, `pilot` and `slice/a` on its bare origin, and no package.json. */
function scratch(t) {
  return gitFixture(t, 'test-command:scratch', buildScratch);
}

function buildScratch(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'feat/x');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'base');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x', 'HEAD:main', 'HEAD:pilot');
  git(work, 'checkout', '-q', '-b', 'slice/a');
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
  git(work, 'add', 'a.txt');
  git(work, 'commit', '-q', '-m', 'the slice');
  git(work, 'push', '-q', 'origin', 'slice/a');
  git(work, 'checkout', '-q', 'feat/x');
  git(work, 'branch', '-q', '-D', 'slice/a');
  return work;
}

const pilot = (cwd, ...args) => {
  const env = { ...process.env, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const run = spawnSync(process.execPath, [PILOT, ...args], { cwd, encoding: 'utf8', env });
  return { code: run.status, out: run.stdout, err: run.stderr };
};

test('--test is a usage error', (t) => {
  const work = scratch(t);
  assert.deepEqual(pilot(work, 'land', '--test', 'x'), { code: 1, out: '', err: 'usage: pilot land\n' });
  assert.deepEqual(pilot(work, 'sync', '--test', 'x'), { code: 1, out: '', err: 'usage: pilot sync\n' });
  assert.deepEqual(pilot(work, 'integrate', '--test', 'x'), {
    code: 1,
    out: '',
    err: 'usage: pilot integrate [<slice-branch>] [--no-push] [--trailer "<line>"]... | pilot integrate --trial\n',
  });
});

test('a test:changed script selects', (t) => {
  const work = scratch(t);
  fs.writeFileSync(path.join(work, 'package.json'), BOTH);
  assert.deepEqual(testCommand(work, { since: SHA }), { command: `npm run test:changed -- --since=${SHA}`, selected: true });
  const sha256 = 'b'.repeat(64);
  assert.deepEqual(testCommand(work, { since: sha256 }), { command: `npm run test:changed -- --since=${sha256}`, selected: true }, 'a sha-256 repository too');
  assert.deepEqual(testCommand(work), { command: 'npm test', selected: false }, 'no since, no selection');
});

test('a selecting run takes no slot and passes none', (t) => {
  const dir = path.join(tmp(t, 'locks'), 'slots');
  fs.mkdirSync(dir);
  // Under `npm test` this process inherits the gate's slot: run as integrate outside any gate does.
  const inherited = process.env.PILOT_GATE_SLOT;
  delete process.env.PILOT_GATE_SLOT;
  t.after(() => inherited !== undefined && (process.env.PILOT_GATE_SLOT = inherited));
  const suite = path.join(tmp(t, 'suite'), 'suite.mjs');
  fs.writeFileSync(
    suite,
    [
      "import fs from 'node:fs';",
      'const free = fs.readdirSync(process.argv[2]).length === 0 && process.env.PILOT_GATE_SLOT === undefined;',
      'process.exit(free ? 0 : 9);',
    ].join('\n'),
  );
  const run = runTests(tmp(t, 'cwd'), `node "${suite}" "${dir}"`, { label: 'no-slot', home: tmp(t, 'home'), slots: { dir }, slot: false });
  assert.equal(run.status, 0, 'the suite saw no slot file and no PILOT_GATE_SLOT');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('npm test alone stays full', (t) => {
  const work = scratch(t);
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  assert.deepEqual(testCommand(work, { since: SHA }), { command: 'npm test', selected: false });
  assert.deepEqual(testCommand(work), { command: 'npm test', selected: false });
});

test('git config pilot.test stays full', (t) => {
  const work = scratch(t);
  git(work, 'config', 'pilot.test', 'exit 0');
  assert.deepEqual(testCommand(work, { since: SHA }), { command: 'exit 0', selected: false });
  assert.deepEqual(testCommand(work), { command: 'exit 0', selected: false });
});

test('a ref that is not a sha is refused', (t) => {
  const work = scratch(t);
  fs.writeFileSync(path.join(work, 'package.json'), BOTH);
  for (const since of ['main; rm -rf x', 'main', SHA.slice(0, 7), `${SHA}\n`, SHA.toUpperCase(), `${SHA}; x`, '']) {
    assert.throws(() => testCommand(work, { since }), /not a full sha/, JSON.stringify(since));
  }
});

test('the scope reaches the caller', (t) => {
  const inherited = process.env.PILOT_GATE_SLOT;
  delete process.env.PILOT_GATE_SLOT;
  t.after(() => inherited !== undefined && (process.env.PILOT_GATE_SLOT = inherited));
  const home = tmp(t, 'home');
  const scoped = runTests(tmp(t, 'cwd'), 'node -e "console.log(\'selected 2 of 9 test files since abc1234\')"', { label: 'scoped', home, slot: false });
  assert.equal(scoped.scope, 'selected 2 of 9 test files since abc1234');
  const none = runTests(tmp(t, 'cwd'), 'node -e "console.log(1)"', { label: 'unscoped', home, slots: { dir: path.join(tmp(t, 'locks'), 'slots') } });
  assert.equal(none.scope, null, 'a run that prints no scope line answers null');
});

test('package.json wins', (t) => {
  const work = scratch(t);
  git(work, 'config', 'pilot.test', 'exit 1');
  fs.writeFileSync(path.join(work, 'package.json'), '{}\n');
  assert.deepEqual(testCommand(work), { command: 'npm test', selected: false });
});

test('git config pilot.test is the test command', (t) => {
  const work = scratch(t);
  git(work, 'config', 'pilot.test', 'exit 0');
  assert.deepEqual(testCommand(work), { command: 'exit 0', selected: false });
});

test('neither is a named refusal', (t) => {
  const work = scratch(t);
  const before = git(work, 'rev-parse', 'HEAD');
  assert.equal(testCommand(work), undefined);
  assert.equal(testCommand(work, { since: SHA }), undefined, 'a sha changes nothing');
  assert.deepEqual(pilot(work, 'integrate', 'slice/a', '--no-push'), {
    code: 2,
    out: 'NOT integrated slice/a: no package.json here; set git config pilot.test "<command>"\n',
    err: '',
  });
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing merged');
});

test('only the repository config sets pilot.test, never an include or the environment', (t) => {
  const work = scratch(t);
  fs.writeFileSync(path.join(work, 'tree.cfg'), '[pilot]\n\ttest = from-the-working-tree\n');
  git(work, 'config', 'include.path', '../tree.cfg');
  const env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'pilot.test', GIT_CONFIG_VALUE_0: 'from-the-env' };
  const saved = { ...process.env };
  t.after(() => {
    for (const key of Object.keys(env)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  Object.assign(process.env, env);
  assert.equal(testCommand(work), undefined);
});
