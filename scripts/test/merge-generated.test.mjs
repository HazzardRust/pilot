/**
 * A landing merge never stops on the generated ADR index (clean-landing spec 1-4; L1, L2):
 * `merge=union` in this repository's `.gitattributes` keeps both sides' rows, and the
 * plugin's own renderer regenerates the merged index. Every case runs in a scratch
 * repository carrying this repository's `.gitattributes`; nothing here reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

/** Writes ADR `number` and, unless `index` is false, the generated index. */
function addAdrFiles(repo, number, { index = true } = {}) {
  const adr = path.join(repo, 'docs', 'adr');
  fs.mkdirSync(adr, { recursive: true });
  const file = `${number}-decision-${number}.md`;
  const front = ['---', 'status: accepted', 'date: 2026-10-11', 'tags: []', 'supersedes: []', 'superseded_by: []', 'paths: []', '---'];
  fs.writeFileSync(path.join(adr, file), [...front, `# Decision ${number}`, '', `We decided ${number}.`, ''].join('\n'));
  if (index) fs.writeFileSync(path.join(adr, 'README.md'), renderIndex(adr));
}

/** Writes ADR `number` and, unless `index` is false, the generated index; commits both. */
function addAdr(repo, number, options) {
  addAdrFiles(repo, number, options);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `adr ${number}`);
}

/** A repository on `main` with ADR 0001, its index and this repository's `.gitattributes`. */
function scratch(t) {
  return gitFixture(t, 'merge-generated:scratch:repo', (dir) => {
    const repo = path.join(dir, 'repo');
    git(dir, 'init', '-q', '-b', 'main', repo);
    fs.writeFileSync(path.join(repo, '.gitattributes'), ATTRIBUTES);
    addAdr(repo, '0001');
    return { dir, repo };
  });
}

/**
 * The files `addAdr` would leave for ADRs `numbers` (each index regenerated), `extra` laid over: a
 * tree for `seed`, rendered in a staging directory under `dir` that git never sees.
 */
function adrTree(dir, numbers, extra = {}) {
  const stage = fs.mkdtempSync(path.join(dir, 'stage-'));
  for (const number of numbers) addAdrFiles(stage, number);
  const adr = path.join(stage, 'docs', 'adr');
  const files = Object.fromEntries(fs.readdirSync(adr).map((name) => [`docs/adr/${name}`, fs.readFileSync(path.join(adr, name), 'utf8')]));
  fs.rmSync(stage, { recursive: true, force: true });
  return { ...files, ...extra };
}

/**
 * A clone of an origin where `main` holds ADR 0001, branch `a` adds `0002` and `main` then adds
 * `0003`, `.gitattributes` as given: built once per file, so each test only merges.
 */
function twoAdrsRepo(t, attributes = ATTRIBUTES) {
  return gitFixture(t, `merge-generated:two-adrs:${attributes === null ? 'none' : 'repo'}`, (dir) => {
    const base = attributes === null ? {} : { '.gitattributes': attributes };
    const { origin } = seed(dir, [
      { branch: 'main', files: adrTree(dir, ['0001'], base), message: 'adr 0001' },
      { branch: 'a', files: adrTree(dir, ['0001', '0002']), message: 'adr 0002' },
      { branch: 'main', files: adrTree(dir, ['0001', '0003']), message: 'adr 0003' },
    ]);
    const repo = path.join(dir, 'repo');
    git(dir, 'clone', '-q', origin, repo);
    git(repo, 'branch', '-q', 'a', 'origin/a');
    return { dir, repo };
  });
}

/**
 * A clone of an origin where `main` holds `base`, branch `a` lays `feature` over it and `main` then lays
 * `ours` over it, with a local `a`: the two sides a test merges, built once per `key`.
 */
function twoSidesRepo(t, key, { base, feature, ours }) {
  return gitFixture(t, `merge-generated:two-sides:${key}`, (dir) => {
    const { origin } = seed(dir, [
      { branch: 'main', files: base, message: 'base' },
      { branch: 'a', files: feature, message: 'a' },
      { branch: 'main', files: ours, message: 'main' },
    ]);
    const repo = path.join(dir, 'repo');
    git(dir, 'clone', '-q', origin, repo);
    git(repo, 'branch', '-q', 'a', 'origin/a');
    return { dir, repo };
  });
}

/** Answers the merge of `a` into `main` in a `twoAdrsRepo`. */
const twoAdrs = (repo) => spawnSync('git', ['merge', '-q', '--no-ff', '--no-commit', 'a'], { cwd: repo, encoding: 'utf8' });

const conflicted = (repo) => git(repo, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
const indexed = (repo) => fs.readFileSync(path.join(repo, INDEX), 'utf8').match(/^\| \d{4} \|/gm);

test('a conflicted landing committed with --no-edit keeps the landing message as its subject', (t) => {
  const { repo } = twoSidesRepo(t, 'conflict', {
    base: adrTree(os.tmpdir(), ['0001'], { '.gitattributes': ATTRIBUTES, 'f.txt': 'base\n' }),
    feature: { 'f.txt': 'feature\n' },
    ours: { 'f.txt': 'pilot\n' },
  });
  assert.deepEqual(mergeResolved(repo, 'a', 'Merge feat/a into pilot', { side: 'theirs' }).left, ['f.txt']);
  fs.writeFileSync(path.join(repo, 'f.txt'), 'both\n');
  git(repo, 'add', 'f.txt');
  git(repo, 'commit', '-q', '--no-edit');
  assert.equal(git(repo, 'log', '-1', '--format=%s'), 'Merge feat/a into pilot');
});

test('two branches each adding an ADR row merge with no conflict', (t) => {
  const { repo } = twoAdrsRepo(t);

  const merge = twoAdrs(repo);

  assert.equal(merge.status, 0, merge.stdout + merge.stderr);
  assert.deepEqual(conflicted(repo), []);
  assert.deepEqual([...indexed(repo)].sort(), ['| 0001 |', '| 0002 |', '| 0003 |'], 'both rows kept');
});

test('rows merged out of number order are regenerated', (t) => {
  const { repo } = twoAdrsRepo(t);
  const merge = twoAdrs(repo);
  assert.equal(merge.status, 0, merge.stdout + merge.stderr);
  assert.equal(checkIndex(path.join(repo, 'docs', 'adr')).ok, false, 'union keeps ours first: 0003 before 0002');

  assert.equal(refreshIndex(repo), true);

  assert.deepEqual(checkIndex(path.join(repo, 'docs', 'adr')), { ok: true, problems: [] });
  assert.deepEqual(indexed(repo), ['| 0001 |', '| 0002 |', '| 0003 |']);
  assert.equal(refreshIndex(repo), false, 'a current index is left alone');
});

/**
 * A clone on `pilot`, tracking origin's, of an origin where `main` holds ADR 0001 with `base`,
 * `feat/one` adds 0002 with `feature` laid over, and `pilot`, cut from `main`, adds 0003 with
 * `pilot`; `feature` is the sha of `feat/one`. Built once per `key`.
 */
function landingRepo(t, key, { base = {}, feature = {}, pilot = {} }) {
  return gitFixture(t, `merge-generated:landing:${key}`, (dir) => {
    const { origin, sha } = seed(dir, [
      { branch: 'main', files: adrTree(dir, ['0001'], base), message: 'adr 0001' },
      { branch: 'feat/one', files: adrTree(dir, ['0001', '0002'], feature), message: 'adr 0002' },
      { branch: 'pilot', from: 'main', files: adrTree(dir, ['0001', '0003'], pilot), message: 'adr 0003' },
    ]);
    const repo = path.join(dir, 'repo');
    git(dir, 'clone', '-q', '-b', 'pilot', origin, repo);
    return { dir, repo, origin, feature: sha['feat/one'] };
  });
}

test('mergeIntoPilot lands two features that each add an ADR', (t) => {
  const { dir, repo, origin, feature } = landingRepo(t, 'repo', { base: { '.gitattributes': ATTRIBUTES } });

  const result = mergeIntoPilot({ cwd: repo, source: feature, message: 'Land feat/one', test: passing, label: 'feat/one' });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(origin, 'rev-parse', 'pilot'), result.sha);
  const tip = path.join(dir, 'tip');
  git(dir, 'clone', '-q', '-b', 'pilot', origin, tip);
  assert.deepEqual(indexed(tip), ['| 0001 |', '| 0002 |', '| 0003 |']);
  assert.deepEqual(checkIndex(path.join(tip, 'docs', 'adr')), { ok: true, problems: [] });
});

test('a hand-written README is not regenerated', (t) => {
  const hand = '# Our decisions\n\n- 0001\n';
  const { repo } = twoSidesRepo(t, 'hand-written', {
    base: adrTree(os.tmpdir(), ['0001'], { [INDEX]: hand }),
    feature: { [INDEX]: `${hand}- 0002\n` },
    ours: { [INDEX]: `${hand}- 0003\n` },
  });
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

test('an index under a symlinked docs/adr is never followed', (t) => {
  const { dir, repo } = scratch(t);
  const outside = path.join(dir, 'outside-adr');
  fs.cpSync(path.join(repo, 'docs', 'adr'), outside, { recursive: true });
  fs.rmSync(path.join(repo, 'docs', 'adr'), { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(repo, 'docs', 'adr'), 'junction');
  } catch (err) {
    t.skip(`no symlinks here (${err.code})`);
    return;
  }
  fs.copyFileSync(path.join(outside, '0001-decision-0001.md'), path.join(outside, '0002-decision-0002.md'));
  const before = fs.readFileSync(path.join(outside, 'README.md'), 'utf8');

  assert.equal(refreshIndex(repo), false);
  assert.equal(fs.readFileSync(path.join(outside, 'README.md'), 'utf8'), before, 'the target is untouched');
});

test('the gitattributes line is pinned', (t) => {
  assert.match(ATTRIBUTES, /^docs\/adr\/README\.md merge=union$/m);
  const { repo } = twoAdrsRepo(t, null);
  const merge = twoAdrs(repo);
  assert.notEqual(merge.status, 0, 'without the line the rows conflict');
  assert.deepEqual(conflicted(repo), [INDEX]);

  const outcome = resolveGenerated(repo, conflicted(repo), { side: 'theirs' });

  assert.deepEqual(outcome, { resolved: [INDEX], left: [] });
  assert.deepEqual(conflicted(repo), []);
  assert.deepEqual(checkIndex(path.join(repo, 'docs', 'adr')), { ok: true, problems: [] });
});

const EXEMPT = 'scripts/vocabulary-exempt.txt';

const readExempt = (repo) => fs.readFileSync(path.join(repo, EXEMPT), 'utf8').split('\n').filter(Boolean);

/**
 * A `landingRepo` with this repository's `.gitattributes` and exempt list on `main`, where the
 * feature and `pilot` each exempt a path and decide something, one commit each.
 */
function exemptLanding(t) {
  const listed = `${exemptPaths().join('\n')}\n`;
  return landingRepo(t, 'exempt', {
    base: { '.gitattributes': ATTRIBUTES, [EXEMPT]: listed },
    feature: { [EXEMPT]: `${listed}docs/design/one/\n` },
    pilot: { [EXEMPT]: `${listed}docs/design/two/\n` },
  });
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
  const { dir, repo, origin, feature } = exemptLanding(t);

  const result = mergeIntoPilot({ cwd: repo, source: feature, message: 'Land feat/one', test: passing, label: 'feat/one', side: 'theirs' });

  assert.equal(result.merged, true, result.line);
  const tip = path.join(dir, 'tip');
  git(dir, 'clone', '-q', '-b', 'pilot', origin, tip);
  assertBothKept(tip);
});

test('sync merges both', (t) => {
  // main moved on by the commit `landingRepo` calls the feature.
  const { dir, repo, origin, feature: mainTip } = exemptLanding(t);

  const result = mergeIntoPilot({ cwd: repo, source: mainTip, message: 'Sync main', test: passing, label: 'main', side: 'ours' });

  assert.equal(result.merged, true, result.line);
  const tip = path.join(dir, 'tip');
  git(dir, 'clone', '-q', '-b', 'pilot', origin, tip);
  assertBothKept(tip);
});
