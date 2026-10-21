// Named to sort early: node --test takes files in path order, and this file's ~68 s test must start before the long land files (git-light-tests S8, spec 2).
/**
 * S5 of audit-f1-f7: a hung fake fails its test by name (spec 6, 7; L5).
 *
 * The audit's F3 copy of `deck/test/run.test.mjs`, whose fake deck never answers
 * `POST /api/chain`, hung `node --test` past a 120 s cap. Its tests failed by name
 * in seconds; what held the process open was each failed test's watch loop, still
 * retrying a closed fake because only the test's last line stopped it. So every
 * watch test aborts its loop in `t.after`, each fake's teardown ends its open
 * connections before `close`, and a hung test fails by name on the copy's own 5 s
 * `eventually` poll budget (SETTLE_BUDGET_MS), well before the copy's shorter
 * `--test-timeout`, which is only a backstop and is not what this test proves.
 * This test rebuilds that copy in a temp directory, never under a `test/`
 * directory, and runs it the way `npm test` does.
 *
 * Two licences are taken so the suite pays seconds, not a minute: the copy runs with a
 * shorter timeout than the script's 60 s (the script's own value is pinned), and a name
 * pattern runs only the hung test, since the copy's other tests wait out nothing here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { gateArgv } = await import('../gate.mjs');
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
const COPY_TIMEOUT_MS = 10000;
const HUNG = 'pilot run asks the deck to chain once at start';

/** run.test.mjs with its relative imports made absolute and `/api/chain` left unanswered. */
function hangCopy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-hang-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const from = path.join(ROOT, 'deck', 'test');
  const chain = "if (request.url === '/api/chain') {";
  const source = fs.readFileSync(path.join(from, 'run.test.mjs'), 'utf8');
  assert.ok(source.includes(chain), 'the fake still models /api/chain where the copy expects it');
  const copy = source
    .replace(/(from |import |require\()'(\.{1,2}\/[^']+)'/g, (_, lead, rel) => {
      const target = path.resolve(from, rel);
      return lead + (lead === 'require(' ? JSON.stringify(target) : `'${pathToFileURL(target).href}'`);
    })
    .replace(chain, `${chain} return undefined;`);
  const file = path.join(dir, 'run-hang.test.mjs');
  fs.writeFileSync(file, copy);
  return file;
}

test('npm test and npm run coverage carry a 60 s per-test timeout', () => {
  // Since process-gc S7 the scripts run the gate, and the gate puts the timeout before any flag.
  for (const name of ['test', 'coverage']) {
    assert.match(scripts[name], /^node scripts\/gate\.mjs( |$)/, `${name}: ${scripts[name]}`);
  }
  assert.ok(gateArgv([], 1, ROOT).includes('--test-timeout=60000'));
});

test('a hung fake fails by name', { timeout: 30000 }, async (t) => {
  const file = hangCopy(t);
  const args = gateArgv([`--test-name-pattern=^${HUNG}$`, file], os.availableParallelism(), ROOT)
    .map((arg) => (arg.startsWith('--test-timeout=') ? `--test-timeout=${COPY_TIMEOUT_MS}` : arg));
  // A child that inherits NODE_TEST_CONTEXT runs as this runner's subtest and skips its files.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const started = Date.now();
  const child = spawn(process.execPath, args, { cwd: os.tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { out += chunk; });
  const guard = setTimeout(() => child.kill(), 25000);
  const code = await new Promise((resolve) => child.on('close', (status) => resolve(status)));
  clearTimeout(guard);
  const seconds = (Date.now() - started) / 1000;
  t.diagnostic(`the hang copy exited ${code} in ${seconds.toFixed(1)} s`);

  assert.notEqual(code, null, `the copy was killed at the 25 s guard, still hung:\n${out.slice(-2000)}`);
  assert.notEqual(code, 0, 'a hung test fails the run');
  assert.ok(seconds < 20, `${seconds} s`);
  const named = out.split('\n').some((line) => line.includes(HUNG) && /✖/.test(line));
  assert.ok(named, `the hung test is named as failing:\n${out.slice(-2000)}`);
});
