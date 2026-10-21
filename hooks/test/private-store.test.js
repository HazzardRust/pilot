#!/usr/bin/env node
/**
 * mac-linux S7 (spec 5, L6): on a shared Mac or Linux box another user cannot
 * list or read the deck's store or the hooks' `pilot-inbox`. An atomic write
 * lands 0600 and each of the two dirs is 0700, including one that already
 * existed at 0755. The mode pins rest on the ubuntu and macos CI jobs; win32
 * has no POSIX modes, so they are skipped there with that reason.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { atomicWriteFileSync, privateDir } = require('../lib/atomic-write.js');
const { isWindows } = require('../lib/platform.js');

const NO_MODES = isWindows() ? 'win32 has no POSIX file modes; the ubuntu and macos jobs run this' : false;

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function modeOf(p) {
  return fs.statSync(p).mode & 0o777;
}

function withEnv(t, vars) {
  const saved = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    process.env[key] = vars[key];
  }
  t.after(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

test('privateDir makes a missing dir, parents included, and returns it', (t) => {
  const dir = path.join(tempDir(t), 'a', 'b');
  assert.equal(privateDir(dir), dir);
  assert.ok(fs.statSync(dir).isDirectory());
});

test('privateDir keeps the mode on an EPERM chmod, tells onKept, and returns the dir', (t) => {
  const dir = path.join(tempDir(t), 'theirs');
  const chmod = t.mock.method(fs, 'chmodSync', () => { throw Object.assign(new Error('EPERM: chmod refused'), { code: 'EPERM' }); });
  const kept = [];
  assert.equal(privateDir(dir, { onKept: (err) => kept.push(err.code) }), dir);
  assert.equal(privateDir(dir), dir, 'no onKept is fine too');
  assert.deepEqual(kept, ['EPERM']);
  chmod.mock.mockImplementation(() => { throw Object.assign(new Error('EIO: chmod failed'), { code: 'EIO' }); });
  assert.throws(() => privateDir(dir, { onKept: () => kept.push('wrong') }), { code: 'EIO' });
  assert.deepEqual(kept, ['EPERM']);
});

test('an atomic write lands 0600', { skip: NO_MODES }, (t) => {
  const target = path.join(tempDir(t), 'state.json');
  atomicWriteFileSync(target, '{}');
  assert.equal(modeOf(target).toString(8), '600');
});

test('an atomic write over a stale 0644 tmp still lands 0600', { skip: NO_MODES }, (t) => {
  const target = path.join(tempDir(t), 'state.json');
  fs.writeFileSync(`${target}.${process.pid}.tmp`, 'stale', { mode: 0o644 });
  fs.chmodSync(`${target}.${process.pid}.tmp`, 0o644);
  atomicWriteFileSync(target, '{}');
  assert.equal(modeOf(target).toString(8), '600');
});

test('an existing 0755 store dir becomes 0700', { skip: NO_MODES }, (t) => {
  const dir = path.join(tempDir(t), 'pilot');
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  const umask = process.umask();
  privateDir(dir);
  assert.equal(modeOf(dir).toString(8), '700');
  assert.equal(process.umask(), umask, 'no process-wide umask change');
});

test('writeDeck leaves the store private', { skip: NO_MODES }, async (t) => {
  const dir = path.join(tempDir(t), 'pilot');
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  withEnv(t, { PILOT_DECK_DIR: dir });
  const { readDeck, writeDeck } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'deck', 'store-core.mjs')).href);
  writeDeck(readDeck());
  assert.equal(modeOf(dir).toString(8), '700');
  assert.equal(modeOf(path.join(dir, 'deck.json')).toString(8), '600');
});

// A dir the user cannot chmod is one its owner already reaches, so refusing to write buys no privacy (A5).
function storeChmodFails(t, code) {
  const dir = path.join(tempDir(t), 'pilot');
  withEnv(t, { PILOT_DECK_DIR: dir });
  const chmodSync = fs.chmodSync;
  t.mock.method(fs, 'chmodSync', (p, mode) => {
    if (path.resolve(String(p)) === path.resolve(dir)) throw Object.assign(new Error(`${code}: chmod refused`), { code });
    return chmodSync(p, mode);
  });
  const said = t.mock.method(console, 'error', () => {});
  return { dir, said };
}

test('writeDeck writes on, saying so in one line, when the store dir refuses chmod with EPERM', async (t) => {
  const { dir, said } = storeChmodFails(t, 'EPERM');
  const { readDeck, writeDeck } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'deck', 'store-core.mjs')).href);
  writeDeck(readDeck());
  assert.ok(fs.existsSync(path.join(dir, 'deck.json')));
  const lines = said.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes(dir));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /mode its owner set/);
});

test('writeDeck still throws on any other chmod error', async (t) => {
  storeChmodFails(t, 'EIO');
  const { readDeck, writeDeck } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'deck', 'store-core.mjs')).href);
  assert.throws(() => writeDeck(readDeck()), { code: 'EIO' });
});

test('pilot-inbox is private', { skip: NO_MODES }, (t) => {
  const home = tempDir(t);
  const inbox = path.join(home, '.claude', 'pilot-inbox');
  fs.mkdirSync(inbox, { recursive: true, mode: 0o755 });
  fs.chmodSync(inbox, 0o755);
  withEnv(t, { HOME: home, USERPROFILE: home });
  const { claim } = require('../lib/deck.js');
  assert.equal(claim('private-store'), true);
  assert.equal(modeOf(inbox).toString(8), '700');
  assert.equal(modeOf(path.join(inbox, 'claims')).toString(8), '700');
});
