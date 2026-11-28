/**
 * S1 of pilot-develop-line: a landing leaves a labelled release PR (spec 1; L3, L4, A4).
 * `releaseNotes` reads the first-parent `Merge feat/<slug> into pilot` commits in main..pilot
 * from git; `releasePr` labels the one open pilot → main PR and rewrites its title and body, or
 * opens it labelled. Real git repositories; `gh` is always faked.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { buildRepos, repos, passing, fakeGh, git, land as landFeature } from './lib/land-repos.mjs';
import { seed } from './lib/seed.mjs';

import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { releaseNotes, releasePr } = await import('../release.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const PILOT = 'refs/remotes/origin/pilot';
const MAIN = 'refs/remotes/origin/main';
const called = (calls, ...verb) => calls.filter((args) => verb.every((word, i) => args[i] === word));

/**
 * A seeded bare repository (test-body-git S11): main holds `shared.txt`, and pilot, cut from main, one
 * `Merge feat/<slug> into pilot` per `[slug, files]`, each feature cut from main with `files` as its one
 * commit; `after` is laid on last. One init and one fast-import per key, where porcelain spent five git a landing.
 */
function seeded(t, key, features, after = []) {
  return gitFixture(t, key, (dir) => {
    const history = [{ branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' }];
    features.forEach(([slug, files], i) => history.push(
      { branch: `feat/${slug}`, from: 'main', files, message: `feat ${slug}` },
      { branch: 'pilot', ...(i === 0 && { from: 'main' }), files: {}, merge: [`feat/${slug}`], message: `Merge feat/${slug} into pilot` },
    ));
    return seed(dir, [...history, ...after], features.length ? {} : { pilot: 'main' }).origin;
  });
}

/** One repository whose pilot holds a landing merge per slug, each feature cut from main. */
const landed = (t, key, slugs, after) => seeded(t, `release:landed:${key}`, slugs.map((slug) => [slug, { [`${slug}.txt`]: `${slug}\n` }]), after);

test('two landings name both slugs', (t) => {
  const { gitIn, a, b } = repos(t, 'a', 'b');
  land(a, gitIn);
  land(b, gitIn);

  const notes = releaseNotes({ git: gitIn(b), name: 'pilot', pilotRef: PILOT, mainRef: MAIN, prs: [{ number: 7, head: 'feat/a' }] });

  assert.equal(notes.title, 'Release: a, b');
  assert.deepEqual(notes.rows.map(({ slug, pr }) => ({ slug, pr })), [{ slug: 'a', pr: 7 }, { slug: 'b', pr: null }]);
  assert.match(notes.rows[1].sha, /^[0-9a-f]{40}$/);
  assert.equal(git(b, 'log', '-1', '--format=%s', notes.rows[1].sha), 'Merge feat/b into pilot');
  assert.ok(notes.body.startsWith('## Overview\n\n- a\n- b\n\n| Feature | PR | Landing |'), notes.body);
  assert.match(notes.body, /\| a \| #7 \|/);
  assert.match(notes.body, new RegExp(`\\| b \\| – \\| ${notes.rows[1].sha} \\|`));
});

test('a sync merge is no row', (t) => {
  // Main moves after a's landing, and pilot merges it: seeded with the history, not run in the body.
  const repo = landed(t, 'synced', ['a'], [
    { branch: 'main', files: { 'main.txt': 'moved\n' }, message: 'main moved' },
    { branch: 'pilot', files: {}, merge: ['main'], message: 'Merge main into pilot' },
  ]);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main~1', prs: [] });

  assert.deepEqual(notes.rows.map((row) => row.slug), ['a']);
  assert.equal(notes.title, 'Release: a');
});

test('the title is bounded', (t) => {
  const slugs = Array.from({ length: 30 }, (_, i) => `feature-number-${i}`);
  const repo = landed(t, 'bounded', slugs);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [] });

  assert.equal(notes.rows.length, 30);
  assert.ok(notes.title.length <= 120, notes.title);
  assert.match(notes.title, /^Release: feature-number-0, feature-number-1, .* \+\d+ more$/);
  const named = notes.title.slice('Release: '.length).replace(/ \+\d+ more$/, '').split(', ').length;
  assert.equal(Number(/\+(\d+) more$/.exec(notes.title)[1]), 30 - named);
});

/** An artefact whose overview's What changes line is `what`. */
const artefact = (what) => `# x\n\n## Overview\n\n- **What changes**: ${what}\n- **Why**: because.\n\n## 1. Problem\n\nText.\n`;

/** One repository whose pilot holds a landing per `[slug, artefact | null]`, each feature committing its artefact when it has one. */
const landedWith = (t, key, features) => seeded(t, `release:overview:${key}`, features.map(([slug, markdown]) =>
  [slug, markdown === null ? { [`${slug}.txt`]: `${slug}\n` } : { [`docs/design/${slug}/architecture.md`]: markdown }]));

const shaOf = (repo, slug) => git(repo, 'log', '-1', '--format=%H', '--grep', `^Merge feat/${slug} into pilot$`, 'pilot').trim();

test('one line per landed feature', (t) => {
  const repo = landedWith(t, 'two', [['first', artefact('the deck shows a clock. It ticks.')], ['second', artefact('logs are shorter')]]);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [] });

  const [overview] = notes.body.split('\n\n| Feature |');
  assert.equal(overview, '## Overview\n\n- first: the deck shows a clock.\n- second: logs are shorter');
});

test('a mention in a sentence is written so nobody is notified', (t) => {
  const repo = landedWith(t, 'mention', [['first', artefact('thanks to @someone for the clock.')]]);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [] });

  assert.ok(notes.body.startsWith(`## Overview\n\n- first: thanks to @${String.fromCharCode(0x200d)}someone for the clock.\n\n| Feature |`), notes.body);
});

test('the table is unchanged', (t) => {
  const repo = landedWith(t, 'table', [['first', artefact('one thing.')], ['second', artefact('another thing.')]]);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [{ number: 7, head: 'feat/first' }] });

  const at = notes.body.indexOf('\n\n| Feature |');
  assert.ok(at > 0, notes.body);
  assert.equal(
    notes.body.slice(at + 2),
    `| Feature | PR | Landing |\n| --- | --- | --- |\n| first | #7 | ${shaOf(repo, 'first')} |\n| second | – | ${shaOf(repo, 'second')} |`,
  );
});

test('a feature with no overview', (t) => {
  const repo = landedWith(t, 'bare', [['missing', null], ['plain', '# plain\n\n## 1. Problem\n\nNo overview here.\n'], ['told', artefact('it works.')]]);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [] });

  assert.ok(notes.body.startsWith('## Overview\n\n- missing\n- plain\n- told: it works.\n\n| Feature |'), notes.body);
});

test('a git that fails on one artefact costs only its sentence', (t) => {
  const repo = landedWith(t, 'shaky', [['unread', artefact('never seen.')], ['told', artefact('it works.')]]);
  const failing = (args) => {
    if (args[0] === 'show' && String(args[1]).endsWith(':docs/design/unread/architecture.md')) throw new Error('fatal: bad object');
    return git(repo, ...args);
  };

  const notes = releaseNotes({ git: failing, name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [] });

  assert.ok(notes.body.startsWith('## Overview\n\n- unread\n- told: it works.\n\n| Feature |'), notes.body);
});

test("no landing, today's text", (t) => {
  const repo = landedWith(t, 'none', []);

  const notes = releaseNotes({ git: (args) => git(repo, ...args), name: 'pilot', pilotRef: 'pilot', mainRef: 'main', prs: [] });

  assert.equal(notes.body, 'No feature landed on pilot since main.');
  assert.deepEqual(notes.rows, []);
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
  assert.equal(edits[0][edits[0].indexOf('--add-label') + 1], 'release');
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

/** `repos(t, 'a')` with a already landed once on pilot, as three releasePr tests start: the landing runs once per file (test-body-git S11). */
const aLanded = (t) => gitFixture(t, 'release:a-landed', (dir) => {
  const built = buildRepos(dir, ['a']);
  land(built.a, built.gitIn);
  return built;
});

test('the main PR opens labelled', (t) => {
  const { gitIn, a } = aLanded(t);
  const { gh, calls } = fakeGh([], undefined, { created: 904 });

  const release = releasePr({ git: gitIn(a), host: githubHost(inlined(gh)) });

  assert.deepEqual(release, { number: 904, opened: true });
  const creates = called(calls, 'pr', 'create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0][creates[0].indexOf('--label') + 1], 'release');
  assert.match(creates[0][creates[0].indexOf('--body') + 1], /^## Overview\n\n- a\n\n\| Feature \| PR \| Landing \|\n/);
  assert.ok(calls.findIndex((args) => args[0] === 'label') < calls.findIndex((args) => args[0] === 'pr' && args[1] === 'create'));
});

test('none hands it to the user', (t) => {
  const { gitIn, a } = aLanded(t);

  assert.deepEqual(releasePr({ git: gitIn(a), host: null }), { number: null, opened: false, byHand: 'pilot' });
  assert.deepEqual(releasePr({ git: gitIn(a), host: null, already: true }), { number: null, opened: false, byHand: 'pilot' });
});

test('a failed label still opens', (t) => {
  const { gitIn, a } = aLanded(t);
  const { gh: answer, calls } = fakeGh([], undefined, { created: 903 });
  const gh = (args) => {
    if (args[0] === 'label') {
      calls.push(args);
      throw new Error('HTTP 403: Resource not accessible by integration');
    }
    return answer(args);
  };

  const release = releasePr({ git: gitIn(a), host: githubHost(inlined(gh)) });

  // The adapter drops a label it cannot make (deck/host-github.mjs `labelled`) and hands back why.
  assert.deepEqual(release, { number: 903, opened: true, labelWhy: 'HTTP 403: Resource not accessible by integration' });
  const creates = called(calls, 'pr', 'create');
  assert.equal(creates.length, 1);
  assert.ok(!creates[0].includes('--label'), 'no label it could not make');
});

test('a fork run remote opens none', (t) => {
  const { gitIn, a } = repos(t, 'a');
  git(a, 'remote', 'add', 'fork', git(a, 'remote', 'get-url', 'origin'));
  git(a, 'config', 'pilot.remote', 'fork');
  const { gh, calls } = fakeGh();

  const release = releasePr({ git: gitIn(a), host: githubHost(gh) });

  assert.equal(release.number, null);
  assert.equal(release.byHand, 'fork/pilot');
  assert.equal(calls.length, 0);
});

/** `gh` with each `--body-file <f>` read at the call into `--body <text>`, since the adapter removes the file after. */
function inlined(gh) {
  return (args) => {
    const at = args.indexOf('--body-file');
    return gh(at < 0 ? args : [...args.slice(0, at), '--body', fs.readFileSync(args[at + 1], 'utf8'), ...args.slice(at + 2)]);
  };
}

/** `pilot land` in `repo`, with `gh` faked (a feature PR on pilot by default). */
function land(repo, gitIn, gh = fakeGh([{ number: 7, headRefName: 'feat/' + repo.split(/[\\/]/).pop(), baseRefName: 'pilot' }]).gh) {
  return landFeature({ cwd: repo, git: gitIn(repo), host: githubHost(inlined(gh)), test: passing });
}
