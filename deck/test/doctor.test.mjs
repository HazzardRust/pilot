/**
 * `pilot doctor`'s scanner check (process-gc S11, L12). Every answer Defender and fsutil can give
 * is a fake `run`; nothing here reads or changes the real Defender.
 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { checkAll, checkScanner, main } from '../doctor.mjs';

const ROOT = 'C:\\Users\\dev\\Projects';
const EXCLUSION_STEP = `one-time, as administrator: Add-MpPreference -ExclusionPath '${ROOT}' (reversible with Remove-MpPreference)`;
const DEV_DRIVE_STEP = `upgrade, as administrator: create a Dev Drive in performance mode and move ${ROOT} onto it (Settings > System > Storage > Advanced > Disks & volumes > Create Dev Drive)`;
const NOT_DEV_VOLUME = 'This is not a developer volume.\r\n';
const DEV_VOLUME = 'This is a trusted developer volume.\r\nDeveloper volumes are protected by antivirus filter, with performance mode enabled.\r\n';

/** A fake runner: PowerShell answers `defender`, fsutil answers `fsutil` (an Error is thrown). */
function fake({ defender, fsutil = NOT_DEV_VOLUME }) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, args]);
    const answer = /powershell\.exe$/i.test(cmd) ? JSON.stringify(defender) : /fsutil\.exe$/i.test(cmd) ? fsutil : null;
    if (answer instanceof Error) throw answer;
    if (answer === null) throw new Error(`unexpected command ${cmd}`);
    return answer;
  };
  return { run, calls };
}

const denied = () => Object.assign(new Error('Command failed: fsutil devdrv query C:\nError:  Access is denied.'), { status: 1 });

test('scanning on and root not excluded names both steps', () => {
  const { run, calls } = fake({ defender: { rtp: true, excl: ['D:\\other', 'C:\\Users\\dev\\Projects-old'] } });
  const { state, lines } = checkScanner({ platform: 'win32', run, root: ROOT });
  assert.equal(state, 'not-excluded');
  const exclusion = lines.indexOf(EXCLUSION_STEP);
  assert.ok(exclusion >= 0, lines.join('\n'));
  assert.equal(lines[exclusion + 1], DEV_DRIVE_STEP);
  // The root is an argv element of fsutil, never part of a script string.
  assert.deepEqual(calls.find(([cmd]) => /fsutil\.exe$/i.test(cmd))[1], ['devdrv', 'query', 'C:']);
  for (const [, args] of calls) assert.ok(!args.join(' ').includes('Projects'), args.join(' '));
});

test('root on a Dev Drive in performance mode says so', () => {
  const { run } = fake({ defender: { rtp: true, excl: 'N/A: Must be an administrator to view exclusions' }, fsutil: DEV_VOLUME });
  const { state, lines } = checkScanner({ platform: 'win32', run, root: ROOT });
  assert.equal(state, 'dev-drive');
  assert.ok(lines.some((line) => /Dev Drive in performance mode/.test(line)), lines.join('\n'));
  assert.ok(!lines.includes(DEV_DRIVE_STEP) && !lines.includes(EXCLUSION_STEP), lines.join('\n'));
});

test('root excluded says so', () => {
  // One exclusion comes back from ConvertTo-Json as a bare string; the parent of the root, in
  // another case and with a trailing slash, still covers it.
  const { run } = fake({ defender: { rtp: true, excl: 'c:\\users\\DEV\\' } });
  const { state, lines } = checkScanner({ platform: 'win32', run, root: ROOT });
  assert.equal(state, 'excluded');
  assert.ok(lines.some((line) => line.includes('is excluded')), lines.join('\n'));
  assert.ok(!lines.includes(DEV_DRIVE_STEP) && !lines.includes(EXCLUSION_STEP), lines.join('\n'));
});

test('exclusions unreadable says cannot tell', () => {
  for (const defender of [
    { rtp: true, excl: 'N/A: Must be an administrator to view exclusions' },
    { rtp: true, excl: ['N/A: Must be an administrator to view exclusions'] },
    { rtp: true, excl: null },
  ]) {
    const { run } = fake({ defender, fsutil: denied() });
    const { state, lines } = checkScanner({ platform: 'win32', run, root: ROOT });
    assert.equal(state, 'unknown', JSON.stringify(defender));
    assert.ok(lines.some((line) => line.includes('cannot tell without an administrator')), lines.join('\n'));
    assert.deepEqual(lines.slice(-2), [EXCLUSION_STEP, DEV_DRIVE_STEP]);
  }
  // Exclusions readable and not covering the root, but the volume unreadable: still cannot tell.
  const { run } = fake({ defender: { rtp: true, excl: [] }, fsutil: denied() });
  assert.equal(checkScanner({ platform: 'win32', run, root: ROOT }).state, 'unknown');
  // Defender itself unreadable (PowerShell failed): cannot tell, never "off".
  const broken = () => {
    throw new Error('powershell failed');
  };
  assert.equal(checkScanner({ platform: 'win32', run: broken, root: ROOT }).state, 'unknown');
});

test('an answer doctor cannot read is never a claim', () => {
  // fsutil text that names no developer volume either way, and exclusions doctor cannot match
  // literally (a wildcard, an environment variable): cannot tell, not "not excluded".
  for (const [defender, fsutil] of [
    [{ rtp: true, excl: [] }, 'Error:  The parameter is incorrect.\r\n'],
    [{ rtp: true, excl: ['C:\Users\*\Projects'] }, NOT_DEV_VOLUME],
    [{ rtp: true, excl: ['%USERPROFILE%\Projects'] }, NOT_DEV_VOLUME],
  ]) {
    const { run } = fake({ defender, fsutil });
    assert.equal(checkScanner({ platform: 'win32', run, root: ROOT }).state, 'unknown', JSON.stringify(defender));
  }
  // A Dev Drive without performance mode still needs the step; a bare drive exclusion covers the root.
  const plain = fake({ defender: { rtp: true, excl: [] }, fsutil: 'This is a trusted developer volume.\r\n' });
  assert.equal(checkScanner({ platform: 'win32', run: plain.run, root: ROOT }).state, 'not-excluded');
  const drive = fake({ defender: { rtp: true, excl: ['C:'] } });
  assert.equal(checkScanner({ platform: 'win32', run: drive.run, root: ROOT }).state, 'excluded');
});

test('scanning off and other platforms', () => {
  const { run } = fake({ defender: { rtp: false, excl: [] } });
  const off = checkScanner({ platform: 'win32', run, root: ROOT });
  assert.equal(off.state, 'off');
  assert.ok(!off.lines.includes(DEV_DRIVE_STEP), off.lines.join('\n'));

  const never = () => assert.fail('no probe may run off Windows');
  for (const platform of ['linux', 'darwin']) {
    const other = checkScanner({ platform, run: never, root: '/home/dev/projects' });
    assert.equal(other.state, 'not-windows');
    assert.ok(other.lines.some((line) => line.includes('no scanner check')), other.lines.join('\n'));
  }
});

test('the OPERATING.md paragraph names pilot doctor and the step', () => {
  const readme = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'OPERATING.md'), 'utf8');
  const { run } = fake({ defender: { rtp: true, excl: [] } });
  const { lines } = checkScanner({ platform: 'win32', run, root: '<projects root>' });
  assert.match(readme, /pilot doctor/);
  for (const step of lines.slice(-2)) assert.ok(readme.includes(step), `docs/OPERATING.md lacks: ${step}`);
});

test('the printed exclusion line keeps the root a literal in PowerShell', () => {
  const { run } = fake({ defender: { rtp: true, excl: [] } });
  const root = 'C:\\Users\\o\u2018brien\\$(x)\\`id\\it\'s';
  const { lines } = checkScanner({ platform: 'win32', run, root });
  assert.equal(lines.at(-2), "one-time, as administrator: Add-MpPreference -ExclusionPath 'C:\\Users\\o\u2018\u2018brien\\$(x)\\`id\\it''s' (reversible with Remove-MpPreference)");
});

test('the Defender query leaves an unreadable exclusion list null', () => {
  const seen = [];
  checkScanner({ platform: 'win32', run: (cmd, args) => { seen.push(args.join(' ')); return JSON.stringify({ rtp: true, excl: [] }); }, root: ROOT });
  assert.match(seen[0], /if \(\$null -ne \$x\) \{ \$r\.excl = \[string\[\]\]@\(\$x \| Where-Object/);
});


/** Every probe faked to pass, so a test changes only the one it is about; nothing real runs. */
function passing(overrides = {}) {
  return {
    platform: 'linux',
    run: () => assert.fail('no Defender probe off Windows'),
    root: '/home/dev/projects',
    nodeVersion: '22.8.0',
    engines: '>=22.8.0',
    resolveDep: () => true,
    storeDir: '/home/dev/.claude/pilot',
    canWrite: () => true,
    onPath: () => true,
    probe: async () => ({ state: 'none' }),
    ...overrides,
  };
}
const row = (rows, name) => rows.find((r) => r.name === name) ?? assert.fail(`no row ${name} in ${rows.map((r) => r.name)}`);

test('an old Node fails its row', async () => {
  const node = row(await checkAll(passing({ nodeVersion: '20.0.0', engines: '>=22.8.0' })), 'Node');
  assert.equal(node.verdict, 'fail');
  assert.match(node.detail, /20\.0\.0/);
  assert.match(node.detail, />=22\.8\.0/);
  assert.equal(row(await checkAll(passing({ nodeVersion: '22.10.1' })), 'Node').verdict, 'pass');
  assert.equal(row(await checkAll(passing({ nodeVersion: '22.8.0' })), 'Node').verdict, 'pass');
  assert.equal(row(await checkAll(passing({ engines: '^22 || ^24' })), 'Node').verdict, 'cannot tell');
});

test('a missing dependency fails its row', async () => {
  const seen = [];
  const dep = row(await checkAll(passing({ resolveDep: (name) => (seen.push(name), false) })), 'deck dependency');
  assert.deepEqual(seen, ['@modelcontextprotocol/sdk']);
  assert.equal(dep.verdict, 'fail');
  assert.ok([dep.detail, ...(dep.steps ?? [])].some((text) => /npm ci/.test(text) && text.includes(path.resolve(fileURLToPath(import.meta.url), '..', '..', '..'))), JSON.stringify(dep));
  assert.equal(row(await checkAll(passing()), 'deck dependency').verdict, 'pass');
});

test('an unwritable store fails its row', async () => {
  const dir = '/home/dev/.claude/pilot';
  const seen = [];
  const store = row(await checkAll(passing({ storeDir: dir, canWrite: (d) => (seen.push(d), false) })), 'store directory');
  assert.deepEqual(seen, [dir]);
  assert.equal(store.verdict, 'fail');
  assert.ok(store.detail.includes(dir), store.detail);
  assert.equal(row(await checkAll(passing()), 'store directory').verdict, 'pass');
});

test('a CLI not on PATH fails, an unreadable answer cannot tell', async () => {
  const answers = { gh: false, git: null, claude: true };
  const rows = await checkAll(passing({ onPath: (cmd) => answers[cmd] }));
  assert.equal(row(rows, 'gh on PATH').verdict, 'fail');
  assert.equal(row(rows, 'git on PATH').verdict, 'cannot tell');
  assert.equal(row(rows, 'claude on PATH').verdict, 'pass');
});

test('Defender keeps its states as a row', async () => {
  const ROOT_STEPS = [EXCLUSION_STEP, DEV_DRIVE_STEP];
  for (const [defender, fsutil, verdict] of [
    [{ rtp: false, excl: [] }, NOT_DEV_VOLUME, 'pass'],
    [{ rtp: true, excl: ['C:\\Users\\dev'] }, NOT_DEV_VOLUME, 'pass'],
    [{ rtp: true, excl: [] }, DEV_VOLUME, 'pass'],
    [{ rtp: true, excl: [] }, NOT_DEV_VOLUME, 'fail'],
    [{ rtp: true, excl: null }, denied(), 'cannot tell'],
  ]) {
    const { run } = fake({ defender, fsutil });
    const scanner = row(await checkAll(passing({ platform: 'win32', run, root: ROOT })), 'Defender');
    assert.equal(scanner.verdict, verdict, JSON.stringify(defender));
    if (verdict === 'pass') assert.equal(scanner.steps, undefined);
    else assert.deepEqual(scanner.steps, ROOT_STEPS);
  }
});

test('doctor exits 1 on a fail and 0 otherwise', async () => {
  const printed = [];
  const log = (line) => printed.push(line);
  assert.equal(await main({ deps: passing({ onPath: (cmd) => (cmd === 'gh' ? null : true) }), log }), 0);
  assert.ok(printed.some((line) => line.startsWith('cannot tell  gh on PATH: ')), printed.join('\n'));
  printed.length = 0;
  assert.equal(await main({ deps: passing({ canWrite: () => false }), log }), 1);
  assert.ok(printed.some((line) => line.startsWith('fail  store directory: ')), printed.join('\n'));
  assert.equal(printed.filter((line) => /^(pass|fail|cannot tell)  /.test(line)).length, (await checkAll(passing())).length);
});
