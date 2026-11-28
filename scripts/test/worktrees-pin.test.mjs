/**
 * The sweep's git pin (prune-worktrees S10, spec 13): one `pilot worktrees prune` over a fixed
 * fixture, a main checkout beside a landed, a live and a fresh tree, removes the landed one and
 * keeps the rest, and starts at most `BAR_GIT` git processes, against 30 on 768684d. Every case
 * runs in a scratch clone of a bare origin under the system temp directory.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { countGit } from './lib/count-git.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PILOT_BRANCH = 'pinned-pilot';
process.env.PILOT_BRANCH = PILOT_BRANCH;

const { main } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

/** main and pilot on origin, `landed` pushed to pilot, `live` unlanded, `fresh` just added at pilot's tip. */
function pinRepo(t) {
  return gitFixture(t, 'worktrees-pin:repo', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', `main:${PILOT_BRANCH}`, 'main');
    const cut = (name, from) => {
      const dir = path.join(root, name);
      git(work, 'worktree', 'add', '-q', '-b', name, dir, from);
      return dir;
    };
    const commit = (dir, name) => {
      fs.writeFileSync(path.join(dir, `${name}.txt`), name);
      git(dir, 'add', `${name}.txt`);
      git(dir, 'commit', '-q', '-m', name);
    };
    const landed = cut('landed', 'origin/main');
    commit(landed, 'landed');
    git(landed, 'push', '-q', 'origin', `landed:${PILOT_BRANCH}`);
    const live = cut('live', 'origin/main');
    commit(live, 'live');
    git(work, 'fetch', '-q', 'origin');
    const fresh = cut('fresh', `origin/${PILOT_BRANCH}`);
    return { work, landed, live, fresh };
  });
}

// 30 measured on 768684d for this sweep: three `git remote` and three fetches, a reflog per branch and per
// tree HEAD, and the record-tail walk before every safe-head read; 19 once each is one (S10).
const BASE_GIT = 30;
const BAR_GIT = 19;

test('one sweep removes the landed tree and spawns at most 19 git, 30 on 768684d', (t) => {
  const { work, landed, live, fresh } = pinRepo(t);
  const out = [];
  const err = [];
  const { value: status, git: spawned } = countGit(() => main(['prune', '--repo', work], {
    out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, read: () => [],
  }));
  assert.equal(status, 0, err.join(''));
  const said = (verb, dir) => out.join('').split('\n').some((line) => {
    const match = /^(removed|kept \S+)\s+(.+)$/.exec(line);
    return match && match[1] === verb && path.resolve(match[2]).toLowerCase() === path.resolve(dir).toLowerCase();
  });
  assert.ok(said('removed', landed), out.join(''));
  assert.ok(said('kept open', live) && said('kept open', fresh), out.join(''));
  assert.equal(fs.existsSync(landed), false);
  assert.ok(spawned <= BAR_GIT, `one sweep spawned ${spawned} git, over ${BAR_GIT} (${BASE_GIT} on 768684d)`);
});
