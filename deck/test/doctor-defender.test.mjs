/**
 * `pilot doctor defender`: the Defender row alone, the exclusion first (defender-dev-drive S1, L8).
 * Every probe is faked; nothing here reads or changes the real Defender.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { defenderRow, main } from '../doctor.mjs';

const ROOT = 'C:\\Users\\dev\\Projects';
const NOT_DEV_VOLUME = 'This is not a developer volume.\r\n';
const DEV_VOLUME = 'This is a trusted developer volume.\r\nDeveloper volumes are protected by antivirus filter, with performance mode enabled.\r\n';
const denied = () => Object.assign(new Error('Command failed: fsutil devdrv query C:\nError:  Access is denied.'), { status: 1 });

/** PowerShell answers `defender`, fsutil answers `fsutil` (an Error is thrown). */
function fakeRun({ defender, fsutil = NOT_DEV_VOLUME }) {
  return (cmd) => {
    const answer = /powershell\.exe$/i.test(cmd) ? JSON.stringify(defender) : /fsutil\.exe$/i.test(cmd) ? fsutil : new Error(`unexpected command ${cmd}`);
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

/** Every other probe faked to pass, Defender's `run` given. */
function deps(run) {
  return {
    platform: 'win32',
    run,
    root: ROOT,
    nodeVersion: '22.8.0',
    engines: '>=22.8.0',
    resolveDep: () => true,
    storeDir: 'C:\\Users\\dev\\.claude\\pilot',
    canWrite: () => true,
    onPath: () => true,
    probe: async () => ({ state: 'none' }),
  };
}

const VERDICTS = [
  ['pass', { defender: { rtp: true, excl: [] }, fsutil: DEV_VOLUME }, 0],
  ['fail', { defender: { rtp: true, excl: [] }, fsutil: NOT_DEV_VOLUME }, 1],
  ['cannot tell', { defender: { rtp: true, excl: null }, fsutil: denied() }, 0],
];

async function printed(args, run) {
  const out = [];
  const code = await main({ deps: deps(run), log: (line) => out.push(line), args });
  return { code, out };
}

test('the row alone matches doctor\'s row', async () => {
  for (const [, answers] of VERDICTS) {
    const run = fakeRun(answers);
    const all = await printed([], run);
    const alone = await printed(['defender'], run);
    const fromDoctor = all.out.filter((line) => /^(pass|fail|cannot tell) {2}Defender: /.test(line));
    assert.equal(fromDoctor.length, 1, all.out.join('\n'));
    assert.deepEqual(alone.out, fromDoctor);
  }
});

test('each verdict renders and exits', async () => {
  for (const [verdict, answers, code] of VERDICTS) {
    const run = fakeRun(answers);
    assert.equal(defenderRow({ platform: 'win32', run, root: ROOT }).verdict, verdict);
    const alone = await printed(['defender'], run);
    assert.equal(alone.code, code, verdict);
    assert.ok(alone.out[0].startsWith(`${verdict}  Defender: `), alone.out.join('\n'));
  }
});

test('the exclusion leads', () => {
  for (const [verdict, answers] of VERDICTS.filter(([v]) => v !== 'pass')) {
    const { steps } = defenderRow({ platform: 'win32', run: fakeRun(answers), root: ROOT });
    assert.equal(steps.length, 2, verdict);
    assert.match(steps[0], /^one-time, as administrator: Add-MpPreference -ExclusionPath 'C:\\Users\\dev\\Projects'/);
    assert.match(steps[0], /Remove-MpPreference/);
    assert.match(steps[1], /^upgrade, as administrator: create a Dev Drive in performance mode/);
  }
});

test('an unknown argument is refused', async () => {
  const never = () => assert.fail('no probe may run on a refused argument');
  const refused = { ...deps(never), probe: never, onPath: never, canWrite: never, resolveDep: never };
  const malformed = [['defender', 'x'], ['nope'], ['nope', 'due'], ['defender', 'due', 'x'], ['defender', 'x', 'install'], ['defender', 'advised', 'install', 'x']];
  for (const args of malformed) {
    const out = [];
    const err = [];
    const write = process.stderr.write;
    process.stderr.write = (chunk) => err.push(String(chunk));
    try {
      assert.equal(await main({ deps: refused, log: (line) => out.push(line), args }), 2, args.join(' '));
    } finally {
      process.stderr.write = write;
    }
    assert.deepEqual(out, []);
    assert.deepEqual(err, ['usage: pilot doctor [defender [due | advised <install|item id>]]\n'], args.join(' '));
  }
});
