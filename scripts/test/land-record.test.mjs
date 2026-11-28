/**
 * Lander spec 7, L10: the deck's run record is committed on `feat/<slug>` before the landing,
 * so the one merge on `pilot` carries it in its second parent's tree. Scratch bare origin, `gh` faked.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { githubHost } from '../../deck/host-github.mjs';
import { greenChecks } from './lib/land-repos.mjs';
import { seed } from './lib/seed.mjs';

const { land } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const host = githubHost(greenChecks((args) => (args[1] === 'list' ? '[]' : '')));
const record = '{"slug":"a","next":"land"}\n';

function repos(t) {
  return gitFixture(t, 'land-record:repos', (dir) => {
    const { origin } = seed(dir, [
      { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
      { branch: 'feat/a', files: { 'a.mjs': 'export const a = 1;\n' }, message: 'feat a' },
    ], { pilot: 'main' });
    const work = path.join(dir, 'work');
    git(dir, 'clone', '-q', '-b', 'feat/a', origin, work);
    // `git config pilot.test`, one git fewer: the value quoted, since `;` starts a config comment.
    fs.appendFileSync(path.join(work, '.git', 'config'), `[pilot]\n\ttest = ${JSON.stringify(`node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`)}\n`);
    return { origin, work };
  });
}

test('the landing merge carries the run record', (t) => {
  const { origin, work } = repos(t);
  const before = git(origin, 'rev-list', '--first-parent', '--count', 'pilot');
  fs.mkdirSync(path.join(work, 'docs', 'design', 'a'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs', 'design', 'a', 'run.json'), record);

  land({ cwd: work, git: (args) => git(work, ...args), host, test: 'node -e "0"' });

  assert.equal(git(origin, 'show', 'pilot^2:docs/design/a/run.json') + '\n', record);
  assert.equal(Number(git(origin, 'rev-list', '--first-parent', '--count', 'pilot')), Number(before) + 1, 'one merge, no second commit');
});
