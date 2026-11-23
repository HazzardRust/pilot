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
const { runeTargetDir } = await import('../rune-target.mjs');

const slot = () => ({ slot: 1, waited: false, release: () => {} });
const SKIP = 'rune deck: cargo not on PATH, skipped';
const CARGO = 'C:\\Users\\me\\.cargo\\bin\\cargo.exe';
const OFF_WINDOWS ='rune deck: cargo test runs on Windows only, skipped';

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

/**
 * Runs `runGate` with stdout captured; every spawn is recorded and answered by `answer(command)`. `select`
 * given, the gate runs `--since=main` on its answer. `bound` answers for the shared target, never the real one.
 */
function gate(t, { which, answer = () => ({ status: 0 }), platform = 'win32', select, bound = () => ({ wiped: false, units: 0 }) }) {
  const { dir, file } = store(t);
  // Under the gate this process inherits its guard, which reads as a gate inside the gate: this gate is the outer one.
  const inherited = process.env.PILOT_GATE_HOME_STORE;
  delete process.env.PILOT_GATE_HOME_STORE;
  t.after(() => inherited !== undefined && (process.env.PILOT_GATE_HOME_STORE = inherited));
  const calls = [];
  const written = [];
  const write = t.mock.method(process.stdout, 'write', (chunk) => written.push(String(chunk)) > 0);
  try {
    const code = runGate(select ? ['--since=main'] : [], {
      cwd: dir,
      slot,
      ...(select ? { select } : {}),
      bound,
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
  const step = cargoStep({}, (cmd) => (asked.push(cmd), CARGO), 'win32');
  assert.deepEqual(asked, ['cargo']);
  // The path found, never the bare name, which Windows would look up in the checkout first.
  assert.equal(step.command, CARGO);
  assert.deepEqual(step.args, ['test', '--manifest-path', 'deck/rune/Cargo.toml']);
});

const SHA = '0123456789abcdef0123456789abcdef01234567';
const LOCAL = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
/** A `--since` selection that ran some files, its diff naming `changed`. */
const selected = (changed) => ({ files: ['C:\\r\\scripts\\test\\land.test.mjs'], total: 9, since: SHA, changed });

test('a selected gate that touches nothing under deck/ runs no cargo: cargoStep names the sha (spec 8)', () => {
  assert.deepEqual(cargoStep(LOCAL, () => CARGO, 'win32', selected(['scripts/land.mjs'])), {
    skip: 'rune deck: nothing under deck/ changed since 0123456, skipped',
  });
  // A path that only starts like deck/ is not under it.
  assert.ok(cargoStep(LOCAL, () => CARGO, 'win32', selected(['decks/x.mjs', 'docs/deck/a.md'])).skip);
});

test('a deck change or a full run still runs cargo, into the shared build (spec 7, 8)', () => {
  const shared = { CARGO_TARGET_DIR: runeTargetDir(LOCAL, 'win32') };
  assert.equal(shared.CARGO_TARGET_DIR, 'C:\\Users\\me\\AppData\\Local\\pilot\\rune-target');
  for (const selection of [
    undefined,
    selected(['deck/view.mjs']),
    selected(['deck/rune/src/app.rs', 'scripts/land.mjs']),
    // A trigger already makes the selection full; a selection naming one runs cargo whatever its files say.
    selected(['scripts/gate.mjs']),
    { files: null, total: 9, since: SHA, reason: 'scripts/x.mjs reaches no test', changed: ['scripts/x.mjs'] },
    // A selection that read no diff names nothing changed, and is a full run.
    { files: null, total: 9, since: 'nope', reason: 'cannot resolve nope', changed: [] },
  ]) {
    const step = cargoStep(LOCAL, () => CARGO, 'win32', selection);
    assert.equal(step.command, CARGO, JSON.stringify(selection));
    assert.deepEqual(step.env, shared);
  }
});

test('the gate passes its selection: a scripts-only --since gate prints the skip line once and starts no cargo', (t) => {
  const bounds = [];
  const { code, calls, out } = gate(t, { which: () => CARGO, select: () => selected(['scripts/land.mjs']), bound: (dir) => (bounds.push(dir), { wiped: false, units: 0 }) });
  assert.equal(code, 0);
  assert.equal(calls.length, 1, 'only the suite started');
  assert.equal(out.split('\n').filter((line) => line === 'rune deck: nothing under deck/ changed since 0123456, skipped').length, 1);
  assert.deepEqual(bounds, [], 'a skipped step leaves the shared build alone');
});

test('the gate builds a deck change into the shared target, bounded first, the guard env kept', (t) => {
  const order = [];
  const { code, calls, out, file } = gate(t, {
    which: () => CARGO,
    select: () => selected(['deck/view.mjs']),
    answer: (command) => (order.push(command), { status: 0 }),
    bound: (dir) => (order.push(`bound ${dir}`), { wiped: true, units: 401 }),
  });
  assert.equal(code, 0);
  const cargo = calls.find((call) => call.command === CARGO);
  assert.ok(cargo, 'cargo was not started');
  const dir = runeTargetDir(process.env, 'win32');
  assert.equal(cargo.options.env.CARGO_TARGET_DIR, dir);
  assert.equal(cargo.options.env.PILOT_GATE_HOME_STORE, file);
  assert.deepEqual(order.slice(1), [`bound ${dir}`, CARGO]);
  assert.ok(out.split('\n').includes(`rune deck: shared build held 401 units, over 400, wiped ${dir}`), out);
  // The suite's own run never carries the shared target: only the cargo spawn sets it.
  assert.equal(calls[0].options.env.CARGO_TARGET_DIR, process.env.CARGO_TARGET_DIR);
});

test('a shared target that cannot be bounded is named, and cargo still runs', (t) => {
  const errors = [];
  const err = t.mock.method(process.stderr, 'write', (chunk) => errors.push(String(chunk)) > 0);
  let result;
  try {
    result = gate(t, { which: () => CARGO, bound: () => { throw new Error('EBUSY: resource busy'); } });
  } finally {
    err.mock.restore();
  }
  assert.equal(result.code, 0);
  assert.ok(result.calls.some((call) => call.command === CARGO));
  assert.match(errors.join(''), /gate: rune deck: could not bound .*rune-target: EBUSY: resource busy/);
});

test('cargo runs where it is: the gate starts it hidden, in its checkout, under the home-store guard', (t) => {
  const { code, calls, file } = gate(t, { which: () => CARGO });
  assert.equal(code, 0);
  const cargo = calls.find((call) => call.command === CARGO);
  assert.ok(cargo, 'cargo was not started');
  assert.deepEqual(cargo.args, ['test', '--manifest-path', 'deck/rune/Cargo.toml']);
  assert.equal(cargo.options.windowsHide, true);
  assert.equal(cargo.options.env.PILOT_GATE_HOME_STORE, file);
  assert.ok(cargo.options.env.PILOT_GATE_HOME_LOG);
  assert.equal(cargo.options.cwd, path.dirname(file));
});

test('a cargo run that writes the home store is caught by the home-store line', (t) => {
  const touch = (command, options) => {
    if (command === CARGO) fs.utimesSync(options.env.PILOT_GATE_HOME_STORE, new Date(), new Date());
    return { status: 0 };
  };
  const { code, out } = gate(t, { which: () => CARGO, answer: touch });
  assert.equal(code, 1);
  assert.match(out, /home store changed: /);
});

test('a failing cargo test fails the gate, and one that cannot start does too', (t) => {
  const failed = gate(t, { which: () => CARGO, answer: (command) => ({ status: command === CARGO ? 101 : 0 }) });
  assert.equal(failed.code, 1);
  const unstarted = gate(t, {
    which: () => CARGO,
    answer: (command) => (command === CARGO ?{ status: null, error: new Error('spawn cargo ENOENT') } : { status: 0 }),
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

test('a gate a test starts inside the gate skips the Rune deck, loudly: the outer gate runs it once', () => {
  assert.deepEqual(cargoStep({ PILOT_GATE_HOME_STORE: 'C:\\Users\\me\\.claude\\pilot\\deck.json' }, () => CARGO, 'win32'), {
    skip: 'rune deck: a gate inside the gate, skipped',
  });
});

test('the default which finds cargo.exe in an absolute PATH or Path dir, and nothing else', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gate-which-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'cargo.cmd'), '');
  assert.deepEqual(cargoStep({ PATH: dir, Path: dir, PATHEXT: '.CMD;.EXE' }, undefined, 'win32'), { skip: SKIP });
  fs.writeFileSync(path.join(dir, 'cargo.exe'), '');
  assert.equal(cargoStep({ PATH: dir }, undefined, 'win32').command, path.join(dir, 'cargo.exe'));
  assert.equal(cargoStep({ Path: dir }, undefined, 'win32').command, path.join(dir, 'cargo.exe'));
  // A relative entry would resolve against the checkout, where a planted cargo.exe could sit.
  // The planted dir sits under the checkout, so the entry is relative whichever drive the temp dir is on.
  const planted = fs.mkdtempSync(path.join(process.cwd(), '.pilot-gate-planted-'));
  t.after(() => fs.rmSync(planted, { recursive: true, force: true }));
  fs.writeFileSync(path.join(planted, 'cargo.exe'), '');
  const relative = path.relative(process.cwd(), planted);
  assert.ok(!path.isAbsolute(relative));
  assert.deepEqual(cargoStep({ PATH: relative }, undefined, 'win32'), { skip: SKIP });
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
