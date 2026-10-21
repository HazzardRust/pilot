/**
 * `npm run test:quiet` ends with one count line a person or agent can read (clean-landing
 * spec 11). Each case runs a scratch test file under `node --test` with the reporter, and
 * (for the counts) under the spec reporter beside it. The whole suite is not run from in
 * here: it contains this file, so that would recurse; the byte budget is pinned on a
 * scratch suite of a hundred passes, the shape of the real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { failingNames } from '../integrate.mjs';

const reporter = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'quiet-reporter.mjs')).href;

// A child `node --test` inside a test inherits NODE_TEST_CONTEXT and refuses to run.
const { NODE_TEST_CONTEXT, ...env } = process.env;

function run(source, ...reporterArgs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-reporter-'));
  try {
    const file = path.join(dir, 'scratch.test.mjs');
    fs.writeFileSync(file, source);
    const args = reporterArgs.length ? reporterArgs : [`--test-reporter=${reporter}`];
    const out = spawnSync(process.execPath, ['--test', ...args, file], { encoding: 'utf8', cwd: dir, env });
    return `${out.stdout}${out.stderr}`;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const header = "import { test } from 'node:test'; import assert from 'node:assert/strict';\n";
const passes = (n) => Array.from({ length: n }, (_, i) => `test('passes ${i}', () => {});`).join('\n');
const lines = (output) => output.split('\n').filter(Boolean);
const spec = (out, name) => {
  const n = Number(new RegExp(`ℹ ${name} (\\d+)`).exec(out)?.[1]);
  assert.ok(Number.isInteger(n), `no "${name}" count in the spec reporter's output`);
  return n;
};

test('a green run prints one count line equal to the spec reporter\'s', () => {
  // A describe is a suite, which neither reporter counts as a test.
  const source = `${header}import { describe } from 'node:test';\n${passes(3)}\ntest('skipped', { skip: true }, () => {});\ntest('nested', async (t) => { await t.test('inner', () => {}); });\ndescribe('a suite', () => { test('in a suite', () => {}); });`;
  const quiet = run(source);
  const full = run(source, '--test-reporter=spec');
  assert.deepEqual(lines(quiet), [`tests ${spec(full, 'tests')} · pass ${spec(full, 'pass')} · fail ${spec(full, 'fail')}`]);
});

test('a red run names each failing test', () => {
  const source = `${header}${passes(2)}\ntest('breaks one', () => assert.equal(1, 2));\ntest('breaks two', () => { throw new Error('boom'); });\ntest('parent', async (t) => { await t.test('child breaks', () => assert.fail('nope')); });`;
  const quiet = run(source);
  const full = run(source, '--test-reporter=spec');
  assert.deepEqual(failingNames(quiet).sort(), ['breaks one', 'breaks two', 'child breaks']);
  assert.match(quiet, /boom/);
  const last = lines(quiet).at(-1);
  assert.equal(last, `tests ${spec(full, 'tests')} · pass ${spec(full, 'pass')} · fail ${spec(full, 'fail')}`);
});

test('a hundred passes print under 10 KB on green', () => {
  const quiet = run(`${header}${passes(100)}`);
  assert.ok(Buffer.byteLength(quiet) < 10 * 1024, `${Buffer.byteLength(quiet)} bytes`);
  assert.equal(lines(quiet).length, 1);
});

test('a timed-out test is named and counted as cancelled, as the spec reporter counts it', () => {
  const source = `${header}test('hangs', { timeout: 300 }, async (t) => { await t.test('child', () => new Promise(() => {})); });`;
  const quiet = run(source);
  const full = run(source, '--test-reporter=spec');
  assert.ok(failingNames(quiet).includes('hangs'));
  assert.equal(lines(quiet).at(-1), `tests ${spec(full, 'tests')} · pass ${spec(full, 'pass')} · fail ${spec(full, 'fail')} · cancelled ${spec(full, 'cancelled')}`);
});
