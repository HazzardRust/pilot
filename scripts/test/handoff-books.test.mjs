/**
 * S2 of handoff-books: the rows written before a hand-off survive it (spec 3).
 *
 * The record the deck mirrored to `docs/design/<slug>/run.json` is committed by
 * `commitRecords`, the call `pilot handoff` makes, so after the `/clear` the file
 * at HEAD still holds every row; the next session's `deck_status` appends to them
 * through `nextRecord` rather than starting over. A pin: both seams are unchanged.
 *
 * The repository is a scratch one of this test's own; no deck is started.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { commitRecords } = await import('../integrate.mjs');
const { nextRecord, recordFields } = await import('../../deck/runs.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const row = (n) => ({ agent: 'pilot-implementer', what: `re-read the brief ${n}`, evidence: `${n} reads` });

function buildRepo(root) {
  git(root, 'init', '-q', '-b', 'feat/books');
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git(root, 'add', 'base.txt');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

test('rows written before a hand-off survive it', (t) => {
  const repo = gitFixture(t, 'handoff-books:repo', buildRepo);
  const before = nextRecord({}, recordFields({ slug: 'books', friction: [row(1), row(2), row(3)] }));
  const file = path.join(repo, 'docs', 'design', 'books', 'run.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(before, null, 2) + '\n');

  assert.equal(commitRecords(repo, ['Co-Authored-By: test <t@example.com>']), true);
  assert.equal(git(repo, 'log', '-1', '--format=%s'), 'chore(books): run record');

  const atHead = JSON.parse(git(repo, 'show', 'HEAD:docs/design/books/run.json'));
  assert.equal(atHead.friction.length, 3, 'every row written before the hand-off is at HEAD');

  const after = nextRecord(atHead, recordFields({ slug: 'books', friction: [row(4)] }));
  assert.deepEqual(after.friction.map((r) => r.what), [1, 2, 3, 4].map((n) => `re-read the brief ${n}`));
});
