// `pilot gh-stub` (audit-f2-f3 S1, spec 3, 5, 6, 7; ADR 0173): a real `gh` exe on PATH that
// answers from reply.txt and records every call, so a live PR probe never reaches GitHub.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ghStub } from '../gh-stub.mjs';
import { helpSubcommands } from './lib/help-subcommands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PILOT = path.join(ROOT, 'bin', 'pilot.mjs');

const made = [];
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const stubbed = () => {
  const stub = ghStub();
  made.push(stub.dir);
  return { ...stub, env: { ...process.env, ...stub.env } };
};
const calls = (dir) => {
  const file = path.join(dir, 'calls.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

test('gh under the stub env answers from reply.txt', () => {
  const { dir, env } = stubbed();
  fs.writeFileSync(path.join(dir, 'reply.txt'), 'state: OPEN\n#12 a title\n');
  const out = execFileSync('gh', ['pr', 'view', '12'], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(out, 'state: OPEN\n#12 a title\n');
});

test('every call is recorded', () => {
  const { dir, env } = stubbed();
  execFileSync('gh', ['pr', 'view', '12'], { env, windowsHide: true });
  assert.equal(calls(dir), '["pr","view","12"]\n');
});

test('a node run under the same env is untouched', () => {
  const { dir, env } = stubbed();
  const out = execFileSync(process.execPath, ['-e', 'console.log(1)'], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(out, '1\n');
  assert.equal(calls(dir), '');
});

test('the printed lines are the env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gh-stub-test-'));
  made.push(dir);
  const env = { ...process.env };
  if (process.platform === 'win32') env.MSYSTEM = 'MINGW64';
  else delete env.MSYSTEM;
  const cli = (...args) => spawnSync(process.execPath, [PILOT, 'gh-stub', ...args], { env, encoding: 'utf8', windowsHide: true });
  const stub = `--require "${path.join(dir, 'stub.cjs').replaceAll('\\', '/')}"`;

  const sh = cli('--dir', dir);
  assert.equal(sh.status, 0, sh.stderr);
  const shDir = process.platform === 'win32' ? dir.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replaceAll('\\', '/') : dir;
  assert.ok(sh.stdout.split('\n').includes(`export PATH='${shDir}':"$PATH"`), sh.stdout);
  assert.ok(sh.stdout.includes(`export NODE_OPTIONS='${stub}'`), sh.stdout);

  const ps = cli('--dir', dir, '--powershell');
  assert.equal(ps.status, 0, ps.stderr);
  assert.ok(ps.stdout.split('\n').includes(`$env:PATH = '${dir}${path.delimiter}' + $env:PATH`), ps.stdout);
  assert.ok(ps.stdout.includes(`$env:NODE_OPTIONS = '${stub}'`), ps.stdout);

  const bad = cli('--nope');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--nope/);
});

test('help lists it', () => {
  assert.ok(helpSubcommands().includes('gh-stub'));
});

// lint: a code-to-help check, not a phrase pin. Every PILOT_ variable a hook reads is in the env block.
test('help names every PILOT_ variable a hook reads', () => {
  const help = spawnSync(process.execPath, [PILOT, 'help'], { encoding: 'utf8', windowsHide: true });
  const block = help.stdout.split(/environment variables change how it behaves:/)[1] ?? '';
  const hooks = path.join(ROOT, 'hooks');
  const read = fs.readdirSync(hooks).filter((f) => f.endsWith('.js')).flatMap((f) => [...fs.readFileSync(path.join(hooks, f), 'utf8').matchAll(/process\.env\.(PILOT_[A-Z0-9_]+)/g)].map((m) => m[1]));
  assert.notEqual(read.length, 0);
  assert.deepEqual([...new Set(read)].filter((v) => !new RegExp(`^ {2}${v}\\b`, 'm').test(block)), []);
});
