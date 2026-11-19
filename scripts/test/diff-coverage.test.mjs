/**
 * S1 of coverage-cell (spec 3, 4; A1, A6): diff coverage from Node's own raw V8 coverage.
 * Each test builds a temp git repo, runs a real `node` child under NODE_V8_COVERAGE, and
 * reads the coverage that child wrote, so no fixture line is typed in the producer's format.
 */

import { diffCoverage, formatDiffCoverage } from '../diff-coverage.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../diff-coverage.mjs', import.meta.url));
const ID = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A repo whose commit tagged `base` holds `before` and whose HEAD holds `after`; answers its dir and a v8 dir. */
function repo(t, before, after) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-diffcov-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (files) => { for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text); };
  git(dir, 'init', '-q', '-b', 'main');
  write(before);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'tag', 'base');
  write(after);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'head');
  const v8Dir = path.join(dir, '.v8');
  return { dir, v8Dir, run: (file, ...args) => execFileSync(process.execPath, [file, ...args], { cwd: dir, env: { ...process.env, NODE_V8_COVERAGE: v8Dir } }) };
}

test('three of four changed lines run reads 75%', (t) => {
  const r = repo(t, { 'lib.mjs': 'const a = 1;\n' }, {
    'lib.mjs': 'const a = 1;\nconst b = a + 1;\nconst c = b + 1;\nglobalThis.r = c;\nfunction never() { return 0; }\n',
  });
  r.run('lib.mjs');
  const result = diffCoverage({ cwd: r.dir, v8Dir: r.v8Dir, base: 'base' });
  assert.equal(result.covered, 3);
  assert.equal(result.total, 4);
  assert.deepEqual(result.files, [{ file: 'lib.mjs', covered: 3, total: 4, uncovered: [5] }]);
  assert.match(formatDiffCoverage(result), /Diff coverage: 75% \(3 of 4 changed lines\)$/);
});

test('only lines no process ran are uncovered', (t) => {
  const r = repo(t, { 'lib.mjs': 'const a = 1;\n' }, {
    'lib.mjs': [
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
  });
  r.run('lib.mjs', 'x');
  r.run('lib.mjs', 'y');
  assert.equal(fs.readdirSync(r.v8Dir).length, 2, 'two coverage files');
  const result = diffCoverage({ cwd: r.dir, v8Dir: r.v8Dir, base: 'base' });
  assert.deepEqual(result.files.map((f) => f.uncovered), [[4, 5, 6]]);
  assert.equal(result.total, 8);
  assert.equal(result.covered, 5);
});

test('paths match across file URLs on Windows', (t) => {
  const r = repo(t, { 'x.mjs': 'const a = 1;\n' }, { 'x.mjs': 'const a = 1;\nglobalThis.b = a;\n', 'y.ts': 'const z: number = 1;\n' });
  // Node's file URL keeps the case the script was named with; git answers its own (`C:/Users/…`).
  const win = process.platform === 'win32';
  r.run(win ? path.join(r.dir, 'x.mjs').toLowerCase() : 'x.mjs');
  const url = JSON.parse(fs.readFileSync(path.join(r.v8Dir, fs.readdirSync(r.v8Dir)[0]), 'utf8')).result
    .map((s) => s.url).find((u) => u.endsWith('/x.mjs'));
  const top = git(r.dir, 'rev-parse', '--show-toplevel').trim();
  if (win) assert.notEqual(fileURLToPath(url).replaceAll('\\', '/'), `${top}/x.mjs`, 'the two spellings differ in case');
  const result = diffCoverage({ cwd: r.dir, v8Dir: r.v8Dir, base: 'base' });
  assert.deepEqual(result.files, [{ file: 'x.mjs', covered: 1, total: 1, uncovered: [] }]);
  assert.deepEqual(result.notMeasured, ['y.ts']);
  assert.equal(result.total, 1);
});

test('a bad base is refused before git runs', (t) => {
  const r = repo(t, { 'x.mjs': 'const a = 1;\n' }, { 'x.mjs': 'const a = 2;\n' });
  fs.mkdirSync(r.v8Dir);
  for (const base of ['--output=x', '-p', 'a b', '']) {
    assert.throws(() => diffCoverage({ cwd: r.dir, v8Dir: r.v8Dir, base }), /base/);
  }
  assert.equal(fs.existsSync(path.join(r.dir, 'x')), false, 'git never wrote --output=x');
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(cli(r.v8Dir, '--output=x').status, 2);
  assert.equal(cli(path.join(r.dir, 'missing'), 'base').status, 2);
  assert.equal(cli().status, 2);
  const ok = cli(r.v8Dir, 'base');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout.trimEnd(), /Diff coverage: 0% \(0 of 1 changed lines\)$/);
});

test('no counted changed line prints its own last line', () => {
  assert.equal(formatDiffCoverage({ covered: 0, total: 0, files: [], notMeasured: ['a.ts'] }).split('\n').at(-1),
    'Diff coverage: no changed lines to count');
});
