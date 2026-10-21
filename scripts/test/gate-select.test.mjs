/**
 * suite-at-landing S1 (spec 1; L2, L7, L10): `runGate` with `--since=<ref>` prints the scope line,
 * runs only the selected files, never hands `--since` to `node`, and runs nothing for an empty
 * selection. `spawn` and `select` are injected, so no suite starts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { runGate } = await import('../gate.mjs');

const CWD = path.resolve('/scratch/repo');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const slot = () => ({ slot: 1, waited: false, release: () => {} });

/** Runs `runGate`, returning its code and what it wrote to stdout. */
function gate(t, args, options) {
  const written = [];
  const write = t.mock.method(process.stdout, 'write', (chunk) => written.push(String(chunk)) > 0);
  try {
    return { code: runGate(args, { cwd: CWD, slot, read: () => [], ...options }), out: written.join('') };
  } finally {
    write.mock.restore();
  }
}

test('an empty selection starts no node', (t) => {
  let spawned = 0;
  const asked = [];
  const select = (opts) => {
    asked.push(opts);
    return { files: [], total: 3, since: SHA };
  };
  const { code, out } = gate(t, ['--since=origin/pilot'], { select, spawn: () => ++spawned && { status: 0 } });
  assert.equal(code, 0);
  assert.equal(spawned, 0);
  assert.match(out, /^selected 0 of 3 test files since 0123456$/m);
  assert.deepEqual(asked, [{ cwd: CWD, since: 'origin/pilot' }]);
});

test('the since flag never reaches node', (t) => {
  const file = path.join(CWD, 'test', 'a.test.mjs');
  let argv;
  const select = () => ({ files: [file], total: 3, since: SHA });
  const spawn = (cmd, args) => {
    argv = args;
    return { status: 0 };
  };
  const { code, out } = gate(t, ['--test-reporter=spec', '--since=origin/pilot'], { select, spawn });
  assert.equal(code, 0);
  assert.match(out, /^selected 1 of 3 test files since 0123456$/m);
  assert.equal(argv.at(-1), file);
  assert.ok(argv.includes('--test-reporter=spec'));
  assert.deepEqual(argv.filter((arg) => arg.startsWith('--since')), []);
});

// Review fixes: a bare `--since` would leave its ref as a file argument; node reads a file argument as a glob.
test('a bare --since is refused and a selected path is glob-escaped', (t) => {
  let spawned = 0;
  assert.equal(gate(t, ['--since', 'origin/pilot'], { select: () => assert.fail('no selection'), spawn: () => ++spawned }).code, 1);
  assert.equal(spawned, 0);
  let argv;
  const file = path.join(CWD, 'test[1]', 'a.test.mjs');
  gate(t, ['--since=x'], { select: () => ({ files: [file], total: 1, since: SHA }), spawn: (cmd, args) => (argv = args) && { status: 0 } });
  assert.equal(argv.at(-1), path.join(CWD, 'test[[]1[]]', 'a.test.mjs'));
});
