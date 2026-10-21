/**
 * The gate's spawn count (process-gc spec 6; S9, L10, L16): every gate prints how many processes
 * the suite started, by kind, grandchildren included, and is red above `SPAWN_CEILING`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { spawnCount } = await import('../count-spawns.mjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = pathToFileURL(path.join(HERE, '..', 'gate.mjs')).href;
const FIXTURE = path.join(HERE, 'fixtures', 'spawns', 'spawns.test.mjs');

/** The fixture run through the gate in `mode`, in-process (`--test-isolation=none`) so only its own spawns count. */
function gateOnFixture(t, mode, ceiling) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-spawns-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const spawns = path.join(dir, 'spawns.txt');
  const options = JSON.stringify({ cwd: path.dirname(FIXTURE), spawns, ceiling }).slice(1, -1);
  // The census reads an empty table: this pins the count, not the census.
  const script = `const { runGate } = await import(${JSON.stringify(GATE)});
process.exitCode = runGate(['--test-isolation=none', ${JSON.stringify(FIXTURE)}], { ${options}, read: () => [] });`;
  // argv[1] is this file, so the gate's main guard sees an import; NODE_TEST_CONTEXT would make the inner run read as nested.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script, fileURLToPath(import.meta.url)], {
    encoding: 'utf8',
    env: { ...env, PILOT_SPAWNS_FIXTURE: mode },
    timeout: 50_000,
    windowsHide: true,
  });
  return { ...run, count: fs.existsSync(spawns) ? spawnCount(spawns) : undefined };
}

// The fixture's git is a spawnSync, which the diagnostics channel never sees: git 1 pins the spawn_sync path;
// its async node is named only after the channel fires, so node 2 pins the deferred record.
/** The count by kind, without its owners. */
const kinds = (count) => count && { total: count.total, node: count.node, git: count.git, other: count.other };

test('three spawns are counted by kind', (t) => {
  const run = gateOnFixture(t, 'three');
  assert.deepEqual(kinds(run.count), { total: 3, node: 2, git: 1, other: 0 }, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /^spawns 3 \(node 2, git 1, other 0\)$/m);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});

test("a grandchild's spawns are counted", (t) => {
  const run = gateOnFixture(t, 'grandchild');
  assert.deepEqual(kinds(run.count), { total: 2, node: 1, git: 1, other: 0 }, `${run.stdout}\n${run.stderr}`);
});

test('over the ceiling is red', (t) => {
  const run = gateOnFixture(t, 'three', 2);
  assert.equal(run.count?.total, 3, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /^spawns over 2(;|$)/m);
  assert.equal(run.status, 1);
});

/** A spawn file in a fresh directory holding `lines`. */
function spawnFile(t, lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-spawns-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'spawns.txt');
  fs.writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  return file;
}

test('spawnCount attributes a line to its owner', (t) => {
  const file = spawnFile(t, [
    '1 node a.test.mjs',
    '2 C:\\Program Files\\Git\\cmd\\git.exe a.test.mjs',
    '3 git b.test.mjs',
    '4 C:\\Program Files\\nodejs\\node.exe',
    '5 cmd.exe',
    '6 cmd.exe -',
  ]);
  const count = spawnCount(file);
  assert.deepEqual(kinds(count), { total: 6, node: 2, git: 2, other: 2 });
  assert.deepEqual(count.owners, new Map([['a.test.mjs', 2], ['b.test.mjs', 1], ['-', 3]]));
});

test('over the ceiling the gate names the top three owners', async (t) => {
  const { runGate } = await import(GATE);
  const lines = [
    ...Array(5).fill('1 git a.test.mjs'),
    ...Array(3).fill('1 git b.test.mjs'),
    '1 git d.test.mjs',
    '1 git c.test.mjs',
    ...Array(6).fill('1 node -'),
  ];
  const gate = (ceiling) => {
    const file = spawnFile(t, []);
    const out = [];
    const write = t.mock.method(process.stdout, 'write', (text) => out.push(text) && true);
    try {
      runGate([], {
        spawns: file,
        ceiling,
        read: () => [],
        slot: () => ({ slot: 1, release() {} }),
        spawn: () => {
          fs.writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
          return { status: 0 };
        },
      });
    } finally {
      write.mock.restore();
    }
    return out.join('');
  };
  const over = gate(10);
  assert.match(over, /^spawns 16 \(node 6, git 10, other 0\)\nspawns over 10; most: a\.test\.mjs 5, b\.test\.mjs 3, c\.test\.mjs 1$/m);
  const under = gate(100);
  assert.match(under, /^spawns 16 \(node 6, git 10, other 0\)$/m);
  assert.doesNotMatch(under, /spawns over/);
});

test("a test's node child inherits its owner", (t) => {
  const file = spawnFile(t, []);
  const counter = pathToFileURL(path.join(HERE, '..', 'count-spawns.mjs')).href;
  const { NODE_TEST_CONTEXT, PILOT_GATE_OWNER, ...env } = process.env;
  // The preload rides NODE_OPTIONS, as under the gate, so the fixture's node child loads it too.
  const run = spawnSync(process.execPath, [FIXTURE], {
    encoding: 'utf8',
    env: { ...env, NODE_OPTIONS: `--import=${counter}`, PILOT_GATE_SPAWNS: file, PILOT_SPAWNS_FIXTURE: 'grandchild' },
    timeout: 50_000,
    windowsHide: true,
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const count = spawnCount(file);
  assert.deepEqual(kinds(count), { total: 2, node: 1, git: 1, other: 0 });
  assert.deepEqual(count.owners, new Map([['scripts/test/fixtures/spawns/spawns.test.mjs', 2]]));
});
