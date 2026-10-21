/** S8 of usage-telemetry: the log can be turned off (spec 13; L13, L14, A11). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import { storeDir } from '../store.mjs';
import { WINDOW_MS, startUsageLog, usageLogFile } from '../telemetry.mjs';

// Imported so that a missing module fails the tests that use it, not the file.
const usageSwitch = await import('../usage-switch.mjs').catch(() => ({}));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'deck', 'test', 'fixtures', 'telemetry');
const W_TO = Date.parse('2026-09-01T10:30:00.000Z');
const MINUTE = 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

/** The switch as the verb leaves it, written by hand so these tests need nothing of the module. */
const switchFile = () => path.join(storeDir(), 'usage-log.json');
const writeSwitch = (enabled, atMs) => fs.writeFileSync(switchFile(), JSON.stringify({ enabled, at: iso(atMs) }));

function stubbedLog(t, at) {
  let clock = at;
  const scheduled = [];
  const log = startUsageLog({ now: () => clock, schedule: (fn) => scheduled.push(fn) && { unref() {} }, projectsRoot: FIXTURE });
  t.after(() => log.stop());
  return {
    fire(atMs) {
      clock = atMs;
      return scheduled[scheduled.length - 1]();
    },
  };
}

const logLines = () => fs.readFileSync(usageLogFile(), 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));

const pilot = (...args) =>
  spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, PILOT_DECK_DIR: storeDir(), PILOT_DECK_NO_OPEN: '1' },
  });

test('a tick with the switch off appends nothing and reads no transcript', async (t) => {
  tempDeck(t);
  writeSwitch(false, W_TO - 10 * MINUTE);
  const readdir = t.mock.method(fs.promises, 'readdir');

  const log = stubbedLog(t, W_TO - 1000);
  await log.fire(W_TO);

  assert.equal(fs.existsSync(usageLogFile()), false, 'no log was written');
  assert.deepEqual(readdir.mock.calls.filter(({ arguments: [dir] }) => String(dir).startsWith(FIXTURE)), [], 'no transcript was listed');
});

test('pilot logging off then a tick, with no restart, writes nothing', async (t) => {
  tempDeck(t);
  const log = stubbedLog(t, W_TO - 1000);
  await log.fire(W_TO);
  assert.equal(logLines().length, 1, 'on: a line');

  const off = pilot('logging', 'off');
  assert.equal(off.status, 0, off.stderr);
  await log.fire(W_TO + WINDOW_MS);

  assert.equal(logLines().length, 1, 'off: no second line');
});

test('the first line after on starts at the time it was turned on', async (t) => {
  tempDeck(t);
  fs.writeFileSync(usageLogFile(), `${JSON.stringify({ window: { from: iso(W_TO - WINDOW_MS), to: iso(W_TO) } })}\n`);
  const log = stubbedLog(t, W_TO + MINUTE);

  writeSwitch(false, W_TO + 5 * MINUTE);
  await log.fire(W_TO + WINDOW_MS);
  await log.fire(W_TO + 2 * WINDOW_MS);
  assert.equal(logLines().length, 1, 'nothing while off');

  const on = W_TO + 70 * MINUTE;
  writeSwitch(true, on);
  await log.fire(W_TO + 3 * WINDOW_MS);

  const lines = logLines();
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].window, { from: iso(on), to: iso(W_TO + 3 * WINDOW_MS) }, 'the off period is not counted');

  await log.fire(W_TO + 4 * WINDOW_MS);
  assert.deepEqual(logLines()[2].window.from, lines[1].window.to, 'the next line starts where the first after on ended');
});

test('an absent or torn switch file means on', (t) => {
  tempDeck(t);
  const { readUsageSwitch, setUsageSwitch, usageSwitchFile } = usageSwitch;
  assert.equal(usageSwitchFile(), switchFile());
  assert.deepEqual(readUsageSwitch(), { enabled: true, at: '' }, 'absent');
  fs.writeFileSync(switchFile(), '{"enabled":fal');
  assert.deepEqual(readUsageSwitch(), { enabled: true, at: '' }, 'torn');
  fs.writeFileSync(switchFile(), 'null');
  assert.deepEqual(readUsageSwitch(), { enabled: true, at: '' }, 'not an object');

  assert.deepEqual(setUsageSwitch(false, () => W_TO), { enabled: false, at: iso(W_TO) });
  assert.deepEqual(readUsageSwitch(), { enabled: false, at: iso(W_TO) });
  assert.deepEqual(setUsageSwitch(false, () => W_TO + MINUTE), { enabled: false, at: iso(W_TO) }, 'setting the state it is in keeps its time');
  assert.deepEqual(setUsageSwitch(true, () => W_TO + MINUTE), { enabled: true, at: iso(W_TO + MINUTE) });
});

test('pilot logging status prints the state and the store dir', (t) => {
  tempDeck(t);
  const on = pilot('logging', 'status');
  assert.equal(on.status, 0, on.stderr);
  assert.equal(on.stdout, `logging on, ${storeDir()}\n`);

  const off = pilot('logging', 'off');
  assert.equal(off.stdout, `logging off, ${storeDir()}\n`);
  assert.equal(pilot('logging', 'status').stdout, `logging off, ${storeDir()}\n`);
  assert.equal(fs.existsSync(usageLogFile()), false, 'off neither creates nor touches the log');
  assert.equal(pilot('logging', 'on').stdout, `logging on, ${storeDir()}\n`);
});

test('pilot logging with a bad word exits 2 with its usage', (t) => {
  tempDeck(t);
  for (const args of [['logging', 'maybe'], ['logging']]) {
    const bad = pilot(...args);
    assert.equal(bad.status, 2, args.join(' '));
    assert.match(bad.stderr, /usage: pilot logging on\|off\|status/);
  }
});

test('pilot usage points to pilot logging and changes nothing', (t) => {
  tempDeck(t);
  writeSwitch(true, W_TO);
  const before = fs.readFileSync(switchFile(), 'utf8');
  for (const args of [['usage', 'off'], ['usage', 'status'], ['usage']]) {
    const old = pilot(...args);
    assert.equal(old.status, 2, args.join(' '));
    assert.equal(old.stderr, 'pilot usage is now pilot logging on|off|status\n');
    assert.equal(old.stdout, '');
  }
  assert.equal(fs.readFileSync(switchFile(), 'utf8'), before, 'the switch file is untouched');
});

test('an off set before the rename is still off', async (t) => {
  tempDeck(t);
  fs.writeFileSync(switchFile(), '{"enabled":false,"at":"2026-09-01T10:00:00.000Z"}\n');
  assert.equal(pilot('logging', 'status').stdout, `logging off, ${storeDir()}\n`);

  const log = stubbedLog(t, W_TO - 1000);
  await log.fire(W_TO);
  assert.equal(fs.existsSync(usageLogFile()), false, 'no usage line was written');
});

test('the install guide names pilot logging off', () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'INSTALL.md'), 'utf8');
  const row = guide.split('\n').find((line) => line.startsWith('| `~/.claude/pilot/` |'));
  assert.match(row, /usage\.jsonl/);
  assert.match(row, /pilot logging off/);
});
