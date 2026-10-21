#!/usr/bin/env node
/**
 * store-durability S2 (spec 1, L8, A6): the rename in the shared atomic-write
 * helper retries a Windows lock (EPERM, EBUSY, EACCES) for about a second,
 * then throws the first error with no `.tmp` left. The rename and the sleep
 * are injected, so no test here waits on a real clock or a real lock.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { atomicWriteFileSync } = require('../lib/atomic-write.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function codeError(code) {
  const err = new Error(`${code}: simulated rename failure`);
  err.code = code;
  return err;
}

/** A rename that throws each code in `codes` in turn, then renames for real. */
function failingRename(codes) {
  const thrown = [];
  const renameSync = (from, to) => {
    if (thrown.length < codes.length) {
      const err = codeError(codes[thrown.length]);
      thrown.push(err);
      throw err;
    }
    fs.renameSync(from, to);
  };
  return { renameSync, thrown };
}

function recordingSleep() {
  const sleeps = [];
  return { sleep: (ms) => sleeps.push(ms), sleeps };
}

test('a rename that fails twice then succeeds writes', (t) => {
  const target = path.join(tempDir(t), 'state.json');
  fs.writeFileSync(target, 'old');
  const { renameSync } = failingRename(['EPERM', 'EBUSY']);
  const { sleep, sleeps } = recordingSleep();

  atomicWriteFileSync(target, 'new', { renameSync, sleep });

  assert.equal(fs.readFileSync(target, 'utf8'), 'new');
  assert.equal(sleeps.length, 2);
});

test('a rename failing past the budget throws the original error', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'state.json');
  fs.writeFileSync(target, 'old');
  const { renameSync, thrown } = failingRename(Array(100).fill('EACCES'));
  const { sleep, sleeps } = recordingSleep();

  assert.throws(
    () => atomicWriteFileSync(target, 'new', { renameSync, sleep }),
    (err) => err === thrown[0] && err.code === 'EACCES',
  );

  const total = sleeps.reduce((sum, ms) => sum + ms, 0);
  assert.ok(total >= 900, `slept ${total} ms in all`);
  assert.ok(total <= 1100, `slept ${total} ms in all, about a second`);
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')), []);
  assert.equal(fs.readFileSync(target, 'utf8'), 'old');
});

test('another error code is not retried', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'state.json');
  const { renameSync } = failingRename(['ENOENT']);
  const { sleep, sleeps } = recordingSleep();

  assert.throws(() => atomicWriteFileSync(target, 'new', { renameSync, sleep }), { code: 'ENOENT' });
  assert.equal(sleeps.length, 0);
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')), []);
});

test('with no options it renames for real', (t) => {
  const target = path.join(tempDir(t), 'state.json');
  atomicWriteFileSync(target, 'plain');
  assert.equal(fs.readFileSync(target, 'utf8'), 'plain');
});
