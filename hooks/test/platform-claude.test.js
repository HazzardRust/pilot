'use strict';

/**
 * S5 of mac-linux (spec 2, 9): the `claude` a session starts is found off an absolute PATH entry
 * only, so a `./claude` planted in a repository is never run. Tests 1, 2 and 4 pass `platform`, so
 * they rest on this test on any host: on Windows the POSIX PATH spells the temp directory without
 * its drive, which the host resolves against the current one. Test 3 needs a file mode Windows does
 * not keep, so it runs on POSIX only and rests on the all-os CI job.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { claudeBin, isWindows, onSearchPath } = require('../lib/platform.js');

const POSIX_ONLY = isWindows() && 'Windows keeps no execute bit, so a 0644 file is still runnable there';

/** `dir` as a POSIX PATH entry: itself off Windows, drive-less with forward slashes on it. */
const posixEntry = (dir) => (isWindows() ? dir.slice(path.parse(dir).root.length - 1).replaceAll('\\', '/') : dir);

/** A repository holding an executable `claude`, made the cwd, and a `bin` beside it; both removed after. */
function plantedRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-claude-bin-'));
  const before = process.cwd();
  t.after(() => {
    process.chdir(before); // out of the repo first, so Windows lets it go
    fs.rmSync(root, { recursive: true, force: true });
  });
  const repo = path.join(root, 'repo');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(repo);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(repo, 'claude'), '#!/bin/sh\necho planted\n', { mode: 0o755 });
  process.chdir(repo);
  return { bin };
}

test('a claude planted in the repository is not run', (t) => {
  const { bin } = plantedRepo(t);
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\necho installed\n', { mode: 0o755 });
  const entry = posixEntry(bin);
  assert.equal(claudeBin({ PATH: `.:${entry}` }, 'linux'), path.posix.join(entry, 'claude'));
});

test('no absolute hit is null', (t) => {
  const { bin } = plantedRepo(t);
  fs.mkdirSync(path.join(bin, 'claude')); // a directory of that name is not a hit either
  assert.equal(claudeBin({ PATH: '.' }, 'linux'), null, 'never the bare name');
  assert.equal(claudeBin({ PATH: posixEntry(bin) }, 'linux'), null, 'nor a directory named claude');
  assert.equal(claudeBin({ PATH: ':bin:.' }, 'darwin'), null, 'nor an empty or relative entry');
  assert.equal(claudeBin({}, 'linux'), null, 'nor no PATH at all');
});

test('a non-executable file is skipped', { skip: POSIX_ONLY }, (t) => {
  const { bin } = plantedRepo(t);
  const file = path.join(bin, 'claude');
  fs.writeFileSync(file, '#!/bin/sh\n');
  fs.chmodSync(file, 0o644);
  assert.equal(onSearchPath('claude', { PATH: bin }, 'linux'), null);
  fs.chmodSync(file, 0o755);
  assert.equal(onSearchPath('claude', { PATH: bin }, 'linux'), file, 'the same file, once executable, is found');
});

test('windows names claude.exe', (t) => {
  const { bin } = plantedRepo(t);
  fs.writeFileSync(path.join(bin, 'claude.exe'), '');
  assert.equal(claudeBin({ Path: `.;${bin}` }, 'win32'), path.join(bin, 'claude.exe'));
});
