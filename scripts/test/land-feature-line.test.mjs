/**
 * S1 of landed-pr-closed: a run whose record base is not the pilot branch (a main-cut record) has its
 * own PR moved onto pilot before pilot is pushed, so the push merges it, and the landing ends on the
 * release PR line like every other (spec 1; L2, A2). `gh` is faked; the landing runs against a
 * scratch bare "origin" whose HEAD is main.
 */

import { githubHost } from '../../deck/host-github.mjs';
import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, fakeGh, git, land, mainSays, passing } from './lib/land-repos.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { retargetOwn } = await import('../land.mjs');

/** Commits feat/a's run record with `base`, pushed, as the deck writes it at gate1. */
function recordBase(work, base) {
  fs.mkdirSync(path.join(work, 'docs/design/a'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs/design/a/run.json'), `${JSON.stringify({ slug: 'a', base }, null, 2)}\n`);
  git(work, 'add', 'docs/design/a/run.json');
  git(work, 'commit', '-q', '-m', 'run record');
  git(work, 'push', '-q', 'origin', 'feat/a');
}

/** The seeded repos with feat/a's run record saying `base`, built once per file and base. */
const recorded = (t, base) =>
  gitFixture(t, `land-feature-line:${base}`, (dir) => {
    const built = buildRepos(dir, ['a']);
    recordBase(built.a, base);
    return built;
  });

const edits = (calls) => calls.filter((args) => args[0] === 'pr' && args[1] === 'edit');

/**
 * `fakeGh` over `prs` whose `pr edit <n> --base <b>` moves PR n to b, as GitHub does, and records
 * origin's pilot at that moment; `refuse` makes every edit exit 1 instead.
 */
function movingGh(origin, prs, { refuse = false } = {}) {
  const fake = fakeGh(prs);
  const pilotAtEdit = [];
  const gh = (args) => {
    if (args[0] === 'pr' && args[1] === 'edit') {
      fake.calls.push(args);
      if (refuse) throw Object.assign(new Error('gh pr edit exited 1'), { stderr: 'GraphQL: Resource not accessible by integration\n' });
      pilotAtEdit.push(git(origin, 'rev-parse', 'pilot'));
      const pr = prs.find((each) => String(each.number) === args[2]);
      pr.baseRefName = args[args.indexOf('--base') + 1];
      return '';
    }
    return fake.gh(args);
  };
  return { ...fake, host: githubHost(gh), pilotAtEdit };
}

test("a main-cut record's PR moves to the pilot branch before pilot is pushed", (t) => {
  const { gitIn, origin, a } = recorded(t, 'main');
  const before = git(origin, 'rev-parse', 'pilot');
  const prs = [{ number: 12, headRefName: 'feat/a', baseRefName: 'main', state: 'OPEN' }];
  const { host, calls, pilotAtEdit } = movingGh(origin, prs);

  const said = mainSays([], { cwd: a, git: gitIn(a), host, test: passing, sleep: () => (prs[0].state = 'MERGED') });

  assert.equal(said.code, 0, said.out);
  assert.deepEqual(edits(calls).map((args) => args.slice(2)), [['12', '--base', 'pilot']]);
  assert.deepEqual(pilotAtEdit, [before], 'the edit is made while origin pilot is the pre-landing tip');
  assert.notEqual(git(origin, 'rev-parse', 'pilot'), before, 'pilot was pushed after');
  assert.match(said.out, /^retarget #12 to pilot$/m);
  // The PR now targets pilot, so the landing polls it for merged before its comment (comment's A1).
  assert.ok(calls.some((args) => args[0] === 'pr' && args[1] === 'view' && args[2] === '12'), 'PR #12 polled for merged');
});

test('a main-cut landing ends on the release PR line', (t) => {
  const { gitIn, origin, a } = recorded(t, 'main');
  const { host } = movingGh(origin, [{ number: 12, headRefName: 'feat/a', baseRefName: 'main', state: 'MERGED' }]);

  const said = mainSays([], { cwd: a, git: gitIn(a), host, test: passing });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /\nmain gets pilot: #\d+( \(opened\))?\n$/);
  assert.doesNotMatch(said.out, /feature PR:/);
  assert.match(said.out, /^landed feat\/a on pilot at [0-9a-f]{7}$/m);
});

test('a PR already on the pilot branch is left alone', (t) => {
  const { gitIn, origin, a } = recorded(t, 'pilot');
  const { host, calls } = movingGh(origin, [{ number: 12, headRefName: 'feat/a', baseRefName: 'pilot', state: 'MERGED' }]);

  const said = mainSays([], { cwd: a, git: gitIn(a), host, test: passing });

  assert.equal(said.code, 0, said.out);
  assert.equal(edits(calls).length, 0);
  assert.doesNotMatch(said.out, /retarget/);
});

test('a refused edit does not fail the landing', (t) => {
  const { gitIn, origin, a } = recorded(t, 'main');
  const before = git(origin, 'rev-parse', 'pilot');
  const { host } = movingGh(origin, [{ number: 12, headRefName: 'feat/a', baseRefName: 'main', state: 'OPEN' }], { refuse: true });

  const result = land({ cwd: a, git: gitIn(a), host, test: passing, sleep: () => {} });

  assert.match(result.retargeted.join('\n'), /^retarget failed for #12: \S/m);
  assert.notEqual(git(origin, 'rev-parse', 'pilot'), before, 'still landed on pilot');
  assert.equal(result.feature, undefined);
});

test('retargetOwn moves only an open own-repo PR of head, and never throws', () => {
  const host = (reviews, edit = () => {}) => ({ reviews: () => reviews, edit });
  const own = { number: 12, head: 'feat/a', base: 'main', crossRepo: false, state: 'open' };

  const moved = [];
  assert.deepEqual(
    retargetOwn({
      host: host([own, { ...own, number: 13, crossRepo: true }, { ...own, number: 14, head: 'feat/b' }, { ...own, number: 15, base: 'pilot' }], (n, { base }) => moved.push([n, base])),
      head: 'feat/a',
      name: 'pilot',
    }),
    ['retarget #12 to pilot'],
  );
  assert.deepEqual(moved, [[12, 'pilot']]);
  const down = { reviews: () => { throw new Error('gh is down'); } };
  assert.deepEqual(retargetOwn({ host: down, head: 'feat/a', name: 'pilot' }), ['retarget failed: gh is down']);
});
