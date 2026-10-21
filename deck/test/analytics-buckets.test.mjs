/** S2 of run-analytics: each agent lands in a bucket, and the slice table adds up (spec 3). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bucketOf } from '../analytics.mjs';
import { ROOT, analytics, tables as parse } from './analytics-run.mjs';

/** The `buckets` run's two tables, and the bucket an agent's row sits in. */
function tables(t, cwd = ROOT) {
  const { code, stdout } = analytics(t, ['buckets'], { cwd });
  assert.equal(code, 0);
  const [agents, slices] = parse(stdout);
  return { stdout, agents, slices, bucket: (id) => agents.find((r) => r[0] !== '–' && id.startsWith(r[0]))?.[1] };
}

test('an implementer whose brief names its slice worktree lands on that slice', (t) => {
  assert.equal(tables(t).bucket('b3'), 'S2');
});

test('a reviewer with no match inherits its parent implementer\'s slice', (t) => {
  assert.equal(tables(t).bucket('b4'), 'S2');
});

test('the architect\'s design/<slug> brief lands on design, and QA\'s feat/<slug> brief lands on feature', (t) => {
  const { bucket } = tables(t);
  assert.equal(bucket('b1'), 'design');
  assert.equal(bucket('b6'), 'feature');
  assert.equal(bucket('pilot'), 'pilot');
});

test('an explorer that matches nothing lands on unattributed, and the row is printed', (t) => {
  const { slices, bucket } = tables(t);
  assert.equal(bucket('b5'), 'unattributed');
  assert.deepEqual(slices.map((r) => r[0]), ['S1', 'S2', 'S3', 'design', 'feature', 'pilot', 'unattributed', 'Total']);
  assert.equal(slices[2][1], '0');
});

test('the slice totals equal the agent totals', (t) => {
  const { agents, slices } = tables(t);
  const sums = (rows, from) => [0, 1, 2, 3, 4].map((i) => rows.reduce((n, r) => n + Number(r[from + i].replace(/,/g, '')), 0));
  const total = slices.at(-1);
  assert.deepEqual(sums(slices.slice(0, -1), 2), sums(agents, 5));
  assert.deepEqual(sums([total], 2), sums(agents, 5));
  assert.deepEqual(sums(agents, 5), [211, 2102, 21003, 25, 7]);
});

test('without a run record the agent table still prints, and says why there is no slice table', (t) => {
  const { stdout, slices } = tables(t, path.join(ROOT, 'C--fixture-repo'));
  assert.equal(slices, undefined);
  assert.match(stdout, /No slice table: no readable run record at .*run\.json\./);
});

test('paths match whatever their slashes and case', (t) => {
  assert.equal(tables(t).bucket('b2'), 'S1');
});

/** The bucket of an agent whose brief matched `matched`, in a run of slices S1 and S10. */
const bucketFor = (matched) => bucketOf({ id: 'x', matched }, new Map(), {
  slug: 'x', worktree: 'C:/fixture/x-feature-worktree-with-a-long-name',
  slices: [{ slice: 'S1', branch: 'slice/x-s1' }, { slice: 'S10', branch: 'slice/x-s10' }],
});

test('the longest match within a rank wins, so S10 is not S1', () => {
  assert.equal(bucketFor(['slice/x-s1', 'slice/x-s10']), 'S10');
});

test('a slice match beats a longer feature match', () => {
  assert.equal(bucketFor(['C:/fixture/x-feature-worktree-with-a-long-name', 'slice/x-s1']), 'S1');
});
