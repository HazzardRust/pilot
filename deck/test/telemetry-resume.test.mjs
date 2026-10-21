/** S3 of usage-telemetry: restarts leave no gap and a tick never stalls the deck (spec 6, 7; L5, L7, A5). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import * as telemetry from '../telemetry.mjs';

// A namespace import, so a test of a missing export fails on its own rather than failing the file.
const { MAX_BACKFILL_MS, WINDOW_MS, lastWindowEnd, nextBoundary, startUsageLog, usageLogFile } = telemetry;

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');
const W_TO = Date.parse('2026-09-01T10:30:00.000Z');
const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

/** A log started at `at` with a stubbed clock and schedule; `fire(atMs)` runs the next armed tick. */
function stubbedLog(t, at, projectsRoot = FIXTURE) {
  let clock = at;
  const scheduled = [];
  const log = startUsageLog({ now: () => clock, schedule: (fn) => scheduled.push(fn) && { unref() {} }, projectsRoot });
  t.after(() => log.stop());
  return {
    log,
    scheduled,
    fire(atMs, index = scheduled.length - 1) {
      clock = atMs;
      return scheduled[index]();
    },
  };
}

const logLines = () => fs.readFileSync(usageLogFile(), 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));

test('a second start continues from the last line\'s to', async (t) => {
  tempDeck(t);
  const first = stubbedLog(t, W_TO - 1000);
  await first.fire(W_TO);
  first.log.stop();
  const firstBytes = fs.readFileSync(usageLogFile());

  const restart = W_TO + 2 * HOUR + 10_000;
  const second = stubbedLog(t, restart);
  await second.fire(nextBoundary(restart));

  const lines = logLines();
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].window, { from: lines[0].window.to, to: iso(nextBoundary(restart)) });
  assert.deepEqual(fs.readFileSync(usageLogFile()).subarray(0, firstBytes.length), firstBytes, 'the first line is untouched');
});

test('the backfill stops at seven days', async (t) => {
  tempDeck(t);
  assert.equal(MAX_BACKFILL_MS, 7 * 24 * HOUR);
  const boundary = W_TO + 10 * 24 * HOUR;
  fs.writeFileSync(usageLogFile(), `${JSON.stringify({ window: { from: iso(W_TO - WINDOW_MS), to: iso(W_TO) } })}\n`);

  const log = stubbedLog(t, boundary - 1000);
  await log.fire(boundary);

  assert.deepEqual(logLines()[1].window, { from: iso(boundary - MAX_BACKFILL_MS), to: iso(boundary) });
});

test('a log whose last line is torn starts a fresh window and appends after it', async (t) => {
  tempDeck(t);
  const whole = `${JSON.stringify({ window: { from: iso(W_TO - WINDOW_MS), to: iso(W_TO) } })}\n`;
  const earlier = `${whole}{"at":"2026-09-01T11:00:00.0`;
  fs.writeFileSync(usageLogFile(), earlier);
  assert.equal(lastWindowEnd(usageLogFile()), null, 'torn');
  assert.equal(lastWindowEnd(path.join(path.dirname(usageLogFile()), 'absent.jsonl')), null, 'absent');

  const boundary = W_TO + 3 * WINDOW_MS;
  const log = stubbedLog(t, boundary - 1000);
  await log.fire(boundary);

  const text = fs.readFileSync(usageLogFile(), 'utf8');
  assert.ok(text.startsWith(earlier), 'the earlier bytes are unchanged');
  const appended = JSON.parse(text.slice(earlier.length).trim());
  assert.deepEqual(appended.window, { from: iso(boundary - WINDOW_MS), to: iso(boundary) });
  assert.equal(lastWindowEnd(usageLogFile()), boundary, 'the next start reads the appended line');
});

test('a tick still running when the next is due skips it', async (t) => {
  tempDeck(t);
  const log = stubbedLog(t, W_TO - 1000);

  const pending = log.fire(W_TO, 0);
  const skipped = [log.fire(W_TO + WINDOW_MS, 1), log.fire(W_TO + 2 * WINDOW_MS, 2)];
  await Promise.all([pending, ...skipped]);
  assert.equal(logLines().length, 1, 'one line while the first tick was reading');

  await log.fire(W_TO + 3 * WINDOW_MS, 3);
  const [first, next] = logLines();
  assert.deepEqual(next.window, { from: first.window.to, to: iso(W_TO + 3 * WINDOW_MS) }, 'the skipped windows are in the next line');
});

test('the deck answers during a tick', async (t) => {
  const base = await deckOnAPort(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-telemetry-large-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const boundary = nextBoundary(Date.now());
  const entry = (i) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: iso(boundary - WINDOW_MS),
      message: { id: `msg_${i}`, model: 'claude-fixture', usage: { input_tokens: 1, output_tokens: 1 }, content: 'x'.repeat(200) },
    });
  const text = `${Array.from({ length: 10_000 }, (_, i) => entry(i)).join('\n')}\n`;
  fs.mkdirSync(path.join(root, 'C--large'));
  for (let f = 0; f < 12; f += 1) fs.writeFileSync(path.join(root, 'C--large', `${f}.jsonl`), text);

  const log = stubbedLog(t, boundary - 1000, root);
  const started = performance.now();
  let tickMs = null;
  const tick = log.fire(boundary).then(() => {
    tickMs = performance.now() - started;
  });
  const health = await fetch(`${base}/api/health`);
  const healthMs = performance.now() - started;
  const lineWritten = fs.existsSync(usageLogFile());
  await tick;

  t.diagnostic(`/api/health answered in ${healthMs.toFixed(1)} ms; the tick wrote its line in ${tickMs.toFixed(1)} ms`);
  assert.equal(health.status, 200);
  assert.equal(lineWritten, false, 'health answered before the line was written');
  assert.equal(logLines()[0].tokens.total.output, 10_000, 'each message id counted once across the copies');
});

test('an append that fails goes to stderr and the daemon stays up', async (t) => {
  const base = await deckOnAPort(t);
  fs.mkdirSync(usageLogFile());
  const said = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => said.push(String(chunk)) > 0;
  t.after(() => {
    process.stderr.write = write;
  });

  const log = stubbedLog(t, W_TO - 1000);
  await log.fire(W_TO);
  process.stderr.write = write;

  assert.ok(said.some((line) => line.startsWith('[deck] usage log: ')), said.join(''));
  assert.equal(log.scheduled.length, 2, 'the next tick is still armed');
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('a window whose append failed is carried into the next line', async (t) => {
  tempDeck(t);
  const earlier = `${JSON.stringify({ window: { from: iso(W_TO - WINDOW_MS), to: iso(W_TO) } })}\n`;
  fs.writeFileSync(usageLogFile(), earlier);
  const log = stubbedLog(t, W_TO + 1000);
  const write = process.stderr.write;
  process.stderr.write = () => true;
  t.after(() => {
    process.stderr.write = write;
  });

  fs.rmSync(usageLogFile());
  fs.mkdirSync(usageLogFile());
  await log.fire(W_TO + WINDOW_MS);
  process.stderr.write = write;
  fs.rmdirSync(usageLogFile());
  fs.writeFileSync(usageLogFile(), earlier);
  await log.fire(W_TO + 2 * WINDOW_MS);

  const lines = logLines();
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].window, { from: iso(W_TO), to: iso(W_TO + 2 * WINDOW_MS) }, 'the failed window is not lost');
});

test('a failed first window on a deck with no log yet is carried into the next line', async (t) => {
  tempDeck(t);
  const log = stubbedLog(t, W_TO - 1000);
  const write = process.stderr.write;
  process.stderr.write = () => true;
  t.after(() => {
    process.stderr.write = write;
  });

  fs.mkdirSync(usageLogFile());
  await log.fire(W_TO);
  process.stderr.write = write;
  fs.rmdirSync(usageLogFile());
  await log.fire(W_TO + WINDOW_MS);

  const lines = logLines();
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].window, { from: iso(W_TO - WINDOW_MS), to: iso(W_TO + WINDOW_MS) }, 'the failed first window is not lost');
});

test('a last line ending after the boundary (the clock went back) gives one whole window', async (t) => {
  tempDeck(t);
  const boundary = W_TO + WINDOW_MS;
  fs.writeFileSync(usageLogFile(), `${JSON.stringify({ window: { from: iso(boundary), to: iso(boundary + HOUR) } })}\n`);

  const log = stubbedLog(t, boundary - 1000);
  await log.fire(boundary);

  assert.deepEqual(logLines()[1].window, { from: iso(boundary - WINDOW_MS), to: iso(boundary) });
});

test('a switch turned on at or after the boundary does not move the start', async (t) => {
  tempDeck(t);
  fs.writeFileSync(usageLogFile(), `${JSON.stringify({ window: { from: iso(W_TO - WINDOW_MS), to: iso(W_TO) } })}\n`);
  const switchFile = path.join(path.dirname(usageLogFile()), 'usage-log.json');
  const log = stubbedLog(t, W_TO + 1000);

  const due = W_TO + WINDOW_MS;
  fs.writeFileSync(switchFile, JSON.stringify({ enabled: true, at: iso(due) }));
  await log.fire(due);
  fs.writeFileSync(switchFile, JSON.stringify({ enabled: true, at: iso(due + 2 * WINDOW_MS) }));
  await log.fire(due + WINDOW_MS);

  const [, equal, after] = logLines();
  assert.deepEqual(equal.window, { from: iso(W_TO), to: iso(due) }, 'at equal to due');
  assert.deepEqual(after.window, { from: iso(due), to: iso(due + WINDOW_MS) }, 'at after due');
});

test('a timer that fires early arms the following boundary, never the same one twice', async (t) => {
  tempDeck(t);
  let clock = W_TO - 1000;
  const armed = [];
  const log = startUsageLog({
    now: () => clock,
    schedule: (fn, ms) => armed.push({ fn, at: clock + ms }) && { unref() {} },
    projectsRoot: FIXTURE,
  });
  t.after(() => log.stop());
  assert.equal(armed[0].at, W_TO);

  clock = W_TO - 5;
  await armed[0].fn();

  assert.equal(armed.length, 2);
  assert.equal(armed[1].at, W_TO + WINDOW_MS, 'the next boundary, not this one again');
  assert.deepEqual(logLines()[0].window.to, iso(W_TO), 'the early tick wrote the boundary it was armed for');
});
