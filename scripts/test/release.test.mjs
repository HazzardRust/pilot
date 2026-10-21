/**
 * S1 of pilot-develop-line: a landing leaves a labelled release PR (spec 1; L3, L4, A4).
 * `releaseNotes` reads the first-parent `Merge feat/<slug> into pilot` commits in main..pilot
 * from git; `releasePr` labels the one open pilot → main PR and rewrites its title and body, or
 * opens it labelled. Real git repositories; `gh` is always faked.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { repos, passing, fakeGh, git, commitFile, land as landFeature } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { releaseNotes, releasePr } = await import('../release.mjs');

const PILOT = 'refs/remotes/origin/pilot';
const MAIN = 'refs/remotes/origin/main';
const called = (calls, ...verb) => calls.filter((args) => verb.every((word, i) => args[i] === word));

/** One repository whose pilot holds a landing merge per slug, each feature cut from main. */
function landed(t, slugs) {
  return gitFixture(t, `release:landed:${slugs.length}`, (dir) => {
    git(dir, 'init', '-q', '-b', 'main');
    commitFile(dir, 'shared.txt', 'one\n', 'main');
    git(dir, 'branch', 'pilot');
    for (const slug of slugs) {
      git(dir, 'checkout', '-q', '-b', `feat/${slug}`, 'main');
      commitFile(dir, `${slug}.txt`, `${slug}\n`, `feat ${slug}`);
      git(dir, 'checkout', '-q', 'pilot');
      git(dir, 'merge', '-q', '--no-ff', '-m', `Merge feat/${slug} into pilot`, `feat/${slug}`);
    }
    return dir;
  });
}

test('two landings name both slugs', (t) => {
  const { gitIn, a, b } = repos(t, 'a', 'b');
  land(a, gitIn);
  land(b, gitIn);

  const notes = releaseNotes({ git: gitIn(b), pilotRef: PILOT, mainRef: MAIN, prs: [{ number: 7, headRefName: 'feat/a' }] });

  assert.equal(notes.title, 'Release: a, b');
  assert.deepEqual(notes.rows.map(({ slug, pr }) => ({ slug, pr })), [{ slug: 'a', pr: 7 }, { slug: 'b', pr: null }]);
  assert.match(notes.rows[1].sha, /^[0-9a-f]{40}$/);
  assert.equal(git(b, 'log', '-1', '--format=%s', notes.rows[1].sha), 'Merge feat/b into pilot');
  assert.match(notes.body, /\| a \| #7 \|/);
  assert.match(notes.body, new RegExp(`\\| b \\| – \\| ${notes.rows[1].sha} \\|`));
});

test('a sync merge is no row', (t) => {
  const repo = landed(t, ['a']);
  git(repo, 'checkout', '-q', 'main');
  commitFile(repo, 'main.txt', 'moved\n', 'main moved');
  git(repo, 'checkout', '-q', 'pilot');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'Merge main into pilot', 'main');

  const notes = releaseNotes({ git: (args) => git(repo, ...args), pilotRef: 'pilot', mainRef: 'main~1', prs: [] });

  assert.deepEqual(notes.rows.map((row) => row.slug), ['a']);
  assert.equal(notes.title, 'Release: a');
});

test('the title is bounded', (t) => {
  const slugs = Array.from({ length: 30 }, (_, i) => `feature-number-${i}`);
  const repo = landed(t, slugs);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), pilotRef: 'pilot', mainRef: 'main', prs: [] });

  assert.equal(notes.rows.length, 30);
  assert.ok(notes.title.length <= 120, notes.title);
  assert.match(notes.title, /^Release: feature-number-0, feature-number-1, .* \+\d+ more$/);
  const named = notes.title.slice('Release: '.length).replace(/ \+\d+ more$/, '').split(', ').length;
  assert.equal(Number(/\+(\d+) more$/.exec(notes.title)[1]), 30 - named);
});

test('every landing rewrites and labels', (t) => {
  const { gitIn, a } = repos(t, 'a');
  const { gh, calls } = fakeGh([{ number: 901, headRefName: 'pilot', state: 'OPEN' }, { number: 7, headRefName: 'feat/a', baseRefName: 'pilot' }]);

  const result = land(a, gitIn, gh);

  assert.deepEqual(result.main, { number: 901, opened: false });
  assert.equal(called(calls, 'pr', 'create').length, 0);
  const edits = called(calls, 'pr', 'edit');
  assert.equal(edits.length, 1);
  assert.deepEqual(edits[0].slice(0, 5), ['pr', 'edit', '901', '--title', 'Release: a']);
  assert.ok(edits[0].includes('--body'));
  assert.match(edits[0][edits[0].indexOf('--body') + 1], new RegExp(`\\| a \\| #7 \\| ${result.sha} \\|`));
  assert.deepEqual(edits[0].slice(-2), ['--add-label', 'release']);
});

test('the first landing opens it labelled', (t) => {
  const { gitIn, a } = repos(t, 'a');
  const { gh, calls } = fakeGh([], undefined, { created: 902 });

  const result = land(a, gitIn, gh);

  assert.deepEqual(result.main, { number: 902, opened: true });
  assert.deepEqual(called(calls, 'label'), [['label', 'create', 'release', '--force']]);
  const creates = called(calls, 'pr', 'create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0][creates[0].indexOf('--title') + 1], 'Release: a');
  assert.equal(creates[0][creates[0].indexOf('--label') + 1], 'release');
  assert.ok(calls.findIndex((args) => args[0] === 'label') < calls.findIndex((args) => args[1] === 'create' && args[0] === 'pr'));
});

test('a label gh refuses still leaves the release PR, with why', (t) => {
  const { gitIn, a } = repos(t, 'a');
  land(a, gitIn);
  const { gh: answer, calls } = fakeGh([], undefined, { created: 903 });
  const gh = (args) => {
    if (args[0] === 'label') {
      calls.push(args);
      throw new Error('HTTP 403: Resource not accessible by integration');
    }
    return answer(args);
  };

  const release = releasePr({ git: gitIn(a), gh });

  assert.equal(release.number, 903);
  assert.equal(release.opened, true);
  assert.equal(release.why, 'gh label create failed: HTTP 403: Resource not accessible by integration');
  const creates = called(calls, 'pr', 'create');
  assert.equal(creates.length, 1);
  assert.ok(!creates[0].includes('--label'), 'no label it could not make');
});

test('a fork run remote opens none', (t) => {
  const { gitIn, a } = repos(t, 'a');
  git(a, 'remote', 'add', 'fork', git(a, 'remote', 'get-url', 'origin'));
  git(a, 'config', 'pilot.remote', 'fork');
  const { gh, calls } = fakeGh();

  const release = releasePr({ git: gitIn(a), gh });

  assert.equal(release.number, null);
  assert.equal(release.byHand, 'fork/pilot');
  assert.equal(calls.length, 0);
});

/** `pilot land` in `repo`, with `gh` faked (a feature PR on pilot by default). */
function land(repo, gitIn, gh = fakeGh([{ number: 7, headRefName: 'feat/' + repo.split(/[\\/]/).pop(), baseRefName: 'pilot' }]).gh) {
  return landFeature({ cwd: repo, git: gitIn(repo), gh, test: passing });
}
