/**
 * rune-deck-ui S19 (spec 7; A3): the gate runs the Rune deck's `cargo test` where cargo is on PATH, else
 * prints one skip line. `cargoStep` decides; `runGate`, given `which`, runs it inside the home-store window
 * with the guard env and joins its status to the gate's. `spawn` is injected, so neither node nor cargo starts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { cargoStep, runGate } = await import('../gate.mjs');

const slot = () => ({ slot: 1, waited: false, release: () => {} });
const SKIP = 'rune deck: cargo not on PATH, skipped';
const OFF_WINDOWS = 'rune deck: cargo test runs on Windows only, skipped';

/** A fresh temp dir holding an untouched `deck.json`, removed when the test ends. */
function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gate-cargo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'deck.json');
  fs.writeFileSync(file, '{"items":[]}');
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(file, past, past);
  return { dir, file };
}

/** Runs `runGate` with stdout captured; every spawn is recorded and answered by `answer(command)`. */
function gate(t, { which, answer = () => ({ status: 0 }), platform = 'win32' }) {
  const { dir, file } = store(t);
  const calls = [];
  const written = [];
  const write = t.mock.method(process.stdout, 'write', (chunk) => written.push(String(chunk)) > 0);
  try {
    const code = runGate([], {
      cwd: dir,
      slot,
      read: () => [],
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return answer(command, options);
      },
      homeStore: file,
      deckPid: () => null,
      which,
      platform,
    });
    return { code, calls, out: written.join(''), file };
  } finally {
    write.mock.restore();
  }
}

test('cargo runs where it is: cargoStep names cargo test on the Rune manifest', () => {
  const asked = [];
  const step = cargoStep({}, (cmd) => (asked.push(cmd), 'C:\\Users\\me\\.cargo\\bin\\cargo.exe'), 'win32');
  assert.deepEqual(asked, ['cargo']);
  assert.deepEqual(step, { command: 'cargo', args: ['test', '--manifest-path', 'deck/rune/Cargo.toml'] });
});

test('cargo runs where it is: the gate starts it hidden, in its checkout, under the home-store guard', (t) => {
  const { code, calls, file } = gate(t, { which: () => '/usr/bin/cargo' });
  assert.equal(code, 0);
  const cargo = calls.find((call) => call.command === 'cargo');
  assert.ok(cargo, 'cargo was not started');
  assert.deepEqual(cargo.args, ['test', '--manifest-path', 'deck/rune/Cargo.toml']);
  assert.equal(cargo.options.windowsHide, true);
  assert.equal(cargo.options.env.PILOT_GATE_HOME_STORE, file);
  assert.ok(cargo.options.env.PILOT_GATE_HOME_LOG);
  assert.equal(cargo.options.cwd, path.dirname(file));
});

test('a cargo run that writes the home store is caught by the home-store line', (t) => {
  const touch = (command, options) => {
    if (command === 'cargo') fs.utimesSync(options.env.PILOT_GATE_HOME_STORE, new Date(), new Date());
    return { status: 0 };
  };
  const { code, out } = gate(t, { which: () => 'cargo', answer: touch });
  assert.equal(code, 1);
  assert.match(out, /home store changed: /);
});

test('a failing cargo test fails the gate, and one that cannot start does too', (t) => {
  const failed = gate(t, { which: () => 'cargo', answer: (command) => ({ status: command === 'cargo' ? 101 : 0 }) });
  assert.equal(failed.code, 1);
  const unstarted = gate(t, {
    which: () => 'cargo',
    answer: (command) => (command === 'cargo' ? { status: null, error: new Error('spawn cargo ENOENT') } : { status: 0 }),
  });
  assert.equal(unstarted.code, 1);
});

test('no cargo is one skip line: cargoStep says so', () => {
  assert.deepEqual(cargoStep({}, () => null, 'win32'), { skip: SKIP });
});

test('off Windows the Rune deck is one skip line too, cargo or not (A3: CI runs it on Windows)', (t) => {
  for (const platform of ['linux', 'darwin']) {
    assert.deepEqual(cargoStep({}, () => '/usr/bin/cargo', platform), { skip: OFF_WINDOWS });
    const { code, calls, out } = gate(t, { which: () => '/usr/bin/cargo', platform });
    assert.equal(code, 0);
    assert.equal(calls.length, 1, 'only the suite started');
    assert.equal(out.split('\n').filter((line) => line === OFF_WINDOWS).length, 1);
  }
});

test('the default which finds cargo on the PATH env it is given, with or without an extension', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gate-which-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(cargoStep({ PATH: dir, Path: dir, PATHEXT: '.EXE' }, undefined, 'win32'), { skip: SKIP });
  fs.writeFileSync(path.join(dir, 'cargo.exe'), '');
  assert.equal(cargoStep({ PATH: dir, PATHEXT: '.EXE' }, undefined, 'win32').command, 'cargo');
  assert.equal(cargoStep({ Path: dir, PATHEXT: '.EXE' }, undefined, 'win32').command, 'cargo');
});

test("no cargo is one skip line: the gate prints it once and its exit is the suite's", (t) => {
  for (const status of [0, 1]) {
    const { code, calls, out } = gate(t, { which: () => null, answer: () => ({ status }) });
    assert.equal(code, status);
    assert.equal(calls.length, 1, 'only the suite started');
    assert.equal(out.split('\n').filter((line) => line === SKIP).length, 1);
  }
});

test('without which, the gate runs no cargo step and prints no skip line', (t) => {
  const { code, calls, out } = gate(t, { which: undefined });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.doesNotMatch(out, /rune deck/);
});
