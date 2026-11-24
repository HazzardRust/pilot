/**
 * tested-once S3 (spec 3; A2, A5): at slice scope (`scope: 'slice'`, env `PILOT_TEST_SCOPE=slice` in the gate)
 * the selection's whole-tree fallbacks and the cargo step are deferred to integrate and named in the scope line;
 * the default, wide, scope keeps today's full runs.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { selectTests, scopeLine, scopeOf, TREE_TESTS } = await import('../select-tests.mjs');
const { cargoStep, runGate } = await import('../gate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

const TREE = TREE_TESTS[0];

/** One commit on main: a trigger, a module its test imports, and one whole-tree test. */
const REPO = (dir) => {
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'package.json', '{}\n');
  write(dir, 'lib/used.mjs', 'export const u = 1;\n');
  write(dir, 'test/t.test.mjs', "import '../lib/used.mjs';\n");
  write(dir, TREE, "import { test } from 'node:test';\n");
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'one');
  return { dir };
};

test('a lonely file selects nothing at slice scope', (t) => {
  const { dir } = gitFixture(t, 'scope:repo', REPO);
  write(dir, 'lib/lonely.mjs', 'export const l = 1;\n');
  const slice = selectTests({ cwd: dir, since: 'main', scope: 'slice' });
  assert.deepEqual(slice.files, [path.resolve(dir, TREE)], 'only the tree test runs');
  assert.deepEqual(slice.deferred, ['lib/lonely.mjs reaches no test']);
  const wide = selectTests({ cwd: dir, since: 'main' });
  assert.equal(wide.files, null);
  assert.equal(wide.reason, 'lib/lonely.mjs reaches no test');
  assert.equal(wide.deferred, undefined);
});

test('a trigger file defers at slice scope', (t) => {
  const { dir } = gitFixture(t, 'scope:repo', REPO);
  fs.appendFileSync(path.join(dir, 'package.json'), '\n');
  fs.appendFileSync(path.join(dir, 'lib/used.mjs'), 'export const v = 2;\n');
  const slice = selectTests({ cwd: dir, since: 'main', scope: 'slice' });
  assert.deepEqual(slice.files, [path.resolve(dir, TREE), path.resolve(dir, 'test/t.test.mjs')].sort(), 'the matched files still run');
  assert.deepEqual(slice.deferred, ['package.json changed']);
  const wide = selectTests({ cwd: dir, since: 'main', scope: 'wide' });
  assert.equal(wide.files, null);
  assert.equal(wide.reason, 'package.json changed');
});

test('an argv overflow at slice scope runs the direct and tree tests and defers the rest', (t) => {
  const { dir } = gitFixture(t, 'scope:repo', REPO);
  const long = 'a'.repeat(80);
  // 400 tests reach lib/used.mjs through lib/mid.mjs, one hop further than test/t.test.mjs.
  write(dir, 'lib/mid.mjs', "export * from './used.mjs';\n");
  for (let i = 0; i < 400; i++) write(dir, `test/${long}${i}.test.mjs`, "import '../lib/mid.mjs';\n");
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'many');
  fs.appendFileSync(path.join(dir, 'lib/used.mjs'), 'export const v = 2;\n');
  const slice = selectTests({ cwd: dir, since: 'HEAD', scope: 'slice' });
  assert.deepEqual(slice.files, [path.resolve(dir, TREE), path.resolve(dir, 'test/t.test.mjs')].sort());
  assert.match(slice.deferred.join(), /^selection is \d+ characters of argv, over 24000$/);
  assert.equal(selectTests({ cwd: dir, since: 'HEAD' }).files, null);
});

const SHA = '0123456789abcdef0123456789abcdef01234567';
const LOCAL = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
const CARGO = 'C:\\Users\\me\\.cargo\\bin\\cargo.exe';
const selected = (changed) => ({ files: ['C:\\r\\scripts\\test\\land.test.mjs'], total: 9, since: SHA, changed });

test('cargo waits for integrate', () => {
  const asked = [];
  const which = (cmd) => (asked.push(cmd), CARGO);
  assert.deepEqual(cargoStep({ ...LOCAL, PILOT_TEST_SCOPE: 'slice' }, which, 'win32', selected(['deck/view.mjs'])), {
    skip: 'rune deck: deferred to integrate',
  });
  assert.deepEqual(asked, [], 'cargo is not even looked up');
  assert.equal(cargoStep({ ...LOCAL, PILOT_TEST_SCOPE: 'wide' }, which, 'win32', selected(['deck/view.mjs'])).steps.length, 2, 'wide runs it');
});

test('the scope line says what was deferred', () => {
  const selection = { files: ['a', 'b', 'c'], total: 400, since: 'abc1234def', deferred: ['x.mjs reaches no test'] };
  const line = scopeLine(selection);
  assert.equal(line, 'selected 3 of 400 test files since abc1234; deferred: x.mjs reaches no test');
  assert.equal(scopeOf(`ledgers current\n${line}\nℹ tests 3\n`), line);
  const two = scopeLine({ ...selection, deferred: ['package.json changed', 'cargo'] });
  assert.equal(two, 'selected 3 of 400 test files since abc1234; deferred: package.json changed, cargo');
  assert.equal(scopeLine({ files: ['a'], total: 4, since: 'abc1234def' }), 'selected 1 of 4 test files since abc1234', 'nothing deferred, nothing added');
});

test('the gate passes slice scope to the selection and defers cargo in its scope line', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-select-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = path.join(dir, 'deck.json');
  fs.writeFileSync(store, '{"items":[]}');
  for (const [key, value] of [['PILOT_GATE_HOME_STORE', undefined], ['PILOT_TEST_SCOPE', 'slice']]) {
    const was = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => (was === undefined ? delete process.env[key] : (process.env[key] = was)));
  }
  const asked = [];
  const calls = [];
  const written = [];
  const out = t.mock.method(process.stdout, 'write', (chunk) => written.push(String(chunk)) > 0);
  let code;
  try {
    code = runGate(['--since=main'], {
      cwd: dir,
      slot: () => ({ slot: 1, release() {} }),
      select: (opts) => (asked.push(opts), selected(['deck/view.mjs'])),
      read: () => [],
      spawn: (command, args) => (calls.push(command), { status: 0 }),
      homeStore: store,
      deckPid: () => null,
      which: () => CARGO,
      platform: 'win32',
      bound: () => ({ wiped: false, units: 0 }),
      stale: () => 0,
    });
  } finally {
    out.mock.restore();
  }
  assert.equal(code, 0);
  assert.equal(asked[0].scope, 'slice');
  const text = written.join('');
  assert.equal(scopeOf(text), 'selected 1 of 9 test files since 0123456; deferred: cargo');
  assert.ok(text.includes('rune deck: deferred to integrate\n'), text);
  assert.ok(!calls.includes(CARGO), 'cargo never starts');
});
