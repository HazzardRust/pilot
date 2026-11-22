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

/** `node:fs` with every copy counted and `unlinkSync` replaced by `unlink` when given. */
const watchedFs = (unlink) => {
  const copies = [];
  return {
    copies,
    fs: {
      ...fs,
      copyFileSync: (from, to) => {
        copies.push(to);
        return fs.copyFileSync(from, to);
      },
      unlinkSync: unlink ?? fs.unlinkSync,
    },
  };
};

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
  const watched = watchedFs();

  const first = launchCopy(exe, run, watched.fs);
  assert.equal(launchCopy(exe, run, watched.fs), first, 'the same build opens the same copy');
  assert.equal(watched.copies.length, 1, 'copied once');

  fs.writeFileSync(exe, 'build two');
  fs.utimesSync(exe, BUILD_2, BUILD_2);
  const second = launchCopy(exe, run, watched.fs);
  assert.equal(second, path.join(run, 'pilot-deck-1700000001000.exe'));
  assert.equal(watched.copies.length, 2, 'a new build copies again');
  assert.equal(fs.readFileSync(second, 'utf8'), 'build two');
  assert.deepEqual(fs.readdirSync(run), ['pilot-deck-1700000001000.exe'], 'and the old copy, not in use, is gone');
});

for (const code of ['EBUSY', 'EPERM']) {
  test(`a copy in use is kept (${code})`, (t) => {
    const { target, exe } = builtTarget(t, BUILD_1);
    const run = path.join(target, 'run');
    const old = launchCopy(exe, run);

    fs.utimesSync(exe, BUILD_2, BUILD_2);
    const inUse = watchedFs(() => {
      throw Object.assign(new Error(`${code}: resource busy or locked`), { code });
    });
    const fresh = launchCopy(exe, run, inUse.fs);

    assert.ok(fs.existsSync(old), 'the running copy is left where it is');
    assert.ok(fs.existsSync(fresh), 'and the new build is copied beside it');
  });
}
