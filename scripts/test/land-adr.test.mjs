/**
 * S8 of one-integration-line: the landing allocates the ADR number (spec 5; L4). Two features
 * each carrying `docs/adr/NNNN-<slug>.md` land in turn through `mergeIntoPilot` and read 0168
 * then 0169, each in its one landing merge; the trial's prepared merge allocates nothing.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, commitFile, fakeGh, git, mainSays, passing } from './lib/land-repos.mjs';

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
    fs.mkdirSync(path.join(built.seed, 'docs/adr'), { recursive: true });
    commitFile(built.seed, 'docs/adr/0167-base.md', adr('the base'), 'adr 0167');
    git(built.seed, 'push', '-q', 'origin', 'HEAD:pilot');
    const feature = (name) => {
      const work = built.clone(name);
      fs.mkdirSync(path.join(work, 'docs/adr'), { recursive: true });
      commitFile(work, `docs/adr/NNNN-${name}.md`, adr(name), `adr ${name}`);
      git(work, 'push', '-q', 'origin', `feat/${name}`);
      return work;
    };
    return { ...built, dir, x: feature('x'), y: feature('y') };
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
  assert.equal(git(origin, 'rev-parse', 'pilot'), second.sha, 'the allocated merge is the one pushed');
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), git(y, 'rev-parse', 'HEAD'), 'still a merge of the feature');
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
  const { gh } = fakeGh([{ number: 7, headRefName: 'feat/x' }, { number: 901, headRefName: 'pilot', state: 'OPEN' }]);

  const said = mainSays([], { cwd: x, git: (args) => git(x, ...args), gh, test: passing });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /\nADR NNNN-x is 0168\nmain gets pilot: #901\n$/);
});
