/**
 * A slice reaches `feat/<slug>` as one first-parent commit subjected `feat(<slug>): S<n> <title>`,
 * the title taken from the run record row whose `branch` is the slice, never from a PR
 * (pilot-develop-line spec 3; A3). The reviewers' verdicts ride on it as trailers.
 *
 * Every case runs against a scratch bare "origin" and a clone of it; nothing reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate, sliceSubject } = await import('../integrate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const RECORD = {
  slug: 'demo',
  branch: 'feat/demo',
  slices: [
    { slice: 'S1 One thing', state: 'implementing', branch: 'slice/demo-s1' },
    { slice: 'demo', state: 'implementing', branch: 'feat/demo' },
  ],
};

/** A bare origin, a clone on `feat/demo` holding the run record, and pushed `slice/demo-s1` and `slice/demo-s9`. */
function scratchRepos(t) {
  return gitFixture(t, 'integrate-slice-commit', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'checkout', '-q', '-b', 'feat/demo');
    const record = path.join(work, 'docs', 'design', 'demo', 'run.json');
    fs.mkdirSync(path.dirname(record), { recursive: true });
    fs.writeFileSync(record, `${JSON.stringify(RECORD, null, 2)}\n`);
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'base');
    git(work, 'push', '-q', '-u', 'origin', 'feat/demo');
    git(work, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:pilot');
    git(work, 'remote', 'set-head', 'origin', 'main');
    for (const slice of ['slice/demo-s1', 'slice/demo-s9']) {
      git(work, 'checkout', '-q', '-b', slice, 'feat/demo');
      fs.writeFileSync(path.join(work, `${slice.split('/')[1]}.txt`), 'x\n');
      git(work, 'add', '.');
      git(work, 'commit', '-q', '-m', 'implementer commit');
      git(work, 'push', '-q', 'origin', slice);
    }
    git(work, 'checkout', '-q', 'feat/demo');
    git(work, 'branch', '-q', '-D', 'slice/demo-s1', 'slice/demo-s9');
    return { origin, work };
  });
}

const passing = `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`;
/** A fake gh that records every call and knows no PR. */
const recordingGh = () => {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[0] === 'pr' ? '[]' : 'me\n';
  };
  return { gh, calls };
};

test('the slice merge carries the record\'s subject', (t) => {
  const { work } = scratchRepos(t);

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, push: false });

  assert.equal(result.ok, true, result.line);
  assert.equal(git(work, 'log', '--first-parent', '-1', '--format=%s'), 'feat(demo): S1 one thing');
  assert.equal(git(work, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge commit, not a squash');
});

test('every trailer rides the slice commit', (t) => {
  const { work } = scratchRepos(t);
  const trailers = ['Reviewed-by: pilot:typescript-reviewer: approve', 'Reviewed-by: pilot:security-reviewer: approve'];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, push: false, trailers });

  assert.equal(result.ok, true, result.line);
  const body = git(work, 'log', '--first-parent', '-1', '--format=%b');
  for (const trailer of trailers) assert.ok(body.includes(trailer), `${trailer} in\n${body}`);
});

test('a slice no row names is refused', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/demo-s9', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/demo-s9: no run record row names it; nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
});

test('no PR is read', (t) => {
  const { work } = scratchRepos(t);
  const { gh, calls } = recordingGh();

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh, push: false });

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
  for (const [bad, key] of cases) {
    const { origin, work } = scratchRepos(t);
    const before = git(work, 'rev-parse', 'HEAD');
    const trailers = ['Reviewed-by: pilot:typescript-reviewer: approve', bad];

    const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, trailers });

    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.line, `NOT integrated slice/demo-s1: trailer ${key} is not one "Key: value" line; nothing merged or pushed`);
    assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
    assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
  }
});

test('a slice whose Reviewers line names security integrates only with its Reviewed-by trailer', (t) => {
  const { origin, work } = scratchRepos(t);
  const file = path.join(work, 'docs', 'design', 'demo', 'slices', 'S1.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '# S1 One thing\n\nReviewers: `pilot:typescript-reviewer`, `pilot:security-reviewer`\n');
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'slice file');
  git(work, 'push', '-q', 'origin', 'feat/demo');
  const before = git(work, 'rev-parse', 'HEAD');
  const typescript = 'Reviewed-by: pilot:typescript-reviewer: approve';

  const refused = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, trailers: [typescript] });

  assert.equal(refused.ok, false);
  assert.equal(refused.line, 'NOT integrated slice/demo-s1: S1 names pilot:security-reviewer and no --trailer "Reviewed-by: pilot:security-reviewer: <verdict>"; nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');

  const blocked = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, trailers: [typescript, 'Reviewed-by: pilot:security-reviewer: Block, two HIGH'] });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.line, "NOT integrated slice/demo-s1: S1: pilot:security-reviewer's verdict is block; nothing merged or pushed");
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');

  const trailers = [typescript, 'Reviewed-by: pilot:security-reviewer: approve'];
  const passed = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, push: false, trailers });

  assert.equal(passed.ok, true, passed.line);
  assert.equal(git(work, 'log', '--first-parent', '-1', '--format=%s'), 'feat(demo): S1 one thing');
});

/** Commits `docs/design/demo/slices/S1.md` holding `text` on `feat/demo` and pushes it; answers the tip. */
function sliceFile(work, text) {
  const file = path.join(work, 'docs', 'design', 'demo', 'slices', 'S1.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'slice file');
  git(work, 'push', '-q', 'origin', 'feat/demo');
  return git(work, 'rev-parse', 'HEAD');
}

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

test('every behaviour evidenced integrates', (t) => {
  const { work } = scratchRepos(t);
  sliceFile(work, BEHAVIOURS);
  const trailers = [
    'Reviewed-by: pilot:typescript-reviewer: approve',
    'Evidence: B1 test: lookup red before, green after',
    'Evidence: B2 look: the list showed three words',
  ];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, push: false, trailers });

  assert.equal(result.ok, true, result.line);
  const body = git(work, 'log', '--first-parent', '-1', '--format=%b');
  for (const trailer of trailers.slice(1)) assert.ok(body.includes(trailer), `${trailer} in\n${body}`);
});

test('a missing behaviour refuses', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = sliceFile(work, BEHAVIOURS);
  const cases = [
    ['Evidence: B1 test: lookup red before, green after'],
    // Two trailers for B1 are not evidence for B2: the count alone is not the check.
    ['Evidence: B1 test: lookup red before, green after', 'Evidence: B1 test: and again'],
    // Evidence of another kind is not B2's.
    ['Evidence: B1 test: lookup red before, green after', 'Evidence: B2 test: a unit test of the list'],
    // A trailer that says nothing was seen is not evidence.
    ['Evidence: B1 test: lookup red before, green after', 'Evidence: B2 look:  '],
  ];
  for (const evidence of cases) {
    const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, trailers: ['Reviewed-by: pilot:typescript-reviewer: approve', ...evidence] });

    assert.equal(result.ok, false, JSON.stringify(evidence));
    assert.equal(result.line, 'NOT integrated slice/demo-s1: S1: B2 has no --trailer "Evidence: B2 look: <what was seen>"; nothing merged or pushed');
    assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
    assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
  }
});

test('an old-shape slice needs no evidence', (t) => {
  const { work } = scratchRepos(t);
  sliceFile(work, '# S1 One thing\n\nReviewers: `pilot:typescript-reviewer`\n\n## Tests\n\n1. `a known word returns its entry`: `lookup` → the entry\n');

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, push: false, trailers: ['Reviewed-by: pilot:typescript-reviewer: approve'] });

  assert.equal(result.ok, true, result.line);
  assert.doesNotMatch(git(work, 'log', '--first-parent', '-1', '--format=%b'), /^Evidence:/m);
});

test('the security refusal still holds', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = sliceFile(work, BEHAVIOURS.replace('`pilot:typescript-reviewer`', '`pilot:typescript-reviewer`, `pilot:security-reviewer`'));
  const trailers = [
    'Reviewed-by: pilot:typescript-reviewer: approve',
    'Evidence: B1 test: lookup red before, green after',
    'Evidence: B2 look: the list showed three words',
  ];

  const result = integrate('slice/demo-s1', { cwd: work, test: passing, install: () => {}, gh: recordingGh().gh, trailers });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/demo-s1: S1 names pilot:security-reviewer and no --trailer "Reviewed-by: pilot:security-reviewer: <verdict>"; nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/demo'), before, 'nothing pushed');
});

test('the subject lower-cases the title\'s first letter', () => {
  assert.equal(sliceSubject('demo', { slice: 'S2 The x', branch: 'slice/demo-s2' }), 'feat(demo): S2 the x');
});
