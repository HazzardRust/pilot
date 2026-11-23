/**
 * cheap-suite S3 (spec 7; L5, A3): the shared Rune target sits outside the checkout and the deck's store,
 * and `boundTarget` removes it whole once it holds more than `RUNE_TARGET_MAX` fingerprint units.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { RUNE_TARGET_MAX, boundTarget, runeTargetDir, staleRoot } = await import('../rune-target.mjs');

/** A scratch target dir with `units` entries under `debug/.fingerprint`, removed when the test ends. */
function target(t, units) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'rune-target');
  const prints = path.join(dir, 'debug', '.fingerprint');
  fs.mkdirSync(prints, { recursive: true });
  for (let n = 0; n < units; n++) fs.mkdirSync(path.join(prints, `unit-${n}`));
  return dir;
}

test('the shared build stays bounded: 401 fingerprint units are wiped, the bound is 400 (A3)', (t) => {
  assert.equal(RUNE_TARGET_MAX, 400);
  const dir = target(t, 401);
  assert.deepEqual(boundTarget(dir), { wiped: true, units: 401 });
  assert.equal(fs.existsSync(dir), false);
});

test('the shared build stays bounded: a small one, and one at the bound, are kept', (t) => {
  const small = target(t, 3);
  assert.deepEqual(boundTarget(small), { wiped: false, units: 3 });
  assert.equal(fs.existsSync(path.join(small, 'debug', '.fingerprint', 'unit-0')), true);
  const full = target(t, 2);
  assert.deepEqual(boundTarget(full, { max: 2 }), { wiped: false, units: 2 });
  assert.equal(fs.existsSync(full), true);
});

test('a target never built is 0 units and nothing is removed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(boundTarget(path.join(root, 'rune-target')), { wiped: false, units: 0 });
  assert.equal(fs.existsSync(root), true);
});

test('the shared target is under LOCALAPPDATA on Windows, never the checkout or the deck store (L5)', () => {
  assert.equal(runeTargetDir({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32'), 'C:\\Users\\me\\AppData\\Local\\pilot\\rune-target');
  // Unset or relative, it falls back to the home directory: a relative one would land in the checkout.
  for (const env of [{}, { LOCALAPPDATA: 'cache' }]) {
    const dir = runeTargetDir(env, 'win32');
    assert.ok(path.win32.isAbsolute(dir), dir);
    assert.ok(dir.endsWith('\\pilot\\rune-target'), dir);
    assert.ok(!dir.includes('.claude'), dir);
  }
  assert.equal(runeTargetDir({ XDG_CACHE_HOME: '/home/me/.cache' }, 'linux'), '/home/me/.cache/pilot/rune-target');
});

test('staleRoot dates the crate\'s own sources now and nothing else, so cargo rebuilds it from this worktree', (t) => {
  const crate = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-crate-'));
  t.after(() => fs.rmSync(crate, { recursive: true, force: true }));
  const old = new Date('2001-01-01T00:00:00Z');
  const files = ['build.rs', 'src/lib.rs', 'src/regions/a.rs', 'tests/deck/main.rs', 'tests/deck/support/mod.rs', 'Cargo.toml', 'theme.json'];
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(crate, rel)), { recursive: true });
    fs.writeFileSync(path.join(crate, rel), '');
    fs.utimesSync(path.join(crate, rel), old, old);
  }
  const now = new Date('2026-11-23T12:00:00Z');
  assert.equal(staleRoot(crate, now), 5);
  const dated = (rel) => fs.statSync(path.join(crate, rel)).mtime.toISOString();
  for (const rel of files.slice(0, 5)) assert.equal(dated(rel), now.toISOString(), rel);
  for (const rel of files.slice(5)) assert.equal(dated(rel), old.toISOString(), rel);
});

test('staleRoot throws on a crate with no build.rs, for the gate to name', (t) => {
  const crate = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-crate-'));
  t.after(() => fs.rmSync(crate, { recursive: true, force: true }));
  fs.mkdirSync(path.join(crate, 'src'));
  fs.mkdirSync(path.join(crate, 'tests'));
  assert.throws(() => staleRoot(crate), { code: 'ENOENT' });
});
