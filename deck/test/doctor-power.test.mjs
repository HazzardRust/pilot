/**
 * The doctor's Power row (stay-awake spec 3, 4; L4, L6, A3): the seven states through `powerRow`, and
 * `readPower` against `powercfg` output captured on a Windows laptop.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { powerRow, readPower } from '../power.mjs';
import { probeDeck } from '../probe.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const HELD = { held: true, since: '2026-11-25T10:00:00.000Z' };
const LID_STEP = 'Control Panel > Power Options > "Choose what closing the lid does"';

const windows = (overrides = {}) => ({
  source: 'ac',
  lid: { ac: 'nothing', dc: 'sleep' },
  button: { ac: 'sleep', dc: 'sleep' },
  modernStandby: true,
  ...overrides,
});
const text = (row) => [row.detail, ...(row.steps ?? [])].join('\n');

test('plugged in, lid does nothing: pass, naming whether the deck holds and the power button action', () => {
  const row = powerRow({ power: windows(), awake: HELD, platform: 'win32' });
  assert.equal(row.name, 'Power');
  assert.equal(row.verdict, 'pass');
  assert.match(row.detail, /held since 2026-11-25T10:00:00\.000Z/);
  assert.match(row.detail, /power button sleeps/);
  const free = powerRow({ power: windows(), awake: { held: false, since: null }, platform: 'win32' });
  assert.match(free.detail, /not held/);
});

test('plugged in, lid sleeps: fail, with the Control Panel step for plugged in', () => {
  const row = powerRow({ power: windows({ lid: { ac: 'sleep', dc: 'sleep' } }), awake: HELD, platform: 'win32' });
  assert.equal(row.verdict, 'fail');
  assert.ok(row.steps.some((step) => step.includes(LID_STEP) && /plugged in/.test(step)), text(row));
});

test('on battery: fail, naming the battery lid action, with the 5-minute note only on Modern Standby', () => {
  const row = powerRow({ power: windows({ source: 'battery' }), awake: HELD, platform: 'win32' });
  assert.equal(row.verdict, 'fail');
  assert.match(row.detail, /on battery/);
  assert.match(row.detail, /lid .*sleeps on battery/);
  assert.match(text(row), /5 minutes after the sleep timeout/);
  const legacy = powerRow({ power: windows({ source: 'battery', lid: { ac: 'nothing', dc: 'nothing' }, modernStandby: false }), awake: HELD, platform: 'win32' });
  assert.equal(legacy.verdict, 'fail', 'on battery fails even with the lid set to do nothing (A3)');
  assert.doesNotMatch(text(legacy), /5 minutes/);
});

test('unreadable: cannot tell, never fail', () => {
  const unread = { source: null, lid: { ac: null, dc: null }, button: { ac: null, dc: null }, modernStandby: null };
  for (const platform of ['win32', 'darwin', 'linux', 'freebsd']) {
    assert.equal(powerRow({ power: unread, awake: undefined, platform }).verdict, 'cannot tell', platform);
  }
  const lidUnread = powerRow({ power: windows({ lid: { ac: null, dc: null } }), awake: HELD, platform: 'win32' });
  assert.equal(lidUnread.verdict, 'cannot tell');
});

test('the deck down: the row says the request is not held', () => {
  const row = powerRow({ power: windows(), awake: undefined, platform: 'win32' });
  assert.match(row.detail, /not held/);
});

test('macOS and Linux: each names its own lid setting', () => {
  const mac = powerRow({ power: { source: 'ac', lid: { ac: null, dc: null }, button: { ac: null, dc: null }, modernStandby: null }, awake: HELD, platform: 'darwin' });
  assert.match(text(mac), /lid close sleeps a Mac unless it is in clamshell mode on power/);
  assert.notEqual(mac.verdict, 'fail');
  const linux = powerRow({ power: { source: 'ac', lid: { ac: 'sleep', dc: 'sleep' }, button: { ac: 'shutdown', dc: 'shutdown' }, modernStandby: null }, awake: HELD, platform: 'linux' });
  assert.equal(linux.verdict, 'fail');
  assert.ok(linux.steps.some((step) => step.includes('HandleLidSwitchExternalPower') && step.includes('/etc/systemd/logind.conf')), text(linux));
});

/** The reads captured on one Windows laptop: powercfg /qh per setting, and the status script's JSON. */
const windowsRun = (calls, lid = fixture('powercfg-lidaction.txt')) => (cmd, args) => {
  calls.push([path.win32.basename(cmd).toLowerCase(), ...args]);
  if (args.includes('5ca83367-6e45-459f-a27b-476b1d01c936')) return lid;
  if (args.includes('7648efa3-dd9c-4e3e-b566-50f929386280')) return fixture('powercfg-pbuttonaction.txt');
  return fixture('power-status-win32.json');
};
/** The captured lid output with its DC index set to `hex`, so AC and DC differ. */
const lidWithDc = (hex) => fixture('powercfg-lidaction.txt').replace(/(DC Power Setting Index: 0x)[0-9a-f]{8}/i, `$1${hex}`);

test('readPower parses the powercfg output captured on a Windows laptop, by GUID and index', () => {
  const calls = [];
  const run = windowsRun(calls);
  assert.deepEqual(readPower({ platform: 'win32', run }), {
    source: 'ac',
    lid: { ac: 'nothing', dc: 'nothing' },
    button: { ac: 'sleep', dc: 'sleep' },
    modernStandby: true,
  });
  assert.ok(calls.every(([cmd]) => cmd === 'powercfg.exe' || cmd === 'powershell.exe'), JSON.stringify(calls));
  assert.ok(calls.filter(([cmd]) => cmd === 'powercfg.exe').every(([, flag]) => flag === '/qh'), 'reads only');
});

test('readPower reads AC before DC, and a lid index past shut down as unread', () => {
  assert.deepEqual(readPower({ platform: 'win32', run: windowsRun([], lidWithDc('00000001')) }).lid, { ac: 'nothing', dc: 'sleep' });
  assert.deepEqual(readPower({ platform: 'win32', run: windowsRun([], lidWithDc('00000004')) }).lid, { ac: 'nothing', dc: null });
});

test('readPower: a read that throws or answers junk is null, never a guess', () => {
  const unread = { source: null, lid: { ac: null, dc: null }, button: { ac: null, dc: null }, modernStandby: null };
  const throws = () => {
    throw new Error('powercfg: access denied');
  };
  for (const platform of ['win32', 'darwin', 'linux', 'freebsd']) {
    assert.deepEqual(readPower({ platform, run: throws }), unread, platform);
    assert.deepEqual(readPower({ platform, run: () => 'junk' }), unread, platform);
  }
});

test('probeDeck copies awake from health only when held is a boolean (L6)', async (t) => {
  let health;
  const server = http.createServer((req, res) => res.end(JSON.stringify(health)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  health = { ok: true, pid: 4242, awake: HELD };
  assert.deepEqual((await probeDeck(url)).awake, HELD);
  health = { ok: true, pid: 4242, awake: { held: 'yes', since: 3 } };
  assert.equal((await probeDeck(url)).awake, undefined);
  health = { ok: true, pid: 4242, awake: { held: false, since: 7 } };
  assert.deepEqual((await probeDeck(url)).awake, { held: false, since: null });
  health = { ok: true, pid: 4242, awake: { held: true, since: '\u001b[2J2026-11-25T10:00:00.000Z' } };
  assert.deepEqual((await probeDeck(url)).awake, { held: true, since: null }, 'only an ISO time is copied');
});

test('readPower on macOS and Linux reads the source and logind actions', () => {
  const mac = readPower({ platform: 'darwin', run: () => "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t80%; discharging\n" });
  assert.equal(mac.source, 'battery');
  const answers = { HandleLidSwitch: 's "suspend"', HandleLidSwitchExternalPower: 's "ignore"', HandlePowerKey: 's "poweroff"', OnBattery: 'b false' };
  const linux = readPower({ platform: 'linux', run: (cmd, args) => `${answers[args.at(-1)]}\n` });
  assert.deepEqual(linux, { source: 'ac', lid: { ac: 'nothing', dc: 'sleep' }, button: { ac: 'shutdown', dc: 'shutdown' }, modernStandby: null });
});
