/**
 * S5 of audit-f14: a main-cut run's ADR number rides on the feature branch (spec 9; L7). The
 * landing commits the rename on feat in the landing worktree once the suite is green, pushes feat,
 * then pilot, so the feature's PR lists `docs/adr/<number>-<slug>.md`; a red suite pushes neither.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, commitFile, fakeGh, git, land, passing } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { allocateAdr } = await import('../adr-allocate.mjs');
const { afterGreen } = await import('../land-adr.mjs');
const { mergeIntoPilot } = await import('../sync.mjs');

const adr = (title) => `---\nstatus: proposed\ndate: 2026-11-20\ntags: [x]\nsupersedes: []\nsuperseded_by: []\npaths: []\n---\n# ${title}\n\nWe decided ${title}.\n`;
const failing = `node -e "console.log('ℹ pass 0'); console.log('ℹ fail 1'); process.exit(1)"`;

/** Origin's main and pilot holding ADR 0192, and main-cut features x and y, each adding `NNNN-<name>.md` (none for `bare`). */
function adrRepos(t) {
  return gitFixture(t, 'land-adr-branch', (dir) => {
    const built = buildRepos(dir, []);
    fs.mkdirSync(path.join(built.seed, 'docs/adr'), { recursive: true });
    commitFile(built.seed, 'docs/adr/0192-base.md', adr('the base'), 'adr 0192');
    git(built.seed, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:pilot');
    const feature = (name, placeholder = true) => {
      const work = built.clone(name);
      fs.mkdirSync(path.join(work, 'docs/adr'), { recursive: true });
      if (placeholder) commitFile(work, `docs/adr/NNNN-${name}.md`, adr(name), `adr ${name}`);
      fs.mkdirSync(path.join(work, `docs/design/${name}`), { recursive: true });
      commitFile(work, `docs/design/${name}/run.json`, `${JSON.stringify({ slug: name, base: 'main' }, null, 2)}\n`, 'run record');
      git(work, 'push', '-q', 'origin', `feat/${name}`);
      return work;
    };
    return { ...built, dir, x: feature('x'), y: feature('y'), bare: feature('bare', false) };
  });
}

const featFiles = (origin, name) => git(origin, 'diff', '--name-only', `main..feat/${name}`).split('\n');
const host = (name) => fakeGh([{ number: 12, headRefName: `feat/${name}`, baseRefName: 'main', state: 'OPEN' }]).host;

test('the PR carries the number', (t) => {
  const { origin, x } = adrRepos(t);

  const landed = land({ cwd: x, git: (args) => git(x, ...args), host: host('x'), test: passing });

  const files = featFiles(origin, 'x');
  assert.ok(files.includes('docs/adr/0193-x.md'), files.join(', '));
  assert.deepEqual(files.filter((f) => f.includes('NNNN-')), []);
  assert.deepEqual(landed.adr, { from: 'NNNN-x', to: '0193' });
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), git(origin, 'rev-parse', 'feat/x'), 'pilot merges the numbered feature');
  assert.equal(git(origin, 'rev-parse', 'feat/x^'), git(x, 'rev-parse', 'HEAD'), 'one commit on top of the landed tip');
});

/** One landing of `work`'s feature by hand: merge onto pilot, allocate on the feature, merge that, move pilot. */
function landByHand(origin, work, name) {
  git(work, 'fetch', '-q', 'origin');
  const pilotTip = git(work, 'rev-parse', 'origin/pilot');
  const tree = path.join(path.dirname(work), `${name}-landing`);
  git(work, 'worktree', 'add', '-q', '--detach', tree, git(work, 'rev-parse', 'HEAD'));
  const allocated = allocateAdr(tree, { since: pilotTip, onto: 'branch' });
  const numbered = git(tree, 'rev-parse', 'HEAD');
  git(tree, 'checkout', '-q', '--detach', pilotTip);
  git(tree, 'merge', '-q', '--no-ff', '-m', `Merge feat/${name} into pilot`, numbered);
  git(tree, 'push', '-q', 'origin', 'HEAD:pilot');
  return allocated;
}

test('two landings take consecutive numbers', (t) => {
  const { origin, x, y } = adrRepos(t);

  assert.deepEqual(landByHand(origin, x, 'x'), { from: 'NNNN-x', to: '0193' });
  assert.deepEqual(landByHand(origin, y, 'y'), { from: 'NNNN-y', to: '0194' });

  const adrs = git(origin, 'ls-tree', '--name-only', 'pilot', 'docs/adr/').split('\n').filter((f) => /\d{4}-/.test(f));
  assert.deepEqual(adrs, ['docs/adr/0192-base.md', 'docs/adr/0193-x.md', 'docs/adr/0194-y.md']);
});

test('a red suite pushes no number', (t) => {
  const { origin, x } = adrRepos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  let called = 0;
  const spy = (dir) => {
    called += 1;
    return afterGreen(dir);
  };

  git(x, 'fetch', '-q', 'origin');
  assert.throws(
    () => mergeIntoPilot({ cwd: x, git: (args) => git(x, ...args), source: git(x, 'rev-parse', 'HEAD'), message: 'Merge feat/x into pilot', test: failing, label: 'feat/x', afterGreen: spy }),
    /NOT synced/,
  );

  assert.equal(called, 0, 'afterGreen is not called');
  assert.ok(featFiles(origin, 'x').includes('docs/adr/NNNN-x.md'), 'origin keeps the placeholder');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot not pushed');
});

test('a feature with no placeholder gets no commit on feat', (t) => {
  const { origin, bare } = adrRepos(t);
  const tip = git(origin, 'rev-parse', 'feat/bare');

  const landed = land({ cwd: bare, git: (args) => git(bare, ...args), host: host('bare'), test: passing });

  assert.equal(landed.adr, null);
  assert.equal(git(origin, 'rev-parse', 'feat/bare'), tip);
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), tip);
});
