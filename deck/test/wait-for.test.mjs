import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitFor, main } from '../wait-for.mjs';

const PILOT_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'pilot.mjs');

// A clock that only moves when the wait sleeps, so a test never waits on real time.
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

function sink() {
  const lines = [];
  return { write: (s) => { lines.push(s); }, text: () => lines.join('') };
}

test('a marker that comes is printed', async () => {
  const clock = fakeClock();
  const reads = [null, 'starting\nbuilding\n', 'starting\nbuilding\nexit 0\nexit 1\n'];
  let calls = 0;
  const read = (file) => {
    assert.equal(file, '/tmp/x.log');
    return reads[Math.min(calls++, reads.length - 1)];
  };
  const result = await waitFor({ file: '/tmp/x.log', match: '^exit', timeoutMin: 1, read, ...clock, pollMs: 100 });
  assert.deepEqual(result, { line: 'exit 0' });
  assert.equal(calls, 3);
});

test('a line still being written is not a match', async () => {
  const clock = fakeClock();
  const reads = ['starting\nexit', 'starting\nexit 1\n'];
  let calls = 0;
  const read = () => reads[Math.min(calls++, reads.length - 1)];
  const result = await waitFor({ file: '/tmp/x.log', match: '^exit', timeoutMin: 1, read, ...clock, pollMs: 100 });
  assert.deepEqual(result, { line: 'exit 1' });
});

test('a path that is not a file is refused, not waited on', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wait-for-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = sink();
  const err = sink();
  assert.equal(await main(['--file', dir, '--match', 'x', '--timeout', '1'], { out, err }), 1);
  assert.equal(out.text(), '');
  assert.match(err.text(), /cannot read/);
});

test('a missing file is not a match', async () => {
  const clock = fakeClock();
  let calls = 0;
  const read = () => { calls++; return null; };
  const result = await waitFor({ file: '/tmp/x.log', match: '.*', timeoutMin: 0.02, read, ...clock, pollMs: 500 });
  assert.deepEqual(result, { timedOut: true, waitedMin: 0.02 });
  // 0.02 min is 1200 ms: reads at 0, 500, 1000 and the deadline, 1200.
  assert.equal(calls, 4);
  assert.equal(clock.now(), 1200);
});

test('a marker that never comes times out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const out = sink();
  const err = sink();
  const dir = mkdtempSync(join(tmpdir(), 'wait-for-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'x.log');
  writeFileSync(file, 'starting\nstill going\n');
  const pending = main(['--file', file, '--match', '^exit', '--timeout', '0.02'], { out, err });
  // Let the first read happen, then move the clock past the 1200 ms deadline.
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(2000);
  }
  assert.equal(await pending, 2);
  assert.equal(out.text(), `timed out waiting for ^exit in ${file} after 0.02 min\n`);
});

test('no deadline, no wait', async () => {
  const cases = [
    ['--file', '/tmp/x.log', '--match', '^exit'],
    ['--file', '/tmp/x.log', '--match', '^exit', '--timeout', '0'],
    ['--file', '/tmp/x.log', '--match', '^exit', '--timeout', '51'],
    ['--file', '/tmp/x.log', '--match', '^exit', '--timeout', '1e1'],
    ['--file', '/tmp/x.log', '--match', 'a'.repeat(201), '--timeout', '1'],
    ['--file', '/tmp/x.log', '--match', '(', '--timeout', '1'],
    ['--file', '/tmp/x.log', '--match', '^exit', '--timeout', 'soon'],
    ['--match', '^exit', '--timeout', '1'],
  ];
  for (const argv of cases) {
    const out = sink();
    const err = sink();
    assert.equal(await main(argv, { out, err }), 1, argv.join(' '));
    assert.equal(out.text(), '', argv.join(' '));
    assert.notEqual(err.text(), '', argv.join(' '));
  }
});

test('the real command ends', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wait-for-'));
  try {
    const file = join(dir, 'x.log');
    writeFileSync(file, 'nothing to see\n');
    const started = Date.now();
    const r = spawnSync(process.execPath, [PILOT_BIN, 'wait-for', '--file', file, '--match', 'never', '--timeout', '0.02'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stdout, `timed out waiting for never in ${file} after 0.02 min\n`);
    assert.ok(Date.now() - started < 5000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
