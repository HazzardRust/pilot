/**
 * suite-at-landing S10 (spec 8; A4): `replay` runs the selection over the last slice merges of a
 * repository, each as its diff from its first parent, and answers one row per merge and the median.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { medianShare, replay } = await import('../select-tests.mjs');
const SCRIPT = fileURLToPath(new URL('../select-tests.mjs', import.meta.url));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** `subject` merged into main from a branch that applies `files`, always with a merge commit: two commits of a history. */
function merge(subject, files) {
  const branch = `b-${subject.replace(/\W+/g, '-')}`;
  return [
    { branch, from: 'main', files, message: `work ${subject}` },
    { branch: 'main', merge: [branch], files: {}, message: subject },
  ];
}

/** Four tests; S1 touches `lib/a.mjs` (one importer), S2 `package.json` (full), S3 `lib/c.mjs`. */
function threeMerges(dir) {
  const { origin } = seed(dir, [
    {
      branch: 'main',
      message: 'base',
      files: {
        'lib/a.mjs': 'export const a = 1;\n',
        'lib/c.mjs': 'export const c = 1;\n',
        'package.json': '{}\n',
        'test/a.test.mjs': "import { a } from '../lib/a.mjs';\n",
        'test/b.test.mjs': 'export {};\n',
        'test/c.test.mjs': "import { c } from '../lib/c.mjs';\n",
        'test/d.test.mjs': "import { c } from '../lib/c.mjs';\n",
      },
    },
    ...merge('Merge S1: a', { 'lib/a.mjs': 'export const a = 2;\n' }),
    ...merge('Merge S2: pkg', { 'package.json': '{"x":1}\n' }),
    ...merge('Merge S3: c', { 'lib/c.mjs': 'export const c = 2;\n' }),
  ]);
  const work = path.join(dir, 'work');
  git(dir, 'clone', '-q', origin, work);
  return { dir: work };
}

/** The worktree's state and HEAD in one read: `--branch` heads the porcelain with `branch.oid`. */
const state = (dir) => git(dir, 'status', '--porcelain=v2', '--branch');

/** One replay of the fixture, shared: each replay spawns git per merge, and the spawn count is gated. */
let once;
const replayOnce = (dir) => (once ??= replay({ cwd: dir, count: 2 }));

test('the last two merges that change no trigger, one row each', (t) => {
  const { dir } = gitFixture(t, 'replay', threeMerges);
  const before = state(dir);
  const { rows, median } = replayOnce(dir);
  assert.deepEqual(rows.map((r) => r.subject), ['Merge S3: c', 'Merge S1: a']);
  assert.deepEqual(rows.map((r) => r.selected), [2, 1]);
  assert.ok(rows.every((r) => r.total === 4 && /^[0-9a-f]{40}$/.test(r.sha)));
  assert.equal(median, 0.375, 'shares 2/4 and 1/4');
  assert.equal(state(dir), before,'the caller\'s worktree is untouched');
});

test('a merge that changes a trigger is skipped', (t) => {
  const { dir } = gitFixture(t, 'replay', threeMerges);
  const { rows, skipped } = replayOnce(dir);
  assert.equal(skipped, 1, 'S2 changed package.json');
  assert.ok(!rows.some((r) => r.subject === 'Merge S2: pkg'));
});

test('the median is of each row\'s share', () => {
  const rows = [{ selected: 1, total: 2 }, { selected: 3, total: 30 }, { selected: 'full', total: 10 }];
  // shares 0.5, 0.1, 1: the median share is 0.5; median(selected) / median(total) would say 3 / 10.
  assert.equal(medianShare(rows), 0.5);
  assert.equal(medianShare([{ selected: 1, total: 4 }, { selected: 'full', total: 8 }]), 0.625, 'an even count averages the middle two');
});

test('the CLI prints the median line', (t) => {
  const { dir } = gitFixture(t, 'replay', threeMerges);
  const out = execFileSync(process.execPath, [SCRIPT, '--replay', '2'], { cwd: dir, encoding: 'utf8' }).trimEnd().split('\n');
  assert.equal(out.length, 4);
  assert.match(out[0], /^[0-9a-f]{7} Merge S3: c +2 of 4$/);
  assert.match(out[1], /^[0-9a-f]{7} Merge S1: a +1 of 4$/);
  assert.equal(out[2], 'skipped, a full-suite trigger changed: 1');
  assert.equal(out[3], 'median 38% of the suite');
});
