/**
 * S1 of coverage-cell (spec 3, 4; A1, A6): diff coverage from Node's own raw V8 coverage.
 * One temp git repo (a `base` tag and a HEAD commit) holds a file per case; two real `node`
 * children write its coverage under NODE_V8_COVERAGE, so no fixture line is typed in the
 * producer's format. Built once, read by every test: the suite's spawn ceiling (gate.mjs) binds.
 */

import { diffCoverage, formatDiffCoverage } from '../diff-coverage.mjs';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLI = fileURLToPath(new URL('../diff-coverage.mjs', import.meta.url));
const ID = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const BEFORE = {
  'b1.mjs': 'const a = 1;\n',
  'b2.mjs': 'const a = 1;\n',
  'hunks.mjs': ['let n = 0;', 'const a = 1;', 'const b = 2;', 'const gone = 3;', 'globalThis.k = n;', ''].join('\n'),
  'a b.mjs': 'const x = 1;\n',
  'x.mjs': 'const a = 1;\n',
};
const AFTER = {
  // 3 of 4 changed lines run: the one-line function is never called.
  'b1.mjs': 'const a = 1;\nconst b = a + 1;\nconst c = b + 1;\nglobalThis.r = c;\nfunction never() { return 0; }\n',
  'b2.mjs': [
    'const a = 1;',
    '// a comment',                         // 2: not counted
    '',                                     // 3: not counted
    'function never() {',                   // 4: uncovered
    '  return a;',                          // 5: uncovered
    '}',                                    // 6: uncovered
    "if (process.argv[2] === 'x') {",       // 7
    "  globalThis.x = 'x';",                // 8: run only by the first process
    '} else {',                             // 9
    "  globalThis.y = 'y';",                // 10: run only by the second process
    '}',                                    // 11
    '',
  ].join('\n'),
  // An edited middle line (a count-less hunk), a deleted line, and an added `++ n;` that git shows as `+++ n;`.
  'hunks.mjs': ['let n = 0;', 'const a = 10;', 'const b = 2;', 'globalThis.k = n;', '++ n;', 'function never() { return n; }', ''].join('\n'),
  'a b.mjs': 'const x = 2;\n',                // git ends this `+++` name with a tab; never run
  'x.mjs': 'const a = 1;\nglobalThis.b = a;\n',
  'y.ts': 'const z: number = 1;\n',
};

let dir, v8Dir, result;

before(() => {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-diffcov-')));
  dir = path.join(tmp, 'repo');
  v8Dir = path.join(tmp, 'v8');
  fs.mkdirSync(dir);
  const write = (files) => { for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text); };
  git(dir, 'init', '-q', '-b', 'main');
  write(BEFORE);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'tag', 'base');
  write(AFTER);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'head');
  // Node's file URL keeps the case a module was named with; git answers its own (`C:/Users/…`).
  const x = path.join(dir, 'x.mjs');
  const lowered = pathToFileURL(process.platform === 'win32' ? x.toLowerCase() : x).href;
  const runner = path.join(tmp, 'run.mjs'); // outside the repo, so not a changed file
  fs.writeFileSync(runner, ['b1.mjs', 'b2.mjs', 'hunks.mjs'].map((f) => `await import(${JSON.stringify(pathToFileURL(path.join(dir, f)).href)});\n`).join('')
    + `await import(${JSON.stringify(lowered)});\n`);
  const env = { ...process.env, NODE_V8_COVERAGE: v8Dir };
  execFileSync(process.execPath, [runner, 'x'], { cwd: dir, env });
  execFileSync(process.execPath, ['b2.mjs', 'y'], { cwd: dir, env });
  result = diffCoverage({ cwd: dir, v8Dir, base: 'base' });
});

after(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));

const entry = (file) => result.files.find((f) => f.file === file);

test('three of four changed lines run reads 75%', () => {
  assert.deepEqual(entry('b1.mjs'), { file: 'b1.mjs', covered: 3, total: 4, uncovered: [5] });
  assert.match(formatDiffCoverage({ ...entry('b1.mjs'), files: [entry('b1.mjs')], notMeasured: [] }),
    /Diff coverage: 75% \(3 of 4 changed lines\)$/);
  // The whole repo: b1 3/4, b2 5/8, hunks 2/3, `a b` 0/1, x 1/1.
  assert.deepEqual([result.covered, result.total], [11, 17]);
  assert.match(formatDiffCoverage(result), /Diff coverage: 64% \(11 of 17 changed lines\)$/);
});

test('only lines no process ran are uncovered', () => {
  assert.equal(fs.readdirSync(v8Dir).length, 2, 'two coverage files');
  assert.deepEqual(entry('b2.mjs'), { file: 'b2.mjs', covered: 5, total: 8, uncovered: [4, 5, 6] });
});

test('only lines no process ran are uncovered: several hunks, a deletion, a ++ line, an odd name', () => {
  assert.deepEqual(entry('hunks.mjs'), { file: 'hunks.mjs', covered: 2, total: 3, uncovered: [6] });
  assert.deepEqual(entry('a b.mjs'), { file: 'a b.mjs', covered: 0, total: 1, uncovered: [1] });
});

test('paths match across file URLs on Windows', () => {
  const urls = fs.readdirSync(v8Dir).flatMap((f) => JSON.parse(fs.readFileSync(path.join(v8Dir, f), 'utf8')).result.map((s) => s.url));
  const url = urls.find((u) => u.toLowerCase().endsWith('/x.mjs'));
  if (process.platform === 'win32') assert.notEqual(fileURLToPath(url), path.join(dir, 'x.mjs'), 'the two spellings differ in case');
  assert.deepEqual(entry('x.mjs'), { file: 'x.mjs', covered: 1, total: 1, uncovered: [] });
  assert.deepEqual(result.notMeasured, ['y.ts']);
});

test('a bad base is refused before git runs', () => {
  for (const base of ['--output=x', '-p', 'a b', '']) {
    assert.throws(() => diffCoverage({ cwd: dir, v8Dir, base }), /base/);
  }
  assert.equal(fs.existsSync(path.join(dir, 'x')), false, 'git never wrote --output=x');
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(cli(v8Dir, '--output=x').status, 2);
  assert.equal(cli(path.join(dir, 'missing'), 'base').status, 2);
  assert.equal(cli().status, 2);
  assert.equal(cli(v8Dir, 'no-such-ref').status, 1, 'a well-formed but unknown ref fails loudly, not 0');
  const ok = cli(v8Dir, 'base');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout.trimEnd(), /Diff coverage: 64% \(11 of 17 changed lines\)$/);
});

test('no counted changed line prints its own last line', () => {
  assert.equal(formatDiffCoverage({ covered: 0, total: 0, files: [], notMeasured: ['a.ts'] }).split('\n').at(-1),
    'Diff coverage: no changed lines to count');
});
