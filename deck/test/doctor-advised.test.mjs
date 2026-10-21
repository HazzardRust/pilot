/**
 * `pilot doctor defender due` and `advised <where>`: the advice is owed once per machine, and the
 * marker that records it is checked before any probe (defender-dev-drive S2, L2, L5, A1, A2).
 * Every probe is faked and every store is a scratch directory; nothing reads the real Defender.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defenderDue, main, markAdvised } from '../doctor.mjs';

// Nothing here may reach the real ~/.claude/pilot, even through a default.
process.env.PILOT_DECK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-doctor-advised-env-'));

const ROOT = 'C:\\Users\\dev\\Projects';
const NOT_DEV_VOLUME = 'This is not a developer volume.\r\n';
const DEV_VOLUME = 'This is a trusted developer volume.\r\nDeveloper volumes are protected by antivirus filter, with performance mode enabled.\r\n';
const denied = () => Object.assign(new Error('Command failed: fsutil devdrv query C:\nError:  Access is denied.'), { status: 1 });
const never = () => assert.fail('no probe may run here');

/** PowerShell answers `defender`, fsutil answers `fsutil` (an Error is thrown). */
function fakeRun({ defender, fsutil = NOT_DEV_VOLUME }) {
  return (cmd) => {
    const answer = /powershell\.exe$/i.test(cmd) ? JSON.stringify(defender) : /fsutil\.exe$/i.test(cmd) ? fsutil : new Error(`unexpected command ${cmd}`);
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

const CANNOT_TELL_ON = { defender: { rtp: true, excl: null }, fsutil: denied() };
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-doctor-advised-'));
const marker = (storeDir) => path.join(storeDir, 'defender-advised.json');

test('cannot tell with scanning on is due', () => {
  const result = defenderDue({ platform: 'win32', run: fakeRun(CANNOT_TELL_ON), root: ROOT, storeDir: scratch() });
  assert.equal(result.due, true);
  assert.equal(result.steps.length, 2);
  assert.match(result.steps[0], /^one-time, as administrator: Add-MpPreference -ExclusionPath 'C:\\Users\\dev\\Projects'/);
  assert.match(result.steps[1], /^upgrade, as administrator: create a Dev Drive in performance mode/);
});

test('a fail is due, a pass is not', () => {
  const fail = defenderDue({ platform: 'win32', run: fakeRun({ defender: { rtp: true, excl: [] } }), root: ROOT, storeDir: scratch() });
  assert.equal(fail.due, true);
  assert.equal(fail.steps.length, 2);
  const devDrive = defenderDue({ platform: 'win32', run: fakeRun({ defender: { rtp: true, excl: [] }, fsutil: DEV_VOLUME }), root: ROOT, storeDir: scratch() });
  assert.deepEqual(devDrive, { due: false, why: 'pass' });
  // Cannot tell with scanning unreadable is not owed (A1: only with real-time scanning on).
  const unread = defenderDue({ platform: 'win32', run: fakeRun({ defender: { rtp: null, excl: null }, fsutil: denied() }), root: ROOT, storeDir: scratch() });
  assert.deepEqual(unread, { due: false, why: 'pass' });
});

test('off Windows no probe runs', () => {
  assert.deepEqual(defenderDue({ platform: 'linux', run: never, root: '/home/dev/projects', storeDir: scratch() }), { due: false, why: 'not windows' });
});

test('advised silences due without probing', async () => {
  const storeDir = scratch();
  const run = fakeRun(CANNOT_TELL_ON);
  assert.equal(defenderDue({ platform: 'win32', run, root: ROOT, storeDir }).due, true);
  markAdvised({ where: 'install', storeDir, now: new Date('2026-10-19T08:30:00Z') });
  assert.deepEqual(JSON.parse(fs.readFileSync(marker(storeDir), 'utf8')), { where: 'install', at: '2026-10-19T08:30:00.000Z' });
  assert.deepEqual(defenderDue({ platform: 'win32', run: never, root: ROOT, storeDir }), { due: false, why: 'advised install 2026-10-19' });

  // Through the CLI: due prints the two steps and exits 0, advised writes, due then exits 1 on one line.
  const cli = scratch();
  const deps = { platform: 'win32', run, root: ROOT, storeDir: cli };
  const say = async (args, d = deps) => {
    const out = [];
    const code = await main({ deps: d, log: (line) => out.push(line), args });
    return { code, out };
  };
  const first = await say(['defender', 'due']);
  assert.equal(first.code, 0);
  assert.equal(first.out.length, 2);
  assert.match(first.out[0], /^one-time, as administrator: Add-MpPreference/);
  assert.equal((await say(['defender', 'advised', 'itm_0123456789ab'])).code, 0);
  assert.equal(JSON.parse(fs.readFileSync(marker(cli), 'utf8')).where, 'itm_0123456789ab');
  const second = await say(['defender', 'due'], { ...deps, run: never });
  assert.equal(second.code, 1);
  assert.equal(second.out.length, 1);
  assert.match(second.out[0], /^not due: advised itm_0123456789ab \d{4}-\d{2}-\d{2}$/);
});

test('advised writes the marker without probing Defender', async () => {
  const storeDir = scratch();
  let probes = 0;
  const run = () => {
    probes += 1;
    throw new Error('no probe may run for advised');
  };
  assert.equal(await main({ deps: { platform: 'win32', run, root: ROOT, storeDir }, log: () => {}, args: ['defender', 'advised', 'install'] }), 0);
  assert.equal(probes, 0);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(marker(storeDir), 'utf8'))), ['where', 'at']);
});

test('a bad where writes nothing', async () => {
  const storeDir = scratch();
  for (const where of ['../x', 'itm_zz', 'itm_0123456789abc', 'INSTALL', '', undefined]) {
    const out = [];
    const args = where === undefined ? ['defender', 'advised'] : ['defender', 'advised', where];
    assert.equal(await main({ deps: { platform: 'win32', run: never, root: ROOT, storeDir }, log: (line) => out.push(line), args }), 2, String(where));
    assert.deepEqual(out, []);
  }
  assert.deepEqual(fs.readdirSync(storeDir), []);
});

test('a malformed marker reads as absent', () => {
  for (const garbage of ['not json', '{}', '[]', 'null', JSON.stringify({ where: '../x', root: ROOT, verdict: 'fail', at: '2026-10-19T08:30:00.000Z' }), JSON.stringify({ where: 'install', at: 7 })]) {
    const storeDir = scratch();
    fs.writeFileSync(marker(storeDir), garbage);
    assert.equal(defenderDue({ platform: 'win32', run: fakeRun(CANNOT_TELL_ON), root: ROOT, storeDir }).due, true, garbage);
  }
});
