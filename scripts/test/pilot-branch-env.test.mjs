/**
 * S4 of blocked-steps: `PILOT_BRANCH` names the pilot branch from the environment, so a scratch
 * clone lands on its own branch with no file edit (spec 7; A4). The name is read once, at
 * import, so each case runs in a child process with its own env; nothing reaches GitHub.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE = pathToFileURL(path.join(ROOT, 'scripts', 'pilot-branch.mjs')).href;
const PILOT = path.join(ROOT, 'bin', 'pilot.mjs');

/** `process.env` with `PILOT_BRANCH` set to `value`, or removed when `value` is undefined. */
function envWith(value) {
  const env = { ...process.env };
  delete env.PILOT_BRANCH;
  if (value !== undefined) env.PILOT_BRANCH = value;
  return env;
}

/** Runs `body` as an ES module in a child with `PILOT_BRANCH` as given; `mod` is pilot-branch.mjs. */
function child(value, body, cwd = ROOT) {
  const source = `const mod = await import(${JSON.stringify(MODULE)});\n${body}`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd, env: envWith(value), encoding: 'utf8', windowsHide: true });
}

/** Prints `pilotBranch` over a runner that reads no repository, so only the env can answer. */
const READ = "process.stdout.write(mod.pilotBranch(() => { throw Object.assign(new Error('no repo'), { status: 1 }); }));";

test('the env names the pilot branch', () => {
  const set = child('qa-scratch-pilot', READ);
  assert.equal(set.status, 0, set.stderr);
  assert.equal(set.stdout, 'qa-scratch-pilot');
});

test('a bad name is refused when read', () => {
  for (const bad of ['--all', 'a..b', 'refs/heads/x', 'heads/x', 'HEAD', 'a b', 'Qa-Scratch', 'Qa-Scratch-pilot', 'a..b-pilot']) {
    const run = child(bad, READ);
    assert.notEqual(run.status, 0, `${bad} is refused`);
    assert.equal(run.stdout, '', `${bad} is never used`);
    assert.match(run.stderr, /PILOT_BRANCH/, `${bad}: the error names the env`);
  }
});

test('the default branch stays refused', (t) => {
  const { origin, work } = gitFixture(t, 'pilot-branch-env:main', (root) => {
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const bare = path.join(root, 'origin.git');
    const clone = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', bare);
    git(root, 'clone', '-q', bare, clone);
    git(clone, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(clone, 'push', '-q', 'origin', 'main');
    return { origin: bare, work: clone };
  });
  const refs = () => execFileSync('git', ['for-each-ref', '--format=%(refname) %(objectname)'], { cwd: origin, encoding: 'utf8' });
  const before = refs();
  const run = child('main', `
    try {
      mod.ensurePilotBranch({ git: (args) => mod.git(process.cwd(), ...args) });
      process.stdout.write('not refused');
    } catch (err) {
      process.stdout.write(err.message);
    }`, work);
  assert.equal(run.status, 0, run.stderr);
  // user-pilot-branch A4: the name's shape refuses it now, before the push guard is reached.
  assert.match(run.stdout, /^PILOT_BRANCH is "main": not <login>-pilot or pilot$/);
  assert.equal(refs(), before, "origin's refs do not move");
});

test('help names the env', () => {
  const help = spawnSync(process.execPath, [PILOT, 'help'], { env: envWith(undefined), encoding: 'utf8', windowsHide: true });
  assert.equal(help.status, 0, help.stderr);
  const block = help.stdout.split(/environment variables change how it behaves:/)[1] ?? '';
  assert.match(block, /^ {2}PILOT_BRANCH\b/m);
});
