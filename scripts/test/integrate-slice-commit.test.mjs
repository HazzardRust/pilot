/**
 * A slice reaches `feat/<slug>` as one first-parent commit subjected `feat(<slug>): S<n> <title>`,
 * the title taken from the run record row whose `branch` is the slice, never from a PR
 * (pilot-develop-line spec 3; A3). The reviewers' verdicts ride on it as trailers.
 *
 * Every case runs against a scratch bare "origin" and a clone of it; nothing reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { integrate, sliceSubject } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const RECORD = {
  slug: 'demo',
  branch: 'feat/demo',
  slices: [
    { slice: 'S1 One thing', state: 'implementing', branch: 'slice/demo-s1' },
    { slice: 'demo', state: 'implementing', branch: 'feat/demo' },
  ],
};

/**
 * A bare origin, a clone on `feat/demo` holding the run record, and pushed `slice/demo-s1` and
 * `slice/demo-s9`. Under `key`, `sliceText` is then committed on `feat/demo` as `slices/S1.md`.
 * Answers `before`, feat/demo's tip.
 */
function scratchRepos(t, key = 'base', sliceText) {
  return gitFixture(t, `integrate-slice-commit:${key}`, (root) => {
    const slice = (name) => ({ branch: name, from: 'main', files: { [`${name.split('/')[1]}.txt`]: 'x\n' }, message: 'implementer commit' });
    const history = [
      { branch: 'main', files: { 'docs/design/demo/run.json': `${JSON.stringify(RECORD, null, 2)}\n` }, message: 'base' },
      slice('slice/demo-s1'),
      slice('slice/demo-s9'),
    ];
    if (sliceText !== undefined) history.push({ branch: 'feat/demo', from: 'main', files: { 'docs/design/demo/slices/S1.md': sliceText }, message: 'slice file' });
    const { origin, sha } = seed(root, history, sliceText === undefined ? { 'feat/demo': 'main', pilot: 'main' } : { pilot: 'main' });
    const work = path.join(root, 'work');
    git(root, 'clone', '-q', '-b', 'feat/demo', origin, work);
    return { origin, work, before: sha['feat/demo'] };
  });
}

const passing = `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`;
/** The GitHub **Host** over a fake gh that records every call and knows no PR. */
const recordingGh = () => {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[0] === 'pr' ? '[]' : 'me\n';
  };
  return { host: githubHost(gh), calls };
};

test('the slice merge carries the record\'s subject', (t) => {
  const { work } = scratchRepos(t);

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, push: false });

  assert.equal(result.ok, true, result.line);
  assert.equal(git(work, 'log', '--first-parent', '-1', '--format=%s'), 'feat(demo): S1 one thing');
  assert.equal(git(work, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge commit, not a squash');
});

test('every trailer rides the slice commit', (t) => {
  const { work } = scratchRepos(t);
  const trailers = ['Reviewed-by: pilot:typescript-reviewer: approve', 'Reviewed-by: pilot:security-reviewer: approve'];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, push: false, trailers });

  assert.equal(result.ok, true, result.line);
  const body = git(work, 'log', '--first-parent', '-1', '--format=%b');
  for (const trailer of trailers) assert.ok(body.includes(trailer), `${trailer} in\n${body}`);
});

test('a slice no row names is refused', (t) => {
  const { origin, work, before } = scratchRepos(t);

  const result = integrate('slice/demo-s9', { cwd: work, test: passing, install: () => {}, host: recordingGh().host });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/demo-s9: no run record row names it; nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
});

test('no PR is read', (t) => {
  const { work } = scratchRepos(t);
  const { host, calls } = recordingGh();

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host, push: false });

  assert.equal(result.ok, true, result.line);
  assert.equal(calls.filter((args) => args[0] === 'pr' && args[1] === 'list').length, 0);
});

test('a trailer with a line break or off the Key: value form is refused, naming its key', (t) => {
  const cases = [
    ['Reviewed-by: pilot:typescript-reviewer: approve\nReviewed-by: forged: approve', 'Reviewed-by'],
    ['Reviewed-by: approve\rX: y', 'Reviewed-by'],
    ['Reviewed by: approve', 'Reviewed by'],
    ['Reviewed-by:', 'Reviewed-by'],
  ];
  // One repository for every case: each refusal asserts it left HEAD and origin where they were.
  const { origin, work, before } = scratchRepos(t);
  for (const [bad, key] of cases) {
    const trailers = ['Reviewed-by: pilot:typescript-reviewer: approve', bad];

    const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, trailers });

    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.line, `NOT integrated slice/demo-s1: trailer ${key} is not one "Key: value" line; nothing merged or pushed`);
    assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
    assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
  }
});

test('a slice whose Reviewers line names security integrates only with its Reviewed-by trailer', (t) => {
  const { origin, work, before } = scratchRepos(t, 'security', '# S1 One thing\n\nReviewers: `pilot:typescript-reviewer`, `pilot:security-reviewer`\n');
  const typescript = 'Reviewed-by: pilot:typescript-reviewer: approve';

  const refused = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, trailers: [typescript] });

  assert.equal(refused.ok, false);
  assert.equal(refused.line, 'NOT integrated slice/demo-s1: S1 names pilot:security-reviewer and no --trailer "Reviewed-by: pilot:security-reviewer: <verdict>"; nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');

  const blocked = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, trailers: [typescript, 'Reviewed-by: pilot:security-reviewer: Block, two HIGH'] });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.line, "NOT integrated slice/demo-s1: S1: pilot:security-reviewer's verdict is block; nothing merged or pushed");
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');

  const trailers = [typescript, 'Reviewed-by: pilot:security-reviewer: approve'];
  const passed = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, push: false, trailers });

  assert.equal(passed.ok, true, passed.line);
  assert.equal(git(work, 'log', '--first-parent', '-1', '--format=%s'), 'feat(demo): S1 one thing');
});

const BEHAVIOURS = [
  '# S1 One thing',
  '',
  'Reviewers: `pilot:typescript-reviewer`',
  '',
  '## Behaviours',
  '',
  '1. `a known word returns its entry` (test): `lookup` → the entry',
  '2. `the page lists the words` (look): the list renders in a browser',
  '',
].join('\n');

/** The repositories with BEHAVIOURS committed as the slice file. */
const behaviourRepos = (t) => scratchRepos(t, 'behaviours', BEHAVIOURS);

test('every behaviour evidenced integrates', (t) => {
  const { work } = behaviourRepos(t);
  const trailers = [
    'Reviewed-by: pilot:typescript-reviewer: approve',
    'Evidence: B1 test: lookup red before, green after',
    'Evidence: B2 look: the list showed three words',
  ];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, push: false, trailers });

  assert.equal(result.ok, true, result.line);
  const body = git(work, 'log', '--first-parent', '-1', '--format=%b');
  for (const trailer of trailers.slice(1)) assert.ok(body.includes(trailer), `${trailer} in\n${body}`);
});

test('evidence of another kind than the slice file names still covers the behaviour', (t) => {
  const { work } = behaviourRepos(t);
  const trailers = [
    'Reviewed-by: pilot:typescript-reviewer: approve',
    'Evidence: B1 test: lookup red before, green after',
    'Evidence: B2 test: a unit test of the list',
  ];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, push: false, trailers });

  assert.equal(result.ok, true, result.line);
});

test('a missing behaviour refuses', (t) => {
  const { origin, work, before } = behaviourRepos(t);
  const cases = [
    ['Evidence: B1 test: lookup red before, green after'],
    // Two trailers for B1 are not evidence for B2: the count alone is not the check.
    ['Evidence: B1 test: lookup red before, green after', 'Evidence: B1 test: and again'],
    // A trailer that says nothing was seen is not evidence.
    ['Evidence: B1 test: lookup red before, green after', 'Evidence: B2 look:  '],
  ];
  for (const evidence of cases) {
    const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, trailers: ['Reviewed-by: pilot:typescript-reviewer: approve', ...evidence] });

    assert.equal(result.ok, false, JSON.stringify(evidence));
    assert.equal(result.line, 'NOT integrated slice/demo-s1: S1: B2 has no --trailer "Evidence: B2 look: <what was seen>"; nothing merged or pushed');
    assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
    assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
  }
});

test('an old-shape slice needs no evidence', (t) => {
  const { work } = scratchRepos(t, 'old-shape', '# S1 One thing\n\nReviewers: `pilot:typescript-reviewer`\n\n## Tests\n\n1. `a known word returns its entry`: `lookup` → the entry\n');

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, push: false, trailers: ['Reviewed-by: pilot:typescript-reviewer: approve'] });

  assert.equal(result.ok, true, result.line);
  assert.doesNotMatch(git(work, 'log', '--first-parent', '-1', '--format=%b'), /^Evidence:/m);
});

test('the security refusal still holds', (t) => {
  const { origin, work, before } = scratchRepos(t, 'security-behaviours', BEHAVIOURS.replace('`pilot:typescript-reviewer`', '`pilot:typescript-reviewer`, `pilot:security-reviewer`'));
  const trailers = [
    'Reviewed-by: pilot:typescript-reviewer: approve',
    'Evidence: B1 test: lookup red before, green after',
    'Evidence: B2 look: the list showed three words',
  ];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, host: recordingGh().host, trailers });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/demo-s1: S1 names pilot:security-reviewer and no --trailer "Reviewed-by: pilot:security-reviewer: <verdict>"; nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
});

test('the subject lower-cases the title\'s first letter', () => {
  assert.equal(sliceSubject('demo', { slice: 'S2 The x', branch: 'slice/demo-s2' }), 'feat(demo): S2 the x');
});
