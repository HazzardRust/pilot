/**
 * S8 of one-integration-line: `allocateAdr` renames the feature's placeholder ADR to the next
 * free number inside the landing merge (spec 5; L4, A4). Its citations follow in the files the
 * feature changed, and nowhere else; two placeholders refuse the landing. Every repository is a
 * scratch one built through `gitFixture`.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { allocateAdr } = await import('../adr-allocate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function write(repo, file, text) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
}

const adr = (title, superseded = '[]') => `---\nstatus: proposed\ndate: 2026-10-19\ntags: [x]\nsupersedes: []\nsuperseded_by: ${superseded}\npaths: []\n---\n# ${title}\n\nWe decided ${title}.\n`;

/**
 * A repository whose `main` (pilot here) holds ADR 0167 and an unchanged file naming `NNNN`,
 * and a merge of `feat` into it: the feature adds `docs/adr/NNNN-x.md` and a note citing it,
 * plus `extra` more placeholder files. Answers the repository, `since`, main before the merge, and
 * `merge`, the merge commit.
 */
function merged(t, extra = []) {
  return gitFixture(t, `adr-allocate:${extra}`, (dir) => {
    const feat = {
      'docs/adr/NNNN-x.md': adr('x'),
      'notes.md': 'See ADR NNNN, in docs/adr/NNNN-x.md.\n',
      'docs/design/x/brief.md': 'See ADR NNNN, in docs/adr/NNNN-x.md.\n',
      // A changed file that quotes the convention in a code span, as ADR-FORMAT.md and pilot-architect.md do.
      'skills/domain-modeling/ADR-FORMAT.md': 'Name a new ADR `NNNN-<slug>.md` and cite it `ADR NNNN`.\n',
      // A changed file outside docs that cites the ADR plainly, and quotes the convention twice.
      'agents/x.md': 'Cited `ADR NNNN`; this one is ADR NNNN.\n```\nADR NNNN\n```\n',
      // The ADR tooling's own test holds the placeholder as data.
      'scripts/test/adr-y.test.mjs': "const text = 'See ADR NNNN';\n",
      // The feature supersedes 0166: the bare word in a changed ADR's front matter follows too.
      'docs/adr/0166-old.md': adr('the old', '[NNNN]'),
    };
    for (const file of extra) feat[`docs/adr/${file}`] = adr(file);
    // `base` is main before the merge, so its tip is `since` with no git to read it.
    const { origin, sha } = seed(dir, [
      {
        branch: 'base',
        message: 'base',
        files: {
          'docs/adr/0166-old.md': adr('the old'),
          'docs/adr/0167-base.md': adr('the base', '[NNNN]'),
          'docs/ADR-FORMAT.md': 'Name a new ADR NNNN-<slug>.md and cite it ADR NNNN.\n',
        },
      },
      { branch: 'feat', from: 'base', files: feat, message: 'feat' },
      { branch: 'main', from: 'base', merge: ['feat'], files: {}, message: 'Merge feat into pilot' },
    ]);
    const repo = path.join(dir, 'repo');
    git(dir, 'clone', '-q', origin, repo);
    return { repo, since: sha.base, merge: sha.main };
  });
}

/** Each of `files` as the amended merge commits it, whatever the checkout's line endings, from one git. */
function readAll(repo, files) {
  const out = execFileSync('git', ['cat-file', '--batch'], { cwd: repo, input: files.map((file) => `HEAD:${file}\n`).join('') });
  let at = 0;
  return Object.fromEntries(files.map((file) => {
    const end = out.indexOf(10, at);
    const header = out.subarray(at, end).toString('utf8');
    const size = /^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1];
    if (size === undefined) throw new Error(`HEAD:${file}: ${header}`);
    at = end + 2 + Number(size);
    return [file, `${out.subarray(end + 1, at - 1).toString('utf8').trim()}\n`];
  }));
}

/** `file` as the amended merge commits it. */
const read = (repo, file) => readAll(repo, [file])[file];

test('citations follow the rename', (t) => {
  const { repo, since, merge } = merged(t);

  assert.deepEqual(allocateAdr(repo, { since }), { from: 'NNNN-x', to: '0168' });

  assert.ok(fs.existsSync(path.join(repo, 'docs/adr/0168-x.md')));
  assert.ok(!fs.existsSync(path.join(repo, 'docs/adr/NNNN-x.md')));
  const text = readAll(repo, ['docs/design/x/brief.md', 'notes.md', 'agents/x.md', 'scripts/test/adr-y.test.mjs', 'skills/domain-modeling/ADR-FORMAT.md', 'docs/adr/0166-old.md', 'docs/ADR-FORMAT.md', 'docs/adr/0167-base.md']);
  assert.equal(text['docs/design/x/brief.md'], 'See ADR 0168, in docs/adr/0168-x.md.\n');
  assert.equal(text['notes.md'], 'See ADR 0168, in docs/adr/0168-x.md.\n', 'a changed file outside docs follows too');
  assert.equal(text['agents/x.md'], 'Cited `ADR NNNN`; this one is ADR 0168.\n```\nADR NNNN\n```\n', 'a plain citation follows, a quoted convention does not');
  assert.equal(text['scripts/test/adr-y.test.mjs'], "const text = 'See ADR NNNN';\n", 'the ADR tooling: untouched');
  assert.equal(text['skills/domain-modeling/ADR-FORMAT.md'], 'Name a new ADR `NNNN-<slug>.md` and cite it `ADR NNNN`.\n', 'a changed file quoting the convention: untouched');
  assert.match(text['docs/adr/0166-old.md'], /superseded_by: \[0168\]/);
  assert.equal(text['docs/ADR-FORMAT.md'], 'Name a new ADR NNNN-<slug>.md and cite it ADR NNNN.\n', 'unchanged by the feature: untouched');
  assert.match(text['docs/adr/0167-base.md'], /superseded_by: \[NNNN\]/, 'unchanged by the feature: untouched');
  // The merge was amended, not added to: same parents, clean tree.
  const [head1, merge1, head2, merge2] = git(repo, 'rev-parse', 'HEAD^1', `${merge}^1`, 'HEAD^2', `${merge}^2`).split('\n');
  assert.equal(head1, merge1);
  assert.equal(head2, merge2);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a `$&` in the placeholder slug is copied literally', (t) => {
  const { repo, since } = merged(t);
  git(repo, 'mv', 'docs/adr/NNNN-x.md', 'docs/adr/NNNN-a$&b.md');
  write(repo, 'docs/design/x/brief.md', 'See docs/adr/NNNN-a$&b.md.\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '--amend', '--no-edit');

  assert.deepEqual(allocateAdr(repo, { since }), { from: 'NNNN-a$&b', to: '0168' });

  assert.equal(read(repo, 'docs/design/x/brief.md'), 'See docs/adr/0168-a$&b.md.\n');
});

test('two placeholders refuse the landing', (t) => {
  const { repo, since, merge: head } = merged(t, ['NNNN-y.md']);

  assert.throws(
    () => allocateAdr(repo, { since }),
    (err) => err.exitCode === 1 && err.message === 'two placeholder ADRs: NNNN-x.md, NNNN-y.md; one per feature',
  );
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a failed amend leaves the merge as it was', (t) => {
  const { repo, since, merge: head } = merged(t);
  // A pre-commit hook that refuses: the rename and rewrites are made, the amend fails.
  write(repo, '.hooks/pre-commit', '#!/bin/sh\nexit 1\n');
  fs.chmodSync(path.join(repo, '.hooks/pre-commit'), 0o755);
  git(repo, 'config', 'core.hooksPath', '.hooks');
  fs.writeFileSync(path.join(repo, '.git/info/exclude'), '.hooks/\n');

  assert.throws(() => allocateAdr(repo, { since }));

  assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(repo, 'status', '--porcelain'), '', 'a kept worktree is left clean for the next landing');
  assert.ok(fs.existsSync(path.join(repo, 'docs/adr/NNNN-x.md')));
});

test('a merge with no placeholder allocates nothing', (t) => {
  const { repo, since } = merged(t);
  git(repo, 'mv', 'docs/adr/NNNN-x.md', 'docs/adr/0168-x.md');
  git(repo, 'commit', '-q', '--amend', '--no-edit');
  const head = git(repo, 'rev-parse', 'HEAD');

  assert.equal(allocateAdr(repo, { since }), null);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
});
