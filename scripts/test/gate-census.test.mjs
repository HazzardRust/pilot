/**
 * The gate's census (process-gc spec 3; S8, L9, L16): a pilot-owned process this checkout's suite
 * started and left running makes `npm test` red, named by pid, kind and command, after the gate
 * has polled through a grace, stopped it, and watched it survive a second grace.
 */
import '../../deck/test/no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { leftovers, census, runGate } = await import('../gate.mjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CWD = 'C:/work/pilot';

/** A process-table row for a node running `<dir>/deck/daemon.mjs` leashed to 7. */
const daemon = (pid, dir = CWD) => ({ pid, ppid: 7, name: 'node.exe', command: `node ${dir}/deck/daemon.mjs --leash 7`, ageS: 1 });
const owned = (row) => ({ ...row, kind: 'daemon' });

/** `census` over `tables` in turn (the last repeats) on a fake clock that `sleep` advances. */
function runCensus(tables, { stops = [], dies = false, deckPid = () => null, self = 99 } = {}) {
  let clock = 0;
  let reads = 0;
  let killed = false;
  const read = () => (killed && dies ? [] : tables[Math.min(reads++, tables.length - 1)]);
  const kill = () => (pid, tree) => {
    stops.push({ pid, tree });
    killed = true;
  };
  const result = census([], { cwd: CWD, read, kill, deckPid, self, sleep: (ms) => (clock += ms), now: () => clock });
  return { ...result, clock, stops };
}

test('a process present before is not a leftover', () => {
  assert.deepEqual(leftovers([owned(daemon(10))], [owned(daemon(10))], CWD), []);
  assert.deepEqual(leftovers([], [owned(daemon(10))], CWD), [owned(daemon(10))], 'one absent before is');
});

test('a process under another checkout is not a leftover', () => {
  const sibling = owned(daemon(11, 'C:/work/pilot-process-gc-s8'));
  assert.deepEqual(leftovers([], [sibling], CWD), []);
  assert.deepEqual(leftovers([], [owned(daemon(12, 'D:/C:/work/pilot'))], CWD), [], 'a path that only contains the checkout');
});

test('the leak fixture is red and names it', (t) => {
  const fixture = path.join(HERE, 'fixtures', 'leak');
  // The kill is a no-op, so the sleeper survives it the way a process the gate cannot stop would.
  const script = `const { runGate } = await import(${JSON.stringify(pathToFileURL(path.join(HERE, '..', 'gate.mjs')).href)});
process.exitCode = runGate([], { cwd: ${JSON.stringify(fixture)}, graceMs: 2000, kill: () => () => {}, deckPid: () => null });`;
  // argv[1] is this file, so the gate's own main guard sees an import and runs no second suite.
  // Without NODE_TEST_CONTEXT, or the inner node --test reads itself as nested and runs no file.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script, fileURLToPath(import.meta.url)], {
    encoding: 'utf8',
    env: { ...env, PILOT_LEAK_FIXTURE: '1' },
    timeout: 50_000,
    windowsHide: true,
  });
  const named = /^left running: (\d+) daemon .*leak.deck.daemon\.mjs$/m.exec(run.stdout);
  if (named) t.after(() => process.kill(Number(named[1])));
  assert.ok(named, `the sleeper is named:\n${run.stdout}\n${run.stderr}`);
  assert.equal(run.status, 1);
});

test('a leashed daemon that dies in the grace is not a leftover', () => {
  const { red, lines, stops } = runCensus([[daemon(20)], [daemon(20)], [daemon(20)], []]);
  assert.deepEqual({ red, lines, stops }, { red: false, lines: ['left running: none'], stops: [] });
});

test('a process that dies on the gate kill is green and the line says it was stopped', () => {
  const { red, lines, stops } = runCensus([[daemon(21)]], { dies: true });
  assert.deepEqual(stops, [{ pid: 21, tree: false }]);
  assert.deepEqual({ red, lines }, { red: false, lines: [`stopped 21 daemon ${daemon(21).command}`, 'left running: none'] });
});

test('a process that survives the gate kill is red, after two graces', () => {
  const { red, lines, clock } = runCensus([[daemon(22)]]);
  assert.equal(red, true);
  assert.deepEqual(lines, [`stopped 22 daemon ${daemon(22).command}`, `left running: 22 daemon ${daemon(22).command}`]);
  assert.ok(clock >= 20_000 && clock <= 22_000, `polled through both 10 s graces, not past them: ${clock}`);
});

test('a process table the census cannot read makes the gate red', () => {
  const slot = () => ({ slot: 0, waited: false, release: () => {} });
  const read = () => {
    throw new Error('powershell.exe not found');
  };
  assert.equal(runGate([], { cwd: CWD, spawn: () => ({ status: 0 }), slot, read }), 1);
});

test("a process a claude session started beside the gate is not the suite's", () => {
  const claude = { pid: 5, ppid: 0, name: 'claude.exe', command: 'claude', ageS: 9 };
  const gate = { pid: 99, ppid: 5, name: 'node.exe', command: 'node scripts/gate.mjs', ageS: 9 };
  const beside = { ...daemon(30), ppid: 5 };
  assert.deepEqual(runCensus([[claude, gate, beside]]).lines, ['left running: none'], 'a session process is never stopped');
  const under = { ...daemon(31), ppid: 99 };
  assert.deepEqual(runCensus([[claude, gate, under]], { dies: true }).stops, [{ pid: 31, tree: false }], 'one under the gate is');
});

test("a leashless daemon is not stopped when the user's deck cannot be read", () => {
  const leashless = { ...daemon(32), command: `node ${CWD}/deck/daemon.mjs` };
  const { red, lines, stops } = runCensus([[leashless]], { deckPid: () => undefined });
  assert.deepEqual(stops, []);
  assert.equal(red, true);
  assert.deepEqual(lines, ["not stopped 32: cannot tell it from the user's deck", `left running: 32 daemon ${leashless.command}`]);
});
