/**
 * Pins for `scripts/bump.mjs`: one version written into the three files that
 * carry it. The writing cases run on a temporary copy of those files; the
 * agreement case reads the real tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bump } from '../bump.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['package.json', 'package-lock.json', '.claude-plugin/plugin.json'];

function versionsIn(root) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const lock = JSON.parse(read('package-lock.json'));
  return [
    JSON.parse(read('package.json')).version,
    lock.version,
    lock.packages[''].version,
    JSON.parse(read('.claude-plugin/plugin.json')).version,
  ];
}

function tempCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  for (const f of FILES) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.copyFileSync(path.join(REAL, f), path.join(root, f));
  }
  return root;
}

test('a bump writes all three files', () => {
  const root = tempCopy();
  try {
    const written = bump('10.11.12', { root });
    assert.deepEqual([...written].sort(), FILES.map((f) => path.join(root, f)).sort());
    assert.deepEqual(versionsIn(root), Array(4).fill('10.11.12'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the three agree today', () => {
  const versions = versionsIn(REAL);
  assert.equal(new Set(versions).size, 1, `versions disagree: ${versions.join(', ')}`);
});

test('a file with no version to replace refuses the bump and nothing is written', () => {
  const root = tempCopy();
  try {
    fs.writeFileSync(path.join(root, '.claude-plugin/plugin.json'), '{}\n');
    const before = FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
    assert.throws(() => bump('9.8.7', { root }), /plugin\.json/);
    assert.deepEqual(FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8')), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a malformed version is refused and nothing is written', () => {
  const root = tempCopy();
  try {
    const before = FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
    for (const bad of ['1.2', 'v1.2.3', '1.2.3-rc1', '', '1.2.3\n', "1.2.3'; x"]) {
      assert.throws(() => bump(bad, { root }), /x\.y\.z/);
    }
    assert.deepEqual(FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8')), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the CLI exits 1 on a malformed version, says x.y.z and writes nothing', () => {
  const root = tempCopy();
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(path.join(REAL, 'scripts', 'bump.mjs'), path.join(root, 'scripts', 'bump.mjs'));
    const before = FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
    // Run through a link, as macOS's /var is a link to /private/var: the script must still know it is the entry point.
    const link = `${root}-link`;
    fs.symlinkSync(root, link, 'junction');
    let run;
    try {
      run = spawnSync(process.execPath, [path.join(link, 'scripts', 'bump.mjs'), '1.2'], { encoding: 'utf8' });
    } finally {
      fs.rmSync(link, { force: true });
    }
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /x\.y\.z/);
    assert.equal(run.stdout, '', 'no file reported written');
    assert.deepEqual(FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8')), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('importing the module with an argv[1] that does not exist does not throw', async (t) => {
  const saved = process.argv[1];
  t.after(() => {
    process.argv[1] = saved;
  });
  process.argv[1] = path.join(os.tmpdir(), 'bump-no-such-entry.mjs');
  const url = new URL('../bump.mjs?missing-argv1', import.meta.url);
  await assert.doesNotReject(import(url.href));
});
