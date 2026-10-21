/**
 * S8 of one-integration-line: `allocateAdr` renames the feature's placeholder ADR to the next
 * free number inside the landing merge (spec 5; L4, A4). Its citations follow in the files the
 * feature changed, and nowhere else; two placeholders refuse the landing. Every repository is a
 * scratch one built through `gitFixture`.
 */

import { gitFixture } from './lib/git-fixture.mjs';

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
 * plus `extra` more placeholder files. Answers the repository and `since`, main before the merge.
 */
function merged(t, extra = []) {
  return gitFixture(t, `adr-allocate:${extra}`, (dir) => {
    const repo = path.join(dir, 'repo');
    git(dir, 'init', '-q', '-b', 'main', repo);
    write(repo, 'docs/adr/0166-old.md', adr('the old'));
    write(repo, 'docs/adr/0167-base.md', adr('the base', '[NNNN]'));
    write(repo, 'docs/ADR-FORMAT.md', 'Name a new ADR NNNN-<slug>.md and cite it ADR NNNN.\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    const since = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', '-b', 'feat');
    write(repo, 'docs/adr/NNNN-x.md', adr('x'));
    write(repo, 'notes.md', 'See ADR NNNN, in docs/adr/NNNN-x.md.\n');
    write(repo, 'docs/design/x/brief.md', 'See ADR NNNN, in docs/adr/NNNN-x.md.\n');
    // A changed file that quotes the convention in a code span, as ADR-FORMAT.md and pilot-architect.md do.
    write(repo, 'skills/domain-modeling/ADR-FORMAT.md', 'Name a new ADR `NNNN-<slug>.md` and cite it `ADR NNNN`.\n');
    // A changed file outside docs that cites the ADR plainly, and quotes the convention twice.
    write(repo, 'agents/x.md', 'Cited `ADR NNNN`; this one is ADR NNNN.\n```\nADR NNNN\n```\n');
    // The ADR tooling's own test holds the placeholder as data.
    write(repo, 'scripts/test/adr-y.test.mjs', "const text = 'See ADR NNNN';\n");
    // The feature supersedes 0166: the bare word in a changed ADR's front matter follows too.
    write(repo, 'docs/adr/0166-old.md', adr('the old', '[NNNN]'));
    for (const file of extra) write(repo, `docs/adr/${file}`, adr(file));
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'feat');
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'merge', '-q', '--no-ff', '-m', 'Merge feat into pilot', 'feat');
    return { repo, since };
  });
}

/** `file` as the amended merge commits it, whatever the checkout's line endings. */
const read = (repo, file) => `${git(repo, 'show', `HEAD:${file}`)}\n`;

test('citations follow the rename', (t) => {
  const { repo, since } = merged(t);
  const merge = git(repo, 'rev-parse', 'HEAD');

  assert.deepEqual(allocateAdr(repo, { since }), { from: 'NNNN-x', to: '0168' });

  assert.ok(fs.existsSync(path.join(repo, 'docs/adr/0168-x.md')));
  assert.ok(!fs.existsSync(path.join(repo, 'docs/adr/NNNN-x.md')));
  assert.equal(read(repo, 'docs/design/x/brief.md'), 'See ADR 0168, in docs/adr/0168-x.md.\n');
  assert.equal(read(repo, 'notes.md'), 'See ADR 0168, in docs/adr/0168-x.md.\n', 'a changed file outside docs follows too');
  assert.equal(read(repo, 'agents/x.md'), 'Cited `ADR NNNN`; this one is ADR 0168.\n```\nADR NNNN\n```\n', 'a plain citation follows, a quoted convention does not');
  assert.equal(read(repo, 'scripts/test/adr-y.test.mjs'), "const text = 'See ADR NNNN';\n", 'the ADR tooling: untouched');
  assert.equal(read(repo, 'skills/domain-modeling/ADR-FORMAT.md'), 'Name a new ADR `NNNN-<slug>.md` and cite it `ADR NNNN`.\n', 'a changed file quoting the convention: untouched');
  assert.match(read(repo, 'docs/adr/0166-old.md'), /superseded_by: \[0168\]/);
  assert.equal(read(repo, 'docs/ADR-FORMAT.md'), 'Name a new ADR NNNN-<slug>.md and cite it ADR NNNN.\n', 'unchanged by the feature: untouched');
  assert.match(read(repo, 'docs/adr/0167-base.md'), /superseded_by: \[NNNN\]/, 'unchanged by the feature: untouched');
  // The merge was amended, not added to: same parents, clean tree.
  assert.equal(git(repo, 'rev-parse', 'HEAD^1'), git(repo, 'rev-parse', `${merge}^1`));
  assert.equal(git(repo, 'rev-parse', 'HEAD^2'), git(repo, 'rev-parse', `${merge}^2`));
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
  const { repo, since } = merged(t, ['NNNN-y.md']);
  const head = git(repo, 'rev-parse', 'HEAD');

  assert.throws(
    () => allocateAdr(repo, { since }),
    (err) => err.exitCode === 1 && err.message === 'two placeholder ADRs: NNNN-x.md, NNNN-y.md; one per feature',
  );
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a failed amend leaves the merge as it was', (t) => {
  const { repo, since } = merged(t);
  const head = git(repo, 'rev-parse', 'HEAD');
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
