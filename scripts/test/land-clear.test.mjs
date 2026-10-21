/**
 * A landing clears its run's worktrees as its last step (clean-landing spec 7, 8; L5, L6,
 * L10): the merged-clean ones go with their local branches, except the feature's and QA's, which
 * stay as `kept concluding` (landing-keeps-worktrees S1);
 * anything else of the run is kept and named; another run's worktrees and every remote
 * branch stay; nothing here changes the landing's exit code. Every case runs against a
 * scratch bare origin and its clone, with `gh` faked.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { main } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const gitIn = (repo) => (args) => git(repo, ...args);
const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
// The feature's own PR is open, so the landing comments on it; none is another feature's.
// The feature PR #7 GitHub read merged; no main PR yet, so the landing opens #900.
const gh = (args) => {
  if (args[1] === 'create') return 'https://github.com/o/r/pull/900\n';
  if (args[1] !== 'list') return '';
  return args.includes('pilot') ? '[]' : '[{"number":7,"state":"MERGED","baseRefName":"pilot","isCrossRepository":false}]';
};

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/**
 * A bare origin with main and pilot; a main checkout on main; and run `s` cut as a run is:
 * `design/s` from origin/pilot, `feat/s` from origin/design/s tracking origin/feat/s, and
 * `slice/s-s1` from origin/feat/s, merged into the feature and pushed. `other` is another
 * run's worktree on the feature's tip, so it is merged-clean once the feature lands.
 */
function run(t) {
  return gitFixture(t, 'land-clear:run', buildRun);
}

function buildRun(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'config', 'pilot.test', passing);
  git(work, 'checkout', '-q', '-b', 'main');
  commitFile(work, 'shared.txt', 'one\n', 'main');
  git(work, 'push', '-q', 'origin', 'main', 'main:pilot');

  const dir = (name) => path.join(root, name);
  git(work, 'worktree', 'add', '-q', '-b', 'design/s', dir('design'), 'origin/pilot');
  commitFile(dir('design'), 'design.md', 'design\n', 'design s');
  git(dir('design'), 'push', '-q', '-u', 'origin', 'design/s');

  git(work, 'worktree', 'add', '-q', '-b', 'feat/s', dir('feat'), 'origin/design/s');
  git(dir('feat'), 'push', '-q', '-u', 'origin', 'feat/s');

  // QA's worktree (pilot-qa.md), cut from the feature and brought to its tip as QA is.
  git(work, 'worktree', 'add', '-q', '-b', 'qa/s', dir('qa'), 'origin/feat/s');
  git(work, 'worktree', 'add', '-q', '-b', 'slice/s-s1', dir('slice'), 'origin/feat/s');
  commitFile(dir('slice'), 's1.mjs', 'export const s1 = 1;\n', 'slice s1');
  git(dir('slice'), 'push', '-q', '-u', 'origin', 'slice/s-s1');
  git(dir('feat'), 'merge', '-q', '--no-ff', '-m', 'merge s1', 'slice/s-s1');
  git(dir('feat'), 'push', '-q', 'origin', 'feat/s');
  git(dir('qa'), 'merge', '-q', '--ff-only', 'origin/feat/s');

  git(work, 'worktree', 'add', '-q', '-b', 'slice/other-s1', dir('other'), 'origin/design/s');
  git(dir('other'), 'merge', '-q', '--ff-only', 'origin/feat/s');

  // Paths as git writes them, which is how the landing names them.
  const listed = () => git(work, 'worktree', 'list', '--porcelain').split('\n')
    .filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));
  const as = Object.fromEntries(listed().map((p) => [path.basename(p), p]));
  return { origin, work, dir, listed, as };
}

/** `main`'s stdout and exit code, run as the CLI is: from inside the feature worktree. */
function landFrom(feat, withGh = gh, withGit = gitIn(feat), extra = {}) {
  const out = [];
  const [write, before] = [process.stdout.write, process.cwd()];
  process.stdout.write = (text) => out.push(String(text));
  process.chdir(feat);
  try {
    return { code: main([], { cwd: feat, git: withGit, gh: withGh, ...extra }), out: out.join('') };
  } finally {
    process.stdout.write = write;
    process.chdir(before);
  }
}

const branches = (work) => git(work, 'branch', '--format=%(refname:short)').split('\n').sort();

test('a landing keeps its qa and feat worktrees', (t) => {
  const { origin, work, dir, listed, as } = run(t);

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  const [cleared, landed] = said.out.split('landed feat/s on pilot at ');
  // The branch lines (S8 of pilot-fork) go first too: design/s and slice/s-s1, with no PR, are merged into feat/s, so they go.
  assert.deepEqual(cleared.split('\n').filter(Boolean).sort(), [
    'deleted: design/s, slice/s-s1',
    `removed ${as.design}`,
    `removed ${as.slice}`,
    `kept concluding ${as.feat}`,
    `kept concluding ${as.qa}`,
  ].sort(), 'the branch and clear lines come first');
  assert.match(landed, /^[0-9a-f]{7}\nmain gets pilot: #900 \(opened\)\n$/);
  assert.ok(fs.existsSync(dir('feat')) && fs.existsSync(dir('qa')), 'both directories exist');
  assert.deepEqual(listed().map((p) => path.basename(p)).sort(), ['feat', 'other', 'qa', 'work'], "the slice and design worktrees are gone; another run's stays");
  assert.deepEqual(branches(work), ['feat/s', 'main', 'qa/s', 'slice/other-s1']);
  assert.doesNotMatch(said.out, /NOT removed/, 'the local design/s goes too, though its upstream is gone');
  assert.match(git(origin, 'rev-parse', 'feat/s'), /^[0-9a-f]{40}$/, 'origin keeps feat/s');
  assert.throws(() => git(origin, 'rev-parse', '--verify', '-q', 'refs/heads/slice/s-s1'), 'the merged slice branch is gone from origin');
});

test('a landing reads the process table once, and keeps a slice worktree a live deck holds', (t) => {
  const { dir, as } = run(t);
  // A deck leashed to session 4242 into the slice worktree (landing-keeps-worktrees S2, L4).
  const daemon = fileURLToPath(new URL('../../deck/daemon.mjs', import.meta.url)).replaceAll('\\', '/');
  const table = [
    { pid: 4242, ppid: 0, name: 'claude', command: 'claude', ageS: 1 },
    { pid: 5150, ppid: 4242, name: 'node', command: `node "${daemon}" --leash 4242 --leash-dir "${as.slice}"`, ageS: 1 },
  ];
  let reads = 0;
  const read = () => (reads += 1, table);
  const said = landFrom(dir('feat'), gh, undefined, { read, gc: (shared) => [`swept ${shared().length}`] });

  assert.equal(said.code, 0, said.out);
  const cleared = said.out.split('landed feat/s on pilot at ')[0].split('\n');
  assert.ok(cleared.includes(`kept live 5150 ${as.slice}`), said.out);
  assert.ok(cleared.includes('swept 2'), 'the sweep is handed the same table');
  assert.equal(reads, 1, 'one read for the clear and the sweep');
  assert.ok(fs.existsSync(dir('slice')));
});

test('a prune that throws is one line, and the landing still exits 0', (t) => {
  const { origin, dir, listed } = run(t);
  const before = listed();
  // Origin goes away once the merge is pushed, as the clear begins: prune's fetch fails.
  let lists = 0;
  const gone = `${origin}-gone`;
  t.after(() => fs.existsSync(gone) && fs.renameSync(gone, origin));
  const losing = (args) => {
    if (args[0] === 'worktree' && args[1] === 'list' && ++lists === 2) fs.renameSync(origin, gone);
    return git(dir('feat'), ...args);
  };

  const said = landFrom(dir('feat'), gh, losing);

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /^deleted: design\/s, slice\/s-s1\nNOT removed the worktrees of s: git fetch origin failed: .+\nlanded feat\/s on pilot at /);
  fs.renameSync(gone, origin);
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), git(origin, 'rev-parse', 'feat/s'), 'landed');
  assert.deepEqual(listed(), before, 'nothing removed');
});

test("with twelve long worktree lines the deck row's 300-character tail still holds the SHA", (t) => {
  const { origin, work, dir } = run(t);
  for (let n = 2; n <= 13; n += 1) {
    git(work, 'worktree', 'add', '-q', '-b', `slice/s-s${n}`, dir(`a-worktree-with-a-long-name-so-its-line-is-long-${n}`), 'origin/feat/s');
  }
  const why = 'x'.repeat(400);
  const refusing = (args) => {
    if (args[1] === 'create') throw Object.assign(new Error('gh pr create failed'), { stderr: why });
    return gh(args);
  };

  const said = landFrom(dir('feat'), refusing);

  assert.equal(said.code, 0, said.out);
  assert.equal(said.out.match(/^kept open /gm)?.length, 12, said.out);
  assert.ok(said.out.trimEnd().endsWith(`\nmain gets pilot: unknown (${`gh pr create failed: ${why}`.slice(0, 200)})`), 'the main line is last, bounded');
  assert.ok(said.out.slice(-300).includes(`at ${git(origin, 'rev-parse', 'pilot').slice(0, 7)}\n`), said.out.slice(-300));
});

test("the deck's run.json mirror does not stop the catch-up, and the feature worktree is kept", (t) => {
  const { work, dir, listed, as } = run(t);
  const record = path.join(dir('feat'), 'docs', 'design', 's', 'run.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, '{"slug":"s"}\n');
  git(dir('feat'), 'add', 'docs/design/s/run.json');
  git(dir('feat'), 'commit', '-q', '-m', 'chore(s): run record');
  git(dir('feat'), 'push', '-q', 'origin', 'feat/s');
  git(dir('qa'), 'merge', '-q', '--ff-only', 'origin/feat/s');
  commitFile(dir('qa'), 'qa.mjs', 'export const qa = 1;\n', 'qa fix');
  git(dir('qa'), 'push', '-q', 'origin', 'qa/s:feat/s');
  fs.writeFileSync(record, '{"slug":"s","next":"land"}\n');

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /^caught up 1 commits from origin\/feat\/s\n/);
  assert.ok(said.out.includes(`kept concluding ${as.feat}\n`), said.out);
  assert.ok(listed().includes(as.feat), 'the feature worktree stays');
  assert.ok(branches(work).includes('feat/s'));
});

test('a dirty slice worktree is kept and named', (t) => {
  const { work, dir, listed, as } = run(t);
  fs.writeFileSync(path.join(dir('slice'), 'stray.txt'), 'untracked\n');

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /\nmain gets pilot: #900 \(opened\)\n$/);
  assert.ok(said.out.includes(`\nkept merged-dirty ${as.slice}\n`), said.out);
  assert.ok(said.out.includes(`\nkept concluding ${as.feat}\n`), said.out);
  assert.ok(!said.out.includes(as.other), "another run's worktree is not the landing's to name");
  assert.deepEqual(listed().map((p) => path.basename(p)).sort(), ['feat', 'other', 'qa', 'slice', 'work']);
  assert.ok(fs.existsSync(path.join(dir('slice'), 'stray.txt')));
  assert.ok(branches(work).includes('slice/s-s1'));
});

test('under none the clear reads the local pilot the landing moved', (t) => {
  const { work, dir, as } = run(t);
  git(work, 'branch', '-q', '--no-track', 'pilot', 'origin/pilot');
  git(work, 'config', 'pilot.remote', 'none');

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.ok(said.out.includes(`kept concluding ${as.feat}\n`), said.out);
});

test('a slice integrate already deleted on its remote still goes locally', (t) => {
  const { origin, work, dir } = run(t);
  // As `pilot integrate` leaves it (pilot-fork spec 6): the slice's remote branch and its tracking ref gone.
  git(work, 'push', '-q', 'origin', '--delete', 'slice/s-s1');

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.doesNotMatch(said.out, /NOT removed/, said.out);
  assert.deepEqual(branches(work), ['feat/s', 'main', 'qa/s', 'slice/other-s1']);
  assert.throws(() => git(origin, 'rev-parse', '--verify', '-q', 'refs/heads/slice/s-s1'));
});

const slashes = (text) => text.split(path.sep).join('/');

/** A land dir as an earlier conflict leaves it: a worktree beside the main checkout holding a node_modules. */
function prepareLandDir(work) {
  const dir = path.join(path.dirname(work), `${path.basename(work)}-land-s`);
  // node_modules is ignored, as in a real repository, so the kept tree is clean and resumable.
  fs.appendFileSync(path.join(work, '.git', 'info', 'exclude'), 'node_modules\n');
  git(work, 'worktree', 'add', '-q', '--detach', dir, 'origin/pilot');
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'y.js'), 'export {};\n');
  return dir;
}

test('a landing leaves no land dir, node_modules and all', (t) => {
  const { work, dir } = run(t);
  const land = prepareLandDir(work);

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.ok(said.out.includes(`landed feat/s on pilot at `), said.out);
  assert.ok(!fs.existsSync(land), 'the land dir is gone');
});

test("an already-landed feature's prepared land dir goes too", (t) => {
  const { work, dir } = run(t);
  assert.equal(landFrom(dir('feat')).code, 0);
  const land = prepareLandDir(work);

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.ok(said.out.includes('already on pilot'), said.out);
  assert.ok(!fs.existsSync(land), 'the land dir is gone');
  assert.ok(slashes(said.out).includes(`removed ${slashes(land)}\n`), said.out);
});

test('a land dir that will not go is named', (t) => {
  const { work, dir } = run(t);
  assert.equal(landFrom(dir('feat')).code, 0);
  const land = prepareLandDir(work);

  const said = landFrom(dir('feat'), gh, undefined, { remove: () => false });

  assert.equal(said.code, 0, said.out);
  assert.ok(slashes(said.out).includes(`NOT removed ${slashes(land)}: `), said.out);
  assert.ok(fs.existsSync(land));
});

test('a plain directory at the land dir name is left alone and named', (t) => {
  const { work, dir } = run(t);
  assert.equal(landFrom(dir('feat')).code, 0);
  const land = path.join(path.dirname(work), `${path.basename(work)}-land-s`);
  fs.mkdirSync(land);
  fs.writeFileSync(path.join(land, 'mine.txt'), 'not git\n');

  const said = landFrom(dir('feat'));

  assert.equal(said.code, 0, said.out);
  assert.ok(slashes(said.out).includes(`NOT removed ${slashes(land)}: not a worktree of this repository`), said.out);
  assert.equal(fs.readFileSync(path.join(land, 'mine.txt'), 'utf8'), 'not git\n');
});
