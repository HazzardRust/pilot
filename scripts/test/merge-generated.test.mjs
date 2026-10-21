/**
 * A landing merge never stops on the generated ADR index (clean-landing spec 1-4; L1, L2):
 * `merge=union` in this repository's `.gitattributes` keeps both sides' rows, and the
 * plugin's own renderer regenerates the merged index. Every case runs in a scratch
 * repository carrying this repository's `.gitattributes`; nothing here reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { checkIndex, renderIndex } = await import('../adr-index.mjs');
const { mergeResolved, refreshIndex, resolveGenerated } = await import('../merge-generated.mjs');
const { mergeIntoPilot } = await import('../sync.mjs');
const { exemptPaths } = await import('../vocabulary.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ATTRIBUTES = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
const INDEX = 'docs/adr/README.md';
const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Writes ADR `number` and, unless `index` is false, the generated index; commits both. */
function addAdr(repo, number, { index = true } = {}) {
  const adr = path.join(repo, 'docs', 'adr');
  fs.mkdirSync(adr, { recursive: true });
  const file = `${number}-decision-${number}.md`;
  const front = ['---', 'status: accepted', 'date: 2026-10-11', 'tags: []', 'supersedes: []', 'superseded_by: []', 'paths: []', '---'];
  fs.writeFileSync(path.join(adr, file), [...front, `# Decision ${number}`, '', `We decided ${number}.`, ''].join('\n'));
  if (index) fs.writeFileSync(path.join(adr, 'README.md'), renderIndex(adr));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `adr ${number}`);
}

/** A repository on `main` with ADR 0001 and its index, `.gitattributes` as given. */
function scratch(t, attributes = ATTRIBUTES) {
  return gitFixture(t, `merge-generated:scratch:${attributes === null ? 'none' : 'repo'}`, (dir) => buildScratch(dir, attributes));
}

function buildScratch(dir, attributes) {
  const repo = path.join(dir, 'repo');
  git(dir, 'init', '-q', '-b', 'main', repo);
  if (attributes !== null) fs.writeFileSync(path.join(repo, '.gitattributes'), attributes);
  addAdr(repo, '0001');
  return { dir, repo };
}

/** Branch `a` adds `first`, `main` adds `second`; answers the merge of `a` into `main`. */
function twoAdrs(repo, { first, second }) {
  git(repo, 'checkout', '-q', '-b', 'a');
  addAdr(repo, first);
  git(repo, 'checkout', '-q', 'main');
  addAdr(repo, second);
  return spawnSync('git', ['merge', '-q', '--no-ff', '--no-commit', 'a'], { cwd: repo, encoding: 'utf8' });
}

const conflicted = (repo) => git(repo, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
const indexed = (repo) => fs.readFileSync(path.join(repo, INDEX), 'utf8').match(/^\| \d{4} \|/gm);

test('a conflicted landing committed with --no-edit keeps the landing message as its subject', (t) => {
  const { repo } = scratch(t);
  const write = (text) => {
    fs.writeFileSync(path.join(repo, 'f.txt'), text);
    git(repo, 'add', 'f.txt');
    git(repo, 'commit', '-q', '-m', text);
  };
  write('base\n');
  git(repo, 'checkout', '-q', '-b', 'a');
  write('feature\n');
  git(repo, 'checkout', '-q', 'main');
  write('pilot\n');
  assert.deepEqual(mergeResolved(repo, 'a', 'Merge feat/a into pilot', { side: 'theirs' }).left, ['f.txt']);
  fs.writeFileSync(path.join(repo, 'f.txt'), 'both\n');
  git(repo, 'add', 'f.txt');
  git(repo, 'commit', '-q', '--no-edit');
  assert.equal(git(repo, 'log', '-1', '--format=%s'), 'Merge feat/a into pilot');
});

test('two branches each adding an ADR row merge with no conflict', (t) => {
  const { repo } = scratch(t);

  const merge = twoAdrs(repo, { first: '0002', second: '0003' });

  assert.equal(merge.status, 0, merge.stdout + merge.stderr);
  assert.deepEqual(conflicted(repo), []);
  assert.deepEqual([...indexed(repo)].sort(), ['| 0001 |', '| 0002 |', '| 0003 |'], 'both rows kept');
});

test('rows merged out of number order are regenerated', (t) => {
  const { repo } = scratch(t);
  const merge = twoAdrs(repo, { first: '0002', second: '0003' });
  assert.equal(merge.status, 0, merge.stdout + merge.stderr);
  assert.equal(checkIndex(path.join(repo, 'docs', 'adr')).ok, false, 'union keeps ours first: 0003 before 0002');

  assert.equal(refreshIndex(repo), true);

  assert.deepEqual(checkIndex(path.join(repo, 'docs', 'adr')), { ok: true, problems: [] });
  assert.deepEqual(indexed(repo), ['| 0001 |', '| 0002 |', '| 0003 |']);
  assert.equal(refreshIndex(repo), false, 'a current index is left alone');
});

test('mergeIntoPilot lands two features that each add an ADR', (t) => {
  const { dir, repo } = scratch(t);
  const origin = path.join(dir, 'origin.git');
  git(dir, 'clone', '-q', '--bare', repo, origin);
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-q', 'origin', 'main:pilot');
  git(repo, 'checkout', '-q', '-b', 'feat/one');
  addAdr(repo, '0002');
  const feature = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'pilot', 'origin/pilot');
  addAdr(repo, '0003');
  git(repo, 'push', '-q', 'origin', 'pilot');
  git(repo, 'fetch', '-q', 'origin');

  const result = mergeIntoPilot({ cwd: repo, source: feature, message: 'Land feat/one', test: passing, label: 'feat/one' });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(origin, 'rev-parse', 'pilot'), result.sha);
  const tip = path.join(dir, 'tip');
  git(dir, 'clone', '-q', '-b', 'pilot', origin, tip);
  assert.deepEqual(indexed(tip), ['| 0001 |', '| 0002 |', '| 0003 |']);
  assert.deepEqual(checkIndex(path.join(tip, 'docs', 'adr')), { ok: true, problems: [] });
});

test('a hand-written README is not regenerated', (t) => {
  const { repo } = scratch(t, null);
  fs.writeFileSync(path.join(repo, INDEX), '# Our decisions\n\n- 0001\n');
  git(repo, 'commit', '-q', '-am', 'hand-written');
  git(repo, 'checkout', '-q', '-b', 'a');
  fs.appendFileSync(path.join(repo, INDEX), '- 0002\n');
  git(repo, 'commit', '-q', '-am', 'a');
  git(repo, 'checkout', '-q', 'main');
  fs.appendFileSync(path.join(repo, INDEX), '- 0003\n');
  git(repo, 'commit', '-q', '-am', 'main');
  assert.notEqual(spawnSync('git', ['merge', '-q', '--no-ff', '--no-commit', 'a'], { cwd: repo }).status, 0);

  const outcome = resolveGenerated(repo, conflicted(repo), { side: 'theirs' });

  assert.deepEqual(outcome, { resolved: [], left: [INDEX] });
  assert.deepEqual(conflicted(repo), [INDEX], 'still unmerged');
});

test('an index that is a symlink is never followed', (t) => {
  const { dir, repo } = scratch(t);
  const outside = path.join(dir, 'outside.md');
  fs.writeFileSync(outside, fs.readFileSync(path.join(repo, INDEX), 'utf8'));
  fs.rmSync(path.join(repo, INDEX));
  try {
    fs.symlinkSync(outside, path.join(repo, INDEX), 'file');
  } catch (err) {
    t.skip(`no symlinks here (${err.code})`);
    return;
  }
  addAdr(repo, '0002', { index: false });
  const before = fs.readFileSync(outside, 'utf8');

  assert.equal(refreshIndex(repo), false);
  assert.equal(fs.readFileSync(outside, 'utf8'), before, 'the target is untouched');
  assert.deepEqual(resolveGenerated(repo, [INDEX], { side: 'theirs' }), { resolved: [], left: [INDEX] });
});

test('the gitattributes line is pinned', (t) => {
  assert.match(ATTRIBUTES, /^docs\/adr\/README\.md merge=union$/m);
  const { repo } = scratch(t, null);
  const merge = twoAdrs(repo, { first: '0002', second: '0003' });
  assert.notEqual(merge.status, 0, 'without the line the rows conflict');
  assert.deepEqual(conflicted(repo), [INDEX]);

  const outcome = resolveGenerated(repo, conflicted(repo), { side: 'theirs' });

  assert.deepEqual(outcome, { resolved: [INDEX], left: [] });
  assert.deepEqual(conflicted(repo), []);
  assert.deepEqual(checkIndex(path.join(repo, 'docs', 'adr')), { ok: true, problems: [] });
});

const EXEMPT = 'scripts/vocabulary-exempt.txt';

/** Appends `prefix` to the exempt list and adds ADR `number`, one commit: a feature that exempts a path and decides something. */
function exemptAndDecide(repo, prefix, number) {
  fs.appendFileSync(path.join(repo, EXEMPT), `${prefix}\n`);
  addAdr(repo, number);
}

const readExempt = (repo) => fs.readFileSync(path.join(repo, EXEMPT), 'utf8').split('\n').filter(Boolean);

/** A repository on `main` with this repository's `.gitattributes`, its exempt list, and ADR 0001. */
function exemptScratch(t) {
  return gitFixture(t, 'merge-generated:exempt', (dir) => {
    const repo = path.join(dir, 'repo');
    git(dir, 'init', '-q', '-b', 'main', repo);
    fs.writeFileSync(path.join(repo, '.gitattributes'), ATTRIBUTES);
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repo, EXEMPT), `${exemptPaths().join('\n')}\n`);
    addAdr(repo, '0001');
    return { dir, repo };
  });
}

/** A bare origin of `repo` with main pushed as `branch`, and the checkout on `main` with origin set. */
function withOrigin(dir, repo) {
  const origin = path.join(dir, 'origin.git');
  git(dir, 'clone', '-q', '--bare', repo, origin);
  git(repo, 'remote', 'add', 'origin', origin);
  return origin;
}

function assertBothKept(repo) {
  const kept = readExempt(repo);
  const base = exemptPaths();
  assert.deepEqual(kept.slice(0, base.length), base, 'nothing dropped');
  assert.deepEqual(kept.slice(base.length).sort(), ['docs/design/one/', 'docs/design/two/']);
  assert.deepEqual(indexed(repo), ['| 0001 |', '| 0002 |', '| 0003 |']);
  assert.deepEqual(checkIndex(path.join(repo, 'docs', 'adr')), { ok: true, problems: [] });
}

test('land merges two features that each add an exempt path and an ADR', (t) => {
  const { dir, repo } = exemptScratch(t);
  const origin = withOrigin(dir, repo);
  git(repo, 'push', '-q', 'origin', 'main:pilot');
  git(repo, 'checkout', '-q', '-b', 'feat/one');
  exemptAndDecide(repo, 'docs/design/one/', '0002');
  const feature = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'pilot', 'origin/pilot');
  exemptAndDecide(repo, 'docs/design/two/', '0003');
  git(repo, 'push', '-q', 'origin', 'pilot');
  git(repo, 'fetch', '-q', 'origin');

  const result = mergeIntoPilot({ cwd: repo, source: feature, message: 'Land feat/one', test: passing, label: 'feat/one', side: 'theirs' });

  assert.equal(result.merged, true, result.line);
  const tip = path.join(dir, 'tip');
  git(dir, 'clone', '-q', '-b', 'pilot', origin, tip);
  assertBothKept(tip);
});

test('sync merges both', (t) => {
  const { dir, repo } = exemptScratch(t);
  const origin = withOrigin(dir, repo);
  git(repo, 'push', '-q', 'origin', 'main:pilot');
  git(repo, 'checkout', '-q', '-b', 'main-moved');
  exemptAndDecide(repo, 'docs/design/one/', '0002');
  const mainTip = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'pilot', 'origin/pilot');
  exemptAndDecide(repo, 'docs/design/two/', '0003');
  git(repo, 'push', '-q', 'origin', 'pilot');
  git(repo, 'fetch', '-q', 'origin');

  const result = mergeIntoPilot({ cwd: repo, source: mainTip, message: 'Sync main', test: passing, label: 'main', side: 'ours' });

  assert.equal(result.merged, true, result.line);
  const tip = path.join(dir, 'tip');
  git(dir, 'clone', '-q', '-b', 'pilot', origin, tip);
  assertBothKept(tip);
});
