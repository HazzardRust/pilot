/**
 * S3 of user-pilot-branch: `pilot land` and the release PR name the user's pilot branch (spec 1, 3; L5, L8).
 * The suite pins `PILOT_BRANCH=pilot` (L7), so this file unsets it before anything reads it; every name here is
 * `hazzardrust-pilot`, never the legacy one, so a fallback to `pilot` reads red.
 */

delete process.env.PILOT_BRANCH;

const { repos, passing, fakeGh, merges, mainSays, git } = await import('./lib/land-repos.mjs');
const { gitFixture } = await import('./lib/git-fixture.mjs');
const { seed } = await import('./lib/seed.mjs');

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

const { retarget, mainLine } = await import('../land.mjs');
const { releaseNotes, releasePr } = await import('../release.mjs');
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

test('a landing with no pilot branch name, signed out, is refused and writes nothing', (t) => {
  const { origin, x } = repos(t, 'x');
  const refsBefore = git(origin, 'for-each-ref');
  const { host, calls } = fakeGh(); // `gh api user` is not answered: signed out

  const { code, out } = mainSays([], { cwd: x, git: (args) => git(x, ...args), host, test: passing, wait: 0 });

  assert.equal(code, 1, out);
  assert.match(out, /no pilot branch name.*; nothing pushed/);
  assert.equal(git(origin, 'for-each-ref'), refsBefore, 'no ref written on origin');
  assert.throws(() => git(x, 'config', '--get', 'pilot.branch'), 'no name stored');
  assert.deepEqual(calls.filter((args) => args[0] === 'pr'), [], 'no PR touched');
});

test('a landed PR moves to the user\'s branch', () => {
  const { host, calls } = fakeGh([{ number: 12, headRefName: 'feat/m', baseRefName: 'feat/n', state: 'OPEN' }]);

  const lines = retarget({ host, head: 'feat/n', name: NAME });

  assert.deepEqual(calls.at(-1).slice(0, 5), ['pr', 'edit', '12', '--base', NAME]);
  assert.deepEqual(lines, [`retargeted #12 to ${NAME}`]);
});

test('release notes see pre-move landings', (t) => {
  const repo = gitFixture(t, 'land-user-branch:notes', (dir) => {
    // The notes read refs/heads only, so the seeded bare repository stands in for the porcelain-built one.
    const history = [{ branch: 'main', files: { 'base.txt': 'base\n' }, message: 'main' }];
    for (const [slug, onto] of [['a', 'pilot'], ['b', NAME], ['c', 'other-pilot']]) {
      history.push(
        { branch: `feat/${slug}`, from: slug === 'a' ? 'main' : NAME, files: { [`${slug}.txt`]: `${slug}\n` }, message: `feat ${slug}` },
        { branch: NAME, ...(slug === 'a' && { from: 'main' }), files: {}, merge: [`feat/${slug}`], message: `Merge feat/${slug} into ${onto}` },
      );
    }
    return seed(dir, history).origin;
  });

  const { rows } = releaseNotes({ git: (args) => git(repo, ...args), name: NAME, pilotRef: `refs/heads/${NAME}`, mainRef: 'refs/heads/main', prs: [] });

  assert.deepEqual(rows.map((row) => row.slug), ['a', 'b'], 'a landing onto the legacy pilot and onto the user\'s branch; another user\'s is not one');
});

test('a pre-move landing keeps its PR in the release notes', () => {
  // origin is the run remote with main its HEAD; main..the user's branch holds one landing from before the move.
  const git = (args) => {
    const key = args.join(' ');
    if (key === 'config --get pilot.remote') throw Object.assign(new Error('unset'), { status: 1 });
    if (key === 'remote') return 'origin';
    if (key === 'ls-remote --symref origin HEAD') return 'ref: refs/heads/main\tHEAD\n';
    if (args[0] === 'log') return `${'a'.repeat(40)}\t${'b'.repeat(40)} ${'c'.repeat(40)}\tMerge feat/a into pilot`;
    throw new Error(`unexpected git ${key}`);
  };
  const { host, calls } = fakeGh([{ number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'MERGED' }]);

  const main = releasePr({ git, host, name: NAME });

  const create = calls.find((args) => args[0] === 'pr' && args[1] === 'create');
  assert.ok(create, JSON.stringify(main));
  assert.equal(create[create.indexOf('--head') + 1], NAME);
  assert.match(create[create.indexOf('--body') + 1], /^\| a \| #7 \| a{40} \|$/m, 'the feature PR merged into the legacy pilot is found');
});

test('the closing report names the branch', () => {
  const line = mainLine({ number: null, opened: false, byHand: NAME, host: fakeGh().host });

  const [first] = stepsOf({}, { landing: { state: 'landed', sha: '1a2b3c4', line } }, []).map((step) => step.text);

  assert.equal(first, `Push ${NAME}, then open a PR from ${NAME} to main by hand, and merge it with a merge commit.`);
});
