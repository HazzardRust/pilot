/**
 * S3 of user-pilot-branch: `pilot land` and the release PR name the user's pilot branch (spec 1, 3; L5, L8).
 * The suite pins `PILOT_BRANCH=pilot` (L7), so this file unsets it before anything reads it; every name here is
 * `hazzardrust-pilot`, never the legacy one, so a fallback to `pilot` reads red.
 */

delete process.env.PILOT_BRANCH;

const { repos, passing, fakeGh, merges, mainSays, git, commitFile } = await import('./lib/land-repos.mjs');
const { gitFixture } = await import('./lib/git-fixture.mjs');

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

const { retarget, mainLine } = await import('../land.mjs');
const { releaseNotes } = await import('../release.mjs');
const { stepsOf } = await import('../../deck/closing-report.mjs');

const NAME = 'hazzardrust-pilot';

test('a landing pushes the user\'s branch', (t) => {
  const { origin, x } = repos(t, 'x');
  // The user's branch beside the legacy one, both at main's tip; the clone names it in its own config.
  git(origin, 'branch', NAME, 'main');
  git(x, 'fetch', '-q', 'origin');
  git(x, 'config', '--local', 'pilot.branch', NAME);
  const legacyBefore = git(origin, 'rev-parse', 'pilot');
  const { host, calls } = fakeGh();

  const { code, out } = mainSays([], { cwd: x, git: (args) => git(x, ...args), host, test: passing, wait: 0 });

  assert.equal(code, 0, out);
  assert.match(out, new RegExp(`^landed feat/x on ${NAME} at [0-9a-f]{7}$`, 'm'));
  assert.ok(merges(origin, NAME)[0].startsWith(`Merge feat/x into ${NAME} `), merges(origin, NAME)[0]);
  assert.equal(git(origin, 'rev-parse', 'pilot'), legacyBefore, 'the legacy pilot is not written');
  const create = calls.find((args) => args[0] === 'pr' && args[1] === 'create');
  assert.equal(create[create.indexOf('--head') + 1], NAME, 'the release PR is opened from the user\'s branch');
});

test('a landed PR moves to the user\'s branch', () => {
  const { host, calls } = fakeGh([{ number: 12, headRefName: 'feat/m', baseRefName: 'feat/n', state: 'OPEN' }]);

  const lines = retarget({ host, head: 'feat/n', name: NAME });

  assert.deepEqual(calls.at(-1).slice(0, 5), ['pr', 'edit', '12', '--base', NAME]);
  assert.deepEqual(lines, [`retargeted #12 to ${NAME}`]);
});

test('release notes see pre-move landings', (t) => {
  const repo = gitFixture(t, 'land-user-branch:notes', (dir) => {
    git(dir, 'init', '-q', '-b', 'main');
    commitFile(dir, 'base.txt', 'base\n', 'main');
    git(dir, 'branch', NAME);
    for (const [slug, onto] of [['a', 'pilot'], ['b', NAME], ['c', 'other-pilot']]) {
      git(dir, 'checkout', '-q', '-b', `feat/${slug}`, NAME);
      commitFile(dir, `${slug}.txt`, `${slug}\n`, `feat ${slug}`);
      git(dir, 'checkout', '-q', NAME);
      git(dir, 'merge', '-q', '--no-ff', '-m', `Merge feat/${slug} into ${onto}`, `feat/${slug}`);
    }
    return dir;
  });

  const { rows } = releaseNotes({ git: (args) => git(repo, ...args), pilotRef: `refs/heads/${NAME}`, mainRef: 'refs/heads/main', prs: [] });

  assert.deepEqual(rows.map((row) => row.slug), ['a', 'b'], 'a landing onto the legacy pilot and onto the user\'s branch; another user\'s is not one');
});

test('the closing report names the branch', () => {
  const line = mainLine({ number: null, opened: false, byHand: NAME, host: fakeGh().host });

  const [first] = stepsOf({}, { landing: { state: 'landed', sha: '1a2b3c4', line } }, []).map((step) => step.text);

  assert.equal(first, `Push ${NAME}, then open a PR from ${NAME} to main by hand, and merge it with a merge commit.`);
});
