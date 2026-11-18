// QA's comment on the feature PR (deck-writes-github S3, spec 3; L3, A2): `syncFeaturePr` upserts the one
// comment of this account that starts with `QA_MARKER` from `record.qaComment`, its id read off GitHub
// every time and never stored. A fake `gh` over the same git fixture as feature-pr.test.mjs.

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { githubHost } from '../../deck/host-github.mjs';
import { QA_MARKER, featureBody, syncFeaturePr } from '../feature-pr.mjs';
import { git as gitAt } from '../pilot-branch.mjs';

const SLUG = 'demo-feature';
const SPEC = ['## 2. Spec', '', '1. A user can do the thing.', ''].join('\n');
const ARTEFACT = ['# Demo', '', SPEC, '## 3. Findings', ''].join('\n');
const CHECKS = '| spec line | result | evidence |\n| --- | --- | --- |\n| 1 | pass | a test |';

const record = (over = {}) => ({ slug: SLUG, feature: 'demo', ticket: 'itm_0123abcd', base: 'pilot', slices: [], qaComment: CHECKS, ...over });

/** origin (bare) holding feat/<slug> with the artefact, and a clone of it. */
function buildRepos(root) {
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  gitAt(root, 'init', '-q', '--bare', '-b', 'main', origin);
  gitAt(root, 'clone', '-q', origin, clone);
  gitAt(clone, 'checkout', '-q', '-b', `feat/${SLUG}`);
  const dir = path.join(clone, 'docs', 'design', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'architecture.md'), ARTEFACT);
  gitAt(clone, 'add', '.');
  gitAt(clone, 'commit', '-q', '-m', 'artefact');
  gitAt(clone, 'push', '-q', 'origin', `feat/${SLUG}`);
  return clone;
}

const repo = (t) => gitFixture(t, 'feature-pr-comment', buildRepos);
const gitIn = (cwd) => (args) => gitAt(cwd, ...args);

/** The feature PR #7, its body already up to date, and `comments` as `gh pr view --json comments` answers them. */
function fakeGh(comments = []) {
  const calls = [];
  const files = [];
  const gh = (args) => {
    calls.push(args);
    const at = args.indexOf('--body-file');
    if (at !== -1) files.push(fs.readFileSync(args[at + 1], 'utf8'));
    if (args[0] === 'pr' && args[1] === 'list') {
      return JSON.stringify([{ number: 7, state: 'OPEN', body: featureBody(SPEC, record(), ''), baseRefName: 'pilot', isCrossRepository: false }]);
    }
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ comments });
    return '';
  };
  const writes = () => calls.filter((call) => (call[0] === 'pr' && ['create', 'edit', 'comment'].includes(call[1])) || call[0] === 'api');
  return { host: githubHost(gh), calls, files, writes };
}

const marked = (text, over = {}) => ({
  body: `${QA_MARKER}\n${text}\n`,
  viewerDidAuthor: true,
  url: 'https://github.com/o/r/pull/7#issuecomment-555',
  ...over,
});

test('first text posts one comment', (t) => {
  const cwd = repo(t);
  // A stranger's comment carrying the marker is not this account's: never edited, never counted.
  const fake = fakeGh([marked('planted', { viewerDidAuthor: false, url: 'https://github.com/o/r/pull/7#issuecomment-9' })]);
  const out = syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  const writes = fake.writes();
  assert.equal(writes.length, 1, 'one write');
  assert.deepEqual(writes[0].slice(0, 4), ['pr', 'comment', '7', '--body-file']);
  assert.ok(fake.files[0].startsWith(`${QA_MARKER}\n`), 'the body starts with the marker');
  assert.ok(fake.files[0].includes(CHECKS));
  assert.match(out.line, /QA comment posted/);
});

test('changed text edits it once', (t) => {
  const cwd = repo(t);
  const fake = fakeGh([{ body: 'a reviewer said hi', viewerDidAuthor: true, url: 'https://github.com/o/r/pull/7#issuecomment-1' }, marked('the old checks')]);
  syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() });
  const writes = fake.writes();
  assert.equal(writes.length, 1, 'one write');
  const [api] = writes;
  assert.equal(api[api.indexOf('--method') + 1], 'PATCH');
  assert.ok(api.includes('repos/o/r/issues/comments/555'), 'the marked comment, by the id GitHub gave it');
  assert.equal(api[api.indexOf('-f') + 1], `body=${QA_MARKER}\n${CHECKS}\n`);
  // The same text: nothing written.
  const same = fakeGh([marked(CHECKS)]);
  const out = syncFeaturePr({ host: same.host, git: gitIn(cwd), record: record() });
  assert.equal(same.writes().length, 0, '0 writes for the same text');
  assert.doesNotMatch(out.line, /QA comment/);

  // No comment on the record: the comments are not even read.
  const none = fakeGh([marked('the old checks')]);
  syncFeaturePr({ host: none.host, git: gitIn(cwd), record: record({ qaComment: undefined }) });
  assert.equal(none.calls.filter((call) => call[1] === 'view').length, 0);
  assert.equal(none.writes().length, 0);
});

test('one QA comment', (t) => {
  const cwd = repo(t);
  // One fake GitHub across two runs: the comment `pr comment` posts is what `pr view` answers next.
  const comments = [];
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[1] === 'list') return JSON.stringify([{ number: 7, state: 'OPEN', body: featureBody(SPEC, record(), ''), baseRefName: 'pilot', isCrossRepository: false }]);
    if (args[1] === 'view') return JSON.stringify({ comments });
    if (args[1] === 'comment') {
      // GitHub hands a comment back with CRLF line ends.
      const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8').replace(/\n/g, '\r\n');
      comments.push({ body, viewerDidAuthor: true, url: 'https://github.com/o/r/pull/7#issuecomment-555' });
    }
    return '';
  };
  const host = githubHost(run);
  syncFeaturePr({ host, git: gitIn(cwd), record: record() });
  syncFeaturePr({ host, git: gitIn(cwd), record: record() });
  syncFeaturePr({ host, git: gitIn(cwd), record: record({ qaComment: `${CHECKS}\n| 2 | pass | a look |` }) });
  const writes = calls.filter((call) => call[1] === 'comment' || call[0] === 'api');
  assert.deepEqual(writes.map((call) => call.slice(0, 2)), [['pr', 'comment'], ['api', 'repos/o/r/issues/comments/555']]);
});

test('a marked comment whose url names no comment id is a failure naming the step', (t) => {
  const cwd = repo(t);
  const fake = fakeGh([marked('old', { url: 'https://github.com/o/r/pull/7' })]);
  assert.throws(() => syncFeaturePr({ host: fake.host, git: gitIn(cwd), record: record() }), /gh pr view: /);
  assert.equal(fake.writes().length, 0);
});
