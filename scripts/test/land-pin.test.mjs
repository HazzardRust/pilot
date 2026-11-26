/**
 * The landing's pin (land-batching spec 3, L5): what one `pilot land` prints on a seeded repository,
 * with every SHA as `<sha>` and the scratch directory as `<dir>`, and the merge it leaves on pilot,
 * recorded on the base before any product change. Nothing here reaches a real remote.
 */

import { git, commitFile, repos, passing, fakeGh, mainSays, land } from './lib/land-repos.mjs';
import { countGit } from './lib/count-git.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

/** `text` with each SHA, full or short, as `<sha>` and `dir` as `<dir>`, separators forward. */
const normal = (text, dir) => text.replaceAll(dir, '<dir>').replaceAll('\\', '/').replace(/\b[0-9a-f]{7,40}\b/g, '<sha>');

test('the landing prints what it printed on the base and leaves the same merge on pilot', (t) => {
  const { origin, gitIn, x } = repos(t, 'x');
  // A slice integrated into the feature, so the tail's deletion prints too.
  git(x, 'checkout', '-q', '-b', 'slice/x-s1');
  commitFile(x, 's1.txt', 's1\n', 'slice s1');
  git(x, 'push', '-q', 'origin', 'slice/x-s1');
  git(x, 'checkout', '-q', 'feat/x');
  git(x, 'merge', '-q', '--no-ff', '-m', 'feat(x): S1', 'slice/x-s1');
  git(x, 'push', '-q', 'origin', 'feat/x');
  // origin's pilot as the setup left it (it pushes no pilot), and the feature's tip as pushed: one read.
  const [before, tip] = git(origin, 'rev-parse', 'pilot', 'feat/x').split('\n');

  const { code, out } = mainSays([], { cwd: x, git: gitIn(x), host: fakeGh().host, test: passing });

  assert.equal(code, 0);
  assert.equal(
    normal(out, path.dirname(x)),
    'deleted: slice/x-s1\nlanded feat/x on pilot at <sha>\nno ci proof: 0 gate jobs, fewer than 3\npr comment failed: no open or merged PR has head feat/x\nmain gets pilot: #900 (opened)\n',
  );
  const [subject, parents] = git(origin, 'log', '-1', '--format=%s%n%P', 'pilot').split('\n');
  assert.equal(subject, 'Merge feat/x into pilot');
  assert.equal(parents, `${before} ${tip}`);
});

// 36 measured on the base for this landing (land-batching S1), 35 after S1; S2's bar is 32, S5's 27 (A2).
const BASE_GIT = 36;
const BAR_GIT = 27;

test('one landing spawns fewer git than on the base', (t) => {
  const { gitIn, x } = repos(t, 'x');
  const { value, git: spawned } = countGit(() => land({ cwd: x, git: gitIn(x), host: fakeGh().host, test: passing }));
  assert.equal(value.already, false);
  assert.ok(spawned <= BAR_GIT, `one landing spawned ${spawned} git, over ${BAR_GIT} (${BASE_GIT} on the base)`);
});
