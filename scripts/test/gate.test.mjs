/**
 * The pilot's own gate (process-gc spec 5, 7; S7, L7, L8): `npm test` runs `node --test`
 * no wider than four files at once, with each child's heap capped, inside a gate slot it
 * holds and frees whether the suite is red or green.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { gateArgv, gateEnv, mainGuard, runGate, MAX_CONCURRENCY, CHILD_HEAP_MB } = await import('../gate.mjs');
const { TEST_GLOB } = await import('../select-tests.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the gate caps concurrency', () => {
  assert.equal(MAX_CONCURRENCY, 4);
  assert.deepEqual(gateArgv([], 16, ROOT).slice(0, 3), ['--test', '--test-timeout=60000', '--test-concurrency=4']);
  assert.deepEqual(gateArgv([], 1, ROOT).slice(0, 3), ['--test', '--test-timeout=60000', '--test-concurrency=1']);
  assert.ok(gateArgv([], 6, ROOT).includes('--test-concurrency=3'));
});

// S3 counts a `node --test` tree as pilot-owned only when its argv names a checkout's absolute path.
test('the gate names its checkout on the node --test argv', () => {
  assert.equal(gateArgv([], 16, ROOT).at(-1), path.join(ROOT, TEST_GLOB));
  const one = gateArgv(['--test-reporter=spec', 'scripts/test/gate.test.mjs'], 16, ROOT);
  assert.deepEqual(one.slice(3), ['--test-reporter=spec', path.join(ROOT, 'scripts/test/gate.test.mjs')]);
});

test("the gate caps each child's heap", () => {
  assert.equal(CHILD_HEAP_MB, 512);
  const cap = '--max-old-space-size=512';
  const env = gateEnv({ NODE_OPTIONS: '--enable-source-maps', KEEP: 'x' }, 1);
  assert.equal(env.NODE_OPTIONS, `--enable-source-maps ${cap}`);
  assert.equal(env.KEEP, 'x');
  assert.equal(env.PILOT_GATE_SLOT, '1');
  assert.equal(gateEnv({}, 0).NODE_OPTIONS, cap);
  assert.equal(gateEnv({ NODE_OPTIONS: cap }, 0).NODE_OPTIONS, cap, 'the cap is added once, not twice');
});

test('flags pass through', () => {
  const reporter = '--test-reporter=./scripts/quiet-reporter.mjs';
  const argv = gateArgv([reporter], 16, ROOT);
  assert.deepEqual(argv.slice(0, 3), ['--test', '--test-timeout=60000', '--test-concurrency=4']);
  assert.equal(argv[3], reporter);
});

test('the gate holds a slot and releases it red or green', () => {
  for (const status of [0, 1, null]) {
    const calls = { slot: 0, release: 0 };
    let seen;
    const slot = ({ cwd, env }) => {
      calls.slot++;
      assert.equal(cwd, 'C:/scratch');
      assert.ok(env);
      return { slot: 1, waited: false, release: () => calls.release++ };
    };
    const spawn = (cmd, argv, opts) => {
      assert.equal(calls.release, 0, 'the suite runs while the slot is held');
      seen = { cmd, argv, opts };
      return { status, signal: status === null ? 'SIGTERM' : null };
    };
    const code = runGate(['--test-reporter=spec'], { cwd: 'C:/scratch', spawn, slot, read: () => [] });
    assert.equal(code, status === 0 ? 0 : 1);
    assert.deepEqual(calls, { slot: 1, release: 1 });
    assert.equal(seen.cmd, process.execPath);
    assert.equal(seen.argv.at(-2), '--test-reporter=spec');
    assert.equal(seen.argv.at(-1), path.join('C:/scratch', TEST_GLOB));
    assert.equal(seen.opts.env.PILOT_GATE_SLOT, '1');
    assert.equal(seen.opts.cwd, 'C:/scratch');
    assert.notEqual(seen.opts.shell, true);
  }
});

test('the gate releases its slot when the suite cannot start', () => {
  let released = 0;
  const slot = () => ({ slot: 0, waited: false, release: () => released++ });
  const spawn = () => ({ status: null, signal: null, error: new Error('ENOENT') });
  assert.equal(runGate([], { cwd: 'C:/scratch', spawn, slot, read: () => [] }), 1);
  assert.equal(released, 1);
});

test('a checkout root with glob metacharacters is escaped so the glob still finds its tests', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-glob-'));
  try {
    const root = path.join(base, 'a[1]{x}(y)');
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });
    const file = path.join(root, 'test', 'a.test.mjs');
    fs.writeFileSync(file, '');
    const glob = gateArgv([], 16, root).at(-1);
    assert.deepEqual(fs.globSync(glob), [file]);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('the main-module guard fails closed when argv[1] does not resolve', () => {
  const self = pathToFileURL(path.join(ROOT, 'scripts', 'gate.mjs')).href;
  assert.equal(mainGuard(path.join(ROOT, 'scripts', 'gate.mjs'), self).run, true);
  assert.deepEqual(mainGuard(path.join(ROOT, 'scripts', 'test', 'gate.test.mjs'), self), { run: false });
  for (const argv1 of [undefined, path.join(ROOT, 'no', 'such', 'gate.mjs')]) {
    const guard = mainGuard(argv1, self);
    assert.equal(guard.run, false);
    assert.match(guard.error, /^gate: .*did not resolve/);
    assert.ok(!guard.error.includes('\n'));
  }
});

test('the gate strips every inherited heap cap before adding its own', () => {
  const cap = '--max-old-space-size=512';
  const eq = gateEnv({ NODE_OPTIONS: '--max-old-space-size=512 --max-old-space-size=8192' }, 0);
  assert.equal(eq.NODE_OPTIONS, cap);
  const spaced = gateEnv({ NODE_OPTIONS: '--enable-source-maps --max-old-space-size 8192 --max-old-space-size=4096' }, 0);
  assert.equal(spaced.NODE_OPTIONS, `--enable-source-maps ${cap}`);
});

/** What `runGate` printed to stdout and stderr while `run` ran. */
function printed(t, run) {
  const out = [];
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk) => (out.push(String(chunk)), true));
  }
  try {
    return { result: run(), text: out.join('') };
  } finally {
    t.mock.restoreAll();
  }
}

test('a stale ledger fails the gate before the suite', (t) => {
  const calls = { spawn: 0, slot: 0, ledgers: [] };
  const { result, text } = printed(t, () =>
    runGate([], {
      cwd: 'C:/scratch',
      ledgers: (root) => (calls.ledgers.push(root), ['scripts/shipped-rules.json']),
      spawn: () => (calls.spawn++, { status: 0 }),
      slot: () => (calls.slot++, { slot: 0, release() {} }),
      read: () => [],
    }));
  assert.equal(result, 1);
  assert.match(text, /^ledger stale: scripts\/shipped-rules\.json, rebuilt; commit it$/m);
  assert.deepEqual(calls, { spawn: 0, slot: 0, ledgers: ['C:/scratch'] });
});

test('a ledger that cannot build fails the gate', (t) => {
  const calls = { spawn: 0, slot: 0 };
  const { result, text } = printed(t, () =>
    runGate([], {
      cwd: 'C:/scratch',
      ledgers: () => {
        throw new Error('This clone is shallow');
      },
      spawn: () => (calls.spawn++, { status: 0 }),
      slot: () => (calls.slot++, { slot: 0, release() {} }),
      read: () => [],
    }));
  assert.equal(result, 1);
  assert.match(text, /^ledgers: This clone is shallow$/m);
  assert.deepEqual(calls, { spawn: 0, slot: 0 });
});

test('current ledgers run the suite', (t) => {
  const order = [];
  const { result, text } = printed(t, () =>
    runGate([], {
      cwd: 'C:/scratch',
      ledgers: () => (order.push('ledgers'), []),
      spawn: () => (order.push('spawn'), { status: 0 }),
      slot: () => (order.push('slot'), { slot: 0, release() {} }),
      read: () => [],
    }));
  assert.equal(result, 0);
  assert.match(text, /^ledgers current$/m);
  assert.deepEqual(order, ['ledgers', 'slot', 'spawn']);
});
