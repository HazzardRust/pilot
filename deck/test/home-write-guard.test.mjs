/**
 * home-store-guard S2 (spec 1; L1, L4, A1): under the gate, `PILOT_GATE_HOME_STORE` names the home
 * store and `PILOT_GATE_HOME_LOG` a log; `refuseGateHomeWrite` refuses a write to that store, logging
 * who tried, and passes every other path. The guarded store is a temp file, so nothing here touches
 * the real home store or port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { refuseGateHomeWrite } from '../store-dir.mjs';
import { postItem, storeFile } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

/** Sets `name` to `value` (deleting it when undefined) until the test ends. */
function setEnv(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

/** A temp dir whose `deck.json` the env guards, with the log beside it; neither file exists yet. */
function guarded(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-guarded-home-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = path.join(dir, 'deck.json');
  const log = path.join(dir, 'home-writes.log');
  setEnv(t, 'PILOT_GATE_HOME_STORE', store);
  setEnv(t, 'PILOT_GATE_HOME_LOG', log);
  return { dir, store, log };
}

test('a guarded write is refused and logged', (t) => {
  const { store, log } = guarded(t);
  // Another spelling of the same file: a trailing `.` segment, and upper case where paths ignore it.
  const spelled = path.join(path.dirname(store), '.', process.platform === 'win32' ? 'DECK.JSON' : 'deck.json');
  assert.throws(() => refuseGateHomeWrite(spelled), { message: `home store write refused under the gate: ${spelled}` });
  const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(`${process.pid}\t`), lines[0]);
  assert.ok(lines[0].endsWith(`\t${spelled}`), lines[0]);
});

test('any other path passes', (t) => {
  const { log } = guarded(t);
  tempDeck(t);
  const other = storeFile();
  assert.equal(refuseGateHomeWrite(other), other);
  assert.equal(fs.existsSync(log), false);
  setEnv(t, 'PILOT_GATE_HOME_STORE', undefined);
  const home = path.join(os.homedir(), '.claude', 'pilot', 'deck.json');
  assert.equal(refuseGateHomeWrite(home), home);
  assert.equal(fs.existsSync(log), false);
});

test('the store write goes through it', (t) => {
  const { dir, store, log } = guarded(t);
  setEnv(t, 'PILOT_DECK_DIR', dir);
  assert.throws(() => postItem({ kind: 'question', title: 'Guarded?', body: 'A or B', repo: 'D:/work/alpha', author: '' }), {
    message: /^home store write refused under the gate: /,
  });
  assert.equal(fs.existsSync(store), false);
  assert.equal(fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length, 1);
});
