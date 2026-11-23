/**
 * Slice S3 of ui-design-workflow: a rebuild keeps the user's Rune window.
 *
 * Windows will not let `cargo build --release` replace `target/release/pilot-deck.exe` while a
 * window runs from it (A9), so the deck runs a copy under `target/run` instead, one per build.
 * Every test builds its own target directory and pins its mtime, so the copy's name is a literal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The suite's empty home, so the open file `openDeck` names is never the user's store.
import '../testUtils.mjs';

const { launchCopy } = await import('../open.mjs');

// 2023-11-14T22:13:20Z and one second later, as file times.
const BUILD_1 = 1_700_000_000;
const BUILD_2 = 1_700_000_001;

/** A target directory of its own with a built `release/pilot-deck.exe` stamped `seconds`. */
const builtTarget = (t, seconds) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-target-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.mkdirSync(path.join(target, 'release'));
  const exe = path.join(target, 'release', 'pilot-deck.exe');
  fs.writeFileSync(exe, 'build one');
  fs.utimesSync(exe, seconds, seconds);
  return { target, exe };
};

/** `node:fs` with the named calls replaced. */
const fsWith = (overrides) => ({ ...fs, ...overrides });

/** A call that fails the way the platform does, with `code`. */
const failing = (code) => () => {
  throw Object.assign(new Error(`${code}: refused`), { code });
};

/** The names in `dir` that a half-done copy would leave. */
const parts = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.part'));

const recorder = () => {
  const calls = [];
  return { calls, spawn: (command, args) => (calls.push({ command, args }), { on() {}, unref() {} }) };
};

/** The real deck's environment for this test: nothing set that turns the opener off. */
const asTheRealDeck = (t) => {
  for (const name of ['PILOT_DECK_NO_OPEN', 'PILOT_DECK_DIR', 'PILOT_DECK_PORT']) {
    const was = process.env[name];
    delete process.env[name];
    t.after(() => (was === undefined ? delete process.env[name] : (process.env[name] = was)));
  }
};

test('the spawned path is never the release exe', async (t) => {
  const { target, exe } = builtTarget(t, BUILD_1);
  asTheRealDeck(t);
  // A module copy of its own, so the reopen guard of another test cannot refuse this one.
  const { openDeck } = await import('../open.mjs?copy=spawned');
  const spawns = recorder();

  assert.equal(openDeck(spawns.spawn, 'win32', exe), true);
  const [call] = spawns.calls;
  assert.equal(call.command, path.join(target, 'run', 'pilot-deck-1700000000000.exe'));
  assert.notEqual(call.command, exe);
  assert.equal(fs.readFileSync(call.command, 'utf8'), 'build one', 'and the copy is the build');
});

test('one copy per build', (t) => {
  const { target, exe } = builtTarget(t, BUILD_1);
  const run = path.join(target, 'run');

  const first = launchCopy(exe, run);
  // A mark only the first copy carries: a second copy of the same build would overwrite it.
  fs.appendFileSync(first, ' as opened');
  assert.equal(launchCopy(exe, run), first, 'the same build opens the same copy');
  assert.match(fs.readFileSync(first, 'utf8'), /as opened$/, 'copied once');

  fs.writeFileSync(exe, 'build two');
  fs.utimesSync(exe, BUILD_2, BUILD_2);
  const second = launchCopy(exe, run);
  assert.equal(second, path.join(run, 'pilot-deck-1700000001000.exe'));
  assert.equal(fs.readFileSync(second, 'utf8'), 'build two', 'a new build copies again');
  assert.deepEqual(fs.readdirSync(run), ['pilot-deck-1700000001000.exe'], 'and the old copy, not in use, is gone');
});

for (const code of ['EBUSY', 'EPERM', 'EACCES', 'EIO']) {
  test(`a copy that cannot be removed is kept (${code})`, (t) => {
    const { target, exe } = builtTarget(t, BUILD_1);
    const run = path.join(target, 'run');
    const old = launchCopy(exe, run);

    fs.utimesSync(exe, BUILD_2, BUILD_2);
    const fresh = launchCopy(exe, run, fsWith({ unlinkSync: failing(code) }));

    assert.ok(fs.existsSync(old), 'the running copy is left where it is');
    assert.equal(fresh, path.join(run, 'pilot-deck-1700000001000.exe'), 'and the new build is what opens');
  });
}

test('a newer copy is not removed', (t) => {
  const { target, exe } = builtTarget(t, BUILD_1);
  const run = path.join(target, 'run');
  fs.mkdirSync(run);
  // Another open's copy of a later build, made but not yet started.
  const newer = path.join(run, 'pilot-deck-1700000005000.exe');
  fs.writeFileSync(newer, 'build three');

  launchCopy(exe, run);
  assert.ok(fs.existsSync(newer));
});

test('a copy that fails leaves no part behind', (t) => {
  const { target, exe } = builtTarget(t, BUILD_1);
  const run = path.join(target, 'run');
  const diskFull = fsWith({
    copyFileSync: (from, to) => {
      fs.writeFileSync(to, 'half');
      failing('ENOSPC')();
    },
  });

  assert.throws(() => launchCopy(exe, run, diskFull), { code: 'ENOSPC' });
  assert.deepEqual(parts(run), []);
});

test('a copy another open just made is the one used', (t) => {
  const { target, exe } = builtTarget(t, BUILD_1);
  const run = path.join(target, 'run');
  const copy = path.join(run, 'pilot-deck-1700000000000.exe');
  // The other open renames first and starts its window, so this rename finds a running exe.
  const lost = fsWith({
    renameSync: () => {
      fs.copyFileSync(exe, copy);
      failing('EPERM')();
    },
  });

  assert.equal(launchCopy(exe, run, lost), copy);
  assert.deepEqual(parts(run), []);
});

test('a copy that cannot be made opens the build in place', async () => {
  const { runCopy } = await import('../open.mjs');
  const missing = path.join(os.tmpdir(), 'pilot-no-such-target', 'release', 'pilot-deck.exe');
  assert.equal(runCopy(missing), missing);
});
