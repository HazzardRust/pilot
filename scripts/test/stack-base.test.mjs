/**
 * audit-f14 S3 (spec 4; L5, L6): a feature PR's base is `prBase`'s, worked out from the run record's base on every
 * write. A main-cut run targets the default branch; a stacked run targets its lower `feat/<N>` until N's PR reads
 * merged on the host, then the default branch, and a later status write leaves that retarget alone. The default
 * branch is what a scratch bare origin's HEAD names; the host is a stub answering `reviews` only by its query.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { featureBody, syncFeaturePr } from '../feature-pr.mjs';
import { git as gitAt } from '../pilot-branch.mjs';
import { prBase } from '../stack.mjs';

const SLUG = 'demo-b';
const SPEC = ['## 2. Spec', '', '1. B does a thing.', ''].join('\n');

/** A bare origin whose HEAD is `trunk` (so nothing passes by assuming `main`), holding feat/demo-b with its artefact; a clone of it. */
function buildRepos(root) {
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  gitAt(root, 'init', '-q', '--bare', '-b', 'trunk', origin);
  gitAt(root, 'clone', '-q', origin, clone);
  gitAt(clone, 'checkout', '-q', '-b', `feat/${SLUG}`);
  const dir = path.join(clone, 'docs', 'design', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'architecture.md'), ['# B', '', SPEC, '## 3. Findings', ''].join('\n'));
  gitAt(clone, 'add', '.');
  gitAt(clone, 'commit', '-q', '-m', 'artefact');
  gitAt(clone, 'push', '-q', 'origin', `feat/${SLUG}`, `feat/${SLUG}:trunk`);
  return clone;
}

const repo = (t) => gitFixture(t, 'stack-base', buildRepos);
const gitIn = (cwd) => (args) => gitAt(cwd, ...args);

/** A host whose `reviews` filters `prs` by the query's head and state; every write is kept. */
function stubHost(prs) {
  const writes = [];
  const host = {
    cli: 'gh',
    reviews: ({ head, state }) => prs.filter((pr) => (head === undefined || pr.head === head) && (state === 'all' || pr.state === state)),
    open: (args) => (writes.push(['open', args]), { number: 42 }),
    edit: (number, change) => writes.push(['edit', number, change]),
    upsertComment: () => 'none',
  };
  return { host, writes };
}

const pr = (over) => ({ number: 1, state: 'open', base: 'trunk', head: 'feat/a', headSha: 'a'.repeat(40), body: '', crossRepo: false, ...over });

test('a main-cut run\'s PR targets main', (t) => {
  const cwd = repo(t);
  const { host } = stubHost([]);
  assert.equal(prBase({ git: gitIn(cwd), host, base: 'trunk' }), 'trunk');
  // The legacy base is unchanged (A3).
  assert.equal(prBase({ git: gitIn(cwd), host, base: 'pilot', name: 'pilot' }), 'pilot');
  // A plain branch name that is not the default branch is no run base.
  assert.throws(() => prBase({ git: gitIn(cwd), host, base: 'main' }), /record base "main"/);
});

test('a stacked PR targets its lower branch until that merges', (t) => {
  const cwd = repo(t);
  const open = stubHost([pr({ number: 5, head: 'feat/a', state: 'open' })]);
  assert.equal(prBase({ git: gitIn(cwd), host: open.host, base: 'feat/a' }), 'feat/a');

  // A fork's merged PR from a branch of the same name is not a's.
  const fork = stubHost([pr({ number: 6, head: 'feat/a', state: 'merged', crossRepo: true })]);
  assert.equal(prBase({ git: gitIn(cwd), host: fork.host, base: 'feat/a' }), 'feat/a');

  const merged = stubHost([pr({ number: 5, head: 'feat/a', state: 'merged' })]);
  assert.equal(prBase({ git: gitIn(cwd), host: merged.host, base: 'feat/a' }), 'trunk');
});

test('a status write does not undo a retarget', (t) => {
  const cwd = repo(t);
  const record = { slug: SLUG, feature: 'b does a thing', base: 'feat/a', slices: [] };
  const body = featureBody(SPEC, record, '');
  // a's PR has merged and b's PR was retargeted to the default branch: the record still says feat/a (L6).
  const { host, writes } = stubHost([
    pr({ number: 5, head: 'feat/a', state: 'merged' }),
    pr({ number: 7, head: `feat/${SLUG}`, state: 'open', base: 'trunk', body }),
  ]);
  assert.equal(prBase({ git: gitIn(cwd), host, base: 'feat/a' }), 'trunk');

  const out = syncFeaturePr({ host, git: gitIn(cwd), record });

  assert.deepEqual(writes, []);
  assert.deepEqual(out, { line: 'feature PR #7 unchanged', number: 7, wrote: 'unchanged' });
});
