/** S1 of usage-telemetry: a line of totals every half hour (spec 1, 2, 4, 8, 9; L1-L5, L7). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import { readWindow } from '../transcripts.mjs';
import { WINDOW_MS, nextBoundary, startUsageLog, usageLogFile } from '../telemetry.mjs';

// A projects root written by hand; its README carries the hand sums asserted here.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');
const DAEMON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon.mjs');

const W_FROM = Date.parse('2026-09-01T10:00:00.000Z');
const W_TO = W_FROM + WINDOW_MS;
const zeros = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
const W_TOTAL = { input: 18, cacheWrite5m: 140, cacheWrite1h: 200, cacheRead: 1460, output: 38 };

/** A copy of the fixture this test may touch, removed when it ends. */
function fixtureCopy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-telemetry-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('readWindow sums the fixture\'s window to the hand total', async () => {
  const { total, skippedLines } = await readWindow(W_FROM, W_TO, { projectsRoot: FIXTURE });

  assert.deepEqual(total, W_TOTAL);
  assert.equal(skippedLines, 1, 'the one line of alpha that is not JSON');
});

test('a message split over two entries counts once, in its first entry\'s window', async () => {
  const { total } = await readWindow(W_TO, W_TO + WINDOW_MS, { projectsRoot: FIXTURE });

  // `msg_b3` alone: `msg_a3`'s second entry, at 10:30:03, is not counted again here.
  assert.deepEqual(total, { ...zeros, input: 2, output: 3 });
});

test('an entry stamped exactly at the window\'s end belongs to the next window', async (t) => {
  const root = fixtureCopy(t);
  const entry = { type: 'assistant', timestamp: new Date(W_TO).toISOString(),
    message: { id: 'msg_edge', model: 'claude-fixture', usage: { input_tokens: 7, output_tokens: 11 } } };
  fs.writeFileSync(path.join(root, 'C--fixture-beta', 'edge.jsonl'), `${JSON.stringify(entry)}\n`);

  assert.deepEqual((await readWindow(W_FROM, W_TO, { projectsRoot: root })).total, W_TOTAL, 'not in [from, to)');
  assert.deepEqual((await readWindow(W_TO, W_TO + WINDOW_MS, { projectsRoot: root })).total, { ...zeros, input: 9, output: 14 }, 'in the next');
});

test('a window with no entries is all zeros', async () => {
  const from = Date.parse('2026-09-01T12:00:00.000Z');
  const { total } = await readWindow(from, from + WINDOW_MS, { projectsRoot: FIXTURE });

  assert.deepEqual(total, zeros);
});

test('files modified before the window are not read', async (t) => {
  const root = fixtureCopy(t);
  const alpha = path.join(root, 'C--fixture-alpha', 's-a.jsonl');
  const before = new Date(W_FROM - 60 * 60 * 1000);
  fs.utimesSync(alpha, before, before);

  const { total, skippedLines } = await readWindow(W_FROM, W_TO, { projectsRoot: root });

  assert.deepEqual(total, { input: 5, cacheWrite5m: 40, cacheWrite1h: 0, cacheRead: 410, output: 9 });
  assert.equal(skippedLines, 0, 'alpha, which holds the bad line, was never opened');
});

test('a missing projects root is a window of zeros', async (t) => {
  const { total, skippedLines } = await readWindow(W_FROM, W_TO, { projectsRoot: path.join(fixtureCopy(t), 'absent') });

  assert.deepEqual(total, zeros);
  assert.equal(skippedLines, 0);
});

test('startUsageLog appends one line per boundary with a stubbed schedule and clock', async (t) => {
  tempDeck(t);
  let clock = W_TO - 1000;
  const scheduled = [];
  const schedule = (fn, ms) => {
    scheduled.push({ fn, ms });
    return { unref() {} };
  };
  const log = startUsageLog({ now: () => clock, schedule, projectsRoot: FIXTURE });
  t.after(() => log.stop());

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 1000, 'the first tick is due at the next half-hour boundary');

  clock = W_TO + 5;
  await scheduled[0].fn();
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].ms, WINDOW_MS - 5, 'the next tick is due at the boundary after');

  clock = W_TO + WINDOW_MS + 3;
  await scheduled[1].fn();

  const lines = fs.readFileSync(usageLogFile(), 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  // S2's fields (telemetry-line.test.mjs) are left out here.
  const { at, window, tokens: { total }, skippedLines } = lines[0];
  assert.deepEqual({ at, window, total, skippedLines }, {
    at: new Date(W_TO + 5).toISOString(),
    window: { from: new Date(W_FROM).toISOString(), to: new Date(W_TO).toISOString() },
    total: W_TOTAL,
    skippedLines: 1,
  });
  assert.deepEqual(lines[1].window, { from: new Date(W_TO).toISOString(), to: new Date(W_TO + WINDOW_MS).toISOString() });
  assert.deepEqual(lines[1].tokens.total, { ...zeros, input: 2, output: 3 });
});

test('nextBoundary is the next :00 or :30 of epoch time, never now itself', () => {
  assert.equal(nextBoundary(W_FROM), W_TO);
  assert.equal(nextBoundary(W_FROM + 1), W_TO);
  assert.equal(nextBoundary(W_TO - 1), W_TO);
});

/** A port the operating system has just confirmed is free. Never 4321. */
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

test('the daemon names logging on its first lines', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const child = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });

  let stderr = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no usage log line in ${JSON.stringify(stderr)}`)), 10_000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.includes('[deck] logging ')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  child.kill();
  await exited;

  const said = stderr.split('\n').filter((line) => line.startsWith('[deck] logging '));
  assert.deepEqual(said, [`[deck] logging on, ${dir}`]);
});

test('the daemon names logging off on its first lines', async (t) => {
  const dir = tempDeck(t);
  fs.writeFileSync(path.join(dir, 'usage-log.json'), '{"enabled":false,"at":"2026-09-01T10:00:00.000Z"}\n');
  const port = await freePort();
  const child = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });

  let stderr = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no usage log line in ${JSON.stringify(stderr)}`)), 10_000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.includes('[deck] logging ')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  child.kill();
  await exited;

  const said = stderr.split('\n').filter((line) => line.startsWith('[deck] logging '));
  assert.deepEqual(said, ['[deck] logging off (pilot logging on)']);
});
