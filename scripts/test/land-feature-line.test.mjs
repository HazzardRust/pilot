/**
 * S4 of audit-f14: a run whose record base is not `pilot` lands on pilot as before but opens no
 * release PR, waits for no merged read, and ends on `featureLine` (spec 4, 8; A3). `gh` is faked;
 * the landing runs against a scratch bare "origin" whose HEAD is main.
 */

import { repos, land, fakeGh, git, passing, mainSays } from './lib/land-repos.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { featureLine } = await import('../land.mjs');

/** Commits feat/a's run record with `base`, pushed, as the deck writes it at gate1. */
function recordBase(work, base) {
  fs.mkdirSync(path.join(work, 'docs/design/a'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs/design/a/run.json'), `${JSON.stringify({ slug: 'a', base }, null, 2)}\n`);
  git(work, 'add', 'docs/design/a/run.json');
  git(work, 'commit', '-q', '-m', 'run record');
  git(work, 'push', '-q', 'origin', 'feat/a');
}

const verb = (calls, name) => calls.filter((args) => args[0] === 'pr' && args[1] === name);

test('a main-cut landing opens no PR from pilot', (t) => {
  const { gitIn, a } = repos(t, 'a');
  recordBase(a, 'main');
  const { host, calls } = fakeGh([{ number: 12, headRefName: 'feat/a', baseRefName: 'main', state: 'OPEN' }]);

  const said = mainSays([], { cwd: a, git: gitIn(a), host, test: passing });

  assert.equal(said.code, 0, said.out);
  assert.equal(verb(calls, 'create').filter((args) => args[args.indexOf('--head') + 1] === 'pilot').length, 0);
  assert.equal(verb(calls, 'create').length, 0);
  assert.match(said.out, /\nfeature PR: #12 into main\n$/);
  assert.doesNotMatch(said.out, /main gets pilot/);
  // Still landed on pilot, with the comment on the feature's PR.
  assert.match(said.out, /^landed feat\/a on pilot at [0-9a-f]{7}$/m);
  assert.equal(verb(calls, 'comment').length, 1);
});

test('a stacked landing names the PR below', () => {
  assert.equal(featureLine({ number: 13, base: 'feat/a', below: 12, host: {} }), 'feature PR: #13 into feat/a (after #12)');
  assert.equal(featureLine({ number: 12, base: 'main', host: {} }), 'feature PR: #12 into main');
  assert.equal(featureLine({ number: null, host: null }), 'feature PR: none (no host)');
  assert.equal(featureLine({ number: null, why: 'gh failed', host: {} }), 'feature PR: unknown (gh failed)');
  assert.equal(featureLine({ number: null, why: 'x'.repeat(300), host: {} }), `feature PR: unknown (${'x'.repeat(200)})`);
});

test('no wait for a PR that cannot read merged', (t) => {
  const { gitIn, a } = repos(t, 'a');
  recordBase(a, 'main');
  const { host, calls } = fakeGh([{ number: 12, headRefName: 'feat/a', baseRefName: 'main', state: 'OPEN' }]);
  let slept = 0;

  const result = land({ cwd: a, git: gitIn(a), host, test: passing, sleep: () => (slept += 1) });

  assert.equal(verb(calls, 'view').length, 0, 'host.review is never asked');
  assert.equal(slept, 0);
  assert.deepEqual(result.feature, { number: 12, base: 'main' });
  assert.equal(result.main, undefined);
  assert.equal(result.stillOpen, undefined);
});

/** feat/x pushed from `seed` and landed on origin's pilot, so a run based on it passes the chain guard. */
function landedLower(seed) {
  git(seed, 'fetch', '-q', 'origin');
  git(seed, 'checkout', '-q', '-B', 'feat/x', 'origin/main');
  fs.writeFileSync(path.join(seed, 'x.txt'), 'x\n');
  git(seed, 'add', 'x.txt');
  git(seed, 'commit', '-q', '-m', 'x');
  git(seed, 'push', '-q', 'origin', 'feat/x');
  git(seed, 'checkout', '-q', '-B', 'landing', 'origin/pilot');
  git(seed, 'merge', '-q', '--no-ff', '-m', 'Merge feat/x into pilot', 'feat/x');
  git(seed, 'push', '-q', 'origin', 'landing:pilot');
}

test('a landing based on feat/x names the PR below', (t) => {
  const { gitIn, seed, a } = repos(t, 'a');
  landedLower(seed);
  recordBase(a, 'feat/x');
  git(a, 'fetch', '-q', 'origin');
  const { host } = fakeGh([
    { number: 12, headRefName: 'feat/x', baseRefName: 'main', state: 'OPEN' },
    { number: 13, headRefName: 'feat/a', baseRefName: 'feat/x', state: 'OPEN' },
  ]);

  const result = land({ cwd: a, git: gitIn(a), host, test: passing });

  assert.deepEqual(result.feature, { number: 13, base: 'feat/x', below: 12 });
});

test('a host that throws reads number null, with why', (t) => {
  const { gitIn, a } = repos(t, 'a');
  recordBase(a, 'main');
  const host = {
    reviews: () => {
      throw new Error('gh is down');
    },
    comment: () => {},
  };

  const result = land({ cwd: a, git: gitIn(a), host, test: passing });

  assert.deepEqual(result.feature, { number: null, why: 'gh is down' });
});

test('a feature whose PR cannot be found reads unknown', (t) => {
  const { gitIn, a } = repos(t, 'a');
  recordBase(a, 'main');
  const { host } = fakeGh([]);

  const said = mainSays([], { cwd: a, git: gitIn(a), host, test: passing });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /\nfeature PR: unknown \(no open PR has head feat\/a\)\n$/);
});
