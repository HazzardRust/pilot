/**
 * S8 of one-integration-line: the landing allocates the ADR number (spec 5; L4). Two features
 * each carrying `docs/adr/NNNN-<slug>.md` land in turn through `mergeIntoPilot` and read 0168
 * then 0169, each in its one landing merge; the trial's prepared merge allocates nothing.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, fakeGh, git, mainSays, passing } from './lib/land-repos.mjs';
import { seed as seedHistory } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { mergeIntoPilot } = await import('../sync.mjs');

const adr = (title) => `---\nstatus: proposed\ndate: 2026-10-19\ntags: [x]\nsupersedes: []\nsuperseded_by: []\npaths: []\n---\n# ${title}\n\nWe decided ${title}.\n`;

/** Origin's pilot holding ADR 0167, and features x and y cut from it, each adding `NNNN-<name>.md`. */
function adrRepos(t) {
  return gitFixture(t, 'land-adr', (dir) => {
    const built = buildRepos(dir, []);
    // The history the porcelain build committed and pushed, seeded beside origin and fetched into it in one git.
    const feature = (name) => [
      { branch: `feat/${name}`, from: 'pilot', files: { [`${name}.txt`]: `${name}\n` }, message: `feat ${name}` },
      { branch: `feat/${name}`, files: { [`docs/adr/NNNN-${name}.md`]: adr(name) }, message: `adr ${name}` },
    ];
    const beside = path.join(dir, 'history');
    fs.mkdirSync(beside);
    const { origin: history, sha } = seedHistory(beside, [
      { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
      { branch: 'pilot', files: { 'docs/adr/0167-base.md': adr('the base') }, message: 'adr 0167' },
      ...feature('x'), ...feature('y'),
    ]);
    git(built.origin, 'fetch', '-q', history, '+refs/heads/*:refs/heads/*');
    // Each feature is one clone of its branch, holding a local main as the clone the build cut it in did.
    const clone = (name) => {
      const work = path.join(dir, name);
      git(dir, 'clone', '-q', '-b', `feat/${name}`, built.origin, work);
      fs.writeFileSync(path.join(work, '.git', 'refs', 'heads', 'main'), `${sha.main}\n`);
      return work;
    };
    return { ...built, dir, x: clone('x'), y: clone('y') };
  });
}

const land = (work, name, extra = {}) => {
  git(work, 'fetch', '-q', 'origin');
  return mergeIntoPilot({ cwd: work, git: (args) => git(work, ...args), source: git(work, 'rev-parse', 'HEAD'), message: `Merge feat/${name} into pilot`, test: passing, label: `feat/${name}`, ...extra });
};
const adrs = (origin) => git(origin, 'ls-tree', '--name-only', 'pilot', 'docs/adr/').split('\n');
const firstParents = (origin) => Number(git(origin, 'rev-list', '--first-parent', '--count', 'pilot'));

test('two features land with consecutive numbers', (t) => {
  const { origin, x, y } = adrRepos(t);
  const before = firstParents(origin);

  const first = land(x, 'x');
  assert.deepEqual(adrs(origin), ['docs/adr/0167-base.md', 'docs/adr/0168-x.md']);
  assert.equal(firstParents(origin), before + 1, 'one commit for the first landing');
  assert.deepEqual(first.adr, { from: 'NNNN-x', to: '0168' });

  const second = land(y, 'y');
  assert.deepEqual(adrs(origin), ['docs/adr/0167-base.md', 'docs/adr/0168-x.md', 'docs/adr/0169-y.md']);
  assert.equal(firstParents(origin), before + 2, 'one commit for the second landing');
  assert.deepEqual(second.adr, { from: 'NNNN-y', to: '0169' });
  const [pilot, merged] = git(origin, 'rev-parse', 'pilot', 'pilot^2').split('\n');
  assert.equal(pilot, second.sha, 'the allocated merge is the one pushed');
  assert.equal(merged, git(y, 'rev-parse', 'HEAD'), 'still a merge of the feature');
});

test('the prepared trial allocates nothing', (t) => {
  const { origin, dir, x } = adrRepos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const keep = path.join(dir, 'kept-x');

  const prepared = land(x, 'x', { keep, push: false });

  assert.equal(prepared.merged, true, prepared.line);
  assert.ok(fs.existsSync(path.join(keep, 'docs/adr/NNNN-x.md')), 'the placeholder keeps its name');
  assert.equal(git(keep, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'nothing pushed');
});

test('pilot land says the number above the main line', (t) => {
  const { x } = adrRepos(t);
  const { host } = fakeGh([{ number: 7, headRefName: 'feat/x' }, { number: 901, headRefName: 'pilot', state: 'OPEN' }]);

  const said = mainSays([], { cwd: x, git: (args) => git(x, ...args), host, test: passing });

  assert.equal(said.code, 0, said.out);
  // N{4}, not the placeholder spelled out: the landing rewrites a plain citation of it in a changed file.
  assert.match(said.out, /\nADR N{4}-x is 0168\nmain gets pilot: #901\n$/);
});
