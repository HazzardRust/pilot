/** S4 of user-thread-listener: each deck process logs its own memory, under the logging switch (spec 7, 8, 9, 11; L10, L12). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startDaemon } from '../daemon.mjs';
import { memoryLogFile, readingOf, startMemoryLog } from '../memory.mjs';
import { tempDeck } from '../testUtils.mjs';
import { setUsageSwitch } from '../usage-switch.mjs';
import { wait } from '../wait.mjs';

const PILOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'pilot.mjs');
const MIB = 2 ** 20;
const stubs = { now: () => Date.parse('2026-10-04T12:00:00.000Z'), memoryUsage: () => ({ rss: 80 * MIB }), freemem: () => 4096 * MIB };

/** The stand-ins `startMemoryLog` is given: the timer it arms, the lines it appends, the handlers it hooks. */
function harness() {
  const lines = [];
  const handlers = new Map();
  const timers = [];
  return {
    lines,
    handlers,
    timers,
    events: () => lines.map((line) => JSON.parse(line).event),
    options: {
      append: (line) => lines.push(line),
      on: (event, handler) => handlers.set(event, handler),
      schedule: (fn, ms) => {
        const timer = { fn, ms, unrefd: false, unref() { this.unrefd = true; return this; } };
        timers.push(timer);
        return timer;
      },
    },
  };
}

const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

test('a reading names its process and carries rss and free', () => {
  assert.deepEqual(readingOf('wait', 'start', stubs), {
    at: '2026-10-04T12:00:00.000Z', process: 'wait', pid: process.pid, event: 'start', rss: 80 * MIB, free: 4096 * MIB,
  });
});

test('start writes a start line, then a tick every 10 minutes', (t) => {
  tempDeck(t);
  const h = harness();
  const log = startMemoryLog('daemon', h.options);
  t.after(() => log.stop());

  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 10 * 60 * 1000);
  h.timers[0].fn();
  h.timers[0].fn();
  assert.deepEqual(h.events(), ['start', 'tick', 'tick']);
  assert.ok(h.lines.every((line) => line.endsWith('\n') && JSON.parse(line).process === 'daemon'));
});

test('exit writes one exit line however many ways it is reached', (t) => {
  tempDeck(t);
  const h = harness();
  const log = startMemoryLog('wait', h.options);

  h.handlers.get('SIGTERM')();
  h.handlers.get('SIGINT')();
  h.handlers.get('exit')();
  log.stop();
  h.timers[0].fn();

  assert.deepEqual(h.events(), ['start', 'exit']);
});

test('a failing append is said once on stderr and never throws', (t) => {
  tempDeck(t);
  const h = harness();
  const written = [];
  t.mock.method(process.stderr, 'write', (chunk) => { written.push(String(chunk)); return true; });
  h.options.append = () => { throw new Error('disk full'); };

  const log = startMemoryLog('daemon', h.options);
  assert.doesNotThrow(() => h.timers[0].fn());
  assert.doesNotThrow(() => log.stop());

  t.mock.restoreAll();
  assert.deepEqual(written, ['[deck] memory log: disk full\n']);
});

test('the tick never holds the process open', (t) => {
  tempDeck(t);
  const h = harness();
  startMemoryLog('client', h.options).stop();
  assert.equal(h.timers[0].unrefd, true);
});

test('wait() and startDaemon() write no reading', async (t) => {
  const dir = tempDeck(t);
  assert.ok(memoryLogFile().startsWith(dir), 'the file looked for is the one this store would hold');
  const before = process.env.PILOT_DECK_PORT;
  t.after(() => {
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
  });
  process.env.PILOT_DECK_PORT = String(await freePort());
  await wait({ repo: 'D:/work/pilot-memory', timeoutMinutes: 0.0001, say: () => {}, warn: () => {} });
  const server = await startDaemon({ port: 0 });
  await new Promise((resolve) => server.close(resolve));

  assert.equal(fs.existsSync(memoryLogFile()), false);
});

test('a real pilot wait that times out leaves start and exit', async (t) => {
  const dir = tempDeck(t);
  const run = spawnSync(process.execPath, [PILOT, 'wait', '--timeout', '0.001'], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(await freePort()) },
    encoding: 'utf8',
    timeout: 30_000,
  });

  assert.equal(run.error, undefined);
  const readings = fs.readFileSync(path.join(dir, 'memory.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(readings.map((r) => [r.process, r.event]), [['wait', 'start'], ['wait', 'exit']]);
  assert.equal(new Set(readings.map((r) => r.pid)).size, 1);
  assert.notEqual(readings[0].pid, process.pid);
  assert.ok(readings.every((r) => r.rss > 0 && r.free > 0));
});

test('logging off writes no reading, and on resumes at the next one', (t) => {
  tempDeck(t);
  const fresh = harness();
  startMemoryLog('wait', fresh.options).stop();
  assert.deepEqual(fresh.events(), ['start', 'exit'], 'with no switch file it writes');

  setUsageSwitch(false);
  const h = harness();
  const log = startMemoryLog('daemon', h.options);
  h.timers[0].fn();
  assert.deepEqual(h.events(), []);

  setUsageSwitch(true);
  h.timers[0].fn();
  log.stop();
  assert.deepEqual(h.events(), ['tick', 'exit']);
});

/** A child that starts a memory log, with another SIGTERM listener first when `other`, then raises SIGTERM in itself. */
function signalled(dir, other) {
  const memory = new URL('../memory.mjs', import.meta.url).href;
  const probe = `
    import { startMemoryLog } from ${JSON.stringify(memory)};
    ${other ? "process.on('SIGTERM', () => { console.log('other'); process.exitCode = 0; });" : ''}
    startMemoryLog('wait');
    process.emit('SIGTERM');
    console.log('alive');
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    env: { ...process.env, PILOT_DECK_DIR: dir }, encoding: 'utf8', timeout: 30_000,
  });
  const events = fs.readFileSync(path.join(dir, 'memory.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line).event);
  return { status: run.status, stdout: run.stdout, events };
}

test('SIGTERM with no other listener ends the process as Node would, after one exit line', (t) => {
  const { status, stdout, events } = signalled(tempDeck(t), false);
  assert.equal(status, 143);
  assert.equal(stdout.includes('alive'), false);
  assert.deepEqual(events, ['start', 'exit']);
});

test('SIGTERM with another listener (the daemon\'s close) leaves the ending to it', (t) => {
  const { status, stdout, events } = signalled(tempDeck(t), true);
  assert.equal(status, 0);
  assert.match(stdout, /other\nalive/);
  assert.deepEqual(events, ['start', 'exit']);
});
