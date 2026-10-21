/**
 * The landing is the one full run of the suite and says so on the PR (suite-at-landing spec 3, 7,
 * L8): the feature merge passes `mergeIntoPilot` no `since`, so a repository with a
 * `test:changed` script still runs `npm test` once, and the comment on the feature PR carries
 * that run's counts. `gh` is faked; the landing runs against a scratch bare "origin".
 */

import { repos, land, fakeGh, git, commitFile } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { comment } = await import('../land.mjs');

const bodyOf = (calls) => calls.find((args) => args[1] === 'comment')?.[4];

test('no counts, the old comment', () => {
  const { gh, calls } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);

  comment({ gh, head: 'feat/a', sha: 'abc1234', counts: null });

  assert.equal(bodyOf(calls), 'landed on pilot at abc1234');
});

test('the feature merge is the full run', (t) => {
  const { gitIn, a: work } = repos(t, 'a');
  const trace = path.join(path.dirname(work), 'suite-trace.txt');
  // A package with no dependencies: `npm ci` has nothing to fetch. Each script logs how it was called.
  commitFile(work, 'run.mjs', `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(trace)}, process.argv.slice(2).join(' ') + '\\n');\nconsole.log('ℹ pass 12');\nconsole.log('ℹ fail 0');\n`, 'run');
  const pkg = { name: 'fixture', version: '1.0.0', scripts: { test: 'node run.mjs full', 'test:changed': 'node run.mjs changed' } };
  commitFile(work, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'package');
  commitFile(work, 'package-lock.json', `${JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2)}\n`, 'lock');
  git(work, 'push', '-q', 'origin', 'feat/a');
  const { gh, calls } = fakeGh([{ number: 7, headRefName: 'feat/a' }]);

  const result = land({ cwd: work, git: gitIn(work), gh });

  assert.equal(result.commentFailed, undefined);
  const runs = fs.readFileSync(trace, 'utf8').trim().split('\n');
  assert.equal(runs.filter((line) => line.startsWith('full')).length, 1, 'npm test ran once');
  assert.ok(runs.every((line) => !line.startsWith('changed')), 'no test:changed run');
  assert.ok(runs.every((line) => !line.includes('--since')), 'no --since');
  assert.equal(bodyOf(calls), `landed on pilot at ${result.sha}; full suite 12 pass, 0 fail`);
});
