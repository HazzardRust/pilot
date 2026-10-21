/**
 * Test repositories built once per process and restored before each test (git-light-tests S1;
 * A1, A2). Importing this module imports `fake-home.mjs` and points `GIT_CONFIG_GLOBAL` at a
 * file in that private home holding the identity every builder used to `git config` per
 * repository, so no builder spawns a `git config` and every git below inherits it.
 *
 * `gitFixture(t, key, build)`: the first call for `key` makes a temp directory, runs
 * `build(dir)` and snapshots the directory as the key's template. A later call, from a later
 * test, restores the directory from the template at the same path, timestamps kept, and
 * returns the same value, so every path, closure over a path and SHA the build returned stays
 * valid. node:test runs a file's tests one after another, which is what makes restoring in
 * place safe. A second call for `key` inside one test builds fresh into a new directory.
 *
 * Every directory, and the template, is a `fs.realpathSync.native` path, so the spelling git
 * and the code under test print (macOS `/private/var`, Windows long names) is the one `build`
 * and the tests see, whatever `os.tmpdir()` returns.
 *
 * `build` must not call `t.after`, nor return closures over mutable in-memory state: its value
 * is shared by every test of the key. Every directory goes when the process exits.
 *
 * Import it first:
 *
 *     import { gitFixture } from './lib/git-fixture.mjs';
 */

import { FAKE_HOME } from './fake-home.mjs';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GLOBAL_CONFIG = path.join(FAKE_HOME, '.gitconfig');
fs.writeFileSync(GLOBAL_CONFIG, [
  '[user]', '\tname = test', '\temail = t@example.com',
  '[commit]', '\tgpgsign = false',
  // A restored file keeps its mtime and size but not its inode or ctime; compare only those two.
  '[core]', '\tcheckStat = minimal',
  // No auto maintenance, detached or not: a detached run holds objects/maintenance.lock after the
  // git that spawned it returns, and the snapshot's copy meets it vanishing (ENOENT on macOS).
  '[maintenance]', '\tauto = false', '\tautoDetach = false',
  '[gc]', '\tauto = 0', '\tautoDetach = false',
  '',
].join('\n'));
process.env.GIT_CONFIG_GLOBAL = GLOBAL_CONFIG;

/** key -> { dir, template, value, test }: `test` is the TestContext that last had `dir`. */
const fixtures = new Map();
const made = [];

function tempDir(prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
}

export function gitFixture(t, key, build) {
  const known = fixtures.get(key);
  if (known && known.test !== t) {
    fs.rmSync(known.dir, { recursive: true, force: true });
    copy(known.template, known.dir);
    known.test = t;
    return known.value;
  }
  const dir = tempDir('pilot-fixture-');
  const value = build(dir);
  if (!known) {
    const template = tempDir('pilot-fixture-template-');
    copy(dir, template);
    fixtures.set(key, { dir, template, value, test: t });
  }
  return value;
}

process.on('exit', () => {
  for (const dir of made) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // A temp directory left behind is untidy; throwing here would fail a suite that passed.
    }
  }
});
