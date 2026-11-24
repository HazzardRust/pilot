/**
 * The landing's pin (land-batching spec 3, L5): what one `pilot land` prints on a seeded repository,
 * with every SHA as `<sha>` and the scratch directory as `<dir>`, and the merge it leaves on pilot,
 * recorded on the base before any product change. Nothing here reaches a real remote.
 */

import { git, commitFile, repos, passing, fakeGh, mainSays } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

/** `text` with each SHA, full or short, as `<sha>` and `dir` as `<dir>`, separators forward. */
const normal = (text, dir) => text.replaceAll(dir, '<dir>').replaceAll('\\', '/').replace(/\b[0-9a-f]{7,40}\b/g, '<sha>');

test('the landing prints what it printed on the base and leaves the same merge on pilot', (t) => {
  const { origin, gitIn, x } = repos(t, 'x');
  const before = git(origin, 'rev-parse', 'pilot');
  // A slice integrated into the feature, so the tail's deletion prints too.
  git(x, 'checkout', '-q', '-b', 'slice/x-s1');
  commitFile(x, 's1.txt', 's1\n', 'slice s1');
  git(x, 'push', '-q', 'origin', 'slice/x-s1');
  git(x, 'checkout', '-q', 'feat/x');
  git(x, 'merge', '-q', '--no-ff', '-m', 'feat(x): S1', 'slice/x-s1');
  git(x, 'push', '-q', 'origin', 'feat/x');
  const tip = git(x, 'rev-parse', 'HEAD');

  const { code, out } = mainSays([], { cwd: x, git: gitIn(x), host: fakeGh().host, test: passing });

  assert.equal(code, 0);
  assert.equal(
    normal(out, path.dirname(x)),
    'deleted: slice/x-s1\nlanded feat/x on pilot at <sha>\nno ci proof: 0 gate jobs, fewer than 3\npr comment failed: no open or merged PR has head feat/x\nmain gets pilot: #900 (opened)\n',
  );
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'pilot'), 'Merge feat/x into pilot');
  assert.equal(git(origin, 'log', '-1', '--format=%P', 'pilot'), `${before} ${tip}`);
});
