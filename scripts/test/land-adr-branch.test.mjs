/**
 * S5 of audit-f14: a main-cut run's ADR number rides on the feature branch (spec 9; L7). The
 * landing commits the rename on feat in the landing worktree once the suite is green, pushes feat,
 * then pilot, so the feature's PR lists `docs/adr/<number>-<slug>.md`; a red suite pushes neither.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, fakeGh, git, land, mainSays, passing } from './lib/land-repos.mjs';
import { seed as seedHistory } from './lib/seed.mjs';

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
    // The history the porcelain build committed and pushed, seeded beside origin and fetched into it in one git.
    const feature = (name, placeholder = true) => [
      { branch: `feat/${name}`, from: 'main', files: { [`${name}.txt`]: `${name}\n` }, message: `feat ${name}` },
      ...(placeholder ? [{ branch: `feat/${name}`, files: { [`docs/adr/NNNN-${name}.md`]: adr(name) }, message: `adr ${name}` }] : []),
      { branch: `feat/${name}`, files: { [`docs/design/${name}/run.json`]: `${JSON.stringify({ slug: name, base: 'main' }, null, 2)}\n` }, message: 'run record' },
    ];
    const beside = path.join(dir, 'history');
    fs.mkdirSync(beside);
    const { origin: history, sha } = seedHistory(beside, [
      { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
      { branch: 'main', files: { 'docs/adr/0192-base.md': adr('the base') }, message: 'adr 0192' },
      ...feature('x'), ...feature('y'), ...feature('bare', false),
    ], { pilot: 'main' });
    git(built.origin, 'fetch', '-q', history, '+refs/heads/*:refs/heads/*');
    // Each feature is one clone of its branch, holding a local main as the clone the build cut it in did.
    const clone = (name) => {
      const work = path.join(dir, name);
      git(dir, 'clone', '-q', '-b', `feat/${name}`, built.origin, work);
      fs.writeFileSync(path.join(work, '.git', 'refs', 'heads', 'main'), `${sha.main}\n`);
      return work;
    };
    return { ...built, dir, x: clone('x'), y: clone('y'), bare: clone('bare') };
  });
}

/** The SHAs of `refs` in `repo`, one `rev-parse` for them all (test-body-git S11, L5). */
const revs = (repo, ...refs) => git(repo, 'rev-parse', ...refs).split('\n');
const featFiles = (origin, name) => git(origin, 'diff', '--name-only', `main..feat/${name}`).split('\n');
const host = (name) => fakeGh([{ number: 12, headRefName: `feat/${name}`, baseRefName: 'main', state: 'OPEN' }]).host;

// One landing through `main`, both checks (S8 of cheap-suite): `main` prints the `adr` that
// `land` answered as `ADR <from> is <to>`, so the allocation is read back from that line.
test('the PR carries the number; the landed lines say feat moved on origin', (t) => {
  const { origin, x } = adrRepos(t);

  const said = mainSays([], { cwd: x, git: (args) => git(x, ...args), host: host('x'), test: passing });

  const files = featFiles(origin, 'x');
  assert.ok(files.includes('docs/adr/0193-x.md'), files.join(', '));
  assert.deepEqual(files.filter((f) => f.includes('NNNN-')), []);
  const [, from, to] = said.out.match(/^ADR (\S+) is (\S+)$/m) ?? [];
  assert.deepEqual({ from, to }, { from: 'NNNN-x', to: '0193' });
  const [merged, feat, under] = revs(origin, 'pilot^2', 'feat/x', 'feat/x^');
  assert.equal(merged, feat, 'pilot merges the numbered feature');
  assert.equal(under, git(x, 'rev-parse', 'HEAD'), 'one commit on top of the landed tip');

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /\nADR NNNN-x is 0193\nfeat\/x moved on origin: git pull --ff-only before a fix\nfeature PR: #12 into main\n$/);
});

/** One landing of `work`'s feature by hand: merge onto pilot, allocate on the feature, merge that, move pilot. */
function landByHand(origin, work, name) {
  git(work, 'fetch', '-q', 'origin');
  const pilotTip = git(work, 'rev-parse', 'origin/pilot');
  const tree = path.join(path.dirname(work), `${name}-landing`);
  git(work, 'worktree', 'add', '-q', '--detach', tree, 'HEAD');
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

test('a retry after pilot moved pushes the same numbered commit', (t) => {
  const { origin, seed, mover, x } = adrRepos(t);

  // The suite's first run moves pilot, so the pilot push after feat's is rejected and land retries.
  const landed = land({ cwd: x, git: (args) => git(x, ...args), host: host('x'), test: mover(seed, 'new', 1) });

  assert.equal(landed.retried, true);
  assert.deepEqual(landed.adr, { from: 'NNNN-x', to: '0193' });
  const [under, merged, feat] = revs(origin, 'feat/x^', 'pilot^2', 'feat/x');
  assert.equal(under, git(x, 'rev-parse', 'HEAD'), 'still one commit on the landed tip');
  assert.equal(merged, feat);
  assert.ok(git(origin, 'ls-tree', '--name-only', 'pilot', 'moved0.txt'), 'the move is kept');
});

test('a retry after pilot took the number renumbers feat by a fast-forward', (t) => {
  const { origin, seed, dir, x } = adrRepos(t);
  // The suite's first run lands ADR 0193 on pilot, after feat/x was numbered 0193 and before pilot's push.
  const count = path.join(dir, 'taker-count');
  const script = path.join(dir, 'taker.mjs');
  fs.writeFileSync(
    script,
    `import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const at = (...args) => execFileSync('git', args, { cwd: ${JSON.stringify(seed)} });
if (!fs.existsSync(${JSON.stringify(count)})) {
  fs.writeFileSync(${JSON.stringify(count)}, '1');
  at('fetch', '-q', 'origin');
  at('checkout', '-q', '-B', 'taker', 'origin/pilot');
  fs.writeFileSync(${JSON.stringify(seed)} + '/docs/adr/0193-other.md', 'other');
  at('add', '.');
  at('commit', '-q', '-m', 'adr 0193');
  at('push', '-q', 'origin', 'taker:pilot');
}
console.log('ℹ pass 1'); console.log('ℹ fail 0');
`,
  );

  const landed = land({ cwd: x, git: (args) => git(x, ...args), host: host('x'), test: `node "${script}"` });

  assert.equal(landed.retried, true);
  assert.deepEqual(landed.adr, { from: 'NNNN-x', to: '0194' });
  const files = featFiles(origin, 'x');
  assert.ok(files.includes('docs/adr/0194-x.md'), files.join(', '));
  assert.ok(!files.includes('docs/adr/0193-x.md'), files.join(', '));
  const [under, merged, feat] = revs(origin, 'feat/x^^', 'pilot^2', 'feat/x');
  assert.equal(under, git(x, 'rev-parse', 'HEAD'), 'the renumber sits on the first number');
  assert.equal(merged, feat);
});

test('a feature with no placeholder gets no commit on feat', (t) => {
  const { origin, bare } = adrRepos(t);
  const tip = git(origin, 'rev-parse', 'feat/bare');

  const landed = land({ cwd: bare, git: (args) => git(bare, ...args), host: host('bare'), test: passing });

  assert.equal(landed.adr, null);
  const [feat, merged] = revs(origin, 'feat/bare', 'pilot^2');
  assert.equal(feat, tip);
  assert.equal(merged, tip);
});
