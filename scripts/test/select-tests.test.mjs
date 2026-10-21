/**
 * suite-at-landing S1 and S2 (spec 1; L5, L6, L10, A1, A2): `selectTests` answers the test files a
 * diff touches, from merge-base(since, HEAD) to the working tree: the changed tests, the tests
 * reaching a changed module through any chain of relative imports, the tests naming a changed
 * file's basename, and every whole-tree test; `treeWalkers` is the census that keeps `TREE_TESTS`
 * whole; `scopeLine` and `scopeOf` write and read back the line the gate prints.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { selectTests, scopeLine, scopeOf, TREE_TESTS, TEST_GLOB, treeWalkers } = await import('../select-tests.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Three tests: `a` imports nothing, `b1` and `b2` import `lib/b.mjs`. One commit on main. */
function threeTests(dir) {
  git(dir, 'init', '-q', '-b', 'main');
  const files = {
    'lib/b.mjs': 'export const b = 1;\n',
    'test/a.test.mjs': "import { test } from 'node:test';\ntest('a', () => {});\n",
    'test/b1.test.mjs': "import { b } from '../lib/b.mjs';\n",
    'test/b2.test.mjs': "const { b } = await import('../lib/b.mjs');\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'one');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

/** A builder for `gitFixture`: writes `files`, commits them on main, and returns `{ dir, sha }`. */
const repoOf = (files) => (dir) => {
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'one');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
};

/** `t` reaches `lib/b.mjs` through `lib/a.mjs`; `dyn` imports `lib/c.mjs` by `import()`; `pin` names `agents/x.md`. */
const CHAIN = repoOf({
  'lib/a.mjs': "export { b } from './b.mjs';\n",
  'lib/b.mjs': 'export const b = 1;\n',
  'lib/c.mjs': 'export const c = 1;\n',
  'agents/x.md': '# x\n',
  'test/t.test.mjs': "import { b } from '../lib/a.mjs';\n",
  'test/dyn.test.mjs': "const { c } = await import('../lib/c.mjs');\n",
  'test/pin.test.mjs': "import path from 'node:path';\nconst file = path.join(ROOT, 'agents', 'x.md');\n",
  'test/old.test.mjs': "import { test } from 'node:test';\n",
});

test('an import chain selects the far test', (t) => {
  const { dir } = gitFixture(t, 'select:chain', CHAIN);
  fs.appendFileSync(path.join(dir, 'lib/b.mjs'), 'export const d = 2;\n');
  assert.deepEqual(selectTests({ cwd: dir, since: 'main' }).files, [path.resolve(dir, 'test/t.test.mjs')]);
});

test('a literal dynamic import counts', (t) => {
  const { dir } = gitFixture(t, 'select:chain', CHAIN);
  fs.appendFileSync(path.join(dir, 'lib/c.mjs'), 'export const d = 2;\n');
  assert.deepEqual(selectTests({ cwd: dir, since: 'main' }).files, [path.resolve(dir, 'test/dyn.test.mjs')]);
});

test('a prose pin is selected by name', (t) => {
  const { dir } = gitFixture(t, 'select:chain', CHAIN);
  fs.appendFileSync(path.join(dir, 'agents/x.md'), 'more\n');
  assert.deepEqual(selectTests({ cwd: dir, since: 'main' }).files, [path.resolve(dir, 'test/pin.test.mjs')]);
});

test('whole-tree tests ride every selection', (t) => {
  // Two entries of the real list stand in the fixture; the rest are absent, so only these two answer.
  const [first, second] = TREE_TESTS;
  const { dir } = gitFixture(t, 'select:tree', repoOf({
    'docs/note.md': '# note\n',
    [first]: "import { test } from 'node:test';\n",
    [second]: "import { test } from 'node:test';\n",
    'test/other.test.mjs': "import { test } from 'node:test';\n",
  }));
  fs.appendFileSync(path.join(dir, 'docs/note.md'), 'more\n');
  assert.deepEqual(selectTests({ cwd: dir, since: 'main' }).files, [first, second].map((rel) => path.resolve(dir, rel)).sort());
});

/** Each test reaches its module in a way the plain import regex misses, `q` and `r` through a hub. */
const EDGES = repoOf({
  'lib/q.mjs': 'export const q = 1;\n',
  'lib/q-hub.mjs': "export { q } from './q.mjs';\n",
  'lib/r.js': 'module.exports = 1;\n',
  'lib/r-hub.js': "module.exports = require('./r.js');\n",
  'lib/s.mjs': 'export const s = 1;\n',
  '.gitattributes': '* text\n',
  'test/query.test.mjs': "const { q } = await import('../lib/q-hub.mjs?fresh');\n",
  'test/require.test.mjs': "const r = createRequire(import.meta.url)('../lib/r-hub.js');\n",
  'test/renamed.test.mjs': "import { s } from '../lib/s.mjs';\n",
  'test/dotfile.test.mjs': "const file = path.join(ROOT, '.gitattributes');\n",
});

test('a query, a require, a rename and a dotfile still reach their tests', (t) => {
  const select = (dir) => selectTests({ cwd: dir, since: 'main' }).files.map((file) => path.relative(dir, file).split(path.sep).join('/'));
  let { dir } = gitFixture(t, 'select:edges', EDGES);
  fs.appendFileSync(path.join(dir, 'lib/q.mjs'), '//\n');
  assert.deepEqual(select(dir), ['test/query.test.mjs'], 'a cache-busting query');
  ({ dir } = gitFixture(t, 'select:edges', EDGES));
  fs.appendFileSync(path.join(dir, 'lib/r.js'), '//\n');
  assert.deepEqual(select(dir), ['test/require.test.mjs'], 'a createRequire call');
  ({ dir } = gitFixture(t, 'select:edges', EDGES));
  git(dir, 'mv', 'lib/s.mjs', 'lib/t.mjs');
  assert.equal(selectTests({ cwd: dir, since: 'main' }).reason, 'lib/t.mjs reaches no test', 'a staged rename runs full: its new path is imported by no one');
  ({ dir } = gitFixture(t, 'select:edges', EDGES));
  fs.appendFileSync(path.join(dir, '.gitattributes'), '*.md text\n');
  assert.deepEqual(select(dir), ['test/dotfile.test.mjs'], 'a dotfile named by a test');
});

test('a deleted test file is not listed', (t) => {
  const { dir } = gitFixture(t, 'select:chain', CHAIN);
  fs.rmSync(path.join(dir, 'test/old.test.mjs'));
  const { files, total } = selectTests({ cwd: dir, since: 'main' });
  assert.deepEqual(files, []);
  assert.equal(total, 3);
});

test('every tree walker is listed', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const walkers = treeWalkers(root);
  assert.ok(walkers.includes('scripts/test/path-length.test.mjs'), 'the census finds a known walker');
  assert.deepEqual(walkers.filter((rel) => !TREE_TESTS.includes(rel)), [], 'a test walking the tree is missing from TREE_TESTS');
});

test('a changed test file is selected alone', (t) => {
  const { dir, sha } = gitFixture(t, 'select:three', threeTests);
  fs.appendFileSync(path.join(dir, 'test/a.test.mjs'), '// touched\n');
  const selection = selectTests({ cwd: dir, since: 'main' });
  assert.deepEqual(selection, { files: [path.resolve(dir, 'test/a.test.mjs')], total: 3, since: sha });
});

test('a changed module selects its direct importers', (t) => {
  const { dir } = gitFixture(t, 'select:three', threeTests);
  fs.appendFileSync(path.join(dir, 'lib/b.mjs'), 'export const c = 2;\n');
  const { files, total } = selectTests({ cwd: dir, since: 'main' });
  assert.deepEqual(files, [path.resolve(dir, 'test/b1.test.mjs'), path.resolve(dir, 'test/b2.test.mjs')]);
  assert.equal(total, 3);
});

test('an unresolvable ref runs full and says so', (t) => {
  const { dir } = gitFixture(t, 'select:three', threeTests);
  const selection = selectTests({ cwd: dir, since: 'nope' });
  assert.equal(selection.files, null);
  assert.equal(selection.reason, 'cannot resolve nope');
  assert.equal(selectTests({ cwd: dir, since: '--output=x' }).reason, 'cannot resolve --output=x', 'a ref is never an option');
  assert.equal(fs.existsSync(path.join(dir, 'x')), false);
  assert.equal(selectTests({ cwd: dir, since: 'a\nselected 0 of 3 test files since 0123456' }).reason, 'cannot resolve a?selected 0 of 3 test files since 0123456', 'a ref forges no line');
});

test('the scope line round-trips', () => {
  const selected = { files: ['/r/test/a.test.mjs'], total: 3, since: '0123456789abcdef0123456789abcdef01234567' };
  const full = { files: null, total: 3, since: 'nope', reason: 'cannot resolve nope' };
  assert.equal(scopeLine(selected), 'selected 1 of 3 test files since 0123456');
  assert.equal(scopeLine(full), 'full suite: cannot resolve nope');
  for (const selection of [selected, full]) {
    const output = `ledgers current\n${scopeLine(selection)}\n✔ a (1ms)\nℹ tests 1\nspawns 3 (node 1, git 2, other 0)\n`;
    assert.equal(scopeOf(output), scopeLine(selection));
  }
  assert.equal(scopeOf(`${scopeLine(full)}\n${scopeLine(selected)}\n`), scopeLine(selected), 'the last line wins');
  assert.equal(scopeOf('ℹ tests 1\n'), null);
});

test('a module under test/lib is a helper, not a test', (t) => {
  const { dir } = gitFixture(t, 'select:helper', repoOf({
    'test/a.test.mjs': "import { h } from './lib/helper.mjs';\n",
    'test/lib/helper.mjs': 'export const h = 1;\n',
  }));
  fs.appendFileSync(path.join(dir, 'test/lib/helper.mjs'), 'export const i = 2;\n');
  const selection = selectTests({ cwd: dir, since: 'main' });
  assert.equal(selection.total, 1, 'the census counts the test, not the helper');
  assert.deepEqual(selection.files, [path.resolve(dir, 'test/a.test.mjs')], 'a changed helper selects its importer, not itself');
  for (const helper of ['scripts/test/lib/area-file.mjs', 'deck/test/lib/x.js', 'test/lib/y.mjs']) assert.equal(path.posix.matchesGlob(helper, TEST_GLOB), false, helper);
  for (const spec of ['scripts/test/a.test.mjs', 'deck/test/sub/b.mjs', 'test/c.mjs']) assert.equal(path.posix.matchesGlob(spec, TEST_GLOB), true, spec);
});
