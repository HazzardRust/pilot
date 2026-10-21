/**
 * suite-at-landing S4 (spec 4; L9): only a full run takes a gate slot. A selected run (`--since`
 * with a file list) takes none but marks its suite as needing none (R9), so a gate the suite
 * starts takes none either; a fallback (`files: null`) and a plain run take one and release it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { runGate } = await import('../gate.mjs');
const { takeSlot } = await import('../gate-slots.mjs');

const CWD = path.resolve('scratch-checkout');

/** `runGate(args, ...)` with the gate's own slot name out of the environment and output captured. */
function gate(t, args, options) {
  const saved = process.env.PILOT_GATE_SLOT;
  delete process.env.PILOT_GATE_SLOT;
  const out = [];
  const write = (chunk) => out.push(String(chunk));
  t.mock.method(process.stdout, 'write', write);
  t.mock.method(process.stderr, 'write', write);
  try {
    const code = runGate(args, { cwd: CWD, read: () => [], ...options });
    return { code, out: out.join('') };
  } finally {
    if (saved !== undefined) process.env.PILOT_GATE_SLOT = saved;
  }
}

function counting() {
  const calls = { slot: 0, release: 0 };
  const slot = () => {
    calls.slot++;
    return { slot: 1, waited: false, release: () => calls.release++ };
  };
  return { calls, slot };
}

const forbidden = () => {
  throw new Error('a selected run asked for a slot');
};

test('a selected run never asks for a slot', (t) => {
  let seen;
  const spawn = (cmd, argv, opts) => ((seen = opts), { status: 0 });
  const select = () => ({ files: ['a.test.mjs', 'b.test.mjs'], total: 9, since: 'abcdef0123' });
  const { code } = gate(t, ['--since=origin/pilot'], { select, slot: forbidden, spawn });
  assert.equal(code, 0);
  assert.equal(seen.env.PILOT_GATE_SLOT, 'selected');
});

test('a selected run\'s tests take no slot beside two holders', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-slot-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const n of [0, 1]) fs.writeFileSync(path.join(dir, `slot-${n}.json`), JSON.stringify({ pid: process.pid, dir: 'elsewhere', since: new Date().toISOString() }));
  const select = () => ({ files: ['a.test.mjs'], total: 9, since: 'abcdef0123' });
  // The suite's test drives integrate: `runTests` takes a slot with the environment the gate gave it.
  const spawn = (cmd, argv, opts) => {
    const held = takeSlot({ dir, cwd: CWD, env: opts.env, alive: () => true, sleep: () => assert.fail('waited for a slot'), say: () => assert.fail('said waiting') });
    held.release();
    return { status: 0 };
  };
  const { code, out } = gate(t, ['--since=origin/pilot'], { select, slot: forbidden, spawn });
  assert.equal(code, 0);
  assert.doesNotMatch(out, /gate: waiting for a slot/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['slot-0.json', 'slot-1.json']);
});

test('a fallback takes a slot', (t) => {
  const { calls, slot } = counting();
  const select = () => ({ files: null, total: 9, since: null });
  let seen;
  const spawn = (cmd, argv, opts) => ((seen = opts), { status: 0 });
  const { code } = gate(t, ['--since=origin/pilot'], { select, slot, spawn });
  assert.equal(code, 0);
  assert.deepEqual(calls, { slot: 1, release: 1 });
  assert.equal(seen.env.PILOT_GATE_SLOT, '1');
});

test('a plain run still takes a slot', (t) => {
  const { calls, slot } = counting();
  const { code } = gate(t, [], { slot, spawn: () => ({ status: 0 }) });
  assert.equal(code, 0);
  assert.deepEqual(calls, { slot: 1, release: 1 });
});

test('a selected run beside two holders starts at once', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-slot-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const n of [0, 1]) fs.writeFileSync(path.join(dir, `slot-${n}.json`), JSON.stringify({ pid: process.pid, dir: 'elsewhere', since: new Date().toISOString() }));
  const slot = (options) =>
    takeSlot({ ...options, dir, alive: () => true, sleep: () => assert.fail('waited for a slot'), say: () => assert.fail('said waiting') });
  const select = () => ({ files: ['a.test.mjs'], total: 9, since: 'abcdef0123' });
  const { code, out } = gate(t, ['--since=origin/pilot'], { select, slot, spawn: () => ({ status: 0 }) });
  assert.equal(code, 0);
  assert.doesNotMatch(out, /gate: waiting for a slot/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['slot-0.json', 'slot-1.json']);
});
