/**
 * The gate's syntax check (audit-f6 spec 1, 6; L1, L3, L4): `runGate` runs the injected `syntax`
 * first, and a fault or a check that cannot run stops it, red, before the ledgers and the suite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { runGate } = await import('../gate.mjs');

/** What `runGate` printed to stdout and stderr while `run` ran. */
function printed(t, run) {
  const out = { stdout: [], stderr: [] };
  for (const name of ['stdout', 'stderr']) {
    t.mock.method(process[name], 'write', (chunk) => (out[name].push(String(chunk)), true));
  }
  try {
    return { result: run(), stdout: out.stdout.join(''), stderr: out.stderr.join('') };
  } finally {
    t.mock.restoreAll();
  }
}

/** `runGate(args)` with every step a counting stub and `syntax` as given. */
function gateWith(t, args, syntax) {
  const calls = { ledgers: 0, spawn: 0, slot: 0, select: 0 };
  const run = printed(t, () =>
    runGate(args, {
      cwd: 'C:/scratch',
      syntax,
      ledgers: () => (calls.ledgers++, []),
      select: () => (calls.select++, { files: ['a.test.mjs'], reason: 'stub' }),
      spawn: () => (calls.spawn++, { status: 0 }),
      slot: () => (calls.slot++, { slot: 0, release() {} }),
      read: () => [],
    }));
  return { ...run, calls };
}

test('a fault stops the gate before the ledgers and the suite', (t) => {
  const fault = () => ({ files: 3, ms: 5, errors: [{ file: 'deck/ui/js/navigate.mjs', line: 1, message: "SyntaxError: Unexpected token ';'" }] });
  for (const args of [[], ['--since=HEAD']]) {
    const { result, stderr, calls } = gateWith(t, args, fault);
    assert.equal(result, 1, `exit 1 for ${JSON.stringify(args)}`);
    assert.match(stderr, /^syntax: deck\/ui\/js\/navigate\.mjs:1 SyntaxError: Unexpected token ';'$/m);
    assert.deepEqual(calls, { ledgers: 0, spawn: 0, slot: 0, select: 0 });
  }
});

test('every fault gets its own line', (t) => {
  const two = () => ({
    files: 3,
    ms: 5,
    errors: [
      { file: 'a.mjs', line: 2, message: 'SyntaxError: x' },
      { file: 'b/c.js', line: 7, message: 'SyntaxError: y' },
    ],
  });
  const { result, stderr } = gateWith(t, [], two);
  assert.equal(result, 1);
  assert.deepEqual(stderr.split('\n').filter((l) => l.startsWith('syntax:')), ['syntax: a.mjs:2 SyntaxError: x', 'syntax: b/c.js:7 SyntaxError: y']);
});

test('a check that cannot run is red', (t) => {
  const broken = () => {
    throw new Error('spawn ENOENT\nsecond line');
  };
  const { result, stderr, calls } = gateWith(t, [], broken);
  assert.equal(result, 1);
  assert.match(stderr, /^syntax: could not check \(spawn ENOENT\)$/m);
  assert.deepEqual(calls, { ledgers: 0, spawn: 0, slot: 0, select: 0 });
});

test('a clean check prints the ok line first and runs the suite', (t) => {
  const clean = () => ({ files: 666, ms: 412, errors: [] });
  const { result, stdout, calls } = gateWith(t, [], clean);
  assert.equal(result, 0);
  assert.equal(stdout.split('\n')[0], 'syntax ok 666 files in 412 ms');
  assert.deepEqual(calls, { ledgers: 1, spawn: 1, slot: 1, select: 0 });
});
