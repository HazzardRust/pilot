/**
 * The syntax check (audit-f6 spec 2-6; L4, A1-A3): `syntaxErrors(cwd)` parses every checked file in
 * one flagged child and names each fault with its line; it throws when the child gives no result.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { syntaxErrors } = await import('../check-syntax.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A temp git repository holding `files` (path -> source), the `tracked` ones committed, `.gitignore` as given. */
function repo(t, key, files, { tracked = [], ignore = '' } = {}) {
  return gitFixture(t, `check-syntax:${key}`, (root) => {
    git(root, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(root, '.gitignore'), ignore);
    for (const [rel, source] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), source);
    }
    git(root, 'add', '.gitignore', ...tracked);
    git(root, 'commit', '-q', '-m', 'fixture');
    return root;
  });
}

test('a check that cannot run is red', () => {
  assert.throws(() => syntaxErrors(ROOT, { spawn: () => ({ error: new Error('spawn ENOENT'), stdout: '' }) }), /ENOENT/);
  assert.throws(() => syntaxErrors(ROOT, { spawn: () => ({ status: 1, stdout: '', stderr: 'boom' }) }), /no result/);
  assert.throws(() => syntaxErrors(ROOT, { spawn: () => ({ status: 0, stdout: 'not json\n', stderr: '' }) }), /no result/);
});

test('the child is node with the vm flag, no shell, and the checkout as its argument', () => {
  let seen;
  const spawn = (cmd, argv, opts) => ((seen = { cmd, argv, opts }), { status: 0, stdout: '{"files":0,"ms":1,"errors":[]}\n' });
  assert.deepEqual(syntaxErrors('C:/scratch', { spawn }).errors, []);
  assert.equal(seen.cmd, process.execPath);
  assert.deepEqual(seen.argv.slice(0, 2), ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning']);
  assert.equal(seen.argv.at(-1), 'C:/scratch');
  assert.notEqual(seen.opts.shell, true);
});

test('every fault is named, untracked included, ignored skipped', (t) => {
  const root = repo(t, 'names', {
    'src/tracked.mjs': 'export const ok = 1;\nexport const a = ;\n',
    'src/fine.mjs': 'export const b = 2;\n',
    'loose.js': '// untracked\n\n\nconst x = {;\n',
    'build/ignored.mjs': 'export const c = ;\n',
  }, { tracked: ['src/tracked.mjs', 'src/fine.mjs'], ignore: 'build/\n' });
  const { files, errors } = syntaxErrors(root);
  assert.equal(files, 3);
  assert.deepEqual(errors.map(({ file, line }) => ({ file, line })), [
    { file: 'loose.js', line: 4 },
    { file: 'src/tracked.mjs', line: 2 },
  ]);
  for (const fault of errors) assert.match(fault.message, /^SyntaxError: /);
});

test('a deleted tracked file is skipped', (t) => {
  const root = repo(t, 'deleted', { 'gone.mjs': 'export const a = 1;\n', 'kept.mjs': 'export const b = 1;\n' }, { tracked: ['gone.mjs', 'kept.mjs'] });
  fs.rmSync(path.join(root, 'gone.mjs'));
  const { files, errors } = syntaxErrors(root);
  assert.deepEqual({ files, errors }, { files: 1, errors: [] });
});

test('its verdict matches node --check', (t) => {
  const cases = {
    'esm-error.mjs': 'export const a = ;\n',
    'esm-return.mjs': 'return 1;\n',
    'cjs-with.js': 'with (Math) { max(1, 2); }\nmodule.exports = 1;\n',
    'esm.js': "import fs from 'node:fs';\nexport const x = fs;\n",
    'cjs-return.js': 'if (true) return;\nmodule.exports = 2;\n',
    'shebang.mjs': '#!/usr/bin/env node\nexport const s = 1;\n',
    'await.js': 'await Promise.resolve(1);\n',
    'cjs-error.js': 'const x = 1;\nconst y = {;\n',
  };
  // `node --check` passes a `.js` it detects as ESM without parsing it as ESM (Node 26.1), so this
  // case is judged by loading it, which is what the gate guards: `node mixed.js` throws at parse.
  const mixed = { 'mixed.js': "import fs from 'node:fs';\nwith (fs) {}\n" };
  const root = repo(t, 'corpus', { ...cases, ...mixed }, { tracked: Object.keys({ ...cases, ...mixed }) });
  const byNode = Object.keys(cases).filter((file) => spawnSync(process.execPath, ['--check', file], { cwd: root }).status !== 0).sort();
  const { errors } = syntaxErrors(root);
  assert.deepEqual(errors.map((fault) => fault.file).filter((file) => file in cases).sort(), byNode);
  assert.deepEqual(byNode, ['cjs-error.js', 'esm-error.mjs', 'esm-return.mjs'], 'the corpus covers both verdicts');

  const loaded = spawnSync(process.execPath, ['mixed.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(loaded.status, 1);
  const fault = errors.find((f) => f.file === 'mixed.js');
  assert.deepEqual(fault, { file: 'mixed.js', line: 2, message: 'SyntaxError: Strict mode code may not include a with statement' });
  assert.ok(loaded.stderr.includes(fault.message), loaded.stderr);
});

test('the real tree is clean and fast', () => {
  const listed = git(ROOT, 'ls-files', '-co', '--exclude-standard', '-z', '--', '*.mjs', '*.js').split('\0').filter(Boolean);
  const present = new Set(listed.filter((file) => fs.existsSync(path.join(ROOT, file))));
  const { files, ms, errors } = syntaxErrors(ROOT);
  assert.deepEqual(errors, []);
  assert.equal(files, present.size);
  assert.ok(ms < 10_000, `${ms} ms`);
});
